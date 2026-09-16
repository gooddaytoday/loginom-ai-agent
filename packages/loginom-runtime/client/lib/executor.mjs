import {requireStorageDestination,requireExportDestination,storageTidSuffix} from './storage-policy.mjs';
import {resolveArtifactUploadConflict} from './artifact-upload-conflict.mjs';
import {makeArtifactDiscoveryDownloadCode,verifiedDiscoveryReference} from './artifact-discovery.mjs';
import {createArtifactDelivery} from './artifact-delivery.mjs';
import { prepareNodeTarget, inspectNodeTarget } from './node-target.mjs';
import { createNodeTargetBrowserAdapter } from './node-target-browser.mjs';
import { validateNodeTargetRequest } from './node-contracts.mjs';
import { describeNodeTypes } from './node-contracts.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { requireCapability } from './capability-registry.mjs';
import { actionDescribeTool, actionRunTool, assertActionOutcome, validateActionParameters } from './action-catalog.mjs';
import { makeWorkspaceUiCode, validateUiAction, uiActionSchema } from './workspace-ui.mjs';
import { createObservationPages } from './observation-pages.mjs';
import { makeWorkspaceBootstrapCode } from './workspace.mjs';
import { createNodeProcedure } from './node-procedure.mjs';
import { applyNode, validateNodeApplyRequest, reconcileNodeWorkflow } from './node-apply.mjs';
import {reconcileInputMappingPhase} from './node-input-mapping-recovery.mjs';
import { createNodeOperationRunner } from './node-operation-runner.mjs';
import {nodeApiTools,deliveryApiTools} from './node-api.mjs';
import { configureTextImportDraft, validateTextImportRequest } from './text-import-procedure.mjs';

const identifier = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' };
const operationInspectTool = { name: 'dock_operation_inspect',
  description: 'Inspect or reconcile a Dock operation from its actual browser receipt and current UI. Read-only; explains partial effects and available recovery. A tool failure does not terminate the task.',
  inputSchema: { type: 'object', properties: { operation_id: identifier }, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } };
const operationRecoverTool = { name: 'dock_operation_recover',
  description: 'Recover in the same session: complete_link connects the existing added input; restore_control confirms cleanup of a completed call; accept_observed_state resolves an uncertain generic UI gesture after a fresh observation. abandon_operation explicitly stops pursuing a completed operation after inspecting its fresh state, so a mistaken request or changed goal can be corrected with new actions. Its original outcome remains unsuccessful; it does not undo effects or verify the goal. Both observation strategies require observation_id and confirmed browser completion/cleanup. operation_id is the original pending ID; recovery_operation_id is a NEW unique request ID (for example repair-001). Inspect first, verify and continue.',
  inputSchema: { type: 'object', properties: { operation_id: identifier, recovery_operation_id: identifier,
    observation_id: identifier, strategy: { type: 'string', enum: ['complete_link', 'restore_control', 'accept_observed_state', 'abandon_operation'] } }, required: ['operation_id', 'recovery_operation_id', 'strategy'], additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } };
const uiActionTool = { name: 'dock_ui_action',
  description: 'Perform one bounded UI gesture on a fresh ref from dock_workspace_observe: click, double_click, right_click, fill, press, drag, scroll, set_checked, replace_expression, set_wizard_field, wizard_step or select_wizard_option. right_click sends one right mouse click; observe the resulting menu before selecting an item. action uses verb, e.g. {verb:"click",ref:"<observed ui-ref>"}, {verb:"drag",source_ref:"<observed ui-ref>",target_ref:"<observed ui-ref>"} or {verb:"scroll",ref:"<observed ui-ref>",delta_y:300}. Scroll requires allowed_actions including scroll and targets only its observed scroll owner; delta_y is a nonzero integer within -1000..1000. For horizontal scrolling use the offered scroll_horizontal with delta_x in the same bounds; its horizontal_scroll identifies the exact owner. Import definition grids scroll through their observed data-preview scroller. For a checkbox/radio use {verb:"set_checked",ref:"<observed ui-ref>",checked:true}; check_state is read before/after and an already satisfied request does not click. Radio options can only be selected, not independently unchecked. replace_expression uses {verb:"replace_expression",ref:"<editor ui-ref>",text:"Quantity * UnitPrice"} only when explicitly offered by the Calculator editor. It replaces the selected expression through keyboard input and confirms exact LF text (max 2048 characters/128 lines) via its bound document. It does not apply wizard settings or prove valid syntax; inspect errors and apply separately. For an import format input or an output column name/label input offering set_wizard_field, use {verb:"set_wizard_field",ref:"<field ui-ref>",text:"<exact value>"}. text is literal input, not a dropdown option label. Observed native maxlength is enforced before input. This checks the observed wizard and original values, writes through the keyboard, and confirms the exact draft value (max 256 characters, no line breaks). wizard_field identifies its current form and setting; this does not establish node ownership or applied settings. Prefer this contract over generic fill when offered. For Next/Previous buttons offering wizard_step, use {verb:"wizard_step",ref:"<button ui-ref>",expected_stage:"<recognized destination stage>"}. It clicks once and waits a bounded time for that exact different stage in the same form. An unconfirmed transition remains pending; inspect before retrying. It does not apply settings, confirm syntax, execute nodes or auto-confirm dialogs. For import dropdowns, click an observed wizard_combo picker once, then observe the opened list (discover its boundlist root if it floats outside the wizard). Choose an offered option with {verb:"select_wizard_option",ref:"<observed option ui-ref>"}; its exact E2E owner/list identity binds the selection to the field, whose displayed value is read back. Never type an option label such as Точка с запятой as a raw delimiter. Selection confirms displayed UI state only, not applied settings. For an observed output column editor, apply_output_column confirms all five resulting row properties after one Apply click; cancel_output_column confirms the unchanged original row after one Cancel click. Both require separate port saving and readback. For a field-parameters editor offering apply_reform_column or cancel_reform_column, these confirm all seven row properties, including caching and exclusion, after one click; node saving and reopened readback remain separate. For observed Calculator expression parameters, use offered apply_expression_parameters or cancel_expression_parameters to confirm the resulting selected row. select_wizard_option also handles the observed expression type list. For graph settings offering open_wizard, prefer that one-click node/path-bound opening contract. For the last wizard page offering finish_wizard, it confirms Done and return to the expected graph node, but requires separate reopened settings readback and does not prove package save. Never use fill or press to bypass an unavailable editor contract. Read the new observation after scrolling; old refs/pages are invalid. Use for settings, execution, inspection and repairs outside the ready-made actions. No JavaScript or selectors. A successful gesture is not proof of task completion: inspect its result. operation_id is a NEW unique UI request ID; for a pending partial action, recovery_operation_id is that ORIGINAL pending operation ID.',
  inputSchema: { type: 'object', properties: { observation_id: identifier, operation_id: identifier, recovery_operation_id: identifier,
    action: uiActionSchema },
    required: ['observation_id', 'operation_id', 'action'], additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } };
const artifactUploadTool = {name:'dock_artifact_upload',
  description:'Submit an operator-authorized input artifact to its exact Loginom destination. Requires artifact_id and upload_grant_id from dock_prepare plus a fresh observation with file_storage.status=observed and file_storage.directory equal to the grant directory. First open the main Файлы (Files) workspace using its observed control and enter that exact directory. Then call this artifact tool directly; do not press the Upload toolbar button or open a native file chooser. The import wizard file-selection dialog only selects existing server files; it is not the upload workspace. Cancel that dialog through its observed control before opening Files. Upload and verify the artifact before selecting it in the import wizard. This candidate supports only explicitly authorized replace; reject is unavailable and never silently changed. Submission is not upload completion: the operation remains pending for server verification. Read the original upload with dock_operation_inspect before verification to confirm pending state, confirmed cleanup and its immutable receipt; after successful verification inspect it again to confirm resolved state before scenario changes. A repeated operation_id never sends the file again. No local paths, selectors, or overwrite choices are accepted.',
  inputSchema:{type:'object',additionalProperties:false,required:['artifact_id','upload_grant_id','observation_id','operation_id'],
    properties:{artifact_id:identifier,upload_grant_id:identifier,observation_id:identifier,operation_id:identifier}},
  annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}};
const artifactVerifyTool={name:'dock_artifact_verify',
  description:'Download and verify the exact authorized CSV/TSV for a pending upload. operation_id is the ORIGINAL upload; verification_id is a new unique verification request. Supply observation_id and file_ref from a fresh detailed file-row observation. If that exact CSV/TSV is vertically outside its viewport, verification may reveal it with one checked scroll of its original observed owner, at most 1000 pixels, before a fresh checked download gesture. It cannot navigate folders or reveal another file. An unconfirmed reveal remains an effect and does not verify bytes. Public UI repair remains unavailable while upload verification is pending. This checks downloaded name, size and SHA, without resubmitting the upload. Repeat the same verification_id or inspect the original operation after a lost response; never bypass uncertainty with a new ID. Confirmed submission plus matching destination bytes, cleanup and durable receipts complete the original transfer. Inspect it and obtain fresh UI refs before continuing.',
  inputSchema:{type:'object',additionalProperties:false,required:['operation_id','verification_id','observation_id','file_ref'],
    properties:{operation_id:identifier,verification_id:identifier,observation_id:identifier,file_ref:identifier}},
  annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}};
export const executorTools = [actionDescribeTool, actionRunTool, operationInspectTool, operationRecoverTool, uiActionTool];

async function browserArtifactUpload(page,task,observe,resolveConflict) {
  let phase='preconditions',effect=false,input;
  const trace=[];
  const outcome=(status,code,output={})=>({status,action_key:'artifact.upload',action_revision:'1',operation_id:task.operation_id,
    phase,effect_possible:effect,cleanup_complete:true,output,error:code?{code,message:code}:null,trace});
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  try {
    if(task.artifact.upload.overwrite!=='replace'&&!(task.decide_conflicts&&task.artifact.upload.overwrite==='reject'))return outcome('NOT_APPLIED','UPLOAD_POLICY_UNAVAILABLE');
    let current,prefix,expectedEpoch=task.snapshot.dom_epoch,refreshes=0;
    const refresh=next=>{
      if(!task.decide_conflicts||refreshes>=2||next?.document!==task.snapshot.dom_epoch?.document)return false;
      trace.push({event:'upload_precondition_refreshed',status:'NOT_APPLIED',effect_possible:false,
        reason:'UPLOAD_CONTEXT_CHANGED',attempt:++refreshes,before:expectedEpoch,after:next,destination:task.artifact.upload.destination});
      expectedEpoch=next;return true;
    };
    while(true) {
    const read=await observe(page);current=read.output;
    if(read.status!=='SUCCEEDED')return outcome('NOT_APPLIED','UPLOAD_OBSERVATION_FAILED');
    if(!current.authenticated || current.origin!==task.expected_origin || current.loginom_build!==task.expected_build
      || !same(current.workflow_ref,task.snapshot.workflow_ref) || current.dom_epoch?.document!==task.snapshot.dom_epoch?.document)
      return outcome('NOT_APPLIED','UPLOAD_CONTEXT_CHANGED');
    if(current.file_storage?.status!=='observed' || current.file_storage.directory!==task.artifact.upload.directory
      || current.ui.dialogs.length || current.ui.masks.length)return outcome('NOT_APPLIED','UPLOAD_DESTINATION_UNAVAILABLE');
    if(!same(current.dom_epoch,expectedEpoch)&&!refresh(current.dom_epoch))return outcome('NOT_APPLIED','UPLOAD_CONTEXT_CHANGED');
    prefix=current.workflow_ref?.prefix;
    if(typeof prefix!=='string' || !/^MF;TF(?:-\d+)?$/.test(prefix))return outcome('NOT_APPLIED','UPLOAD_CONTEXT_CHANGED');
    // E2E bg/helpers/filestorage.UploadFiles uses this hidden native input.
    const toolbar=page.locator(`[data-tid="${prefix};FileStorageForm;tbrActions"]`);
    const target=toolbar.locator('input[type="file"]');
    if(await toolbar.count()!==1 || !await toolbar.isVisible() || !await toolbar.isEnabled()
      || await target.count()!==1 || !await target.isEnabled())return outcome('NOT_APPLIED','UPLOAD_INPUT_UNAVAILABLE');
    input=await target.elementHandle();
    if(!input || !await input.evaluate(element=>element.isConnected && element.tagName==='INPUT' && element.type==='file'))
      return outcome('NOT_APPLIED','UPLOAD_INPUT_UNAVAILABLE');
    const epoch=await page.evaluate(()=>{
      const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
      if(!state?.observer)return null;
      state.revision+=state.observer.takeRecords().length;return {document:state.epoch,revision:state.revision};
    });
    if(same(epoch,current.dom_epoch))break;
    if(!refresh(epoch))return outcome('NOT_APPLIED','UPLOAD_CONTEXT_CHANGED');
    await input.dispose();input=null;
    }
    if(task.decide_conflicts) {
      const admissible=await input.evaluate((element,task)=>{
        const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController,s=f?.FFileSenderManager;
        return f?.constructor?.name==='FileStorageForm'&&f.FFileInput===element&&element.files?.length===0
          &&s?.constructor?.name==='FileSenderManager'&&s.FLastConflictResult===undefined&&s.FActiveLoadersCount===0
          &&s.CurrentDirectory===task.artifact.upload.directory.replace(/\/?$/,'/')
          &&Object.keys(s.FCurrentUploadFilePaths??{}).length===0;
      },task);
      if(!admissible)return outcome('NOT_APPLIED','UPLOAD_SENDER_NOT_IDLE');
    }
    trace.push({event:'upload_preconditions_verified',destination:task.artifact.upload.destination});
    phase='submitting';effect=true;
    await input.setInputFiles(task.upload_path,{timeout:15000});
    phase='submitted';trace.push({event:'upload_input_submitted'});
    if(task.decide_conflicts) {
      const decisionTask={operation_id:task.operation_id,overwrite:task.artifact.upload.overwrite,
        expected_origin:task.expected_origin,expected_build:task.expected_build,document:current.dom_epoch.document,prefix,
        directory:task.artifact.upload.directory,destination:task.artifact.upload.destination,name:task.artifact.name,bytes:task.artifact.bytes};
      const deadline=Date.now()+15000;let settled=false;
      while(Date.now()<deadline) {
        const state=await input.evaluate((element,task)=>{
          const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController,s=f?.FFileSenderManager;
          if(f?.constructor?.name!=='FileStorageForm'||f.FFileInput!==element||!element.isConnected
            ||s?.CurrentDirectory!==task.artifact.upload.directory.replace(/\/?$/,'/'))return 'foreign';
          const titles=[...document.querySelectorAll('[data-tid="msgbox;p.h;p.t"]')].filter(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.width>0&&r.height>0;});
          if(titles.length)return 'dialog';
          return element.files?.length===0&&s.FLastConflictResult===undefined&&s.FActiveLoadersCount===0?'settled':'waiting';
        },task);
        if(state==='foreign')return outcome('AMBIGUOUS','UPLOAD_SENDER_CHANGED');
        if(state==='dialog') {
          const decision=await resolveConflict(page,decisionTask);trace.push(...decision.trace);
          if(decision.status!=='SUCCEEDED'||!decision.cleanup_complete)return {...outcome('AMBIGUOUS','UPLOAD_CONFLICT_UNRESOLVED'),cleanup_complete:decision.cleanup_complete===true};
          if(decision.output.disposition==='rejected')return outcome('FAILED','UPLOAD_PATH_CONFLICT',{
            upload_submitted:false,conflict_rejected:true,destination:task.artifact.upload.destination});
          settled=true;break;
        }
        if(state==='settled'){settled=true;break;}
        await page.waitForTimeout(100);
      }
      if(!settled)return outcome('AMBIGUOUS','UPLOAD_DECISION_UNKNOWN');
      trace.push({event:'upload_native_input_settled',policy:task.artifact.upload.overwrite});
    }
    // Native input completion does not establish completion of Loginom's
    // asynchronous server transfer. Keep the operation pending, even on receipt.
    return outcome('AMBIGUOUS','UPLOAD_SERVER_VERIFICATION_REQUIRED',{upload_submitted:true,
      artifact_id:task.artifact.artifact_id,upload_grant_id:task.artifact.upload.grant_id,destination:task.artifact.upload.destination,
      bytes:task.artifact.bytes,sha256:task.artifact.sha256,verification_required:true});
  } catch {return outcome(effect?'AMBIGUOUS':'NOT_APPLIED',effect?'UPLOAD_SUBMISSION_UNCERTAIN':'UPLOAD_PREFLIGHT_FAILED');}
  finally {if(input)try{await input.dispose();}catch{}}
}

export function makeArtifactUploadCode(options) {
  const observe=makeWorkspaceUiCode({mode:'observe',root_ref:options.snapshot?.observation_root?.ref,
    expected_build:options.expected_build,expected_origin:options.expected_origin});
  return `async (page) => (${browserArtifactUpload.toString()})(page,${JSON.stringify(options)},${observe},${resolveArtifactUploadConflict.toString()})`;
}

async function browserArtifactReveal(page,task,snapshot) {
  return page.evaluate(({task,snapshot})=>{
    const reject=code=>({applied:false,code});
    const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
    state?.captureMutations?.(state.observer.takeRecords());
    if(!state || state.epoch!==snapshot.dom_epoch?.document || state.revision!==snapshot.dom_epoch?.revision)return reject('DOWNLOAD_REVEAL_EPOCH_CHANGED');
    const row=snapshot.ui.elements.find(e=>e.ref===task.file_ref),scroll=row?.scroll;
    const file=state.refs?.get(task.file_ref)?.deref(),owner=state.refs?.get(scroll?.ref)?.deref();
    if(!file?.isConnected || !owner?.isConnected || !owner.contains(file)
      || file.getAttribute('data-tid')!==row.tid || file.textContent.trim()!==task.artifact.name)return reject('DOWNLOAD_REVEAL_TARGET_CHANGED');
    let nearest=null;
    for(let parent=file.parentElement;parent;parent=parent.parentElement) {
      if(parent.scrollHeight>parent.clientHeight && ['auto','scroll'].includes(getComputedStyle(parent).overflowY)){nearest=parent;break;}
    }
    if(nearest!==owner || owner.scrollTop!==scroll.top || owner.scrollHeight-owner.clientHeight!==scroll.max_top)
      return reject('DOWNLOAD_REVEAL_OWNER_CHANGED');
    const f=file.getBoundingClientRect(),o=owner.getBoundingClientRect(),style=getComputedStyle(owner);
    const top=Math.max(0,o.top??o.y),bottom=Math.min(innerHeight,(o.top??o.y)+owner.clientHeight);
    const left=Math.max(0,o.left??o.x),right=Math.min(innerWidth,(o.left??o.x)+owner.clientWidth);
    const fy=f.top??f.y,fx=f.left??f.x;
    if(style.display==='none' || style.visibility==='hidden' || bottom<=top || right<=left
      || f.height<=0 || f.height>bottom-top || fx<left || fx+f.width>right)return reject('DOWNLOAD_REVEAL_NOT_VERTICAL');
    const point=document.elementFromPoint((left+right)/2,(top+bottom)/2);
    if(!point || !owner.contains(point))return reject('DOWNLOAD_REVEAL_OWNER_BLOCKED');
    const delta=Math.ceil(fy<top?fy-top:fy+f.height>bottom?fy+f.height-bottom:0);
    const target=Math.min(scroll.max_top,Math.max(0,scroll.top+delta));
    if(!delta || Math.abs(delta)>1000 || target-scroll.top!==delta)return reject('DOWNLOAD_REVEAL_LIMIT');
    owner.scrollTop=target;
    return {applied:true,file_ref:task.file_ref,owner_ref:scroll.ref,from:scroll.top,to:owner.scrollTop,
      max_top:scroll.max_top,delta,document:state.epoch};
  },{task:{file_ref:task.file_ref,artifact:{name:task.artifact.name}},snapshot});
}

