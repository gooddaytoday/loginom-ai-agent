// Private P1 source and lifecycle; never publish this CPU loop to knowledge.
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {javascriptStopProbe} from './javascript-stop-case.mjs';
import {javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';
import {createNodeExecutionProcedure} from '../../client/lib/node-execution-procedure.mjs';
import {createJavascriptManagedSourceAdapter} from '../../client/lib/javascript-managed-source-adapter.mjs';
import {createJavascriptSourceAdmission} from '../../client/lib/javascript-source-admission.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
export async function runJavascriptStopProbe({page,runtime,prepared,node,probe,deadline,record,redactor,onSourcePending}) {
  const fixed=javascriptStopProbe();
  need(probe.id===fixed.id&&probe.source===fixed.source&&probe.source_sha256===fixed.source_sha256
    &&deadline>Date.now()&&typeof onSourcePending==='function','Fixed finite Stop probe admission differs');
  const driver=createNodeExecutionProcedure(runtime.channel(node,deadline),node);
  // Establish and retain this owned console before the graph starts repainting.
  // This avoids opening it during execution; all epoch guards remain intact.
  const baseline=await driver.prepare({keepConsoleOpen:true}),started=performance.now();
  const launch=await runtime.once('p1-stop-launch',{node,baseline,source_sha256:probe.source_sha256},()=>driver.launchGraph());
  await record({phase:'p1_stop_launch',node,baseline,launch,source_sha256:probe.source_sha256,finite_loop:fixed.finite_loop});
  const identified=await driver.identify();
  // Abort only the local read wait. Its continuation proof says nothing about
  // server cancellation; the identified native execution remains the owner.
  const controller=new AbortController();controller.abort(Error('Private P1 local read cancellation'));
  let local;
  try{await driver.waitCompleted({signal:controller.signal});}
  catch(error){
    if(error!==controller.signal.reason&&!error.nodeExecutionWaitPause)throw error;
    local=error.nodeExecutionWaitPause;
  }
  need(local?.execution_id===identified.execution_id&&local.read_only===true&&local.cleanup_complete===true,
    'Local cancellation did not prove a read-only wait boundary');
  await record({phase:'p1_local_read_cancel',identified,proof:local,server_stop_verified:false});
  const stopped=await driver.stop();
  need(stopped.verified===true&&stopped.stop_verified===true&&stopped.status==='cancelled'
    &&stopped.owner_verified===true&&stopped.cleanup_complete===true&&stopped.output_refreshed===false
    &&stopped.execution_id===identified.execution_id,'Owned terminal cancellation not verified');
  const elapsed_ms=performance.now()-started;
  await record({phase:'p1_server_stop_terminal',identified,stopped,elapsed_ms,finite_loop:fixed.finite_loop});
  need(elapsed_ms<=60000,'Finite Stop probe exceeded its 60s launch/terminal observation window');

  const owner={...node,operation_id:'p1-stop-short-source-'+randomUUID(),ui_epoch:Date.now()};
  const namespace=randomUUID(),execute=code=>Function('return ('+code+')')()(page);
  const adapter=()=>createJavascriptManagedSourceAdapter({page,prepared,node,uiEpoch:owner.ui_epoch,deadline,
    targetOrigin:'http://logi-test-plan.bg.local',execute,record,
    receiptOptions:(id,key,signature)=>({receipt_namespace:namespace,receipt_id:id,receipt_signature:signature}),
    channel:until=>runtime.channel(node,until),openingBudgetMs:180000});
  onSourcePending(true);
  const writer=adapter(),handle=await writer.open({owner,deadline});
  const before=await writer.read(handle,{owner,deadline});
  need(sha(before.source)===fixed.source_sha256,'Stopped node source changed before short rerun');
  const written=await writer.replace(handle,{owner,deadline,expected_source_sha256:fixed.source_sha256,source_text:fixed.short.source});
  need(written.draft_exact===true&&written.source_sha256===fixed.short.source_sha256,'Short rerun draft differs');
  const committed=await writer.commit(handle,{owner,deadline});
  need(committed.graph_owner_verified===true&&committed.owned_done_settled===true,'Short source commit unconfirmed');
  const reader=createJavascriptSourceAdmission({kind:'existing',owner,deadline,redactor,record,sourceAdapter:async()=>adapter()});
  const reread=await reader.admit({});
  need(reread.intent==='preserve'&&reread.previous_source?.source_sha256===fixed.short.source_sha256,
    'Independent short source readback differs');
  onSourcePending(false);
  await record({phase:'p1_stop_short_source_verified',node,source_sha256:fixed.short.source_sha256});
  const rerun=createNodeExecutionProcedure(runtime.channel(node,deadline),node,{allowDeactivate:true});
  const fresh=await rerun.prepare();
  need(fresh.roots.some(p=>p.process_id===identified.group_id),'Stopped group missing from rerun baseline');
  await runtime.once('p1-stop-short-rerun',{node,baseline:fresh,source_sha256:fixed.short.source_sha256},()=>rerun.launchGraph());
  const next=await rerun.identify(),terminal=await rerun.waitCompleted();
  need(terminal.verified===true&&terminal.status==='completed'&&terminal.owner_verified===true
    &&terminal.execution_id!==stopped.execution_id,'Short same-node rerun not verified');
  const output=await runtime.readPassive(node,'discovery',deadline),oracle=javascriptDiscoveryOracle(fixed.short,output);
  need(oracle.gate_passed===true,'Short same-node rerun business oracle differs');
  const result={status:'stop_and_same_node_rerun_verified',node,local_cancel:local,stopped,elapsed_ms,
    source_before_sha256:fixed.source_sha256,source_after_sha256:fixed.short.source_sha256,
    rerun:{identified:next,terminal,output,oracle},proof_level:'private_native_stop_and_typed_ui',gates_closed:[]};
  await record({phase:'p1_stop_rerun_verified',result});return result;
}
