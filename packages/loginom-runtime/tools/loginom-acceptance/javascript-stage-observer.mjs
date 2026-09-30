export {readJavascriptStage} from '../../client/lib/javascript-stage-read.mjs';
import {isCurrentJavascriptWizardRefusal} from '../../client/lib/javascript-wizard-refusal.mjs';

// Only changed states are journalled, with a hard cap per original dispatch.
// The final observation remains mandatory even after this diagnostic cap.
export async function recordJavascriptStageChange({state,identity,snapshot,record}) {
  const diagnostic={owner_verified:snapshot.owner_verified,native_owner_verified:snapshot.native_owner_verified,
    boundary_refusal:snapshot.boundary_refusal,connection_diagnostic:snapshot.connection_diagnostic,dialog_diagnostic:snapshot.dialog_diagnostic,wizard_visible:snapshot.wizard_visible,
    wizard_error:snapshot.wizard_error,
    preview_visible:snapshot.preview_visible,preview_owned:snapshot.preview_owned,preview_settled:snapshot.preview_settled,
    page_tid:snapshot.page_tid,pending:snapshot.pending,preview_diagnostic:snapshot.preview_diagnostic,
    ...(snapshot.calibration_native_exception?{calibration_native_exception:snapshot.calibration_native_exception}:{}),
    message_ids:snapshot.messages.map(message=>message.id)};
  const fingerprint=JSON.stringify(diagnostic);
  if(fingerprint===state.fingerprint||state.count>=16)return;
  state.fingerprint=fingerprint;state.count++;
  await record({phase:'execution_stage_changed',identity,observation:state.count,diagnostic,last_diagnostic_slot:state.count===16});
}

export async function closeJavascriptPreviewOnce({read,state,record,close,waitHidden}) {
  const snapshot=await read();
  if(snapshot.boundary_refusal)throw Error('Execution stage boundary refused: '+snapshot.boundary_refusal);
  if(!snapshot.preview_visible)return;
  if(!snapshot.owner_verified||!snapshot.preview_owned||!snapshot.preview_settled||snapshot.pending)
    throw Error('Preview cleanup ownership or settlement unconfirmed');
  if(state.dispatched)throw Error('Preview close already dispatched; do not replay');
  state.dispatched=true;
  await record({phase:'preview_cleanup_dispatch',preview_diagnostic:snapshot.preview_diagnostic});
  await close();
  await waitHidden();
}

export function javascriptStageTerminal({stage,before,after}) {
  if(!after||after.pending||after.boundary_refusal)return false;
  if(stage==='preview')return after.owner_verified===true&&after.preview_owned===true&&after.preview_settled===true;
  return after.calibration_native_exception?.present===true&&after.calibration_native_exception.fresh===true&&after.calibration_native_exception.native_owner_verified===true
    ||after.messages.some(message=>!before.messages.some(old=>old.id===message.id))
    ||stage==='next'&&after.owner_verified&&!!after.page_tid&&after.page_tid!==before.page_tid
    ||stage==='done'&&!after.wizard_visible;
}

export async function requireJavascriptStageAdmission({stage,before,identity,record}) {
  const reason=before.boundary_refusal||(!before.owner_verified?'owner_unconfirmed':before.pending?'pending'
    :stage==='preview'&&!before.preview_diagnostic?.code_owned?'code_owner_unconfirmed':null);
  if(!reason)return;
  await record({phase:'execution_stage_admission_refused',identity,reason,effect_dispatched:false,before});
  throw Error('Execution stage admission refused: '+reason);
}

export async function waitJavascriptStageObservation({read,wait,deadline,stage,before,identity,record}) {
  const changes={count:0};let after,pendingSeen=false,refusalPolls=0;
  while(Date.now()<deadline){
    after=await read();
    await recordJavascriptStageChange({state:changes,identity,snapshot:after,record});
    pendingSeen ||= after.pending===true;
    const currentError=isCurrentJavascriptWizardRefusal({before,after,pendingSeen});
    refusalPolls=currentError?refusalPolls+1:0;
    if(currentError&&(refusalPolls>=2||after.boundary_refusal==='foreign_dialog')){after.wizard_error_refusal=true;break;}
    if(javascriptStageTerminal({stage,before,after})&&!currentError)break;
    if(after.boundary_refusal)break;
    await wait(Math.min(200,Math.max(1,deadline-Date.now())));
  }
  return after;
}