async function browserArtifactDownload(page,task,observe,act,reveal) {
  let phase='preconditions',gesture=false,download=null,completed=false,event,revealed=false;
  const trace=[],destination=task.output_binding??task.artifact.upload;
  const result=(status,code,output={})=>({status,action_key:'artifact.download',action_revision:'1',operation_id:task.operation_id,
    phase,effect_possible:gesture,cleanup_complete:!gesture || completed,output,
    error:code?{code,message:code}:null,trace});
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const contextMatches=current=>current.authenticated && current.origin===task.expected_origin
    && current.loginom_build===task.expected_build && same(current.workflow_ref,task.snapshot.workflow_ref)
    && current.dom_epoch?.document===task.snapshot.dom_epoch?.document
    && current.active_tab_ref===task.snapshot.active_tab_ref && same(current.package_identity,task.snapshot.package_identity)
    && current.file_storage?.status==='observed' && current.file_storage.directory===destination.directory
    && current.ui.dialogs.length===0 && current.ui.masks.length===0;
  try {
    let before=await observe(page);
    if(before.status!=='SUCCEEDED' || !contextMatches(before.output)
      || !same(before.output.dom_epoch,task.snapshot.dom_epoch)) {
      const current=before.output??{};
      trace.push({event:'download_context_refused',checks:{observation:before.status==='SUCCEEDED',
        authenticated:current.authenticated===true,origin:current.origin===task.expected_origin,
        build:current.loginom_build===task.expected_build,workflow:same(current.workflow_ref,task.snapshot.workflow_ref),
        epoch:same(current.dom_epoch,task.snapshot.dom_epoch),tab:current.active_tab_ref===task.snapshot.active_tab_ref,
        package:same(current.package_identity,task.snapshot.package_identity),
        storage:current.file_storage?.status==='observed'&&current.file_storage.directory===destination.directory,
        dialogs:current.ui?.dialogs?.length===0,masks:current.ui?.masks?.length===0}});
      return result('NOT_APPLIED','DOWNLOAD_CONTEXT_CHANGED');
    }
    const original=task.snapshot.ui.elements.find(e=>e.ref===task.file_ref);
    const target=current=>current.ui.elements.find(e=>e.ref===task.file_ref && e.tid===original.tid && e.label===task.artifact.name);
    if(['outside_viewport','point_not_observed'].includes(original.interaction?.state)) {
      if(!original.scroll?.ref)return result('NOT_APPLIED','DOWNLOAD_REVEAL_OWNER_MISSING');
      const fresh=target(before.output);
      if(!fresh || !same(fresh.scroll,original.scroll))return result('NOT_APPLIED','DOWNLOAD_REVEAL_TARGET_CHANGED');
      phase='revealing';
      // The synchronous helper performs at most one owner-only scroll. Once
      // invoked, an uncertain response must conservatively retain its effect.
      gesture=true;
      const moved=await reveal(page,task,before.output);
      gesture=moved.applied===true;
      if(!gesture)return result('NOT_APPLIED',moved.code);
      revealed=true;completed=true;
      trace.push({event:'download_file_revealed',...moved});
      if(moved.to!==moved.from+moved.delta)return result('AMBIGUOUS','DOWNLOAD_REVEAL_NOT_CONFIRMED');
      let file,quiet=0,previous=null;
      const settleDeadline=Date.now()+2000;
      // Scrolling changes layout asynchronously. Observe only: never repeat
      // the owner scroll, and stop immediately if its binding changes.
      for(let attempt=0;attempt<12 && Date.now()<settleDeadline;attempt++) {
        if(attempt)await page.waitForTimeout(Math.min(100,Math.max(1,settleDeadline-Date.now())));
        before=await observe(page);
        file=before.status==='SUCCEEDED' && target(before.output);
        // Buffered Loginom rows can round the scroll extent by one CSS pixel
        // on repaint. The owner, exact scrollTop and target still must agree.
        const extentMatches=Number.isSafeInteger(file?.scroll?.max_top)&&file.scroll.max_top>=moved.to
          &&Math.abs(file.scroll.max_top-moved.max_top)<=1;
        if(!file || !contextMatches(before.output) || file.scroll?.ref!==original.scroll.ref
          || file.scroll.top!==moved.to || !extentMatches) {
          trace.push({event:'download_reveal_refused',checks:{file:!!file,context:before.status==='SUCCEEDED'&&contextMatches(before.output),
            owner:file?.scroll?.ref===original.scroll.ref,top:file?.scroll?.top===moved.to,max_top:extentMatches},
            observed_scroll:file?.scroll?{top:file.scroll.top,max_top:file.scroll.max_top}:null});
          return result('AMBIGUOUS','DOWNLOAD_REVEAL_NOT_CONFIRMED');
        }
        const stamp={epoch:before.output.dom_epoch,interaction:file.interaction,scroll:file.scroll,box:file.bounding_box};
        quiet=file.interaction?.state==='point_observed'?(same(stamp,previous)?quiet+1:1):0;
        previous=stamp;
        if(quiet>=3)break;
      }
      if(quiet<3 || Date.now()>settleDeadline){trace.push({event:'download_reveal_unsettled',quiet,interaction:file?.interaction?.state});return result('AMBIGUOUS','DOWNLOAD_REVEAL_NOT_CONFIRMED');}
      trace.push({event:'download_reveal_confirmed',file_ref:task.file_ref,owner_ref:file.scroll.ref,
        max_top_before:moved.max_top,max_top_after:file.scroll.max_top,
        document:before.output.dom_epoch.document,interaction:'point_observed',file_tid:file.tid,
        origin:before.output.origin,loginom_build:before.output.loginom_build,workflow_ref:before.output.workflow_ref,
        active_tab_ref:before.output.active_tab_ref,package_identity:before.output.package_identity,directory:before.output.file_storage.directory});
    }
    if(task.output_binding && target(before.output)?.storage_entry?.bytes!==task.expected_bytes)
      return result(gesture?'AMBIGUOUS':'NOT_APPLIED','DOWNLOAD_OUTPUT_SIZE_CHANGED');
    // Register BEFORE the checked gesture; native download may fire before
    // the click promise settles. Only this Page's event is eligible.
    event=page.waitForEvent('download',{timeout:15000}).then(value=>value,()=>null);
    phase='requesting';gesture=true;
    completed=false;
    const action=await act(page,before.output);
    gesture=revealed || action.effect_possible===true;
    trace.push({event:'download_gesture_result',status:action.status,effect_possible:action.effect_possible===true,
      cleanup_complete:action.cleanup_complete===true,
      error_code:/^[A-Z][A-Z0-9_]{0,79}$/.test(action.error?.code??'')?action.error.code:null});
    download=await event;
    if(action.status!=='SUCCEEDED' || action.output?.gesture_applied!==true) {
      if(download) {gesture=true;await download.cancel();completed=true;}
      else if(action.effect_possible===false && action.cleanup_complete===true)completed=true;
      return result(gesture?'AMBIGUOUS':'NOT_APPLIED','DOWNLOAD_GESTURE_NOT_CONFIRMED');
    }
    gesture=true;
    if(!download)return result('AMBIGUOUS','DOWNLOAD_EVENT_MISSING');
    // Do not persist the URL (it may carry credentials); compare only origin.
    const url=download.url(),originPrefix=task.expected_origin+'/';
    if(typeof url!=='string' || !(url.startsWith(originPrefix) || url.startsWith('blob:'+originPrefix))) {
      await download.cancel();completed=true;
      return result('AMBIGUOUS','DOWNLOAD_ORIGIN_MISMATCH');
    }
    const name=download.suggestedFilename();
    if(name!==task.artifact.name) {
      await download.cancel();completed=true;
      return result('AMBIGUOUS','DOWNLOAD_FILENAME_MISMATCH');
    }
    phase='downloading';
    await download.saveAs(task.download_path);
    if(await download.failure()!==null)return result('AMBIGUOUS','DOWNLOAD_FAILED');
    completed=true;
    const after=await observe(page);
    if(after.status!=='SUCCEEDED' || !contextMatches(after.output)
      ||task.output_binding&&target(after.output)?.storage_entry?.bytes!==task.expected_bytes)return result('AMBIGUOUS','DOWNLOAD_CONTEXT_CHANGED');
    phase='downloaded';
    return result('SUCCEEDED',null,{artifact_id:task.artifact.artifact_id,...(task.output_binding?{output_binding:task.output_binding}:{upload_grant_id:task.artifact.upload.grant_id,upload_operation_id:task.upload_operation_id}),destination:destination.destination,
      suggested_name:name,download_completed:true,bytes_verification_required:true,
      file_ref:task.file_ref,observation_id:task.observation_id});
  } catch {
    // An unexpected gesture exception may have emitted a download already.
    // Drain the bounded listener and cancel any captured transfer before exit.
    if(event && !download)try{download=await event;}catch{}
    if(download && !completed)try{await download.cancel();completed=true;}catch{}
    return result(gesture || event?'AMBIGUOUS':'NOT_APPLIED','DOWNLOAD_BROWSER_CALL_FAILED');
  }
}

// Host-owned native export only; shares the exact download gesture and cleanup.
export function makeNativeOutputDownloadCode(options){
 const b=options?.output_binding,a=options?.artifact,s=options?.snapshot;
 const matches=s?.ui?.elements?.filter(e=>e.ref===options.file_ref)??[];
 if(!b||!b.execution_id||!b.node_id||!b.session_id||b.destination!==b.directory+'/'+a?.name
   ||matches.length!==1||matches[0].label!==a.name||matches[0].tid!==s.workflow_ref?.prefix+';FileStorageForm;colName_'+storageTidSuffix(a.name)
   ||!Number.isSafeInteger(options.expected_bytes)||options.expected_bytes<0||options.expected_bytes>16777216
   ||matches[0].storage_entry?.bytes!==options.expected_bytes||s.file_storage?.directory!==b.directory)throw Error('Native output download binding differs');
 requireExportDestination(b.destination,options.storage_directories);
 const shared={expected_build:options.expected_build,expected_origin:options.expected_origin};
 const observe=makeWorkspaceUiCode({mode:'observe',root_ref:options.file_ref,...shared});
 const act=makeWorkspaceUiCode({mode:'act',snapshot:s,action:{verb:'double_click',ref:options.file_ref},...shared},{snapshotArgument:true});
 return `async page=>(${browserArtifactDownload.toString()})(page,${JSON.stringify(options)},${observe},${act},${browserArtifactReveal.toString()})`;
}

// Trusted adapter only: every public reference must additionally be checked
// against createObservationPages.assertIssued before this code is constructed.
// This candidate covers CSV/TSV double-click downloads only; package files require
// an explicit download command instead of opening their scenario.
export function makeArtifactDownloadCode(options) {
  const artifact=options?.artifact,snapshot=options?.snapshot;
  const matches=snapshot?.ui?.elements?.filter(item=>item.ref===options.file_ref) ?? [];
  const suffix=artifact?.name?.replace(/\s/g,'_').replace(/,/g,'');
  if(!artifact?.upload || !/\.(?:csv|tsv)$/i.test(artifact.name) || matches.length!==1
    || matches[0].label!==artifact.name || matches[0].tid!==snapshot.workflow_ref?.prefix+';FileStorageForm;colName_'+suffix)
    throw new Error('Download requires the exact observed authorized CSV/TSV file');
  const shared={expected_build:options.expected_build,expected_origin:options.expected_origin};
  // Upload may have observed the folder tree. Verification owns the separately
  // issued exact CSV/TSV ref, so its narrow reads must follow that file, not the
  // earlier upload region. Global context/blocker guards remain in native reads.
  const observe=makeWorkspaceUiCode({mode:'observe',root_ref:options.file_ref,...shared});
  const act=makeWorkspaceUiCode({mode:'act',snapshot,action:{verb:'double_click',ref:options.file_ref},...shared},{snapshotArgument:true});
  return `async (page) => (${browserArtifactDownload.toString()})(page,${JSON.stringify(options)},${observe},${act},${browserArtifactReveal.toString()})`;
}

