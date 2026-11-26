import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {createNodeTargetBrowserAdapter,mutateGraph,readGraph} from '../lib/node-target-browser.mjs';
import {bindAddOnlyDrop,readAddOnlyDrop,settleAddOnlyDrop} from '../lib/node-add-only-window.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';

const dropGuid='3a0a4d1f-65ad-4baf-8305-aec9a86fc4e1';
const laterGuid='0838ec91-db4c-48ba-8184-95234cf6fc71';
function nativeDropGraph({canvas,document,elements,globals,prefix}) {
 class ModelForm {}
 class PackageTreeNode {}
 class WorkFlowTreeNode {}
 const packageNode=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const record=globals.__loginomDockPreparationV1.receipts.get('r');
 Object.assign(record,{packageNode,nodeTargetWorkflowNode:workflow});
 const shapes=new Map(),visible=[],nodes=[],links=[];
 Object.assign(canvas,{isConnected:true,contains:e=>e===canvas||visible.includes(e),querySelectorAll:()=>visible});
 const model=new ModelForm();
 Object.assign(model,{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{
  FNodes:{FCollection:nodes},FLinks:{FCollection:links},
  FmxGraph:{container:canvas,view:{getState:cell=>({shape:{node:shapes.get(cell)}})}},
 }});
 const card={Controller:{FController:model,Node:{data:{node:workflow}}}};
 const origin='https://example.invalid',build='7.4.2';
 Object.assign(globals,{document,location:{origin},getComputedStyle:()=>({visibility:'visible'}),bg:{app:{
  Version:build,PackageTreeNode,WorkFlowTreeNode,ModelForm,
  Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}},
 }}});
 const render=(cell,tid)=>{
  const shape={getAttribute:()=>tid,getBoundingClientRect:()=>({width:10,height:10})};
  visible.push(shape);elements.set(tid,shape);shapes.set(cell,shape);
 };
 const addNode=(id,type,geometry,ports)=>{
  const n={FGuid:id,FIconCls:NODE_TYPES[type].icon_class,FCell:{geometry}};
  const tid=prefix+';Graph;'+id;
  n.FLabel={parent:n,FCell:{parent:n.FCell,visible:false},FRawValue:id};
  n.FPorts=[{FCollection:ports.map(([direction,index])=>{
   const port={FGuid:id+'-port-'+index,parent:n,FType:direction==='Input'?0:1,FSubType:1,data:{},
    FCell:{parent:n.FCell,visible:true}};
   render(port.FCell,tid+';'+direction+'_Data-'+index);
   return port;
  })}];
  nodes.push(n);render(n.FCell,tid);
  return n.FPorts[0].FCollection;
 };
 const [source]=addNode('source','imports.text',{x:320,y:100},[['Output',0]]);
 let inputs;
 const addLink=(guid,index)=>{
  const target=inputs[index],cell={source:source.FCell,target:target.FCell};
  links.push({FGuid:guid,FCell:cell,FSourcePort:source,FTargetPort:target});
  render(cell,prefix+';Graph;source|Output_Data-0|new-js|Input_Data-'+index);
 };
 return {origin,build,drop(){
  inputs=addNode('new-js','programming.javascript',{x:600,y:380},[['Input',0],['Input',1]]);
  addLink(dropGuid,0);
 },later(){if(links.length===1)addLink(laterGuid,1);}};
}

