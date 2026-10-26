import {retainCrossTableReadPolicy} from './crosstable-schema.mjs';
// A reread is built from a completed local node receipt, never caller-provided
// formulas or arbitrary browser/node identities. Its runtime uses the same gate.
export const NODE_READ_MODE='read_existing_output';
const need=(ok,message)=>{if(!ok)throw Error(message);};
// No input/configuration/mapping edit is requested. Execute the saved node
// through the existing read lifecycle, rather than committing its wizards
// after a preliminary execution (which would deactivate that result).
export function isUnchangedTransformExecution(request){
 const type=request?.target?.type,p=request?.parameters;
 return request?.target?.kind==='existing'&&request.finish==='execute'
  &&Array.isArray(request.inputs)&&request.inputs.length===0
  &&Array.isArray(request.mappings)&&request.mappings.length===0
  &&p&&typeof p==='object'&&!Array.isArray(p)
  &&(type==='transform.join_data'&&['inner','left'].includes(request.mode)&&Object.keys(p).length===0
   ||type==='transform.reform_columns'&&request.mode==='scalar'&&Object.keys(p).join(',')==='changes'
    &&Array.isArray(p.changes)&&p.changes.length===0);
}
// An empty existing Import patch requests execution of its current native
// configuration, not a new file or an upload receipt from a previous session.
export function isUnchangedTextImportExecution(request){
 return request?.target?.type==='imports.text'&&request.target.kind==='existing'
  &&request.mode==='delimited'&&request.finish==='execute'
  &&Array.isArray(request.inputs)&&request.inputs.length===0
  &&Array.isArray(request.mappings)&&request.mappings.length===0
  &&request.parameters&&Object.keys(request.parameters).join(',')==='settings'
  &&request.parameters.settings&&typeof request.parameters.settings==='object'
  &&!Array.isArray(request.parameters.settings)&&Object.keys(request.parameters.settings).length===0
  &&Array.isArray(request.read?.ports)&&request.read.ports.length===1&&request.read.ports[0]===0;
}
function retainedMappingSchemas(node,sourceId){
 const r=node.configuration?.readback;
 if(!r)return [];
 const javascript=r.kind==='javascript';
 need(node.configuration.status==='applied'
  &&r.scope===(javascript?'observed_after_verified_finish':'observed_before_verified_finish')
  &&r.values_are===(javascript?'independent_owned_source_readback':'observed_ui_values')
  &&['document_id','workflow_id','node_id'].every(k=>r.node?.[k]===node.node[k])
  &&Array.isArray(r.receipt_ids)&&r.receipt_ids.length>0&&new Set(r.receipt_ids).size===r.receipt_ids.length
  &&r.receipt_ids.includes(sourceId+':finish')&&r.receipt_ids.includes(sourceId+':output_mapping')
  &&r.receipt_ids.every(id=>node.phases?.filter(p=>p.receipt_id===id&&id===sourceId+':'+p.phase
   &&p.status==='verified').length===1),
  'Invalid parameters.source_operation_id: output mapping readback ownership or receipts differ');
 if(javascript)need(['code','declared'].includes(r.schema_mode)&&r.settings_preserved===true
  &&r.wizard_commit_verified===true&&r.execution_effects?.explicit_execute_requested===true
  &&r.execution_effects.internal_execution_started===null
  &&r.receipt_ids.includes(sourceId+':node_finish')&&r.receipt_ids.includes(sourceId+':materialization_execute')
  &&r.receipt_ids.includes(sourceId+':execute')&&r.output_mapping?.port===0&&r.output_mappings===undefined,
 'Invalid parameters.source_operation_id: JavaScript executed source readback required');
 const mappings=r.output_mappings??(r.output_mapping?[r.output_mapping]:[]);
 need(Array.isArray(mappings)&&new Set(mappings.map(m=>m.port)).size===mappings.length,
  'Invalid parameters.source_operation_id: duplicate retained output ports');
 return mappings.map(m=>{
  need(Number.isInteger(m.port)&&m.port>=0&&Array.isArray(m.fields)&&m.fields.length>0
   &&new Set(m.fields.map(f=>f.name)).size===m.fields.length&&m.fields.every((f,i)=>f.index===i
    &&['name','label','type','data_kind','source_name'].every(k=>typeof f[k]==='string')
    &&(f.excluded===undefined||typeof f.excluded==='boolean')),
   'Invalid parameters.source_operation_id: incomplete retained output mapping');
  const schema=m.fields.filter(f=>f.excluded!==true).map((f,index)=>({index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind}));
  need(schema.length>0,'Invalid parameters.source_operation_id: empty retained output schema');
  return {port:m.port,schema};
 });
}
export function buildNodeReadRequest(args,source){
 if(source?.kind==='browser_recovery')return buildRecoveredReadRequest(args,source);
 const outcome=source?.outcome,node=outcome?.output,request=source?.parameters;
 // A release after a stopped read keeps the verified configuration and the
 // completed execution; only its output was not refreshed.
 const releasedRead=outcome?.status==='FAILED'&&node?.checkpoint_kind==='local_node_released'&&node.released_phase==='read';
 need((outcome?.status==='SUCCEEDED'||releasedRead)&&outcome.cleanup_complete===true&&node?.cleanup_complete===true
  &&node.execution?.status==='completed'&&node.node&&request?.target?.type!=='exports.text',
  'Invalid parameters.source_operation_id: a completed local table node operation with confirmed cleanup is required');
 const javascript=request.target.type==='programming.javascript';
 const readback=node.configuration?.readback;
 if(javascript)need(readback?.kind==='javascript', 'JavaScript output reread requires source-bound admission');
 const previews=node.output?.ports?.map(p=>({port:p.port,schema:p.schema}))??[];
 // A verified local configuration retains the full mapping even when the
 // original operation requested no preview. Fresh execution and table-schema
 // comparison remain mandatory in the read driver; callers cannot supply this.
 const crossPolicy=retainCrossTableReadPolicy(source,args.source_operation_id);
 const retained=request.target.type==='transform.cross_table'?[]:retainedMappingSchemas(node,args.source_operation_id);
 // JS binds to the owned full mapping even when an earlier preview exists.
 const schemas=javascript?retained:[...previews,...retained.filter(p=>!previews.some(s=>s.port===p.port))];
 need(schemas?.length>0,'Invalid parameters.source_operation_id: the source operation has no verified table output');
 const ports=args.read?.ports??schemas.map(p=>p.port);
 need(ports.length>0&&ports.every(p=>schemas.some(s=>s.port===p)),
  'Invalid parameters.read.ports: choose ports present in the completed source result');
 const budget=args.budget_ms??300000;
 return {operation_id:args.operation_id,contract_revision:request.contract_revision,
  document_id:node.node.document_id,workflow_ref:structuredClone(request.workflow_ref),
  target:{kind:'existing',type:request.target.type,label:request.target.label,ref:structuredClone(node.node)},inputs:[],
  mode:NODE_READ_MODE,parameters:{source_operation_id:args.source_operation_id,schemas:structuredClone(schemas.filter(p=>ports.includes(p.port))),
   ...(crossPolicy?{cross_table_policy:crossPolicy}:{}),
   ...(javascript?{javascript_source:javascriptReadSourceBinding(readback.source)}:{})},
  mappings:[],finish:'execute',read:{ports:structuredClone(ports),sample_rows:args.read?.sample_rows??10,require_exact_numbers:args.read?.require_exact_numbers??false},
  budgets:{configure_ms:budget,execute_ms:budget,total_ms:budget}};
}
// A browser recovery receipt carries only runtime-proven release facts and the
// model's attested settings. No schema is trusted from it: the read executes the
// node fresh and returns the observed output schema as its own evidence.
function buildRecoveredReadRequest(args,receipt){
 const request=receipt.request;
 need(receipt.status==='continuable'&&receipt.facts?.includes('node_released_on_quiet_graph')&&receipt.node&&request?.target
  &&!['programming.javascript','exports.text'].includes(request.target.type),
  'Invalid parameters.source_operation_id: this browser recovery receipt has no readable table node');
 const ports=args.read?.ports??[0];
 const budget=args.budget_ms??300000;
 return {operation_id:args.operation_id,contract_revision:request.contract_revision,
  document_id:receipt.node.document_id,workflow_ref:structuredClone(request.workflow_ref),
  target:{kind:'existing',type:request.target.type,label:request.target.label,ref:structuredClone(receipt.node)},inputs:[],
  mode:NODE_READ_MODE,parameters:{source_operation_id:args.source_operation_id,observed_schema:true,
   schemas:ports.map(port=>({port,schema:null}))},
  mappings:[],finish:'execute',read:{ports:structuredClone(ports),sample_rows:args.read?.sample_rows??10,require_exact_numbers:args.read?.require_exact_numbers??false},
  budgets:{configure_ms:budget,execute_ms:budget,total_ms:budget}};
}
export function nodeReadHandler(handler){
 return {revision:handler.revision+':read-existing-v1',modes:[NODE_READ_MODE],
  validate(parameters,mode,request){
   need(mode===NODE_READ_MODE&&request.target.kind==='existing'&&request.inputs.length===0&&request.mappings.length===0
    &&request.finish==='execute'&&request.read.coverage!== 'full'&&handler.fileOutput!==true,
    'Existing-output reads cannot create nodes, configure ports or export files');
   const javascript=request.target.type==='programming.javascript';
   const observed=parameters?.observed_schema===true;
   need(parameters&&Object.keys(parameters).sort().join(',')===(javascript?'javascript_source,schemas,source_operation_id':parameters.cross_table_policy?'cross_table_policy,schemas,source_operation_id':observed?'observed_schema,schemas,source_operation_id':'schemas,source_operation_id')
    &&typeof parameters.source_operation_id==='string'
    &&Array.isArray(parameters.schemas)&&parameters.schemas.length===request.read.ports.length&&parameters.schemas.length>0,
    'Verified local output schemas required');
   if(parameters.cross_table_policy)need(request.target.type==='transform.cross_table'
    &&parameters.cross_table_policy.kind==='crosstable_sliding'
    &&parameters.cross_table_policy.configuration?.category_mode==='sliding'
    &&['document_id','workflow_id','node_id'].every(k=>parameters.cross_table_policy.node?.[k]===request.target.ref[k]),
    'Internal CrossTable read policy owner differs');
   if(javascript){
    javascriptReadSourceBinding({sha256:parameters.javascript_source?.source_sha256,
     utf8_bytes:parameters.javascript_source?.source_utf8_bytes,lf_lines:parameters.javascript_source?.source_lf_lines});
    need(Object.keys(parameters.javascript_source).sort().join(',')==='source_lf_lines,source_sha256,source_utf8_bytes'
     &&parameters.schemas.length===1&&parameters.schemas[0].port===0,'Source-bound JavaScript output 0 required');
   }
   if(observed){
    need(!javascript&&request.read.ports.every(port=>parameters.schemas.filter(s=>s.port===port&&s.schema===null).length===1),
     'Observed-schema reads bind every read port without a retained schema');
    return;
   }
   for(const port of request.read.ports){
    const matches=parameters.schemas.filter(s=>s.port===port);
    need(matches.length===1&&Array.isArray(matches[0].schema)&&matches[0].schema.length>0,
     'Unique retained schema required for every read port');
    const fields=matches[0].schema;
    need(new Set(fields.map(f=>f.name)).size===fields.length&&fields.every(f=>typeof f.name==='string'&&typeof f.label==='string'&&typeof f.type==='string'),
     'Complete named output schema required');
   }
  },configure(){throw Error('Existing output read cannot configure a node');}};
}

