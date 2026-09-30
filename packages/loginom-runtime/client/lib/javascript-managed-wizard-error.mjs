import {createHash} from 'node:crypto';
import {withBrowserReceipt} from './executor.mjs';
import {makeJavascriptManagedStageCode,javascriptManagedStageInspector} from './javascript-managed-stage.mjs';
import {readJavascriptWizardErrorDialog} from './javascript-wizard-error-dialog.mjs';
import {isCurrentJavascriptWizardRefusal} from './javascript-wizard-refusal.mjs';
import {createRedactor} from './redact.mjs';

export async function journalManagedJavascriptError({record,deadline},event) {
  const expected=JSON.stringify(event);
  let timer;
  try {
    const saved=await Promise.race([Promise.resolve().then(()=>record(structuredClone(event))),new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('Managed JavaScript error journal deadline')),Math.max(1,deadline-Date.now()));
    })]);
    if(Date.now()>=deadline||JSON.stringify(Object.fromEntries(Object.keys(event).map(key=>[key,saved?.[key]])))!==expected)
      throw Error('Managed JavaScript error journal ACK differs');
  } finally { clearTimeout(timer); }
}

// Done hides Code but must retain the same complete editor and exact draft.
export function inspectManagedJavascriptErrorDraft({held,task,editor,expectedSource}) {
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0
    &&getComputedStyle(e).visibility!=='hidden';
  const wrappers=[...held.wizardRoot.querySelectorAll('.CodeMirror')];
  const pages=[...held.wizardRoot.querySelectorAll('[data-tid='+JSON.stringify(task.workflow_ref.prefix+';WizrdMCF;JavaScriptCodeWizard')+']')];
  if(!editor||editor.document!==document||editor.tab!==held.binding.tab||editor.native!==held.wizard
    ||editor.model!==held.binding.tab.Controller.FController||editor.root!==held.wizardRoot
    ||pages.length!==1||pages[0]!==editor.page||!editor.page.isConnected
    ||globalThis.Ext?.getCmp?.(editor.page.id)?.el?.dom!==editor.page
    ||editor.page.getAttribute('data-tid')!==task.workflow_ref.prefix+';WizrdMCF;JavaScriptCodeWizard'
    ||(task.error_stage==='done'?visible(editor.page)||visible(editor.wrapper):!visible(editor.page)||!visible(editor.wrapper))
    ||wrappers.length!==1||wrappers[0]!==editor.wrapper||!editor.page.contains(editor.wrapper)
    ||!held.wizardRoot.contains(editor.wrapper)||editor.wrapper.CodeMirror!==editor.cm
    ||editor.cm.getDoc?.()!==editor.doc||editor.cm.getInputField?.()!==editor.input
    ||editor.cm.getWrapperElement?.()!==editor.wrapper||editor.cm.getOption?.('readOnly')!==false
    ||!editor.input?.isConnected||!editor.wrapper.contains(editor.input)||editor.input.disabled===true||editor.input.readOnly===true)
    throw Error('Managed JavaScript error draft editor changed');
  const count=editor.doc.lineCount?.(),lines=[];
  let bytes=0;
  if(!Number.isSafeInteger(count)||count<1||count>1024||editor.doc.firstLine?.()!==0||editor.doc.lastLine?.()!==count-1)
    throw Error('Managed JavaScript error draft lines changed');
  for(let index=0;index<count;index++) {
    const line=editor.doc.getLine(index);
    if(typeof line!=='string'||/[\r\n\0]/u.test(line)||!line.isWellFormed())throw Error('Managed JavaScript error draft characters changed');
    bytes+=new TextEncoder().encode(line).length+(index?1:0);
    if(bytes>32768)throw Error('Managed JavaScript error draft byte bound exceeded');
    lines.push(line);
  }
  if(lines.join('\n')!==expectedSource)throw Error('Managed JavaScript error draft source changed');
}

