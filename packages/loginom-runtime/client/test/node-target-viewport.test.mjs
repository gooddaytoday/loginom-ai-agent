import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createNodeTargetBrowserAdapter,mutateGraph} from '../lib/node-target-browser.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';
import {verifyNodeTargetEffect} from '../lib/node-target.mjs';
import {Page,actions,selectors} from './support/executor-fixture.mjs';

function fixture(kind,fault) {
 const prefix='MF;TF',tid=prefix+';Graph;Sort',ref={document_id:'doc',workflow_id:'flow',node_id:'node'};
 const workflow_ref={workflow_id:'flow',prefix,tab_tid:'tab'};
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref,dom_epoch:1,
  nodes:[{ref,type:'transform.sorting',label:'Sort',dom_epoch:2,position:{x:936,y:80},locked:false,inputs:[0],outputs:[0]}],links:[],foreign_links:[]};
 if(fault?.startsWith('deselect_')){graph.nodes[0].position={x:152,y:1528};graph.nodes[0].type='transform.calculator';graph.nodes[0].label='Поля справочника стран';}
 const before=structuredClone(graph),order=[];let revealed=false,held=false,edited='',deselected=false;
 const canvas={scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({x:0,y:50,width:1280,height:750,right:1280,bottom:800}),contains:e=>e===canvas||e===body||e===label,closest:()=>null};
 const body={parent:canvas,getAttribute:()=>tid,getBoundingClientRect:()=>({x:revealed?700:1380,y:200,width:56,height:60}),contains:e=>e===body||e===label};
 const label={parent:body,getAttribute:()=>tid+';Label;Label',getBoundingClientRect:()=>({x:revealed?690:1370,y:175,width:80,height:20}),contains:e=>e===label};
 const tab={classList:{contains:()=>true}},document={querySelectorAll:q=>q==='[data-tid="tab"]'?[tab]:q==='[data-tid="'+prefix+';ModelForm;cmpDiagram"]'?[canvas]:[],elementFromPoint:(x,y)=>{
  for(const e of [label,body]){const b=e.getBoundingClientRect();if(x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height&&x<1280)return e;}return x<1280&&y<800?canvas:null;
 }};
 const nativeNode={FGuid:'node',FCell:{}},nativeNodes=[nativeNode],view={scale:1,getState:()=>({shape:{node:body}})};
 const controller={FController:{FInitialScale:1,FDiagram:{FNodes:{FCollection:nativeNodes},FmxGraph:{view,getSelectionCells:()=>[]}}}};
 const app={Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}};
 const context={innerWidth:1280,innerHeight:800,document,__loginomDockPreparationV1:{document,id:'doc',receipts:new Map([['prepare',{phase:'verified',workflowId:'flow',tab}]]),nodeTargetDomEpochs:{objects:new Map([[canvas,1]])}},
  bg:{app}};
 const evaluate=(fn,...args)=>runInNewContext('('+fn.toString()+')',context)(...args);
 const locator=selector=>{
  const element=selector.includes('Label;Label')?label:selector.includes(';Graph;Sort')?body:canvas;
  return {locator,boundingBox:async()=>canvas.getBoundingClientRect(),count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,evaluate:async(fn,arg)=>evaluate(fn,element,arg),
   dblclick:async()=>{assert.ok(revealed);order.push('rename');},click:async()=>{},press:async key=>{
    if(key==='Enter'){graph.nodes[0].label=edited;graph.nodes[0].dom_epoch++;}
   }};
 };
 const page={locator,evaluate:async(fn,arg)=>evaluate(fn,arg),waitForTimeout:async()=>{},keyboard:{type:async text=>{edited=text;},press:async()=>{}},mouse:{
  click:async()=>{
   deselected=true;
   if(fault?.startsWith('deselect_')){
    graph.nodes[0].dom_epoch++;
    if(fault==='deselect_position')graph.nodes[0].position.x++;
    if(fault==='deselect_label')graph.nodes[0].label='foreign';
    if(fault==='deselect_lock')graph.nodes[0].locked=true;
    if(fault==='deselect_root')graph.dom_epoch++;
    if(fault==='deselect_document')graph.document_id='foreign';
    if(fault==='deselect_links')graph.foreign_links.push('foreign');
   }
  },move:async()=>{},down:async()=>{assert.ok(revealed);order.push('move');held=true;},up:async()=>{if(held){if(kind==='create'){nativeNodes.push({FGuid:'created',FIconCls:fault==='foreign_icon'?'foreign':NODE_TYPES['programming.javascript'].icon_class});graph.nodes.push({...structuredClone(graph.nodes[0]),ref:{...ref,node_id:'created'},type:'programming.javascript',position:{x:400,y:80}});}else{graph.nodes[0].position=fault?.startsWith('deselect_')?{x:184,y:400}:{x:648,y:400};graph.nodes[0].dom_epoch++;}held=false;}}
 }};
 const reveal=async args=>{
  order.push('reveal');
  if(kind!=='create'){assert.equal(args.nodeId,'node');assert.deepEqual(args.position,before.nodes[0].position);}
  revealed=true;view.scale=fault?.startsWith('deselect_')?.3855432894295314:.75;graph.nodes[0].dom_epoch++;
  if(fault==='unknown'){const e=Error('Lost viewport reply');e.placement_navigation_unverified=true;throw e;}
  if(fault==='foreign')graph.nodes[0].ref.node_id='foreign';
  await args.guard();return {point:{x:400,y:180},fully_visible:fault!=='not_visible',zoom_steps:2,outline_closed:true};
 };
 let pendingReads=0,deselectionReads=0;
 const read=async()=>{
  // The SVG can be replaced after selection is empty and its first graph read.
  if(fault?.startsWith('deselect_late_') && deselected && ++deselectionReads===2){
   graph.nodes[0].dom_epoch++;
   if(fault==='deselect_late_position')graph.nodes[0].position.x++;
   if(fault==='deselect_late_label')graph.nodes[0].label='foreign';
   if(fault==='deselect_late_lock')graph.nodes[0].locked=true;
   if(fault==='deselect_late_root')graph.dom_epoch++;
   if(fault==='deselect_late_document')graph.document_id='foreign';
   if(fault==='deselect_late_links')graph.foreign_links.push('foreign');
   if(fault==='deselect_late_ports')graph.nodes[0].inputs.push(1);
   if(fault==='deselect_late_type')graph.nodes[0].type='foreign';
   if(fault==='deselect_late_workflow')graph.workflow_ref.workflow_id='foreign';
   if(fault==='deselect_late_node_id')graph.nodes[0].ref.node_id='foreign';
   if(fault==='deselect_late_readiness')graph.interaction_ready=false;
   if(fault==='deselect_late_native_links')graph.links.push({source:'node',output:0,target:'foreign',input:0});
  }
  if(kind==='create'&&graph.nodes.length===2&&pendingReads++<2)throw Error('Node identity is not rendered');return structuredClone(graph);
 };
 const effect={id:'effect',kind,before,parameters:kind==='create'?{type:'programming.javascript',position:{x:400,y:80}}:{ref,...(kind==='rename'?{label:'Debt descending'}:{position:fault?.startsWith('deselect_')?{x:180,y:400}:{x:648,y:400}})}};
 return {order,effect,run:()=>mutateGraph(page,{effect,request:{document_id:'doc',workflow_ref},types:NODE_TYPES,deadline:Date.now()+15000},read,null,null,null,reveal,samePlacementGraph)};
}
for(const kind of ['rename','move'])test('target '+kind+' reveals its exact offscreen node and rebinds only drawing epochs',async()=>{
 const f=fixture(kind),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);
 assert.deepEqual(f.order,['reveal',kind]);assert.ok(verifyNodeTargetEffect(f.effect,r.after,(n,p)=>n.position.x===Math.round(p.x/8)*8&&n.position.y===Math.round(p.y/8)*8));
 assert.equal(r.placement_navigation.fully_visible,true);assert.equal(r.cleanup_complete,true);
});
for(const kind of ['rename','move'])for(const fault of ['unknown','foreign','not_visible'])test('target '+kind+' refuses '+fault+' viewport before its node gesture',async()=>{
 const f=fixture(kind,fault),r=await f.run();assert.notEqual(r.status,'SUCCEEDED');assert.deepEqual(f.order,['reveal']);
 if(fault==='unknown'){assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);}
});

