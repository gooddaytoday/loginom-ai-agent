import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeExecutionProcedure} from '../lib/node-execution-procedure.mjs';
import {revealPreparedGraphNode} from '../lib/node-viewport.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'node'};

async function execution({fault,offscreen=true,selectedInitially=false}={}) {
 let opened=true,menu=false,selected=selectedInitially,revealed=!offscreen;
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
   if(a.verb==='right_click')menu=true;if(a.verb==='press')menu=false;
   if(a.ref==='ConsoleForm;btnClose')opened=false;
   if(a.ref==='body'){assert.equal(revealed,true);selected=true;}
   return {status:'SUCCEEDED'};}};
 const driver=createNodeExecutionProcedure(channel,node);await driver.prepare();calls.length=0;
 return {driver,calls};
}
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