// Browser-local owner, native dialog, exact control and hit-test are refreshed
// immediately before the single gesture. The retained lease supplies all roots.
export function inspectManagedJavascriptErrorPoint({held,task,editor,expectedSource},readStage,readDialog,readDraft) {
  const stage=readStage({held,task});
  if(stage.wizard_visible!==true||stage.page_tid!==task.page_tid||stage.pending!==false
    ||stage.preview_visible||stage.wizard_error?.visible!==true||stage.wizard_error.exact_count!==1
    ||stage.wizard_error.tooltip!==task.tooltip||stage.wizard_error.tooltip_truncated!==task.tooltip_truncated)
    throw Error('Managed JavaScript error wizard changed');
  const dialog=readDialog();
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0
    &&getComputedStyle(e).visibility!=='hidden';
  const dialogs=[...document.querySelectorAll('.x-message-box')].filter(visible);
  const root=task.mode==='button'?held.wizardRoot:dialogs[0];
  if(task.mode==='closed') {
    if(stage.boundary_refusal!==null||stage.owner_verified!==true||dialog.present
      ||!held.errorDialogRoot||held.errorDialogPageTid!==task.page_tid)
      throw Error('Managed JavaScript error dialog closure changed');
  } else if(task.mode==='button') {
    if(stage.boundary_refusal!==null||stage.owner_verified!==true||dialog.present)
      throw Error('Managed JavaScript error button blocked');
  } else if(task.mode==='ok'&&!held.errorDialogRoot||stage.boundary_refusal!=='foreign_dialog'||dialogs.length!==1||!dialog.present
    ||stage.dialog_diagnostic.foreign_count!==1||stage.dialog_diagnostic.roots.length!==1
    ||stage.dialog_diagnostic.roots[0].tid!==dialog.tid||stage.dialog_diagnostic.roots[0].native_el!==true
    ||held.errorDialogRoot&&held.errorDialogRoot!==root
    ||task.dialog!==undefined&&JSON.stringify(task.dialog)!==JSON.stringify(dialog))
    throw Error('Managed JavaScript error dialog changed');
  // Next and error controls move focus; identity and the full exact draft still
  // have to match the original captured editor. No editor or server mutation.
  readDraft({held,task,editor,expectedSource});
  if(task.mode==='closed') {
    held.errorDialogClosedFor=task.page_tid;
    return {dialog_closed:true,page_tid:task.page_tid,source_sha256:task.expected_source_sha256};
  }
  const tid=task.mode==='button'?stage.wizard_error.tid:dialog.ok_tid;
  const controls=[...root.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')].filter(visible);
  const control=controls[0],native=control&&globalThis.Ext?.getCmp?.(control.id);
  if(controls.length!==1||!root.contains(control)||native?.el?.dom!==control||native.disabled===true
    ||control.closest('.x-item-disabled,.x-btn-disabled')||control.getAttribute('aria-disabled')==='true')
    throw Error('Managed JavaScript error control unavailable');
  const box=control.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
  if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===control||control.contains(hit)))
    throw Error('Managed JavaScript error control covered');
  const result={point:{x,y,tid,node_id:task.owner.node_id,page_tid:task.page_tid},dialog};
  if(new TextEncoder().encode(JSON.stringify(result)).length>16384)
    throw Error('Managed JavaScript error response bound exceeded');
  // Retain the exact DOM object only after the full native/dialog/control proof.
  if(task.mode==='dialog'){held.errorDialogRoot=root;held.errorDialogPageTid=task.page_tid;}
  return result;
}

export async function runManagedJavascriptErrorRead(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured
    ||lease.codeNextAttempted!==true||lease.sourceDraftSha256!==task.expected_source_sha256
    ||!lease.sourceEditorCaptured||typeof lease.sourceDraftText!=='string'
    ||(task.error_stage==='done'?lease.doneAttempted!==true:lease.doneAttempted===true)
    ||task.mode==='closed'&&lease.errorOkAttempted!==true||Date.now()>=task.deadline)
    throw Error('Managed JavaScript error lease unavailable');
  return page.evaluate(inspect,{held:lease.handle,task,editor:lease.sourceEditorCaptured,expectedSource:lease.sourceDraftText});
}

export async function runManagedJavascriptErrorGesture(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  const key=task.mode==='button'?'javascript.wizard.error.open':'javascript.wizard.error.ok';
  const flag=task.mode==='button'?'errorButtonAttempted':'errorOkAttempted';
  const outcome=(status,phase,effect_possible,output,error=null)=>({status,phase,effect_possible,
    cleanup_complete:true,action_key:key,action_revision:'1',operation_id:task.gesture_id,output,error,trace:[]});
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured
    ||lease.codeNextAttempted!==true||lease.sourceDraftSha256!==task.expected_source_sha256
    ||!lease.sourceEditorCaptured||typeof lease.sourceDraftText!=='string'
    ||(task.error_stage==='done'?lease.doneAttempted!==true:lease.doneAttempted===true)||lease[flag]===true||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'WIZARD_ERROR_LEASE_UNAVAILABLE',message:'Owned error gesture lease unavailable'});
  const current=await page.evaluate(inspect,{held:lease.handle,task,editor:lease.sourceEditorCaptured,expectedSource:lease.sourceDraftText});
  if(JSON.stringify(current.point)!==JSON.stringify(task.point)||Date.now()>=task.deadline)
    return outcome('NOT_APPLIED','preflight',false,{}, {code:'WIZARD_ERROR_POINT_CHANGED',message:'Owned error control changed'});
  lease[flag]=true;
  await page.mouse.click(current.point.x,current.point.y);
  return outcome('SUCCEEDED','gesture_returned',true,{gesture_returned:true,dialog_close_verified:false});
}

