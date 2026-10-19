import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeExecutionProcedure} from '../lib/node-execution-procedure.mjs';
import {revealPreparedGraphNode,samePlacementGraph} from '../lib/node-placement.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'node'};

async function execution({fault,offscreen=true,selectedInitially=false}={}) {
 let opened=true,menu=false,selected=selectedInitially,revealed=!offscreen,launchRequest;
 const calls=[],el=(tid,allowed_actions=['click'],extra={})=>({tid,ref:tid,allowed_actions,...extra});
 const state=()=>({prepared_node_context:{...node,node_id:revealed&&fault==='owner'?'foreign':'node',verified:true,surface:'graph',locked:false,tid:'body'},wizard:{status:'absent'},
  node_outputs:{verified:true,node_selected:selected},node_processes:{node_context:{...node,verified:true,surface:'graph'},verified:opened,inventory_complete:true,root_id:'root',show_completed:true,processes:[]},
  ui:{elements:[el('MF;cntMain;tlbMainToolbar;btnProgress'),...(opened?[el('ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click']),el('ConsoleForm;btnClose')]:[]),
   ...(menu?[el('mnContextMenu;mniShowCompletedProcesses',['click','press'])]:[]),
   el('body',['click'],{graph_node:{part:'body'},interaction:{state:revealed?'point_observed':'outside_viewport'},bounding_box:{x:revealed?700:1380,y:228,width:56,height:60}}),
   el('launch',['execute_graph_node'],{graph_execution:{node_id:'node'}})]}});
 const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);return s;},
  revealGraphNode:async()=>{calls.push('reveal');if(fault==='unknown')throw Error('unknown viewport receipt');revealed=true;},
  perform:async o=>{const s=state();assert.ok(o.ready(s));const a=o.resolve(s);calls.push(a.verb+':'+a.ref);
   if(a.verb==='execute_graph_node')launchRequest=o;
   if(a.verb==='right_click')menu=true;if(a.verb==='press')menu=false;
   if(a.ref==='ConsoleForm;btnClose')opened=false;
   if(a.ref==='body'){assert.equal(revealed,true);selected=true;}
   return {status:'SUCCEEDED'};}};
 const driver=createNodeExecutionProcedure(channel,node);await driver.prepare();calls.length=0;
 return {driver,channel,calls,snapshot:state,get launchRequest(){return launchRequest}};
}

test('a node hidden by the retained console is revealed before graph selection and launches once',async()=>{
 const {selectPreparedGraphNode}=await import('../lib/node-graph-selection.mjs');
 const f=await execution({offscreen:true});
 await assert.rejects(selectPreparedGraphNode(f.channel,f.snapshot(),'select after console pin'),/no observed selection point/);
 assert.equal(f.calls.some(call=>call.startsWith('execute_graph_node:')),false);
 await f.channel.revealGraphNode();
 await selectPreparedGraphNode(f.channel,f.snapshot(),'select revealed node after console pin');
 await f.driver.launchGraph();
 assert.equal(f.calls.filter(call=>call==='reveal').length,1);
 assert.equal(f.calls.filter(call=>call.startsWith('execute_graph_node:')).length,1);
});

