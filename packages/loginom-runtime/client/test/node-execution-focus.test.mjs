import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeExecutionProcedure,trainConfiguredNode} from '../lib/node-execution-procedure.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
const button='MF;cntMain;tlbMainToolbar;btnProgress',grid='ConsoleForm;ProgressForm;trpProgress;grd;tbl';
async function fixture({hide=true,replace=false,lost=false,failure=false,closeFault=false,failedChild=false,
 training=false,trainUnknown=false,verifyFailedChild=false,ownerNode='node',childState='failed',showMismatch=false,changedError=false,replaceAtMenu=false,deadlineFault=false,cachedGroup=false,groupFault}={}){
 let opened=true,launched=false,selected=false,menu=false,shown=false,trainMenu=false,groupVisible=!cachedGroup,groupExpanded=!cachedGroup;
 const observations=[],actions=[],el=(tid,allowed_actions=['click'])=>({tid,ref:tid,allowed_actions});
 const state=()=>({prepared_node_context:{...node,...(showMismatch&&shown?{node_id:'foreign'}:{}),verified:true,surface:'graph',tid:'graph-node'},wizard:{status:'absent'},navigation_context:{status:'observed'},
  node_outputs:{verified:true,node_selected:shown},
  node_processes:{verified:opened,inventory_complete:true,show_completed:true,root_id:groupVisible&&groupFault==='root'?'foreign':'root',node_context:{...node,verified:true,surface:'graph'},processes:launched?[
   {process_id:'1',record_id:groupVisible&&groupFault==='record'?'foreign':'group',parent_id:null,state:failure?'pending_or_failed':'completed',error:failure,children_loaded:true,expanded:groupVisible?groupExpanded:null,rendered:true,process_tid:'group-row',expander_tid:groupVisible?'group-expander':null,...(failure?{error_details:'Missing own CSV',progress_state:{verified:true,state:'failed',terminal:true,can_cancel:false,source:'native_progress_record'}}:{})},
   {process_id:'1.1',record_id:replace&&shown||replaceAtMenu&&menu&&selected?'replaced':'child',parent_id:'1',state:'completed',error:false,rendered:true,selected,process_tid:'child-row',
    ...(failedChild?{state:'pending_or_failed',error:true,error_details:changedError&&shown?'Changed child error':'Own JS sentinel error',
      progress_state:{verified:true,state:childState,terminal:true,can_cancel:false,source:'native_progress_record'},
      owner:{verified:true,node_id:ownerNode,source:'native_process_model_identity'}}:{})}]:[]},
  ui:{elements:[el(button),{...el('graph-node',['right_click']),graph_node:{part:'body'}},{...el('graph-node;Label;Label',['right_click']),graph_node:{part:'label'}},...(trainMenu?[{...el('mn;mniTrain'),label:'Обучить узел'}]:[]),...(opened?[el(grid,['right_click']),el('ConsoleForm;btnClose'),...(!cachedGroup||groupVisible?[el('child-row',['right_click'])]:[]),...(cachedGroup?[{...el('ConsoleForm;ProgressForm;trpProgress;treepanel;tree',['scroll']),process_grid:{grid_id:'tree'},scroll:{ref:'ConsoleForm;ProgressForm;trpProgress;treepanel;tree',top:groupVisible?96:0,max_top:96}},...(groupVisible?[el('group-row'),el('group-expander')]:[])]:[])]:[]),
   ...(menu?[el('mnContextMenu;mniShowCompletedProcesses',['click','press']),el('mnContextMenu;mniShowNodeToProcess',['show_process_node'])]:[])]}});
 const channel={observe:async o=>{observations.push(o);if(deadlineFault&&o.condition==='new process selects the prepared graph node')throw Error('Original deadline expired');
  const s=state();assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
  const s=state();assert.ok(o.ready(s));o.identity(s);const a=o.resolve(s);actions.push(a);
  if(a.verb==='scroll'){if(groupFault==='unknown')throw Error('Unknown scroll reply');groupVisible=true;}
  if(a.ref==='group-expander')groupExpanded=true;
  if(a.ref==='graph-node')trainMenu=true;
  if(a.ref==='mn;mniTrain'){trainMenu=false;launched=true;if(trainUnknown)throw Error('Unknown training reply');}
  if(a.verb==='right_click'){menu=true;if(a.ref==='child-row')selected=true;}
  if(a.verb==='press')menu=false;
  if(a.verb==='show_process_node'){shown=true;opened=!hide;menu=false;if(lost)throw Error('lost Show reply');}
  if(a.ref===button)opened=true;
  if(a.ref==='ConsoleForm;btnClose'){opened=false;if(launched&&closeFault)throw Error('Lost cleanup reply');}
  return {status:'SUCCEEDED'};
 }};
 if(training)return {actions,run:()=>trainConfiguredNode(channel,node)};
 const driver=createNodeExecutionProcedure(channel,node,{verifyFailedChild});await driver.prepare();launched=true;await driver.identify();actions.length=0;
 return {driver,actions,observations};
}
for(const hide of [false,true])test('completion verifies the same process after Show Node, hidden console: '+hide,async()=>{
 const f=await fixture({hide}),r=await f.driver.waitCompleted();assert.equal(r.execution_id,'doc:root:1');assert.equal(r.owner_verified,true);
 assert.equal(f.actions.filter(a=>a.ref===button).length,hide?1:0);
 assert.equal(f.actions.filter(a=>a.verb==='show_process_node').length,1);
 assert.equal(f.actions.some(a=>a.verb==='execute_graph_node'),false);
});
test('reopening cannot accept a replaced execution child',async()=>{
 const f=await fixture({replace:true});await assert.rejects(f.driver.waitCompleted(),/selected requested node process/);
 assert.equal(f.actions.filter(a=>a.ref===button).length,1);
});
test('unknown Show result never triggers another gesture',async()=>{
 const f=await fixture({lost:true});await assert.rejects(f.driver.waitCompleted(),/lost Show reply/);
 assert.deepEqual(f.actions.map(a=>a.verb),['right_click','show_process_node']);
});

