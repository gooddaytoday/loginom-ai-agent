import {createHash} from 'node:crypto';
import {JAVASCRIPT_DECLARED_TYPES,JAVASCRIPT_DECLARED_COLUMN_LIMIT} from './javascript-column-types.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {makeJavascriptManagedPageCode} from './javascript-managed-page.mjs';
import {readJavascriptSchema} from './javascript-schema-browser.mjs';
import {readJavascriptDeclaredColumns} from './javascript-declared-schema.mjs';
import {observeJavascriptColumnEditor} from './javascript-column-context.mjs';
import {waitJavascriptColumnEditor,verifyJavascriptColumnEditor,fillJavascriptColumnField,
  javascriptColumnFieldMatches,openJavascriptColumnTypePicker,selectJavascriptColumnTypeOption,
  openJavascriptColumnUsagePicker,selectJavascriptColumnUsageOption} from './javascript-column-procedure.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};
const usages={'Не задано':0,'Активное':3,'Выходное':4,'Группа':6,'Показатель':7,'Транзакция':8,'Элемент':9};

// Only default data kinds are supported. Each native picker must independently
// confirm its value and exact label before the owned selection gesture.
export function validateJavascriptDeclaredPrimitiveColumns(columns) {
  need(Array.isArray(columns)&&columns.length>0&&columns.length<=JAVASCRIPT_DECLARED_COLUMN_LIMIT,
    'Managed JavaScript declared column coverage unavailable');
  need(columns.every(column=>column&&Object.keys(column).length===5
    &&['name','label','type','data_kind','usage'].every(key=>Object.hasOwn(column,key))
    &&typeof column.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(column.name)
    &&typeof column.label==='string'&&column.label.length>0&&column.label.length<=120
    &&column.label.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(column.label)
    &&Object.hasOwn(JAVASCRIPT_DECLARED_TYPES,column.type)
    &&column.data_kind===JAVASCRIPT_DECLARED_TYPES[column.type].kind
    &&Object.hasOwn(usages,column.usage))
    &&new Set(columns.map(column=>column.name.toLowerCase())).size===columns.length,
  'Managed JavaScript declared column parameters unsupported');
  return columns;
}

// This capture never calls a Loginom RPC or mutates its native cache.
export function inspectManagedJavascriptDeclaredContext({held,task,capture=false}) {
  const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
  const tab=form?.Items?.Workspace?.getActiveTab?.();
  const preparation=globalThis.__loginomDockPreparationV1;
  if(preparation!==held.preparation||preparation?.document!==document
    ||preparation.id!==task.owner.document_id||form?.FMapTree?.FServerConnection?.UserName!==held.account
    ||![...(preparation.receipts?.values()??[])].includes(held.receipt)
    ||held.receipt.phase!=='verified'||held.receipt.workflowId!==task.owner.workflow_id
    ||held.receipt.nodeTargetWorkflowNode!==held.binding.workflow
    ||tab!==held.binding.tab||tab?.Controller?.Node?.data?.node!==held.wizard
    ||held.wizard?.ParentNode?.FGuid!==task.owner.node_id
    ||tab?.Controller?.FController?.FView?.el?.dom!==held.wizardRoot
    ||!held.wizardRoot?.isConnected)
    throw Error('Managed JavaScript declared context changed');
  return capture?{prefix:task.workflow_ref.prefix,root:held.wizardRoot,native:held.wizard,
    binding:held.wizardBinding,account:held.account,build:task.targetBuild}:{verified:true};
}