function fixture(t, fault, addOnly=false,{nativeDrop=false}={}) {
 t.mock.timers.enable({apis:['Date'],now:10000});
 const prefix='MF;TF-1',rootTid=prefix+';ModelForm;cmpDiagram',tabTid='tab';
 const palette=prefix+';ModelForm;colVendors_Компоненты>Программирование>JavaScript;TreeText';
 let created=false,held=false,drags=0,reads=0;
 const rect={x:300,y:100,width:1000,height:700,right:1300,bottom:800};
 const canvas={getBoundingClientRect:()=>rect,contains:e=>e===canvas};
 const item={getBoundingClientRect:()=>({x:50,y:200,width:100,height:20}),contains:e=>e===item};
 const tab={classList:{contains:()=>true}},elements=new Map([[rootTid,canvas],[palette,item],[tabTid,tab]]);
 const document={querySelectorAll:q=>{const e=q.startsWith('[data-tid=')?elements.get(JSON.parse(q.slice(10,-1))):null;return e?[e]:[];},elementFromPoint:x=>x<300?item:canvas};
 const before={complete:true,document_id:'doc',workflow_ref:{workflow_id:'wf',prefix,tab_tid:tabTid,...(nativeDrop?{navigation_path:[]}:{})},dom_epoch:1,interaction_ready:true,nodes:[],links:[],foreign_links:[]};
 const native={FGuid:'new-js',FIconCls:NODE_TYPES['programming.javascript'].icon_class};
 const globals={document,innerWidth:1400,innerHeight:900,__loginomDockPreparationV1:{document,id:'doc',receipts:new Map([['r',{phase:'verified',workflowId:'wf',tab}]]),nodeTargetDomEpochs:{objects:new Map([[canvas,1]]),next:1}},
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:{FNodes:{FCollection:created?[native]:[]}}}}})}}}}}}}};
 const scene=nativeDrop?nativeDropGraph({canvas,document,elements,globals,prefix}):null;
 const evaluate=(fn,args,element)=>runInNewContext('('+fn.toString()+')',globals)(...(element?[element,args]:[args]));
 const page={evaluate:async(fn,args)=>evaluate(fn,args),waitForTimeout:async ms=>{
  t.mock.timers.tick(ms);
  if(created)scene?.later();
  // Cancel during port settlement follows the drop; cancel_before lands on the first pre-gesture wait.
  if(fault==='cancel'&&created||fault==='cancel_before'&&!created)page[Symbol.for('loginom-dock.node-target-cancel')]=new Set(['effect']);
 },locator:selector=>{
  const element=elements.get(JSON.parse(selector.slice(10,-1)));
  return {count:async()=>element?1:0,isVisible:async()=>true,isEnabled:async()=>true,boundingBox:async()=>rect,evaluate:async(fn,args)=>evaluate(fn,args,element)};
 },mouse:{move:async()=>{},down:async()=>{held=true;drags++;},up:async()=>{if(held){created=true;scene?.drop();}held=false;}},keyboard:{press:async()=>{}}};
 const handle=value=>({value,getProperty:async key=>handle(value[key]),jsonValue:async()=>value,asElement:()=>null,dispose:async()=>{}});
 page.evaluateHandle=scene?async(fn,args)=>handle(evaluate(fn,args.binding?{...args,binding:args.binding.value}:args))
  :async()=>handle({createdLinkGuids:[]});
 const task={deadline:40000,request:{document_id:'doc',workflow_ref:before.workflow_ref},types:NODE_TYPES,
  ...(scene?{origin:scene.origin,build:scene.build,track_link_guids:true}:{}),
  effect:{id:'effect',kind:'create',before,parameters:{type:'programming.javascript',position:{x:600,y:380},...(addOnly?{add_only:true}:{})}}};
 const read=scene?readGraph:async()=>{
  if(!created)return structuredClone(before);
  reads++;
  if(fault==='mask' && reads===1 || fault==='persistent_mask')throw Error('page.evaluate: Error: Graph is blocked');
  if(fault==='foreign_type')throw Error('JavaScript data port has a foreign native type');
  if(fault==='foreign_owner')native.FIconCls=NODE_TYPES['transform.sorting'].icon_class;
  if(fault==='changed_owner' && reads>1)native.FGuid='other-js';
  if(Date.now()<26000 || fault==='deadline' || fault==='cancel')throw Error('page.evaluate: Error: Visible port identity is not rendered');
  return {...before,nodes:[{ref:{node_id:native.FGuid},type:'programming.javascript',position:{x:600,y:380}}]};
 };
 const reveal=async args=>{await args.guard();return {fully_visible:!['hidden','closed_then_hidden'].includes(fault),point:{x:900,y:480}};};
 const window=scene?{bind:bindAddOnlyDrop,read:readAddOnlyDrop,settle:settleAddOnlyDrop}:{
  settle:async(_page,_binding,{onOwnedWindow})=>{
   if(['owned_window','closed_then_hidden'].includes(fault))onOwnedWindow?.('new-js');
   if(fault==='foreign_window'||fault==='owned_window')throw Error('Native window did not settle');
   t.mock.timers.tick(16000);
   const graph=await read();
   if(fault==='wrong_type')graph.nodes[0].type='transform.sorting';
   return graph;
  },
 };
 return {run:async()=>{
  if(scene)task.effect.before=await read(page,task);
  return mutateGraph(page,task,read,null,null,null,reveal,samePlacementGraph,undefined,undefined,window);
 },counts:()=>({drags,reads}),now:()=>Date.now()};
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

test('add_only browser receipt records a native drop GUID but omits the later link GUID',async t=>{
 const f=fixture(t,null,true,{nativeDrop:true}),receipt=await f.run();
 assert.equal(receipt.status,'SUCCEEDED',receipt.error);
 assert.equal(receipt.cleanup_complete,true);
 assert.equal(f.counts().drags,1);
 assert.deepEqual(Array.from(receipt.drop_link_guids),[dropGuid]);
 assert.deepEqual(Array.from(receipt.after.links,edge=>[edge.target,edge.input,edge.native_link_guid]),
  [['new-js',0,dropGuid],['new-js',1,laterGuid]]);
});

