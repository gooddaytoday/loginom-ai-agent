import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeExecutionProcedure} from '../lib/node-execution-procedure.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
const grid='ConsoleForm;ProgressForm;trpProgress;grd;tbl',cancel='mnContextMenu;mniCancel';
const element=(tid,verbs=['click'])=>({tid,ref:'ui-'+tid,allowed_actions:verbs});
async function fixture(fault, multiple=false,{keepConsoleOpen=false,initialPinned=false}={}) {
 let opened=true,pinned=initialPinned,menu=false,launched=false,terminal=false,cancelCalls=0;
 const actions=[],reads=[];
 const proof={root_id:'root',record_id:'child',process_id:'1.1',node_id:'node',owner_verified:true,can_cancel:true,source:'native_process_model_identity'};
 const state=()=>{
  const progress_state={verified:true,state:terminal?'cancelled':'running',terminal,can_cancel:!terminal};
  const ps=launched?[{process_id:'1',record_id:'group',parent_id:null,rendered:true,expanded:true,children_loaded:true,progress_state},
   {process_id:'1.1',record_id:'child',parent_id:'1',rendered:true,process_tid:'child-row',progress_state}]:[];
  if(multiple&&launched){
   ps[1].owner={verified:true,node_id:'node',source:'native_process_model_identity'};
   ps.push({process_id:'1.2',record_id:'upstream',parent_id:'1',progress_state:{verified:true,state:'completed',terminal:true,can_cancel:false}});
   if(fault==='ambiguous_native_owner')ps[2].owner={...ps[1].owner};
   if(fault==='missing_native_owner'||terminal&&fault==='lost_terminal_owner')delete ps[1].owner;
  }
  const actualProof={...proof,...(fault==='foreign_owner'?{node_id:'foreign'}:{})};
  if(terminal&&fault==='replaced_terminal')ps[1].record_id='replaced';
  if(terminal&&fault==='completed_race')ps[1].progress_state={verified:true,state:'completed',terminal:true,can_cancel:false};
  return {prepared_node_context:{...node,verified:true,surface:'graph'},node_processes:{verified:true,inventory_complete:true,
   root_id:'root',show_completed:true,node_context:{...node,verified:true},processes:ps},
   ui:{elements:[element('MF;cntMain;tlbMainToolbar;btnProgress'),...(opened?[element(grid,['right_click']),element('ConsoleForm;btnClose'),
     ...(fault==='missing_pin'?[]:[element(pinned?'ConsoleForm;btnPin':'ConsoleForm;btnUnpin')]),
     {...element('child-row',['right_click']),process_row:{record_id:fault==='reused_row'?'foreign-record':'child'}}]:[]),
    ...(menu?[element('mnContextMenu;mniShowCompletedProcesses',['click','press']),{...element(cancel,['cancel_process']),process_menu:{cancellation:actualProof}}]:[])]}};
 };
 const channel={observe:async o=>{reads.push(o);const s=state();if(o.readProcesses===false)delete s.node_processes;if(!o.ready(s))throw Error('Readiness refused: '+o.condition);return structuredClone(s);},
  perform:async o=>{const s=state();assert.equal(o.ready(s),true);const identity=o.identity(s);assert.ok(identity);const a=o.resolve(s);actions.push(a);
   if(a.verb==='cancel_process') {cancelCalls++;if(fault==='unknown_receipt')throw Error('Unknown stop receipt');terminal=true;menu=false;}
   else if(a.verb==='right_click')menu=true;
   else if(a.verb==='press')menu=false;
   else if(a.ref==='ui-ConsoleForm;btnUnpin'){if(fault==='unknown_pin')throw Error('Unknown pin receipt');pinned=true;}
   else if(a.ref==='ui-ConsoleForm;btnClose')opened=false;
   else if(a.ref==='ui-MF;cntMain;tlbMainToolbar;btnProgress')opened=true;
   return {status:'SUCCEEDED'};
  }};
 const driver=createNodeExecutionProcedure(channel,node);await driver.prepare({keepConsoleOpen});
 const preparationActions=structuredClone(actions);launched=true;await driver.identify();actions.length=0;
 reads.length=0;
 return {driver,channel,actions,reads,preparationActions,get cancelCalls(){return cancelCalls;}};
}
test('private prelaunch admission can retain the owned process console without a close gesture',async()=>{
 const normal=await fixture(),held=await fixture(undefined,false,{keepConsoleOpen:true});
 assert.equal(normal.preparationActions.filter(a=>a.ref==='ui-ConsoleForm;btnClose').length,1);
 assert.equal(held.preparationActions.filter(a=>a.ref==='ui-ConsoleForm;btnClose').length,0);
 assert.equal(held.preparationActions.filter(a=>a.ref==='ui-ConsoleForm;btnUnpin').length,1);
 const stopped=await held.driver.stop();assert.equal(stopped.stop_verified,true);assert.equal(held.cancelCalls,1);
});
test('a retained console already pinned is not toggled again',async()=>{
 const f=await fixture(undefined,false,{keepConsoleOpen:true,initialPinned:true});
 assert.equal(f.preparationActions.filter(a=>a.ref==='ui-ConsoleForm;btnUnpin'||a.ref==='ui-ConsoleForm;btnPin').length,0);
});
test('missing pin state or unknown pin receipt prevents execution preparation',async()=>{
 await assert.rejects(fixture('missing_pin',false,{keepConsoleOpen:true}),/pin state unavailable/);
 await assert.rejects(fixture('unknown_pin',false,{keepConsoleOpen:true}),/Unknown pin receipt/);
});
test('invalid retained console mode refuses before observations or gestures',async()=>{
 const f=await fixture();await assert.rejects(f.driver.prepare({keepConsoleOpen:'yes'}),/must be boolean/);
 assert.equal(f.reads.length,0);assert.deepEqual(f.actions,[]);
});
test('Stop refreshes native inventory when the process console was already visible',async()=>{
 const f=await fixture();const stopped=await f.driver.stop();assert.equal(stopped.stop_verified,true);
 assert.equal(f.reads[0].readProcesses,false);assert.equal(f.reads[1].readProcesses,true);
 assert.equal(f.reads[1].condition,'process console visible');assert.equal(f.cancelCalls,1);
});
test('stop driver cancels only its identified native child and returns terminal evidence once',async()=>{
 const f=await fixture(),first=f.driver.stop(),second=f.driver.stop();assert.equal(first,second);
 const result=await first;assert.equal(result.status,'cancelled');assert.equal(result.stop_verified,true);
 assert.equal(result.output_refreshed,false);assert.equal(result.cleanup_complete,true);assert.equal(result.execution_id,'doc:root:1');
 assert.equal(f.cancelCalls,1);assert.equal(await f.driver.stop(),result);
 assert.deepEqual(f.actions.map(a=>a.verb),['right_click','cancel_process','click']);
});
for(const fault of ['foreign_owner','reused_row','unknown_receipt','replaced_terminal','completed_race'])
 test('stop driver preserves '+fault+' without a second gesture',async()=>{
  const f=await fixture(fault);const first=f.driver.stop();await assert.rejects(first);
  assert.equal(f.driver.stop(),first);await assert.rejects(f.driver.stop());
  assert.equal(f.cancelCalls,['foreign_owner','reused_row'].includes(fault)?0:1);
 });

