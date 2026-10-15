import {captureJavascriptSelection,inspectJavascriptSelection} from './javascript-owned-selection.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createHash} from 'node:crypto';

// These functions run inside the authenticated Loginom page. The generated
// wrappers below embed their fixed dependencies; no caller-provided code runs.
export function captureManagedJavascriptSelection(task,capture) {
  const app=globalThis.bg?.app,preparation=globalThis.__loginomDockPreparationV1;
  const form=app?.Application?.FInstance?.FMainForm,tab=form?.Items?.Workspace?.getActiveTab?.();
  const receipts=[...(preparation?.receipts?.values()??[])].filter(item=>item.phase==='verified'
    &&item.workflowId===task.owner.workflow_id);
  const workflow=tab?.Controller?.Node?.data?.node,model=tab?.Controller?.FController;
  const diagram=model?.FDiagram,graph=diagram?.FmxGraph,nodes=diagram?.FNodes?.FCollection;
  const found=Array.isArray(nodes)&&nodes.length<=200?nodes.filter(item=>item.FGuid===task.owner.node_id):[];
  const native=found[0],shape=native&&graph?.view?.getState?.(native.FCell)?.shape?.node;
  const tid=shape?.getAttribute?.('data-tid');
  const tabs=[...document.querySelectorAll('[data-tid='+JSON.stringify(task.workflow_ref.tab_tid)+']')];
  const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(task.workflow_ref.prefix+';ModelForm;cmpDiagram')+']')];
  const account=form?.FMapTree?.FServerConnection?.UserName;
  if(document!==preparation?.document||preparation.id!==task.owner.document_id
    ||location.origin!==task.targetOrigin||app?.Version!==task.targetBuild
    ||!receipts.length||receipts.some(item=>item.tab!==receipts[0].tab
      ||item.packageNode!==receipts[0].packageNode
      ||item.nodeTargetWorkflowNode&&item.nodeTargetWorkflowNode!==workflow)
    ||!receipts.some(item=>item.nodeTargetWorkflowNode===workflow)
    ||tabs.length!==1||tabs[0]!==receipts[0].tab||!tabs[0].classList.contains('x-tab-active')
    ||!workflow||!app.ModelForm||!(model instanceof app.ModelForm)
    ||!diagram||!graph?.container||roots.length!==1||roots[0]!==graph.container
    ||found.length!==1
    ||native.FIconCls!=='bg-vendor-icon-javascript'||!native.data||!native.FCell
    ||!shape?.isConnected||!graph.container.contains(shape)
    ||typeof tid!=='string'||!tid.startsWith(task.workflow_ref.prefix+';Graph;')
    ||typeof account!=='string'||!account)
    throw Error('Managed JavaScript graph owner unavailable');
  const binding={document,tab,workflow,nodeData:native.data};
  const node={id:task.owner.node_id,tid};
  return {binding,node,icon:native.FIconCls,retained:capture({binding,node}),account,
    preparation,receipt:receipts.find(item=>item.nodeTargetWorkflowNode===workflow),
    tabElement:tabs[0],graphRoot:roots[0]};
}

export function inspectManagedJavascriptSelection({held,task},inspect) {
  const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
  const preparation=globalThis.__loginomDockPreparationV1;
  const tabs=[...document.querySelectorAll('[data-tid='+JSON.stringify(task.workflow_ref.tab_tid)+']')];
  const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(task.workflow_ref.prefix+';ModelForm;cmpDiagram')+']')];
  if(form?.FMapTree?.FServerConnection?.UserName!==held.account
    ||preparation!==held.preparation||preparation?.id!==task.owner.document_id
    ||![...(preparation.receipts?.values()??[])].includes(held.receipt)
    ||held.receipt.phase!=='verified'||held.receipt.workflowId!==task.owner.workflow_id
    ||held.receipt.nodeTargetWorkflowNode!==held.binding.workflow
    ||tabs.length!==1||tabs[0]!==held.tabElement||!tabs[0].classList.contains('x-tab-active')
    ||roots.length!==1||roots[0]!==held.graphRoot)
    throw Error('Managed JavaScript account or preparation changed');
  return {...inspect({binding:held.binding,node:held.node,icon:held.icon,retained:held.retained,
    requireSettings:true,requireVisualizers:false,inspectPhase:task.inspectPhase??'managed_observe',
    deadline:task.deadline,targetOrigin:task.targetOrigin,targetBuild:task.targetBuild,
    afterGesture:task.afterGesture===true}),node_tid:held.node.tid};
}

