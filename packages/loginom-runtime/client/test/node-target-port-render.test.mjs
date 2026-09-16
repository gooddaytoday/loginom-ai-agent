import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
function fixture(){
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelForm{};
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[{tid:'crumb',label:'Scenario'}]}};
 const element=tid=>({getAttribute:()=>tid,textContent:'Scenario',getBoundingClientRect:()=>({width:10,height:10}),classList:{contains:()=>true}});
 const tab=element('tab'),root=element('MF;TF-1;ModelForm;cmpDiagram'),body=element('MF;TF-1;Graph;Calc'),portDom=element('MF;TF-1;Graph;Calc;Output_Data-0'),crumb=element('crumb'),labelDom=element('MF;TF-1;Graph;Calc;Label;Label');
 root.contains=e=>e===body||e===portDom||e===labelDom;root.querySelectorAll=()=>[];
 const port={FCell:{visible:true}},node={FGuid:'n',FIconCls:'bg-vendor-icon-calcdata',FCell:{geometry:{x:10,y:10}},FPorts:[{FCollection:[port]}]};
 node.FLabel={parent:node,FCell:{parent:node.FCell,visible:true},FRawValue:'Calc'};
 let rendered=true,labelRendered=true;
 const graph={container:root,view:{getState:cell=>cell===node.FCell?{shape:{node:body}}:cell===node.FLabel.FCell?(labelRendered?{text:{node:labelDom}}:null):rendered?{shape:{node:portDom}}:null}};
 const model=Object.assign(new ModelForm(),{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FmxGraph:graph,FNodes:{FCollection:[node]}}});
 const packageNode=new PackageTreeNode(),workflowNode=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node:workflowNode}},FController:model}})}}}}}};
 const document={querySelectorAll:selector=>selector.startsWith('[data-tid^=')?[crumb]:[tab,root,body,portDom,...(labelRendered?[labelDom]:[])].filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']')};
 const preparation={id:'doc',document,receipts:new Map([['p',{phase:'verified',workflowId:'wf',packageNode,tab}]])};
 const context=vm.createContext({document,location:{origin:'http://loginom.test'},bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'})});
 const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context)};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://loginom.test',build:'7.4.2',pinned:{},execute:code=>vm.runInNewContext('('+code+')',{...context})(page)});
 return {read:()=>adapter.observe(request,Date.now()+1000),hide:()=>{rendered=false;},hideLabel:()=>{labelRendered=false;},port,node,labelDom};
}
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
