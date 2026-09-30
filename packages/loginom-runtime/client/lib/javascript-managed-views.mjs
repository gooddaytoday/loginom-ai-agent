import {randomUUID,createHash} from 'node:crypto';
import {makeJavascriptManagedSelectionReadCode,dispatchManagedJavascriptBody} from './javascript-managed-selection.mjs';
import {inspectJavascriptVisualizers,inspectJavascriptViewsSettlement} from './javascript-output-context.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Fixed browser functions; the actual selection lease retains all native objects.
export function inspectManagedJavascriptViews(args,inspect) {
  const {held,task,ticket,capture=false}=args;
  const preparation=globalThis.__loginomDockPreparationV1;
  const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
  if(form?.FMapTree?.FServerConnection?.UserName!==held.account||preparation!==held.preparation
    ||![...(preparation?.receipts?.values()??[])].includes(held.receipt)
    ||held.receipt.phase!=='verified'||held.receipt.workflowId!==task.owner.workflow_id
    ||held.receipt.nodeTargetWorkflowNode!==held.binding.workflow)
    throw Error('Managed JavaScript Views account or preparation changed');
  return inspect({binding:{...held.binding,...held.retained},node:held.node,output:task.output,
    held:ticket??null,capture,poll:args.poll===true,targetOrigin:task.targetOrigin,targetBuild:task.targetBuild});
}

export function inspectManagedJavascriptViewsSettlement({held,ticket,task,poll=false},inspect) {
  const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
  if(form?.FMapTree?.FServerConnection?.UserName!==held.account
    ||globalThis.__loginomDockPreparationV1!==held.preparation
    ||![...(held.preparation?.receipts?.values()??[])].includes(held.receipt))
    throw Error('Managed JavaScript Views settlement account or preparation changed');
  return inspect({binding:{...held.binding,...held.retained},held:ticket,prepared:task.prepared,
    output:task.output,poll,targetOrigin:task.targetOrigin,targetBuild:task.targetBuild});
}

export async function runManagedJavascriptViewsRead(page,task,inspect,settlement) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.bodySettled!==true||lease.settingAttempted===true)
    throw Error('Managed JavaScript Views selection lease unavailable');
  if(task.mode==='capture'){
    if(lease.viewsCaptured||lease.viewsAttempted)throw Error('Managed JavaScript Views capture already used');
    const remaining=task.deadline-Date.now();if(remaining<=0)throw Error('Managed JavaScript Views deadline expired');
    const args={held:lease.handle,task};
    const ready=await page.waitForFunction(inspect,{...args,poll:true},{timeout:remaining,polling:100});await ready.dispose();
    lease.viewsCaptured=await page.evaluateHandle(inspect,{...args,capture:true});
    return page.evaluate(inspect,{...args,ticket:lease.viewsCaptured});
  }
  if(!lease.viewsCaptured)throw Error('Managed JavaScript Views native ticket unavailable');
  const args={held:lease.handle,ticket:lease.viewsCaptured,task};
  if(task.mode==='inspect')return page.evaluate(inspect,args);
  if(task.mode==='settle'){
    if(!lease.viewsAttempted)throw Error('Managed JavaScript Views gesture not dispatched');
    const remaining=task.deadline-Date.now();if(remaining<=0)throw Error('Managed JavaScript Views deadline expired');
    const ready=await page.waitForFunction(settlement,{...args,poll:true},{timeout:remaining,polling:100});await ready.dispose();
    const result=await page.evaluate(settlement,args);
    if(result.ready!==true||result.surface!=='views'||Date.now()>=task.deadline)
      throw Error('Managed JavaScript Views settlement unconfirmed');
    lease.viewsSettled=true;return result;
  }
  if(task.mode==='dispose'&&lease.viewsSettled===true){
    await lease.viewsCaptured.dispose();delete lease.viewsCaptured;return {disposed:true};
  }
  throw Error('Managed JavaScript Views read mode or settlement unavailable');
}

export async function runManagedJavascriptViewsGesture(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const result=(status,effect_possible,error=null)=>({status,phase:'gesture_returned',effect_possible,
    cleanup_complete:true,action_key:'javascript.views.open',action_revision:'1',operation_id:task.gesture_id,
    output:{views_gesture_returned:status==='SUCCEEDED',surface_verified:false,execution_started:false},error,trace:[]});
  if(!lease||lease.identity!==identity||lease.bodySettled!==true||!lease.viewsCaptured||lease.viewsAttempted)
    return result('NOT_APPLIED',false,{code:'VIEWS_LEASE_UNAVAILABLE',message:'Views lease unavailable'});
  const current=await page.evaluate(inspect,{held:lease.handle,ticket:lease.viewsCaptured,task});
  if(current.ready!==true||JSON.stringify(current)!==JSON.stringify(task.expected)||Date.now()>=task.deadline)
    return result('NOT_APPLIED',false,{code:'VIEWS_SNAPSHOT_CHANGED',message:'Views snapshot changed'});
  lease.viewsAttempted=true;
  await page.mouse.click(current.point.x,current.point.y);
  return result('SUCCEEDED',true);
}