// The page-level lease is local to the same authenticated Playwright Page used
// by node.apply. It holds native object identity across serialized execute calls.
export async function runManagedJavascriptSelectionRead(page,task,capture,inspect) {
  const key=Symbol.for('loginom-dock.javascript-owned-selection-v1');
  const leases=page[key]??=new Map();
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(task.mode==='capture') {
    if(leases.has(task.operation_id)||leases.size>=8)throw Error('Managed JavaScript selection lease already held or full');
    const handle=await page.evaluateHandle(capture,task);
    const lease={handle,identity,bodySettled:false};
    leases.set(task.operation_id,lease);
    try{const result=await page.evaluate(inspect,{held:handle,task:{...task,afterGesture:false}});
      lease.bodySettled=result.ready===true;return result;}
    catch(error){leases.delete(task.operation_id);await handle.dispose();throw error;}
  }
  const lease=leases.get(task.operation_id);
  if(!lease||lease.identity!==identity)throw Error('Managed JavaScript selection lease changed');
  if(task.mode==='dispose'){
    leases.delete(task.operation_id);
    try { await lease.sourceEditorCaptured?.dispose(); }
    finally { try { await lease.wizardCaptured?.dispose(); }
      finally { await lease.handle.dispose(); } }
    return {disposed:true};
  }
  if(task.mode!=='inspect')throw Error('Unsupported managed JavaScript selection read');
  const result=await page.evaluate(inspect,{held:lease.handle,task:{...task,afterGesture:lease.afterGesture===true}});
  lease.bodySettled=result.ready===true;
  return result;
}

// A browser receipt wraps this function. A pre-click refusal is completed with
// no effect; a lost click reply leaves both browser receipt and lease uncertain.
export async function runManagedJavascriptSelectionBody(page,task,inspect) {
  const leases=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')];
  const lease=leases?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const outcome=(status,phase,effect_possible,output,error=null)=>({status,phase,effect_possible,
    cleanup_complete:true,action_key:'javascript.selection.body',action_revision:'1',
    operation_id:task.gesture_id,output,error,trace:[]});
  if(!lease||lease.identity!==identity||lease.bodyAttempted===true)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'SELECTION_LEASE_UNAVAILABLE',message:'Selection lease unavailable'});
  const current=await page.evaluate(inspect,{held:lease.handle,task:{...task,inspectPhase:'managed_pre_select_click',afterGesture:false}});
  const sameRedraw=current.dom_replacements===task.expected.dom_replacements
    ||task.expected.dom_replacements===0&&current.dom_replacements===1
      &&task.expected.node_selected===false&&current.node_selected===false;
  if(current.blocked===true||current.ready===true||!current.body_point
    ||!sameRedraw||JSON.stringify({...current,dom_replacements:task.expected.dom_replacements})!==JSON.stringify(task.expected)
    ||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'SELECTION_SNAPSHOT_CHANGED',message:'Selection snapshot changed'});
  lease.bodyAttempted=true;
  lease.afterGesture=true;
  lease.bodySettled=false;
  await page.mouse.click(current.body_point.x,current.body_point.y);
  return outcome('SUCCEEDED','gesture_returned',true,{body_gesture_returned:true,pre_click_dom_replacements:current.dom_replacements});
}