export async function runManagedJavascriptDeclaredStep(page,task,inspect,observe,helpers,readSchema,typeOptions) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured
    ||lease.nextAttempted===true||Date.now()>=task.deadline)
    throw Error('Managed JavaScript declared lease unavailable');
  await page.evaluate(inspect,{held:lease.handle,task});
  if(!lease.declared){
    if(task.index!==0||task.step!=='add'||task.mode!=='prepare')throw Error('Managed declared initial step differs');
    const context=await page.evaluateHandle(inspect,{held:lease.handle,task,capture:true});
    const schema=await page.evaluate(readSchema,context);
    if(schema.verified!==true||schema.inventory_complete!==true||schema.generation?.checked!==false
      ||schema.grids.filter(grid=>grid.tid===schema.page_tid+';grdTargetColumns;tbl').length!==1
      ||schema.grids.find(grid=>grid.tid===schema.page_tid+';grdTargetColumns;tbl').fields.length!==0)
      throw Error('Managed declared requires an empty owned schema');
    lease.declared={context,columns:JSON.stringify(task.columns),index:0,step:0,attempted:new Set(),pending:null};
  }
  const state=lease.declared,column=task.columns[task.index];
  const steps=['add','name','label','type_open','type_select',
    ...(column.usage==='Не задано'?[]:['usage_open','usage_select']),'apply'];
  if(state.columns!==JSON.stringify(task.columns)||state.index!==task.index||steps[state.step]!==task.step)
    throw Error('Managed declared column order or parameters changed');
  const expectedType=typeOptions[column.type].value,expectedLabel=typeOptions[column.type].label;
  const events=[],record=async event=>{events.push(event);return event;};
  const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']').filter({visible:true});
  const argumentsForStep=()=>({held:state.pending.held,phase:task.step==='add'?'baseline':'editing',
    ...(task.step==='name'||task.step==='label'?{readField:task.step==='name'?'edtName':'edtDisplayName'}:{}),
    ...(task.step==='type_open'?{target:'cbxDataType',kind:'trigger',expectedType,expectedLabel}:{}),
    ...(task.step==='type_select'?{readPicker:true,expectedType,expectedLabel}:{}),
    ...(task.step==='usage_open'||task.step==='usage_select'?{readUsagePicker:task.step==='usage_open'?'state':true,
      usageAction:task.step==='usage_open'?'open':null,expectedUsage:task.usage_value,expectedUsageLabel:column.usage}:{}),
    ...(task.step==='apply'?{target:'btnApply',readDeclaredControls:true}:{})});
  if(task.mode==='prepare'){
    if(state.prepared)throw Error('Managed declared step already prepared');
    if(task.step==='add'){
      if(state.pending)throw Error('Managed declared prior editor unresolved');
      const held=await page.evaluateHandle(observe,{context:state.context,expectedCount:task.index,phase:'capture'});
      const snapshot=await held.evaluate(value=>value.snapshot);
      if(snapshot.status!=='prepared'){await held.dispose();throw Error('Managed declared baseline unconfirmed');}
      state.pending={held,addDispatched:false,applyDispatched:false,cancelDispatched:false};
    }
    const observed=await page.evaluate(observe,argumentsForStep());
    if(observed.status!==(task.step==='add'?'prepared':'ready'))throw Error('Managed declared step preflight refused');
    state.prepared={gesture_id:task.gesture_id,observed};return observed;
  }
  if(task.mode!=='effect'||state.prepared?.gesture_id!==task.gesture_id||state.attempted.has(task.gesture_id)
    ||JSON.stringify(state.prepared.observed)!==JSON.stringify(task.expected))
    throw Error('Managed declared effect admission differs');
  const fresh=await page.evaluate(observe,argumentsForStep());
  if(JSON.stringify(fresh)!==JSON.stringify(task.expected)||Date.now()>=task.deadline)
    throw Error('Managed declared pre-gesture observation changed');
  // Reserve before any helper or gesture: transport loss cannot replay it.
  state.attempted.add(task.gesture_id);
  let dispatched=false;
  const once=async(id,ignored,perform)=>{
    if(id!==task.gesture_id||dispatched||Date.now()>=task.deadline)throw Error('Managed declared duplicate or expired effect');
    await page.evaluate(inspect,{held:lease.handle,task});dispatched=true;return perform();
  };
  const common={page,state,record,once,deadline:task.deadline,id:task.gesture_id,expectedType,expectedLabel,
    expectedUsage:task.usage_value,expectedUsageLabel:column.usage};
  if(task.step==='add'){
    await once(task.gesture_id,null,async()=>{
      const tid=task.workflow_ref.prefix+';WizrdMCF;JavaScriptColumnsWizard;btnAddMappingColumn';
      state.pending.addDispatched=true;await at(tid).click({timeout:Math.max(1,task.deadline-Date.now())});
    });
    await helpers.waitJavascriptColumnEditor({...common,pending:state.pending,phase:'editing'});
  }
  if(task.step==='name'||task.step==='label'){
    const target=task.step==='name'?'edtName':'edtDisplayName',value=task.step==='name'?column.name:column.label;
    await helpers.fillJavascriptColumnField({...common,target,expected:value,
      fill:text=>at(fresh.base+';'+target).locator('input').fill(text,{timeout:Math.max(1,task.deadline-Date.now())})});
  }
  if(task.step==='type_open')await helpers.openJavascriptColumnTypePicker({...common,click:(tid,timeout)=>at(tid).click({timeout})});
  if(task.step==='type_select')await helpers.selectJavascriptColumnTypeOption(common);
  if(task.step==='usage_open')await helpers.openJavascriptColumnUsagePicker({...common,click:(tid,timeout)=>at(tid).click({timeout})});
  if(task.step==='usage_select')await helpers.selectJavascriptColumnUsageOption({...common,expectedUsage:task.usage_value,expectedUsageLabel:column.usage});
  if(task.step==='apply'){
    await once(task.gesture_id,null,async()=>{
      await helpers.verifyJavascriptColumnEditor({...common,target:'btnApply'});
      state.pending.applyDispatched=true;await at(fresh.base+';btnApply').click({timeout:Math.max(1,task.deadline-Date.now())});
    });
    await helpers.waitJavascriptColumnEditor({...common,pending:state.pending,phase:'applied'});
    await state.pending.held.dispose();state.pending=null;state.index++;state.step=0;
  }
  if(task.step!=='apply')state.step++;
  delete state.prepared;
  const schema=task.step==='apply'?await page.evaluate(readSchema,state.context):null;
  if(task.step==='apply'&&state.index===task.columns.length){await state.context.dispose();state.complete=true;}
  return {status:'SUCCEEDED',phase:'owned_column_step_verified',effect_possible:dispatched,cleanup_complete:true,
    action_key:'javascript.schema.declared',action_revision:'1',operation_id:task.gesture_id,
    output:{step:task.step,index:task.index,step_verified:true,schema,events},error:null,trace:[]};
}

