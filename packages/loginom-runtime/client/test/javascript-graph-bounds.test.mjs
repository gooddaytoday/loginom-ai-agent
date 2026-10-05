import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {captureManagedJavascriptSelection} from '../lib/javascript-managed-selection.mjs';
import {captureJavascriptSelection,inspectJavascriptSelection} from '../lib/javascript-owned-selection.mjs';
import {inspectJavascriptVisualizers} from '../lib/javascript-output-context.mjs';

function fixture(count){
 const prefix='MF;TF-1',tid=prefix+';Graph;JavaScript';
 const shape={isConnected:true,getAttribute:()=>tid,getBoundingClientRect:()=>({x:1,y:1,width:10,height:10}),
  contains:()=>false,closest:selector=>selector==='[data-tid]'?shape:null};
 const portShape={...shape,getAttribute:()=>tid+';Output_Data-0',querySelectorAll:()=>[{getAttribute:()=> 'output_table_active.svg'}]};
 const container={contains:value=>[shape,portShape].includes(value),querySelectorAll:()=>[shape,portShape]};
 const nodes=Array.from({length:count},(_,i)=>({FGuid:i?'other-'+i:'js',FIconCls:'bg-vendor-icon-javascript',data:{},FCell:{}}));
 const native=nodes[0],port={FGuid:'port',parent:native,FCell:{parent:native.FCell},data:{}};
 native.FPorts=[{FCollection:[port]}];
 const graph={container,getSelectionCells:()=>[native.FCell],view:{getState:cell=>({shape:{node:cell===port.FCell?portShape:shape}})}};
 class ModelForm{}
 const model=new ModelForm();model.FDiagram={FNodes:{FCollection:nodes},FmxGraph:graph};
 const workflow={},tab={Controller:{Node:{data:{node:workflow}},FController:model}};
 const tabElement={classList:{contains:()=>true}};
 const document={elementFromPoint:()=>shape,querySelectorAll:selector=>selector.includes('cmpDiagram')?[container]
  :selector.startsWith('[data-tid=')?[tabElement]:[]};
 const preparation={id:'doc',document,receipts:new Map([['receipt',{phase:'verified',workflowId:'flow',tab:tabElement,
  packageNode:{},nodeTargetWorkflowNode:workflow}]])};
 const task={owner:{document_id:'doc',workflow_id:'flow',node_id:'js'},workflow_ref:{tab_tid:'tab',prefix},targetOrigin:'http://test',targetBuild:'7.4.2'};
 const context={task,document,location:{origin:task.targetOrigin},getComputedStyle:()=>({visibility:'visible'}),innerWidth:100,innerHeight:100,
  bg:{app:{Version:task.targetBuild,ModelForm,Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'user'}},
   Items:{Workspace:{getActiveTab:()=>tab}}}}}}},__loginomDockPreparationV1:preparation};
 const capture=()=>runInNewContext('('+captureManagedJavascriptSelection.toString()+')(task,('+captureJavascriptSelection.toString()+'))',context);
 return {context,capture,nodes,native};
}
for(const count of [20,21,200])test('actual serialized JS selection and output observers accept bounded graph '+count,()=>{
 const f=fixture(count),held=f.capture();
 f.context.args={binding:held.binding,node:held.node,icon:'bg-vendor-icon-javascript',retained:held.retained,
  targetOrigin:'http://test',targetBuild:'7.4.2'};
 assert.equal(runInNewContext('('+inspectJavascriptSelection.toString()+')(args)',f.context).ready,true);
 f.context.args={binding:{...held.binding,...held.retained},node:held.node,output:{index:0,native_index:0,active:true,port_guid:'port'},
  targetOrigin:'http://test',targetBuild:'7.4.2'};
 assert.equal(runInNewContext('('+inspectJavascriptVisualizers.toString()+')(args)',f.context).active_port_verified,true);
});
for(const fault of ['201','duplicate','foreign'])test('actual JS captures retain graph bound and native uniqueness: '+fault,()=>{
 const f=fixture(200),held=f.capture();
 if(fault==='201')f.nodes.push({FGuid:'extra'});
 if(fault==='duplicate')f.nodes[1].FGuid='js';
 if(fault==='foreign')f.native.FGuid='foreign';
 assert.throws(f.capture,/graph owner unavailable/);
 f.context.args={binding:held.binding,node:held.node};
 assert.throws(()=>runInNewContext('('+captureJavascriptSelection.toString()+')(args)',f.context),/binding unavailable/);
 f.context.args={binding:held.binding,node:held.node,icon:'bg-vendor-icon-javascript',retained:held.retained,
  targetOrigin:'http://test',targetBuild:'7.4.2'};
 assert.throws(()=>runInNewContext('('+inspectJavascriptSelection.toString()+')(args)',f.context),/native owner changed/);
 f.context.args={binding:{...held.binding,...held.retained},node:held.node,output:{index:0,native_index:0,active:true,port_guid:'port'},
  targetOrigin:'http://test',targetBuild:'7.4.2'};
 assert.throws(()=>runInNewContext('('+inspectJavascriptVisualizers.toString()+')(args)',f.context),/native owner changed/);
});
