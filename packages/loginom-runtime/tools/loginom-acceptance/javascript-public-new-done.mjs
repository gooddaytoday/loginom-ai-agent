// Fixed acceptance composition only; no product source imports this module.
import {randomUUID} from 'node:crypto';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {verifyJavascriptMappingGraph} from '../../client/lib/javascript-graph-preservation.mjs';
import {verifyJavascriptConfigurationJob} from './javascript-public-configuration.mjs';
import {readJavascriptPublicExistingSource} from './javascript-public-existing-live.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function verifyJavascriptNewDoneGraph(before,after,node,input){
  need(before.complete===true&&after.complete===true&&before.document_id===node.document_id
    &&after.document_id===node.document_id&&same(before.workflow_ref,after.workflow_ref)
    &&before.workflow_ref.workflow_id===node.workflow_id&&before.foreign_links.length===0&&after.foreign_links.length===0
    &&after.nodes.length===before.nodes.length+1&&after.links.length===before.links.length+1,
  'Public new Done graph cardinality/owner differs');
  const normalize=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='dom_epoch'));
  need(before.nodes.every(old=>after.nodes.filter(n=>same(n.ref,old.ref)).length===1
      &&same(normalize(old),normalize(after.nodes.find(n=>same(n.ref,old.ref)))))
    &&before.links.every(old=>after.links.filter(link=>same(link,old)).length===1)
    &&after.nodes.filter(n=>same(n.ref,node)&&n.type==='programming.javascript').length===1
    &&after.links.filter(link=>link.source===input.node.node_id&&link.target===node.node_id
      &&link.input===0&&link.output===0).length===1,
  'Public new Done changed prior graph or fixed input connection');
  return {verified:true,graph_before:before,graph_after:after};
}

export async function runJavascriptPublicNewDone({runtime,prepared,input,probe,request,readGraph,
  runtimeEventCount,record,report,save,deadline,onPending}){
  need(request.target.kind==='new'&&request.finish==='execute'&&request.parameters.source_text===probe.source
    &&same(request.inputs,[{source:input.node,output:0,input:0}])&&deadline-Date.now()>720000,
  'Public new Done fixed source/input/deadline differs');
  const before=await readGraph(),identity=javascriptSourceIdentity(probe.source);
  const done={...structuredClone(request),finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true}};
  report.stage='public-new-done';report.public_new_done={status:'RUNNING',operation_id:done.operation_id,
    schema_mode:request.parameters.schema_mode,target_kind:'new',source:identity,explicit_execution_requested:false};
  onPending(true);await save();
  let job=await dispatchNodeApi(runtime,'dock_node_apply',done);
  while(job.state==='running'){
    need(Date.now()<deadline-60000,'Public new Done original deadline expired');
    job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:done.operation_id,timeout_ms:30000});
  }
  report.public_new_done.job=job;await save();
  const node=job.outcome?.output?.node;
  need(node?.document_id===prepared.document_id&&node.workflow_id===prepared.workflow_ref.workflow_id
    &&node.node_id!==input.node.node_id&&!before.nodes.some(n=>same(n.ref,node)),
  'Public new Done target identity differs');
  const compact=verifyJavascriptConfigurationJob(job,{node,mode:'done',schemaMode:request.parameters.schema_mode,source:identity});
  need(!runtime.hasUnsettledWork(),'Public new Done retained unsettled work');
  const count=runtimeEventCount(),retry=await dispatchNodeApi(runtime,'dock_node_apply',done);
  need(same(retry,job)&&runtimeEventCount()===count&&!runtime.hasUnsettledWork(),
    'Public new Done exact retry changed result or emitted events');
  const after=await readGraph(),graph=verifyJavascriptNewDoneGraph(before,after,node,input);
  const source=await readJavascriptPublicExistingSource({runtime,prepared,node,deadline,record});
  need(source.source_text===probe.source&&source.source_sha256===identity.source_sha256,
    'Public new Done independent source differs');
  verifyJavascriptMappingGraph(after,await readGraph(),node);
  const proof={node,...identity,...graph,source_read_operation_id:source.source_read_operation_id,
    chunks:source.chunks,exact_retry_runtime_events_added:0,explicit_execute_requested:false};
  const ack=await record({phase:'javascript_public_new_done_operator_verified',operation_id:done.operation_id,proof});
  need(same(ack.proof,proof),'Public new Done operator ACK differs');
  Object.assign(report.public_new_done,{status:'OBSERVED',node,user_result:compact,proof});
  onPending(false);await save();
  const remaining=deadline-Date.now()-60000;need(remaining>=600000,'Public new Done preserve Execute budget unavailable');
  return {...structuredClone(request),operation_id:'js-new-done-preserve-'+randomUUID(),
    target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],parameters:{schema_mode:request.parameters.schema_mode},
    budgets:{configure_ms:remaining,execute_ms:300000,total_ms:remaining}};
}
