import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {verifyNodeTargetEffect} from '../lib/node-target.mjs';
import {createNodeTargetBrowserAdapter,readGraph} from '../lib/node-target-browser.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
function fixture({portIndex=0}={}){
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelForm{};
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[{tid:'crumb',label:'Scenario'}]}};
 const element=tid=>({getAttribute:()=>tid,textContent:'Scenario',getBoundingClientRect:()=>({width:10,height:10}),classList:{contains:()=>true}});
 const tab=element('tab'),root=element('MF;TF-1;ModelForm;cmpDiagram'),body=element('MF;TF-1;Graph;Calc'),portDom=element('MF;TF-1;Graph;Calc;Output_Data-0'),crumb=element('crumb'),labelDom=element('MF;TF-1;Graph;Calc;Label;Label');
 const alternatePortDom=element(null),inside=[];let duplicateShape=false,wrongHit=false;
 root.contains=e=>e===body||e===portDom||e===alternatePortDom||e===labelDom||inside.includes(e);root.querySelectorAll=()=>[body,portDom,labelDom,...inside].filter(e=>e.getAttribute('data-tid'));
 const port={FCell:{visible:true}},node={FGuid:'n',FIconCls:'bg-vendor-icon-calcdata',FCell:{geometry:{x:10,y:10}},FPorts:[{FCollection:[port]}]};
 Object.assign(port,{FGuid:'port-guid',data:{},parent:node,FType:1,FSubType:1});port.FCell.parent=node.FCell;
 let portTid='MF;TF-1;Graph;Calc;Output_Data-'+portIndex,nodeTid='MF;TF-1;Graph;Calc';body.getAttribute=()=>nodeTid;labelDom.getAttribute=()=>nodeTid+';Label;Label';portDom.getAttribute=()=>portTid;
 node.FLabel={parent:node,FCell:{parent:node.FCell,visible:true},FRawValue:'Calc'};
 let bodyRendered=true,rendered=true,labelRendered=true,onPaint=()=>{},pausedPaint=false;
 const extraStates=new Map();
 const graph={container:root,getCellAt:()=>wrongHit?{}:port.FCell,view:{getState:cell=>extraStates.get(cell)??(cell===node.FCell?(bodyRendered?{shape:{node:body}}:null):cell===node.FLabel.FCell?(labelRendered?{text:{node:labelDom}}:null):rendered?{shape:{node:duplicateShape?alternatePortDom:portDom}}:null)}};
 const model=Object.assign(new ModelForm(),{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FmxGraph:graph,FNodes:{FCollection:[node]}}});
 const packageNode=new PackageTreeNode(),workflowNode=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node:workflowNode}},FController:model}})}}}}}};
 const outside=[];
 const nodeList=values=>Object.assign(Object.fromEntries(values.map((v,i)=>[i,v])),{length:values.length,[Symbol.iterator]:function*(){yield* values;}});
 const document={querySelectorAll:selector=>nodeList(selector.startsWith('[data-tid^=')?[crumb]:[tab,root,body,portDom,...inside,...outside,...(labelRendered?[labelDom]:[])].filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']'))};
 const preparation={id:'doc',document,receipts:new Map([['p',{phase:'verified',workflowId:'wf',packageNode,tab}]])};
 const context=vm.createContext({document,location:{origin:'http://loginom.test'},bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'}),setTimeout,clearTimeout,requestAnimationFrame:callback=>{if(pausedPaint)return;onPaint();callback(0);}});
 const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context)};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://loginom.test',build:'7.4.2',pinned:{},execute:code=>vm.runInNewContext('('+code+')',{...context})(page)});
 const restLink=(tree=false,mixed=false)=>{
  const add=(id,icon,suffix)=>{
   const tid='MF;TF-1;Graph;'+id,n={FGuid:id,FIconCls:icon,FCell:{geometry:{x:1,y:1}},FPorts:[]};
   n.FLabel={parent:n,FCell:{parent:n.FCell,visible:false},FRawValue:'Arbitrary label'};
   const p={parent:n,FCell:{parent:n.FCell,visible:true}},dom=element(tid),pd=element(tid+';'+suffix);
   n.FPorts=[{FCollection:[p]}];model.FDiagram.FNodes.FCollection.push(n);inside.push(dom,pd);
   extraStates.set(n.FCell,{shape:{node:dom}});extraStates.set(p.FCell,{shape:{node:pd}});return {node:n,port:p,dom:pd};
  };
  const sourceSuffix=tree?'Output_DataTree-0':'Output_Connection-0',targetSuffix=tree?(mixed?'Input_Data-0':'Input_DataTree-0'):'Input_Connection-0';
  const source=add('connection','bg-vendor-icon-restclientconnection',sourceSuffix),target=add('rest','bg-vendor-icon-restclient',targetSuffix);
  if(tree)for(const [index,p] of [source.port,target.port].entries())Object.assign(p,{FGuid:'tree-port-'+index,data:{},FType:index===0?1:0});
  const tid='MF;TF-1;Graph;connection|'+sourceSuffix+'|rest|'+targetSuffix,dom=element(tid),edge={source:source.port.FCell,target:target.port.FCell};
  source.port.FCell.edges=[edge];inside.push(dom);extraStates.set(edge,{shape:{node:dom}});return {source,target,edge,tid};
 };
 const addService=(tid=null)=>{
  const port={parent:node,FType:1,FSubType:10,FCell:{parent:node.FCell,visible:true}},dom=element(tid);
  node.FPorts[0].FCollection.push(port);inside.push(dom);extraStates.set(port.FCell,{shape:{node:dom}});
  return {port,dom,hide:()=>{port.FCell.visible=false;extraStates.set(port.FCell,{});},unrender:()=>extraStates.set(port.FCell,{}),render:()=>extraStates.set(port.FCell,{shape:{node:dom}})};
 };
 return {tree:()=>{portTid=portTid.replace('_Data-','_DataTree-');},rename:(suffix='Output_Data-'+portIndex,keys='R_Segment')=>{const regression=node.FIconCls==='bg-vendor-icon-linregression',cross=node.FIconCls===NODE_TYPES['transform.cross_table'].icon_class;nodeTid='MF;TF-1;Graph;'+(cross?'cols:_Category;__rows:_'+keys+';__cells:_Amount':regression?'Линрегрессия:_Y_X1_X2_X3':'Квантование:_X');node.FLabel.FRawValue=cross?'cols: Category; rows: '+keys.replaceAll('_',' ')+'; cells: Amount':regression?'Линрегрессия: Y X1 X2 X3':'Квантование: X';portTid=nodeTid+';'+suffix;duplicateShape=true;},hideBody:()=>{bodyRendered=false;},showBody:()=>{bodyRendered=true;},changeDocument:()=>{preparation.id='foreign';},restLink,addService,binding:()=>readGraph(page,{request,types:NODE_TYPES,origin:'http://loginom.test',build:'7.4.2',read_bindings:true}),outline:()=>{outside.push(element(portTid),element(labelDom.getAttribute()));},duplicatePort:()=>{inside.push(element(portTid));},read:()=>adapter.observe(request,Date.now()+1000),input:()=>{portTid='MF;TF-1;Graph;Calc;Input_Data-0';port.FType=0;},alternateShape:()=>{duplicateShape=true;},wrongHit:()=>{wrongHit=true;},losePortTid:()=>{portTid=null;},hide:()=>{rendered=false;},show:()=>{rendered=true;},paintWith:callback=>{onPaint=callback;},pausePaint:()=>{pausedPaint=true;},hideLabel:()=>{labelRendered=false;},port,node,labelDom};
}
for(const direction of ['input','output'])test('tree_io binds '+direction+' DataTree ports without treating them as foreign controls',async()=>{
 const f=fixture();if(direction==='input')f.input();f.tree();
 const graph=await f.binding(),key=direction==='input'?'inputs':'outputs';
 assert.deepEqual(Array.from(graph.nodes[0][key]),[0]);
 assert.deepEqual(Array.from(graph.nodes[0][direction+'_kinds']),['tree']);
 assert.deepEqual(Array.from(graph.nodes[0].other_ports),[]);
 assert.deepEqual(Array.from(graph.native_bindings[0][direction+'_kinds']),['tree']);
 f.alternateShape();assert.deepEqual(Array.from((await f.binding()).nodes[0][key]),[0]);
});
test('tree_io refuses an alternate tree SVG whose hit-test belongs to another native cell',async()=>{
 const f=fixture();f.tree();f.alternateShape();f.wrongHit();
 await assert.rejects(f.binding(),/Visible port identity/);
});
test('tree_io observes a tree-to-tree edge and rejects a mixed table/tree edge',async()=>{
 const good=fixture();good.restLink(true);const graph=await good.binding();
 assert.deepEqual(JSON.parse(JSON.stringify(graph.links)),[{source:'connection',output:0,target:'rest',input:0}]);
 assert.deepEqual(Array.from(graph.foreign_links),[]);
 const bad=fixture();bad.restLink(true,true);await assert.rejects(bad.binding(),/Incompatible tree\/table link/);
});
for(const change of [f=>{f.port.parent={};},f=>{f.port.FCell.parent={};},f=>{f.port.FGuid=null;},f=>{f.port.data=null;},f=>{f.port.FType=0;}])test('tree_io requires the same native owner and port direction',async()=>{
 const f=fixture();f.tree();change(f);await assert.rejects(f.binding(),/Tree port native identity/);
});
test('REST service edge is identified by native node/port types and the exact rendered edge, never labels',async()=>{
 const f=fixture(),link=f.restLink(),g=await f.read();
 assert.deepEqual(Array.from(g.foreign_links),[link.tid]);
 assert.equal(g.rest_connection_links[0].source,'connection');assert.equal(g.rest_connection_links[0].target,'rest');
 for(const change of [l=>l.source.node.FIconCls='bg-vendor-icon-textconnection',l=>l.target.node.FIconCls='bg-vendor-icon-calcdata',
  l=>l.source.port.parent={},l=>l.target.port.FCell.parent={},l=>l.edge.target={},l=>l.source.port.FCell.edges=[]]){
  const bad=fixture(),l=bad.restLink();change(l);const observed=await bad.read();
  assert.equal(observed.foreign_links.length,1);assert.equal(observed.rest_connection_links,undefined);
 }
});
test('outline copies outside the prepared canvas do not replace its port or label bindings',async()=>{
 const f=fixture();f.outline();await f.read();f.alternateShape();assert.deepEqual(Array.from((await f.read()).nodes[0].outputs),[0]);
 f.losePortTid();await assert.rejects(f.read(),/Visible port identity/);
});
test('rerendered port without data-tid retains only its previously bound native identity',async()=>{
 const f=fixture();await f.read();f.alternateShape();
 assert.deepEqual(Array.from((await f.read()).nodes[0].outputs),[0]);
});
test('first observation binds an alternate port shape only through its rendered native cell',async()=>{
 const f=fixture();f.alternateShape();
 assert.deepEqual(Array.from((await f.read()).nodes[0].outputs),[0]);
 assert.deepEqual(Array.from((await f.binding()).native_bindings[0].outputs),[0]);
 for(const change of [f=>f.wrongHit(),f=>f.duplicatePort(),f=>f.losePortTid(),f=>{f.port.FGuid=null;},f=>{f.port.data=null;},f=>{f.port.parent={};},f=>{f.port.FCell.parent={};}]){
  const invalid=fixture();invalid.alternateShape();change(invalid);
  await assert.rejects(invalid.read(),/Visible port identity/);
 }
});
test('missing port attribute cannot borrow an unobserved or changed native identity',async()=>{
 const fresh=fixture();fresh.losePortTid();await assert.rejects(fresh.read(),/Visible port identity/);
 for(const change of [f=>f.wrongHit(),f=>f.losePortTid(),f=>{f.port.FGuid='other';},f=>{f.port.data={};},f=>{f.port.parent={};},f=>{f.port.FCell={...f.port.FCell};},f=>{f.port.FCell.parent={};},f=>{f.port.FType=0;},f=>{f.port.FSubType=9;}]){
  const f=fixture();await f.read();f.alternateShape();change(f);await assert.rejects(f.read(),/Visible port identity/);
 }
});
test('port rendered on the next paint is fully rebound before graph acceptance',async()=>{
 const f=fixture();f.hide();f.paintWith(()=>f.show());
 const result=await f.read();assert.equal(result.complete,true);assert.deepEqual(Array.from(result.nodes[0].outputs),[0]);
});
test('suspended animation frames cannot hang a read-only port observation', {timeout:3000},async()=>{
 const f=fixture();f.hide();f.pausePaint();
 await assert.rejects(f.read(),/Visible port identity is not rendered/);
});
test('visible native port without a rendered identity cannot enter a complete graph checkpoint',async()=>{
 const f=fixture();assert.deepEqual(Array.from((await f.read()).nodes[0].outputs),[0]);
 f.hide();await assert.rejects(f.read(),/Visible port identity is not rendered/);
 f.port.FCell.visible=false;assert.deepEqual(Array.from((await f.read()).nodes[0].outputs),[]);
});
test('cached labels preserve wrapping, whitespace and literal HTML independently of rendered text',async()=>{
 for(const label of ['Выручка по товарам','Сверхдлинноенеразрывноеназвание','A_B  C','A\u00a0B','A & <B>','Первая\nвторая']){
  const f=fixture();f.node.FLabel.FRawValue=label;f.labelDom.textContent='Rendered fragments without separators';
  assert.equal((await f.read()).nodes[0].label,label);
 }
});
test('cached label must belong to the GUID and its visible label must bind to the graph',async()=>{
 for(const change of [f=>{f.node.FLabel.parent={};},f=>{f.node.FLabel.FCell.parent={};},f=>{delete f.node.FLabel.FRawValue;},f=>f.hideLabel()]){
  const f=fixture();change(f);await assert.rejects(f.read(),/label.*identity/);
 }
 const f=fixture();f.node.FLabel.FCell.visible=false;f.hideLabel();assert.equal((await f.read()).nodes[0].label,'Calc');
});

