import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mutateGraph} from '../lib/node-target-browser.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';
import {verifyNodeTargetEffect} from '../lib/node-target.mjs';

function fixture(kind,fault,{javascript=false}={}) {
 const prefix='MF;TF',tid=prefix+';Graph;Sort',ref={document_id:'doc',workflow_id:'flow',node_id:'node'};
 const workflow_ref={workflow_id:'flow',prefix,tab_tid:'tab'};
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref,dom_epoch:1,
  nodes:[{ref,type:javascript?'programming.javascript':'transform.sorting',label:'Sort',dom_epoch:2,position:{x:936,y:80},locked:false,inputs:[0],outputs:[0],other_ports:['Input_Add']}],links:[],foreign_links:[]};
 const before=structuredClone(graph),order=[];let revealed=false,held=false,edited='',deselected=false,readsAfterDeselect=0,clicks=0,ups=0,currentTid=tid;
 const canvas={scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({x:0,y:50,width:1280,height:750,right:1280,bottom:800}),contains:e=>e===canvas||e===body||e===label,closest:()=>null};
 let body={parent:canvas,getAttribute:()=>currentTid,getBoundingClientRect:()=>({x:revealed?700:1380,y:200,width:56,height:60}),contains:e=>e===body||e===label};
 const label={parent:body,getAttribute:()=>tid+';Label;Label',getBoundingClientRect:()=>({x:revealed?690:1370,y:175,width:80,height:20}),contains:e=>e===label};
 const tab={classList:{contains:()=>true}},document={querySelectorAll:q=>q==='[data-tid="tab"]'?[tab]:q==='[data-tid="'+prefix+';ModelForm;cmpDiagram"]'?[canvas]:[],elementFromPoint:(x,y)=>{
  for(const e of [label,body]){const b=e.getBoundingClientRect();if(x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height&&x<1280)return e;}return x<1280&&y<800?canvas:null;
 }};
 const nativeNode={FGuid:'node',FCell:{}},view={scale:1,getState:()=>({shape:{node:body}})};
 const controller={FController:{FInitialScale:1,FDiagram:{FNodes:{FCollection:[nativeNode]},FmxGraph:{view,getSelectionCells:()=>[]}}}};
 const app={Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}};
 const context={innerWidth:1280,innerHeight:800,document,__loginomDockPreparationV1:{document,id:'doc',receipts:new Map([['prepare',{phase:'verified',workflowId:'flow',tab}]]),nodeTargetDomEpochs:{objects:new Map([[canvas,1]])}},
  bg:{app}};
 const evaluate=(fn,...args)=>runInNewContext('('+fn.toString()+')',context)(...args);
 const locator=selector=>{
  const element=selector.includes('Label;Label')?label:selector.includes(';Graph;')?body:canvas;
  return {locator,count:async()=>selector.includes(';Graph;')&&!selector.includes(currentTid)?0:1,isVisible:async()=>true,isEnabled:async()=>true,evaluate:async(fn,arg)=>evaluate(fn,element,arg),
   dblclick:async()=>{assert.ok(revealed);order.push('rename');},click:async()=>{},press:async key=>{
    if(key==='Enter'){graph.nodes[0].label=edited;graph.nodes[0].dom_epoch++;}
   }};
 };
 const page={locator,evaluate:async(fn,arg)=>evaluate(fn,arg),waitForTimeout:async()=>{},keyboard:{type:async text=>{edited=text;},press:async()=>{}},mouse:{
  click:async()=>{
   clicks++;deselected=true;
   if(fault){graph.nodes[0].dom_epoch++;body={...body};currentTid=tid+'_Redrawn';}
   if(fault==='lost_click')throw Error('Lost deselection reply');
   if(fault==='guid')graph.nodes[0].ref.node_id='foreign';
   if(fault==='root')graph.dom_epoch++;
   if(fault==='position')graph.nodes[0].position.x++;
   if(fault==='label')graph.nodes[0].label='Foreign';
   if(fault==='locked')graph.nodes[0].locked=true;
   if(fault==='data_port')graph.nodes[0].outputs.push(1);
   if(fault==='service_port')graph.nodes[0].other_ports.push('Output_Add');
   if(fault==='link')graph.links.push({source:'node',output:0,target:'other',input:0});
   if(fault==='other_node')graph.nodes[1].dom_epoch++;
   if(fault==='epoch_decreased')graph.nodes[0].dom_epoch=1;
   if(fault==='epoch_missing')delete graph.nodes[0].dom_epoch;
   if(fault?.startsWith('batch')){
    const latest=Math.max(...graph.nodes.map(n=>n.dom_epoch));
    graph.nodes.forEach((n,i)=>{n.dom_epoch=latest+i+1;});
    if(fault==='batch_position')graph.nodes[1].position.x++;
    if(fault==='batch_port')graph.nodes[1].outputs.push(1);
    if(fault==='batch_type')graph.nodes[1].type='foreign';
    if(fault==='batch_root')graph.dom_epoch++;
    if(fault==='batch_link')graph.links.push({source:'node',output:0,target:'other',input:0});
    if(fault==='batch_stale_epoch')graph.nodes[1].dom_epoch=9;
    if(fault==='batch_busy')graph.interaction_ready=false;
   }
  },move:async()=>{},down:async()=>{assert.ok(revealed);order.push('move');held=true;},up:async()=>{ups++;if(held){graph.nodes[0].position={x:648,y:400};graph.nodes[0].dom_epoch++;held=false;if(fault==='lost_drag')throw Error('Lost drag reply');}}
 }};
 const reveal=async args=>{
  order.push('reveal');assert.equal(args.nodeId,'node');assert.deepEqual(args.position,{x:936,y:80});
  revealed=true;view.scale=.75;graph.nodes[0].dom_epoch++;
  if(fault==='unknown'){const e=Error('Lost viewport reply');e.placement_navigation_unverified=true;throw e;}
  if(fault==='foreign')graph.nodes[0].ref.node_id='foreign';
  await args.guard();return {fully_visible:fault!=='not_visible',zoom_steps:2,outline_closed:true};
 };
 const effect={id:'effect',kind,before,parameters:{ref,...(kind==='rename'?{label:'Debt descending'}:{position:{x:648,y:400}})}};
 if(fault==='other_node'||fault?.startsWith('batch')){
  graph.nodes.push({...structuredClone(graph.nodes[0]),ref:{...ref,node_id:'other'},dom_epoch:10});
  before.nodes=structuredClone(graph.nodes);
 }
 return {order,effect,counts:()=>({clicks,ups}),run:()=>mutateGraph(page,{effect,request:{document_id:'doc',workflow_ref},deadline:Date.now()+15000},async()=>{
  if(deselected&&++readsAfterDeselect===2){
   if(fault==='unstable')graph.nodes[0].dom_epoch++;
   if(fault==='batch_unstable')graph.nodes[1].dom_epoch++;
  }
  if(deselected&&readsAfterDeselect===3&&fault==='before_drag')graph.nodes[0].label='Changed before drag';
  return structuredClone(graph);
 },null,null,null,reveal,samePlacementGraph)};
}
for(const kind of ['rename','move'])test('target '+kind+' reveals its exact offscreen node and rebinds only drawing epochs',async()=>{
 const f=fixture(kind),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);
 assert.deepEqual(f.order,['reveal',kind]);assert.ok(verifyNodeTargetEffect(f.effect,r.after,(n,p)=>n.position.x===p.x&&n.position.y===p.y));
 assert.equal(r.placement_navigation.fully_visible,true);assert.equal(r.cleanup_complete,true);
});
for(const kind of ['rename','move'])for(const fault of ['unknown','foreign','not_visible'])test('target '+kind+' refuses '+fault+' viewport before its node gesture',async()=>{
 const f=fixture(kind,fault),r=await f.run();assert.notEqual(r.status,'SUCCEEDED');assert.deepEqual(f.order,['reveal']);
 if(fault==='unknown'){assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);}
});