for(const fault of ['settles','foreign_icon'])test('one JavaScript drop waits for its native body and rejects '+fault+' owner',async()=>{
 const f=fixture('create',fault),r=await f.run();
 assert.equal(r.status,fault==='settles'?'SUCCEEDED':'AMBIGUOUS',r.error);
 assert.equal(f.order.filter(e=>e==='move').length,1);
 if(fault==='settles')assert.equal(r.after.nodes.length,2);
 else assert.match(r.error,/Created JavaScript rendering owner changed/);
});

// D49/J2 move-country-params: selection can repaint SVG before any node drag.
test('D49 deselection rebinds drawing epochs before exactly one move',async()=>{
 const f=fixture('move','deselect_redraw'),r=await f.run();
 assert.equal(r.status,'SUCCEEDED',r.error);
 assert.deepEqual(f.order,['reveal','move']);
 assert.ok(verifyNodeTargetEffect(f.effect,r.after,(n,p)=>n.position.x===Math.round(p.x/8)*8&&n.position.y===Math.round(p.y/8)*8));
 assert.equal(r.cleanup_complete,true);
});
for(const fault of ['position','label','lock','root','document','links'])test('D49 deselection refuses changed '+fault+' before drag',async()=>{
 const f=fixture('move','deselect_'+fault),r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.deepEqual(f.order,['reveal']);
});

