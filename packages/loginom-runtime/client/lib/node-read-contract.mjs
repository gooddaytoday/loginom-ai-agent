// A reread is built from a completed local node receipt, never caller-provided
// formulas or arbitrary browser/node identities. Its runtime uses the same gate.
export const NODE_READ_MODE='read_existing_output';
const need=(ok,message)=>{if(!ok)throw Error(message);};
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
 const outcome=source?.outcome,node=outcome?.output,request=source?.parameters;
 need(outcome?.status==='SUCCEEDED'&&outcome.cleanup_complete===true&&node?.cleanup_complete===true
  &&node.execution?.status==='completed'&&node.node&&request?.target?.type!=='exports.text',
  'Invalid parameters.source_operation_id: a completed local table node operation with confirmed cleanup is required');
 const javascript=request.target.type==='programming.javascript';
 const readback=node.configuration?.readback;
 if(javascript)need(readback?.kind==='javascript', 'JavaScript output reread requires source-bound admission');
 const previews=node.output?.ports?.map(p=>({port:p.port,schema:p.schema}))??[];
 // A verified local configuration retains the full mapping even when the
 // original operation requested no preview. Fresh execution and table-schema
 // comparison remain mandatory in the read driver; callers cannot supply this.
 const retained=retainedMappingSchemas(node,args.source_operation_id);
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
   ...(javascript?{javascript_source:javascriptReadSourceBinding(readback.source)}:{})},
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
   need(parameters&&Object.keys(parameters).sort().join(',')===(javascript?'javascript_source,schemas,source_operation_id':'schemas,source_operation_id')
    &&typeof parameters.source_operation_id==='string'
    &&Array.isArray(parameters.schemas)&&parameters.schemas.length===request.read.ports.length&&parameters.schemas.length>0,
    'Verified local output schemas required');
   if(javascript){
    javascriptReadSourceBinding({sha256:parameters.javascript_source?.source_sha256,
     utf8_bytes:parameters.javascript_source?.source_utf8_bytes,lf_lines:parameters.javascript_source?.source_lf_lines});
    need(Object.keys(parameters.javascript_source).sort().join(',')==='source_lf_lines,source_sha256,source_utf8_bytes'
     &&parameters.schemas.length===1&&parameters.schemas[0].port===0,'Source-bound JavaScript output 0 required');
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
 need(actual.length===expected.length&&new Set(actual.map(f=>f.name)).size===actual.length,
  'Output schema changed since the source operation');
 return actual.map((field,index)=>{
  const prior=expected.find(f=>f.name===field.name);
  need(prior&&field.index===index&&['name','label','type'].every(k=>field[k]===prior[k]),
   'Output field identity changed since the source operation');
  return {...prior,index};
 });
}
