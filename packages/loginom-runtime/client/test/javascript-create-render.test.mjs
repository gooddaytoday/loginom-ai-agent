import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {mutateGraph} from '../lib/node-target-browser.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';

function fixture(t, fault, addOnly=false) {
 t.mock.timers.enable({apis:['Date'],now:10000});
 const prefix='MF;TF-1',rootTid=prefix+';ModelForm;cmpDiagram',tabTid='tab';
 const palette=prefix+';ModelForm;colVendors_Компоненты>Программирование>JavaScript;TreeText';
 let created=false,held=false,drags=0,reads=0;
 const rect={x:300,y:100,width:1000,height:700,right:1300,bottom:800};
 const canvas={getBoundingClientRect:()=>rect,contains:e=>e===canvas};
 const item={getBoundingClientRect:()=>({x:50,y:200,width:100,height:20}),contains:e=>e===item};
 const tab={classList:{contains:()=>true}},elements=new Map([[rootTid,canvas],[palette,item],[tabTid,tab]]);
 const document={querySelectorAll:q=>{const e=elements.get(JSON.parse(q.slice(10,-1)));return e?[e]:[];},elementFromPoint:x=>x<300?item:canvas};
 const before={complete:true,document_id:'doc',workflow_ref:{workflow_id:'wf',prefix,tab_tid:tabTid},dom_epoch:1,interaction_ready:true,nodes:[],links:[],foreign_links:[]};
 const native={FGuid:'new-js',FIconCls:NODE_TYPES['programming.javascript'].icon_class};
 const globals={document,innerWidth:1400,innerHeight:900,__loginomDockPreparationV1:{document,id:'doc',receipts:new Map([['r',{phase:'verified',workflowId:'wf',tab}]]),nodeTargetDomEpochs:{objects:new Map([[canvas,1]])}},
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:{FNodes:{FCollection:created?[native]:[]}}}}})}}}}}}}};
 const evaluate=(fn,args,element)=>runInNewContext('('+fn.toString()+')',globals)(...(element?[element,args]:[args]));
 const page={evaluate:async(fn,args)=>evaluate(fn,args),waitForTimeout:async ms=>{
  t.mock.timers.tick(ms);
  // Cancel during port settlement follows the drop; cancel_before lands on the first pre-gesture wait.
  if(fault==='cancel'&&created||fault==='cancel_before'&&!created)page[Symbol.for('loginom-dock.node-target-cancel')]=new Set(['effect']);
 },locator:selector=>{
  const element=elements.get(JSON.parse(selector.slice(10,-1)));
  return {count:async()=>element?1:0,isVisible:async()=>true,isEnabled:async()=>true,boundingBox:async()=>rect,evaluate:async(fn,args)=>evaluate(fn,args,element)};
 },mouse:{move:async()=>{},down:async()=>{held=true;drags++;},up:async()=>{if(held)created=true;held=false;}},keyboard:{press:async()=>{}}};
 page.evaluateHandle=async()=>({dispose:async()=>{}});
 const task={deadline:40000,request:{document_id:'doc',workflow_ref:before.workflow_ref},types:NODE_TYPES,effect:{id:'effect',kind:'create',before,parameters:{type:'programming.javascript',position:{x:600,y:380},...(addOnly?{add_only:true}:{})}}};
 const read=async()=>{
  if(!created)return structuredClone(before);
  reads++;
  if(fault==='mask' && reads===1 || fault==='persistent_mask')throw Error('page.evaluate: Error: Graph is blocked');
  if(fault==='foreign_type')throw Error('JavaScript data port has a foreign native type');
  if(fault==='foreign_owner')native.FIconCls=NODE_TYPES['transform.sorting'].icon_class;
  if(fault==='changed_owner' && reads>1)native.FGuid='other-js';
  if(Date.now()<26000 || fault==='deadline' || fault==='cancel')throw Error('page.evaluate: Error: Visible port identity is not rendered');
  return {...before,nodes:[{ref:{node_id:native.FGuid},type:'programming.javascript',position:{x:600,y:380}}]};
 };
 const reveal=async args=>{await args.guard();return {fully_visible:fault!=='hidden',point:{x:900,y:480}};};
 const window={
  settle:async(_page,_binding,{onOwnedWindow})=>{
   if(fault==='owned_window')onOwnedWindow?.();
   if(fault==='foreign_window'||fault==='owned_window')throw Error('Native window did not settle');
   t.mock.timers.tick(16000);
   const graph=await read();
   if(fault==='wrong_type')graph.nodes[0].type='transform.sorting';
   return graph;
  },
 };
 return {run:()=>mutateGraph(page,task,read,null,null,null,reveal,samePlacementGraph,undefined,undefined,window),counts:()=>({drags,reads}),now:()=>Date.now()};
}
test('one JavaScript create waits read-only past 15s for its port under the original deadline',async t=>{
 const f=fixture(t),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);
 assert.equal(r.after.nodes[0].ref.node_id,'new-js');assert.equal(f.counts().drags,1);assert.ok(f.now()>=26000&&f.now()<40000);assert.equal(r.cleanup_complete,true);
});
test('the existing short loading-mask wait can precede JavaScript port settlement',async t=>{
 const f=fixture(t,'mask'),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(f.counts().drags,1);assert.ok(f.now()>=26000);
});
for(const fault of ['foreign_type','foreign_owner','changed_owner','deadline','cancel','persistent_mask'])test('JavaScript port settlement preserves possible effect on '+fault,async t=>{
 const f=fixture(t,fault),r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(f.counts().drags,1);assert.equal(r.cleanup_complete,true);
 if(fault==='foreign_type')assert.match(r.error,/foreign native type/);
 if(fault.endsWith('owner'))assert.match(r.error,/owner changed/);
 if(fault==='deadline')assert.equal(f.now(),40000);
 if(fault==='cancel')assert.match(r.error,/cancelled/);
 if(fault==='persistent_mask'){assert.match(r.error,/Graph is blocked/);assert.ok(f.now()>=25000&&f.now()<26000);}
});
test('JavaScript create cancelled before the gesture has no possible effect',async t=>{
 const f=fixture(t,'cancel_before'),r=await f.run();assert.equal(r.status,'NOT_APPLIED',r.error);assert.equal(r.effect_possible,false);
 assert.equal(f.counts().drags,0);assert.equal(r.cleanup_complete,true);assert.match(r.error,/cancelled/);assert.equal(r.after,undefined);
});

for(const [fault,cleanup,dispatched,error] of [
 ['foreign_window',true,true,/window did not settle/],
 ['owned_window',false,true,/window did not settle/],
 ['wrong_type',true,true,/type mismatch/],
 ['hidden',true,true,/not fully visible/],
 ['cancel_before',true,false,/cancelled/],
])test('add_only native cleanup receipt: '+fault,async t=>{
 const f=fixture(t,fault,true),reply=await f.run();
 assert.equal(reply.status,dispatched?'AMBIGUOUS':'NOT_APPLIED',reply.error);
 assert.equal(reply.effect_possible,dispatched);
 assert.equal(reply.cleanup_complete,cleanup);
 assert.equal(reply.add_only_window_pending,cleanup?undefined:true);
 assert.equal(f.counts().drags,Number(dispatched));
 assert.match(reply.error,error);
});
