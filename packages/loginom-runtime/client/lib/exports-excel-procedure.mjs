import {makeExcelExportContextCode,readExcelExportContext,readExcelExportBrowser} from './exports-excel-context.mjs';
import {readPreparedNodeContext} from './node-context.mjs';
import {EXCEL_EXPORT_FIELDS,validateExcelExportDestination,validateNativeExcelExport} from './exports-excel-parameters.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createHash} from 'node:crypto';
const need=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureExcelExport(channel,p,ctx,options){
 const binding={document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node};
 const guard=()=>{ctx.signal?.throwIfAborted();need(Date.now()<ctx.deadline,'Excel export configuration deadline elapsed');};
 const native=async()=>{guard();const r=await options.execute(makeExcelExportContextCode(binding));guard();need(r.verified&&r.stage==='excel_export','Excel export context unavailable: '+r.reason);await options.onRecord({phase:'excel_export_native_read',operation_id:options.operation.id,configuration:r});return r;};
 const readUi=()=>channel.observe({condition:'bound Excel export',ready:s=>s.wizard?.stage==='excel_export'});
 const one=xs=>{need(xs.length===1,'Unique Excel export control required');return xs[0];};
 let current=await native();const initial=current;
 const settings={file_type:1,number_format:0,...p};
 for(const [key,value]of Object.entries(settings)){
  if(key==='overwrite')continue;
  const expected=key==='header'?{none:0,names:1,labels:2}[value]:value;
  if(current.values[key].value===expected)continue;
  const tid=current.values[key].tid,s=await readUi();
  if(['destination','sheet_name'].includes(key)){
   const field=s=>one(s.ui.elements.filter(e=>e.wizard_field?.scope==='export_format'&&e.wizard_field.name===key&&e.allowed_actions.includes('set_wizard_field')));
   await channel.perform({condition:'Excel export '+key,initialObservation:s,ready:s=>s.wizard?.stage==='excel_export',identity:s=>({node:ctx.node,field:field(s).wizard_field,value:field(s).value}),resolve:s=>({verb:'set_wizard_field',ref:field(s).ref,text:value})});
  }else{
   const picker=s=>one(s.ui.elements.filter(e=>e.tid===tid+';trg_picker'&&e.allowed_actions.includes('click')));
   await channel.perform({condition:'Excel export options '+key,initialObservation:s,refreshWizardBusy:key==='header',ready:s=>s.wizard?.stage==='excel_export',identity:s=>({node:ctx.node,field:tid,value:picker(s).wizard_combo?.field?.value}),resolve:s=>({verb:'click',ref:picker(s).ref})});
   const opened=await channel.observe({condition:'Excel export option '+key,ready:s=>s.wizard?.stage==='excel_export'&&s.ui.elements.some(e=>e.allowed_actions.includes('select_wizard_option'))});
   const label=key==='header'?{none:'Нет строки заголовков',names:'Имена полей',labels:'Метки полей'}[value]:key==='file_type'?'Excel 2007':'Общий';
   const choice=one(opened.ui.elements.filter(e=>e.allowed_actions.includes('select_wizard_option')&&e.label===label&&e.tid.startsWith(tid+';boundlist;')));
   await channel.perform({condition:'choose Excel export '+key,initialObservation:opened,ready:s=>s.wizard?.stage==='excel_export',identity:()=>({node:ctx.node,key,value}),resolve:()=>({verb:'select_wizard_option',ref:choice.ref})});
  }
  const after=await native();need(after.values[key].value===expected,'Excel export setting differs: '+key);
  for(const other of Object.keys(current.values))if(other!==key)need(same(current.values[other],after.values[other]),'Unrequested Excel export setting changed: '+other);
  current=after;
 }
 const configured={excel_export:current};
 if(ctx.finish!=='close')validateNativeExcelExport(current.values,options.storageDirectories);
 const destination=validateExcelExportDestination(current.values.destination.value,options.storageDirectories);
 const result=await runExcelExportNext({binding,before:current,destination,overwrite:'reject',origin:options.targetOrigin,operation_id:options.operation.id+':excel-next',deadline:Math.min(ctx.deadline,Date.now()+15000)},ctx,options);
 need(result.status==='SUCCEEDED'&&result.cleanup_complete,'Excel export Next uncertain');
 if(result.output.rejected){const closed=await options.close(channel);const e=Error('Excel destination exists; reject policy preserved it');e.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:closed.cleanup_complete,settings_unchanged:true,verification:'text_export_conflict_rejected'};throw e;}
 configured.destination_check=result.output;
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:{initial,configured,destination}};
}
// The only specialized lifecycle gesture is Next on the file path page: native
// Loginom may ask an exact-path overwrite question instead of advancing.
export function makeExcelExportNextCode(task){
 need(Number.isSafeInteger(task.deadline)&&task.deadline>0,'Bounded export Next deadline required');
 return `async page=>(${excelExportNext.toString()})(page,${JSON.stringify(task)},${readPreparedNodeContext.toString()},${readExcelExportContext.toString()},${readExcelExportBrowser.toString()},${JSON.stringify(EXCEL_EXPORT_FIELDS)})`;
}
export async function excelExportNext(page,task,readNode,readContext,readBrowser,fields){
 const started=Date.now(),trace=[];
 const record=(event,details={})=>{if(trace.length===24)trace.splice(2,1);trace.push({event,elapsed_ms:Date.now()-started,...details});};
 let effect=false;const result=(status,code,output={},cleanup=false)=>({status,action_key:'node.export.next',action_revision:'1',operation_id:task.operation_id,phase:'export_next',effect_possible:effect,cleanup_complete:cleanup,output,error:code?{code,message:code}:null,trace});
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),base=task.binding.workflow_ref.prefix+';WizrdMCF;';
 const remaining=()=>{if(page[Symbol.for('loginom-dock.text-export-cancel')]?.has(task.operation_id))throw Error('Export Next cancelled');const n=task.deadline-Date.now();if(!Number.isSafeInteger(task.deadline)||n<=0)throw Error('Export Next deadline elapsed');return n;};
 const read=async()=>{remaining();const r=await readContext(page,task.binding,readNode,readBrowser,fields);remaining();return r;};
 try{
  remaining();
  if(!['reject','replace'].includes(task.overwrite)||!await page.evaluate(origin=>location.origin===new URL(origin).origin,task.origin))return result('NOT_APPLIED','EXPORT_NEXT_SCOPE',{},true);
  remaining();
  const before=await read();if(!before.verified||before.stage!=='excel_export'||!same(before,task.before)||before.values.destination.value!==task.destination)return result('NOT_APPLIED','EXPORT_NEXT_CONTEXT',{},true);
  const click=async(tid,label)=>{
   remaining();const l=page.locator('[data-tid='+JSON.stringify(tid)+']');if(await l.count()!==1)throw Error('ambiguous control');remaining();
   const h=await l.elementHandle();try{
    remaining();const ok=await h.evaluate((e,label)=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return e.isConnected&&b.width>0&&b.height>0&&!e.classList.contains('x-item-disabled')&&(!label||e.textContent.trim()===label)&&!!hit&&(hit===e||e.contains(hit));},label);
    const timeout=Math.min(5000,remaining());if(!ok)throw Error('control blocked');effect=true;await h.click({timeout});remaining();
   }finally{await h.dispose();}
  };
  record('export_next_click_started');await click(base+'btnNext');record('export_next_clicked');let answered=false,decision=null,lastState=null;
  while(remaining()>0){
   const owner=await readNode(page,task.binding);if(!owner.verified||owner.surface!=='wizard'||owner.node_id!==task.binding.node.node_id)throw Error('owner changed');
   remaining();
   const question=await page.evaluate(destination=>{
    const windows=[...document.querySelectorAll('.x-window')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
    if(!windows.length)return {present:false};if(windows.length!==1)return {present:true,exact:false};
    const w=windows[0],q=w.querySelector('[data-tid="msgbox;cnt;cnt;cmp"]'),title=w.querySelector('[data-tid="msgbox;p.h;p.t"]');
    return {present:true,exact:title?.textContent.trim()==='Loginom 7.4.2'&&q?.textContent.trim()==='Файл с именем '+destination+' существует. Записать поверх?'};
   },task.destination);
   remaining();
   if(question.present){
    if(!question.exact||answered)throw Error('unexpected export dialog');
    const current=await read();if(!same(current,before))throw Error('export parameters changed before decision');
    decision=task.overwrite;answered=true;await click('msgbox;tlb;'+(decision==='replace'?'yes':'no'),decision==='replace'?'Да':'Нет');
    continue;
   }
   const current=await read();
   const state=JSON.stringify({verified:current.verified,stage:current.stage??null,reason:current.reason??null});
   if(state!==lastState){record('export_next_observed',JSON.parse(state));lastState=state;}
   // The owned page proves this single transition even while its fields load.
   // Full format validation follows the procedure's existing owned-mask wait.
   if(current.stage==='done'&&(current.verified||current.node_context?.verified===true&&same(current.node_context,owner)))return result('SUCCEEDED',null,{verified:true,destination:task.destination,overwrite:task.overwrite,existed:answered,decision,format_page:current,node_context:owner},true);
   if(answered&&decision==='reject'&&same(current,before))return result('SUCCEEDED',null,{verified:true,destination:task.destination,overwrite:'reject',existed:true,decision:'reject',rejected:true,node_context:owner},true);
   await page.waitForTimeout(Math.min(100,remaining()));
  }
  return result('AMBIGUOUS','EXPORT_NEXT_UNSETTLED');
 }catch{record('export_next_stopped',{reason:task.deadline<=Date.now()?'deadline':page[Symbol.for('loginom-dock.text-export-cancel')]?.has(task.operation_id)?'cancelled':'transition_refused'});return result(effect?'AMBIGUOUS':'NOT_APPLIED','EXPORT_NEXT_UNCONFIRMED',{},!effect);}
}