export function makeJavascriptManagedViewsCode(task) {
  const {output,prepared,expected,gesture_id,mode,...base}=task??{};
  makeJavascriptManagedSelectionReadCode({...base,mode:'inspect'});
  need(['capture','inspect','settle','dispose','open'].includes(mode)
    &&same(Object.keys(output??{}).sort(),['active','index','native_index','port_guid'])
    &&output.active===true&&output.index===0&&Number.isInteger(output.native_index)&&output.native_index>=0&&output.native_index<100
    &&typeof output.port_guid==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(output.port_guid)
    &&same(prepared?.node,base.owner)&&prepared.document_id===base.owner.document_id
    &&prepared.workflow_ref?.workflow_id===base.owner.workflow_id
    &&['prefix','tab_tid'].every(key=>prepared.workflow_ref[key]===base.workflow_ref[key])
    &&Array.isArray(prepared.workflow_ref.navigation_path)&&prepared.workflow_ref.navigation_path.length>0
    &&prepared.workflow_ref.navigation_path.length<=32
    &&prepared.workflow_ref.navigation_path.every(part=>typeof part.tid==='string'&&part.tid.length<=512
      &&typeof part.label==='string'&&part.label.length<=512),'Invalid managed JavaScript Views task');
  const inspect=`function inspect(args){const native=${inspectJavascriptVisualizers.toString()};return (${inspectManagedJavascriptViews.toString()})(args,native);}`;
  const settle=`function settle(args){const native=${inspectJavascriptViewsSettlement.toString()};return (${inspectManagedJavascriptViewsSettlement.toString()})(args,native);}`;
  if(mode==='open'){
    need(typeof gesture_id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(gesture_id)
      &&expected?.ready===true&&expected.node_id===base.owner.node_id&&expected.port_guid===output.port_guid
      &&Number.isFinite(expected.point?.x)&&Number.isFinite(expected.point?.y)
      &&JSON.stringify(expected).length<=32768&&base.deadline>Date.now(),'Invalid managed JavaScript Views gesture');
    return `async page=>(${runManagedJavascriptViewsGesture.toString()})(page,${JSON.stringify(task)},${inspect})`;
  }
  need(expected===undefined&&gesture_id===undefined,'Views read cannot carry a gesture');
  return `async page=>(${runManagedJavascriptViewsRead.toString()})(page,${JSON.stringify(task)},${inspect},${settle})`;
}

export async function openManagedJavascriptOutputViews({prepared,node,output,deadline,targetOrigin,execute,record,receiptOptions,wrapMutation}) {
  const task={operation_id:'managed-js-views-'+randomUUID(),owner:node,
    workflow_ref:{tab_tid:prepared.workflow_ref.tab_tid,prefix:prepared.workflow_ref.prefix},
    targetOrigin,targetBuild:'7.4.2',deadline};
  const before=await execute(makeJavascriptManagedSelectionReadCode({...task,mode:'capture'}));
  need(before.blocked!==true,'Managed JavaScript Views selection blocked');
  if(before.ready!==true)await dispatchManagedJavascriptBody({task,before,execute,record,receiptOptions});
  const views={...task,prepared:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},
    output:{index:0,native_index:output.native_index,active:output.active,port_guid:output.port_guid}};
  const expected=await execute(makeJavascriptManagedViewsCode({...views,mode:'capture'}));
  const gesture={...views,mode:'open',expected,gesture_id:task.operation_id+':views'};
  const code=makeJavascriptManagedViewsCode(gesture);
  const event={phase:'javascript_managed_views_prepared',owner:node,gesture_id:gesture.gesture_id,
    port_guid:output.port_guid,signature:digest(gesture),deadline};
  const saved=await record(structuredClone(event));
  need(Object.keys(event).every(key=>same(saved?.[key],event[key])),'Managed JavaScript Views dispatch ACK differs');
  const receipt=await execute(wrapMutation(code,{id:gesture.gesture_id,action_key:'javascript.views.open',signature:event.signature}));
  need(receipt?.status==='SUCCEEDED'&&receipt.action_key==='javascript.views.open'&&receipt.action_revision==='1'
    &&receipt.operation_id===gesture.gesture_id&&receipt.effect_possible===true&&receipt.cleanup_complete===true
    &&receipt.output?.views_gesture_returned===true&&receipt.output.surface_verified===false
    &&receipt.output.execution_started===false,'Managed JavaScript Views gesture unconfirmed');
  const after=await execute(makeJavascriptManagedViewsCode({...views,mode:'settle'}));
  need(after.ready===true&&after.native_owner_verified===true&&after.port_guid===output.port_guid
    &&after.node_id===node.node_id,'Managed JavaScript Views owned surface unconfirmed');
  const verified={phase:'javascript_managed_views_verified',owner:node,gesture_id:gesture.gesture_id,receipt,after,deadline};
  const acknowledged=await record(structuredClone(verified));
  need(Object.keys(verified).every(key=>same(acknowledged?.[key],verified[key])),
    'Managed JavaScript Views verification ACK differs');
  await execute(makeJavascriptManagedViewsCode({...views,mode:'dispose'}));
  await execute(makeJavascriptManagedSelectionReadCode({...task,mode:'dispose'}));
  return {verified:true,surface_verified:true,execution_started:false,port_guid:output.port_guid};
}