function browserCapability(page, task) {
  const started = Date.now();
  const deadline = task.deadline_at ?? started + task.action.timeout_ms;
  const trace = [];
  let phase = 'preconditions';
  let effectPossible = false;
  let mouseHeld = false;
  let transientEditor = null;
  let transientDialog = false;
  let restoreViewport = null;
  let workflow = task.checkpoint?.workflow_ref ?? null;
  let loginomBuild = null;
  let graphBinding=task.checkpoint?.graph_binding??null;
  const record = (event, detail = {}) => trace.push({ at_ms: Date.now() - started, event, ...detail });
  const remaining = () => Math.max(0, deadline - Date.now());
  const wait = ms => page.waitForTimeout(Math.min(ms, remaining()));
  const result = (status, output = {}, error = null) => ({ status, action_key: task.action.action_key,
    action_revision: task.action.revision, operation_id: task.operation_id, phase, effect_possible: effectPossible, output, error, trace });
  const safeMessage = error => String(error?.message ?? error ?? 'unknown failure').slice(0, 1000);
  const ensureDeadline = () => { if(task.node_target_cancellation_id && page[Symbol.for('loginom-dock.node-target-cancel')]?.has(task.node_target_cancellation_id))throw new Error('Node target cancelled');if (Date.now() >= deadline) throw new Error('Action deadline exceeded'); };
  const interact = async (operation, effect = false) => {
    ensureDeadline();
    if(task.node_target_context)await page.evaluate(({context,beforeEffect})=>{
      const p=globalThis.__loginomDockPreparationV1,r=context.request;
      const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
      const tab=exact(r.workflow_ref.tab_tid),root=exact(r.workflow_ref.prefix+';ModelForm;cmpDiagram');
      const receipt=p&&[...p.receipts.values()].find(v=>v.workflowId===r.workflow_ref.workflow_id&&v.phase==='verified');
      if(p?.document!==document||p.id!==r.document_id||!receipt||tab.length!==1||tab[0]!==receipt.tab||!tab[0].classList.contains('x-tab-active')||root.length!==1||p.nodeTargetDomEpochs?.objects.get(root[0])!==context.dom_epoch)throw new Error('Node target link context changed');
      const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;
      for(const expected of context.nodes){const matches=d.FNodes.FCollection.filter(n=>n.FGuid===expected.id);if(matches.length!==1)throw new Error('Node target link identity changed');const e=d.FmxGraph.view.getState(matches[0].FCell)?.shape?.node;
        if(e?.getAttribute('data-tid')!==r.workflow_ref.prefix+';Graph;'+expected.tid||(beforeEffect&&p.nodeTargetDomEpochs.objects.get(e)!==expected.dom_epoch))throw new Error('Node target link DOM binding changed');}
    },{context:task.node_target_context,beforeEffect:!effectPossible});
    if (effect) { effectPossible = true; phase = 'applying'; }
    return operation(Math.max(1, remaining()));
  };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const sorted = values => [...values].sort();

  const cssString = value => JSON.stringify(value).replaceAll('\u2028', '\\2028 ').replaceAll('\u2029', '\\2029 ');
  const tid = (modifier, value, suffix = '') => page.locator(`[data-tid${modifier}=${cssString(value)}]${suffix}`);
  const visible = async locator => {
    const count = await locator.count();
    const matches = [];
    for (let index = 0; index < count; index++) if (await locator.nth(index).isVisible()) matches.push(locator.nth(index));
    return matches;
  };
  const encode = (value, encoder) => {
    if (encoder === 'integer') {
      if (!Number.isInteger(value) || value < 0 || value > 999) throw new Error('Unsafe selector integer');
      return String(value);
    }
    if (typeof value !== 'string' || !value || value.length > 200 || /[;|<>"'\\\r\n]/.test(value)) {
      throw new Error('Unsafe Loginom selector parameter');
    }
    return value.replace(/\s/g, '_').replace(/,/g, '');
  };
  const activePrefix = async () => {
    const tabs = await visible(tid('^', 'MF;cntMain;cntWorkspace;Workspace;t.br;tb', '.x-tab-active'));
    if (tabs.length !== 1) throw new Error('Exactly one selected Loginom workspace tab is required');
    const tabTid = await tabs[0].getAttribute('data-tid');
    const match = /^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-(\d+))?$/.exec(tabTid ?? '');
    if (!match) throw new Error('Selected Loginom workspace tab has an unknown identity');
    const prefix = match[1] ? `MF;TF-${match[1]}` : 'MF;TF';
    if (workflow && (workflow.tab_tid !== tabTid || workflow.prefix !== prefix)) {
      throw new Error('Active workflow changed since the operation was prepared');
    }
    return prefix;
  };
  const interpolate = (definition, bindings) => definition.value.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name) => {
    if (!(name in bindings)) throw new Error(`Missing selector binding ${name}`);
    return encode(bindings[name], definition.parameters[name]);
  });
  const ownedGraph = async prefix => {
    if(await activePrefix()!==prefix)throw new Error('Graph workflow changed');
    const containerTid=prefix+';ModelForm;cmpDiagram',container=tid('',containerTid);
    if(await container.count()!==1 || !(await container.isVisible()))throw new Error('Unique visible owned graph container is required');
    const box=await container.boundingBox(),viewport=page.viewportSize();
    if(!box || box.x+box.width<=0 || box.y+box.height<=0 || viewport && (box.x>=viewport.width || box.y>=viewport.height))throw new Error('Graph container is outside the visible viewport');
    const data=await container.evaluate((element,ownerPrefix)=>{
      const started=Date.now();let work=0;
      const charge=()=>{if(++work>250000 || Date.now()-started>500)throw new Error('Graph scan budget exceeded');};
      const visible=e=>{
        for(let p=e;p;p=p.parentElement){charge();const style=getComputedStyle(p);if(style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse')return false;}
        const b=e.getBoundingClientRect();return b.width>=0 && b.height>=0 && (b.width>0 || b.height>0);
      };
      for(let p=element.parentElement;p;p=p.parentElement){charge();const owner=/^(MF;TF(?:-\d+)?)(?:;|$)/.exec(p.getAttribute?.('data-tid')??'')?.[1];if(owner && owner!==ownerPrefix)throw new Error('Graph container belongs to another workflow');}
      const all=[],walker=element.ownerDocument.createTreeWalker(element,1);let next;
      while((next=walker.nextNode())){charge();if(all.length>=6000)throw new Error('Graph scan element budget exceeded');all.push(next);}
      const graph=all.filter(e=>{charge();return /^MF;TF(?:-\d+)?;Graph;/.test(e.getAttribute('data-tid')??'') && visible(e);});
      const prefixes=[...new Set(graph.map(e=>/^(MF;TF(?:-\d+)?;Graph;)/.exec(e.getAttribute('data-tid'))[1]))];
      if(prefixes.length>1)throw new Error('Multiple native graph namespaces in the active container');
      const native=prefixes[0]??null,tids=graph.map(e=>e.getAttribute('data-tid'));
      const labels=[...new Set(tids.filter(t=>t.endsWith(';Label;Label')).map(t=>t.slice(native.length).replace(/;Label;Label$/,''))
        .filter(t=>t && t!=='Переменные_сценария'))].sort();
      const actionable=tids.filter(t=>{charge();const body=t.slice(native.length);return /^[^|]+\|Output_[^;|]+\|[^|]+\|Input_[^;|]+$/.test(body)
        || labels.some(label=>body===label || body===label+';Label;Label' || body===label+';Setting'
          || body.startsWith(label+';') && /;(?:Input|Output)_[^;]+$/.test(body));});
      if(new Set(actionable).size!==actionable.length)throw new Error('Duplicate actionable graph identifiers');
      return {native_prefix:native,nodes:labels.map(label=>({label,ports:tids.filter(t=>t.startsWith(native+label+';') && /;(?:Input|Output)_[^;]+$/.test(t)).sort()})),
        links:tids.filter(t=>{const body=t.slice(native.length);return /^[^|]+\|Output_[^;|]+\|[^|]+\|Input_[^;|]+$/.test(body);}).sort()};
    },prefix);
    const binding={container_tid:containerTid,native_prefix:data.native_prefix};
    if(graphBinding && (graphBinding.container_tid!==containerTid || graphBinding.native_prefix!==null && graphBinding.native_prefix!==binding.native_prefix))
      throw new Error('Native graph binding changed after preflight');
    graphBinding=binding;
    return {container,binding,nodes:data.nodes,links:data.links};
  };
  const graphPrefixFor=async prefix=>{const native=(await ownedGraph(prefix)).binding.native_prefix;if(!native)throw new Error('No observed native graph namespace');return native;};
  const resolve = async (symbol, bindings = {}, options = {}) => {
    ensureDeadline();
    const definition = task.selectors[symbol];
    if (!definition || !task.action.selector_symbols.includes(symbol)) throw new Error(`Selector ${symbol} is not allowed by the action`);
    let value = interpolate(definition, bindings);
    let match = definition.match,ownedContainer=null;
    if (['activeTab', 'activeWorkflow'].includes(definition.scope)) {
      const prefix = await activePrefix();
      if(value.startsWith('Graph;')) {
        const graph=options.graphCapture??await ownedGraph(prefix);if(!graph.binding.native_prefix)throw new Error('Graph selector has no observed namespace');
        value=graph.binding.native_prefix+value.slice('Graph;'.length);ownedContainer=graph.container;
      } else value = `${prefix};${value}`;
      match = 'exact';
    }
    const operator = { exact: '', prefix: '^', suffix: '$' }[match];
    const classSuffix = definition.required_class ? `.${definition.required_class}` : '';
    const all = ownedContainer?ownedContainer.locator(`[data-tid${operator}=${cssString(value)}]${classSuffix}`):tid(operator, value, classSuffix);
    let matches = [...Array(await all.count()).keys()].map(index => all.nth(index));
    if (definition.visibility !== 'any') {
      const visibility = await Promise.all(matches.map(locator => locator.isVisible()));
      matches = matches.filter((_, index) => visibility[index] === (definition.visibility === 'visible'));
    }
    const expected = options.cardinality ?? definition.cardinality;
    if ((expected === 'one' && matches.length !== 1) || (expected === 'zeroOrOne' && matches.length > 1)) {
      throw new Error(`Selector ${symbol} cardinality ${matches.length}, expected ${expected}`);
    }
    if (expected === 'many') return matches;
    if (matches.length === 0) return null;
    const locator = matches[0];
    if (definition.state.includes('enabled') && !(await locator.isEnabled())) throw new Error(`Selector ${symbol} is disabled`);
    if (options.stable !== false) {
      const first = await locator.boundingBox();
      if (!first) throw new Error(`Selector ${symbol} has no interaction geometry`);
      await wait(50);
      const second = await locator.boundingBox();
      if (!second || ['x', 'y', 'width', 'height'].some(key => Math.abs(first[key] - second[key]) > 0.75)) {
        throw new Error(`Selector ${symbol} geometry is unstable`);
      }
      const point = { x: second.x + second.width / 2, y: second.y + second.height / 2 };
      const viewport = page.viewportSize();
      if (viewport && (point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height)) {
        throw new Error(`Selector ${symbol} is outside the viewport`);
      }
    }
    return locator;
  };
  const poll = async (probe, interval = 100) => {
    for (;;) {
      ensureDeadline();
      const value = await probe();
      if (value) return value;
      await wait(interval);
    }
  };
  const waitForNoMask = async (maxWaitMs = 10000) => {
    const waitDeadline = Math.min(deadline, Date.now() + maxWaitMs);
    while (Date.now() < waitDeadline) {
      const masks = await visible(page.locator('.bg-mask-message'));
      if (!masks.length) return;
      await wait(100);
    }
    throw new Error('Loginom is masked by an in-progress operation');
  };
  const ensureReady = async () => {
    await resolve('loginom.ready_avatar', {}, { stable: false });
    loginomBuild = await page.evaluate(() => globalThis.bg?.app?.Version ?? null);
    if (task.expected_build && loginomBuild !== task.expected_build) throw new Error('Loginom build differs from the verified executor target');
    const prefix = await activePrefix();
    await waitForNoMask();
    const tab = await resolve('workspace.active_tab', {}, { stable: false });
    workflow ??= { tab_tid: await tab.getAttribute('data-tid'), prefix };
    record('preconditions_verified', { active_tab: prefix });
    return prefix;
  };
  const graphNodes=async prefix=>(await ownedGraph(prefix)).nodes.map(node=>node.label);
  const ports=async(prefix,nodeLabel)=>(await ownedGraph(prefix)).nodes.find(node=>node.label===nodeLabel)?.ports??[];
  const graphLinks=async prefix=>(await ownedGraph(prefix)).links;
  const rawGraph=async prefix=>{const graph=await ownedGraph(prefix);return {nodes:graph.nodes,links:graph.links};};
  const graphSnapshot = async prefix => {
    const captured=await rawGraph(prefix),nodes=captured.nodes.map(node=>node.label);
    const mappings = new Map();
    const canonicalPorts = [];
    for (const node of nodes) {
      const rawPorts = captured.nodes.find(item=>item.label===node).ports.map(value => value.split(';Graph;')[1].slice((node+';').length));
      const groups = new Map(), mapping = new Map();
      for (const port of rawPorts) {
        const match = /^(.*)-(\d+)$/.exec(port);
        if (!match) { mapping.set(port, port); continue; }
        const kind = match[1], list = groups.get(kind) ?? [];
        list.push({ raw: port, index: Number(match[2]) }); groups.set(kind, list);
      }
      for (const [kind, group] of groups) {
        group.sort((left, right) => left.index - right.index);
        group.forEach((port, ordinal) => mapping.set(port.raw, `${kind}[${ordinal}]`));
      }
      mappings.set(node, mapping);
      canonicalPorts.push({ node_label: node, tids: sorted([...mapping.values()].map(port => `${node};${port}`)) });
    }
    // Loginom recreates live port indices on reopen (observed 0,1,3 -> 0,1,2).
    // Preserve type/direction/count and ordinal, and remap each link endpoint
    // through the same bijection. A different ordinal still changes the graph.
    const canonicalLinks = captured.links.map(value => {
      const [source, output, target, input] = value.split(';Graph;')[1].split('|');
      const sourcePort = mappings.get(source)?.get(output), targetPort = mappings.get(target)?.get(input);
      if (!sourcePort || !targetPort) throw new Error('Graph link endpoint is absent from its node port snapshot');
      return `${source}|${sourcePort}|${target}|${targetPort}`;
    });
    return { nodes, ports: canonicalPorts, links: sorted(canonicalLinks) };
  };
  const nodeRef = nodeLabel => ({ kind: 'node', node_label: nodeLabel, workflow_ref: { ...workflow } });
  const checkNodeRef = node => {
    if (!node.workflow_ref || node.workflow_ref.tab_tid !== workflow.tab_tid || node.workflow_ref.prefix !== workflow.prefix) throw new Error('Node reference belongs to a different workflow');
  };
  const nodeDropGeometry = async () => {
    const workareaBox = await (await resolve('workflow.workarea')).boundingBox();
    if (!workareaBox) throw new Error('Workflow has no interaction geometry');
    const point = { x: workareaBox.x + task.parameters.target_position.x, y: workareaBox.y + task.parameters.target_position.y };
    const graph = await resolve('workflow.graph', {}, { stable: false });
    return graph.evaluate((element, point) => {
      // Pinned, read-only local probe. ModelForm.js:2483-2500 subtracts cntDiagram,
      // Graph.js:808-813 adds scroll and divides by scale; mouseup snaps to grid.
      // SVG rect x/y are painted in view coordinates, not pnlWorkarea coordinates.
      const app = globalThis.bg?.app;
      const card = app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab();
      const model = card?.Controller?.FController;
      if (!app?.ModelForm || !(model instanceof app.ModelForm) || !model.View?.getEl()?.dom?.contains(element)) {
        throw new Error('Pinned ModelForm geometry probe does not match the active DOM');
      }
      const diagram = model.FDiagram, mxGraph = diagram?.FmxGraph, view = mxGraph?.view;
      if (mxGraph?.container !== element || mxGraph.gridSize !== 8 || !(diagram.FInitialScale > 0) || !(view?.scale > 0)) {
        throw new Error('Pinned graph geometry profile is unavailable');
      }
      const box = model.Items.cntDiagram.getBox();
      const scale = view.scale / diagram.FInitialScale;
      const logical = { x: Math.round((point.x - box.x + element.scrollLeft) / scale),
        y: Math.round((point.y - box.y + element.scrollTop) / scale) };
      const snapped = { x: Math.round(logical.x / 8) * 8, y: Math.round(logical.y / 8) * 8 };
      if (snapped.x < 0 || snapped.y < 0) throw new Error('Requested drop lies outside the diagram');
      return { point, snapped,
        svg: { x: (snapped.x + view.translate.x) * view.scale, y: (snapped.y + view.translate.y) * view.scale },
        scale, view_scale: view.scale, origin: { x: box.x, y: box.y }, scroll: { x: element.scrollLeft, y: element.scrollTop } };
    }, point);
  };
  const verifyNodePosition = async (nodeLabel, expected) => {
    if (!expected?.svg) throw new Error('Node position has no pre-mutation geometry checkpoint');
    const created = await resolve('workflow.node', { node_label: nodeLabel });
    const rectangle = created.locator('rect').first();
    const x = await rectangle.getAttribute('x'), y = await rectangle.getAttribute('y');
    const actual = { x: Number(x), y: Number(y) };
    if (x === null || y === null || !Number.isFinite(actual.x) || !Number.isFinite(actual.y)) {
      throw new Error('Created node has no verified SVG rectangle coordinates');
    }
    // mxGraph rounds SVG drawing coordinates to pixels. No extra grid-cell
    // tolerance is accepted: the grid calculation was performed before mutation.
    if (Math.abs(actual.x - expected.svg.x) > 0.75 || Math.abs(actual.y - expected.svg.y) > 0.75) {
      throw new Error(`Created node position differs from the expected SVG grid position (${actual.x}, ${actual.y}; expected ${expected.svg.x}, ${expected.svg.y})`);
    }
    return { actual_svg: actual, expected_svg: expected.svg, logical: expected.snapped };
  };
  const drag = async (source, targetPoint, { sourcePoint, steps = 20 } = {}) => {
    const box = await source.boundingBox();
    if (!box) throw new Error('Drag source lost its geometry');
    const start = sourcePoint ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await interact(() => page.mouse.move(start.x, start.y));
    // mouse.down itself can be applied before the transport reports an error.
    mouseHeld = true;
    try {
      await interact(() => page.mouse.down(), true);
      await interact(() => page.mouse.move(targetPoint.x, targetPoint.y, { steps }), true);
    } finally {
      await page.mouse.up();
      mouseHeld = false;
      record('mouse_released');
    }
  };
  const nodeCheckpoint = async () => {
    const prefix = await ensureReady();
    await resolve(`component.${task.parameters.component_key}`);
    const box = await (await resolve('workflow.workarea')).boundingBox();
    const position = task.parameters.target_position;
    if (!box || position.x < 8 || position.y < 8 || position.x > box.width - 8 || position.y > box.height - 8) {
      throw new Error('Target position is outside the workflow');
    }
    const before = await graphNodes(prefix);
    if (task.parameters.expected_label && before.includes(encode(task.parameters.expected_label, 'loginom_tid'))) {
      throw new Error('Expected node label already exists before this operation');
    }
    return { workflow_ref: { ...workflow }, nodes: before, graph: await rawGraph(prefix), geometry: await nodeDropGeometry(),graph_binding:{...graphBinding} };
  };
  const reconcileNode = async before => {
    const prefix = await ensureReady();
    // Loginom hides the label while its inline editor is open. An empty
    // label snapshot then cannot prove that the node was never created.
    const graph = await resolve('workflow.graph', {}, { stable: false });
    if ((await visible(graph.locator('textarea'))).length) {
      return result('AMBIGUOUS', { reason: 'node rename editor is still open' });
    }
    const after = await graphNodes(prefix);
    const added = after.filter(value => !before.nodes.includes(value));
    const removed = before.nodes.filter(value => !after.includes(value));
    if (!added.length && !removed.length) {
      if (before.graph && !same(await rawGraph(prefix), before.graph)) return result('AMBIGUOUS', {
        reason: 'unrelated graph changed', added_labels: [], removed_labels: [] });
      return result('NOT_APPLIED');
    }
    if (added.length !== 1 || removed.length) return result('AMBIGUOUS', { added_labels: added, removed_labels: removed });
    const label = added[0];
    let autoCreatedLinks = [];
    if (before.graph) {
      const current = await rawGraph(prefix);
      current.nodes = current.nodes.filter(node => node.label !== label);
      if (!same(current, before.graph)) {
        const addedLinks = current.links.filter(link => !before.graph.links.includes(link));
        const ownedLinks = addedLinks.filter(link => {
          const parts = link.split(';Graph;')[1].split('|');
          return parts.length === 4 && (parts[0] === label || parts[2] === label);
        });
        const withoutOwnedLinks = { ...current, links: current.links.filter(link => !ownedLinks.includes(link)) };
        if (!same(withoutOwnedLinks, before.graph)) return result('AMBIGUOUS', {
          added_label: label, added_links: addedLinks, repairable_links: [], reason: 'unrelated graph changed' });
        // Loginom can connect nearby nodes on drop. These fully observed incident
        // links are a normal effect of adding a node, not an uncertain operation.
        // The agent must still decide whether they satisfy the scenario goal.
        autoCreatedLinks = ownedLinks;
      }
    }
    if (task.parameters.expected_label && encode(task.parameters.expected_label, 'loginom_tid') !== label) {
      return result('AMBIGUOUS', { added_label: label, auto_created_links: autoCreatedLinks,
        repairable_links: autoCreatedLinks, reason: 'requested rename is not confirmed' });
    }
    const position = await verifyNodePosition(label, before.geometry);
    const reportsAutoLinks = !!task.action.output_schema.properties?.auto_created_links
      && !!task.action.output_schema.properties?.goal_verified;
    if (autoCreatedLinks.length && !reportsAutoLinks) return result('AMBIGUOUS', {
      added_label: label, added_links: autoCreatedLinks, repairable_links: autoCreatedLinks,
      reason: 'This legacy catalog cannot report automatic links; inspect their suitability before completing the node operation' });
    phase = 'verified';
    record('postcondition_verified', { added_count: 1, node_label: label, position, auto_created_links: autoCreatedLinks });
    return result('SUCCEEDED', { node_ref: nodeRef(label), ...(reportsAutoLinks
      ? { auto_created_links: autoCreatedLinks, goal_verified: false } : {}) });
  };
  const runNodeAdd = async () => {
    const before = await nodeCheckpoint();
    if (task.checkpoint && !same(before, task.checkpoint)) throw new Error('Workflow changed after node preflight');
    const prefix = workflow.prefix;
    const component = await resolve(`component.${task.parameters.component_key}`);
    record('node_snapshot_before', { count: before.nodes.length, geometry: before.geometry });
    await drag(component, before.geometry.point);
    record('component_dragged', { component_key: task.parameters.component_key });
    let after;
    try { after = await poll(async () => {
      const snapshot = await graphNodes(prefix);
      return !same(snapshot, before.nodes) ? snapshot : null;
    }); } catch { after = await graphNodes(prefix); }
    const added = after.filter(value => !before.nodes.includes(value));
    const removed = before.nodes.filter(value => !after.includes(value));
    if (!added.length && !removed.length) return reconcileNode(before);
    if (added.length !== 1 || removed.length) return result('AMBIGUOUS', { added_labels: added, removed_labels: removed });
    let label = added[0];
    if (task.parameters.expected_label) {
      const expectedLabel = encode(task.parameters.expected_label, 'loginom_tid');
      if (expectedLabel !== label) {
        const existing = await resolve('workflow.node', { node_label: expectedLabel }, { cardinality: 'zeroOrOne', stable: false });
        if (existing) return result('AMBIGUOUS', { added_label: label, reason: 'expected label already exists' });
        await interact(timeout => resolve('workflow.node_label', { node_label: label }, { stable: false }).then(item => item.dblclick({ timeout })), true);
        const graph = await resolve('workflow.graph', {}, { stable: false });
        const editors = await visible(graph.locator('textarea'));
        if (editors.length !== 1) return result('AMBIGUOUS', { added_label: label, reason: 'rename editor cardinality' });
        transientEditor = editors[0];
        await interact(timeout => transientEditor.click({ timeout }));
        await interact(timeout => transientEditor.press('ControlOrMeta+A', { timeout }));
        await interact(() => page.keyboard.type(task.parameters.expected_label, { delay: 20 }), true);
        await interact(timeout => transientEditor.press('Enter', { timeout }), true);
        await poll(() => resolve('workflow.node', { node_label: expectedLabel }, { cardinality: 'zeroOrOne', stable: false }));
        transientEditor = null;
        label = expectedLabel;
      }
      record('node_renamed', { node_label: label });
    }
    return reconcileNode(before);
  };
  const portSymbol = (direction, port) => `workflow.port.${direction}.${port.kind}`;
  const portBindings = (node, port) => ({ node_label: node.node_label, port_index: port.index ?? 0 });
  const linkCheckpoint = async () => {
    const prefix = await ensureReady();
    const { source_node: sourceNode, target_node: targetNode, source_port: sourcePort, target_port: targetPort } = task.parameters;
    checkNodeRef(sourceNode); checkNodeRef(targetNode);
    const source = await resolve(portSymbol('output', sourcePort), portBindings(sourceNode, sourcePort));
    const target = await resolve(portSymbol('input', targetPort), portBindings(targetNode, targetPort));
    return { workflow_ref: { ...workflow },
      source_tid: await source.getAttribute('data-tid'), target_tid: await target.getAttribute('data-tid'),
      links: await graphLinks(prefix), ports: await ports(prefix, targetNode.node_label), graph: await rawGraph(prefix),graph_binding:{...graphBinding} };
  };
  const reconcileLink = async (before, context = null) => {
    const prefix = await ensureReady();
    const { source_node: sourceNode, target_node: targetNode, target_port: targetPort } = task.parameters;
    checkNodeRef(sourceNode); checkNodeRef(targetNode);
    const currentLinks = await graphLinks(prefix);
    const currentPorts = await ports(prefix, targetNode.node_label);
    const addedLinks = currentLinks.filter(value => !before.links.includes(value));
    const removedLinks = before.links.filter(value => !currentLinks.includes(value));
    const addedPorts = currentPorts.filter(value => !before.ports.includes(value));
    const removedPorts = before.ports.filter(value => !currentPorts.includes(value));
    const sourceInfo = before.source_tid.split(';').at(-1);
    const targetInfo = before.target_tid.split(';').at(-1);
    const linkPrefix = `${await graphPrefixFor(prefix)}${sourceNode.node_label}|${sourceInfo}|${targetNode.node_label}|`;
    if (before.graph) {
      const current = await rawGraph(prefix);
      current.links = current.links.filter(link => !addedLinks.includes(link) || !link.startsWith(linkPrefix));
      current.nodes = current.nodes.map(node => node.label === targetNode.node_label
        ? { ...node, ports: node.ports.filter(port => !addedPorts.includes(port)) } : node);
      if (!same(current, before.graph)) return result('AMBIGUOUS', { reason: 'unrelated graph changed', added_links: addedLinks, added_ports: addedPorts });
    }
    if (context) record('link_observation', { ...context,
      baseline: { ports: before.ports, links: before.links },
      current: { ports: currentPorts, links: currentLinks },
      delta: { added_ports: addedPorts, removed_ports: removedPorts, added_links: addedLinks, removed_links: removedLinks } });
    if (removedLinks.length || removedPorts.length) return result('AMBIGUOUS', { removed_links: removedLinks, removed_ports: removedPorts });
    if (targetPort.kind === 'add') {
      const targetTid = addedPorts[0];
      const exact = targetTid && linkPrefix + targetTid.split(';').at(-1);
      if (addedPorts.length === 1 && addedLinks.length === 1 && addedLinks[0] === exact) {
        phase = 'verified';
        record('postcondition_verified', { add_port_created: true, exact_link: true });
        return result('SUCCEEDED', { link_ref: { kind: 'link', tid: exact }, target_port_tid: targetTid });
      }
    } else {
      const exact = linkPrefix + targetInfo;
      if (currentLinks.includes(exact) && !addedPorts.length && addedLinks.every(link => link === exact)) {
        phase = 'verified';
        record('postcondition_verified', { exact_link: true, reconciled: before.links.includes(exact) });
        return result('SUCCEEDED', { link_ref: { kind: 'link', tid: exact }, reconciled: before.links.includes(exact) });
      }
    }
    if (addedLinks.length || addedPorts.length) return result('AMBIGUOUS', { added_links: addedLinks, added_ports: addedPorts });
    return result('NOT_APPLIED');
  };
  const runLinkCreate = async () => {
    const before = await linkCheckpoint();
    if (task.checkpoint && !same(before, task.checkpoint)) throw new Error('Workflow changed after link preflight');
    const initial = await reconcileLink(before, { stage: 'initial', attempt: 0 });
    if (initial.status !== 'NOT_APPLIED') return initial;
    const graph = await resolve('workflow.graph', {}, { stable: false });
    const viewportState = await graph.evaluate(element => ({ scrollLeft: element.scrollLeft, scrollTop: element.scrollTop }));
    restoreViewport = () => graph.evaluate((element, state) => { element.scrollLeft = state.scrollLeft; element.scrollTop = state.scrollTop; }, viewportState);
    const { source_node: sourceNode, target_node: targetNode, source_port: sourcePort, target_port: targetPort } = task.parameters;
    for (let attempt = 0; attempt <= task.action.retry_budget; attempt++) {
      // Any partial port/link mutation stops retries, even a single unlinked port.
      const prior = await reconcileLink(before, { stage: 'before_drag', attempt: attempt + 1 });
      if (prior.status !== 'NOT_APPLIED') return prior;
      const freshSource = await resolve(portSymbol('output', sourcePort), portBindings(sourceNode, sourcePort));
      const freshTarget = await resolve(portSymbol('input', targetPort), portBindings(targetNode, targetPort));
      const sourceBox = await freshSource.boundingBox(), targetBox = await freshTarget.boundingBox();
      if (!sourceBox || !targetBox) throw new Error('Port geometry disappeared');
      const corrections = [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 1 }, { x: 1, y: 1 }];
      const correction = corrections[attempt % corrections.length];
      const sourcePoint = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
      const targetPoint = { x: targetBox.x + targetBox.width / 2 + correction.x, y: targetBox.y + targetBox.height / 2 + correction.y };
      record('port_drag_attempt', { attempt: attempt + 1, correction, source_point: sourcePoint, target_point: targetPoint });
      await drag(freshSource, targetPoint, { sourcePoint, steps: 10 + attempt * 4 });
      await wait(150);
      await waitForNoMask();
      const observed = await reconcileLink(before, { stage: 'after_drag', attempt: attempt + 1 });
      if (observed.status !== 'NOT_APPLIED') return observed;
      // Require another settled observation before permitting a new attempt.
      await wait(150);
      await waitForNoMask();
      const settled = await reconcileLink(before, { stage: 'settled_after_drag', attempt: attempt + 1 });
      if (settled.status !== 'NOT_APPLIED') return settled;
    }
    return reconcileLink(before, { stage: 'retry_exhausted', attempt: task.action.retry_budget + 1 });
  };
  const recoverLink = async () => {
    const before = task.checkpoint;
    if (!before?.graph || task.parameters.target_port.kind !== 'add') throw new Error('Recovery requires an Input_Add graph checkpoint');
    const observed = await reconcileLink(before, { stage: 'before_recovery', attempt: 1 });
    if (observed.status !== 'AMBIGUOUS' || observed.output.reason || observed.output.added_links?.length !== 0
        || observed.output.added_ports?.length !== 1) return observed;
    const targetTid = observed.output.added_ports[0];
    if (!targetTid.startsWith((await graphPrefixFor(before.workflow_ref.prefix)) + task.parameters.target_node.node_label + ';Input_Data-')) {
      throw new Error('The observed partial port is not an input data port of the requested target');
    }
    const owner=(await ownedGraph(before.workflow_ref.prefix)).container;
    const source = owner.locator(`[data-tid=${cssString(before.source_tid)}]`), target = owner.locator(`[data-tid=${cssString(targetTid)}]`);
    if (await source.count() !== 1 || await target.count() !== 1) throw new Error('Recovery ports are no longer unique');
    const box = await target.boundingBox();
    if (!box) throw new Error('Recovery target has no geometry');
    record('partial_link_recovery', { target_port_tid: targetTid, creates_port: false });
    const graph = await resolve('workflow.graph', {}, { stable: false });
    const viewport = await graph.evaluate(element => ({ scrollLeft: element.scrollLeft, scrollTop: element.scrollTop }));
    restoreViewport = () => graph.evaluate((element, state) => { element.scrollLeft = state.scrollLeft; element.scrollTop = state.scrollTop; }, viewport);
    await drag(source, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await wait(200); await waitForNoMask();
    return reconcileLink(before, { stage: 'after_recovery', attempt: 1 });
  };
  const normalizedPackagePath = () => {
    if(task.action.effect.destination_policy==='session_storage'){
      if(!task.storage_binding || task.parameters.path!==task.storage_destination)throw Error('Session package destination is not bound');
      return task.storage_destination;
    }
    let value = task.parameters.path.trim().replaceAll('\\', '/').replace(/\/+/g, '/');
    if (!value.startsWith('/')) value = '/' + value;
    if (!value.toLowerCase().endsWith('.lgp')) value += '.lgp';
    if (value.includes('/../') || value.endsWith('/..') || value.includes('/./') || /[\0\r\n]/.test(value)) throw new Error('Unsafe package path');
    const roots = task.action.effect.allowed_roots;
    if (!Array.isArray(roots) || !roots.some(root => value === root || value.startsWith(root + '/'))) throw new Error('Package path is outside the allowed Loginom storage root');
    return value;
  };
  const packageIdentity = async () => page.evaluate(() => {
    // Pinned read-only probe of cached navigation records. PackageFileName is a
    // local getter (MapTree.js:2151-2154), not a server proxy or RPC operation.
    const app = globalThis.bg?.app;
    let node = app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.Node?.data?.node;
    const seen = new Set();
    for (let depth = 0; node && depth < 32 && !seen.has(node); depth++) {
      seen.add(node);
      if (app.PackageTreeNode && node instanceof app.PackageTreeNode) {
        const path = node.PackageFileName;
        return { path: typeof path === 'string' ? path : null, name: node.PackageName ?? null };
      }
      node = node.ParentNode;
    }
    throw new Error('Active workflow has no verified cached package identity');
  });
  const normalizeStoredPath = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    value = value.replaceAll('\\', '/').replace(/\/+/g, '/');
    return value.startsWith('/') ? value : '/' + value;
  };
  const packageContinuations = async binding => page.evaluate(binding => {
    const preparation=globalThis.__loginomDockPreparationV1, app=globalThis.bg?.app;
    if(!preparation || preparation.document!==document)return [];
    const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    const tabs=exact(binding.tab_tid);
    if(tabs.length!==1 || !tabs[0].classList.contains('x-tab-active'))throw Error('Saved continuation tab changed');
    const card=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab();
    let node=card?.Controller?.Node?.data?.node,packageNode,workflowNode;
    const seen=new Set();for(let i=0;node&&i<32&&!seen.has(node);i++,node=node.ParentNode){seen.add(node);
      if(app.WorkFlowTreeNode&&node instanceof app.WorkFlowTreeNode)workflowNode=node;
      if(app.PackageTreeNode&&node instanceof app.PackageTreeNode){packageNode=node;break;}}
    const graph=exact(binding.prefix+';ModelForm;cmpDiagram');
    if(!(card?.Controller?.FController instanceof app.ModelForm)||graph.length!==1
        ||card.Controller.FController.FDiagram?.FmxGraph?.container!==graph[0])throw Error('Saved continuation graph changed');
    const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(binding.prefix+';cnrNaviMode;b.s_')+']')]
      .map(e=>({tid:e.getAttribute('data-tid'),label:e.textContent.trim()}));
    if(crumbs.length<3||crumbs.length>32)throw Error('Saved continuation navigation unavailable');
    const result=new Map();
    for(const record of preparation.receipts.values()) {
      if(record.phase!=='verified'||record.tab!==tabs[0]||!record.nodeTargetWorkflowNode)continue;
      if(record.packageNode!==packageNode||record.nodeTargetWorkflowNode!==workflowNode)throw Error('Saved continuation native identity changed');
      result.set(record.workflowId,{document_id:preparation.id,workflow_ref:{...binding,workflow_id:record.workflowId,navigation_path:crumbs}});
      if(result.size>32)throw Error('Saved continuation bound exceeded');
    }
    return [...result.values()];
  },binding);
  const refreshSavedNavigation = async current => {
    const crumbs=current.workflow_ref.navigation_path, binding=current.workflow_ref;
    const parent=crumbs.at(-2),last=crumbs.at(-1);
    if(!last.tid.startsWith(parent.tid+'>'))throw Error('Saved workflow parent is not addressable');
    const suffix=last.tid.slice(parent.tid.length);
    const control=page.locator('[data-tid='+cssString(parent.tid)+']');
    if(await control.count()!==1||!await control.isVisible()||(await control.innerText()).trim()!==parent.label)
      throw Error('Saved workflow parent changed');
    await interact(timeout=>control.click({timeout}));
    record('saved_navigation_parent_entered',{parent_tid:parent.tid,workflow_id:binding.workflow_id});
    const updated=await poll(async()=>{
      const rows=await page.evaluate(prefix=>[...document.querySelectorAll('[data-tid^='+JSON.stringify(prefix+';cnrNaviMode;b.s_')+']')]
        .map(e=>({tid:e.getAttribute('data-tid'),label:e.textContent.trim()})),binding.prefix);
      return rows.length===crumbs.length-1&&rows.every((r,i)=>r.label===crumbs[i].label)?rows:null;
    });
    const path=updated.at(-1).tid.split(';cnrNaviMode;b.s_')[1];
    if(!path)throw Error('Saved workflow parent path unavailable');
    const treeTid=binding.prefix+';ListViewForm;MapTreeForm;colNavigation_'+path+suffix+';TreeText';
    const tree=await poll(async()=>{
      const item=page.locator('[data-tid='+cssString(treeTid)+']');
      return await item.count()===1&&await item.isVisible()?item:null;
    });
    if((await tree.innerText()).trim()!==last.label)throw Error('Saved workflow entry differs');
    await interact(timeout=>tree.dblclick({timeout}));
    await poll(async()=>{
      const graph=page.locator('[data-tid='+cssString(binding.prefix+';ModelForm;cmpDiagram')+']');
      return await graph.count()===1&&await graph.isVisible();
    });
    record('saved_navigation_workflow_returned',{workflow_id:binding.workflow_id,tree_tid:treeTid});
  };
  const packageCheckpoint = async () => {
    const prefix = await ensureReady();
    const tab = await resolve('workspace.active_tab', {}, { stable: false });
    return { workflow_ref: { ...workflow }, path: normalizedPackagePath(),
      identity: (await tab.innerText()).trim(), package_identity: await packageIdentity(), graph: await graphSnapshot(prefix) };
  };
  const verifyReopenedPackage = async before => {
    const prefix = await ensureReady();
    const activeTab = await resolve('workspace.active_tab', {}, { stable: false });
    const identity = (await activeTab.innerText()).trim();
    const reopenedIdentity = await packageIdentity();
    const normalizedPath = normalizeStoredPath(reopenedIdentity.path);
    const signature = await graphSnapshot(prefix);
    const pathMatches = normalizedPath === before.path, graphMatches = same(signature, before.graph);
    record('reopened_package_observed', { requested_path: before.path, actual_path: normalizedPath,
      tab_caption: identity, path_matches: pathMatches, graph_matches: graphMatches, graph: signature });
    if (!pathMatches || !graphMatches) {
      return result('AMBIGUOUS', { path: before.path, actual_path: normalizedPath, tab_caption: identity,
        path_matches: pathMatches, graph_matches: graphMatches, expected_graph: before.graph, actual_graph: signature,
        reason: 'reopened package path or graph differs' });
    }
    phase = 'verified';
    record('postcondition_verified', { reopened: true, package_path: normalizedPath, tab_caption: identity, graph: signature });
    return result('SUCCEEDED', { package_ref: { kind: 'package', path: normalizedPath, active_identity: normalizedPath }, reopened: true });
  };
  const writeFileName = async (field, value) => {
    const input = field.locator('input');
    await interact(timeout => input.click({ timeout }));
    await interact(timeout => input.press('ControlOrMeta+A', { timeout }));
    await interact(() => page.keyboard.type(value, { delay: 10 }));
    await interact(timeout => input.press('Tab', { timeout }));
    if (await input.inputValue() !== value) throw new Error('Loginom file name editor did not commit the requested path');
  };
  const runPackageSaveAs = async ({ keepOpen = false } = {}) => {
    const before = await packageCheckpoint();
    if (task.checkpoint && !same(before, task.checkpoint)) throw new Error('Package changed after save preflight');
    const continuationsBefore = keepOpen ? await packageContinuations(before.workflow_ref) : [];
    const click = async (symbol, effect = false) => interact(timeout => resolve(symbol).then(item => item.click({ timeout })), effect);
    transientDialog = true;
    await click('packages.menu');
    await click('packages.save_as');
    const input = await poll(() => resolve('file_dialog.file_name', {}, { cardinality: 'zeroOrOne', stable: false }));
    await writeFileName(input, before.path);
    await click('file_dialog.confirm', true);
    record('save_requested', { path: before.path });
    const expectedConflict = '"' + before.path + '" уже существует. Вы хотите заменить его?';
    const saved = await poll(async () => {
      const message = await resolve('message.text', {}, { cardinality: 'zeroOrOne', stable: false });
      if (message) {
        const text = (await message.innerText()).trim();
        if (text !== expectedConflict) throw new Error('Save confirmation does not match the exact destination');
        record('save_conflict_observed', { path: before.path, message: text });
        return 'conflict';
      }
      const errorMessage = await resolve('message.error', {}, { cardinality: 'zeroOrOne', stable: false });
      if (errorMessage) throw new Error((await errorMessage.innerText()).slice(0, 500));
      const dialog = await resolve('file_dialog.file_name', {}, { cardinality: 'zeroOrOne', stable: false });
      const masks = await visible(page.locator('.bg-mask-message'));
      return !dialog && !masks.length ? 'saved' : null;
    });
    if (saved === 'conflict') {
      const message = await resolve('message.text', {}, { stable: false });
      if ((await message.innerText()).trim() !== expectedConflict) throw new Error('Save confirmation changed before answer');
      const yes = await resolve('message.yes', {}, { stable: false });
      const noButton = await resolve('message.no', {}, { stable: false });
      if ((await yes.innerText()).trim() !== 'Да' || (await noButton.innerText()).trim() !== 'Нет')
        throw new Error('Save confirmation answer labels differ');
      if (task.parameters.conflict_policy === 'replace') {
        await click('message.yes', true);
        record('overwrite_confirmed');
      } else {
        const no = await resolve('message.no', {}, { cardinality: 'zeroOrOne', stable: false });
        if (!no) return result('AMBIGUOUS', { path: before.path, reason: 'overwrite cancellation is unavailable' });
        await interact(timeout => no.click({ timeout }));
        record('conflict_rejected');
        return result('NOT_APPLIED', { path: before.path, conflict: true });
      }
    }
    await waitForNoMask(60000);
    await poll(async () => !(await resolve('file_dialog.file_name', {}, { cardinality: 'zeroOrOne', stable: false })));
    const errorMessage = await resolve('message.error', {}, { cardinality: 'zeroOrOne', stable: false });
    if (errorMessage) throw new Error((await errorMessage.innerText()).slice(0, 500));
    // Both save modes await the native Save As completion before a menu click.
    // Its handler awaits DoSavePackage before hiding the menu; clicking earlier
    // can toggle that still-visible menu closed instead of opening Close.
    await poll(async () => !(await resolve('packages.save_as', {}, { cardinality: 'zeroOrOne', stable: false })));
    const saveError = await resolve('message.error', {}, { cardinality: 'zeroOrOne', stable: false });
    if (saveError) throw new Error((await saveError.innerText()).slice(0, 500));
    record('save_flow_completed', { path: before.path });
    if (keepOpen) {
      const prefix = await ensureReady();
      const actualPath = normalizeStoredPath((await packageIdentity()).path);
      const graph = await graphSnapshot(prefix);
      const workflowMatches = same(workflow, before.workflow_ref);
      const pathMatches = actualPath === before.path, graphMatches = same(graph, before.graph);
      record('open_saved_package_observed', { requested_path: before.path, actual_path: actualPath,
        workflow_ref: workflow, workflow_matches: workflowMatches, path_matches: pathMatches,
        graph_matches: graphMatches, graph });
      if (!workflowMatches || !pathMatches || !graphMatches)
        return result('AMBIGUOUS', { reason: 'Saved destination, workflow or graph changed' });
      let continuationsAfter = await packageContinuations(before.workflow_ref);
      if(continuationsBefore.length && continuationsAfter.length
          && !same(continuationsBefore[0].workflow_ref.navigation_path,continuationsAfter[0].workflow_ref.navigation_path)) {
        await refreshSavedNavigation(continuationsAfter[0]);
        await ensureReady();
        if(!same(await graphSnapshot(workflow.prefix),before.graph))throw Error('Saved graph changed while refreshing navigation');
        continuationsAfter=await packageContinuations(before.workflow_ref);
      }
      const identity = value => ({document_id:value.document_id,workflow_id:value.workflow_ref.workflow_id,
        tab_tid:value.workflow_ref.tab_tid,prefix:value.workflow_ref.prefix});
      if(!same(continuationsBefore.map(identity),continuationsAfter.map(identity)))throw new Error('Saved continuation identities changed');
      const continuations=continuationsAfter.map((value,i)=>({...value,previous_workflow_ref:continuationsBefore[i].workflow_ref}));
      record('save_continuations_observed', { continuations });
      transientDialog = false; phase = 'verified';
      record('postcondition_verified', { proof: 'awaited_save_flow_same_open_workflow', package_path: actualPath,
        workflow_ref: workflow, graph, reopened: false, persisted_content_verified: false });
      return result('SUCCEEDED', { package_ref: { kind: 'package', path: actualPath, active_identity: actualPath },
        reopened: false, workflow_preserved: true, save_completed: true, persisted_content_verified: false, workflow_continuations: continuations });
    }
    transientDialog = false;
    await click('packages.menu');
    await poll(() => resolve('packages.close', {}, { cardinality: 'zeroOrOne', stable: false }));
    record('package_close_command_ready');
    await click('packages.close', true);
    // Closing and reopening necessarily changes the selected tab identity.
    const closedTabTid = workflow.tab_tid;
    workflow = null;graphBinding=null;
    await poll(async () => {
      const unsaved = await resolve('message.text', {}, { cardinality: 'zeroOrOne', stable: false });
      if (unsaved && (await unsaved.innerText()).toLocaleLowerCase('ru').includes('сохранить изменения')) {
        transientDialog = true;
        throw new Error('Package remained dirty after save');
      }
      return await tid('', closedTabTid).count() === 0;
    });
    record('saved_package_closed');
    const previousTab=await resolve('workspace.active_tab', {}, {cardinality:'zeroOrOne',stable:false});
    const previousTabTid=previousTab?await previousTab.getAttribute('data-tid'):null;
    // Closing the package can remove its tab before the old Packages menu
    // finishes hiding. Wait for that transition before one new menu click.
    await poll(async () => !(await resolve('packages.open', {}, { cardinality: 'zeroOrOne', stable: false })));
    transientDialog = true;
    await click('packages.menu');
    await poll(() => resolve('packages.open', {}, { cardinality: 'zeroOrOne', stable: false }));
    record('package_open_command_ready');
    await click('packages.open');
    const openInput = await poll(() => resolve('file_dialog.file_name', {}, { cardinality: 'zeroOrOne', stable: false }));
    await writeFileName(openInput, before.path);
    await click('file_dialog.confirm', true);
    await poll(async () => {
      const errorMessage = await resolve('message.error', {}, { cardinality: 'zeroOrOne', stable: false });
      if (errorMessage) throw new Error((await errorMessage.innerText()).slice(0, 500));
      try {
        const graph=await resolve('workflow.graph', {}, { cardinality: 'zeroOrOne', stable: false });
        if(!graph)return null;
        // An older open package may remain visible while the requested file is
        // loading. Do not pin that intermediate workspace as the reopened one.
        const selectedTab=await resolve('workspace.active_tab', {}, {cardinality:'zeroOrOne',stable:false});
        if(previousTabTid&&selectedTab&&await selectedTab.getAttribute('data-tid')===previousTabTid){workflow=null;graphBinding=null;return null;}
        return graph;
      }
      catch (error) {
        if (/selected Loginom workspace tab|unknown identity/.test(error.message)) return null;
        throw error;
      }
    });
    await waitForNoMask(60000);
    transientDialog = false;
    return verifyReopenedPackage(before);
  };
  const observe = async () => {
    const prefix = await ensureReady();
    const captured=await ownedGraph(prefix),labels=captured.nodes.map(node=>node.label);
    const nodes = [];
    for (const label of labels) {
      const locator = await resolve('workflow.node', { node_label: label }, { stable: false,graphCapture:captured });
      const nodePorts = [];
      for (const portTid of captured.nodes.find(node=>node.label===label).ports) {
        const owner=captured.container;
        const locator = owner.locator(`[data-tid=${cssString(portTid)}]`);
        if (await locator.count() !== 1) throw new Error('Observed port has ambiguous identity');
        nodePorts.push({ tid: portTid, bounding_box: await locator.boundingBox() });
      }
      nodes.push({ node_ref: nodeRef(label), bounding_box: await locator.boundingBox(), ports: nodePorts });
    }
    const tab = await resolve('workspace.active_tab', {}, { stable: false });
    const workarea = await (await resolve('workflow.workarea', {}, { stable: false })).boundingBox();
    const observedPackage = await packageIdentity();
    return result('SUCCEEDED', { authenticated: true, loginom_build: loginomBuild, workflow_ref: { ...workflow },
      active_identity: (await tab.innerText()).trim(), package_identity: { path: normalizeStoredPath(observedPackage.path), name: observedPackage.name },
      nodes, links: captured.links, workarea });
  };
  return (async () => {
    record('action_started', { capability: task.action.capability, mode: task.mode ?? 'apply' });
    const handlers = {
      nodeAdd: { prepare: nodeCheckpoint, apply: runNodeAdd, reconcile: () => reconcileNode(task.checkpoint) },
      linkCreate: { prepare: linkCheckpoint, apply: runLinkCreate, reconcile: () => reconcileLink(task.checkpoint), recover_link: recoverLink },
      packageSaveCheckpoint: { prepare: packageCheckpoint, apply: () => runPackageSaveAs({ keepOpen: true }),
        reconcile: () => result('AMBIGUOUS', {}, { code: 'SAVE_RECEIPT_MISSING', message: 'An open package does not prove completion of an unknown save' }) },
      packageSaveAs: { prepare: packageCheckpoint, apply: runPackageSaveAs,
        reconcile: () => result('AMBIGUOUS', {}, { code: 'SAVE_RECEIPT_MISSING', message: 'A lost save response cannot prove close/reopen from a read-only DOM snapshot' }) },
    };
    let outcome;
    try {
      const handler = handlers[task.handler];
      if (!handler) throw new Error('Unknown local capability handler');
      if (task.mode === 'observe') outcome = await observe();
      else if (task.mode === 'prepare') {
        const checkpoint = await handler.prepare();
        phase = 'prepared';
        outcome = { ...result('NOT_APPLIED'), checkpoint };
      } else if (task.mode === 'reconcile') {
        phase = 'reconciling';
        outcome = await handler.reconcile();
      } else if (task.mode === 'recover_link') {
        if (!handler.recover_link) throw new Error('Recovery is unavailable for this handler');
        outcome = await handler.recover_link();
      } else if (!task.mode || task.mode === 'apply') outcome = await handler.apply();
      else throw new Error('Unknown capability execution mode');
    } catch (error) {
      record('action_failed', { phase, effect_possible: effectPossible });
      outcome = result(effectPossible || task.mode === 'reconcile' ? 'AMBIGUOUS' : 'FAILED', {}, { code: 'CAPABILITY_ERROR', message: safeMessage(error) });
    } finally {
      const cleanup = async (name, operation) => {
        try { await operation(); record('cleanup_completed', { resource: name }); }
        catch (error) {
          record('cleanup_failed', { resource: name });
          outcome = result('AMBIGUOUS', {}, { code: 'CLEANUP_FAILED', message: safeMessage(error) });
        }
      };
      if (mouseHeld) await cleanup('mouse', () => page.mouse.up());
      if (transientEditor) await cleanup('rename_editor', async () => {
        if (await transientEditor.isVisible()) await transientEditor.press('Escape', { timeout: 3000 });
      });
      if (transientDialog) await cleanup('transient_dialog', async () => {
        await page.keyboard.press('Escape');
        if (['packageSaveAs', 'packageSaveCheckpoint'].includes(task.handler)) {
          await poll(async () => !(await resolve('file_dialog.file_name', {}, { cardinality: 'zeroOrOne', stable: false }))
            && !(await resolve('message.text', {}, { cardinality: 'zeroOrOne', stable: false }))
            && !(await resolve('packages.save_as', {}, { cardinality: 'zeroOrOne', stable: false })));
        }
      });
      if (restoreViewport) await cleanup('viewport', restoreViewport);
    }
    outcome.cleanup_complete = !trace.some(entry => entry.event === 'cleanup_failed');
    return outcome;
  })();
}

