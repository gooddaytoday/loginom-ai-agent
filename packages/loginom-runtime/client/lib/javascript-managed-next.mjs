import {createHash} from 'node:crypto';
import {withBrowserReceipt} from './executor.mjs';
import {makeJavascriptManagedPageCode, inspectManagedJavascriptPage} from './javascript-managed-page.mjs';
import {makeJavascriptManagedGenerationCode} from './javascript-managed-generation.mjs';
import {wizardReadiness} from './javascript-wizard-page.mjs';

// This private route admits only the observed Columns -> Code transition. The
// full page inspector checks native owner, indicators, masks and address first.
export function inspectManagedJavascriptNextPoint({held,task,expected},inspect) {
  const state=inspect({held,task});
  const prefix=task.workflow_ref.prefix;
  if(state.ready!==true||state.node_guid!==task.owner.node_id
    ||state.page?.tid!==prefix+';WizrdMCF;JavaScriptColumnsWizard'
    ||state.page.index!==0||state.page.indicator_count!==4
    ||JSON.stringify(state.page)!==JSON.stringify(expected.page))
    throw Error('Managed JavaScript Next source page changed');
  const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const root=held.wizardRoot;
  if(tab!==held.binding.tab||tab?.Controller?.Node?.data?.node!==held.wizard
    ||tab?.Controller?.FController?.FView?.el?.dom!==root
    ||!root?.isConnected||root.getAttribute('data-tid')!==prefix+';WizrdMCF')
    throw Error('Managed JavaScript Next wizard owner changed');
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const buttons=[...root.querySelectorAll('[data-tid='+JSON.stringify(prefix+';WizrdMCF;btnNext')+']')].filter(visible);
  const button=buttons[0],control=button&&globalThis.Ext?.getCmp?.(button.id);
  if(buttons.length!==1||control?.el?.dom!==button||control.disabled===true
    ||button.closest('.x-item-disabled,.x-btn-disabled')||button.getAttribute('aria-disabled')==='true')
    throw Error('Managed JavaScript Next button unavailable');
  const bounds=button.getBoundingClientRect(),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  const hit=document.elementFromPoint(x,y);
  if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===button||button.contains(hit)))
    throw Error('Managed JavaScript Next button covered');
  return {x,y,tid:button.getAttribute('data-tid'),from_index:state.page.index,from_tid:state.page.tid};
}

export async function runManagedJavascriptNextPoint(page,task,expected,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured
    ||lease.nextAttempted===true||Date.now()>=task.deadline)
    throw Error('Managed JavaScript Next lease unavailable');
  return page.evaluate(inspect,{held:lease.handle,task,expected});
}

export async function runManagedJavascriptNext(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const outcome=(status,phase,effect_possible,output,error=null)=>({status,phase,effect_possible,
    cleanup_complete:true,action_key:'javascript.wizard.next',action_revision:'1',
    operation_id:task.gesture_id,output,error,trace:[]});
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured
    ||lease.nextAttempted===true||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'NEXT_LEASE_UNAVAILABLE',message:'Next lease unavailable'});
  const point=await page.evaluate(inspect,{held:lease.handle,task,expected:task.expected});
  if(JSON.stringify(point)!==JSON.stringify(task.point)||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'NEXT_POINT_CHANGED',message:'Next point changed'});
  lease.nextAttempted=true;
  await page.mouse.click(point.x,point.y);
  return outcome('SUCCEEDED','gesture_returned',true,{next_gesture_returned:true,
    from_tid:point.from_tid,from_index:point.from_index,transition_verified:false});
}

export function makeJavascriptManagedNextPointCode(task,expected) {
  const {gesture_id,expected:ignoredExpected,point:ignoredPoint,...base}=task;
  makeJavascriptManagedPageCode(base);
  if(expected?.ready!==true||expected.node_guid!==task.owner.node_id
    ||expected.page?.tid!==task.workflow_ref.prefix+';WizrdMCF;JavaScriptColumnsWizard'
    ||expected.page.index!==0||expected.page.indicator_count!==4)
    throw Error('Invalid managed JavaScript Next source page');
  const inspect=`function inspect(args){const native=${wizardReadiness.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptPage.toString()})(input,native);`+
    `return (${inspectManagedJavascriptNextPoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptNextPoint.toString()})(page,${JSON.stringify(task)},${JSON.stringify({page:expected.page})},${inspect})`;
}

