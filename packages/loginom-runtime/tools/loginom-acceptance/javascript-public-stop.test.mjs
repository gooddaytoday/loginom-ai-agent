import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNodeOperationRunner} from '../../client/lib/node-operation-runner.mjs';
import {nodeApiTools} from '../../client/lib/node-api.mjs';
import {stopJavascriptPublicExecution,verifyJavascriptPublicStopped} from './javascript-public-stop.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
const request={operation_id:'stop',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',
    navigation_path:[{tid:'navigation',label:'Workflow'}]},
  target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',parameters:{schema_mode:'code'},
  mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
  budgets:{configure_ms:600000,execute_ms:60000,total_ms:660000}};
const output=()=>({status:'FAILED',cleanup_complete:true,node,configuration:{status:'applied'},
  execution:{status:'cancelled',execution_id:'doc:root:1',stop_verified:true},output:{status:'not_refreshed',ports:[]},
  checkpoint_kind:'local_node_stopped',error:{code:'NODE_EXECUTION_CANCELLED'},
  phases:[{phase:'materialization_execute',status:'verified'}]});

test('public Stop uses the actual operation runner and dispatches only one request for its identified execution',async()=>{
  let calls=0;
  const runner=createNodeOperationRunner({validate:()=> 'fixture',progress:()=>({node,pending_phase:'materialization_execute',
    execution:{status:'pending',execution_id:'doc:root:1'}}),run:async(request,{stopSignal})=>{
      await new Promise(resolve=>stopSignal.addEventListener('abort',resolve,{once:true}));
      return {status:'FAILED',cleanup_complete:true,effect_possible:true,output:output()};
    }});
  const events=[],runtime={tools:nodeApiTools,startNodeApply:request=>runner.start(request),waitNodeApply:(id,{timeoutMs})=>runner.wait(id,{timeoutMs}),
    stopNodeApply:id=>{calls++;return runner.stop(id);}};
  const job=await stopJavascriptPublicExecution({runtime,request,node,record:async event=>{events.push(event);return event;},
    onProgress:async()=>{},deadline:Date.now()+10000});
  assert.equal(verifyJavascriptPublicStopped(job,node),job.outcome.output);assert.equal(calls,1);
  assert.deepEqual(events.map(event=>event.phase),['javascript_public_stop_prepared','javascript_public_stop_requested']);
  assert.equal(events[0].execution_id,job.outcome.output.execution.execution_id);
});

for(const failure of ['prepared_ack','unknown_reply','requested_ack'])test('public Stop refuses '+failure+' without replay',async()=>{
  let calls=0;const pending={operation_id:'stop',state:'running',progress:{node,pending_phase:'materialization_execute',execution:{status:'pending',execution_id:'doc:root:1'}}};
  const runtime={tools:nodeApiTools,startNodeApply:()=>pending,stopNodeApply:()=>{calls++;if(failure==='unknown_reply')throw Error('lost Stop reply');
    return {...pending,operation_id:'stop',server_stop_requested:true,cancel_requested:false};},waitNodeApply:()=>{throw Error('must not continue');}};
  await assert.rejects(stopJavascriptPublicExecution({runtime,request,node,
    record:async event=>failure==='prepared_ack'&&event.phase.endsWith('prepared')||failure==='requested_ack'&&event.phase.endsWith('requested')?{}:event,
    onProgress:async()=>{},deadline:Date.now()+10000}),/ACK differs|lost Stop reply/);
  assert.equal(calls,failure==='prepared_ack'?0:1);
});

for(const changed of ['worker','node','execution'])test('public Stop refuses foreign '+changed+' before dispatch',async()=>{
  let calls=0;const pending={operation_id:'stop',state:'running',progress:{node,pending_phase:'materialization_execute',
    execution:{status:'pending',execution_id:'doc:root:1'}}};
  if(changed==='worker')pending.operation_id='foreign';
  if(changed==='node')pending.progress.node={...node,node_id:'foreign'};
  if(changed==='execution')pending.progress.execution.execution_id='foreign:root:1';
  await assert.rejects(stopJavascriptPublicExecution({runtime:{tools:nodeApiTools,startNodeApply:()=>pending,stopNodeApply:()=>{calls++;}},
    request,node,record:async event=>event,onProgress:async()=>{},deadline:Date.now()+10000}),/identity changed|owner changed/);
  assert.equal(calls,0);
});

test('public Stop never starts an expired case and rejects false terminal proofs',async()=>{
  let starts=0;
  await assert.rejects(stopJavascriptPublicExecution({runtime:{startNodeApply:()=>{starts++;}},deadline:1}),/expired/);
  assert.equal(starts,0);
  const job={state:'settled',server_stop_requested:true,cancel_requested:false,
    outcome:{status:'FAILED',cleanup_complete:true,effect_possible:true,output:output()}};
  verifyJavascriptPublicStopped(job,node);
  for(const change of [v=>v.server_stop_requested=false,v=>v.cancel_requested=true,v=>v.outcome.status='SUCCEEDED',
    v=>v.outcome.cleanup_complete=false,v=>v.outcome.output.node={...node,node_id:'foreign'},
    v=>v.outcome.output.configuration.status='discarded',v=>v.outcome.output.execution.status='completed',
    v=>v.outcome.output.execution.stop_verified=false,v=>v.outcome.output.execution.execution_id='foreign:root:1',
    v=>v.outcome.output.output.ports=[{port:0}],v=>v.outcome.output.output.status='complete',
    v=>v.outcome.output.phases[0].status='pending']){
      const changed=structuredClone(job);change(changed);assert.throws(()=>verifyJavascriptPublicStopped(changed,node),/unconfirmed/);
    }
});

const entry=fileURLToPath(new URL('./javascript-public-stop-live.mjs',import.meta.url));
for(const args of [[],['--case','other'],['--case','stop-code','--source','foreign'],['--case','stop-code','--headless','true'],
  ['--case','stop-code','--x11-no-focus','true'],['--case','stop-code','--case','stop-code']])
test('public Stop entrypoint refuses unassigned controls '+JSON.stringify(args),()=>{
  const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Fixed public Stop|Only assigned public Stop/);
});