export function makeCapabilityCode(action, selectors, parameters, options = {}) {
  if(action.effect?.destination_policy==='session_storage'){
    const binding=options.storage_binding;
    if(!binding || !binding.document_id || !binding.loginom_account)throw Error('Session storage is not prepared');
    options={...options,storage_destination:requireStorageDestination(parameters.path,binding.directories,'packages')};
  }
  const handler = requireCapability(action).handler;
  const allowedSelectors = Object.fromEntries(action.selector_symbols.map(symbol => [symbol, selectors.get(symbol)]));
  const task = { action: structuredClone(action), selectors: structuredClone(allowedSelectors), parameters: structuredClone(parameters), ...structuredClone(options), handler };
  const body = `(${browserCapability.toString()})(page, ${JSON.stringify(task)})`;
  return ['apply', 'recover_link'].includes(task.mode) && task.receipt_namespace
    ? withBrowserReceipt(body, task) : `async (page) => ${body}`;
}

// The receipt lives on the Playwright Page in the local browser server, outside
// the web application's JS world. Losing an MCP response does not lose proof
// that this exact operation finished its finally/cleanup block.
function browserReceipt(page, task, perform) {
  const symbol = Symbol.for('loginom-dock.operation-receipts.v1');
  const ledger = page[symbol] ??= new Map();
  const key = task.receipt_namespace + '/' + (task.receipt_id ?? task.operation_id);
  const previous = ledger.get(key);
  const envelope = (state, output = {}) => ({ status: 'SUCCEEDED', action_key: 'operation.inspect', action_revision: '1',
    operation_id: task.operation_id, phase: 'observed', effect_possible: false, output: { state, ...output }, error: null, trace: [] });
  if (task.receipt_read) {
    if (!previous) return envelope('missing');
    if (previous.signature !== task.receipt_signature) return envelope('identity_mismatch');
    return envelope(previous.state, previous.outcome ? { receipt: previous.outcome } : {});
  }
  if (previous) {
    if (previous.signature !== task.receipt_signature) throw new Error('Browser operation receipt identity mismatch');
    if (previous.state === 'completed') return previous.outcome;
    throw new Error('Browser operation already started; inspect its receipt before retrying');
  }
  for (const [oldKey, value] of ledger) {
    if (ledger.size < 128) break;
    if (value.state === 'completed' && oldKey !== key) ledger.delete(oldKey);
  }
  if (ledger.size >= 128) throw new Error('Browser receipt capacity reached');
  const entry = { state: 'running', signature: task.receipt_signature };
  ledger.set(key, entry);
  return (async () => {
    try { const outcome = await perform(); entry.outcome = outcome; entry.state = 'completed'; return outcome; }
    catch (error) { entry.state = 'unknown'; throw error; }
  })();
}
export function withBrowserReceipt(body, options) {
  return `async (page) => (${browserReceipt.toString()})(page, ${JSON.stringify(options)}, () => ${body})`;
}

