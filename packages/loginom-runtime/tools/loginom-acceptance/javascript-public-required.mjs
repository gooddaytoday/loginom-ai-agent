// Operator-only J09: manual output setup uses the existing owned UI procedure.
// Public JavaScript apply remains responsible for source edits and execution.
import {randomUUID} from 'node:crypto';
import {createActionRuntime,withBrowserReceipt} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {verifyJavascriptMappingGraph} from '../../client/lib/javascript-graph-preservation.mjs';
import {javascriptPublicCodePins} from './javascript-public-code-live.mjs';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';
import {verifyJavascriptMismatchTable} from './javascript-mismatch-probe.mjs';
import {readJavascriptPublicExistingSource} from './javascript-public-existing-live.mjs';
import {configureJavascriptManualMapping} from './javascript-execution-runtime.mjs';

const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const javascriptRequiredManualLabel='Сумма вручную';
export function javascriptRequiredManualConfiguration() {
  const schema=javascriptDiscoveryProbe('p1-business-code-base').schema;
  return {mapping:{direction:'output',port:0,autosync:false,
    fields:schema.map(column=>({source:{kind:'configured_field',name:column.name},name:column.name,
      label:column.name==='NetCents'?javascriptRequiredManualLabel:column.label}))},
  configured:schema.map(column=>({...column,used:true}))};
}
export function verifyJavascriptRequiredManualMapping(mapping,node,{manual=true,manualLabel=javascriptRequiredManualLabel}={}) {
  const schema=javascriptDiscoveryProbe('p1-business-code-base').schema;
  need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
    &&mapping.state_source==='cached_mapping_stores'&&mapping.settings_applied===false&&mapping.package_saved===false
    &&mapping.mapping_wizard==='DataSetOutputSocketWizard'&&mapping.node_context?.verified===true
    &&mapping.node_context.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>mapping.node_context[k]===node[k])
    &&mapping.node_context.output_port?.direction==='output'&&mapping.node_context.output_port.port===0
    &&mapping.source_fields?.length===4&&mapping.target_fields?.length===4
    &&mapping.autosync===!manual,'Required native mapping owner/coverage/autosync differs');
  need(new Set(mapping.source_fields.map(f=>f.record_id)).size===4
    &&new Set(mapping.target_fields.map(f=>f.record_id)).size===4,'Required native mapping records differ');
  need(schema.every((c,i)=>{
    const source=mapping.source_fields[i],target=mapping.target_fields[i];
    return source.index===i&&target.index===i&&typeof source.field_id==='string'
      &&source.name===c.name&&source.label===c.label&&source.type===c.type&&source.required===true
      &&target.name===c.name&&target.type===c.type&&target.required===false&&target.excluded===false&&target.inherited===false
      &&target.label===(manual&&c.name==='NetCents'?manualLabel:c.label)
      &&target.source?.record_id===source.record_id&&target.source.field_id===source.field_id;
  }),'Required native mapping fields or reciprocal source changed');
  return {source_required:[true,true,true,true],target_required:[false,false,false,false],
    autosync:mapping.autosync,manual_label:manual?manualLabel:null,complete:true};
}
export function javascriptRequiredOutputOracle(schemaMode,table,manualLabel=javascriptRequiredManualLabel) {
  const probe=javascriptDiscoveryProbe('p1-business-'+schemaMode+'-base');
  verifyJavascriptMismatchTable(table);
  const expected=probe.schema.map(c=>({...c,label:c.name==='NetCents'?manualLabel:c.label}));
  need(table.fresh===true&&same(table.schema.map(({name,label,type})=>({name,label,type})),expected)
    &&table.row_count===6&&table.sample.length===6&&table.sample.every((row,i)=>row.length===4
      &&row.every((cell,j)=>cell.is_null===false&&Object.is(cell.value,probe.expected[i][j]))),
  'Required manual full output schema/cells differ');
  return {gate_passed:true,schema_verified:true,values_verified:true,full_rows:6,full_columns:4,total_net_cents:1950};
}