test('long completed history refreshes before baseline and retains every server process',async()=>{
 let opened=true,checked=true,menu=false,generation=0;
 const old=Array.from({length:30},(_,i)=>({process_id:String(i+1),parent_id:null,caption:'Activation',state:'completed',error:false}));
 const actions=[],el=(tid,allowed_actions=['click'])=>({tid,ref:tid,allowed_actions});
 const state=()=>({prepared_node_context:{...node,verified:true},node_processes:{verified:true,inventory_complete:true,show_completed:checked,root_id:'root-'+generation,node_context:{...node,verified:true},processes:checked?old.map((p,i)=>({...p,record_id:generation+':'+i})):[]},ui:{elements:[el(button),...(opened?[el(grid,['right_click']),el('ConsoleForm;btnClose')]:[]),...(menu?[el('mnContextMenu;mniShowCompletedProcesses',['click','press'])]:[])]}});
 const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{const s=state();assert.ok(o.ready(s));const a=o.resolve(s);actions.push(a);if(a.verb==='right_click')menu=true;if(a.ref==='mnContextMenu;mniShowCompletedProcesses'){assert.equal(a.verb,'click');checked=!checked;menu=false;generation++;}if(a.ref==='ConsoleForm;btnClose')opened=false;}};
 const driver=createNodeExecutionProcedure(channel,node),baseline=await driver.prepare();
 assert.equal(baseline.root_id,'root-2');assert.equal(baseline.roots.length,30);
 assert.ok(baseline.roots.every(p=>p.record_id.startsWith('2:')));
 assert.equal(actions.filter(a=>a.ref==='mnContextMenu;mniShowCompletedProcesses').length,2);
 assert.equal(actions.some(a=>a.verb==='execute_graph_node'),false);
});

for(const closeFault of [false,true])test('failed group cleans only its console and preserves uncertain cleanup: '+closeFault,async()=>{
 const f=await fixture({failure:true,closeFault});
 if(closeFault)await assert.rejects(f.driver.waitCompleted(),/Lost cleanup reply/);
 else {const r=await f.driver.waitCompleted();assert.equal(r.status,'failed');assert.equal(r.cleanup_complete,true);assert.equal(r.error.message,'Missing own CSV');assert.equal(r.owner_verified,undefined);}
 assert.deepEqual(f.actions.map(a=>a.ref),['ConsoleForm;btnClose']);
});

for(const hide of [false,true])test('opt-in failed child uses one Show Node and preserves console cleanup, hidden: '+hide,async()=>{
 const f=await fixture({failure:true,failedChild:true,verifyFailedChild:true,hide}),r=await f.driver.waitCompleted();
 assert.equal(r.status,'failed');assert.equal(r.owner_verified,true);assert.equal(r.error.message,'Own JS sentinel error');
 assert.equal(r.process_id,'1.1');assert.equal(r.cleanup_complete,true);
 assert.equal(f.actions.filter(a=>a.verb==='show_process_node').length,1);
 assert.equal(f.actions.filter(a=>a.ref==='ConsoleForm;btnClose').length,1);
 assert.equal(f.actions.some(a=>a.verb==='execute_graph_node'),false);
});