test('link binding uses the same verified native port fallback as graph observation',async()=>{
 const f=fixture();await f.read();f.alternateShape();const g=await f.binding();
 assert.equal(g.native_bindings[0].node_id,'n');assert.equal(g.native_bindings[0].label,'Calc');
 assert.deepEqual(Array.from(g.native_bindings[0].outputs),[0]);
 f.wrongHit();await assert.rejects(f.binding(),/Visible port identity/);
});

test('rendered REST client identity is accepted as the requested REST node after creation',async()=>{
 const f=fixture();f.node.FIconCls='bg-vendor-icon-restclient';
 const after=await f.read(),before={...after,nodes:[]};
 assert.equal(after.nodes[0].type,'integration.rest_request');
 const result=verifyNodeTargetEffect({kind:'create',before,parameters:{type:'integration.rest_request'}},after);
 assert.equal(result.node_id,'n');
});

test('JavaScript tabular DOM identity cannot hide a foreign native port type',async()=>{
 const good=fixture();good.node.FIconCls='bg-vendor-icon-javascript';
 assert.deepEqual(Array.from((await good.read()).nodes[0].outputs),[0]);
 const input=fixture();input.node.FIconCls='bg-vendor-icon-javascript';input.input();
 assert.deepEqual(Array.from((await input.read()).nodes[0].inputs),[0]);
 for(const change of [f=>{f.port.FType=0;},f=>{f.port.FSubType=10;}]){
  const f=fixture();f.node.FIconCls='bg-vendor-icon-javascript';change(f);
  await assert.rejects(f.read(),/foreign native type/);
 }
});