for(const [fault,cleanup,dispatched,error] of [
 ['foreign_window',true,true,/window did not settle/],
 ['owned_window',false,true,/window did not settle/],
 ['wrong_type',true,true,/type mismatch/],
 ['hidden',true,true,/not fully visible/],
 ['closed_then_hidden',true,true,/not fully visible/],
 ['cancel_before',true,false,/cancelled/],
])test('add_only native cleanup receipt: '+fault,async t=>{
 const f=fixture(t,fault,true),reply=await f.run();
 assert.equal(reply.status,dispatched?'AMBIGUOUS':'NOT_APPLIED',reply.error);
 assert.equal(reply.effect_possible,dispatched);
 assert.equal(reply.cleanup_complete,cleanup);
 assert.equal(reply.add_only_window_pending,cleanup?undefined:true);
 assert.equal(reply.add_only_window_node_id,cleanup?undefined:'new-js');
 assert.equal(f.counts().drags,Number(dispatched));
 assert.match(reply.error,error);
});

for(const selector of ['.x-window','[role="alertdialog"]','[data-tid$=";WizrdMCF"]'])test('add_only graph reader refuses visible '+selector,async()=>{
 const tab={classList:{contains:()=>true}},dialog={getBoundingClientRect:()=>({width:20,height:20})};
 const document={querySelectorAll:query=>query==='[data-tid="tab"]'?[tab]:query.includes(selector)?[dialog]:[]};
 const navigation_path=selector.includes('WizrdMCF')?[{tid:'graph-crumb',label:'Graph'}]:[];
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path}};
 const origin='https://example.invalid',build='7.4.2';
 const context={document,location:{origin},bg:{app:{Version:build}},getComputedStyle:()=>({visibility:'visible'}),
  __loginomDockPreparationV1:{document,id:'doc',receipts:new Map([['r',{phase:'verified',workflowId:'wf',tab}]])}};
 const page={evaluate:async(fn,args)=>runInNewContext('('+fn.toString()+')',context)(args)};
 const adapter=createNodeTargetBrowserAdapter({origin,build,requireNoNativeWindow:true,
  execute:async code=>Function('return ('+code+')')()(page)});
 await assert.rejects(adapter.observe(request,Date.now()+1000),{code:'NODE_ADD_ONLY_GRAPH_BLOCKED'});
});

test('add_only graph read still waits for its transient activity mask',async()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',navigation_path:[]}};
 const graph={document_id:'doc',interaction_ready:true};
 let masked=true,waits=0;
 const page={
  async evaluate(){
   if(masked)throw Error('Graph is blocked');
   return graph;
  },
  async waitForFunction(_probe,selector){
   assert.match(selector,/\.bg-mask-message/);
   waits++;
   masked=false;
  },
 };
 const adapter=createNodeTargetBrowserAdapter({origin:'https://example.invalid',build:'7.4.2',requireNoNativeWindow:true,
  execute:async code=>Function('return ('+code+')')()(page)});
 assert.deepEqual(await adapter.observe(request,Date.now()+1000),graph);
 assert.equal(waits,1);
});

for(const scenario of ['quiet','idle:false','different first','different second','deadline'])test('add_only browser cleanup proof: '+scenario,async t=>{
 t.mock.timers.enable({apis:['Date'],now:10000});
 const graph={complete:true,document_id:'doc',workflow_ref:{workflow_id:'wf',navigation_path:[]},interaction_ready:scenario!=='idle:false'};
 const deadline=10100+(scenario==='deadline'?0:700);
 let reads=0,waits=0;
 const page={
  async evaluate(_read,probe){
   assert.match(probe.window_blocker_selector,/WizrdMCF/);
   assert.equal(probe.request.document_id,'doc');
   reads++;
   if(scenario===(reads===1?'different first':'different second'))return {...graph,links:[{source:'changed'}]};
   return graph;
  },
  async waitForTimeout(ms){waits++;assert.equal(ms,200);t.mock.timers.tick(ms);},
 };
 const adapter=createNodeTargetBrowserAdapter({origin:'https://example.invalid',build:'7.4.2',requireNoNativeWindow:true,
  execute:async code=>Function('return ('+code+')')()(page)});
 assert.equal(await adapter.verifyAddOnlyCleanup(graph,deadline),scenario==='quiet');
 assert.equal(reads,['idle:false','different first'].includes(scenario)?1:2);
 assert.equal(waits,reads-1);
});
