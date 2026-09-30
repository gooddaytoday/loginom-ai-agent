import {makeJavascriptManagedStageCode} from './javascript-managed-stage.mjs';
import {isCurrentJavascriptWizardRefusal} from './javascript-wizard-refusal.mjs';
import {journalManagedJavascriptError} from './javascript-managed-wizard-error.mjs';

// Observe only after the sole owned Code Next receipt returned. Masks, a stale
// button, silence and expiry never establish success or a recoverable refusal.
export async function waitManagedJavascriptCodeSettlement({task,before,execute,record,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
  if(before.owner_verified!==true||before.native_owner_verified!==true||!same(before.owner,task.owner)
    ||before.pending!==false||before.preview_visible||before.dialog_diagnostic.foreign_count!==0
    ||before.page_tid!==task.workflow_ref.prefix+';WizrdMCF;JavaScriptCodeWizard')
    throw Error('Managed JavaScript Code settlement baseline changed');
  const code=makeJavascriptManagedStageCode(task);
  let pendingSeen=false,refusalPolls=0;
  while(Date.now()<task.deadline) {
    const after=await execute(code);
    if(Date.now()>=task.deadline)break;
    if(after.native_owner_verified!==true||!same(after.owner,task.owner)||after.wizard_visible!==true||after.preview_visible)
      throw Error('Managed JavaScript Code settlement owner changed');
    pendingSeen ||= after.pending===true;
    const refused=isCurrentJavascriptWizardRefusal({before,after,pendingSeen});
    refusalPolls=refused?refusalPolls+1:0;
    if(refused&&(refusalPolls>=2||after.boundary_refusal==='foreign_dialog')) {
      const result={...after,wizard_error_refusal:true,pending_seen:pendingSeen};
      // Do not journal raw tooltip/message source; capture publishes a redacted
      // exact diagnostic after its independently verified native dialog close.
      await journalManagedJavascriptError({record,deadline:task.deadline},{phase:'javascript_managed_code_next_refused',
        operation_id:task.operation_id,owner:task.owner,page_tid:after.page_tid,pending_seen:pendingSeen,
        button_tid:after.wizard_error.tid,automatic_dialog:after.boundary_refusal==='foreign_dialog',deadline:task.deadline});
      return result;
    }
    if(after.boundary_refusal!==null)throw Error('Managed JavaScript Code settlement boundary refused');
    if(after.pending===false&&after.owner_verified===true
      &&after.page_tid===task.workflow_ref.prefix+';WizrdMCF;DoneWizard')return after;
    // Intermediate pages authorize no action. The caller independently checks
    // the native Done page and indicator index before its one Done gesture.
    await wait(Math.min(100,Math.max(1,task.deadline-Date.now())));
  }
  throw Error('Managed JavaScript Code settlement original deadline expired');
}
