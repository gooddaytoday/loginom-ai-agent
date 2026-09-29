import {createHash} from 'node:crypto';
import {withBrowserReceipt} from './executor.mjs';
import {inspectManagedJavascriptPage, makeJavascriptManagedPageCode} from './javascript-managed-page.mjs';
import {wizardReadiness} from './javascript-wizard-page.mjs';

export function inspectManagedJavascriptClosePoint({held,task},inspect) {
  const state=inspect({held,task});
  const prefix=task.workflow_ref.prefix;
  if(state.ready!==true||state.node_guid!==task.owner.node_id
    ||state.page?.tid!==prefix+';WizrdMCF;JavaScriptCodeWizard'
    ||state.page.visible_editors!==1||held.wizard===undefined||held.wizardRoot===undefined)
    throw Error('Managed JavaScript Close owner unavailable');
  const root=held.wizardRoot,tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  if(tab!==held.binding.tab||tab?.Controller?.Node?.data?.node!==held.wizard
    ||tab?.Controller?.FController?.FView?.el?.dom!==root)
    throw Error('Managed JavaScript Close native owner changed');
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const buttons=[...root.querySelectorAll('[data-tid='+JSON.stringify(prefix+';WizrdMCF;btnClose')+']')].filter(visible);
  const button=buttons[0],control=button&&globalThis.Ext?.getCmp?.(button.id);
  if(buttons.length!==1||control?.el?.dom!==button||control.disabled===true
    ||button.closest('.x-item-disabled,.x-btn-disabled')||button.getAttribute('aria-disabled')==='true')
    throw Error('Managed JavaScript Close button unavailable');
  const box=button.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
  const hit=document.elementFromPoint(x,y);
  if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===button||button.contains(hit)))
    throw Error('Managed JavaScript Close button covered');
  return {x,y,tid:prefix+';WizrdMCF;btnClose',page_tid:state.page.tid,node_id:task.owner.node_id};
}

export function inspectManagedJavascriptCloseDecision({held,task}) {
  const app=globalThis.bg?.app,form=app?.Application?.FInstance?.FMainForm;
  const map=form?.FMapTree,tab=form?.Items?.Workspace?.getActiveTab?.();
  const preparation=globalThis.__loginomDockPreparationV1;
  if(document!==held.binding.document||preparation!==held.preparation
    ||preparation?.document!==document||preparation.id!==task.owner.document_id
    ||map?.FServerConnection?.UserName!==held.account||map?.PackageNodes?.Count!==1
    ||map.PackageNodes.Items(0)!==held.receipt.packageNode
    ||held.receipt.phase!=='verified'||held.receipt.workflowId!==task.owner.workflow_id
    ||held.receipt.nodeTargetWorkflowNode!==held.binding.workflow
    ||tab!==held.binding.tab||location.origin!==task.targetOrigin||app?.Version!==task.targetBuild)
    throw Error('Managed JavaScript Close preparation changed');
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
  const root=held.wizardRoot,current=tab?.Controller?.Node?.data?.node,model=tab?.Controller?.FController;
  if(!visible(root)&&dialogs.length===0){
    const nodes=model?.FDiagram?.FNodes?.FCollection;
    const found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===task.owner.node_id):[];
    if(current!==held.binding.workflow||model!==held.retained.model||model?.FDiagram!==held.retained.diagram
      ||found.length!==1||found[0]!==held.retained.native||found[0].data!==held.binding.nodeData
      ||found[0].FCell!==held.retained.cell)
      throw Error('Managed JavaScript Close graph owner changed');
    return {state:'closed',node_id:task.owner.node_id,root_visible:false,dialog_count:0};
  }
  if(!visible(root)||current!==held.wizard||model?.FView?.el?.dom!==root
    ||model?.FModelNode!==held.binding.nodeData)
    throw Error('Managed JavaScript Close wizard owner changed');
  if(dialogs.length===0)return {state:'waiting',node_id:task.owner.node_id,root_visible:true,dialog_count:0};
  if(dialogs.length!==1)throw Error('Managed JavaScript Close dialog ambiguous');
  const dialog=dialogs[0],expected='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет';
  if(String(dialog.innerText??'').replace(/\s+/g,' ').trim()!==expected)
    throw Error('Managed JavaScript Close dialog changed');
  const buttons=[...dialog.querySelectorAll('[data-tid="msgbox;tlb;yes"]')].filter(visible);
  const button=buttons[0],control=button&&globalThis.Ext?.getCmp?.(button.id);
  if(buttons.length!==1||control?.el?.dom!==button||control.disabled===true
    ||button.closest('.x-item-disabled,.x-btn-disabled')||button.getAttribute('aria-disabled')==='true'
    ||String(button.textContent??'').trim()!=='Да')
    throw Error('Managed JavaScript Close confirmation unavailable');
  const box=button.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
  const hit=document.elementFromPoint(x,y);
  if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===button||button.contains(hit)))
    throw Error('Managed JavaScript Close confirmation covered');
  return {state:'confirm',node_id:task.owner.node_id,root_visible:true,dialog_count:1,
    point:{x,y,tid:'msgbox;tlb;yes'}};
}