function javascriptReadSourceBinding(source){
 need(source&&Object.keys(source).sort().join(',')==='lf_lines,sha256,utf8_bytes'
  &&typeof source.sha256==='string'&&/^[a-f0-9]{64}$/.test(source.sha256)
  &&Number.isInteger(source.utf8_bytes)&&source.utf8_bytes>=0&&source.utf8_bytes<=32768
  &&Number.isInteger(source.lf_lines)&&source.lf_lines>=1&&source.lf_lines<=1024,
 'JavaScript output reread requires a complete retained source identity');
 return {source_sha256:source.sha256,source_utf8_bytes:source.utf8_bytes,source_lf_lines:source.lf_lines};
}
export function alignReadSchema(actual,expected){
 // Observed-schema reads (browser recovery receipts) take the fresh schema as evidence.
 if(expected===null){
  need(actual.length>0&&new Set(actual.map(f=>f.name)).size===actual.length,'Observed output schema is empty or ambiguous');
  return actual.map((field,index)=>({...field,index}));
 }
 const changed=message=>{
  const error=Error(message+'. Observed field names: '+JSON.stringify(actual.map(f=>f.name)).slice(0,220)
   +'. The source_operation_id is stale. Cancel this stopped read with dock_node_cancel and confirm cleanup_complete:true. '
   +'Then submit a NEW dock_node_apply operation_id on the SAME existing node with current intended settings, inputs:[], mappings:[] and finish:"execute". '
   +'Use only that new SUCCEEDED operation with confirmed cleanup as source_operation_id for dock_node_read; do not reuse the old source or a failed operation.');
  error.code='NODE_READ_SCHEMA_CHANGED';throw error;
 };
 if(!(actual.length===expected.length&&new Set(actual.map(f=>f.name)).size===actual.length))
  changed('Output schema changed since the source operation');
 return actual.map((field,index)=>{
  const prior=expected.find(f=>f.name===field.name);
  if(!(prior&&field.index===index&&['name','label','type'].every(k=>field[k]===prior[k])))
   changed('Output field identity changed since the source operation');
  return {...prior,index};
 });
}