export function makeJavascriptManagedDeclaredCode(task) {
  const {columns,index,step,mode,gesture_id,expected,usage_value,...base}=task;
  makeJavascriptManagedPageCode(base);validateJavascriptDeclaredPrimitiveColumns(columns);
  need(Number.isSafeInteger(index)&&index>=0&&index<columns.length
    &&['add','name','label','type_open','type_select','usage_open','usage_select','apply'].includes(step)
    &&['prepare','effect'].includes(mode)&&gesture_id===base.operation_id+':declared-'+index+'-'+step
    &&usage_value===usages[columns[index].usage]&&(mode==='prepare'?expected===undefined:expected?.status!==undefined),
  'Managed JavaScript declared step invalid');
  const functions=[waitJavascriptColumnEditor,verifyJavascriptColumnEditor,fillJavascriptColumnField,
    javascriptColumnFieldMatches,openJavascriptColumnTypePicker,selectJavascriptColumnTypeOption,
    openJavascriptColumnUsagePicker,selectJavascriptColumnUsageOption];
  return 'async page=>{const observeJavascriptColumnEditor='+observeJavascriptColumnEditor.toString()+';'
    +functions.map(fn=>'const '+fn.name+'='+fn.toString()+';').join('')
    +'return ('+runManagedJavascriptDeclaredStep.toString()+')(page,'+JSON.stringify(task)+','
    +inspectManagedJavascriptDeclaredContext.toString()+',observeJavascriptColumnEditor,{'
    +functions.map(fn=>fn.name).join(',')+'},'+readJavascriptSchema.toString()+','+JSON.stringify(JAVASCRIPT_DECLARED_TYPES)+');}';
}

export async function dispatchManagedJavascriptDeclared({task,columns,execute,record,receiptOptions}) {
  validateJavascriptDeclaredPrimitiveColumns(columns);
  await execute(makeJavascriptManagedPageCode(task));
  let schema;
  for(const [index,column] of columns.entries()){
    const steps=['add','name','label','type_open','type_select',
      ...(column.usage==='Не задано'?[]:['usage_open','usage_select']),'apply'];
    for(const step of steps){
      const gesture_id=task.operation_id+':declared-'+index+'-'+step;
      const bound={...task,columns,index,step,gesture_id,usage_value:usages[column.usage]};
      const expected=await execute(makeJavascriptManagedDeclaredCode({...bound,mode:'prepare'}));
      const signature=createHash('sha256').update(JSON.stringify([task.owner,columns,index,step,expected,task.deadline])).digest('hex');
      const event={phase:'javascript_managed_declared_prepared',owner:task.owner,gesture_id,index,step,signature,
        expected,deadline:task.deadline,effect_possible:false};
      const ack=await record(event);
      need(JSON.stringify(Object.fromEntries(Object.keys(event).map(key=>[key,ack?.[key]])))===JSON.stringify(event),
        'Managed JavaScript declared journal ACK differs');
      const result=await execute(withBrowserReceipt('('+makeJavascriptManagedDeclaredCode({...bound,mode:'effect',expected})+')(page)',{
        ...receiptOptions(gesture_id,'javascript.schema.declared',signature),operation_id:gesture_id}),
        {timeout:Math.max(1,Math.min(35000,task.deadline-Date.now()+5000))});
      need(result?.status==='SUCCEEDED'&&result.operation_id===gesture_id&&result.action_key==='javascript.schema.declared'
        &&result.action_revision==='1'&&result.phase==='owned_column_step_verified'
        &&typeof result.effect_possible==='boolean'&&result.cleanup_complete===true
        &&result.output?.step_verified===true&&result.output.step===step&&result.output.index===index,
      'Managed JavaScript declared effect unconfirmed');
      const verified={phase:'javascript_managed_declared_verified',owner:task.owner,gesture_id,index,step,receipt:result};
      const saved=await record(verified);
      need(JSON.stringify(Object.fromEntries(Object.keys(verified).map(key=>[key,saved?.[key]])))===JSON.stringify(verified),
        'Managed JavaScript declared verified ACK differs');
      if(step==='apply'){
        schema=result.output.schema;readJavascriptDeclaredColumns(schema,columns.slice(0,index+1));
      }
    }
  }
  return {schema,columns:readJavascriptDeclaredColumns(schema,columns),generation:false,verified:true};
}
