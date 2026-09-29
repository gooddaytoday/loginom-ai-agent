import {captureJavascriptSelection,inspectJavascriptSelection} from './javascript-owned-selection.mjs';

// These functions run inside the authenticated Loginom page. The generated
// wrappers below embed their fixed dependencies; no caller-provided code runs.
export function captureManagedJavascriptSelection(task,capture) {
  const app=globalThis.bg?.app,preparation=globalThis.__loginomDockPreparationV1;
  const form=app?.Application?.FInstance?.FMainForm,tab=form?.Items?.Workspace?.getActiveTab?.();
  const receipts=[...(preparation?.receipts?.values()??[])].filter(item=>item.phase==='verified'
    &&item.workflowId===task.owner.workflow_id);
  const workflow=tab?.Controller?.Node?.data?.node,model=tab?.Controller?.FController;
  const diagram=model?.FDiagram,graph=diagram?.FmxGraph,nodes=diagram?.FNodes?.FCollection;
  const found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(item=>item.FGuid===task.owner.node_id):[];
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
  return inspect({binding:held.binding,node:held.node,icon:held.icon,retained:held.retained,
    requireSettings:true,requireVisualizers:false,inspectPhase:task.inspectPhase??'managed_observe',
    deadline:task.deadline,targetOrigin:task.targetOrigin,targetBuild:task.targetBuild});
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
    leases.set(task.operation_id,{handle,identity});
    try{return await page.evaluate(inspect,{held:handle,task});}
    catch(error){leases.delete(task.operation_id);await handle.dispose();throw error;}
  }
  const lease=leases.get(task.operation_id);
  if(!lease||lease.identity!==identity)throw Error('Managed JavaScript selection lease changed');
  if(task.mode==='dispose'){
    leases.delete(task.operation_id);await lease.handle.dispose();return {disposed:true};
  }
  if(task.mode!=='inspect')throw Error('Unsupported managed JavaScript selection read');
  return page.evaluate(inspect,{held:lease.handle,task});
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
    ||task.mode!=='dispose'&&task.deadline<=Date.now()
    ||task.inspectPhase!==undefined&&(typeof task.inspectPhase!=='string'||task.inspectPhase.length>64)
    ||Object.keys(task).some(key=>!['mode','operation_id','owner','workflow_ref','targetOrigin','targetBuild','deadline','inspectPhase'].includes(key)))
    throw Error('Invalid managed JavaScript selection read');
  const capture=`function capture(task){const native=${captureJavascriptSelection.toString()};return (${captureManagedJavascriptSelection.toString()})(task,native);}`;
  const inspect=`function inspect(args){const native=${inspectJavascriptSelection.toString()};return (${inspectManagedJavascriptSelection.toString()})(args,native);}`;
  return `async page=>(${runManagedJavascriptSelectionRead.toString()})(page,${JSON.stringify(task)},${capture},${inspect})`;
}