test('long execution repeats only bounded observations, never launches or stops again',async()=>{
 const {NodeReadinessTimeout}=await import('../lib/node-procedure.mjs');
 // Reuse the native fixture setup and wrap observations after identification.
 const f=await fixture();
 // A separate channel tests the long wait while retaining the identified driver.
 // Expose only this hook from the test fixture, not from the product API.
 let windows=0;const original=f.channel.observe;
 f.channel.observe=async o=>{
  if(o.condition!=='new node execution completed')return original(o);
  windows++;
  if(windows<4)throw new NodeReadinessTimeout(o.condition);
  throw Error('Total execution deadline elapsed');
 };
 await assert.rejects(f.driver.waitCompleted(),/Total execution deadline/);
 assert.equal(windows,4);assert.deepEqual(f.actions,[]);
});

test('long execution does not retry transport failures that resemble observation timeouts',async()=>{
 const f=await fixture();let windows=0;
 f.channel.observe=async()=>{windows++;throw Error('Node procedure readiness timeout: new node execution completed');};
 await assert.rejects(f.driver.waitCompleted(),/readiness timeout/);
 assert.equal(windows,1);assert.deepEqual(f.actions,[]);
});

test('stop cancels its native-owned child while retaining a completed dependency',async()=>{
 const f=await fixture(undefined,true);const result=await f.driver.stop();
 assert.equal(result.status,'cancelled');assert.equal(result.process_record_id,'child');
 assert.equal(f.cancelCalls,1);assert.equal(await f.driver.stop(),result);
});
for(const fault of ['ambiguous_native_owner','missing_native_owner','lost_terminal_owner','completed_race','replaced_terminal'])
 test('multiple-process stop rejects '+fault+' without another gesture',async()=>{
  const f=await fixture(fault,true);await assert.rejects(f.driver.stop());
  await assert.rejects(f.driver.stop());
  assert.equal(f.cancelCalls,['ambiguous_native_owner','missing_native_owner'].includes(fault)?0:1);
 });

test('only a local abort inside the read wait supplies a continuation proof',async()=>{
 const f=await fixture(),controller=new AbortController();
 f.channel.observe=async()=>{controller.abort(Error('local cancel'));throw controller.signal.reason;};
 await assert.rejects(f.driver.waitCompleted({signal:controller.signal}),e=>{
  assert.deepEqual(e.nodeExecutionWaitPause,{execution_id:'doc:root:1',read_only:true,cleanup_complete:true});return true;
 });assert.deepEqual(f.actions,[]);
});
test('a concurrent read failure is not a confirmed local cancellation',async()=>{
 const f=await fixture(),controller=new AbortController();
 f.channel.observe=async()=>{controller.abort(Error('local cancel'));throw Error('browser disconnected');};
 await assert.rejects(f.driver.waitCompleted({signal:controller.signal}),e=>{assert.equal(e.nodeExecutionWaitPause,undefined);return /disconnected/.test(e.message);});
});
test('an abort after the read loop cannot authorize replaying ownership gestures',async()=>{
 const f=await fixture(),controller=new AbortController();
 f.channel.observe=async options=>{
  if(options.condition==='new node execution completed')return {node_processes:{processes:[{process_id:'1',record_id:'group',rendered:true,expanded:true}]}};
  controller.abort(Error('cancel after completion read'));throw controller.signal.reason;
 };
 await assert.rejects(f.driver.waitCompleted({signal:controller.signal}),e=>{assert.equal(e.nodeExecutionWaitPause,undefined);return e===controller.signal.reason;});
});