// The host signal is mirrored only for this in-flight native transition. Keep
// its marker if transport completion is unknown; a late gesture must still stop.
export async function runExcelExportNext(task,ctx,options){
 const {execute,onRecord,operation,receiptOptions}=options;
 const guard=()=>{ctx.signal?.throwIfAborted();need(Date.now()<task.deadline,'Export Next deadline elapsed');};
 const signature=createHash('sha256').update(JSON.stringify(task)).digest('hex');
 let issued=false,settled=false,cancellation=null,markerError=null;
 const cancel=()=>{cancellation??=execute(`async page=>{(page[Symbol.for('loginom-dock.text-export-cancel')]??=new Set()).add(${JSON.stringify(task.operation_id)});return true;}`).catch(e=>{markerError=e;});};
 guard();ctx.signal?.addEventListener('abort',cancel,{once:true});
 try{
  guard();await onRecord({phase:'excel_export_next_prepared',operation_id:operation.id,task,signature});guard();
  issued=true;const result=await execute(withBrowserReceipt('('+makeExcelExportNextCode(task)+')(page)',{...receiptOptions(task.operation_id,'node.export.next',signature),operation_id:task.operation_id}));settled=true;
  await onRecord({phase:'excel_export_next_completed',operation_id:operation.id,outcome:result});guard();return result;
 }finally{
  ctx.signal?.removeEventListener('abort',cancel);if(cancellation)await cancellation;
  if(cancellation&&(!issued||settled)&&!markerError)await execute(`async page=>{page[Symbol.for('loginom-dock.text-export-cancel')]?.delete(${JSON.stringify(task.operation_id)});return true;}`);
  if(markerError)throw markerError;
 }
}

