import {makeJavascriptManagedSelectionReadCode,dispatchManagedJavascriptBody,dispatchManagedJavascriptSetting} from '../../client/lib/javascript-managed-selection.mjs';
import {waitManagedJavascriptWizardSettlement} from '../../client/lib/javascript-managed-opening.mjs';
import {randomUUID} from 'node:crypto';

// Private headed probe for the same serialized boundary used by node.apply.
// A fresh node cannot require deactivation; an uncertain Setting keeps cleanup gated.
export async function openManagedJavascriptInitialWizard({page,prepared,node,deadline,record,lifecycle,report,save,retainLease=false}) {
  if(lifecycle.attempted)throw Error('Managed initial JavaScript opening already attempted');
  Object.assign(lifecycle,{attempted:true,deadline,openingIntent:false,settingDispatched:false,
    settingGestureReturned:false,wizardVisible:false});
  report.initial_opening=lifecycle;
  const owner={document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:node.id};
  const task={operation_id:'managed-js-'+randomUUID(),owner,
    workflow_ref:{tab_tid:prepared.workflow_ref.tab_tid,prefix:prepared.workflow_ref.prefix},
    targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',deadline};
  const execute=code=>Function('return ('+code+')')()(page);
  const namespace='private-managed-js-'+randomUUID();
  const receiptOptions=(id,key,signature)=>({receipt_namespace:namespace,receipt_id:id,receipt_signature:signature});
  const before=await execute(makeJavascriptManagedSelectionReadCode({...task,mode:'capture'}));
  const selected=before.ready===true?before:(await dispatchManagedJavascriptBody({task,before,execute,record,receiptOptions})).output?.selection;
  if(selected?.ready!==true||Date.now()>=deadline)throw Error('Managed initial JavaScript selection unconfirmed');
  lifecycle.openingIntent=true;
  const confirmation={kind:'deactivation',node:owner,graph_tid:node.tid,
    opening:{initial_fresh_node:true,workflow_id:owner.workflow_id}};
  const gesture=await dispatchManagedJavascriptSetting({task,before:selected,confirmation,execute,record,receiptOptions,
    onPrepared:async()=>{
      lifecycle.settingDispatched=true;
      report.effects.push({at:new Date().toISOString(),action:'open-wizard-managed',node_id:node.id,state:'dispatching'});
      await save();
    }});
  if(gesture.status!=='SUCCEEDED'){
    if(gesture.status==='NOT_APPLIED'&&gesture.phase==='preflight'&&gesture.effect_possible===false)
      lifecycle.settingDispatched=false;
    throw Error('Managed initial JavaScript Setting refused');
  }
  lifecycle.settingGestureReturned=true;
  const settled=await waitManagedJavascriptWizardSettlement({task:{...task,prepared:{document_id:owner.document_id,
    workflow_ref:prepared.workflow_ref,node:owner},allowDeactivation:true},execute,record});
  if(settled.surface!=='wizard'||settled.native_owner_verified!==true||Date.now()>=deadline)
    throw Error('Managed initial JavaScript wizard not confirmed');
  lifecycle.wizardVisible=true;
  await save();
  if(!retainLease)await execute(makeJavascriptManagedSelectionReadCode({...task,mode:'dispose'}));
  return retainLease?{...settled,source_task:{...task,prepared:{document_id:owner.document_id,
    workflow_ref:prepared.workflow_ref,node:owner},allowDeactivation:true}}:settled;
}