// LAB-428/J2: a second repaint lands between deselection readback and drag.
test('late deselection redraw permits exactly one move',async()=>{
 const f=fixture('move','deselect_late_redraw'),r=await f.run();
 assert.equal(r.status,'SUCCEEDED',r.error);
 assert.deepEqual(f.order,['reveal','move']);
 assert.ok(verifyNodeTargetEffect(f.effect,r.after,(n,p)=>n.position.x===Math.round(p.x/8)*8&&n.position.y===Math.round(p.y/8)*8));
 assert.equal(r.cleanup_complete,true);
});
for(const fault of ['position','label','lock','root','document','links','ports','type','workflow','node_id','readiness','native_links'])test('late deselection refuses changed '+fault+' before drag',async()=>{
 const f=fixture('move','deselect_late_'+fault),r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.deepEqual(f.order,['reveal']);
});

for(const placement of ['offscreen source','distant target','minimum zoom'])test('pinned connect reveals both ends: '+placement,async()=>{
 const page=new Page(),cache=new Map(),elements=page.elements.bind(page);page.clock=Date.now();
 page.app.Version='7.4.2';
 page.addNode('Sort',placement==='offscreen source'?1056:144,placement==='offscreen source'?72:80,['Output_Data-0']);
 page.addNode('Export',placement==='offscreen source'?560:2400,placement==='offscreen source'?208:1800,['Input_Data-0']);
 // Start at the source after its reveal: the distant target is offscreen.
 const minimum=.3855432894295314;
 if(placement==='minimum zoom'){
  // LAB-929: target rename is visible at minimum zoom with scroll (18,42).
  // Revealing the clipped source alone then scrolls the target out of view.
  page.viewScale=minimum;let left=18,top=42;
  Object.defineProperties(page.graph,{
   scrollLeft:{get:()=>left,set:value=>{left=Math.max(0,value);}},
   scrollTop:{get:()=>top,set:value=>{top=Math.max(0,value);}},
  });
 }
 page.elements=()=>{const all=elements().map(element=>{
  const old=cache.get(element.tid);if(old){Object.assign(old,element);return old;}cache.set(element.tid,element);return element;
 }).map(element=>{
 element.classList={contains:name=>element.classes?.includes(name)===true};
 element.contains=child=>child===element||element.children?.some(e=>e===child||e.contains?.(child))===true;
 element.closest=selector=>element.classList.contains(selector.slice(1))?element:element.parentElement?.closest(selector)??null;
  return element;
 });const canvas=all.find(e=>e.symbol==='workflow.graph');canvas.children=all.filter(e=>e.tid.includes(';Graph;'));for(const e of canvas.children)e.parentElement=canvas;return all;};
 const exact=tid=>page.elements().filter(e=>e.tid===tid),root=exact(page.prefix+';ModelForm;cmpDiagram')[0];
 const native=page.nodes.map((node,index)=>{
  const n={FGuid:['sort-guid','export-guid'][index],FIconCls:NODE_TYPES[index?'exports.text':'transform.sorting'].icon_class,FCell:{geometry:{x:node.x,y:node.y}}};
  n.FLabel={parent:n,FCell:{parent:n.FCell,visible:true},FRawValue:node.label};
  n.FPorts=[{FCollection:[{FGuid:'port-'+index,parent:n,FType:index?0:1,FSubType:1,FCell:{id:n.FGuid,parent:n.FCell,visible:true}}]}];return n;
 });
 const graph=page.model.FDiagram.FmxGraph;
 graph.container=root;graph.view.getState=cell=>{
  for(const [index,node] of native.entries()){
   const tid=page.prefix+';Graph;'+page.nodes[index].label;
   if(cell===node.FCell)return {shape:{node:exact(tid)[0]}};
   if(cell===node.FLabel.FCell)return {text:{node:exact(tid+';Label;Label')[0]}};
   if(cell===node.FPorts[0].FCollection[0].FCell)return {shape:{node:exact(tid+';'+page.nodes[index].ports[0])[0]}};
  }
 };
 Object.assign(page.model,{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false});
 Object.assign(page.model.FDiagram,{FNodes:{FCollection:native},FHandlers:{FConnectionHandler:{FDelegationHandler:{get FMouseDown(){return page.down;}}}},FValidatedConnectionsCache:{FCache:{'sort-guid':{'export-guid':true}}}});
 Object.defineProperty(graph,'isMouseDown',{get:()=>page.down});
 graph.connectionHandler={first:{},previous:{cell:native[0].FPorts[0].FCollection[0].FCell},marker:{validState:{cell:native[1].FPorts[0].FCollection[0].FCell}},error:null};
 const packageNode=new page.app.PackageTreeNode(),workspace=page.app.Application.FInstance.FMainForm.Items.Workspace;
 workspace.getActiveTab=()=>({Controller:{FController:page.model,Node:{data:{node:{ParentNode:packageNode}}}}});
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:page.prefix,tab_tid:page.tabTid,navigation_path:[]}};
 const document={querySelectorAll:selector=>selector.startsWith('[data-tid')?page.match(selector):[],elementFromPoint:(x,y)=>{
  if(x<0||x>=1280||y<0||y>=800)return null;
  return page.elements().filter(e=>e.kind==='port').find(e=>page.contains(e.box,{x,y}))??root;
 }};
 const preparation={id:'doc',document,receipts:new Map([['prepare',{phase:'verified',workflowId:'flow',packageNode,tab:exact(page.tabTid)[0]}]])};
 await page.execute('async page=>true');
 Object.assign(page.context,{document,location:{origin:'http://loginom.test'},innerWidth:1280,innerHeight:800,__loginomDockPreparationV1:preparation,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(0)});
 page.viewportSize=()=>({width:1280,height:800});
 // Use the existing capability DOM model, evaluating real hit tests for the
 // adapter/reveal instead of its capability-only interaction shortcut.
 const locator=page.locator.bind(page),direct=loc=>{
  loc.evaluate=async(fn,arg)=>fn(loc.all()[0],arg);
  for(const name of ['locator','nth']){const next=loc[name].bind(loc);loc[name]=(...args)=>direct(next(...args));}return loc;
 };
 let zooms=0;
 page.locator=selector=>{
  if(selector.includes(';ModelForm;cntDiagram'))return {count:async()=>1,isVisible:async()=>true,locator:()=>({count:async()=>1,isVisible:async()=>true,getAttribute:async()=> 'Уменьшить масштаб',click:async()=>{
   zooms++;page.viewScale=placement==='minimum zoom'?Math.max(minimum,page.viewScale*.75):page.viewScale*.75;
   for(const key of cache.keys())if(key.includes(';Graph;'))cache.delete(key);
  }})};
  return direct(locator(selector));
 };
 const adapter=createNodeTargetBrowserAdapter({origin:'http://loginom.test',build:'7.4.2',pinned:{actions,selectors},execute:code=>page.execute(code)});
 const before=await adapter.observe(request,Date.now()+15000),effect={id:'connect',kind:'connect',before,parameters:{edge:{source:'sort-guid',output:0,target:'export-guid',input:0}}};
 const source=exact(page.prefix+';Graph;Sort;Output_Data-0')[0].box;
 assert.ok(placement==='offscreen source'?source.x>1280:source.x>300&&source.x<1280);
 const target=exact(page.prefix+';Graph;Export;Input_Data-0')[0].box;
 assert.ok(placement==='distant target'?target.x>1280&&target.y>800:target.x>0&&target.x<1280&&target.y>0&&target.y<800);
 if(placement==='minimum zoom')assert.ok(source.y<100);
 const result=await adapter.mutate(effect,Date.now()+15000);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.cleanup_complete,true);
 if(placement==='offscreen source')assert.equal(zooms,1);
 assert.equal(page.drops,1);assert.equal(page.down,false);
 const after=await adapter.observe(request,Date.now()+15000);
 assert.deepEqual(after.links,[effect.parameters.edge]);
 assert.deepEqual(after.nodes.map(({dom_epoch,...node})=>node),before.nodes.map(({dom_epoch,...node})=>node));
 assert.equal((await adapter.reconcile(effect,after,Date.now()+15000)).completed,true);
});