// ST4b n12: training completed, then two strictly pre-gesture epoch refusals
// preceded a native graph-body redraw. Only graph_execution.node_ref changed.
async function launchRecovery(fault,{code:refusalCode='UI_EPOCH_CHANGED',...receipt}={}) {
 const f=await execution({offscreen:false,selectedInitially:true});await f.driver.launchGraph();
 const workflow={prefix:'MF;TF-1',tab_tid:'tab'},records=[];
 let attempts=0,gestures=0;
 const operation={id:'regression',action:{action_key:'node.apply',revision:'1'},deadline:10000,
  checkpoint:{document_id:'doc',workflow_ref:workflow}};
 const channel=createNodeProcedure({operation,now:()=>1,wait:async()=>{},targetOrigin:'http://example.test',targetBuild:'7.4.2',
  record:async e=>{records.push(e);return structuredClone(e)},wrapMutation:(code,options)=>({options}),
  execute:async code=>{
   if(typeof code==='string') {
    const s=f.snapshot();Object.assign(s,{origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,
     dom_epoch:{document:'doc',revision:attempts+1},scan:{complete:true}});
    Object.assign(s.ui,{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false}});
    const control=s.ui.elements.find(e=>e.tid==='launch');control.ref='ui-launch-'+attempts;
    control.graph_execution={node_id:'node',node_ref:attempts===2?'ui-body-new':'ui-body-old',mode:'execute',source:'native_selected_graph_node'};
    if(attempts===2&&fault==='node')control.graph_execution.node_id='foreign';
    if(attempts===2&&fault==='mode')control.graph_execution.mode='deactivate';
    if(attempts===2&&fault==='source')control.graph_execution.source='foreign';
    return {status:'SUCCEEDED',output:s};
   }
   attempts++;
   if(attempts<3)return {status:'NOT_APPLIED',operation_id:code.options.id,action_key:'ui.act',phase:'preconditions',
    effect_possible:false,cleanup_complete:true,error:{code:refusalCode},trace:[],...receipt};
   gestures++;
   return {status:'SUCCEEDED',operation_id:code.options.id,action_key:'ui.act',cleanup_complete:true,effect_possible:true};
  }});
 return {run:()=>channel.perform({...f.launchRequest,initialObservation:undefined}),records,operation,
  get attempts(){return attempts},get gestures(){return gestures}};
}
for(const code of ['UI_EPOCH_CHANGED','GRAPH_EXECUTION_CONTEXT_CHANGED'])test('regression launch rebinds a redrawn body only after proved no-effect '+code,async()=>{
 const f=await launchRecovery(undefined,{code});await f.run();
 assert.equal(f.attempts,3);assert.equal(f.gestures,1);assert.equal(f.operation.deadline,10000);
 assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,2);
 assert.deepEqual(f.records.filter(e=>e.phase==='node_step_prepared').map(e=>e.action.ref),['ui-launch-0','ui-launch-1','ui-launch-2']);
});
for(const code of ['UI_EPOCH_CHANGED','GRAPH_EXECUTION_CONTEXT_CHANGED'])for(const fault of ['node','mode','source'])test('regression launch refuses a changed '+fault+' after '+code,async()=>{
 const f=await launchRecovery(fault,{code});await assert.rejects(f.run());
 assert.equal(f.attempts,2);assert.equal(f.gestures,0);
});
for(const [name,receipt] of Object.entries({effect:{effect_possible:true},cleanup:{cleanup_complete:false},ambiguous:{status:'AMBIGUOUS'},phase:{phase:'applying'},preconditions:{trace:[{event:'ui_preconditions_verified'}]},gesture:{trace:[{event:'ui_gesture_applied'}]}}))test('graph launch context refresh refuses '+name,async()=>{
 const f=await launchRecovery(undefined,{code:'GRAPH_EXECUTION_CONTEXT_CHANGED',...receipt});await assert.rejects(f.run());
 assert.equal(f.attempts,1);assert.equal(f.gestures,0);
 assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,0);
});
for(const selectedInitially of [false,true])test('offscreen saved node is revealed before selection/launch, selected: '+selectedInitially,async()=>{
 const f=await execution({selectedInitially});await f.driver.launchGraph();
 assert.deepEqual(f.calls,selectedInitially?['reveal','execute_graph_node:launch']:['reveal','click:body','execute_graph_node:launch']);
});
test('visible saved node does not need viewport gestures',async()=>{
 const f=await execution({offscreen:false});await f.driver.launchGraph();assert.deepEqual(f.calls,['click:body','execute_graph_node:launch']);
});
for(const fault of ['owner','unknown'])test('viewport '+fault+' refuses before selecting or executing',async()=>{
 const f=await execution({fault});await assert.rejects(f.driver.launchGraph());assert.deepEqual(f.calls,['reveal']);
});