export async function runManagedJavascriptCloseRead(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured
    ||Date.now()>=task.cleanup_deadline)throw Error('Managed JavaScript Close lease unavailable');
  return page.evaluate(inspect,{held:lease.handle,task});
}

export async function runManagedJavascriptCloseGesture(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const outcome=(status,phase,effect_possible,output,error=null)=>({status,phase,effect_possible,
    cleanup_complete:true,action_key:'javascript.wizard.close',action_revision:'1',
    operation_id:task.gesture_id,output,error,trace:[]});
  if(!lease||lease.identity!==identity||!lease.wizardCaptured||lease.closeAttempted===true
    ||Date.now()>=task.cleanup_deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'CLOSE_LEASE_UNAVAILABLE',message:'Close lease unavailable'});
  const point=await page.evaluate(inspect,{held:lease.handle,task});
  if(JSON.stringify(point)!==JSON.stringify(task.point)||Date.now()>=task.cleanup_deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'CLOSE_POINT_CHANGED',message:'Close point changed'});
  lease.closeAttempted=true;
  await page.mouse.click(point.x,point.y);
  return outcome('SUCCEEDED','gesture_returned',true,{close_gesture_returned:true,discard_verified:false});
}

export async function runManagedJavascriptCloseConfirmation(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const outcome=(status,phase,effect_possible,output,error=null)=>({status,phase,effect_possible,
    cleanup_complete:true,action_key:'javascript.wizard.close.confirm',action_revision:'1',
    operation_id:task.gesture_id,output,error,trace:[]});
  if(!lease||lease.identity!==identity||lease.closeAttempted!==true||lease.closeConfirmAttempted===true
    ||Date.now()>=task.cleanup_deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'CLOSE_CONFIRM_LEASE_UNAVAILABLE',message:'Close confirmation lease unavailable'});
  const decision=await page.evaluate(inspect,{held:lease.handle,task});
  if(decision.state!=='confirm'||JSON.stringify(decision.point)!==JSON.stringify(task.point)
    ||Date.now()>=task.cleanup_deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'CLOSE_CONFIRM_CHANGED',message:'Close confirmation changed'});
  lease.closeConfirmAttempted=true;
  await page.mouse.click(decision.point.x,decision.point.y);
  return outcome('SUCCEEDED','gesture_returned',true,{confirmation_gesture_returned:true,discard_verified:false});
}

function validate(task) {
  const {cleanup_deadline,...opening}=task??{};
  makeJavascriptManagedPageCode(opening);
  if(!Number.isSafeInteger(cleanup_deadline)||cleanup_deadline<=Date.now()
    ||cleanup_deadline>Date.now()+60000)throw Error('Invalid managed JavaScript Close deadline');
}

