import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeTargetBrowserAdapter,readGraph} from '../lib/node-target-browser.mjs';
function fixture(){
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelForm{};
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[{tid:'crumb',label:'Scenario'}]}};
 const element=tid=>({getAttribute:()=>tid,textContent:'Scenario',getBoundingClientRect:()=>({width:10,height:10}),classList:{contains:()=>true}});
 const tab=element('tab'),root=element('MF;TF-1;ModelForm;cmpDiagram'),body=element('MF;TF-1;Graph;Calc'),portDom=element('MF;TF-1;Graph;Calc;Output_Data-0'),crumb=element('crumb'),labelDom=element('MF;TF-1;Graph;Calc;Label;Label');
 const alternatePortDom=element(null);let duplicateShape=false,wrongHit=false;
 root.contains=e=>e===body||e===portDom||e===alternatePortDom||e===labelDom;root.querySelectorAll=()=>[];
 const port={FCell:{visible:true}},node={FGuid:'n',FIconCls:'bg-vendor-icon-calcdata',FCell:{geometry:{x:10,y:10}},FPorts:[{FCollection:[port]}]};
 Object.assign(port,{FGuid:'port-guid',data:{},parent:node,FType:1,FSubType:1});port.FCell.parent=node.FCell;
 let portTid='MF;TF-1;Graph;Calc;Output_Data-0';portDom.getAttribute=()=>portTid;
 node.FLabel={parent:node,FCell:{parent:node.FCell,visible:true},FRawValue:'Calc'};
 let rendered=true,labelRendered=true,onPaint=()=>{},pausedPaint=false;
 const graph={container:root,getCellAt:()=>wrongHit?{}:port.FCell,view:{getState:cell=>cell===node.FCell?{shape:{node:body}}:cell===node.FLabel.FCell?(labelRendered?{text:{node:labelDom}}:null):rendered?{shape:{node:duplicateShape?alternatePortDom:portDom}}:null}};
 const model=Object.assign(new ModelForm(),{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FmxGraph:graph,FNodes:{FCollection:[node]}}});
 const packageNode=new PackageTreeNode(),workflowNode=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node:workflowNode}},FController:model}})}}}}}};
 const outside=[];
 const nodeList=values=>Object.assign(Object.fromEntries(values.map((v,i)=>[i,v])),{length:values.length,[Symbol.iterator]:function*(){yield* values;}});
 const document={querySelectorAll:selector=>nodeList(selector.startsWith('[data-tid^=')?[crumb]:[tab,root,body,portDom,...outside,...(labelRendered?[labelDom]:[])].filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']'))};
 const preparation={id:'doc',document,receipts:new Map([['p',{phase:'verified',workflowId:'wf',packageNode,tab}]])};
 const context=vm.createContext({document,location:{origin:'http://loginom.test'},bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'}),setTimeout,clearTimeout,requestAnimationFrame:callback=>{if(pausedPaint)return;onPaint();callback(0);}});
 const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context)};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://loginom.test',build:'7.4.2',pinned:{},execute:code=>vm.runInNewContext('('+code+')',{...context})(page)});
 return {binding:()=>readGraph(page,{request,types:{},origin:'http://loginom.test',build:'7.4.2',read_bindings:true}),outline:()=>{outside.push(element(portTid),element(labelDom.getAttribute()));},read:()=>adapter.observe(request,Date.now()+1000),alternateShape:()=>{duplicateShape=true;},wrongHit:()=>{wrongHit=true;},losePortTid:()=>{portTid=null;},hide:()=>{rendered=false;},show:()=>{rendered=true;},paintWith:callback=>{onPaint=callback;},pausePaint:()=>{pausedPaint=true;},hideLabel:()=>{labelRendered=false;},port,node,labelDom};
}
test('outline copies outside the prepared canvas do not replace its port or label bindings',async()=>{
 const f=fixture();f.outline();await f.read();f.alternateShape();assert.deepEqual(Array.from((await f.read()).nodes[0].outputs),[0]);
 f.losePortTid();await assert.rejects(f.read(),/Visible port identity/);
});
test('rerendered port without data-tid retains only its previously bound native identity',async()=>{
 const f=fixture();await f.read();f.alternateShape();
 assert.deepEqual(Array.from((await f.read()).nodes[0].outputs),[0]);
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
