import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeJavascriptManagedWizardSettlementCode,waitManagedJavascriptWizardSettlement} from '../lib/javascript-managed-opening.mjs';
import {createJavascriptSourceAdmission} from '../lib/javascript-source-admission.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {makeJavascriptManagedDeactivationPointCode} from '../lib/javascript-managed-deactivation.mjs';

function fixture(fault){
 const document={},packageNode={},workflow={ParentNode:packageNode},nodeData={},cell={},model={FDiagram:{FmxGraph:{}}};
 const native={FGuid:'node',data:nodeData,FCell:cell},card={Controller:{Node:{data:{node:workflow}},FController:model}};
 const tab={classList:{contains:()=>true}},receipt={phase:'verified',workflowId:'flow',nodeTargetWorkflowNode:workflow,packageNode,tab};
 const preparation={document,id:'doc',receipts:new Map([['owner',receipt]])};
 const task={operation_id:'managed',owner:{document_id:'doc',workflow_id:'flow',node_id:'node'},
  workflow_ref:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1'},
  targetOrigin:'https://test.invalid',targetBuild:'7.4.2',deadline:Date.now()+60000,allowDeactivation:true};
 task.prepared={document_id:'doc',node:task.owner,workflow_ref:{...task.workflow_ref,workflow_id:'flow',
  navigation_path:[{tid:'PRIVATE_EXPECTED_PATH',label:'PRIVATE_EXPECTED_LABEL'}]}};
 const held={preparation,receipt,account:'account',binding:{workflow,tab:card},
  retained:{document,native,nodeData,cell,model,controller:card.Controller,diagram:model.FDiagram,graph:model.FDiagram.FmxGraph}};
 const crumbs=Array.from({length:fault==='count'?4:1},()=>({
  getAttribute:()=>fault==='tid'?'PRIVATE_ACTUAL_PATH':'PRIVATE_EXPECTED_PATH',
  textContent:fault==='label'?'PRIVATE_ACTUAL_LABEL':'PRIVATE_EXPECTED_LABEL'}));
 document.querySelectorAll=selector=>selector.includes(task.workflow_ref.tab_tid)?[tab]
  :selector.includes('cnrNaviMode')?crumbs:[];
 const context={document,__loginomDockPreparationV1:preparation,location:{origin:task.targetOrigin},
  bg:{app:{Version:task.targetBuild,Application:{FInstance:{FMainForm:{
   FMapTree:{FServerConnection:{UserName:'account'}},Items:{Workspace:{getActiveTab:()=>card}}}}}}}};
 const calls=[],page={
  [Symbol.for('loginom-dock.javascript-owned-selection-v1')]:new Map([[task.operation_id,{
   identity:JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]),
   settingAttempted:true,handle:held}]]),
  evaluate:async(fn,args)=>{calls.push('evaluate');return vm.runInNewContext('('+fn.toString()+')(args)',{...context,args});}};
 const run=vm.runInNewContext('('+makeJavascriptManagedWizardSettlementCode(task)+')');
 const read=async()=>JSON.parse(JSON.stringify(await run(page)));
 return {read,run:()=>waitManagedJavascriptWizardSettlement({task,execute:read,record:async e=>e}),calls,task,page};
}

test('navigation diagnostics add no browser read and preserve transport errors',async()=>{
 const f=fixture('valid'),result=await f.read();
 assert.equal(result.native_owner_verified,true);assert.equal(result.javascript_source_boundary_refusal,undefined);
 assert.deepEqual(f.calls,['evaluate']);
 const error=Error('transport failure');f.page.evaluate=async()=>{throw error;};
 await assert.rejects(f.run(),e=>e===error);
});

test('shared deactivation inspector keeps its original navigation refusal',async()=>{
 const f=fixture('tid'),run=vm.runInNewContext('('+makeJavascriptManagedDeactivationPointCode(f.task)+')');
 await assert.rejects(run(f.page),{message:'Wizard settlement navigation changed'});
 assert.deepEqual(f.calls,['evaluate']);
});

for(const fault of ['count','tid','label'])test('serialized navigation diagnostic stays private: '+fault,async()=>{
 const f=fixture(fault),events=[];
 const adapter={open:f.run,read:()=>{throw Error('unexpected read');},discard:()=>{throw Error('unexpected discard');}};
 const admission=createJavascriptSourceAdmission({kind:'existing',owner:{...f.task.owner,operation_id:'source',ui_epoch:1},
  deadline:f.task.deadline,sourceAdapter:async()=>adapter,redactor:createRedactor(),
  record:async e=>{events.push(structuredClone(e));return e;}});
 await assert.rejects(admission.admit({}),{code:'boundary',message:'JavaScript source admission refused: boundary'});
 const refused=events.find(e=>e.phase==='javascript_source_boundary_refused');
 assert.equal(refused.reason,'Wizard settlement navigation changed');
 assert.equal(refused.diagnostic.scope,'navigation');
 assert.equal(refused.diagnostic.checks[0].field,'navigation.'+({count:'count_within_bound',tid:'tid_matches',label:'label_matches'})[fault]);
 assert.deepEqual(f.calls,['evaluate']);
 assert.equal(JSON.stringify(events).includes('PRIVATE'),false);
 assert.equal(admission.state,'retired');
});