export async function runManagedJavascriptSetting(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const outcome=(status,phase,effect_possible,output,error=null)=>({status,phase,effect_possible,
    cleanup_complete:true,action_key:'javascript.selection.setting',action_revision:'1',
    operation_id:task.gesture_id,output,error,trace:[]});
  if(!lease||lease.identity!==identity||lease.bodySettled!==true||lease.settingAttempted===true)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'SETTING_LEASE_UNAVAILABLE',message:'Setting lease unavailable'});
  const current=await page.evaluate(inspect,{held:lease.handle,task:{...task,afterGesture:lease.afterGesture===true}});
  const sameRedraw=current.dom_replacements===task.expected.dom_replacements
    ||current.dom_replacements===task.expected.dom_replacements+1;
  if(current.blocked===true||current.ready!==true||!current.setting_point||!sameRedraw
    ||current.node_tid!==task.confirmation.graph_tid
    ||JSON.stringify({...current,dom_replacements:task.expected.dom_replacements})!==JSON.stringify(task.expected)
    ||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'SETTING_SNAPSHOT_CHANGED',message:'Setting snapshot changed'});
  lease.settingAttempted=true;
  await page.mouse.click(current.setting_point.x,current.setting_point.y);
  return outcome('SUCCEEDED','gesture_returned',true,{setting_gesture_returned:true,wizard_open_verified:false});
}

export function makeJavascriptManagedSelectionReadCode(task) {
  const owner=task?.owner;
  if(!['capture','inspect','dispose'].includes(task?.mode)
    ||typeof task.operation_id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(task.operation_id)
    ||!owner||Object.keys(owner).sort().join(',')!=='document_id,node_id,workflow_id'
    ||Object.values(owner).some(value=>typeof value!=='string'||!value)
    ||!task.workflow_ref||Object.keys(task.workflow_ref).sort().join(',')!=='prefix,tab_tid'
    ||typeof task.workflow_ref.tab_tid!=='string'
    ||!/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(task.workflow_ref.tab_tid)
    ||task.workflow_ref.prefix!=='MF;TF'+(task.workflow_ref.tab_tid.match(/;tb(-\d+)?$/)?.[1]??'')
    ||typeof task.targetOrigin!=='string'||!/^https?:\/\//.test(task.targetOrigin)
    ||task.targetBuild!=='7.4.2'||!Number.isSafeInteger(task.deadline)
    ||task.mode==='capture'&&task.deadline<=Date.now()
    ||task.inspectPhase!==undefined&&(typeof task.inspectPhase!=='string'||task.inspectPhase.length>64)
    ||Object.keys(task).some(key=>!['mode','operation_id','owner','workflow_ref','targetOrigin','targetBuild','deadline','inspectPhase'].includes(key)))
    throw Error('Invalid managed JavaScript selection read');
  const capture=`function capture(task){const native=${captureJavascriptSelection.toString()};return (${captureManagedJavascriptSelection.toString()})(task,native);}`;
  const inspect=`function inspect(args){const native=${inspectJavascriptSelection.toString()};return (${inspectManagedJavascriptSelection.toString()})(args,native);}`;
  return `async page=>(${runManagedJavascriptSelectionRead.toString()})(page,${JSON.stringify(task)},${capture},${inspect})`;
}