for(const fault of [undefined,'redraw'])test('existing JavaScript move performs one drag after deselection '+(fault??'without redraw'),async()=>{
 const f=fixture('move',fault,{javascript:true}),r=await f.run();
 assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.cleanup_complete,true);
 assert.deepEqual(f.order,['reveal','move']);assert.deepEqual(f.counts(),{clicks:1,ups:1});
 assert.ok(verifyNodeTargetEffect(f.effect,r.after,(n,p)=>n.position.x===p.x&&n.position.y===p.y));
});
for(const fault of ['guid','root','position','label','locked','data_port','service_port','link','other_node','epoch_decreased','epoch_missing','unstable','before_drag','lost_click'])test('existing JavaScript move refuses deselection '+fault+' without dragging',async()=>{
 const f=fixture('move',fault,{javascript:true}),r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.deepEqual(f.order,['reveal']);
 assert.deepEqual(f.counts(),{clicks:1,ups:0});
});
test('sorting move still refuses a changed drawing epoch after deselection',async()=>{
 const f=fixture('move','redraw'),r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.deepEqual(f.order,['reveal']);assert.deepEqual(f.counts(),{clicks:1,ups:0});
});
test('existing JavaScript move never repeats a drag with a lost reply',async()=>{
 const f=fixture('move','lost_drag',{javascript:true}),r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.deepEqual(f.order,['reveal','move']);
 assert.deepEqual(f.counts(),{clicks:1,ups:2});assert.equal(r.effect_possible,true);assert.match(r.error,/Lost drag reply/);
});

// Live mas3 receipt: deselection replaced six visible SVGs while the entire
// logical graph and root stayed identical. All new epochs follow the old max.
test('existing JavaScript move survives a stable visible-batch SVG redraw with one drag',async()=>{
 const f=fixture('move','batch',{javascript:true}),r=await f.run();
 assert.equal(r.status,'SUCCEEDED',r.error);assert.deepEqual(f.order,['reveal','move']);
 assert.deepEqual(f.counts(),{clicks:1,ups:1});assert.equal(r.cleanup_complete,true);
 assert.ok(verifyNodeTargetEffect(f.effect,r.after,(n,p)=>n.position.x===p.x&&n.position.y===p.y));
});
for(const fault of ['batch_position','batch_port','batch_type','batch_root','batch_link','batch_stale_epoch','batch_busy','batch_unstable'])test('existing JavaScript batch redraw still refuses '+fault+' before drag',async()=>{
 const f=fixture('move',fault,{javascript:true}),r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.deepEqual(f.order,['reveal']);
 assert.deepEqual(f.counts(),{clicks:1,ups:0});assert.equal(r.effect_possible,true);
});
test('existing JavaScript deselection failure includes a bounded field diagnostic',async()=>{
 const f=fixture('move','root',{javascript:true}),r=await f.run();
 assert.match(r.error,/Graph changed while deselecting:/);
 const d=JSON.parse(r.error.slice(r.error.indexOf(': ')+2));
 assert.ok(d.differences.some(x=>x.path==='$.dom_epoch'&&x.expected===1&&x.observed===2));
 assert.ok(d.differences.length<=32);assert.equal(d.truncated,false);
 assert.deepEqual(f.counts(),{clicks:1,ups:0});
});
