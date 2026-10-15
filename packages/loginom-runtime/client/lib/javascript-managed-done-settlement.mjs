import {makeJavascriptManagedPageCode} from './javascript-managed-page.mjs';
import {javascriptManagedStageInspector} from './javascript-managed-stage.mjs';
import {inspectManagedJavascriptCloseDecision} from './javascript-managed-close.mjs';
import {makeJavascriptExistingGraphTypeCode} from './javascript-existing-type.mjs';
import {inspectManagedJavascriptErrorDraft,journalManagedJavascriptError} from './javascript-managed-wizard-error.mjs';
import {isCurrentJavascriptWizardRefusal} from './javascript-wizard-refusal.mjs';

export function inspectManagedJavascriptDoneOutcome(args,readStage,readGraph,readDraft) {
  const {held,task}=args,root=held.wizardRoot;
  if(root?.isConnected&&root.getBoundingClientRect().width>0&&root.getBoundingClientRect().height>0
    &&getComputedStyle(root).visibility!=='hidden') {
    const stage=readStage(args);
    if(stage.page_tid!==task.workflow_ref.prefix+';WizrdMCF;DoneWizard')
      throw Error('Managed JavaScript Done settlement page changed');
    readDraft({...args,task:{...task,error_stage:'done'}});
    return {state:'wizard',stage};
  }
  if(globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.Connected!==true)
    throw Error('Managed JavaScript Done settlement connection changed');
  const graph=readGraph(args);
  if(!['waiting','closed'].includes(graph.state))throw Error('Managed JavaScript Done graph boundary changed');
  return {state:graph.state,graph};
}

export async function runManagedJavascriptDoneOutcome(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured
    ||lease.codeNextAttempted!==true||lease.doneAttempted!==true||lease.closeAttempted===true
    ||lease.sourceDraftSha256!==task.expected_source_sha256||!lease.sourceEditorCaptured
    ||typeof lease.sourceDraftText!=='string'||Date.now()>=task.deadline)
    throw Error('Managed JavaScript Done outcome lease unavailable');
  return page.evaluate(inspect,{held:lease.handle,task,editor:lease.sourceEditorCaptured,expectedSource:lease.sourceDraftText});
}

export function makeJavascriptManagedDoneOutcomeCode(task) {
  const {expected_source_sha256,...base}=task;
  makeJavascriptManagedPageCode(base);
  if(!/^[a-f0-9]{64}$/.test(expected_source_sha256))throw Error('Managed JavaScript Done outcome draft unavailable');
  const inspect=`function inspect(args){const stage=${javascriptManagedStageInspector()};`+
    `const graph=${inspectManagedJavascriptCloseDecision.toString()};`+
    `const draft=${inspectManagedJavascriptErrorDraft.toString()};`+
    `return (${inspectManagedJavascriptDoneOutcome.toString()})(args,stage,graph,draft);}`;
  return `async page=>(${runManagedJavascriptDoneOutcome.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

// No fixed retry count and no replay: native owner/masks/source remain bound to
// the original operation deadline after the single acknowledged Done gesture.
export async function waitManagedJavascriptDoneSettlement({task,before,expected_source_sha256,execute,record,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(before.owner_verified!==true||before.native_owner_verified!==true||!same(before.owner,task.owner)
    ||before.pending!==false||before.preview_visible||before.boundary_refusal!==null
    ||before.dialog_diagnostic?.foreign_count!==0||before.mask_diagnostic?.foreign_count!==0
    ||before.page_tid!==task.workflow_ref.prefix+';WizrdMCF;DoneWizard')
    throw Error('Managed JavaScript Done settlement baseline changed');
  const code=makeJavascriptManagedDoneOutcomeCode({...task,expected_source_sha256});
  let pendingSeen=false,refusalPolls=0;
  while(Date.now()<task.deadline) {
    const outcome=await execute(code);
    if(Date.now()>=task.deadline)break;
    if(outcome.state==='closed') {
      const graph=await execute(makeJavascriptExistingGraphTypeCode(task.prepared));
      if(graph?.verified!==true||graph.node_id!==task.owner.node_id||graph.graph_tid!==outcome.graph.graph_tid)
        throw Error('Managed JavaScript Done independent graph changed');
      await journalManagedJavascriptError({record,deadline:task.deadline},{phase:'javascript_managed_done_settled',
        operation_id:task.operation_id,owner:task.owner,source_sha256:expected_source_sha256,
        graph:outcome.graph,independent_graph_type:graph,deadline:task.deadline,execution_started:null});
      return {owned_done_settled:true,graph_owner_verified:true};
    }
    if(outcome.state==='wizard') {
      const after=outcome.stage;
      if(after.native_owner_verified!==true||!same(after.owner,task.owner)||!after.wizard_visible||after.preview_visible
        ||after.page_tid!==before.page_tid||after.mask_diagnostic?.foreign_count!==0)
        throw Error('Managed JavaScript Done settlement owner or mask changed');
      pendingSeen ||= after.pending===true;
      const refused=isCurrentJavascriptWizardRefusal({before,after,pendingSeen});
      refusalPolls=refused?refusalPolls+1:0;
      if(refused&&(refusalPolls>=2||after.boundary_refusal==='foreign_dialog')) {
        await journalManagedJavascriptError({record,deadline:task.deadline},{phase:'javascript_managed_done_refused',
          operation_id:task.operation_id,owner:task.owner,page_tid:after.page_tid,pending_seen:pendingSeen,
          button_tid:after.wizard_error.tid,automatic_dialog:after.boundary_refusal==='foreign_dialog',deadline:task.deadline});
        return {...after,wizard_error_refusal:true,pending_seen:pendingSeen};
      }
      if(after.boundary_refusal!==null)throw Error('Managed JavaScript Done settlement boundary refused');
    } else if(outcome.state!=='waiting')throw Error('Managed JavaScript Done settlement unknown outcome');
    await wait(Math.min(100,Math.max(1,task.deadline-Date.now())));
  }
  throw Error('Managed JavaScript Done settlement original deadline expired');
}