test('JavaScript data0 remains fully bound beside its GUID-less service AddPort',async()=>{
 const f=fixture();f.node.FIconCls='bg-vendor-icon-javascript';const service=f.addService();
 const first=await f.binding();assert.equal(first.complete,true);
 assert.deepEqual(Array.from(first.nodes[0].outputs),[0]);assert.deepEqual(Array.from(first.native_bindings[0].outputs),[0]);
 assert.deepEqual(Array.from(first.nodes[0].other_ports),[]);
 service.dom.getAttribute=()=> 'MF;TF-1;Graph;Calc;Output_Add';
 assert.equal(JSON.stringify(await f.binding()),JSON.stringify(first));
 f.losePortTid();await assert.rejects(f.binding(),/Visible port identity/);
});

test('hidden unrendered JavaScript service ports retain their existing graph behavior',async()=>{
 const f=fixture();f.node.FIconCls='bg-vendor-icon-javascript';f.addService().hide();
 const graph=await f.binding();assert.equal(graph.complete,true);assert.deepEqual(Array.from(graph.nodes[0].outputs),[0]);
});

test('pending JavaScript service SVG retains the existing read-only rendering wait',async()=>{
 const f=fixture();f.node.FIconCls='bg-vendor-icon-javascript';const service=f.addService();service.unrender();
 await assert.rejects(f.binding(),/Visible port identity is not rendered/);
 f.paintWith(()=>service.render());assert.equal((await f.read()).complete,true);
});

