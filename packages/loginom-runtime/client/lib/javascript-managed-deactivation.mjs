import {createHash} from 'node:crypto';
import {withBrowserReceipt} from './executor.mjs';
import {inspectJavascriptWizardSettlement} from './javascript-wizard-settlement.mjs';
import {inspectManagedJavascriptWizardSettlement, makeJavascriptManagedWizardSettlementCode} from './javascript-managed-opening.mjs';

// Only the retained Setting lease can answer its own native deactivation
// question. Generic workspace actions deliberately deny script-node controls.
export function inspectManagedJavascriptDeactivationPoint({held,task},inspect) {
  const state=inspect({held,task});
  if(state.ready!==true||state.surface!=='deactivation'
    ||state.native_owner_verified!==true||state.pending_owner_verified!==true
    ||state.dialog_count!==1||state.root_visible!==false)
    throw Error('Managed JavaScript deactivation owner unavailable');
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
  const dialog=dialogs[0];
  const question='Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет';
  if(dialogs.length!==1||String(dialog.innerText??'').replace(/\s+/g,' ').trim()!==question)
    throw Error('Managed JavaScript deactivation dialog changed');
  const buttons=[...dialog.querySelectorAll('[data-tid="msgbox;tlb;yes"]')].filter(visible);
  const button=buttons[0],control=button&&globalThis.Ext?.getCmp?.(button.id);
  if(buttons.length!==1||control?.el?.dom!==button||control.disabled===true
    ||button.closest('.x-item-disabled,.x-btn-disabled')||button.getAttribute('aria-disabled')==='true'
    ||String(button.textContent??'').trim()!=='Да')
    throw Error('Managed JavaScript deactivation Yes unavailable');
  const box=button.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
  const hit=document.elementFromPoint(x,y);
  if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===button||button.contains(hit)))
    throw Error('Managed JavaScript deactivation Yes covered');
  return {x,y,tid:'msgbox;tlb;yes',node_id:task.owner.node_id};
}

export async function runManagedJavascriptDeactivationPoint(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true
    ||lease.deactivationAttempted===true||Date.now()>=task.deadline)
    throw Error('Managed JavaScript deactivation lease unavailable');
  return page.evaluate(inspect,{held:lease.handle,task});
}

export async function runManagedJavascriptDeactivation(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const outcome=(status,phase,effect_possible,output,error=null)=>({status,phase,effect_possible,
    cleanup_complete:true,action_key:'javascript.wizard.deactivation',action_revision:'1',
    operation_id:task.gesture_id,output,error,trace:[]});
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true
    ||lease.deactivationAttempted===true||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'DEACTIVATION_LEASE_UNAVAILABLE',message:'Deactivation lease unavailable'});
  const point=await page.evaluate(inspect,{held:lease.handle,task});
  if(JSON.stringify(point)!==JSON.stringify(task.point)||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'DEACTIVATION_POINT_CHANGED',message:'Deactivation point changed'});
  lease.deactivationAttempted=true;
  await page.mouse.click(point.x,point.y);
  return outcome('SUCCEEDED','gesture_returned',true,{deactivation_gesture_returned:true,wizard_open_verified:false});
}

export function makeJavascriptManagedDeactivationPointCode(task) {
  makeJavascriptManagedWizardSettlementCode(task);
  if(task.allowDeactivation!==true)throw Error('Managed JavaScript deactivation requires pending wizard');
  const inspect=`function inspect(args){const native=${inspectJavascriptWizardSettlement.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptWizardSettlement.toString()})(input,native);`+
    `return (${inspectManagedJavascriptDeactivationPoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptDeactivationPoint.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

export function makeJavascriptManagedDeactivationCode(task) {
  const {gesture_id,point,...base}=task??{};
  makeJavascriptManagedDeactivationPointCode(base);
  if(gesture_id!==task.operation_id+':deactivation'||point?.tid!=='msgbox;tlb;yes'
    ||point.node_id!==task.owner.node_id||!Number.isFinite(point.x)||!Number.isFinite(point.y))
    throw Error('Invalid managed JavaScript deactivation gesture');
  const inspect=`function inspect(args){const native=${inspectJavascriptWizardSettlement.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptWizardSettlement.toString()})(input,native);`+
    `return (${inspectManagedJavascriptDeactivationPoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptDeactivation.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

export async function dispatchManagedJavascriptDeactivation({task,execute,record,receiptOptions}) {
  const point=await execute(makeJavascriptManagedDeactivationPointCode(task));
  const gesture_id=task.operation_id+':deactivation';
  const gesture={...task,gesture_id,point};
  const code=makeJavascriptManagedDeactivationCode(gesture);
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const signature=hash([gesture_id,task.owner,point,task.deadline]);
  const prepared={phase:'javascript_managed_deactivation_prepared',operation_id:task.operation_id,
    gesture_id,owner:task.owner,point,deadline:task.deadline,effect_possible:false};
  const saved=await record(prepared);
  if(JSON.stringify(Object.fromEntries(Object.keys(prepared).map(key=>[key,saved?.[key]])))!==JSON.stringify(prepared))
    throw Error('Managed JavaScript deactivation journal ACK differs');
  const result=await execute(withBrowserReceipt('('+code+')(page)',{
    ...receiptOptions(gesture_id,'javascript.wizard.deactivation',signature),operation_id:gesture_id}),
    {timeout:Math.max(1,Math.min(35000,task.deadline-Date.now()+5000))});
  if(result?.operation_id!==gesture_id||result.action_key!=='javascript.wizard.deactivation')
    throw Error('Managed JavaScript deactivation receipt identity differs');
  return result;
}