export function makeJavascriptManagedSelectionBodyCode(task) {
  const {expected,gesture_id,...base}=task??{};
  makeJavascriptManagedSelectionReadCode({...base,mode:'inspect'});
  if(typeof gesture_id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(gesture_id)
    ||base.deadline<=Date.now()
    ||!expected||expected.ready!==false||expected.blocked===true
    ||!Number.isFinite(expected.body_point?.x)||!Number.isFinite(expected.body_point?.y)
    ||JSON.stringify(expected).length>32768)
    throw Error('Invalid managed JavaScript body gesture');
  const inspect=`function inspect(args){const native=${inspectJavascriptSelection.toString()};return (${inspectManagedJavascriptSelection.toString()})(args,native);}`;
  return `async page=>(${runManagedJavascriptSelectionBody.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

export function makeJavascriptManagedSettingCode(task) {
  const {expected,gesture_id,confirmation,...base}=task??{};
  makeJavascriptManagedSelectionReadCode({...base,mode:'inspect'});
  if(typeof gesture_id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(gesture_id)
    ||base.deadline<=Date.now()
    ||!expected||expected.ready!==true
    ||!Number.isFinite(expected.setting_point?.x)||!Number.isFinite(expected.setting_point?.y)
    ||JSON.stringify(expected).length>32768
    ||confirmation?.kind!=='deactivation'||typeof confirmation.graph_tid!=='string'
    ||!confirmation.graph_tid.startsWith(task.workflow_ref.prefix+';Graph;')
    ||!['document_id','workflow_id','node_id'].every(key=>confirmation.node?.[key]===task.owner[key]))
    throw Error('Invalid managed JavaScript Setting gesture');
  const inspect=`function inspect(args){const native=${inspectJavascriptSelection.toString()};return (${inspectManagedJavascriptSelection.toString()})(args,native);}`;
  return `async page=>(${runManagedJavascriptSetting.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

// The caller owns the node operation journal. An exact ACK precedes the only
// browser mutation, and the same gesture ID is never retried after uncertainty.
export async function dispatchManagedJavascriptBody({task,before,execute,record,receiptOptions,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const gesture_id=task.operation_id+':body';
  const gesture={...task,mode:'body',gesture_id,expected:before};
  const code=makeJavascriptManagedSelectionBodyCode(gesture);
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const signature=digest([gesture_id,task.owner,before,task.deadline]);
  const prepared={phase:'javascript_managed_body_prepared',operation_id:task.operation_id,gesture_id,
    owner:task.owner,point:before.body_point,snapshot_sha256:digest(before),deadline:task.deadline,
    effect_possible:false};
  const saved=await record(prepared);
  if(JSON.stringify(Object.fromEntries(Object.keys(prepared).map(key=>[key,saved?.[key]])))!==JSON.stringify(prepared))
    throw Error('Managed JavaScript body journal ACK differs');
  const result=await execute(withBrowserReceipt('('+code+')(page)',{
    ...receiptOptions(gesture_id,'javascript.selection.body',signature),operation_id:gesture_id}),
    {timeout:Math.max(1,Math.min(35000,task.deadline-Date.now()+5000))});
  if(result?.operation_id!==gesture_id||result.action_key!=='javascript.selection.body')
    throw Error('Managed JavaScript body receipt identity differs');
  const returned={phase:'javascript_managed_body_returned',operation_id:task.operation_id,gesture_id,
    owner:task.owner,deadline:task.deadline,expected:before,receipt:structuredClone(result)};
  const ack=await record(structuredClone(returned));
  if(JSON.stringify(Object.fromEntries(Object.keys(returned).map(key=>[key,ack?.[key]])))!==JSON.stringify(returned))
    throw Error('Managed JavaScript body returned journal ACK differs');
  if(result.status!=='SUCCEEDED')return result;
  while(Date.now()<task.deadline){
    const after=await execute(makeJavascriptManagedSelectionReadCode({...task,mode:'inspect',inspectPhase:'post_body'}));
    if(after.blocked===true)throw Error('Managed JavaScript body blocked after gesture');
    if(after.ready===true)return {...result,output:{...result.output,ready:true,selection:after}};
    await wait(Math.min(100,Math.max(1,task.deadline-Date.now())));
  }
  throw Error('Managed JavaScript body selection unconfirmed before original deadline');
}

export async function dispatchManagedJavascriptSetting({task,before,confirmation,execute,record,receiptOptions,onPrepared=async()=>{}}) {
  const gesture_id=task.operation_id+':setting';
  const gesture={...task,mode:'setting',gesture_id,expected:before,confirmation};
  const code=makeJavascriptManagedSettingCode(gesture);
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const signature=digest([gesture_id,task.owner,before,confirmation,task.deadline]);
  const prepared={phase:'javascript_managed_setting_prepared',operation_id:task.operation_id,gesture_id,
    owner:task.owner,point:before.setting_point,snapshot_sha256:digest(before),
    confirmation_sha256:digest(confirmation),deadline:task.deadline,effect_possible:false};
  const saved=await record(prepared);
  if(JSON.stringify(Object.fromEntries(Object.keys(prepared).map(key=>[key,saved?.[key]])))!==JSON.stringify(prepared))
    throw Error('Managed JavaScript Setting journal ACK differs');
  await onPrepared();
  const result=await execute(withBrowserReceipt('('+code+')(page)',{
    ...receiptOptions(gesture_id,'javascript.selection.setting',signature),operation_id:gesture_id}),
    {timeout:Math.max(1,Math.min(35000,task.deadline-Date.now()+5000))});
  if(result?.operation_id!==gesture_id||result.action_key!=='javascript.selection.setting')
    throw Error('Managed JavaScript Setting receipt identity differs');
  return result;
}
