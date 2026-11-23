import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readUserVariablesSnapshot} from '../lib/crosstable-variables.mjs';

// Execute the serialized production browser inspection, including its native
// package read. Save binds both preparation receipts to this same workflow.
function fixture() {
 class ModelForm {}
 class ModelUnitItemTreeNode {}
 const workflow={ParentNode:new ModelUnitItemTreeNode()},tab={classList:{contains:name=>name==='x-tab-active'}};
 const pack={},packageNode={Package:pack,HasRunningNodes:()=>false};
 const model=Object.assign(new ModelForm(),{FDiagram:{FNodes:{FCollection:[{FGuid:'user',FIconCls:'bg-vendor-icon-modelvariables'}]}}});
 const card={Controller:{FController:model,Node:{data:{node:workflow}}}};
 let reads=0;
 const document={querySelectorAll:()=>[tab]},preparation={document,id:'doc',receipts:new Map()};
 const receipt={phase:'verified',workflowId:'wf',tab,packageNode,nodeTargetWorkflowNode:workflow};
 preparation.receipts.set('first',receipt);
 preparation.receipts.set('existing-workflow',{...receipt});
 const app={Version:'7.4.2',ModelForm,ModelUnitItemTreeNode,Application:{FInstance:{FMainForm:{
  Items:{Workspace:{getActiveTab:()=>card}},FMapTree:{FServerConnection:{Session:{IsPackageModified:async value=>{assert.equal(value,pack);reads++;return false;}}}}
 }}}};
 const context=vm.createContext({document,location:{origin:'https://loginom.test'},bg:{app},__loginomDockPreparationV1:preparation});
 const page={evaluate:async(fn,arg)=>{context.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',context);}};
 const task={origin:'https://loginom.test',build:'7.4.2',deadline:Date.now()+5000,operation_id:'read',probe_only:true,
  binding:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'WF',tab_tid:'tab'},node:{node_id:'user'}}};
 return {receipt,preparation,workflow,app,context,task,reads:()=>reads,
  run:()=>readUserVariablesSnapshot(page,task,async()=>({verified:true,surface:'graph',locked:false}),()=>assert.fail('Probe must not open a wizard'),()=>{},()=>{})};
}

test('snapshot accepts two verified preparation receipts sharing the native workflow after Save',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);
 assert.equal(result.package_modified,false);assert.equal(f.reads(),1);
});

for(const field of ['nodeTargetWorkflowNode','tab','packageNode'])
test('snapshot refuses conflicting preparation '+field+' before package access',async()=>{
 const f=fixture();f.preparation.receipts.get('existing-workflow')[field]={};
 const result=await f.run();assert.equal(result.status,'NOT_APPLIED');
 assert.match(result.error,/Root user snapshot owner changed/);assert.equal(f.reads(),0);
});

for(const change of ['empty','unverified','origin','build','document','document-id','root-class'])
test('snapshot retains '+change+' ownership refusal',async()=>{
 const f=fixture();
 if(change==='empty')f.preparation.receipts.clear();
 if(change==='unverified')for(const r of f.preparation.receipts.values())r.phase='pending';
 if(change==='origin')f.context.location.origin='https://foreign.test';
 if(change==='build')f.app.Version='other';
 if(change==='document')f.preparation.document={};
 if(change==='document-id')f.preparation.id='other';
 if(change==='root-class')f.workflow.ParentNode={};
 const result=await f.run();assert.equal(result.status,'NOT_APPLIED');
 assert.match(result.error,/Root user snapshot owner changed/);assert.equal(f.reads(),0);
});
