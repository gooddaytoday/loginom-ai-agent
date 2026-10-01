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
const configuredField=object({field_id:{type:'string',pattern:'^(?:0|[1-9]\\d*)$'},index:{type:'integer',minimum:0,maximum:63},
  name:{type:'string',minLength:1,maxLength:239},label:{type:'string',maxLength:239},
  type:{enum:['boolean','datetime','real','integer','string','variant']},required:{type:'boolean'},
  group_index:{type:'integer',minimum:0,maximum:63},excluded:{const:false},inherited:{type:'boolean'},
  exclusion_source:{type:'null'},data_kind:{enum:['Неопределенное','Непрерывный','Дискретный']},source:{type:'null'}});
const materializedPort=direction=>object({direction:{const:direction},port:{const:0},port_guid:{type:'string',minLength:1},
  autosync:{type:'boolean'},source_fields:{type:'array',minItems:1,maxItems:64,items:field},
  target_fields:{type:'array',minItems:1,maxItems:64,items:field},native_reciprocity_verified:{const:true}});
const configuredPort=object({direction:{const:'output'},port:{const:0},port_guid:{type:'string',minLength:1},
  autosync:{type:'boolean'},source_fields:{type:'array',maxItems:0},
  target_fields:{type:'array',minItems:1,maxItems:64,items:configuredField},
  schema_state:{const:'source_pending'},configured_inventory_verified:{const:true},native_reciprocity_verified:{const:false}});
const portPair=output=>({type:'array',minItems:2,maxItems:2,items:[materializedPort('input'),output],additionalItems:false});
export const javascriptContextInitialSchema={...structuredClone(javascriptSourceInitialSchema),
  properties:{...structuredClone(javascriptSourceInitialSchema.properties),kind:{const:'context'},allow_configured_output:{type:'boolean'}}};
export const javascriptContextReceiptSchema=object({kind:{const:'context'},owner:object({
  document_id:text,workflow_id:text,node_id:text,operation_id:text,ui_epoch:{type:'integer',minimum:0}}),
  schema_mode:{enum:['code','declared']},settings_sha256:digest,semantic_sha256:digest,
  source:object({source_sha256:digest,source_utf8_bytes:{type:'integer',minimum:0,maximum:32768},
    source_lf_lines:{type:'integer',minimum:1,maximum:1024},delivery:{enum:['complete','separate_read_required']},
    text,reason:text},['source_sha256','source_utf8_bytes','source_lf_lines','delivery']),
  ports:{type:'array',minItems:2,maxItems:2},
  content_is_data:{const:true},observation_scope:{enum:['current_owned_source_and_materialized_ports','current_owned_source_and_configured_ports']},
  cleanup_complete:{const:true},settings_applied:{const:false},package_saved:{const:false},
  explicit_execute_requested:{const:false}});
javascriptContextReceiptSchema.properties.source.oneOf=[
  {properties:{delivery:{const:'complete'}},required:['text'],not:{required:['reason']}},
  {properties:{delivery:{const:'separate_read_required'}},required:['reason'],not:{required:['text']}}
];

javascriptContextReceiptSchema.oneOf=[
  {properties:{observation_scope:{const:'current_owned_source_and_materialized_ports'},ports:portPair(materializedPort('output'))}},
  {properties:{observation_scope:{const:'current_owned_source_and_configured_ports'},ports:portPair(configuredPort)}}
];

export function validateJavascriptContextReadRequest(request){
  need(request?.kind==='context','initial context request required');
  need(!Object.hasOwn(request,'allow_configured_output')||typeof request.allow_configured_output==='boolean','configured output opt-in must be boolean');
  const sourceRequest={...request,kind:'source'};delete sourceRequest.allow_configured_output;
  need(validateJavascriptSourceReadRequest(sourceRequest)==='initial','context has no continuation');
  return 'initial';
}