test('only one owned unlinked output AddPort is outside the JavaScript data-port contract',async()=>{
 for(const change of [
  (f,s)=>{s.port.parent={};},(f,s)=>{s.port.FCell.parent={};},(f,s)=>{s.port.FType=0;},
  (f,s)=>{s.port.FGuid='unexpected-guid';},(f,s)=>{s.port.FCell.edges=[{}];},
  (f,s)=>{s.dom.getAttribute=()=> 'MF;TF-1;Graph;Calc;Output_Data-1';},
  (f,s)=>{s.dom.getAttribute=()=> 'MF;TF-1;Graph;Other;Output_Add';},f=>{f.addService();}
 ]){
  const f=fixture();f.node.FIconCls='bg-vendor-icon-javascript';const service=f.addService();change(f,service);
  await assert.rejects(f.binding(),/port.*(identity|native type)/i);
 }
 const nonJs=fixture();nonJs.addService();await assert.rejects(nonJs.binding(),/Visible port identity/);
 const changed=fixture();changed.node.FIconCls='bg-vendor-icon-javascript';await changed.binding();
 changed.port.FSubType=10;delete changed.port.FGuid;changed.losePortTid();
 await assert.rejects(changed.binding(),/port.*(identity|native type)/i);
});


test('pending native node body is fully rebound on the next paint without skipping its identity',async()=>{
 const f=fixture();f.hideBody();
 await assert.rejects(f.binding(),/Node identity is not rendered/);
 f.paintWith(()=>f.showBody());
 const graph=await f.read();assert.equal(graph.complete,true);assert.equal(graph.nodes[0].ref.node_id,'n');
});
test('node body rendering wait rechecks the prepared document and keeps a finite deadline',async()=>{
 const foreign=fixture();foreign.hideBody();foreign.paintWith(()=>foreign.changeDocument());
 await assert.rejects(foreign.read(),/Prepared graph document changed/);
 const absent=fixture();absent.hideBody();absent.pausePaint();
 await assert.rejects(absent.read(),/Node identity is not rendered/);
});