export async function runJavascriptPublicRequiredLive({page,prepared,node,targetOrigin,redactor,record,report,
  save,deadline,onPending,schemaMode,graph,readGraph,contextCase=false}) {
  need(['code','declared'].includes(schemaMode)&&Date.now()+660000<deadline,'Required fixed mode/original budget unavailable');
  const probe=javascriptDiscoveryProbe('p1-business-'+schemaMode+'-base'),base=createCandidateNodeSupport({targetOrigin,targetBuild:'7.4.2'}),
    support=createJavascriptCodeNodeSupport({targetOrigin,targetBuild:'7.4.2',redactor}),mappings=new Map();
  let runtimeRecords=0;
  const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),allowCandidate:true,targetOrigin,targetBuild:'7.4.2',redactor,
    onRecord:async event=>{runtimeRecords++;const ack=await record(event);
      if(event.phase==='node_phase_completed'&&event.receipt?.phase==='output_mapping')mappings.set(event.operation_id,structuredClone(event.receipt.value.native_mapping));
      return ack;},execute:source=>Function('return ('+source+')')()(page),
    nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...support.nodeApplyHandlers]),
    nodeApplyDriverFactory:options=>options.operation.parameters.target.type==='programming.javascript'
      ?support.nodeApplyDriverFactory(options):base.nodeApplyDriverFactory(options)});
  report.public_required={status:'RUNNING',schema_mode:schemaMode,node};report.explicit_execution_limit=4;
  report.stage='public-required-source-before';onPending(true);await save();
  const readSource=()=>readJavascriptPublicExistingSource({runtime,prepared,node,deadline,record}),before=await readSource();
  need(before.source_text===probe.source&&before.source_sha256===probe.source_sha256&&!runtime.hasUnsettledWork(),
    'Required initial saved source differs');
  const request=parameters=>({operation_id:'js-required-'+randomUUID(),contract_revision:'1.0.0',document_id:prepared.document_id,
    workflow_ref:prepared.workflow_ref,target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',parameters,
    mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
    budgets:{configure_ms:600000,execute_ms:60000,total_ms:660000}});
  const apply=async req=>{
    let job=await dispatchNodeApi(runtime,'dock_node_apply',req);
    while(job.state==='running'){
      need(Date.now()<deadline-60000,'Required original run deadline expired');
      job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:req.operation_id,timeout_ms:1000});
    }
    const result=job.outcome?.output,table=result?.output?.ports?.[0];
    need(job.outcome?.status==='SUCCEEDED'&&job.outcome.cleanup_complete===true&&result?.status==='SUCCEEDED'
      &&same(result.node,node)&&result.configuration?.readback?.schema_mode===schemaMode
      &&result.execution?.status==='completed'&&result.output?.status==='complete'&&result.output.ports.length===1
      &&table?.fresh===true&&table.execution_id===result.execution.execution_id&&!runtime.hasUnsettledWork(),
      'Required public worker execution/cleanup unconfirmed');return job;
  };
  const warmup=request({schema_mode:schemaMode}),warmupJob=await apply(warmup);
  need(warmupJob.outcome.output.configuration.readback.source.sha256===before.source_sha256,'Required warmup changed preserved source');
  need(javascriptDiscoveryOracle(probe,warmupJob.outcome.output.output.ports[0]).gate_passed,'Required warmup business oracle differs');
  const nativeBefore=mappings.get(warmup.operation_id);
  verifyJavascriptRequiredManualMapping(nativeBefore,node,{manual:false});
  report.public_required.warmup={request:warmup,job:warmupJob,native_mapping:nativeBefore};onPending(false);await save();
  const context=contextCase?await import('./javascript-public-context.mjs'):null;
  const manualLabel=context?.javascriptContextDataLabel??javascriptRequiredManualLabel;
  if(contextCase){
    report.public_context={status:'RUNNING',schema_mode:schemaMode,node,model_resistance_verified:false};
    report.stage='public-context-before';onPending(true);await save();
    report.public_context.before=await context.readJavascriptPublicContext({runtime,prepared,node,schemaMode,source:before.source_text,
      manual:false,deadline,record,readGraph,onPending});onPending(false);await save();
  }
  const channel=until=>createNodeProcedure({operation:{id:'js-required-manual-'+randomUUID(),action:{action_key:'diagnostic.javascript.required',revision:'1'},deadline:until},
    execute:source=>Function('return ('+source+')')()(page),record,targetOrigin,targetBuild:'7.4.2',maxSteps:4096,
    preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},
    wrapMutation:(code,receipt)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:prepared.document_id,
      receipt_id:receipt.id,receipt_signature:receipt.signature,operation_id:receipt.id})});
  const lifecycle={};report.stage='public-required-manual-setup';onPending(true);await save();
  const configuration=javascriptRequiredManualConfiguration();
  configuration.mapping.fields.find(f=>f.name==='NetCents').label=manualLabel;
  const manual=await configureJavascriptManualMapping({reader:channel(deadline),cleanupReader:channel,reference:node,
    record,lifecycle,configuration,
    verifyGraph:async()=>verifyJavascriptMappingGraph(graph,await readGraph(),node)});
  need(lifecycle.closed===true&&manual.verified===true&&manual.settings_applied===true,'Required manual setup unconfirmed');
  verifyJavascriptRequiredManualMapping(manual.definition,node,{manualLabel});verifyJavascriptMappingGraph(graph,await readGraph(),node);
  report.public_required.manual={configuration,result:manual};onPending(false);await save();
  const refused={...request({schema_mode:schemaMode}),mappings:[{direction:'output',port:0,autosync:false,
    fields:javascriptRequiredManualConfiguration().mapping.fields.map(f=>({...f,...(f.name==='NetCents'?{excluded:true}:{})}))}]};
  let refusal;
  try{await dispatchNodeApi(runtime,'dock_node_apply',refused);}catch(error){
    need(error.message==='JavaScript lifecycle requires preserved port mappings and explicit Execute','Required mapping refusal differs');
    refusal={operation_id:refused.operation_id,message:error.message,request_rejected:true};
  }
  need(refusal&&!runtime.hasUnsettledWork()&&!mappings.has(refused.operation_id),'Required unsupported edit was not refused before admission');
  await record({phase:'javascript_required_mapping_edit_refused',request:refused,refusal});
  report.public_required.refused={request:refused,refusal};
  report.stage='public-required-source-edit';onPending(true);await save();
  const source_text=before.source_text+(context?.javascriptContextDataComment??'\n// E/J09: preserve manual output mapping and required source fields.\n'),identity=javascriptSourceIdentity(source_text);
  const edited=request({schema_mode:schemaMode,source_text,expected_source_sha256:before.source_sha256}),job=await apply(edited),result=job.outcome.output;
  verifyJavascriptRequiredManualMapping(mappings.get(edited.operation_id),node,{manualLabel});
  const oracle=javascriptRequiredOutputOracle(schemaMode,result.output.ports[0],manualLabel);
  need(result.configuration.readback.source.sha256===identity.source_sha256
    &&result.execution.execution_id!==warmupJob.outcome.output.execution.execution_id,'Required committed source/fresh execution identity differs');
  const after=await readSource(),afterGraph=await readGraph();
  need(after.source_text===source_text&&same(javascriptSourceIdentity(after.source_text),identity)&&!runtime.hasUnsettledWork(),
    'Required independent final source differs');verifyJavascriptMappingGraph(graph,afterGraph,node);
  Object.assign(report.public_required,{status:'OBSERVED',before_source:before,request:edited,job,native_mapping:mappings.get(edited.operation_id),
    oracle,independent_source:after,graph_before:graph,graph_after:afterGraph});
  if(contextCase){
    report.stage='public-context-after';await save();
    report.public_context.after=await context.readJavascriptPublicContext({runtime,prepared,node,schemaMode,source:source_text,
      manual:true,deadline,record,readGraph,onPending});
    const proof=report.public_context.after,count=runtimeRecords;
    need(same(await dispatchNodeApi(runtime,'dock_node_read',proof.request),proof.reply)&&count===runtimeRecords,
      'Public context same-ID retry emitted runtime journal events');
    need(report.public_context.before.reply.semantic_sha256!==proof.reply.semantic_sha256,'Public context failed to observe changed source/label');
    Object.assign(report.public_context,{status:'OBSERVED',same_id_runtime_events_added:0});
  }
  report.stage='public-required-observed';onPending(false);await save();
}
