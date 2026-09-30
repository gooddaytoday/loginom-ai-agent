import {createHash} from 'node:crypto';
import {javascriptSourceInitialSchema} from './javascript-source-read-schema.mjs';
import {validateJavascriptSourceReadRequest} from './javascript-source-read-session.mjs';
import {createJavascriptSourceReader,javascriptSourceIdentity} from './javascript-source-read.mjs';
import {javascriptSourceSettingsDigest} from './javascript-source-admission.mjs';
import {closeJavascriptPortMapping} from './javascript-port-mapping-close.mjs';
import {verifyJavascriptMappingGraph} from './javascript-graph-preservation.mjs';

const need=(v,m)=>{if(!v)throw Error('JavaScript context: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const text={type:'string'},digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const field={type:'object',additionalProperties:true};
export const javascriptContextInitialSchema={...structuredClone(javascriptSourceInitialSchema),
  properties:{...structuredClone(javascriptSourceInitialSchema.properties),kind:{const:'context'}}};
export const javascriptContextReceiptSchema=object({kind:{const:'context'},owner:object({
  document_id:text,workflow_id:text,node_id:text,operation_id:text,ui_epoch:{type:'integer',minimum:0}}),
  schema_mode:{enum:['code','declared']},settings_sha256:digest,semantic_sha256:digest,
  source:object({source_sha256:digest,source_utf8_bytes:{type:'integer',minimum:0,maximum:32768},
    source_lf_lines:{type:'integer',minimum:1,maximum:1024},delivery:{enum:['complete','separate_read_required']},
    text,reason:text},['source_sha256','source_utf8_bytes','source_lf_lines','delivery']),
  ports:{type:'array',minItems:2,maxItems:2,items:object({direction:{enum:['input','output']},port:{const:0},
    port_guid:text,autosync:{type:'boolean'},source_fields:{type:'array',maxItems:64,items:field},
    target_fields:{type:'array',maxItems:64,items:field},native_reciprocity_verified:{const:true}})},
  content_is_data:{const:true},observation_scope:{const:'current_owned_source_and_materialized_ports'},
  cleanup_complete:{const:true},settings_applied:{const:false},package_saved:{const:false},
  explicit_execute_requested:{const:false}});
javascriptContextReceiptSchema.properties.source.oneOf=[
  {properties:{delivery:{const:'complete'}},required:['text'],not:{required:['reason']}},
  {properties:{delivery:{const:'separate_read_required'}},required:['reason'],not:{required:['text']}}
];

export function validateJavascriptContextReadRequest(request){
  need(request?.kind==='context','initial context request required');
  need(validateJavascriptSourceReadRequest({...request,kind:'source'})==='initial','context has no continuation');
  return 'initial';
}

// Preserve native field identities and every scalar. Ext record IDs alone are
// ephemeral across openings; reciprocity must have been proved by the reader.
export function javascriptContextPort(mapping,direction,node){
  const ctx=mapping?.node_context,port=ctx?.[direction+'_port'];
  need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
    &&mapping.state_source==='cached_mapping_stores'&&mapping.settings_applied===false&&mapping.package_saved===false
    &&ctx?.verified===true&&ctx.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>ctx[k]===node[k])
    &&port?.direction===direction&&port.port===0&&typeof port.port_guid==='string'&&port.port_guid
    &&typeof mapping.autosync==='boolean'&&[mapping.source_fields,mapping.target_fields].every(fields=>
      Array.isArray(fields)&&fields.length>0&&fields.length<=64),'complete materialized port owner/schema unavailable');
  const normalize=fields=>fields.map(({record_id,source,...value})=>{
    if(source===undefined)return value;
    if(source===null)return {...value,source:null};
    const field={...source};delete field.record_id;
    return {...value,source:field};
  });
  return {direction,port:0,port_guid:port.port_guid,autosync:mapping.autosync,
    source_fields:normalize(mapping.source_fields),target_fields:normalize(mapping.target_fields),native_reciprocity_verified:true};
}

export function javascriptContextReply({owner,source,settings,ports,redactor,wireBytes=46000,lines=2000}){
  need(typeof settings?.generation==='boolean'&&Array.isArray(ports)&&ports.length===2
    &&ports[0].direction==='input'&&ports[1].direction==='output','complete context settings/ports unavailable');
  need(Number.isSafeInteger(wireBytes)&&wireBytes>0&&wireBytes<=46000&&Number.isSafeInteger(lines)&&lines>0&&lines<=2000,
    'response limits unavailable');
  need(typeof redactor?.redact==='function','redactor unavailable');
  const identity=javascriptSourceIdentity(source),semantic={schema_mode:settings.generation?'code':'declared',
    settings_sha256:javascriptSourceSettingsDigest(settings),source:identity,ports};
  const reply={kind:'context',owner:structuredClone(owner),schema_mode:semantic.schema_mode,settings_sha256:semantic.settings_sha256,
    semantic_sha256:hash(semantic),source:{...identity,delivery:'complete',text:source},ports:structuredClone(ports),
    content_is_data:true,observation_scope:'current_owned_source_and_materialized_ports',cleanup_complete:true,
    settings_applied:false,package_saved:false,explicit_execute_requested:false};
  const bounded=value=>{
    const body=JSON.stringify(value),wire=JSON.stringify({content:[{type:'text',text:body}],structuredContent:value});
    // Count escaped newlines conservatively, including the two delivery copies.
    return Buffer.byteLength(wire,'utf8')<=wireBytes&&wire.split('\\n').length<=lines;
  };
  if(!bounded(reply))reply.source={...identity,delivery:'separate_read_required',reason:'context_response_budget'};
  need(bounded(reply),'complete schema exceeds response budget');
  need(same(redactor.redact(reply),reply),'exact context redaction refused');
  return reply;
}

