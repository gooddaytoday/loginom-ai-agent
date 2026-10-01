import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {createJavascriptSourceAdmission} from './javascript-source-admission.mjs';
import {createJavascriptManagedSourceAdapter} from './javascript-managed-source-adapter.mjs';
import {openManagedJavascriptOutputViews} from './javascript-managed-views.mjs';
import {withJavascriptSourcePolicyBoundary} from './javascript-source-policy-refusal.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});

export function createNodeReadDrivers(options,{targetOrigin,targetBuild,redactor}){
 const {operation,execute,onRecord,now,receiptOptions}=options;
 const request=operation.parameters,javascript=request.target.type==='programming.javascript';
 const owner=javascript?{document_id:request.document_id,workflow_id:request.workflow_ref.workflow_id,
  node_id:request.target.ref.node_id,operation_id:operation.id,ui_epoch:Date.now()}:null;
 let channel,signal,driver,execution,sourceReceipt;
 const enter=ctx=>{
  signal=ctx.signal;signal?.throwIfAborted();operation.deadline=ctx.deadline;
  if(javascript)need(['document_id','workflow_id','node_id'].every(key=>ctx.node?.[key]===owner[key]),
   'JavaScript output reread owner changed');
  channel??=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:4096,targetOrigin,targetBuild,
   signal:{throwIfAborted:()=>signal?.throwIfAborted(),get aborted(){return signal?.aborted;},get reason(){return signal?.reason;}},
   preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 };
 const sourceAdmission=ctx=>createJavascriptSourceAdmission({kind:'existing',owner,deadline:ctx.deadline,
  expectedSource:request.parameters.javascript_source,expectedSettings:sourceReceipt?.settings_sha256,redactor,record:onRecord,
  sourceAdapter:()=>createJavascriptManagedSourceAdapter({page:{},prepared:{document_id:request.document_id,
   workflow_ref:request.workflow_ref,node:request.target.ref},node:request.target.ref,uiEpoch:owner.ui_epoch,
   deadline:ctx.deadline,targetOrigin,execute,record:onRecord,receiptOptions,redactor,
   channel:remaining=>{operation.deadline=remaining;return channel;},openingBudgetMs:180000})});
 const forbidden=()=>{throw Error('A read operation cannot open or configure node/port wizards');};
 return {
  verifySource:async()=>verified({source_kind:'completed_local_node',source_operation_id:operation.parameters.parameters.source_operation_id}),
  ...(javascript?{async beforeTarget(ctx){
   enter({...ctx,node:request.target.ref});
   sourceReceipt=await withJavascriptSourcePolicyBoundary({phase:'target',owner,deadline:ctx.deadline,record:onRecord},
    ()=>sourceAdmission(ctx).admit({}));
   return verified({effect_possible:true,settings_changed:false,
    source_sha256:sourceReceipt.effective_source.source_sha256,
    settings_sha256:sourceReceipt.settings_sha256,source_bound_reread:true});
  }}:{}),
  mapPorts:forbidden,openWizard:forbidden,finish:forbidden,
  async finishGraph(mode,ctx){
   need(mode==='execute','Existing output read requires a fresh execution');enter(ctx);
   const launch=async()=>{
   driver=createNodeExecutionProcedure(channel,ctx.node,{allowDeactivate:true});await driver.prepare();
   const result=await finishConfiguredGraph(channel,driver,mode,ctx.node);
   // finishConfiguredGraph normally follows a committed wizard; here only
   // execution occurred. Do not claim a configuration readback or commit.
   return {...result,settings_applied:false};
   };
   if(!javascript)return launch();
   need(sourceReceipt?.intent==='preserve','JavaScript reread source admission missing');
   return withJavascriptSourcePolicyBoundary({phase:'finish',owner,deadline:ctx.deadline,record:onRecord},async()=>{
    const fresh=sourceAdmission(ctx),receipt=await fresh.admit({});
    return fresh.withEffect({receipt,owner},launch);
   });
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
    const schema=operation.parameters.parameters.schemas.find(s=>s.port===port)?.schema;
    need(schema,'Retained output schema missing');
    const table=await openNewOutputTable(channel,port,javascript?{openViews:({output})=>openManagedJavascriptOutputViews({
     prepared:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},node:ctx.node,output,
     deadline:ctx.deadline,targetOrigin,execute,record:onRecord,receiptOptions,
     wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{
      ...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})})}:{});
    const format=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
    let data;
    try{
     const settings=await prepareTableRead(channel,table.table);
     const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
     data=decodeTableOutput(raw,{formatProof:format,readSettings:settings,expectedColumns:alignReadSchema(raw.columns,schema),requireExactNumbers:read.require_exact_numbers});
    }finally{if(format)restoration=await restoreTablePrecision(channel,format);}
    returned=await returnFromOutputTable(channel,table.table);
    ports.push({port,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data});
   }
   return verified({effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',
    execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,
    ...(javascript?{javascript_source:{...request.parameters.javascript_source,
     source_operation_id:request.parameters.source_operation_id,settings_sha256:sourceReceipt.settings_sha256,
     policy:sourceReceipt.effective_source.policy}}:{}),
    ...(restoration?{format_restoration:restoration}:{}),workflow_return:returned});
  },
  // Same-ID delivery retries return the original worker. Unknown browser effects
  // stay blocked; this route never restarts an uncertain execution automatically.
  verifyContinuation:async()=>false,
 };
}