for(const [name,options] of Object.entries({upstream:{failedChild:false},single_foreign:{ownerNode:'foreign'},
 parent_failed:{childState:'parent_failed'},replaced_before_show:{replaceAtMenu:true},replaced_after_show:{replace:true},
 changed_error:{changedError:true},show_mismatch:{showMismatch:true},lost_show:{lost:true},deadline:{deadlineFault:true},
 lost_cleanup:{closeFault:true}}))test('opt-in failed child refuses '+name+' without executing or replaying Show Node',async()=>{
 const f=await fixture({failure:true,failedChild:true,verifyFailedChild:true,...options});
 await assert.rejects(f.driver.waitCompleted());
 assert.equal(f.actions.some(a=>a.verb==='execute_graph_node'),false);
 const shows=f.actions.filter(a=>a.verb==='show_process_node').length;assert.ok(shows<=1);
 const actions=f.actions.length;await assert.rejects(f.driver.waitCompleted());assert.equal(f.actions.length,actions);
});

for(const trainUnknown of [false,true])test('native training settles its owned process or stops after an unknown reply: '+trainUnknown,async()=>{
 const f=await fixture({training:true,trainUnknown});
 if(trainUnknown)await assert.rejects(f.run(),/Unknown training reply/);
 else {const result=await f.run();assert.equal(result.status,'trained');assert.deepEqual(result.node,node);assert.equal(result.execution_id,'doc:root:1');}
 assert.equal(f.actions.filter(a=>a.ref==='mn;mniTrain').length,1);
 assert.equal(f.actions.filter(a=>a.ref==='graph-node;Label;Label').length,0,'label context menu cannot train a node');
 assert.equal(f.actions.some(a=>a.verb==='execute_graph_node'),false);
});

// LAB-109 s3: process 15 / record 3400 has matching cached split-grid cells,
// rendered=true, loaded=true, but no visible row or annotated expander.
test('cached rendered execution group is scrolled into view before its expander is required',async()=>{
 const f=await fixture({cachedGroup:true}),r=await f.driver.waitCompleted();
 assert.equal(r.owner_verified,true);assert.equal(r.cleanup_complete,true);
 assert.equal(f.actions.filter(a=>a.verb==='scroll').length,1);
 assert.equal(f.actions.filter(a=>a.ref==='group-expander').length,1);
 assert.equal(f.actions.findIndex(a=>a.verb==='scroll')<f.actions.findIndex(a=>a.ref==='group-expander'),true);
 assert.equal(f.actions.some(a=>a.verb==='execute_graph_node'),false);
});
for(const groupFault of ['root','record','unknown'])test('cached group reveal refuses '+groupFault+' without expansion or launch replay',async()=>{
 const f=await fixture({cachedGroup:true,groupFault});await assert.rejects(f.driver.waitCompleted());
 assert.equal(f.actions.filter(a=>a.verb==='scroll').length,1);
 assert.equal(f.actions.some(a=>a.ref==='group-expander'||a.verb==='execute_graph_node'||a.verb==='show_process_node'),false);
});

for(const hide of [false,true])test('console consumers obtain one fresh inventory without a discarded visibility read: '+hide,async()=>{
 const f=await fixture({hide});await f.driver.waitCompleted();
 assert.equal(f.observations.filter(o=>o.condition==='process console visible').length,0,
  'prepare, identify and Show Node must use their consumer read as the inventory refresh');
 for(const condition of ['process console menu settled','one new node execution group','new process selects the prepared graph node']) {
  const reads=f.observations.filter(o=>o.condition===condition);assert.equal(reads.length,1);
  assert.equal(reads[0].readProcesses,true,'control-only visibility cannot replace inventory');
  assert.equal(reads[0].ready({ui:{elements:[]}}),false,'native cache alone cannot prove a visible console');
 }
 const menu=f.observations.find(o=>o.condition==='process console menu settled');
 assert.equal(typeof menu.confirmIdentity,'function','the two matching menu samples remain required');
 assert.equal(f.actions.filter(a=>a.verb==='show_process_node').length,1);
});