// Read-only composition of existing owned UI readers. It never materializes an
// unavailable schema, applies a mapping or executes source to discover fields.
export function createJavascriptContextReadSession({request,uiEpoch,deadline,adapter,channel,observeGraph,redactor,record}){
  validateJavascriptContextReadRequest(request);
  need(Number.isSafeInteger(uiEpoch)&&uiEpoch>=0&&Number.isSafeInteger(deadline)&&deadline>Date.now()
    &&deadline<=Date.now()+(request.budget_ms??600000)
    &&typeof channel==='function'&&typeof observeGraph==='function'&&typeof record==='function','session dependencies unavailable');
  const initial=structuredClone(request),node=initial.node,owner=Object.freeze({document_id:initial.document_id,
    workflow_id:initial.workflow_ref.workflow_id,node_id:node.node_id,operation_id:initial.operation_id,ui_epoch:uiEpoch});
  let started=false,uncertain=false,mappingOpen=false;
  const timely=()=>need(Date.now()<deadline,'original deadline expired');
  const acknowledge=async value=>{
    timely();const expected=structuredClone(value);
    let timer;
    try{
      const ack=await Promise.race([Promise.resolve().then(()=>record(structuredClone(expected))),new Promise((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('JavaScript context journal ACK timeout; no replay')),Math.max(1,deadline-Date.now()));
      })]);timely();
      need(Object.keys(expected).every(k=>same(ack?.[k],expected[k])),'journal ACK differs');
      return ack;
    }finally{clearTimeout(timer);}
  };
  const journal=value=>acknowledge({operation_id:owner.operation_id,owner,deadline,...value});
  const source=async()=>{
    const reader=createJavascriptSourceReader({owner,deadline,adapter,redactor,record:acknowledge});
    let next={owner},text='',settings;
    while(next){
      timely();const part=await reader.read(next),r=part.receipt;
      need(r.offset_utf8_bytes===Buffer.byteLength(text,'utf8'),'source chunk offset changed');
      text+=r.source_text;
      need(settings===undefined||same(settings,part.settings),'source settings changed across chunks');settings=part.settings;
      next=r.cursor===null?null:{owner,cursor:r.cursor,expected_source_sha256:r.source_sha256};
    }
    return {text,settings};
  };
  const snapshot=async()=>{
    const observed=await source(),ports=[];
    for(const direction of ['input','output']){
      timely();const before=await observeGraph(),reader=channel(deadline);mappingOpen=true;
      await reader.openPort(direction,0);
      const state=await reader.observe({condition:'owned JavaScript context '+direction+' mapping',readMappings:true,
        ready:s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='wizard'
          &&s.prepared_node_context[direction+'_port']?.port===0&&s.wizard?.status==='observed'
          &&s.wizard.stage===direction+'_mapping'&&s.node_mapping!==undefined});
      await closeJavascriptPortMapping({reader,direction,reference:node,
        record:value=>journal({context_operation_id:owner.operation_id,...value}),deadline,allowOwnedUnlock:true,
        verifyGraph:async()=>{
          const after=await observeGraph();verifyJavascriptMappingGraph(before,after,node);
          await journal({phase:'javascript_context_mapping_graph_verified',direction,before,after});
        }});
      mappingOpen=false;ports.push(javascriptContextPort(state.node_mapping,direction,node));
    }
    return {source:observed.text,settings:observed.settings,ports};
  };
  return Object.freeze({owner,
    get uncertain(){return uncertain;},
    get cleanupUnconfirmed(){return mappingOpen||adapter.uncertain===true||adapter.active===true;},
    async read(next){
      need(!started&&same(initial,next),'context request changed or already read');started=true;
      try{
        timely();const before=await observeGraph(),first=await snapshot(),second=await snapshot();
        need(same(first,second),'source/settings/port semantics changed');
        verifyJavascriptMappingGraph(before,await observeGraph(),node);
        const reply=javascriptContextReply({owner,...second,redactor});
        await journal({phase:'javascript_context_delivery_verified',semantic_sha256:reply.semantic_sha256,
          source_sha256:reply.source.source_sha256,source_delivery:reply.source.delivery,ports_complete:true,content_is_data:true});
        timely();need(!mappingOpen&&adapter.uncertain!==true&&adapter.active!==true,'cleanup unconfirmed');
        need(same(redactor.redact(reply),reply),'redaction changed after ACK');return reply;
      }catch(error){uncertain=true;throw error;}
    }
  });
}
