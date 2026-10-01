import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput,freshTableColumns} from './table-output-values.mjs';
import {createNodeTargetBrowserAdapter} from './node-target-browser.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {resolveCrossTableOutputSchema} from './crosstable-output.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});

export function createNodeReadDrivers(options,{targetOrigin,targetBuild}){
 const {operation,execute,onRecord,now,receiptOptions}=options;
 let channel,signal,driver,execution;
 const enter=ctx=>{
  signal=ctx.signal;operation.deadline=ctx.deadline;
  channel??=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:4096,targetOrigin,targetBuild,
   signal:{throwIfAborted:()=>signal?.throwIfAborted(),get aborted(){return signal?.aborted;},get reason(){return signal?.reason;}},
   preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 };
 const forbidden=()=>{throw Error('A read operation cannot open or configure node/port wizards');};
 return {
  verifySource:async()=>verified({source_kind:'completed_local_node',source_operation_id:operation.parameters.parameters.source_operation_id}),
  mapPorts:forbidden,openWizard:forbidden,finish:forbidden,
  async finishGraph(mode,ctx){
   need(mode==='execute','Existing output read requires a fresh execution');enter(ctx);
   const graph=await createNodeTargetBrowserAdapter({execute,origin:targetOrigin,build:targetBuild}).observe(
    {document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},ctx.deadline);
   verifyReadInputLinks(graph,ctx.node,operation.parameters.parameters.input_links);
   driver=createNodeExecutionProcedure(channel,ctx.node,{allowDeactivate:true});await driver.prepare();
   const result=await finishConfiguredGraph(channel,driver,mode,ctx.node);
   // finishConfiguredGraph normally follows a committed wizard; here only
   // execution occurred. Do not claim a configuration readback or commit.
   return {...result,settings_applied:false};
  },
  async waitExecution(ctx){
   enter(ctx);need(driver,'Read execution driver missing');
   try{execution=await driver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});}
   catch(error){
    if(!ctx.stopSignal?.aborted||error!==ctx.stopSignal.reason||operation.transportUncertain)throw error;
    execution=await driver.stop();
   }
   return execution;
  },
  async readOutput(read,ctx){
   enter(ctx);need(execution?.verified===true&&execution.owner_verified===true&&execution.execution_id===ctx.execution.execution_id,
    'Fresh owned execution required for reread');
   const ports=[];let restoration,returned;
   for(const port of read.ports){
    const retained=operation.parameters.parameters.schemas.find(s=>s.port===port);
    need(retained?.schema,'Retained output schema missing');
    const table=await openNewOutputTable(channel,port);
    need(!retained.port_guid||retained.port_guid===table.port_guid,'Output port identity changed since the source operation');
    const format=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
    let data,dynamic;
    try{
     const settings=await prepareTableRead(channel,table.table);
     const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
     dynamic=resolveReadOutputSchema(freshTableColumns(raw.columns,settings),retained,operation.parameters.target.type);
     data=decodeTableOutput(raw,{formatProof:format,readSettings:settings,expectedColumns:dynamic.fields,requireExactNumbers:read.require_exact_numbers});
    }finally{if(format)restoration=await restoreTablePrecision(channel,format);}
    returned=await returnFromOutputTable(channel,table.table);
    ports.push({port,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data,...(dynamic.category_mapping?{category_mapping:dynamic.category_mapping,dynamic_schema:retained.dynamic_schema}:{})});
   }
   return verified({effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',
    execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,
    ...(restoration?{format_restoration:restoration}:{}),workflow_return:returned});
  },
  // Same-ID delivery retries return the original worker. Unknown browser effects
  // stay blocked; this route never restarts an uncertain execution automatically.
  verifyContinuation:async()=>false,
 };
}

// Only the original, verified Sliding receipt permits a fresh generated schema.
// Static outputs keep their exact identity check; row keys and fact types remain
// fixed even when category ordinals are reused by Loginom.
export function resolveReadOutputSchema(actual,retained,nodeType){
 const dynamic=retained.dynamic_schema;
 if(dynamic?.kind==='text_import_output_v1'){
  need(nodeType==='imports.text'&&actual.length>0&&actual.length<=1000
   &&new Set(actual.map(f=>f.name)).size===actual.length
   &&actual.every((f,index)=>f.index===index&&typeof f.data_kind==='string'&&f.data_kind_source==='fresh_native'),
   'Fresh owned text import schema required');
  return {fields:actual};
 }
 if(!dynamic)return {fields:alignReadSchema(actual,retained.schema)};
 need(nodeType==='transform.cross_table'&&dynamic.kind==='crosstable_sliding'
  &&dynamic.parameters?.columns?.mode==='sliding','Unsupported dynamic output schema');
 const result=resolveCrossTableOutputSchema(dynamic.configuration,dynamic.parameters,actual);
 need(new Set(actual.map(field=>field.name)).size===actual.length
  &&actual.every((field,index)=>field.index===index),'Output field indices or names differ');
 const rowCount=dynamic.parameters.rows.length;
 alignReadSchema(actual.slice(0,rowCount),retained.schema.slice(0,rowCount));
 for(const field of actual.slice(rowCount)){
  const suffix=field.name.replace(/^C_[0-9]+_/, '');
  const prior=retained.schema.filter(item=>item.name.replace(/^C_[0-9]+_/, '')===suffix);
  need(prior.length>0&&prior.every(item=>item.type===field.type),'CrossTable fact type changed since the source operation');
 }
 return result;
}

export function verifyReadInputLinks(graph,node,inputs){
 need(graph.complete===true&&graph.foreign_links.length===0,'Read graph incomplete');
 const links=graph.links.filter(link=>link.target===node.node_id);
 need(links.length===inputs.length&&inputs.every(input=>input.source.document_id===node.document_id
  &&input.source.workflow_id===node.workflow_id
  &&graph.nodes.filter(n=>n.ref.node_id===input.source.node_id&&n.outputs.includes(input.output)).length===1
  &&links.filter(link=>link.source===input.source.node_id&&link.output===input.output&&link.input===input.input).length===1),
  'Read input identity changed since the source operation');
}