export function makeJavascriptManagedNextCode(task) {
  makeJavascriptManagedNextPointCode(task,task.expected);
  if(task.gesture_id!==task.operation_id+':next-columns-code'
    ||task.point?.tid!==task.workflow_ref.prefix+';WizrdMCF;btnNext'
    ||!Number.isFinite(task.point?.x)||!Number.isFinite(task.point?.y)
    ||task.point.from_index!==0||task.point.from_tid!==task.expected.page.tid)
    throw Error('Invalid managed JavaScript Next gesture');
  const inspect=`function inspect(args){const native=${wizardReadiness.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptPage.toString()})(input,native);`+
    `return (${inspectManagedJavascriptNextPoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptNext.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

export async function dispatchManagedJavascriptNext({task,execute,record,receiptOptions}) {
  const before=await execute(makeJavascriptManagedPageCode(task));
  const point=await execute(makeJavascriptManagedNextPointCode(task,before));
  const gesture_id=task.operation_id+':next-columns-code';
  const gesture={...task,gesture_id,expected:{ready:true,node_guid:before.node_guid,page:before.page},point};
  const code=makeJavascriptManagedNextCode(gesture);
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const signature=hash([gesture_id,task.owner,before.page,point,task.deadline]);
  const prepared={phase:'javascript_managed_next_prepared',operation_id:task.operation_id,
    gesture_id,owner:task.owner,from_tid:before.page.tid,from_index:before.page.index,
    point,snapshot_sha256:hash(before.page),deadline:task.deadline,effect_possible:false};
  const saved=await record(prepared);
  if(JSON.stringify(Object.fromEntries(Object.keys(prepared).map(key=>[key,saved?.[key]])))!==JSON.stringify(prepared))
    throw Error('Managed JavaScript Next journal ACK differs');
  const result=await execute(withBrowserReceipt('('+code+')(page)',{
    ...receiptOptions(gesture_id,'javascript.wizard.next',signature),operation_id:gesture_id}),
    {timeout:Math.max(1,Math.min(35000,task.deadline-Date.now()+5000))});
  if(result?.operation_id!==gesture_id||result.action_key!=='javascript.wizard.next')
    throw Error('Managed JavaScript Next receipt identity differs');
  return result;
}

// Keep browser receipt composition at the existing managed dispatcher boundary.
export async function dispatchManagedJavascriptGeneration({task, execute, record, receiptOptions}) {
  await execute(makeJavascriptManagedPageCode(task));
  const before = await execute(makeJavascriptManagedGenerationCode(task));
  if (before.schema?.generation?.checked === true)
    return {status: 'SUCCEEDED', effect_possible: false, output: {generation: true,
      schema: before.schema, generation_readback_verified: true, wizard_commit_verified: false}};
  const gesture_id = task.operation_id + ':generation-code';
  const code = makeJavascriptManagedGenerationCode({...task, gesture_id}, before);
  const signature = createHash('sha256').update(JSON.stringify([gesture_id, task.owner, before, task.deadline])).digest('hex');
  const event = {phase: 'javascript_managed_generation_prepared', operation_id: task.operation_id,
    gesture_id, owner: task.owner, deadline: task.deadline, previous_generation: false,
    generation: true, snapshot_sha256: signature, effect_possible: false};
  const ack = await record(event);
  if (JSON.stringify(Object.fromEntries(Object.keys(event).map(key => [key, ack?.[key]]))) !== JSON.stringify(event))
    throw Error('Managed JavaScript generation journal ACK differs');
  const result = await execute(withBrowserReceipt('(' + code + ')(page)', {
    ...receiptOptions(gesture_id, 'javascript.schema.generation', signature), operation_id: gesture_id}),
    {timeout: Math.max(1, Math.min(35000, task.deadline - Date.now() + 5000))});
  if (result?.operation_id !== gesture_id || result.action_key !== 'javascript.schema.generation')
    throw Error('Managed JavaScript generation receipt identity differs');
  return result;
}