// Fifth-build frequency-2 journal :415 has the new DOM port TID; :418 has
// its alternate native shape with no attribute and the cached old caption.
test('Binning rebinds the same native output after caption replacement and alternate SVG rendering',async()=>{
 const f=fixture({portIndex:1});f.node.FIconCls='bg-vendor-icon-binning';await f.read();
 f.rename();const observed=await f.read();assert.equal(observed.nodes[0].label,'Квантование: X');
 const bound=await f.binding();assert.deepEqual(Array.from(bound.native_bindings[0].outputs),[1]);
});
test('Binning caption rebinding preserves native identity, unique DOM and exact port suffix guards',async()=>{
 for(const change of [f=>f.wrongHit(),f=>f.duplicatePort(),f=>f.losePortTid(),f=>{f.port.FGuid='foreign';},f=>{f.port.data={};},
  f=>{f.port.parent={};},f=>{f.port.FCell={...f.port.FCell};},f=>{f.port.FCell.parent={};},f=>{f.port.FType=0;},f=>{f.port.FSubType=9;},f=>f.rename('Output_Data-0')]){
  const f=fixture({portIndex:1});f.node.FIconCls='bg-vendor-icon-binning';await f.read();f.rename();change(f);
  await assert.rejects(f.read(),/Visible port identity/);
 }
});
// LAB-693 linreg-short-1/execution-events.jsonl:660: Output_Data-1 has
// an alternate native SVG without TID after the wizard replaces the caption.
test('linear regression rebinds its same native data port after caption replacement',async()=>{
 for(const suffix of ['Input_Data-0','Output_Data-0','Output_Data-1']){
  const f=fixture({portIndex:Number(suffix.at(-1))});f.node.FIconCls='bg-vendor-icon-linregression';
  if(suffix.startsWith('Input_'))f.input();
  await f.read();f.rename(suffix);
  const observed=await f.read();assert.equal(observed.nodes[0].label,'Линрегрессия: Y X1 X2 X3');
  const bound=await f.binding(),direction=suffix.startsWith('Input_')?'inputs':'outputs';
  assert.deepEqual(Array.from(bound.native_bindings[0][direction]),[Number(suffix.at(-1))]);
 }
});
test('linear regression caption rebinding retains native identity, unique DOM and exact suffix guards',async()=>{
 for(const change of [f=>f.wrongHit(),f=>f.duplicatePort(),f=>f.losePortTid(),f=>{f.port.FGuid='foreign';},f=>{f.port.data={};},
  f=>{f.port.parent={};},f=>{f.port.FCell={...f.port.FCell};},f=>{f.port.FCell.parent={};},f=>{f.port.FType=0;},f=>{f.port.FSubType=9;},
  f=>f.rename('Output_Data-0'),f=>f.rename('Input_Data-1'),f=>f.rename('Output_Var-1'),f=>f.changeDocument()]){
  const f=fixture({portIndex:1});f.node.FIconCls='bg-vendor-icon-linregression';await f.read();f.rename();change(f);
  await assert.rejects(f.binding(),/Visible port identity|Prepared graph document changed/);
 }
});
for(const suffix of ['Output_Data-0','Input_Data-0'])test('CrossTable rebinds '+suffix+' after row roles change its automatic caption',async()=>{
  const f=fixture();f.node.FIconCls=NODE_TYPES['transform.cross_table'].icon_class;
  if(suffix.startsWith('Input_'))f.input();
  f.rename(suffix,'R');await f.read();f.rename(suffix);
  const observed=await f.read();assert.equal(observed.nodes[0].label,'cols: Category; rows: R Segment; cells: Amount');
  const bound=await f.binding(),direction=suffix.startsWith('Input_')?'inputs':'outputs';
  assert.deepEqual(Array.from(bound.native_bindings[0][direction]),[0]);
});
test('CrossTable automatic caption changes preserve native ownership, DOM uniqueness and exact port guards',async()=>{
 for(const change of [f=>f.wrongHit(),f=>f.duplicatePort(),f=>f.losePortTid(),f=>{f.port.FGuid='foreign';},f=>{f.port.data={};},
  f=>{f.port.parent={};},f=>{f.port.FCell={...f.port.FCell};},f=>{f.port.FCell.parent={};},f=>{f.port.FType=0;},f=>{f.port.FSubType=9;},
  f=>f.rename('Output_Data-1'),f=>f.rename('Input_Data-0'),f=>f.rename('Output_Var-0'),f=>f.changeDocument()]){
  const f=fixture();f.node.FIconCls=NODE_TYPES['transform.cross_table'].icon_class;
  f.rename('Output_Data-0','R');await f.read();f.rename();change(f);
  await assert.rejects(f.binding(),/Visible port identity|Prepared graph document changed/);
 }
});
test('caption rebinding remains refused for other node types',async()=>{
 for(const type of ['transform.calculator','programming.javascript']){
  const f=fixture();f.node.FIconCls=NODE_TYPES[type].icon_class;await f.read();f.rename();
  await assert.rejects(f.read(),/Visible port identity/);
 }
});
