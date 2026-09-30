import vm from 'node:vm';
import {makeJavascriptManagedStageCode} from '../../lib/javascript-managed-stage.mjs';
import {javascriptStageFixture} from './javascript-stage-fixture.mjs';
export function managedJavascriptStageFixture() {
 const f=javascriptStageFixture(),deadline=Date.now()+60000;
 const owner={document_id:'document',workflow_id:'workflow',node_id:'node'};
 const workflow_ref={prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1'};
 const task={operation_id:'managed-stage',owner,workflow_ref,
  prepared:{document_id:'document',node:owner,workflow_ref:{...workflow_ref,workflow_id:'workflow',navigation_path:[{tid:'path',label:'Scenario'}]}},
  allowDeactivation:true,targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',deadline};
 const workflow={},receipt={phase:'verified',workflowId:'workflow',nodeTargetWorkflowNode:workflow,packageNode:{}};
 workflow.ParentNode=receipt.packageNode;
 f.binding.workflow=workflow;f.native.ParentNode={FGuid:'node',FModelNode:f.binding.nodeData,ParentNode:workflow};
 f.context.bg.app.Application.FInstance.FMainForm.FMapTree.PackageNodes={Count:1,Items:()=>receipt.packageNode};
 const preparation={document:f.context.document,id:'document',receipts:new Map([['receipt',receipt]])};
 f.context.__loginomDockPreparationV1=preparation;f.context.TextEncoder=TextEncoder;f.context.location={origin:task.targetOrigin};
 const held={preparation,receipt,binding:f.binding,retained:{},account:'jsteach',wizard:f.native,wizardRoot:f.root};
 const lease={identity:JSON.stringify([owner,task.workflow_ref,task.targetOrigin,task.targetBuild,deadline]),settingAttempted:true,wizardCaptured:{},handle:held};
 const ledger=new Map([[task.operation_id,lease]]),page={evaluate:async(fn,args)=>vm.runInContext('('+fn.toString()+')',f.context)(args),[Symbol.for('loginom-dock.javascript-owned-selection-v1')]:ledger};
 const run=()=>Function('return ('+makeJavascriptManagedStageCode(task)+')')()(page);
 return {...f,task,lease,held,ledger,page,run};
}