export function parseCapabilityResult(response) {
  if (response?.isError) throw new Error('Pinned browser capability call failed');
  for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    const match = block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/);
    const source = match?.[1] ?? block.text;
    try { return assertActionOutcome(JSON.parse(source)); } catch {}
  }
  throw new Error('Pinned browser capability returned no typed result');
}

export function createActionRuntime({ pinned, execute, artifactStore, allowCandidate = false, onRecord = async () => {}, now = Date.now, targetBuild = pinned?.compatibility?.loginom_build, targetOrigin, getNodeContractPins = () => pinned.pins, nodeTargetAdapterFactory = createNodeTargetBrowserAdapter,
  nodeApplyHandlers = new Map(), nodeApplyDriverFactory, getStorageBinding = () => null }) {
  if (!pinned?.actions || !pinned?.selectors) throw new Error('A verified pinned action catalog is required');
  let pending = null;
  let running = false;
  const operations = new Map();
  const auxiliary = new Map();
  const observations = createObservationPages();
  const receiptNamespace = randomUUID();
  const checkId = id => { if (typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(id)) throw new Error('A stable operation identifier is required'); };
  const fingerprint = (actionKey, parameters) => {
    const canonical = value => value && typeof value === 'object'
      ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    return createHash('sha256').update(JSON.stringify([actionKey, canonical(parameters)])).digest('hex');
  };
  const find = actionKey => {
    if (typeof actionKey !== 'string' || !actionKey.trim()) throw new Error('action_key is required');
    const action = pinned.actions.get(actionKey);
    if (!action) throw new Error(`Action ${actionKey} is not present in the pinned catalog`);
    requireCapability(action);
    const accepted = pinned.acceptanceVerified === true && pinned.pins?.catalogLifecycleStatus === 'production';
    if (action.status !== 'production' && !(action.status === 'candidate' && (allowCandidate || accepted))) {
      throw new Error(`Action ${actionKey} is not executable in this session (${action.status})`);
    }
    return action;
  };
  const failed = (operation, code, message, status = 'AMBIGUOUS') => ({ status,
    action_key: operation.action.action_key, action_revision: operation.action.revision,
    operation_id: operation.id, phase: 'unverified', effect_possible: status === 'AMBIGUOUS', output: {}, error: { code, message }, trace: [] });
  const receiptOptions = (operation, id, key, signature) => {
    operation.lastReceipt = { id, signature, action_key: key, operation_id: id };
    return { receipt_namespace: receiptNamespace, receipt_id: id, receipt_signature: signature };
  };
  const invoke = async (operation, mode, { receiptId, stopSignal, ...options } = {}) => {
    if (operation.action.capability === 'node.configure_text_import.v1') {
      const result = (status, phase, output, error = null) => ({ status, phase, output, error,
        action_key: operation.action.action_key, action_revision: operation.action.revision,
        operation_id: operation.id, effect_possible: operation.nodeEffectPossible === true || operation.transportUncertain === true,
        cleanup_complete: operation.cleanupConfirmed === true, trace: [] });
      if (mode === 'prepare') {
        validateTextImportRequest(operation.parameters.settings);
        const transfer = operations.get(operation.parameters.source_transfer_operation_id);
        const proof = transfer?.outcome?.output?.server_copy_verification;
        if (transfer?.action.capability !== 'artifact.upload' || transfer.outcome?.status !== 'SUCCEEDED'
          || proof?.upload_completion_verified !== true || proof.destination !== operation.parameters.settings.source.source_path) {
          throw new Error('Text import requires the completed verified upload for its exact source path');
        }
        const raw = await execute(makeWorkspaceUiCode({ mode: 'observe', operation_id: operation.id,
          expected_origin: targetOrigin, expected_build: targetBuild }), { ...options, timeout: 35000 });
        const state = raw.output, node = operation.parameters.node_ref, owner = state?.wizard?.owner_context;
        if (raw.status !== 'SUCCEEDED' || JSON.stringify(state.workflow_ref) !== JSON.stringify(node.workflow_ref)
          || !state.dom_epoch?.document || state.wizard?.stage !== 'text_import_file' || owner?.status !== 'observed'
          || owner.node?.tid !== owner.path?.at(-3)?.tid + '>' + node.node_label) {
          throw new Error('Open the exact target text-import wizard at its source page before configuring it');
        }
        return { ...result('NOT_APPLIED', 'prepared', {}), checkpoint: { workflow_ref: state.workflow_ref,
          document_id: state.dom_epoch.document, owner: structuredClone(owner),
          source_transfer_operation_id: transfer.id, original_source: structuredClone(state.wizard.import_source) } };
      }
      if (mode === 'reconcile') {
        // A completed child receipt is never proof of the whole configuration.
        // Inspection cannot restart a partial wizard or click Done again.
        return { ...structuredClone(operation.outcome), cleanup_complete: operation.cleanupConfirmed === true,
          output: { ...structuredClone(operation.outcome?.output), partial_configuration: true, automatic_resume_available: false } };
      }
      if (mode !== 'apply') throw new Error('Unsupported text import procedure mode');
      operation.cleanupConfirmed = true;
      const channel = createNodeProcedure({ operation, execute, record: onRecord, targetOrigin, targetBuild, now, signal: stopSignal,
        wrapMutation: (code, reference) => {
          const receipt = receiptOptions(operation, reference.id, reference.action_key, reference.signature);
          return withBrowserReceipt('(' + code + ')(page)', { ...receipt, operation_id: reference.id });
        } });
      try {
        const configured = await configureTextImportDraft(channel, operation.parameters.settings, operation.checkpoint.owner);
        const outcome = result('SUCCEEDED', 'settings_verified', {
          node_ref: { ...operation.parameters.node_ref, node_label: configured.node_label },
          settings_readback_verified: true, package_saved: false, execution_started: false, internal_steps: channel.steps });
        outcome.trace.push({ event: 'postcondition_verified', proof: 'text_import_settings_roundtrip', internal_steps: channel.steps });
        validateActionParameters(operation.action.output_schema, outcome.output, 'output');
        return outcome;
      } catch (error) {
        return result(operation.nodeEffectPossible || operation.transportUncertain ? 'AMBIGUOUS' : 'NOT_APPLIED',
          'procedure_stopped', { internal_steps: channel.steps, settings_readback_verified: false,
            partial_configuration: operation.nodeEffectPossible === true, automatic_resume_available: false },
          { code: 'NODE_PROCEDURE_STOPPED', message: String(error?.message ?? error).slice(0, 1000) });
      }
    }
    const mutation = ['apply', 'recover_link'].includes(mode);
    const receipt = mutation ? receiptOptions(operation, receiptId ?? operation.id, operation.action.action_key,
      fingerprint(mode, [operation.action.action_key, operation.parameters, operation.checkpoint])) : {};
    // Recovery receipts retain the original action identity; their storage ID is
    // distinct so repeating recovery never performs another physical gesture.
    if (mutation) operation.lastReceipt.operation_id = operation.id;
    const outcome = await execute(makeCapabilityCode(operation.action, pinned.selectors, operation.parameters, {
      operation_id: operation.id, mode, checkpoint: operation.checkpoint, expected_build: targetBuild,
      ...(operation.action.effect?.destination_policy==='session_storage'?{storage_binding:getStorageBinding()}:{}),
      ...receipt, ...(mutation ? { deadline_at: mode === 'apply' ? operation.deadline : now() + operation.action.timeout_ms } : {}),
    }), { timeout: operation.action.timeout_ms + 5000, ...options });
    assertActionOutcome(outcome);
    if (outcome.action_key !== operation.action.action_key || outcome.action_revision !== operation.action.revision) {
      throw new Error('Dock capability outcome identity does not match the pinned action');
    }
    if (outcome.operation_id !== operation.id) throw new Error('Dock capability operation identity does not match');
    if (mode !== 'prepare' && outcome.status === 'SUCCEEDED') validateActionParameters(operation.action.output_schema, outcome.output, 'output');
    return outcome;
  };
  const remember = async (operation, phase, outcome) => {
    await onRecord({ operation_id: operation.id, action_key: operation.action.action_key, action_revision: operation.action.revision,
      phase, parameters: structuredClone(operation.parameters), checkpoint: structuredClone(operation.checkpoint ?? null),
      deadline_at: operation.deadline ?? null, ...(outcome ? { outcome: structuredClone(outcome) } : {}) });
  };
  const readReceipt = async (operation,reference=operation.lastReceipt) => {
    if (!reference) return { state: 'missing' };
    const code = `async (page) => (${browserReceipt.toString()})(page, ${JSON.stringify({ receipt_namespace: receiptNamespace,
      receipt_id: reference.id, receipt_signature: reference.signature, receipt_read: true, operation_id: operation.id })})`;
    const value = await execute(code, { timeout: 10000 });
    assertActionOutcome(value);
    const state = value.output;
    if (state?.state === 'completed') {
      const receipt = assertActionOutcome(state.receipt);
      if (receipt.operation_id !== reference.operation_id || receipt.action_key !== reference.action_key) throw new Error('Recovered browser receipt has a different identity');
      if (receipt.action_key === operation.action.action_key && receipt.status === 'SUCCEEDED' && operation.action.output_schema) {
        validateActionParameters(operation.action.output_schema, receipt.output, 'output');
      }
    }
    return state;
  };
  const finishArtifactVerification=async (operation,attempt,raw) => {
    assertActionOutcome(raw);
    if(raw.action_key!=='artifact.download' || raw.action_revision!=='1' || raw.operation_id!==attempt.id)
      throw new Error('Downloaded artifact receipt identity mismatch');
    attempt.raw=structuredClone(raw);
    if(!attempt.rawRecorded) {
      await remember(attempt,'download_completed',raw);attempt.rawRecorded=true;
    }
    const artifact=operation.checkpoint.artifact;
    let outcome=attempt.byteOutcome ?? {...structuredClone(raw),action_key:'artifact.verify'};
    if(!attempt.byteOutcome && raw.status==='SUCCEEDED') {
      const expected={artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,
        upload_operation_id:operation.id,destination:artifact.upload.destination,suggested_name:artifact.name,
        download_completed:true,bytes_verification_required:true,file_ref:attempt.checkpoint.discovery?verifiedDiscoveryReference(artifact,attempt.checkpoint.discovery,raw):attempt.parameters.file_ref,
        observation_id:attempt.parameters.observation_id};
      if(fingerprint('download.output',raw.output)!==fingerprint('download.output',expected) || raw.cleanup_complete!==true
        || raw.phase!=='downloaded' || raw.effect_possible!==true || raw.error!==null)
        throw new Error('Downloaded artifact metadata differs from the original upload');
      try {
        await attempt.lease.verify(raw.output.suggested_name);
        outcome={...outcome,phase:'verified',output:{...expected,bytes_verification_required:false,bytes_verified:true,
          bytes:artifact.bytes,sha256:artifact.sha256,upload_completion_verified:false}};
      } catch {
        outcome={...outcome,status:'FAILED',phase:'verification_failed',output:{upload_operation_id:operation.id,
          destination:artifact.upload.destination,bytes_verified:false,upload_completion_verified:false},
          error:{code:'DOWNLOADED_ARTIFACT_MISMATCH',message:'Downloaded bytes do not match the admitted artifact'}};
      }
    }
    attempt.byteOutcome=structuredClone(outcome);
    if(!attempt.byteRecorded) {await remember(attempt,'download_verified',outcome);attempt.byteRecorded=true;}
    if(outcome.output.bytes_verified===true && operation.outcome.output.upload_submitted===true
      && operation.outcome.cleanup_complete===true && raw.cleanup_complete===true) {
      // The transfer contract's postcondition is exact destination bytes/size/
      // digest, not a visible filename or a network-idle heuristic. Both native
      // calls have completed; retain the proof across cleanup/journal failures.
      try {
        await attempt.lease.release();await operation.uploadLease.release();
      } catch {
        attempt.outcome={...structuredClone(outcome),status:'AMBIGUOUS',phase:'cleanup',cleanup_complete:false,
          error:{code:'TRANSFER_CLEANUP_FAILED',message:'Transfer proof is retained; temporary file cleanup is unconfirmed'}};
        operation.cleanupConfirmed=false;
        return attempt.outcome;
      }
      const summary={verification_id:attempt.id,status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,
        destination:artifact.upload.destination,bytes:artifact.bytes,sha256:artifact.sha256};
      const completedUpload={...structuredClone(operation.outcome),status:'SUCCEEDED',phase:'verified',error:null,
        cleanup_complete:true,output:{...structuredClone(operation.outcome.output),verification_required:false,
          transfer_postcondition:'destination_bytes_digest_and_size',server_copy_verification:summary}};
      const completedVerification={...structuredClone(outcome),output:{...outcome.output,upload_completion_verified:true}};
      if(!attempt.transferRecorded) {await remember(operation,'transfer_completed',completedUpload);attempt.transferRecorded=true;}
      await remember(attempt,'verification_completed',completedVerification);
      operation.outcome=completedUpload;operation.transportUncertain=false;operation.cleanupConfirmed=true;
      attempt.outcome=completedVerification;attempt.settled=true;
      auxiliary.set(attempt.id,{signature:attempt.signature,outcome:structuredClone(completedVerification)});
      if(pending===operation)pending=null;
      return completedVerification;
    }
    attempt.outcome=outcome;attempt.settled=true;
    auxiliary.set(attempt.id,{signature:attempt.signature,outcome:structuredClone(outcome)});
    operation.transportUncertain=false;operation.cleanupConfirmed=raw.cleanup_complete===true;
    operation.outcome.output.server_copy_verification={verification_id:attempt.id,status:outcome.status,
      bytes_verified:outcome.output.bytes_verified===true,upload_completion_verified:false,
      ...(outcome.output.bytes_verified ? {destination:artifact.upload.destination,bytes:artifact.bytes,sha256:artifact.sha256} : {})};
    if(raw.status==='NOT_APPLIED' && raw.cleanup_complete===true)await attempt.lease.release();
    return outcome;
  };
  const nodeTargetOutcome=(operation,result)=>({status:result.status,action_key:operation.action.action_key,action_revision:'1',operation_id:operation.id,
    phase:result.phase,effect_possible:operation.targetPhase?.effect_possible===true,cleanup_complete:result.cleanup_complete===true,
    output:result,error:result.error?{code:'NODE_TARGET_INCOMPLETE',message:result.error}:null,trace:[]});
  const nodeTargetRecord=event=>onRecord({...event,action_key:'node.target.internal',action_revision:'1'});
  const targetAdapter=operation=>nodeTargetAdapterFactory({execute:async(code,options)=>{
    const wrapped='async page => {const base={action_key:"node.target.transport",action_revision:"1",operation_id:'+JSON.stringify(operation.id)+',phase:"observed",effect_possible:false,trace:[]};try{return {...base,status:"SUCCEEDED",error:null,output:{value:await ('+code+')(page)}};}catch(error){return {...base,status:"FAILED",output:{},error:{code:"NODE_TARGET_TRANSPORT",message:String(error.message).slice(0,500)}};}}';
    const response=await execute(wrapped,options);if(response.status!=='SUCCEEDED')throw new Error(response.error?.message??'Node target transport failed');return response.output.value;
  },pinned,origin:targetOrigin,build:targetBuild});
  const nodeApplyOutcome=(operation,result)=>({status:result.status,action_key:'node.apply',
    action_revision:operation.action.revision,operation_id:operation.id,
    phase:result.status==='SUCCEEDED'?'node_ready':result.pending_phase??'node_incomplete',
    effect_possible:result.effect_possible,cleanup_complete:result.cleanup_complete,
    output:structuredClone(result),error:result.error??null,trace:[]});
  const inspectApply=async operation=>{
    // An inspection never calls configuration, execution or generic action
    // reconciliation. Unknown phases keep the gate until a phase-specific
    // verifier is available. A durable node checkpoint is safe to redeliver.
    if(running)return failed(operation,'OPERATION_STILL_PENDING','The local node operation is still running');
    if(operation.nodeApply?.pending?.phase==='configure'&&operation.nodeApply.request.target.type==='transform.date_time'
      &&typeof operation.nodeApplyDrivers?.inspectConfigure==='function'){
      running=true;
      try{await operation.nodeApplyDrivers.inspectConfigure(operation.nodeApply);}
      finally{running=false;}
      // A verified flag is not a completed configure phase. Retain the original
      // pending boundary; explicit resume performs the remaining configuration.
    }
    if(operation.nodeApply?.pending?.phase==='input_mapping'&&operation.nodeApplyDrivers?.inspectInputMapping){
      running=true;
      try{operation.inputMappingRecovery=await operation.nodeApplyDrivers.inspectInputMapping({readReceipt:ref=>readReceipt(operation,ref)});}
      catch(error){operation.inputMappingRecovery={available:false,phase:'input_mapping',reason:String(error.message).slice(0,1000)};}
      finally{running=false;}
    }
    if(operation.nodeApply?.pending?.phase==='workflow'){
      running=true;
      try{
        if(await reconcileNodeWorkflow({operation,adapter:operation.nodeTargetAdapter,record:onRecord,now})){
          const state=operation.nodeApply;
          operation.outcome=nodeApplyOutcome(operation,{...operation.outcome.output,
            phases:state.phases.map(({value,...p})=>p),pending_phase:null,
            effect_possible:state.effect_possible,cleanup_complete:true,
            error:{code:'NODE_PHASE_RECOVERED',message:'Original workflow receipt verified; explicit resume required'}});
          operation.cleanupConfirmed=true;
          // The enclosing node is incomplete: retain its gate and original ID.
          await remember(operation,'reconciled',operation.outcome);
        }
      }finally{running=false;}
    }
    if(operation.nodeApply?.pending?.phase==='target' && operation.targetPhase){
      running=true;
      try{
        const state=operation.nodeApply;
        const {graph}=validateNodeApplyRequest(state.request,nodeApplyHandlers);
        const result=await inspectNodeTarget({request:graph,operation,adapter:operation.nodeTargetAdapter,
          record:nodeTargetRecord,deadline:now()+15000});
        if(result.cleanup_complete===true && !operation.targetPhase.pending
          && (result.resume_available===true || result.status==='SUCCEEDED')){
          // Only child effects have been reconciled. The node remains pending
          // under its original ID; inspection must not finish the graph phase
          // or open/configure a wizard. Resume rechecks this exact checkpoint.
          const event={operation_id:operation.id,action_key:'node.apply',action_revision:state.request.contract_revision,
            phase:'node_target_reconciled',signature:state.signature,result:structuredClone(result)};
          const ack=await onRecord(event);
          if(!ack || fingerprint('ack',Object.fromEntries(Object.keys(event).map(k=>[k,ack[k]])))!==fingerprint('ack',event))
            throw Error('Node target recovery journal acknowledgement differs');
          state.pending=null;state.cleanup_complete=true;state.target_reconciled=true;
          operation.outcome=nodeApplyOutcome(operation,{...operation.outcome.output,pending_phase:null,cleanup_complete:true,
            error:{code:'NODE_PHASE_RECOVERED',message:'Original graph effects and cleanup verified; explicit resume required'}});
          operation.cleanupConfirmed=true;
          await remember(operation,'reconciled',operation.outcome);
        }
      }finally{running=false;}
    }
    if(operation.nodeApply?.result){
      const outcome=nodeApplyOutcome(operation,operation.nodeApply.result);
      await remember(operation,'completed',outcome);
      operation.outcome=outcome;operation.cleanupConfirmed=true;
      if(pending===operation)pending=null;
      return outcome;
    }
    return structuredClone(operation.outcome??failed(operation,'NODE_PHASE_UNRESOLVED','The original node phase requires its own verified receipt'));
  };
  const inspectTarget=async operation=>{
    if(running)return failed(operation,'OPERATION_STILL_PENDING','The node graph phase is still running');
    const result=await inspectNodeTarget({request:operation.parameters,operation,adapter:operation.nodeTargetAdapter,record:nodeTargetRecord,deadline:now()+15000});
    const outcome=nodeTargetOutcome(operation,result);await remember(operation,'reconciled',outcome);
    operation.outcome=outcome;operation.cleanupConfirmed=outcome.cleanup_complete;
    if(result.status==='SUCCEEDED')pending=null;
    return outcome;
  };
  const reconcilePending = async () => {
    const operation = pending;
    if(operation.action.capability==='node.apply')return inspectApply(operation);
    if(operation.action.capability==='node.target.internal'){try{return await inspectTarget(operation);}catch(error){return failed(operation,'RECONCILIATION_FAILED',String(error.message));}}
    if (running && operation.action.capability === 'node.configure_text_import.v1') {
      return failed(operation, 'OPERATION_STILL_PENDING', 'The bounded node procedure is still running');
    }
    try {
      const verification=operation.verification;
      if(operation.action.capability==='artifact.upload' && verification && !verification.settled) {
        if(running)return failed(operation,'OPERATION_STILL_PENDING','The verification request is still running');
        const state=verification.raw ? {state:'completed',receipt:verification.raw} : await readReceipt(operation);
        if(state.state!=='completed')return failed(operation,'OPERATION_STILL_PENDING','The download receipt has not confirmed browser completion');
        await finishArtifactVerification(operation,verification,state.receipt);
      }
      if (operation.transportUncertain) {
        const state = await readReceipt(operation);
        if (state?.state !== 'completed') return failed(operation, 'OPERATION_STILL_PENDING',
          `Browser receipt is ${state?.state ?? 'unavailable'}; only observation is available until actual completion is established`);
        operation.transportUncertain = false;
        operation.cleanupConfirmed = state.receipt.cleanup_complete === true;
        await remember(operation, 'receipt_recovered', state.receipt);
        if (auxiliary.has(operation.lastReceipt.id)) {
          const cached = auxiliary.get(operation.lastReceipt.id);
          cached.outcome = { ...structuredClone(state.receipt), ...(cached.outcome.recovery_operation_id
            ? { recovery_operation_id: cached.outcome.recovery_operation_id } : {}) };
        }
        if (state.receipt.action_key === operation.action.action_key) operation.outcome = state.receipt;
        if (operation.cleanupConfirmed && operation.outcome.status !== 'AMBIGUOUS') {
          if(operation.action.capability==='artifact.upload' && (operation.outcome.status==='NOT_APPLIED'||operation.outcome.status==='FAILED'&&operation.outcome.output?.conflict_rejected===true))await operation.uploadLease?.release();
          pending = null; return operation.outcome;
        }
      }
      if(operation.cleanupConfirmed===false && operation.verification?.byteOutcome?.output?.bytes_verified===true)
        return failed(operation,'TRANSFER_FINALIZATION_PENDING','Verified bytes are retained; transfer cleanup has not completed');
      if (operation.cleanupConfirmed === false) return failed(operation, 'CLEANUP_RECEIPT_MISSING',
        'The browser call finished but cleanup is unconfirmed. Inspect and restore_control before further mutations.');
      if (['ui.act','artifact.upload'].includes(operation.action.capability)) {
        await remember(operation, 'reconciled', operation.outcome);
        if(operation.action.capability==='artifact.upload' && (operation.outcome?.status==='NOT_APPLIED'||operation.outcome?.status==='FAILED'&&operation.outcome.output?.conflict_rejected===true))await operation.uploadLease?.release();
        if (operation.outcome.status !== 'AMBIGUOUS') pending = null;
        return operation.outcome;
      }
      const outcome = await invoke(operation, 'reconcile');
      await remember(operation, 'reconciled', outcome);
      operation.outcome = outcome;
      if (outcome.status === 'SUCCEEDED' || outcome.status === 'NOT_APPLIED') {
        pending = null;
        operation.outcome = outcome;
      }
      return outcome;
    } catch (error) { return failed(operation, 'RECONCILIATION_FAILED', String(error?.message ?? error).slice(0, 1000)); }
  };
  const recoveryAdvice = operation => {
    const base = [{ tool: 'dock_workspace_observe', arguments: {}, required_fields: [],
      requires: [], provides: ['observation_id', 'fresh_ui_refs'] }];
    if (!operation || pending !== operation) return { recovery_options: [], next_steps: base };
    base.unshift({ tool: 'dock_operation_inspect', arguments: { operation_id: operation.id },
      required_fields: [], requires: [], provides: ['completion_receipt', 'cleanup_state'] });
    if(operation.action.capability==='node.apply'&&operation.nodeApply?.pending?.phase==='input_mapping'&&operation.inputMappingRecovery){
      const recovery=operation.inputMappingRecovery;
      if(recovery.available)base.push({tool:'dock_node_resume',arguments:structuredClone(operation.parameters),required_fields:[],
        requires:['original_completed_input_done','same_prepared_graph','live_mapping_probe'],provides:['verified_input_mapping','continuation_of_original_operation']});
      return {recovery_options:[],next_steps:base,input_mapping_recovery:structuredClone(recovery),internal_resume_available:false};
    }
    if (operation.transportUncertain) return { recovery_options: [], next_steps: base };
    if(operation.action.capability==='node.apply')return {recovery_options:[],next_steps:base,
      internal_resume_available:operation.cleanupConfirmed===true&&!operation.nodeApply?.pending};
    if(operation.action.capability==='node.target.internal')return {recovery_options:[],next_steps:base,internal_resume_available:operation.cleanupConfirmed===true&&!operation.targetPhase?.pending};
    if(operation.action.capability==='artifact.upload') {
      if(operation.cleanupConfirmed && (!operation.verification || operation.verification.settled))base.push({
        tool:'dock_artifact_verify',arguments:{operation_id:operation.id},required_fields:['verification_id','observation_id','file_ref'],
        requires:['fresh_observed_authorized_csv_ref','confirmed_browser_completion'],provides:['server_copy_byte_verification']});
      return {recovery_options:[],next_steps:base};
    }
    const strategies = operation.cleanupConfirmed === false ? ['restore_control']
      : ['abandon_operation', ...(operation.action.capability === 'ui.act' ? ['accept_observed_state'] : []),
        ...(operation.action.capability === 'link.create.v1' && operation.parameters.target_port.kind === 'add'
          && !operation.outcome?.output?.reason && operation.outcome?.output?.added_ports?.length === 1
          && operation.outcome?.output?.added_links?.length === 0 ? ['complete_link'] : [])];
    for (const strategy of strategies) {
      const observed = ['abandon_operation', 'accept_observed_state'].includes(strategy);
      base.push({ tool: 'dock_operation_recover', arguments: { operation_id: operation.id, strategy },
        required_fields: ['recovery_operation_id', ...(observed ? ['observation_id'] : [])],
        id_roles: { operation_id: 'original_pending_operation', recovery_operation_id: 'new_unique_request' },
        requires: ['confirmed_browser_completion', ...(strategy === 'restore_control' ? [] : ['confirmed_cleanup']),
          ...(observed ? ['fresh_observation_id'] : [])], provides: ['recovery_receipt'] });
    }
    if (operation.cleanupConfirmed === true) base.push({ tool: 'dock_ui_action',
      arguments: { recovery_operation_id: operation.id }, required_fields: ['operation_id', 'observation_id', 'action'],
      id_roles: { operation_id: 'new_unique_request', recovery_operation_id: 'original_pending_operation' },
      requires: ['fresh_observation_id', 'observed_owned_ui_ref', 'confirmed_browser_completion', 'confirmed_cleanup'],
      provides: ['gesture_receipt', 'reconciliation'] });
    return { recovery_options: strategies, next_steps: base };
  };
  const view = (operation, outcome) => ({ status: 'SUCCEEDED', action_key: 'operation.inspect', action_revision: '1',
    operation_id: operation?.id, phase: 'observed', effect_possible: false, error: null, trace: [], output: {
      operation_id: operation?.id ?? null, state: !operation ? 'idle' : pending === operation ? 'pending' : 'resolved',
      outcome: outcome ?? operation?.outcome ?? null, cleanup_confirmed: operation ? operation.cleanupConfirmed === true : true,
      effect_state: !operation ? 'none' : operation.transportUncertain ? 'unknown' : pending === operation ? 'partial_or_unverified'
        : operation.outcome?.resolution ? 'observed_unverified' : 'verified',
      ...recoveryAdvice(operation),
    } });
  const retainObservation = outcome => {
    try { return observations.retain(outcome); }
    catch {
      // Delivery failure after a gesture must not become a pre-action rejection.
      // The immutable browser receipt remains in the journal/operation record.
      return { ...outcome, output: { observation_required: true, verification_required: true,
        ...(outcome.output?.gesture_applied === undefined ? {} : { gesture_applied: outcome.output.gesture_applied }),
        observation_error: 'Observation could not fit a page; request a narrower workspace scope and inspect the operation.' } };
    }
  };
  const inspect = async ({ operationId, signal } = {}) => {
    signal?.throwIfAborted();
    const operation = operationId ? operations.get(operationId) : pending;
    if (operationId && !operation) throw new Error('Operation is not known in this session');
    if (!operation || pending !== operation) return view(operation);
    return view(operation, await reconcilePending());
  };
  const nodeJobs=createNodeOperationRunner({run:(request,options)=>runtime.runNodeApply(request,options),
    validate:request=>{const h=validateNodeApplyRequest(request,nodeApplyHandlers).handler;return h.output_wizard==='separate'?JSON.stringify({revision:h.revision,output_wizard:'separate'}):h.revision;},
    progress:id=>{
      const state=operations.get(id)?.nodeApply;
      return state?structuredClone({node:state.node,execution:state.execution,
        accepted_phases:state.phases.map(p=>p.phase),pending_phase:state.pending?.phase??null,
        effect_possible:state.effect_possible,cleanup_complete:state.cleanup_complete}):null;
    }});
  const runtime=Object.freeze({
    startNodeApply:(request,options)=>nodeJobs.start(request,options),
    nodeApplyStatus:id=>nodeJobs.status(id),
    waitNodeApply:(id,options)=>nodeJobs.wait(id,options),
    cancelNodeApply:id=>nodeJobs.cancel(id),
    stopNodeApply:id=>nodeJobs.stop(id),
    tools: [...executorTools,...(allowCandidate && artifactStore ? [artifactUploadTool,artifactVerifyTool,...deliveryApiTools] : []),
      ...(allowCandidate&&nodeApplyHandlers.has('imports.text')&&nodeApplyDriverFactory?nodeApiTools:[])],
    assertPreparationAllowed() {
      if (running || pending) throw new Error('Dock preparation cannot run while an action is running or its effect remains uncertain');
    },
    describe(actionKey) {
      if (actionKey && typeof actionKey === 'object') {
        const query = actionKey;
        if (Object.keys(query).some(k => !['action_key', 'action_keys', 'node_types'].includes(k))
          || query.action_key !== undefined && (query.action_keys !== undefined || query.node_types !== undefined)) throw new Error('Choose a single action or a batch description');
        if (query.action_key !== undefined) return this.describe(query.action_key);
        if (query.action_keys === undefined && query.node_types === undefined) return this.describe();
        if (query.action_keys !== undefined && (!Array.isArray(query.action_keys) || !query.action_keys.length
          || query.action_keys.length > 16 || new Set(query.action_keys).size !== query.action_keys.length)) throw new Error('Select distinct action keys');
        return { actions: (query.action_keys ?? []).map(key => structuredClone(find(key))),
          node_types: query.node_types === undefined ? [] : describeNodeTypes(query.node_types, getNodeContractPins(), pinned.actions,
            allowCandidate&&nodeApplyDriverFactory?nodeApplyHandlers:new Map()),
          session_manifest: structuredClone(pinned.pins) };
      }
      if (actionKey === undefined) return { available_actions: [...pinned.actions.keys()],
        available_node_types: allowCandidate && nodeApplyDriverFactory ? [...nodeApplyHandlers.keys()] : [],
        candidate_operation_tools:runtime.tools.filter(t=>nodeApiTools.includes(t)||deliveryApiTools.includes(t)).map(t=>t.name),
        ...(allowCandidate && artifactStore ? {artifact_upload_tool:'dock_artifact_upload',artifact_verify_tool:'dock_artifact_verify',input_artifacts:artifactStore.list()} : {}),
        ui_action_tool: 'dock_ui_action', observation_tool: 'dock_workspace_observe', session_manifest: structuredClone(pinned.pins) };
      const action = find(actionKey);
      return { action: structuredClone(action), session_manifest: structuredClone(pinned.pins) };
    },
    requestFailure(error) {
      return { status: pending ? 'AMBIGUOUS' : 'FAILED', action_key: pending?.action.action_key ?? 'request.validate',
        action_revision: pending?.action.revision ?? '1', operation_id: pending?.id ?? null,
        phase: 'request_rejected', effect_possible: !!pending, request_rejected: true,
        output: { available_actions: [...pinned.actions.keys()], ui_action_tool: 'dock_ui_action', operation: view(pending).output,
          ...(error?.code==='ARTIFACT_GRANT_NOT_FOUND' && allowCandidate && artifactStore ? {input_artifacts:artifactStore.list()} : {}) },
        error: { code: 'REQUEST_REJECTED', message: String(error?.message ?? error).slice(0, 1000) }, trace: [] };
    },
    inspect,
    async recover(operationId, { strategy, recoveryOperationId, observationId, signal } = {}) {
      signal?.throwIfAborted(); checkId(operationId); checkId(recoveryOperationId);
      const signature = fingerprint('recover', [operationId, strategy, observationId ?? null]);
      if (auxiliary.has(recoveryOperationId)) {
        const previous = auxiliary.get(recoveryOperationId);
        if (previous.signature !== signature) throw new Error('Recovery operation ID was already used with different parameters');
        return structuredClone(previous.outcome);
      }
      if (operations.has(recoveryOperationId)) throw new Error('Recovery ID conflicts with an existing operation');
      const operation = operations.get(operationId);
      if (!operation || pending !== operation) throw new Error('Recovery requires the pending operation of this session');
      if(['node.target.internal','node.apply'].includes(operation.action.capability))throw new Error('Use the enclosing node procedure to resume this internal phase');
      if(operation.action.capability==='artifact.upload')throw new Error('Upload requires server transfer verification before recovery or abandonment');
      if (!['complete_link', 'restore_control', 'accept_observed_state', 'abandon_operation'].includes(strategy)) throw new Error('Unsupported recovery strategy');
      if (strategy === 'complete_link' && operation.action.capability !== 'link.create.v1') throw new Error('complete_link requires a pending link.create operation');
      if (strategy === 'accept_observed_state' && operation.action.capability !== 'ui.act') throw new Error('Only a generic UI gesture can accept an observed state; domain actions require verified postconditions');
      if (running) throw new Error('Another Dock action is still running');
      running = true;
      try {
        await reconcilePending();
        if (!pending) return { ...structuredClone(operation.outcome), recovery_operation_id: recoveryOperationId };
        if (operation.transportUncertain) throw new Error('The browser operation has not confirmed completion; inspect before recovery');
        if (strategy !== 'restore_control' && !operation.cleanupConfirmed) throw new Error('Restore browser control before repairing the graph');
        if (strategy === 'accept_observed_state' || strategy === 'abandon_operation') {
          const snapshot = observations.get(observationId);
          if (!snapshot) throw new Error('Observe the current UI before accepting its state');
          const current = await execute(makeWorkspaceUiCode({ mode: 'observe',
            root_ref:snapshot.observation_root?.ref,discover_roots:snapshot.observation_kind==='roots',
            storage_name:snapshot.observation_filter?.storage_name,
            expected_build: targetBuild, expected_origin: targetOrigin }), { signal, timeout: 35000 });
          const identity = value => [value.origin, value.loginom_build, value.workflow_ref, value.package_identity,
            value.observation_root,value.observation_kind,value.observation_filter,value.wizard,value.nodes,value.links,value.ui];
          if (current.status !== 'SUCCEEDED' || fingerprint('ui-state', identity(snapshot)) !== fingerprint('ui-state', identity(current.output))) {
            throw new Error('Observed state changed before acceptance; inspect the fresh UI');
          }
          const resolution = strategy === 'abandon_operation' ? 'abandoned_after_observation' : 'accepted_observed_state';
          const resolved = { ...structuredClone(operation.outcome), resolution, goal_verified: false,
            recovery_operation_id: recoveryOperationId, observation_id: observationId };
          await remember(operation, strategy === 'abandon_operation' ? 'operation_abandoned' : 'observed_state_accepted', resolved);
          operation.outcome = resolved; pending = null; observations.clear();
          const result = { status: 'SUCCEEDED', action_key: 'operation.recover', action_revision: '1', operation_id: operationId,
            phase: 'resolved', effect_possible: false, error: null, trace: [], output: { resolution,
              goal_verified: false, original_outcome: resolved }, recovery_operation_id: recoveryOperationId };
          auxiliary.set(recoveryOperationId, { signature, outcome: structuredClone(result) });
          return result;
        }
        if ((operation.recoveryAttempts ?? 0) >= 12) throw new Error('Recovery budget exhausted; inspect and report the unresolved state');
        operation.recoveryAttempts = (operation.recoveryAttempts ?? 0) + 1;
        const record = { ...operation, id: recoveryOperationId, parameters: { original_operation_id: operationId, strategy } };
        await remember(record, 'recovery_prepared');
        observations.clear();
        let outcome;
        try {
          if (strategy === 'complete_link') outcome = await invoke(operation, 'recover_link', { receiptId: recoveryOperationId });
          else {
            const receipt = receiptOptions(operation, recoveryOperationId, 'operation.restore_control', signature);
            const body = `(async () => { const outcome = {status:'SUCCEEDED', action_key:'operation.restore_control',action_revision:'1',operation_id:${JSON.stringify(recoveryOperationId)},phase:'cleanup',effect_possible:true,output:{},error:null,trace:[]}; try { await page.mouse.up({button:'left'}); await page.mouse.up({button:'right'}); await page.keyboard.press('Escape'); outcome.cleanup_complete=true; } catch(error) { outcome.status='AMBIGUOUS';outcome.cleanup_complete=false;outcome.error={code:'CLEANUP_FAILED',message:String(error.message).slice(0,500)}; } return outcome; })()`;
            const restored = await execute(withBrowserReceipt(body, receipt), { timeout: 15000 });
            if (!restored.cleanup_complete) { operation.cleanupConfirmed = false; outcome = failed(operation, 'CLEANUP_FAILED', 'Browser cleanup failed'); }
            else { operation.cleanupConfirmed = true; outcome = operation.action.capability === 'ui.act'
              ? { ...operation.outcome, cleanup_complete: true } : await invoke(operation, 'reconcile'); }
          }
        } catch (error) {
          operation.transportUncertain = true;
          outcome = failed(operation, 'BROWSER_CALL_UNCERTAIN', String(error?.message ?? error).slice(0, 1000));
        }
        if (!operation.transportUncertain && outcome.status === 'FAILED' && outcome.cleanup_complete === true) {
          const attempt = outcome;
          outcome = await invoke(operation, 'reconcile');
          outcome.recovery_attempt = attempt;
        }
        operation.outcome = outcome;
        if (!operation.transportUncertain) operation.cleanupConfirmed = outcome.cleanup_complete === true;
        await remember(record, 'recovery_completed', outcome);
        const returned = { ...outcome, recovery_operation_id: recoveryOperationId };
        auxiliary.set(recoveryOperationId, { signature, outcome: structuredClone(returned) });
        if (!operation.transportUncertain && operation.cleanupConfirmed && ['SUCCEEDED', 'NOT_APPLIED'].includes(outcome.status)) pending = null;
        return returned;
      } finally { running = false; }
    },
    async observe({ signal, scope, cursor, rootRef, observationId, storageName } = {}) {
      signal?.throwIfAborted();
      if (scope !== undefined && !['bootstrap', 'all', 'palette', 'graph', 'dialogs', 'roots', 'wizard'].includes(scope)) throw new Error('Unknown observation scope');
      if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || scope !== undefined)) throw new Error('Use cursor alone to continue the original observation scope');
      if (cursor !== undefined && (rootRef !== undefined || observationId !== undefined)) throw new Error('Use cursor alone to continue the original root');
      if ((rootRef===undefined)!==(observationId===undefined) || (['bootstrap','roots','wizard'].includes(scope) && rootRef!==undefined)) throw new Error('Root requires root_ref and observation_id in a prepared workspace');
      if (rootRef!==undefined) {
        if (typeof rootRef!=='string' || !/^ui-[a-zA-Z0-9-]{1,124}$/.test(rootRef)) throw new Error('Root requires an observed opaque reference');
        observations.assertIssued(observationId,{ref:rootRef});
      }
      if (storageName!==undefined && (scope!=='roots' || cursor!==undefined || typeof storageName!=='string'
          || !storageName || storageName.length>200 || /[\\/\x00-\x1f\x7f]/.test(storageName))) throw new Error('storage_name requires roots scope and one filename');
      const selectedStorageName=cursor===undefined ? storageName : observations.filterForCursor(cursor)?.storage_name;
      let selectedRoot = cursor===undefined ? rootRef : observations.rootForCursor(cursor);
      if (scope === 'bootstrap') return execute(makeWorkspaceBootstrapCode({ origin: targetOrigin, build: targetBuild }), { signal, timeout: 5000 });
      const observationOperationId=randomUUID();
      let outcome,deliveredScope=scope,selection;
      if(scope==='wizard') {
        const discovery=await execute(makeWorkspaceUiCode({mode:'observe',operation_id:observationOperationId,
          discover_roots:true,expected_build:targetBuild,expected_origin:targetOrigin}),{signal,timeout:35000});
        const state=discovery.output,wizard=state?.wizard;
        const candidates=(state?.ui?.elements??[]).filter(e=>e.kind==='region'
          && e.ref===wizard?.root_ref && e.tid===state?.workflow_ref?.prefix+';WizrdMCF');
        if(discovery.status==='SUCCEEDED' && wizard?.status==='observed' && candidates.length===1) {
          selectedRoot=candidates[0].ref;deliveredScope='all';
          selection={event:'observation_scope_selected',requested_scope:'wizard',delivered_scope:'all',
            root_ref:selectedRoot,reason:'unique_observed_wizard'};
        } else {
          outcome=discovery;deliveredScope='roots';
          selection={event:'observation_scope_selected',requested_scope:'wizard',delivered_scope:'roots',reason:'unique_wizard_not_observed'};
        }
      }
      signal?.throwIfAborted();
      if(!outcome)outcome = await execute(makeWorkspaceUiCode({ mode: 'observe', operation_id:observationOperationId, root_ref:selectedRoot, storage_name:selectedStorageName, discover_roots:scope==='roots' || (cursor!==undefined && observations.kindForCursor(cursor)==='roots'), expected_build: targetBuild, expected_origin: targetOrigin }), { signal, timeout: 35000 });
      if(selection)outcome.trace.push(selection);
      if(cursor===undefined && selectedRoot===undefined && !['roots','wizard'].includes(scope)
          && outcome.status==='NOT_APPLIED' && outcome.error?.code==='UI_SCAN_LIMIT') {
        signal?.throwIfAborted();
        outcome=await execute(makeWorkspaceUiCode({mode:'observe',operation_id:observationOperationId,
          discover_roots:true,expected_build:targetBuild,expected_origin:targetOrigin}),{signal,timeout:35000});
        deliveredScope='roots';
        outcome.trace.push({event:'observation_scope_fallback',requested_scope:scope??'all',
          delivered_scope:'roots',reason:'UI_SCAN_LIMIT'});
      }
      await onRecord({operation_id:observationOperationId,phase:'observation_completed',outcome:structuredClone(outcome)});
      outcome.output.operation = view(pending).output;
      return cursor === undefined ? observations.retain(outcome, { scope:deliveredScope }) : observations.next(cursor, outcome);
    },
    async uiAct(action, { observationId, operationId, recoveryOperationId, signal } = {}) {
      signal?.throwIfAborted(); checkId(operationId);
      const signature = fingerprint('ui.act', [observationId, action, recoveryOperationId ?? null]);
      if (auxiliary.has(operationId)) {
        const previous = auxiliary.get(operationId);
        if (previous.signature !== signature) throw new Error('UI operation ID was already used with different parameters');
        return structuredClone(previous.outcome);
      }
      if (operations.has(operationId)) throw new Error('UI operation ID conflicts with an existing operation');
      if(pending?.action.capability==='node.apply')throw new Error('The original node phase must be verified before any UI repair');
      if(pending?.action.capability==='artifact.upload') {
        if(running || pending.transportUncertain || !pending.cleanupConfirmed)
          throw new Error('Upload is pending server verification; only observation and inspection are available');
        // This attempted request never enters the browser. Preserve the
        // original upload's uncertainty separately from this explicit refusal.
        const outcome={status:'FAILED',action_key:'request.validate',action_revision:'1',operation_id:null,
          phase:'request_rejected',effect_possible:false,cleanup_complete:true,request_rejected:true,
          output:{request_refusal:{operation_id:operationId,pending_operation_id:pending.id,
            reason:'upload_pending',browser_invoked:false},operation:view(pending).output},
          error:{code:'REQUEST_REJECTED',message:'Upload is pending server verification; UI actions are not invoked'},trace:[]};
        await onRecord({operation_id:operationId,action_key:'request.validate',phase:'ui_request_rejected',
          parameters:{action:structuredClone(action),observation_id:observationId,recovery_operation_id:recoveryOperationId??null},
          pending_operation_id:pending.id,outcome:structuredClone(outcome)});
        auxiliary.set(operationId,{signature,outcome:structuredClone(outcome)});
        return outcome;
      }
      const snapshot = observations.get(observationId);
      if (!snapshot) throw new Error('Observation is stale or belongs to another session; observe again');
      validateUiAction(action, snapshot);
      observations.assertIssued(observationId, action);
      if (running) throw new Error('Another Dock action is still running');
      if (recoveryOperationId && pending?.id !== recoveryOperationId) throw new Error('Recovery binding does not match the pending operation');
      if (pending && (!recoveryOperationId || pending.transportUncertain || !pending.cleanupConfirmed)) {
        throw new Error('Inspect the pending operation and confirm browser completion/cleanup before UI repair');
      }
      if (pending && (pending.recoveryAttempts ?? 0) >= 12) throw new Error('Recovery budget exhausted; report the unresolved state');
      const original = pending;
      // While a domain action is pending, repair only its known created node,
      // target node, or the corresponding editor/dialog. Unrelated graph items
      // remain protected by both ref scope and the original graph checkpoint.
      if (original) {
        const output = original.outcome?.output ?? {};
        const label = original.action.capability === 'node.add.v1'
          ? output.added_label ?? (output.added_labels?.length === 1 ? output.added_labels[0] : null)
          : original.action.capability === 'link.create.v1' ? original.parameters.target_node.node_label : null;
        const binding=original.checkpoint.graph_binding,identity=snapshot.graph_identity;
        const boundGraph=binding && identity?.status==='observed' && identity.container_tid===binding.container_tid
          && (binding.native_prefix===null || identity.native_prefix===binding.native_prefix)
          && snapshot.workflow_ref?.prefix===original.checkpoint.workflow_ref?.prefix
          && snapshot.workflow_ref?.tab_tid===original.checkpoint.workflow_ref?.tab_tid;
        const nativePrefix=boundGraph?identity.native_prefix:null;
        const references = [action.ref, action.source_ref, action.target_ref].filter(Boolean);
        for (const ref of references) {
          const element = snapshot.ui.elements.find(item => item.ref === ref);
          const tidValue = element?.tid ?? element?.identity?.anchor_tid ?? '';
          const owned = boundGraph && element?.scope==='graph' && label && (tidValue === `${nativePrefix}${label}` || tidValue.startsWith(`${nativePrefix}${label};`));
          const source = boundGraph && element?.scope==='graph' && original.action.capability === 'link.create.v1' && tidValue === original.checkpoint.source_tid
            && action.verb === 'drag' && action.source_ref === ref;
          const uiOwned = original.action.capability === 'ui.act' && original.checkpoint.target_tids?.includes(tidValue);
          const createdLink = boundGraph && element?.scope==='graph' && original.action.capability === 'node.add.v1' && output.repairable_links?.includes(tidValue);
          const linkPrefix = `${nativePrefix}${original.parameters.source_node?.node_label}|${original.checkpoint.source_tid?.split(';').at(-1)}|${original.parameters.target_node?.node_label}|`;
          const misplacedLink = boundGraph && element?.scope==='graph' && original.action.capability === 'link.create.v1' && !output.reason
            && original.checkpoint.graph && output.added_links?.includes(tidValue)
            && !original.checkpoint.links.includes(tidValue) && tidValue.startsWith(linkPrefix)
            && !output.removed_links?.length && !output.removed_ports?.length;
          const editor = boundGraph && element?.kind === 'field' && element?.scope === 'graph_editor';
          const dialog = element?.scope === 'dialog' || !!element?.signature?.dialog_ref;
          if (!owned && !source && !uiOwned && !createdLink && !misplacedLink && !editor && !dialog) throw new Error('UI repair target is outside the pending operation; inspect its actual partial result');
        }
      }
      running = true;
      const uiOperation = { id: operationId, signature, action: { action_key: 'ui.act', revision: '1', capability: 'ui.act' },
        parameters: { action, observation_id: observationId, recovery_operation_id: recoveryOperationId ?? null },
        checkpoint: { workflow_ref: snapshot.workflow_ref, target_tids: [action.ref, action.source_ref, action.target_ref].filter(Boolean)
          .map(ref => snapshot.ui.elements.find(item => item.ref === ref)).map(item => item.tid ?? item.identity?.anchor_tid) }, deadline: now() + 30000 };
      const owner = original ?? uiOperation;
      try {
        await remember(uiOperation, 'prepared');
        if (original) original.recoveryAttempts = (original.recoveryAttempts ?? 0) + 1;
        else { operations.set(operationId, uiOperation); pending = uiOperation; }
        const receipt = receiptOptions(owner, operationId, 'ui.act', signature);
        observations.clear();
        let outcome;
        try {
          const code = makeWorkspaceUiCode({ mode: 'act', expected_build: targetBuild, expected_origin: targetOrigin,
            operation_id: operationId, action, snapshot });
          outcome = await execute(withBrowserReceipt(`(${code})(page)`, receipt), { timeout: 35000 });
        } catch (error) { owner.transportUncertain = true; outcome = failed(uiOperation, 'BROWSER_CALL_UNCERTAIN', String(error?.message ?? error).slice(0, 1000)); }
        if (!owner.transportUncertain) owner.cleanupConfirmed = outcome.cleanup_complete === true;
        uiOperation.outcome = outcome;
        await remember(uiOperation, 'completed', outcome);
        if (original && !owner.transportUncertain && owner.cleanupConfirmed) {
          const resolved = await reconcilePending();
          outcome.output.recovery = view(original, resolved).output;
        } else if (!original && !owner.transportUncertain && owner.cleanupConfirmed && outcome.status !== 'AMBIGUOUS') pending = null;
        outcome = retainObservation(outcome);
        auxiliary.set(operationId, { signature, outcome: structuredClone(outcome) });
        return outcome;
      } finally { running = false; }
    },
    async upload({artifactId,grantId,observationId,operationId,signal,decideConflicts=false}={}) {
      signal?.throwIfAborted();checkId(operationId);
      if(!allowCandidate || !artifactStore)throw new Error('Artifact upload is available only in an authorized candidate session');
      const artifact=artifactStore.getUploadGrant(artifactId,grantId);
      const signature=fingerprint(decideConflicts?'artifact.upload.delivery':'artifact.upload',[artifactId,grantId,observationId]);
      if(auxiliary.has(operationId))throw new Error('Upload operation ID conflicts with another request');
      if(operations.has(operationId)) {
        const previous=operations.get(operationId);
        if(previous.signature!==signature || previous.action.capability!=='artifact.upload')throw new Error('Upload operation ID was already used with different parameters');
        return previous.outcome ? structuredClone(previous.outcome) : failed(previous,'OPERATION_STILL_PENDING','The browser operation is still running');
      }
      if(running || pending)throw new Error('Resolve the pending Dock operation before uploading');
      if(artifact.upload.overwrite!=='replace'&&!(decideConflicts&&artifact.upload.overwrite==='reject'))throw new Error('reject upload policy is not implemented; it cannot be replaced implicitly');
      const snapshot=observations.get(observationId);
      if(!snapshot || snapshot.file_storage?.status!=='observed' || snapshot.file_storage.directory!==artifact.upload.directory)
        throw new Error('Observe the exact authorized Loginom storage directory before uploading. Open the main Файлы (Files) workspace and enter the directory from the upload grant; require file_storage.status=observed and an exact directory match. The import file-selection dialog cannot receive this upload: cancel that dialog through its observed control, then open Files and observe again. No file was staged or submitted.');
      running=true;
      try {
        const lease=await artifactStore.stageUpload(artifactId);
        const operation={id:operationId,signature,uploadLease:lease,action:{action_key:'artifact.upload',revision:'1',capability:'artifact.upload'},
          parameters:{artifact_id:artifactId,upload_grant_id:grantId,observation_id:observationId,destination:artifact.upload.destination,overwrite:artifact.upload.overwrite},
          checkpoint:{workflow_ref:snapshot.workflow_ref,file_storage:snapshot.file_storage,storage_root_ref:snapshot.observation_root?.ref ?? null,artifact},deadline:now()+30000};
        try {await lease.verify();signal?.throwIfAborted();await remember(operation,'prepared');signal?.throwIfAborted();}
        catch(error){await lease.release();throw error;}
        operations.set(operationId,operation);pending=operation;observations.clear();
        let outcome;
        try {
          const receipt=receiptOptions(operation,operationId,'artifact.upload',signature);
          const code=makeArtifactUploadCode({operation_id:operationId,artifact,upload_path:lease.path,snapshot,decide_conflicts:decideConflicts,
            expected_build:targetBuild,expected_origin:targetOrigin});
          outcome=assertActionOutcome(await execute(withBrowserReceipt(`(${code})(page)`,receipt),{timeout:35000}));
          if(outcome.operation_id!==operationId || outcome.action_key!=='artifact.upload' || outcome.action_revision!=='1')
            throw new Error('Upload receipt identity mismatch');
        } catch {operation.transportUncertain=true;outcome=failed(operation,'BROWSER_CALL_UNCERTAIN','Inspect the upload receipt before any further mutation');}
        operation.cleanupConfirmed=!operation.transportUncertain && outcome.cleanup_complete===true;
        operation.outcome=outcome;
        await remember(operation,'completed',outcome);
        if(!operation.transportUncertain && (outcome.status==='NOT_APPLIED'||decideConflicts&&outcome.status==='FAILED'&&outcome.output.conflict_rejected===true) && operation.cleanupConfirmed) {
          await lease.release();pending=null;
        }
        return structuredClone(outcome);
      } finally {running=false;}
    },
    async verifyArtifact({operationId,verificationId,observationId,fileRef,signal,discover=false}={}) {
      signal?.throwIfAborted();checkId(operationId);checkId(verificationId);
      if(!allowCandidate || !artifactStore)throw new Error('Artifact verification is available only in a candidate session');
      const signature=fingerprint(discover?'artifact.verify.discovery':'artifact.verify',[operationId,observationId,fileRef]);
      const operation=operations.get(operationId);
      if(operations.has(verificationId))throw new Error('Verification ID conflicts with an existing operation');
      if(auxiliary.has(verificationId)) {
        const previous=auxiliary.get(verificationId);
        if(previous.signature!==signature)throw new Error('Verification ID was already used with different parameters');
        return structuredClone(previous.outcome);
      }
      if(operation?.verification?.id===verificationId) {
        if(operation.verification.signature!==signature)throw new Error('Verification ID was already used with different parameters');
        return structuredClone(operation.verification.outcome ?? failed(operation.verification,'OPERATION_STILL_PENDING','Inspect the original upload to reconcile its download'));
      }
      if(running || !operation || pending!==operation || operation.action.capability!=='artifact.upload'
        || operation.transportUncertain || !operation.cleanupConfirmed || (operation.verification && !operation.verification.settled))
        throw new Error('Inspect and confirm the pending upload browser receipt before verifying its file');
      const snapshot=observations.get(observationId);
      if(!snapshot)throw new Error('Observe the authorized file row before verifying');
      if(!discover)observations.assertIssued(observationId,{ref:fileRef});
      const options={operation_id:verificationId,upload_operation_id:operationId,observation_id:observationId,file_ref:fileRef,
        snapshot,artifact:operation.checkpoint.artifact,storage_root_ref:operation.checkpoint.storage_root_ref,
        expected_build:targetBuild,expected_origin:targetOrigin};
      // Validate exact file identity before allocating any download lease.
      const buildDownload=discover?o=>makeArtifactDiscoveryDownloadCode(o,{download:browserArtifactDownload,reveal:browserArtifactReveal}):makeArtifactDownloadCode;
      buildDownload(options);
      running=true;
      try {
        const lease=await artifactStore.stageDownload(operation.parameters.artifact_id);
        const attempt={id:verificationId,signature,lease,action:{action_key:'artifact.verify',revision:'1',capability:'artifact.verify'},
          parameters:{upload_operation_id:operationId,observation_id:observationId,file_ref:fileRef},checkpoint:{artifact:options.artifact,
            ...(discover?{discovery:{workflow_ref:snapshot.workflow_ref,document:snapshot.dom_epoch.document,active_tab_ref:snapshot.active_tab_ref}}:{})},deadline:now()+60000};
        try {signal?.throwIfAborted();await remember(attempt,'download_prepared');signal?.throwIfAborted();}
        catch(error){await lease.release();throw error;}
        operation.verification=attempt;observations.clear();
        const receipt=receiptOptions(operation,verificationId,'artifact.download',signature);
        let raw;
        try {
          const code=buildDownload({...options,download_path:lease.path});
          raw=await execute(withBrowserReceipt(`(${code})(page)`,receipt),{timeout:65000});
        } catch {
          operation.transportUncertain=true;operation.cleanupConfirmed=false;
          attempt.outcome=failed(attempt,'BROWSER_CALL_UNCERTAIN','Inspect the original upload before any repeated download');
          await remember(attempt,'download_transport_uncertain',attempt.outcome);
          return structuredClone(attempt.outcome);
        }
        return structuredClone(await finishArtifactVerification(operation,attempt,raw));
      } finally {running=false;}
    },
    uploadDeliveredArtifact:options=>runtime.upload({...options,decideConflicts:true}),
    verifyDeliveredArtifact:options=>runtime.verifyArtifact({...options,discover:true}),
    // Private entry point for the node.apply shell (03). No new public MCP
    // action: the graph phase shares this runtime's gate, IDs and journal.
    async runNodeTarget(request,{operationId,signal,resume=false}={}) {
      signal?.throwIfAborted();checkId(operationId);validateNodeTargetRequest(request);
      if(running)throw new Error('Another Dock action is still running');
      const signature=fingerprint('node.target.internal',request);
      if(auxiliary.has(operationId))throw new Error('Operation ID conflicts with a recovery or UI operation');
      let operation=operations.get(operationId);
      if(operation&&operation.signature!==signature)throw new Error('operation_id was already used with different parameters');
      if(pending&&pending!==operation)throw new Error('Another Dock operation remains pending');
      if(operation&&!resume){await inspectTarget(operation);return {...structuredClone(operation.outcome),output:{...structuredClone(operation.outcome.output),replayed:operation.outcome.status==='SUCCEEDED'}};}
      if(resume){
        if(!operation||pending!==operation)throw new Error('Resume requires the original pending node target');
        await inspectTarget(operation);
        if(!pending)return structuredClone(operation.outcome);
        if(operation.targetPhase.pending||!operation.cleanupConfirmed)throw new Error('Inspect must verify the pending effect and cleanup before resume');
        if((operation.resumeAttempts??0)>=3)throw new Error('Node target resume budget exhausted');
        operation.resumeAttempts=(operation.resumeAttempts??0)+1;
      }
      running=true;
      try{
        if(!operation){operation={id:operationId,signature,parameters:structuredClone(request),action:{action_key:'node.target.internal',capability:'node.target.internal',revision:'1'}};
          operation.nodeTargetAdapter=targetAdapter(operation);
          operation.checkpoint={workflow_ref:request.workflow_ref,document_id:request.document_id};
        }
        operation.deadline=now()+60000;
        await remember(operation,resume?'node_target_resume_prepared':'prepared');signal?.throwIfAborted();
        operations.set(operation.id,operation);pending=operation;observations.clear();
        const result=await prepareNodeTarget({request:operation.parameters,operation,adapter:operation.nodeTargetAdapter,record:nodeTargetRecord,signal,now});
        // A settled child receipt is needed even after cancellation. Never infer
        // cleanup from a model summary or release the gate on transport timeout.
        result.cleanup_complete=!operation.targetPhase?.pending || operation.targetPhase.pending.receipt?.cleanup_complete===true;
        const outcome=nodeTargetOutcome(operation,result);operation.outcome=outcome;operation.cleanupConfirmed=outcome.cleanup_complete;
        try{await remember(operation,'completed',outcome);}catch(error){operation.outcome=failed(operation,'EVIDENCE_WRITE_FAILED',String(error.message));return operation.outcome;}
        if(result.status!=='AMBIGUOUS'&&operation.cleanupConfirmed)pending=null;
        return structuredClone(outcome);
      }finally{running=false;}
    },
    // Host-only until the complete real drivers pass admission. All child
    // phases own the same runtime gate; they cannot re-enter public run/act.
    async runNodeApply(request,{signal,stopSignal,resume=false}={}) {
      request=structuredClone(request);
      signal?.throwIfAborted();checkId(request.operation_id);
      const {handler}=validateNodeApplyRequest(request,nodeApplyHandlers);
      if(typeof nodeApplyDriverFactory!=='function')throw new Error('Local node drivers are not installed');
      if(running)throw new Error('Another Dock action is still running');
      const signature=fingerprint('node.apply',{request,handler_revision:handler.revision,...(handler.output_wizard==='separate'?{output_wizard:'separate'}:{})});
      const operationId=request.operation_id;
      if(auxiliary.has(operationId))throw new Error('Operation ID conflicts with a recovery or UI operation');
      let operation=operations.get(operationId);
      if(operation&&operation.signature!==signature)throw new Error('operation_id was already used with different parameters or handler');
      if(pending&&pending!==operation)throw new Error('Another Dock operation remains pending');
      if(operation&&!resume)return inspectApply(operation);
      if(resume&&operation?.nodeApply?.pending?.phase==='input_mapping'&&operation.nodeApplyDrivers?.recoverInputMapping){
        running=true;
        try{
          await reconcileInputMappingPhase({operation,readReceipt:ref=>readReceipt(operation,ref),record:onRecord,now,signal});
          operation.inputMappingRecovery=null;
        }catch(error){
          operation.inputMappingRecovery={available:false,phase:'input_mapping',reason:String(error.message).slice(0,1000)};
          operation.outcome=nodeApplyOutcome(operation,{...operation.outcome.output,status:'AMBIGUOUS',
            cleanup_complete:operation.nodeApply.cleanup_complete,pending_phase:operation.nodeApply.pending?.phase??null,
            error:{code:'INPUT_MAPPING_RECOVERY_UNVERIFIED',message:operation.inputMappingRecovery.reason}});
          await remember(operation,'recovery_unverified',operation.outcome);return structuredClone(operation.outcome);
        }finally{running=false;}
      }
      if(resume&&['workflow','target'].includes(operation?.nodeApply?.pending?.phase))await inspectApply(operation);
      const configureContinuation=resume&&operation?.nodeApply?.pending?.phase==='configure'
        &&request.target.type==='transform.date_time'&&typeof operation.nodeApplyDrivers?.verifyPendingConfigure==='function';
      if(resume&&(!operation||pending!==operation||!configureContinuation&&(operation.nodeApply?.pending||!operation.cleanupConfirmed)))
        throw new Error('Resume requires the original inspected node checkpoint without an unresolved phase');
      running=true;
      try {
        if(!operation){
          operation={id:operationId,signature,parameters:request,
            action:{action_key:'node.apply',capability:'node.apply',revision:request.contract_revision},
            checkpoint:{document_id:request.document_id,workflow_ref:request.workflow_ref},deadline:now()+request.budgets.total_ms};
          operation.nodeTargetAdapter=targetAdapter(operation);
          // Only trusted host code supplies drivers, never a tool request.
          // Internal node readers return both typed action outcomes and plain
          // native observations. The real bridge accepts typed envelopes only;
          // unwrap their value locally, preserving the driver's original data.
          const executeNodeScript=async(code,options)=>{
            const wrapped='async page => {const base={action_key:"node.apply.transport",action_revision:"1",operation_id:'+JSON.stringify(operation.id)+',phase:"transport",effect_possible:true,trace:[]};try{return {...base,status:"SUCCEEDED",error:null,output:{value:await ('+code+')(page)}};}catch(error){return {...base,status:"FAILED",cleanup_complete:false,output:{},error:{code:"NODE_APPLY_TRANSPORT",message:String(error.message).slice(0,500)}};}}';
            const response=await execute(wrapped,options);
            if(response.status!=='SUCCEEDED')throw new Error(response.error?.message??'Node driver transport failed');
            return response.output.value;
          };
          operation.nodeApplyDrivers=nodeApplyDriverFactory({operation,execute:executeNodeScript,onRecord,now,artifactStore,
            receiptOptions:(id,key,signature)=>receiptOptions(operation,id,key,signature),
            readReceipt:reference=>readReceipt(operation,reference),
            nodeHistory:()=>[...operations.values()].map((o,sequence)=>({o,sequence})).filter(({o})=>o!==operation&&o.action.capability==='node.apply')
              .map(({o,sequence})=>structuredClone({sequence,request:o.parameters,outcome:o.outcome,cleanup_confirmed:o.cleanupConfirmed})),
            uploadHistory:()=>({complete:true,records:[...operations.values()].map((o,sequence)=>({o,sequence})).filter(({o})=>o.action.capability==='artifact.upload')
              .map(({o,sequence})=>structuredClone({sequence,operation_id:o.id,destination:o.parameters.destination,artifact:o.checkpoint.artifact,outcome:o.outcome,cleanup_confirmed:o.cleanupConfirmed===true,transport_uncertain:o.transportUncertain===true}))}),
            exclusiveNodeOperation:()=>running===true&&pending===operation&&operation.nodeApply?.pending?.phase==='read',
            verifiedUploads:()=>[...operations.values()].filter(o=>o.action.capability==='artifact.upload'
              && o.outcome?.status==='SUCCEEDED'&&o.cleanupConfirmed===true)
              .map(o=>structuredClone({operation_id:o.id,artifact:o.checkpoint.artifact,outcome:o.outcome}))});
          for(const name of ['verifySource','mapPorts','openWizard','finish','waitExecution','readOutput','verifyContinuation'])
            if(typeof operation.nodeApplyDrivers?.[name]!=='function')throw new Error('Local node driver missing: '+name);
          // Reuse the accepted graph driver directly, under this operation ID.
          const originalContinuation=operation.nodeApplyDrivers.verifyContinuation;
          operation.nodeApplyDrivers={...operation.nodeApplyDrivers,
            verifyContinuation:async(state,ctx)=>{
              if(state.target_reconciled && !state.phases.some(p=>p.phase==='target')){
                const {graph}=validateNodeApplyRequest(state.request,nodeApplyHandlers);
                await inspectNodeTarget({request:graph,operation,adapter:operation.nodeTargetAdapter,
                  record:nodeTargetRecord,deadline:Math.min(state.deadline,state.configure_deadline,now()+15000)});
              }
              if(state.phases.at(-1)?.phase!=='workflow')return originalContinuation(state,ctx);
              if(state.pending||state.node||state.cleanup_complete!==true||state.phases.length!==2
                ||state.phases[0].phase!=='source'||now()>=Math.min(state.deadline,state.configure_deadline)
                ||typeof operation.nodeTargetAdapter.verifyWorkflow!=='function')return false;
              const current=await operation.nodeTargetAdapter.verifyWorkflow(
                {document_id:request.document_id,workflow_ref:request.workflow_ref},
                {...ctx,deadline:Math.min(state.deadline,state.configure_deadline,now()+15000)});
              if(current?.status!=='SUCCEEDED'||current.verified!==true||current.cleanup_complete!==true
                ||current.effect_possible!==false||current.document_id!==request.document_id
                ||fingerprint('workflow',current.workflow_ref)!==fingerprint('workflow',request.workflow_ref))return false;
              const source=await operation.nodeApplyDrivers.verifySource(request.parameters,
                {...ctx,operation_id:operation.id,document_id:request.document_id,workflow_ref:request.workflow_ref,
                  deadline:Math.min(state.deadline,state.configure_deadline)});
              const verified=fingerprint('source',source)===fingerprint('source',state.phases[0].value);
              await onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:request.contract_revision,
                phase:'node_continuation_checked',boundary:'workflow',verified,current,source});
              return verified;
            },
            ...(typeof operation.nodeTargetAdapter.activateWorkflow==='function'?{activateWorkflow:ctx=>operation.nodeTargetAdapter.activateWorkflow(
              {document_id:request.document_id,workflow_ref:request.workflow_ref},ctx)}:{}),prepareTarget:async(graph,ctx)=>{
            const overallDeadline=operation.deadline;operation.deadline=ctx.deadline;
            let result,preflight;
            try{
              if(operation.nodeApplyDrivers.beforeTarget){
                const current=await operation.nodeTargetAdapter.verifyWorkflow({document_id:graph.document_id,workflow_ref:graph.workflow_ref},ctx);
                if(current?.status!=='SUCCEEDED'||current.verified!==true||current.cleanup_complete!==true
                  ||current.effect_possible!==false||current.document_id!==graph.document_id
                  ||JSON.stringify(current.workflow_ref)!==JSON.stringify(graph.workflow_ref))throw Error('Workflow ownership changed before node preflight');
                // Bind the freshly reopened native graph before a schema
                // preflight reads its source port. Workflow activation alone
                // does not establish the embedded node-context identity.
                const sourceGraph=await operation.nodeTargetAdapter.observe(graph,ctx.deadline,ctx.signal);
                if(sourceGraph?.complete!==true||sourceGraph.document_id!==graph.document_id
                  ||JSON.stringify(sourceGraph.workflow_ref)!==JSON.stringify(graph.workflow_ref))
                  throw Error('Complete owned graph required before node preflight');
                preflight=await operation.nodeApplyDrivers.beforeTarget(ctx);
              }
              result=await prepareNodeTarget({request:graph,operation,adapter:operation.nodeTargetAdapter,
                record:onRecord,signal:ctx.signal,now});
            }finally{operation.deadline=overallDeadline;}
            if(result.status!=='SUCCEEDED'){
              const error=new Error(result.error??'Node target is not verified');
              if(result.status==='NOT_APPLIED' && result.partial_effect===false && result.cleanup_complete===true
                && operation.targetPhase?.effect_possible===false && !operation.targetPhase?.pending){
                if(preflight?.effect_possible!==true)
                  error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
                else if(preflight.verified===true && preflight.cleanup_complete===true && preflight.settings_changed===false
                  && preflight.target_refusal?.verification==='missing_values_preflight_completed')
                  // Source inspection has a known activity effect, but no
                  // target gesture was applied. Preserve that effect and use
                  // the existing verified-refusal path instead of stranding
                  // a clean operation behind the uncertainty gate.
                  error.nodePhaseRefusal=structuredClone(preflight.target_refusal);
              }
              throw error;
            }
            return {verified:true,cleanup_complete:!operation.targetPhase?.pending,
              effect_possible:operation.targetPhase?.effect_possible===true,node:result.node.ref,target:result};
          }};
        }
        await remember(operation,resume?'node_apply_resume_prepared':'prepared');signal?.throwIfAborted();
        operations.set(operation.id,operation);pending=operation;observations.clear();
        let result;
        try{result=await applyNode({request,operation,handlers:nodeApplyHandlers,drivers:operation.nodeApplyDrivers,
          record:onRecord,signal,stopSignal,now,resume});}
        catch(error){
          // Keep the claimed ID even if the first phase could not be started.
          // A reused ID must never silently acquire a different request.
          result={operation_id:operation.id,status:operation.nodeApply?'AMBIGUOUS':'NOT_APPLIED',
            phases:(operation.nodeApply?.phases??[]).map(({value,...phase})=>structuredClone(phase)),
            node:structuredClone(operation.nodeApply?.node??null),
            execution:structuredClone(operation.nodeApply?.execution??{status:'not_requested',execution_id:null}),
            output:structuredClone(operation.nodeApply?.output??{status:'not_refreshed',evidence_ref:null,ports:[]}),package_saved:false,warnings:[],
            effect_possible:operation.nodeApply?.effect_possible===true,
            cleanup_complete:operation.nodeApply?operation.nodeApply.cleanup_complete===true:true,
            pending_phase:operation.nodeApply?.pending?.phase??null,
            error:{code:'NODE_APPLY_STOPPED',message:String(error.message).slice(0,1000)}};
        }
        operation.outcome=nodeApplyOutcome(operation,result);operation.cleanupConfirmed=result.cleanup_complete===true;
        try{await remember(operation,'completed',operation.outcome);}
        catch(error){
          // Failure to journal delivery must retain the configured node, accepted
          // phases and execution identity. Inspect can redeliver the durable
          // node checkpoint; neither an empty output nor another run is needed.
          operation.outcome=nodeApplyOutcome(operation,{...result,status:result.effect_possible?'AMBIGUOUS':'NOT_APPLIED',
            error:{code:'EVIDENCE_WRITE_FAILED',message:String(error.message).slice(0,1000)}});
          return structuredClone(operation.outcome);
        }
        if(result.status!=='AMBIGUOUS'&&operation.cleanupConfirmed)pending=null;
        return structuredClone(operation.outcome);
      }finally{running=false;}
    },
    async run(actionKey, parameters, { signal, operationId } = {}) {
      signal?.throwIfAborted();
      const action = find(actionKey);
      validateActionParameters(action.input_schema, parameters);
      if (operationId !== undefined && (typeof operationId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(operationId))) {
        throw new Error('operation_id must be a stable identifier with at most 128 characters');
      }
      if (running) throw new Error('Another Dock action is still running');
      running = true;
      try {
        const signature = fingerprint(actionKey, parameters);
        if (operationId && auxiliary.has(operationId)) throw new Error('Operation ID conflicts with a recovery or UI operation');
        if (operationId && operations.has(operationId) && operations.get(operationId).signature !== signature) {
          throw new Error('operation_id was already used with different parameters');
        }
        if (pending) {
          const reconciled = await reconcilePending();
          if (pending || (operationId && operationId === reconciled.operation_id) || signature === operations.get(reconciled.operation_id)?.signature) return reconciled;
        }
        if (operationId && operations.has(operationId)) {
          const previous = operations.get(operationId);
          if (previous.signature !== signature) throw new Error('operation_id was already used with different parameters');
          return structuredClone(previous.outcome);
        }
        const operation = { id: operationId ?? randomUUID(), action, signature, parameters: structuredClone(parameters) };
        let prepared;
        try { prepared = await invoke(operation, 'prepare', { signal }); }
        catch (error) { return failed(operation, 'PREFLIGHT_FAILED', String(error?.message ?? error).slice(0, 1000), 'FAILED'); }
        if (prepared.status !== 'NOT_APPLIED' || prepared.phase !== 'prepared' || !prepared.checkpoint?.workflow_ref) return prepared;
        operation.checkpoint = prepared.checkpoint;
        signal?.throwIfAborted();
        operation.deadline = now() + action.timeout_ms;
        await remember(operation, 'prepared');
        signal?.throwIfAborted();
        operations.set(operation.id, operation);
        pending = operation;
        observations.clear();
        let outcome;
        try {
          // Keep the browser gate until the bounded mutation reports completion,
          // even when its caller cancels. Cancellation never frees a live action.
          outcome = await invoke(operation, 'apply', { stopSignal: signal });
        } catch (error) {
          operation.transportUncertain = true;
          outcome = failed(operation, 'BROWSER_CALL_UNCERTAIN', String(error?.message ?? error).slice(0, 1000));
        }
        operation.outcome = outcome;
        operation.cleanupConfirmed = outcome.cleanup_complete === true;
        try { await remember(operation, 'completed', outcome); }
        catch (error) {
          operation.outcome = failed(operation, 'EVIDENCE_WRITE_FAILED', String(error?.message ?? error).slice(0, 1000));
          return operation.outcome;
        }
        if (outcome.status !== 'AMBIGUOUS' && operation.cleanupConfirmed) pending = null;
        return outcome;
      } finally { running = false; }
    },
  });
  const delivery=createArtifactDelivery({runtime,artifactStore,record:onRecord,now,
    admit:(id,signature)=>{
      if(!allowCandidate||!artifactStore)throw Error('Artifact delivery requires an authorized candidate session');
      if(nodeJobs.busy||running||pending)throw Error('Resolve the pending Dock operation before delivery');
      if(operations.has(id)||auxiliary.has(id)||operations.has(id+':upload')||auxiliary.has(id+':verify'))
        throw Error('Artifact delivery ID conflicts with an existing operation');
      auxiliary.set(id,{signature:'delivery:'+signature});
    },admitResume:(uploadId,resumeId,signature)=>{
      if(!allowCandidate||!artifactStore)throw Error('Delivery resume requires an authorized candidate session');
      if(nodeJobs.busy||running||pending&&pending.id!==uploadId)throw Error('Another Dock operation prevents delivery resume');
      if(operations.get(uploadId)?.action.capability!=='artifact.upload')throw Error('Original upload is absent from this session');
      if(operations.has(resumeId)||auxiliary.has(resumeId))throw Error('Resume ID conflicts with an existing operation');
      auxiliary.set(resumeId,{signature:'delivery-resume:'+signature});
    }});
  // Internal delivery calls retain the original runtime methods. The returned
  // facade prevents a second caller from changing UI between transfer stages.
  const readOnly=new Set(['describe','requestFailure','nodeApplyStatus','waitNodeApply']);
  const nodeControls=new Set([...readOnly,'startNodeApply','cancelNodeApply','stopNodeApply']);
  const exposed=Object.fromEntries(Object.entries(runtime).map(([name,value])=>[name,typeof value!=='function'||readOnly.has(name)?value:
    (...args)=>{
      if(delivery.busy){const error=Error('Artifact delivery is in progress');
        if(value.constructor.name==='AsyncFunction')return Promise.reject(error);throw error;}
      if(nodeJobs.busy&&!nodeControls.has(name)){const error=Error('A background node operation is running');
        if(value.constructor.name==='AsyncFunction')return Promise.reject(error);throw error;}
      return value(...args);
    }]));
  return Object.freeze({...exposed,
    deliverArtifact:(request,options)=>delivery.deliver(request,options),
    resumeArtifactDelivery:(request,options)=>delivery.resume(request,options),
    artifactDeliveryStatus:id=>delivery.status(id)});
}
