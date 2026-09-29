import {inspectJavascriptWizardSettlement} from './javascript-wizard-settlement.mjs';
import {makeJavascriptManagedSelectionReadCode} from './javascript-managed-selection.mjs';

// The same retained graph lease is read after Setting. This function does not
// answer a deactivation dialog or claim that a returned gesture opened a wizard.
export function inspectManagedJavascriptWizardSettlement({held,task},inspect) {
  const preparation=globalThis.__loginomDockPreparationV1;
  const account=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName;
  if(preparation!==held.preparation||preparation?.document!==document
    ||preparation.id!==task.owner.document_id||account!==held.account
    ||![...(preparation.receipts?.values()??[])].includes(held.receipt)
    ||held.receipt.phase!=='verified'||held.receipt.workflowId!==task.owner.workflow_id
    ||held.receipt.nodeTargetWorkflowNode!==held.binding.workflow)
    throw Error('Managed JavaScript wizard preparation changed');
  return inspect({binding:{...held.retained,...held.binding},prepared:task.prepared,
    allowDeactivation:task.allowDeactivation,targetOrigin:task.targetOrigin,targetBuild:task.targetBuild});
}

export async function runManagedJavascriptWizardSettlement(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true)
    throw Error('Managed JavaScript Setting opening has no owned lease');
  return page.evaluate(inspect,{held:lease.handle,task});
}

export function makeJavascriptManagedWizardSettlementCode(task) {
  const {prepared,allowDeactivation,...base}=task??{};
  makeJavascriptManagedSelectionReadCode({...base,mode:'inspect'});
  const workflow=prepared?.workflow_ref,path=workflow?.navigation_path;
  if(allowDeactivation!==true&&allowDeactivation!==false
    ||!prepared||Object.keys(prepared).sort().join(',')!=='document_id,node,workflow_ref'
    ||prepared.document_id!==task.owner.document_id
    ||!prepared.node||Object.keys(prepared.node).sort().join(',')!=='document_id,node_id,workflow_id'
    ||!['document_id','workflow_id','node_id'].every(key=>prepared.node[key]===task.owner[key])
    ||!workflow||Object.keys(workflow).sort().join(',')!=='navigation_path,prefix,tab_tid,workflow_id'
    ||workflow.workflow_id!==task.owner.workflow_id
    ||workflow.tab_tid!==task.workflow_ref.tab_tid||workflow.prefix!==task.workflow_ref.prefix
    ||!Array.isArray(path)||path.length<1||path.length>32
    ||path.some(item=>!item||Object.keys(item).sort().join(',')!=='label,tid'
      ||typeof item.tid!=='string'||item.tid.length<1||item.tid.length>1024
      ||typeof item.label!=='string'||item.label.length>256))
    throw Error('Invalid managed JavaScript wizard settlement');
  const inspector=`function inspect(args){const native=${inspectJavascriptWizardSettlement.toString()};return (${inspectManagedJavascriptWizardSettlement.toString()})(args,native);}`;
  return `async page=>(${runManagedJavascriptWizardSettlement.toString()})(page,${JSON.stringify(task)},${inspector})`;
}

export async function waitManagedJavascriptWizardSettlement({task,execute,record,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const code=makeJavascriptManagedWizardSettlementCode(task);
  let first=true,last;
  while(Date.now()<task.deadline){
    last=await execute(code);
    if(first){
      const event={phase:'javascript_managed_wizard_settlement_before',operation_id:task.operation_id,
        owner:task.owner,deadline:task.deadline,observation:last};
      const saved=await record(event);
      if(JSON.stringify(Object.fromEntries(Object.keys(event).map(key=>[key,saved?.[key]])))!==JSON.stringify(event))
        throw Error('Managed JavaScript wizard settlement journal ACK differs');
      first=false;
    }
    if(last.ready===true&&Date.now()<task.deadline){
      const event={phase:'javascript_managed_wizard_settlement_verified',operation_id:task.operation_id,
        owner:task.owner,deadline:task.deadline,observation:last};
      const saved=await record(event);
      if(JSON.stringify(Object.fromEntries(Object.keys(event).map(key=>[key,saved?.[key]])))!==JSON.stringify(event))
        throw Error('Managed JavaScript wizard verification journal ACK differs');
      return last;
    }
    await wait(Math.min(100,Math.max(1,task.deadline-Date.now())));
  }
  throw Error('Managed JavaScript wizard opening unconfirmed before original deadline');
}