function validate(task) {
  const {mode,page_tid,tooltip,tooltip_truncated,expected_source_sha256,dialog,gesture_id,point,error_stage='code_next',...base}=task??{};
  makeJavascriptManagedStageCode(base);
  if(!['button','dialog','ok','closed'].includes(mode)||!['code_next','done'].includes(error_stage)
    ||page_tid!==task.workflow_ref.prefix+';WizrdMCF;'+(error_stage==='done'?'DoneWizard':'JavaScriptCodeWizard')
    ||typeof tooltip!=='string'||tooltip.length<1||tooltip.length>4096||typeof tooltip_truncated!=='boolean'
    ||!/^[a-f0-9]{64}$/.test(expected_source_sha256)||dialog!==undefined&&Buffer.byteLength(JSON.stringify(dialog))>16384)
    throw Error('Invalid managed JavaScript error task');
}

function inspector() {
  return `function inspect(args){const stage=${javascriptManagedStageInspector()};`+
    `const dialog=${readJavascriptWizardErrorDialog.toString()};`+
    `const draft=${inspectManagedJavascriptErrorDraft.toString()};`+
    `return (${inspectManagedJavascriptErrorPoint.toString()})(args,stage,dialog,draft);}`;
}

export function makeJavascriptManagedErrorReadCode(task) {
  validate(task);
  if(task.mode==='ok'||task.point!==undefined||task.gesture_id!==undefined)
    throw Error('Invalid managed JavaScript error read');
  return `async page=>(${runManagedJavascriptErrorRead.toString()})(page,${JSON.stringify(task)},${inspector()})`;
}

export function makeJavascriptManagedErrorGestureCode(task) {
  validate(task);
  if(!['button','ok'].includes(task.mode)||task.gesture_id!==task.operation_id+':error-'+task.mode
    ||task.point?.node_id!==task.owner.node_id||task.point.page_tid!==task.page_tid
    ||!Number.isFinite(task.point.x)||!Number.isFinite(task.point.y)
    ||task.mode==='button'&&task.point.tid!==task.workflow_ref.prefix+';WizrdMCF;btnError'
    ||task.mode==='ok'&&(task.dialog?.present!==true||task.point.tid!==task.dialog.ok_tid))
    throw Error('Invalid managed JavaScript error gesture');
  return `async page=>(${runManagedJavascriptErrorGesture.toString()})(page,${JSON.stringify(task)},${inspector()})`;
}

