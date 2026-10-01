import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput,freshTableColumns} from './table-output-values.mjs';
import {createNodeTargetBrowserAdapter} from './node-target-browser.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {verifyReadInputLinks} from './node-read-driver.mjs';
import {DATAPARTITION_OUTPUT_ROLES} from './datapartition-output.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});

export function createDataPartitionReadDrivers(options,{targetOrigin,targetBuild}){
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
   need(operation.parameters.target.type==='preprocessing.data_partition'&&operation.parameters.parameters.input_links.length===1&&operation.parameters.parameters.input_links[0].input===0,'Original DataPartition input link required');
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
   need(read.ports.length===3&&[0,1,2].every(port=>read.ports.includes(port)),'DataPartition reread requires all outputs');
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
     dynamic=resolveDataPartitionReadSchema(freshTableColumns(raw.columns,settings),retained);
     data=decodeTableOutput(raw,{formatProof:format,readSettings:settings,expectedColumns:dynamic.fields,requireExactNumbers:read.require_exact_numbers});
    }finally{if(format)restoration=await restoreTablePrecision(channel,format);}
    returned=await returnFromOutputTable(channel,table.table);
    ports.push({port,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data,role:DATAPARTITION_OUTPUT_ROLES[port],...(retained.dynamic_schema?{dynamic_schema:retained.dynamic_schema}:{})});
   }
   verifyDataPartitionReadOutputs(ports,operation.parameters.parameters.schemas);
   return verified({effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',
    execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,
    ...(restoration?{format_restoration:restoration}:{}),workflow_return:returned});
  },
  // Same-ID delivery retries return the original worker. Unknown browser effects
  // stay blocked; this route never restarts an uncertain execution automatically.
  verifyContinuation:async()=>false,
 };
}


export function resolveDataPartitionReadSchema(actual,retained){
 if(!retained.dynamic_schema)return {fields:alignReadSchema(actual,retained.schema)};
 need(retained.dynamic_schema.kind==='data_partition_output_v1'&&retained.dynamic_schema.role===DATAPARTITION_OUTPUT_ROLES[retained.port]
  &&actual.length>0&&actual.length<=1000&&new Set(actual.map(f=>f.name)).size===actual.length
  &&actual.every((f,index)=>f.index===index&&typeof f.label==='string'&&typeof f.data_kind==='string'&&f.data_kind_source==='fresh_native'),
  'Fresh owned DataPartition schema required');
 return {fields:actual};
}

export function verifyDataPartitionReadOutputs(ports,retained){
 need(ports.length===3&&new Set(ports.map(p=>p.port)).size===3&&new Set(ports.map(p=>p.port_guid)).size===3,'Unique DataPartition output roles/GUIDs required');
 const dynamic=retained.filter(p=>p.dynamic_schema);
 if(!dynamic.length)return true;
 need(dynamic.length===3,'All DataPartition outputs must share the retained dynamic contract');
 const combined=ports.find(p=>p.port===0),training=ports.find(p=>p.port===1),test=ports.find(p=>p.port===2);
 const membership=retained.find(p=>p.port===0).dynamic_schema.membership;
 const keys=['name','label','type','data_kind'];
 const schema=fields=>fields.map(f=>keys.map(key=>f[key]));
 const service=combined.schema.filter(f=>f.name===membership.name);
 need(service.length===1&&service[0].type==='boolean'&&service[0].data_kind==='Дискретный'
  &&JSON.stringify(schema(combined.schema.filter(f=>f.name!==membership.name)))===JSON.stringify(schema(training.schema))
  &&JSON.stringify(schema(training.schema))===JSON.stringify(schema(test.schema)),'DataPartition fresh output schemas disagree');
 return true;
}