export function makeJavascriptManagedClosePointCode(task) {
  validate(task);
  const inspect=`function inspect(args){const native=${wizardReadiness.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptPage.toString()})(input,native);`+
    `return (${inspectManagedJavascriptClosePoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptCloseRead.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

export function makeJavascriptManagedCloseDecisionCode(task) {
  validate(task);
  return `async page=>(${runManagedJavascriptCloseRead.toString()})(page,${JSON.stringify(task)},${inspectManagedJavascriptCloseDecision.toString()})`;
}

export function makeJavascriptManagedCloseGestureCode(task) {
  const {gesture_id,point,...base}=task??{};
  validate(base);
  if(gesture_id!==task.operation_id+':close'||point?.tid!==task.workflow_ref.prefix+';WizrdMCF;btnClose'
    ||point.node_id!==task.owner.node_id||!Number.isFinite(point.x)||!Number.isFinite(point.y))
    throw Error('Invalid managed JavaScript Close gesture');
  const inspect=`function inspect(args){const native=${wizardReadiness.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptPage.toString()})(input,native);`+
    `return (${inspectManagedJavascriptClosePoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptCloseGesture.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

export function makeJavascriptManagedCloseConfirmationCode(task) {
  const {gesture_id,point,...base}=task??{};
  validate(base);
  if(gesture_id!==task.operation_id+':close-confirm'||point?.tid!=='msgbox;tlb;yes'
    ||!Number.isFinite(point.x)||!Number.isFinite(point.y))
    throw Error('Invalid managed JavaScript Close confirmation');
  return `async page=>(${runManagedJavascriptCloseConfirmation.toString()})(page,${JSON.stringify(task)},${inspectManagedJavascriptCloseDecision.toString()})`;
}

export async function closeManagedJavascriptWizard({task,execute,record,receiptOptions,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  validate(task);
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const journal=async event=>{
    const saved=await record(event);
    if(JSON.stringify(Object.fromEntries(Object.keys(event).map(key=>[key,saved?.[key]])))!==JSON.stringify(event))
      throw Error('Managed JavaScript Close journal ACK differs');
  };
  const send=async(phase,key,gesture_id,point,code)=>{
    await journal({phase,operation_id:task.operation_id,gesture_id,owner:task.owner,
      point,deadline:task.cleanup_deadline,effect_possible:false});
    const result=await execute(withBrowserReceipt('('+code+')(page)',{
      ...receiptOptions(gesture_id,key,hash([gesture_id,task.owner,point,task.cleanup_deadline])),operation_id:gesture_id}),
      {timeout:Math.max(1,Math.min(35000,task.cleanup_deadline-Date.now()+5000))});
    if(result?.status!=='SUCCEEDED'||result.action_key!==key||result.operation_id!==gesture_id)
      throw Error('Managed JavaScript Close gesture refused');
  };
  const point=await execute(makeJavascriptManagedClosePointCode(task));
  const closeId=task.operation_id+':close';
  await send('javascript_managed_close_prepared','javascript.wizard.close',closeId,point,
    makeJavascriptManagedCloseGestureCode({...task,gesture_id:closeId,point}));
  const inspect=makeJavascriptManagedCloseDecisionCode(task);
  const decide=async()=>{
    while(Date.now()<task.cleanup_deadline){
      const state=await execute(inspect);
      if(state.state==='closed'||state.state==='confirm')return state;
      if(state.state!=='waiting')throw Error('Managed JavaScript Close decision unknown');
      await wait(Math.min(100,Math.max(1,task.cleanup_deadline-Date.now())));
    }
    throw Error('Managed JavaScript Close original deadline expired');
  };
  const decision=await decide();
  if(decision.state==='confirm'){
    const confirmId=task.operation_id+':close-confirm';
    await send('javascript_managed_close_confirm_prepared','javascript.wizard.close.confirm',confirmId,
      decision.point,makeJavascriptManagedCloseConfirmationCode({...task,gesture_id:confirmId,point:decision.point}));
  }
  const after=decision.state==='closed'?decision:await decide();
  if(after.state!=='closed')throw Error('Managed JavaScript Close did not restore graph');
  await journal({phase:'javascript_managed_close_verified',operation_id:task.operation_id,
    owner:task.owner,deadline:task.cleanup_deadline,confirmation_required:decision.state==='confirm',
    graph:after,settings_applied:false,execution_started:false,draft_discarded:true});
  return {verified:true,closed:true,confirmation_required:decision.state==='confirm',
    node_id:task.owner.node_id,settings_applied:false,execution_started:false,draft_discarded:true};
}