// Preserve native field identities and every scalar. Ext record IDs alone are
// ephemeral across openings; reciprocity must have been proved by the reader.
export function javascriptContextPort(mapping,direction,node,allowConfiguredOutput=false){
  const ctx=mapping?.node_context,port=ctx?.[direction+'_port'];
  need(['input','output'].includes(direction)&&mapping?.inventory_complete===true
    &&mapping.state_source==='cached_mapping_stores'&&mapping.settings_applied===false&&mapping.package_saved===false
    &&ctx?.verified===true&&ctx.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>ctx[k]===node[k])
    &&port?.direction===direction&&port.port===0&&typeof port.port_guid==='string'&&port.port_guid
    &&typeof mapping.autosync==='boolean'&&Array.isArray(mapping.source_fields)&&mapping.source_fields.length<=64
    &&Array.isArray(mapping.target_fields)&&mapping.target_fields.length>0&&mapping.target_fields.length<=64,
    'complete materialized port owner/schema unavailable');
  const pending=allowConfiguredOutput===true&&direction==='output'&&mapping.verified===false
    &&mapping.source_identity_verified===false&&mapping.reason==='mapping_source_pending'
    &&mapping.configured_inventory_verified===true&&mapping.mapping_wizard==='DataSetOutputSocketWizard';
  need(pending||mapping.verified===true&&mapping.source_identity_verified===true&&mapping.source_fields.length>0,
    'complete materialized port owner/schema unavailable');
  if(pending){
    const witness=mapping.source_pending,base=ctx.tid+';DataSetOutputSocketWizard;';
    need(typeof ctx.tid==='string'&&ctx.tid.endsWith(';WizrdMCF')
      &&typeof port.opening_operation_id==='string'&&port.opening_operation_id.length>0
      &&mapping.source_fields.length===0&&witness?.kind==='hidden_source_column'
      &&witness.header_tid===base+'grdTargetColumns;headercontainer'&&witness.column_tid===base+'colSourceDisplayName'
      &&witness.data_index==='SourceDisplayName'&&witness.item_id==='colSourceDisplayName'
      &&witness.hidden===true&&witness.visible===false&&witness.native_header_verified===true
      &&witness.source_count===0&&witness.target_count===mapping.target_fields.length,
      'configured output native witness unavailable');
    const keys=['record_id',...Object.keys(configuredField.properties)].sort(),fields=mapping.target_fields;
    need(fields.every((f,i)=>same(Object.keys(f).sort(),keys)&&typeof f.record_id==='string'&&f.record_id.length>0
      &&typeof f.field_id==='string'&&/^(?:0|[1-9]\d*)$/.test(f.field_id)&&f.index===i&&f.group_index===i
      &&typeof f.name==='string'&&f.name.length>0&&f.name.length<240&&typeof f.label==='string'&&f.label.length<240
      &&configuredField.properties.type.enum.includes(f.type)&&typeof f.required==='boolean'
      &&f.excluded===false&&typeof f.inherited==='boolean'&&f.exclusion_source===null&&f.source===null
      &&configuredField.properties.data_kind.enum.includes(f.data_kind))
      &&['record_id','field_id','name'].every(k=>new Set(fields.map(f=>f[k])).size===fields.length),
      'configured output scalar inventory unavailable');
  }
  const normalize=fields=>fields.map(({record_id,source,...value})=>{
    if(source===undefined)return value;
    if(source===null)return {...value,source:null};
    const field={...source};delete field.record_id;
    return {...value,source:field};
  });
  return {direction,port:0,port_guid:port.port_guid,autosync:mapping.autosync,
    source_fields:normalize(mapping.source_fields),target_fields:normalize(mapping.target_fields),...(pending?{schema_state:'source_pending',configured_inventory_verified:true,native_reciprocity_verified:false}:{native_reciprocity_verified:true})};
}

export function javascriptContextReply({owner,source,settings,ports,redactor,wireBytes=46000,lines=2000}){
  need(typeof settings?.generation==='boolean'&&Array.isArray(ports)&&ports.length===2
    &&ports[0].direction==='input'&&ports[1].direction==='output','complete context settings/ports unavailable');
  need(Number.isSafeInteger(wireBytes)&&wireBytes>0&&wireBytes<=46000&&Number.isSafeInteger(lines)&&lines>0&&lines<=2000,
    'response limits unavailable');
  need(typeof redactor?.redact==='function','redactor unavailable');
  const identity=javascriptSourceIdentity(source),semantic={schema_mode:settings.generation?'code':'declared',
    settings_sha256:javascriptSourceSettingsDigest(settings),source:identity,ports};
  const pending=ports[1].schema_state==='source_pending';
  need(ports[0].native_reciprocity_verified===true&&(pending?ports[1].native_reciprocity_verified===false
    &&ports[1].configured_inventory_verified===true:ports[1].native_reciprocity_verified===true),'context port state differs');
  const reply={kind:'context',owner:structuredClone(owner),schema_mode:semantic.schema_mode,settings_sha256:semantic.settings_sha256,
    semantic_sha256:hash(semantic),source:{...identity,delivery:'complete',text:source},ports:structuredClone(ports),
    content_is_data:true,observation_scope:pending?'current_owned_source_and_configured_ports':'current_owned_source_and_materialized_ports',cleanup_complete:true,
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
      mappingOpen=false;ports.push(javascriptContextPort(state.node_mapping,direction,node,initial.allow_configured_output===true));
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
          source_sha256:reply.source.source_sha256,source_delivery:reply.source.delivery,ports_complete:reply.ports[1].native_reciprocity_verified,
          ...(reply.ports[1].schema_state==='source_pending'?{configured_inventory_verified:true,schema_state:'source_pending'}:{}),
          observation_scope:reply.observation_scope,content_is_data:true});
        timely();need(!mappingOpen&&adapter.uncertain!==true&&adapter.active!==true,'cleanup unconfirmed');
        need(same(redactor.redact(reply),reply),'redaction changed after ACK');return reply;
      }catch(error){uncertain=true;throw error;}
    }
  });
}