test('prepared viewport preserves node GUID, settings and complete graph while using existing reveal',async()=>{
 const graph={complete:true,interaction_ready:true,nodes:[{ref:node,type:'transform.sorting',position:{x:936,y:80},locked:false}],links:[]};
 const args={binding:{document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1'},node},deadline:Date.now()+10000};
 let navigations=0;const canvas={count:async()=>1,isVisible:async()=>true},page={locator:()=>canvas};
 const reveal=async o=>{navigations++;assert.equal(o.root,canvas);assert.equal(o.nodeId,'node');assert.deepEqual(o.position,{x:936,y:80});await o.guard();return {fully_visible:true,zoom_steps:2,outline_closed:true};};
 const r=await revealPreparedGraphNode(page,args,async()=>structuredClone(graph),reveal,()=>{},()=>{},samePlacementGraph);
 assert.equal(r.graph_unchanged,true);assert.equal(r.settings_applied,false);assert.equal(r.cleanup_complete,true);assert.deepEqual(r.node,node);assert.equal(navigations,1);
 for(const fault of ['foreign','missing','locked','changed','not_visible','deadline']) {
  let reads=0,calls=0;
  const read=async()=>{const g=structuredClone(graph);reads++;
   if(fault==='foreign')g.nodes[0].ref.document_id='other';if(fault==='missing')g.nodes=[];
   if(fault==='locked')g.interaction_ready=false;if(fault==='changed'&&reads>1)g.nodes[0].position.x++;
   return g;};
  const navigate=async o=>{calls++;await o.guard();return {fully_visible:fault!=='not_visible',zoom_steps:1};};
  await assert.rejects(revealPreparedGraphNode(page,{...args,deadline:fault==='deadline'?0:args.deadline},read,navigate,()=>{},()=>{},samePlacementGraph),/Prepared node viewport/);
  if(['foreign','missing','locked','deadline'].includes(fault))assert.equal(calls,0);
 }
});

test('actual serialized viewport step returns a valid durable capability receipt',async()=>{
 const {createNodeProcedure}=await import('../lib/node-procedure.mjs');
 const {assertActionOutcome}=await import('../lib/action-catalog.mjs');
 const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const graph={complete:true,interaction_ready:true,nodes:[{ref:node,locked:false,position:{x:200,y:200}}],links:[]};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:{...node,verified:true,surface:'graph',locked:false},wizard:{status:'absent'},ui:{elements:[],dialogs:[],masks:[],truncated:{elements:false,dialogs:false,masks:false}}};
 const events=[],page={evaluate:async()=>structuredClone(graph),locator:()=>({count:async()=>1,isVisible:async()=>true,
  evaluate:async()=>({x:0,y:0,width:1280,height:800,viewportWidth:1280,viewportHeight:800,scale:1,translate:{x:0,y:0},scroll:{x:0,y:0},node_bounds:{x:200,y:200,width:70,height:80}})})};
 const operation={id:'read',action:{action_key:'node.read',revision:'1'},deadline:Date.now()+10000};
 const channel=createNodeProcedure({operation,preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},targetOrigin:'http://example.test',targetBuild:'7.4.2',
  record:async e=>{events.push(e);return e;},wrapMutation:(code,options)=>({code,options}),
  execute:async code=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(state)};
   assert.equal(events.at(-1).phase,'node_step_prepared');
   return assertActionOutcome(await Function('return ('+code.code+')')()(page));
  }});
 const result=await channel.revealGraphNode();assert.equal(result.action_key,'node.viewport.reveal.internal');
 assert.equal(result.output.fully_visible,true);assert.equal(operation.cleanupConfirmed,true);
 assert.equal(events.at(-1).phase,'node_step_completed');assert.deepEqual(events.at(-1).outcome,result);
 await assert.rejects(channel.act({verb:'click',ref:'old'}),/fresh internal observation/);
});
