import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mutateGraph} from '../lib/node-target-browser.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';
import {verifyNodeTargetEffect} from '../lib/node-target.mjs';

function fixture(kind,fault) {
 const prefix='MF;TF',tid=prefix+';Graph;Sort',ref={document_id:'doc',workflow_id:'flow',node_id:'node'};
 const workflow_ref={workflow_id:'flow',prefix,tab_tid:'tab'};
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref,dom_epoch:1,
  nodes:[{ref,type:'transform.sorting',label:'Sort',dom_epoch:2,position:{x:936,y:80},locked:false,inputs:[0],outputs:[0]}],links:[],foreign_links:[]};
 const before=structuredClone(graph),order=[];let revealed=false,held=false,edited='';
 const canvas={scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({x:0,y:50,width:1280,height:750,right:1280,bottom:800}),contains:e=>e===canvas||e===body||e===label,closest:()=>null};
 const body={parent:canvas,getAttribute:()=>tid,getBoundingClientRect:()=>({x:revealed?700:1380,y:200,width:56,height:60}),contains:e=>e===body||e===label};
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
  const element=selector.includes('Label;Label')?label:selector.includes(';Graph;Sort')?body:canvas;
  return {locator,count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,evaluate:async(fn,arg)=>evaluate(fn,element,arg),
   dblclick:async()=>{assert.ok(revealed);order.push('rename');},click:async()=>{},press:async key=>{
    if(key==='Enter'){graph.nodes[0].label=edited;graph.nodes[0].dom_epoch++;}
   }};
 };
 const page={locator,evaluate:async(fn,arg)=>evaluate(fn,arg),waitForTimeout:async()=>{},keyboard:{type:async text=>{edited=text;},press:async()=>{}},mouse:{
  click:async()=>{},move:async()=>{},down:async()=>{assert.ok(revealed);order.push('move');held=true;},up:async()=>{if(held){graph.nodes[0].position={x:648,y:400};graph.nodes[0].dom_epoch++;held=false;}}
 }};
 const reveal=async args=>{
  order.push('reveal');assert.equal(args.nodeId,'node');assert.deepEqual(args.position,{x:936,y:80});
  revealed=true;view.scale=.75;graph.nodes[0].dom_epoch++;
  if(fault==='unknown'){const e=Error('Lost viewport reply');e.placement_navigation_unverified=true;throw e;}
  if(fault==='foreign')graph.nodes[0].ref.node_id='foreign';
  await args.guard();return {fully_visible:fault!=='not_visible',zoom_steps:2,outline_closed:true};
 };
 const effect={id:'effect',kind,before,parameters:{ref,...(kind==='rename'?{label:'Debt descending'}:{position:{x:648,y:400}})}};
 return {order,effect,run:()=>mutateGraph(page,{effect,request:{document_id:'doc',workflow_ref},deadline:Date.now()+15000},async()=>structuredClone(graph),null,null,null,reveal,samePlacementGraph)};
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