// Called only after the sole Code Next or Done returns its owned receipt.
// Unknown ACKs/replies keep the adapter uncertain and never authorize discard.
export async function captureManagedJavascriptWizardError({task,before,after,expected_source_sha256,
  execute,record,receiptOptions,error_stage='code_next',redactor=createRedactor(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if(before.owner_verified!==true||before.pending!==false||before.preview_visible||before.dialog_diagnostic?.foreign_count!==0
    ||after.wizard_error_refusal!==true||!isCurrentJavascriptWizardRefusal({before,after,pendingSeen:after.pending_seen===true})
    ||Date.now()>=task.deadline)throw Error('Managed JavaScript current refusal unavailable');
  const base={...task,error_stage,page_tid:after.page_tid,tooltip:after.wizard_error.tooltip,
    tooltip_truncated:after.wizard_error.tooltip_truncated,expected_source_sha256};
  const journal=event=>journalManagedJavascriptError({record,deadline:task.deadline},event);
  const send=async(mode,read)=>{
    const gesture_id=task.operation_id+':error-'+mode,key=mode==='button'?'javascript.wizard.error.open':'javascript.wizard.error.ok';
    const request={...base,mode,point:read.point,gesture_id,...(mode==='ok'?{dialog:read.dialog}:{})};
    const code=makeJavascriptManagedErrorGestureCode(request);
    await journal({phase:'javascript_managed_error_'+mode+'_prepared',operation_id:task.operation_id,owner:task.owner,
      gesture_id,source_sha256:expected_source_sha256,point:read.point,deadline:task.deadline,effect_possible:false});
    const signature=createHash('sha256').update(JSON.stringify([gesture_id,task.owner,expected_source_sha256,read.point,task.deadline])).digest('hex');
    const result=await execute(withBrowserReceipt('('+code+')(page)',{
      ...receiptOptions(gesture_id,key,signature),operation_id:gesture_id}),
      {timeout:Math.max(1,Math.min(35000,task.deadline-Date.now()+5000))});
    if(result?.status!=='SUCCEEDED'||result.phase!=='gesture_returned'||result.effect_possible!==true
      ||result.cleanup_complete!==true||result.error!==null||result.action_revision!=='1'
      ||result.action_key!==key||result.operation_id!==gesture_id
      ||result.output?.gesture_returned!==true||result.output.dialog_close_verified!==false||Date.now()>=task.deadline)
      throw Error('Managed JavaScript error gesture unconfirmed');
    await journal({phase:'javascript_managed_error_'+mode+'_returned',operation_id:task.operation_id,
      owner:task.owner,gesture_id,receipt:result,deadline:task.deadline,effect_possible:true});
  };
  if(after.boundary_refusal===null) {
    const button=await execute(makeJavascriptManagedErrorReadCode({...base,mode:'button'}));
    await send('button',button);
  } else if(after.boundary_refusal!=='foreign_dialog'||before.dialog_diagnostic?.visible_count!==0
    ||after.dialog_diagnostic.foreign_count!==1)throw Error('Managed JavaScript automatic dialog not attributable');
  const readCode=makeJavascriptManagedErrorReadCode({...base,mode:'dialog'});
  let observed;
  while(Date.now()<task.deadline) {
    const stage=await execute(makeJavascriptManagedStageCode(task));
    if(stage.mask_diagnostic?.foreign_count!==0)throw Error('Managed JavaScript error opening foreign mask');
    if(stage.boundary_refusal==='foreign_dialog') {
      const roots=stage.dialog_diagnostic?.roots;
      if(stage.dialog_diagnostic?.foreign_count!==1||roots?.length!==1
        ||!/^msgbox(?:-\d+)?$/.test(roots[0].tid)||roots[0].native_el!==true)
        throw Error('Managed JavaScript error opening foreign dialog');
      if(stage.pending===false) { observed=await execute(readCode);break; }
    }
    if(stage.boundary_refusal!==null&&stage.boundary_refusal!=='foreign_dialog'
      ||stage.page_tid!==base.page_tid||stage.wizard_visible!==true||stage.preview_visible)
      throw Error('Managed JavaScript error opening owner changed');
    await wait(Math.min(100,Math.max(1,task.deadline-Date.now())));
  }
  if(!observed?.dialog?.present)throw Error('Managed JavaScript error dialog original deadline expired');
  if(after.boundary_refusal==='foreign_dialog'&&observed.dialog.tid!==after.dialog_diagnostic.roots[0]?.tid)
    throw Error('Managed JavaScript automatic dialog changed');
  await send('ok',observed);
  while(Date.now()<task.deadline) {
    const stage=await execute(makeJavascriptManagedStageCode(task));
    if(stage.mask_diagnostic?.foreign_count!==0)throw Error('Managed JavaScript error closure foreign mask');
    if(stage.boundary_refusal===null&&stage.owner_verified===true&&stage.wizard_visible===true
      &&stage.page_tid===base.page_tid&&!stage.pending&&!stage.preview_visible
      &&stage.dialog_diagnostic.foreign_count===0) {
      const closed=await execute(makeJavascriptManagedErrorReadCode({...base,mode:'closed'}));
      if(closed?.dialog_closed!==true||closed.page_tid!==base.page_tid||closed.source_sha256!==expected_source_sha256)
        throw Error('Managed JavaScript error closed draft unconfirmed');
      const result={owner:task.owner,operation_id:task.operation_id,error_stage,source_sha256:expected_source_sha256,
        page_tid:base.page_tid,tooltip:redactor.text(base.tooltip),tooltip_truncated:base.tooltip_truncated,
        dialog_text:redactor.text(observed.dialog.text),dialog_text_truncated:observed.dialog.text_truncated,
        dialog_tid:observed.dialog.tid,dialog_closed:true,native_owner_verified:true,explicit_execute_requested:false};
      if(Buffer.byteLength(JSON.stringify(result))>16384)throw Error('Managed JavaScript native diagnostic response bound exceeded');
      await journal({phase:'javascript_managed_error_observed',deadline:task.deadline,...result});
      return result;
    }
    if(stage.boundary_refusal==='foreign_dialog'&&!stage.pending)await execute(readCode);
    if(stage.page_tid!==base.page_tid||stage.boundary_refusal!==null&&stage.boundary_refusal!=='foreign_dialog')
      throw Error('Managed JavaScript error closure owner changed');
    await wait(Math.min(100,Math.max(1,task.deadline-Date.now())));
  }
  throw Error('Managed JavaScript error dialog closure original deadline expired');
}
