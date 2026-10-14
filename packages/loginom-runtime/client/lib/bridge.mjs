import {assertAmountCaptureProxy,beginAmountCaptureProxy,rejectAmountCaptureAwait} from '../../src/amount-capture-proxy.mjs';
import {captureControlledAmount,captureAmount} from '../../src/acceptance/amount-import-type-v1.mjs';
import {assertCaptureOwner,capturePublication,assertCapturePublication,freezeCaptureResult} from '../../src/retained-capture.mjs';
import {captureImportPreconfig,validateCaptureResult} from '../../src/acceptance/import-preconfig-adapter-v1.mjs';
import {captureData} from '../../src/retained-capture.mjs';
import {open as captureOpen,writeFile as captureWrite,fsync as captureSync,close as captureClose,rename as captureRename,fstat as captureFstat,constants as captureConstants} from 'node:fs';
import {originalPrepareLenderForSession} from '../../src/original-prepare-lender.mjs';
import {qualifyPreReadyRead} from "../../src/qualified-pre-ready.mjs";
import {makeFieldParametersNativeContextCode} from '../../src/acceptance/field-parameters-native-context.mjs';
import {nodeResultReply} from './node-result-reply.mjs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { readCatalog, combineCatalogs, connectRemote, selectToolGroups } from './catalog.mjs';
import { makeClipboardCode, runClipboardTransfer, createSerialGate, clipboardTool } from './clipboard.mjs';
import { createSkillLoader, skillTransport, skillUri, prepareTool } from './skill.mjs';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import {open as receiptOpen,writeFile as receiptWrite,fsync as receiptSync,close as receiptClose,rename as receiptRename,unlink as receiptUnlink,constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import { join } from 'node:path';
import { openArchive } from './archive.mjs';
import { diagnoseConnection } from './diagnostics.mjs';
import { pinActionCatalog, assertCatalogTarget, validateActionParameters } from './action-catalog.mjs';
import { createActionRuntime, parseCapabilityResult } from './executor.mjs';
import {createCandidateNodeSupport} from './node-support.mjs';
import {isNodeApiTool,dispatchNodeApi} from './node-api.mjs';
import { makeWorkspaceBootstrapCode, makeWorkspacePrepareCode, parseWorkspacePreparation, prepareWorkspaceSession, requirePreparedWorkspace, workspaceObserveTool } from './workspace.mjs';
import { makeBrowserGeometryCode, parseBrowserGeometry } from './browser-geometry.mjs';
import { createExecutionJournal } from './execution-journal.mjs';
import { createRecoveryContext } from './recovery-context.mjs';
import { outcomeVerification } from './outcome-verification.mjs';
import { createHostArtifactAdmission, codexInputIdentity } from './host-artifacts.mjs';
import { compactActionResult, compactNodeRequestFailure, userResultSchema, compactKnowledgeBundle, userWorkflowInstructions } from './user-results.mjs';
import { recordLocalDiagnostics } from './local-diagnostics.mjs';
import { createUserWorkflowBindings, userNodeTool, userActionTool, userActionInventory } from './user-workflow.mjs';
import { makePackageCleanupCode, parsePackageCleanupResult } from './package-cleanup.mjs';
import {makeSavedPackageStateCode,parseSavedPackageState,savedPackageStateAdvice} from './package-persistence.mjs';
import { createStorageBinding, requireStorageDestination, withStorageIdentity } from './storage-policy.mjs';

// Keep the runtime receipt byte-for-byte meaningful to reconciliation/journal
// consumers; recovery advice is a separate MCP content block, never an effect.
export function actionReply(outcome, { observe = false, userProfile = false } = {}) {
  // A rejected observation/action did not start a browser effect. The known
  // worker remains in control; do not turn ordinary waiting into recovery.
  if(userProfile&&outcome.request_rejected===true&&outcome.output?.active_node_job?.state==='running'
    &&typeof outcome.output.active_node_job.operation_id==='string'&&outcome.output.active_node_job.operation_id){
    const result=compactNodeRequestFailure(outcome);
    return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
  }
  const content = [{ type: 'text', text: JSON.stringify(outcome) }];
  const output = outcome.output;
  if (observe && outcome.status === 'SUCCEEDED' && typeof output?.observation_id === 'string'
      && output.observation_id && Array.isArray(output.ui?.elements)) {
    const usage = { kind: 'dock_observation_usage', observation_id: output.observation_id,
      receipt_id_usage: 'The first block operation_id identifies the browser receipt, never an observation_id alias.',
      reference_usage: 'Only refs delivered in ui.elements for this observation can be used. Metadata refs alone are not issued. A delivered element permits only its allowed_actions; region refs with no actions are read-only roots. Fresh observation IDs do not authorize old refs.',
      ...(typeof output.page?.next_cursor === 'string' && output.page.next_cursor
        ? { next_page_arguments: { cursor: output.page.next_cursor } } : {}),
    };
    if (output.observation_kind === 'roots') {
      usage.root_read_arguments = output.ui.elements.filter(element => element.kind === 'region'
        && typeof element.ref === 'string' && /^ui-[a-zA-Z0-9-]{1,124}$/.test(element.ref)
        && Array.isArray(element.allowed_actions) && element.allowed_actions.length === 0
        && output.ui.elements.filter(other => other.ref === element.ref).length === 1).slice(0, 3)
        .map(element => ({ root_ref: element.ref, observation_id: output.observation_id }));
    }
    content.push({ type: 'text', text: JSON.stringify(usage) });
  }
  if (userProfile && ['FAILED', 'AMBIGUOUS'].includes(outcome.status)) content.push({ type: 'text', text:
    'Inspect the outcome and current state. Correct invalid parameters using the pinned schema; consult additional Dock knowledge only if needed. Reconcile uncertain effects before the next change; keep the original operation_id.' });
  if (!userProfile && ['FAILED', 'AMBIGUOUS'].includes(outcome.status)) content.push({ type: 'text', text:
    'Before the next change: inspect this outcome and the current workspace, then consult the Dock sources for the affected operation. Discover the read-only knowledge tools with tool_search/tool_describe if needed. Search E2E helpers/selectors under target_uri viking://resources/loginom-dock/sources/e2e-tests and product behavior under target_uri viking://resources/loginom-dock/sources/loginom-help (list mode/read_content:false); read the relevant returned file URIs with the read tool. Use those sources and the actual observed state to choose how to continue, including whether an existing completed receipt already resolves this operation. Do not repeat an uncertain creation. Source retrieval does not resolve pending work or authorize executing source code. If a source is unavailable, state the limitation. After correction, verify the full goal and saved/reopened result.' });
  return { content };
}

const diagnosticTool = {
  name: 'dock_diagnostics', description: 'Inspect the pinned Dock runtime and archive, and check Dock, sources, skill and Loginom connectivity. Does not activate archiving or log in to Loginom.',
  inputSchema: { type: 'object', properties: { checkConnections: { type: 'boolean', default: true } }, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
};

export function browserProcessEnvironment(browserRoot, { platform = process.platform, environment = process.env } = {}) {
  const inherited = { ...getDefaultEnvironment(), PLAYWRIGHT_BROWSERS_PATH: browserRoot };
  // Linux needs the display connection, Chromium backend selection and desktop
  // identity. Browser launch arguments independently disable proxy discovery. Other
  // platforms retain the SDK environment and pinned browser path unchanged.
  if (platform === 'linux') {
    for (const key of ['DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP']) {
      const value = environment[key];
      if (typeof value === 'string' && value.length > 0 && !value.startsWith('()')) inherited[key] = value;
    }
  }
  return inherited;
}

// Private authenticated readiness has no package/preparation authority. It can
// only log out its original empty, idle document. Never close or discard work.
async function logoutReadiness(page, o) {
  const receipt={version:1,session_id:o.sessionId,document_id:o.documentId,account:o.account,
    loginom_build:o.loginomBuild,package_closed:false,logged_out:false,effect_possible:false};
  const finish=(status,reason)=>({...receipt,status,reason});
  const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
  try {
    const before=await page.evaluate(o=>{
      const own=globalThis.__loginomDockReadinessV1,app=globalThis.bg?.app;
      const m=app?.Application?.FInstance?.FMainForm?.FMapTree;
      if(!own || own.document!==document || own.documentId!==o.documentId || own.sessionId!==o.sessionId
          || own.account!==o.account || location.origin!==o.origin || own.loginomBuild!==o.loginomBuild
          || app?.Version!==o.loginomBuild || m?.FServerConnection?.UserName!==o.account
          || m.FServerConnection.Connected!==true) return {reason:'READINESS_IDENTITY_CHANGED'};
      if(own.logoutAttempted) return {reason:'READINESS_LOGOUT_ALREADY_ATTEMPTED',effect_possible:true};
      if(m.PackageNodes?.Count!==0 || m.HasRunningNodes()!==false) return {reason:'READINESS_NOT_EMPTY_IDLE'};
      const visible=e=>!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
      if([...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible))
        return {reason:'DIALOG_OR_OPERATION_OPEN'};
      own.logoutAttempted=true;
      return {allowed:true};
    },o);
    if(!before.allowed){receipt.effect_possible=before.effect_possible===true;return finish('BLOCKED',before.reason);}
    receipt.effect_possible=true;
    await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:8000});
    if((await at('MF;AppMenuForm;p.h;p.t').innerText()).trim()!==o.account) return finish('BLOCKED','LOGOUT_ACCOUNT_CHANGED');
    if(!await page.evaluate(o=>{
      const own=globalThis.__loginomDockReadinessV1,app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
      return own?.document===document&&own.documentId===o.documentId&&own.sessionId===o.sessionId
        &&location.origin===o.origin&&app?.Version===o.loginomBuild&&m?.PackageNodes?.Count===0
        &&m.FServerConnection.UserName===o.account&&m.FServerConnection.Connected===true&&m.HasRunningNodes()===false;
    },o)) return finish('BLOCKED','LOGOUT_INVENTORY_CHANGED');
    await at('MF;AppMenuForm;btnLogOut').click({timeout:8000});
    await at('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible',timeout:8000});
    if(await at('MF;cntMain;tlbMainToolbar;btnAvatar').isVisible()) return finish('BLOCKED','LOGOUT_UNCONFIRMED');
    receipt.logged_out=true;
    return {...finish('SUCCEEDED',null),packages_before:0,packages_after:0};
  }catch(error){return {...finish('BLOCKED','READINESS_LOGOUT_UNCONFIRMED'),rejection:
    error instanceof Error?{kind:'Error',name:error.name,message:error.message}:
      {kind:'value',value:error===undefined?null:error,is_undefined:error===undefined}};}
}
function shutdownRejection(value) {
  return value instanceof Error?{kind:'Error',name:value.name,message:value.message,
    ...('cause' in value?{cause:shutdownRejection(value.cause)}:{})}:
    {kind:'value',value:value===undefined?null:value,is_undefined:value===undefined};
}

export async function createBridge(config, session, { browserTransport: managedBrowserTransport, acceptanceCapture, authenticatedReadiness } = {}) {
  const capturePersistenceOrigin=Object.freeze({directory:session.directory,metadata:session.metadata,sessionId:session.metadata.sessionId});
  const capturePersistenceMetadata=capturePersistenceOrigin.metadata;
  const importAdmission=acceptanceCapture ? Object.freeze({binding:acceptanceCapture.binding,registration:acceptanceCapture.registration,
    retained:acceptanceCapture.retained,harness:acceptanceCapture.harness,amountControl:acceptanceCapture.amountControl}) : undefined;
  if(acceptanceCapture?.binding?.harness==='field-parameters-preservation-v1'&&config.mode!=='executor-replay')throw Error('LOGINOM_FP_EXECUTOR_REQUIRED');
  const prepareLender=originalPrepareLenderForSession(session);
  const lenderObserved=work=>prepareLender ? prepareLender.observed(work) : work();
  const admitHostArtifacts = createHostArtifactAdmission(config, session);
  const userProfile = config.resultProfile === 'user-v1';
  const userWorkflows = createUserWorkflowBindings();
  let userBundleDelivered = false;
  const logResult = async (tool, result) => {
    if (!userProfile || session.metadata.workspaceReady !== true) return;
    try { await recordLocalDiagnostics(config.stateDir, 'dock:' + session.metadata.sessionId,
      [{ event: 'tool.full_result', tool_name: tool, dock_session_id: session.metadata.sessionId, host_pid: process.pid, result }],
      { knownSecrets: [config.apiKey] }); }
    catch { session.metadata.localDiagnosticsIncomplete = true; }
  };
  let remote;
  const browser = new Client({ name: 'loginom-dock-browser', version: session.metadata.client });
  const remoteTransport = () => new StreamableHTTPClientTransport(new URL(config.endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${config.apiKey}` }, redirect: 'error' },
  });
  const browserTransport = managedBrowserTransport ?? new StdioClientTransport({
    command: process.execPath,
    args: [session.browserCli, '--config', session.browserConfig],
    env: browserProcessEnvironment(session.browserRoot),
    cwd: session.directory, stderr: 'pipe',
  });
  // The pinned SDK emits transport.onclose from the child-process 'close'
  // event. Protocol.connect chains any existing callback, so install ours first.
  let browserTransportEnded = false, resolveBrowserExit;
  const browserExited = new Promise(resolve => { resolveBrowserExit = resolve; });
  browserTransport.onclose = () => { browserTransportEnded = true; resolveBrowserExit(); };
  const awaitBrowserExit = async () => {
    if (browserTransportEnded) return;
    let timer;
    try { await Promise.race([browserExited, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]); }
    finally { clearTimeout(timer); }
  };
  // Browser stderr may contain page details; never persist or forward it to logs.
  browserTransport.stderr?.on('data', () => {});
  const closeClients = () => Promise.allSettled([remote?.close(), browser.close()]);
  const browserGate = createSerialGate();
  const heldLeases = new Set();
  const savedPackages = new Map();
  // Managed model runs derive teardown authority from guarded preparation and a
  // settled save on this bridge, never from a caller-supplied cleanup path.
  const managedCleanup = userProfile && config.mode === 'executor-replay';
  let managedSave, cleanupRefused = false;
  let confirmedCleanup, retainedNativeCleanup, cleanupShutdownBinding, cleanupReceiptWritten = false;
  const cleanupWriters=new Set();
  let cleanupEvidenceBinding,cleanupPersistencePrimary,cleanupPublication;
  const cleanupPersistenceFailures=[];
  let captureConsumed = false, captureInFlight, captureUnknown = false, captureRejected = false, captureRejection, captureEvidence;
  const captureWriters=new Set(),capturePersistenceFailures=[];
  const capturePublications=new Map(),capturePreparedRecords=new Map();
  let capturePersistencePrimary,captureEvidenceBinding,captureReceiptWritten=false,captureJournalWritten=false;
  let fpDraftRetained=false;
  let closing, shutdownStarted = false, shutdownStage;
  const skill = createSkillLoader({ directory: session.directory, transport: skillTransport(config) });
  let clipboardUncertain = false;
  let actionRuntime = null;
  let captureNodeOperation,diagnosticCapture,captureIOAssert;
  let pinnedActions = null;
  let recoveryContext = null;
  const recordExecution = createExecutionJournal({ directory: session.directory,
    metadata: session.metadata, knownSecrets: [config.apiKey] });
  try {
    const connections = await lenderObserved(async()=>{
      const results=await Promise.allSettled([connectRemote(() => ({ client: new Client({ name: 'loginom-dock', version: session.metadata.client }), transport: remoteTransport() })).then(client => { remote = client; }), browser.connect(browserTransport)]);
      const failure=results.find(result=>result.status==='rejected');
      if(failure)throw failure.reason;
      return results;
    });
    const failed = connections.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const [remoteTools, browserTools] = await lenderObserved(()=>Promise.all([readCatalog(remote), readCatalog(browser)]));
    if (!browserTools.some(tool => tool.name === 'browser_run_code_unsafe')) {
      throw new Error('The pinned browser runtime lacks the verified clipboard execution tool');
    }
    if (['executor-preview', 'executor-replay'].includes(config.mode)) {
      const replay = config.mode === 'executor-replay';
      const pinned = await lenderObserved(()=>pinActionCatalog(remote, { runtimeIdentity: session.metadata, ...(replay ? {
        manifestUri: config.actionManifestUri, manifestSha256: config.actionManifestSha256, allowCandidate: true,
      } : {}) }));
      pinnedActions = pinned;
      recoveryContext = createRecoveryContext({ remote, pinned, knownSecrets: [config.apiKey] });
      Object.assign(session.metadata, pinned.pins);
      const fpBinding=acceptanceCapture?.binding?.harness==='field-parameters-preservation-v1'?acceptanceCapture.binding:null;
      const fieldParametersCapture=fpBinding?{binding:fpBinding,context:async operation=>{
        fpDraftRetained=true; // native/typed FP attempt keeps the original transport, even before delivery
        const prepared=session.metadata.workspacePreparation,state=prepared?.state,request=operation.nodeApply?.request,node=operation.nodeApply?.node;
        const retained=actionRuntime.fieldParametersState(operation.id);
        if(shutdownStarted||clipboardUncertain||heldLeases.size||Date.now()>=Math.min(fpBinding.expires,operation.deadline)||session.metadata.workspaceReady!==true
          ||fpBinding.session!==session.metadata.sessionId||!prepared?.attempted||!managedSave
          ||managedSave.sessionId!==fpBinding.session||managedSave.documentId!==state?.document_id
          ||state?.loginom_account!==fpBinding.account||managedSave.tabTid!==state?.workflow_ref?.tab_tid
          ||managedSave.loginomBuild!==session.metadata.targetIdentity?.loginom_build||managedSave.account!==fpBinding.account||managedSave.packagePath!==fpBinding.packagePath
          ||!savedPackages.has(fpBinding.packagePath)||request?.target.type!=='transform.reform_columns'
          ||request.document_id!==state.document_id||request.workflow_ref.workflow_id!==state.workflow_ref.workflow_id
          ||!node||!retained.owned||retained.foreign_pending||retained.unknown||retained.delivery_unsettled
          ||retained.pending_phase!=='configure')throw Error('LOGINOM_FP_RETAINED_AUTHORITY_UNKNOWN');
        const identity={session_id:fpBinding.session,account:fpBinding.account,package_path:fpBinding.packagePath,
          document_id:request.document_id,workflow_id:request.workflow_ref.workflow_id,node_id:node.node_id,type:request.target.type,input_port:0};
        const options={prepared:{document_id:request.document_id,workflow_ref:request.workflow_ref,node},
          account:fpBinding.account,packagePath:fpBinding.packagePath,origin:new URL(config.loginomUrl).origin,loginomBuild:session.metadata.targetIdentity.loginom_build,operationId:operation.id};
        const raw=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code:makeFieldParametersNativeContextCode(options)}},undefined,{timeout:Math.max(1,Math.min(15000,fpBinding.expires-Date.now()))});
        if(Date.now()>=Math.min(fpBinding.expires,operation.deadline)||session.metadata.workspacePreparation!==prepared||managedSave.documentId!==identity.document_id||!actionRuntime.fieldParametersState(operation.id).owned)throw Error('LOGINOM_FP_LATE_AUTHORITY_REFUSED');
        const result=parseCapabilityResult(raw);if(result.action_key!=='acceptance.fp.context'||result.action_revision!=='1'||result.phase!=='read'||result.operation_id!==operation.id||result.effect_possible!==false)throw Error('LOGINOM_FP_NATIVE_REPLY_REFUSED');if(result.status==='FAILED'&&result.operation_id===operation.id&&result.output?.rejection){const restore=r=>r.kind==='value'?(r.is_undefined?undefined:r.value):Object.assign(new Error(r.message, 'cause' in r?{cause:restore(r.cause)}:undefined),{name:r.name});throw restore(result.output.rejection);}
        if(result.status!=='SUCCEEDED'||result.cleanup_complete!==true||result.effect_possible!==false
          ||result.operation_id!==operation.id||!['account','package_path','document_id','workflow_id','node_id'].every(k=>result.output?.[k]===identity[k])||!Number.isSafeInteger(result.output?.observed_at)
          ||result.output.dirty!==false||result.output.running!==false)throw Error('LOGINOM_FP_NATIVE_RESOURCE_UNKNOWN');
        return {binding:fpBinding,identity,resources:{...fpBinding,...identity,...result.output,
          deadline:fpBinding.expires,pending:retained.foreign_pending,unsettled:retained.delivery_unsettled,unknown_effect:retained.unknown}};
      }}:undefined;
      actionRuntime = createActionRuntime({ pinned,fieldParametersCapture,
        ...(replay?createCandidateNodeSupport({targetOrigin:config.loginomUrl?new URL(config.loginomUrl).origin:undefined,targetBuild:pinned.compatibility?.loginom_build,storageDirectories:config.storageDirectories}):{}),
        getStorageBinding: () => session.metadata.storageBinding ?? null,
        getNodeContractPins: () => ({...pinned.pins, skillRevision:session.metadata.skillRevision, loginomProfile:session.metadata.targetIdentity ?? pinned.compatibility}),
        artifactStore:session.artifactStore, allowCandidate: replay, onRecord: recordExecution,
        targetOrigin: config.loginomUrl ? new URL(config.loginomUrl).origin : undefined, execute: async (code, options) => {
        const response = await browser.callTool({ name: 'browser_run_code_unsafe', arguments: {
          code: config.storageDirectories ? withStorageIdentity(code, session.metadata.storageBinding) : code,
        } }, undefined, options);
        return parseCapabilityResult(response);
      } });
    }
    const groups = selectToolGroups(config.mode ?? 'classic', {
      remoteTools, browserTools,
      commonLocalTools: [diagnosticTool, clipboardTool, prepareTool],
      executorLocalTools: [diagnosticTool, prepareTool, workspaceObserveTool, ...(actionRuntime?.tools ?? [])],
    });
    if (userProfile) {
      groups.remote=groups.remote.filter(tool=>['find','search','read','grep','glob','list','tree'].includes(tool.name));
      groups.local=groups.local.filter(tool=>!['dock_ui_action','dock_artifact_upload','dock_artifact_verify'].includes(tool.name))
        .map(tool=>isNodeApiTool(tool.name)?{...userNodeTool(tool),outputSchema:userResultSchema}:userActionTool(tool));
    }
    const catalog = combineCatalogs(groups);
    if (actionRuntime) {
      catalog.routes.set('dock_action_describe', 'action');
      catalog.routes.set('dock_action_run', 'action');
      catalog.routes.set('dock_workspace_observe', 'action');
      for (const name of ['dock_operation_inspect', 'dock_operation_recover', 'dock_ui_action', 'dock_artifact_upload', 'dock_artifact_verify'])
        if(catalog.tools.some(t=>t.name===name))catalog.routes.set(name,'action');
      for(const tool of actionRuntime.tools.filter(tool=>isNodeApiTool(tool.name)))catalog.routes.set(tool.name,'action');
    }
    await lenderObserved(()=>session.save(catalog));
    const server = new Server({ name: 'loginom-dock', version: session.metadata.client }, {
      capabilities: { tools: {} },
      instructions: userProfile ? 'Call dock_prepare, then get the selected node parameter schema with dock_action_describe. Use dock_artifact_deliver for attachments and dock_node_apply for each complete node lifecycle. Keep issued identities and wait on the original operation_id. Follow next_step on failure; inspect uncertain effects before continuing. Save the package at the end. Low-level UI actions are unavailable in this profile.' : ['executor-preview', 'executor-replay'].includes(config.mode)
        ? `This process is pinned to ${config.mode}. Call dock_prepare. Plan and complete the user's goal using verified actions plus dock_workspace_observe and bounded dock_ui_action gestures. An action failure is feedback: inspect, diagnose, repair in this same session, verify and continue. For AMBIGUOUS call dock_operation_inspect; bind UI repairs to the pending operation or use dock_operation_recover. Never bypass uncertain in-flight work with a new ID. Raw JavaScript/browser tools are unavailable; the mode cannot change during this session.`
        : 'Call dock_prepare before Loginom work to load the verified full skill into the current context. Dock provides shared knowledge and a local browser. Source files and live DOM take precedence over recalled context. All clipboard copy/paste must use dock_clipboard_transfer so other Dock sessions cannot overwrite it during the operation. The installed native adapter activates shared session archiving after successful preparation. Check dock_diagnostics for actual archive activation and delivery state.',
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: structuredClone(catalog.tools) }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      if (shutdownStarted) throw new McpError(ErrorCode.InvalidRequest, 'Dock shutdown has started');
      const owner = catalog.routes.get(request.params.name);
      if (!owner) throw new McpError(ErrorCode.InvalidParams, 'Unknown Dock tool');
      if ((cleanupRefused || captureInFlight) && owner !== 'remote' && !['dock_diagnostics','dock_workspace_observe',
        'dock_operation_inspect','dock_node_status','dock_node_wait','tool_search','tool_describe'].includes(request.params.name))
        throw new McpError(ErrorCode.InvalidRequest, 'Package cleanup is unconfirmed; only read-only diagnosis is allowed');
      if (request.params.name === 'dock_diagnostics') {
        let archive = null;
        try { archive = JSON.parse(await readFile(join(session.directory, 'archive.json'), 'utf8')); } catch {}
        if (archive?.serverSession) {
          const queue = await openArchive(config);
          try {
            archive.delivery = queue.deliveryStatus(archive.serverSession);
            archive.pendingEvents = archive.delivery.pending_events;
            archive.installationPendingEvents = queue.pendingCount();
          }
          finally { queue.close(); }
        }
        session.metadata.archiveActive = archive?.active === true;
        const connection = request.params.arguments?.checkConnections === false ? null : await diagnoseConnection(config);
        return { content: [{ type: 'text', text: JSON.stringify({
        ...session.metadata, endpoint: config.endpoint, loginomUrl: config.loginomUrl, toolCatalogSha256: catalog.sha256,
        remoteTools: remoteTools.length, browserTools: browserTools.length,
        clipboardTransferAvailable: !actionRuntime, clipboardUncertain, archive, connection,
      }) }] };
      }
      try {
        if (request.params.name === 'dock_prepare') {
          let args = request.params.arguments ?? {};
          validateActionParameters(prepareTool.inputSchema, args);
          if (userProfile) args = userWorkflows.normalizePreparation(args);
          await admitHostArtifacts(args.host_context_token, codexInputIdentity(request.params));
          const preparationRequest = { operation_id: args.operation_id ?? 'prepare', intent: args.intent ?? 'new_draft',
            package_path: args.package_path ?? null, workflow_ref: args.workflow_ref ?? null };
          if (config.storageDirectories && preparationRequest.package_path)
            requireStorageDestination(preparationRequest.package_path, config.storageDirectories, 'packages');
          const workspaceOptions = actionRuntime ? { loginomUrl: config.loginomUrl,
            compatibility: pinnedActions.compatibility, sessionId: session.metadata.sessionId,
            operationId: preparationRequest.operation_id, intent: preparationRequest.intent,
            packagePath: preparationRequest.package_path, workflowRef: preparationRequest.workflow_ref, timeoutMs: args.timeout_ms ?? 120000,
            allowTestLogin: config.mode === 'executor-replay' && config.replayBootstrap, testLoginUser: config.replayLoginUser } : null;
          if (workspaceOptions) makeWorkspacePrepareCode(workspaceOptions);
          const prepared = await skill.prepare();
          session.metadata.skillRevision = prepared.detail.revision;
          session.metadata.skillPath = prepared.main;
          let workspace = null;
          if (actionRuntime) {
            workspace = await browserGate(async () => {
              const state = await prepareWorkspaceSession({ metadata: session.metadata,
              request: preparationRequest, signal: extra.signal,
              assertAllowed() { extra.signal.throwIfAborted(); actionRuntime.assertPreparationAllowed(); },
              async prepare({ recoverOnly }) {
                if (!config.loginomUrl) throw new Error('Workspace preparation requires the configured Loginom URL');
                const code = makeWorkspacePrepareCode({ ...workspaceOptions, recoverOnly });
                const response = await browser.callTool({ name: 'browser_run_code_unsafe', arguments: { code } }, undefined, { timeout: 125000 });
                const state = parseWorkspacePreparation(response);
                if (state.status === 'READY') {
                  if (config.storageDirectories) session.metadata.storageBinding = createStorageBinding({
                    sessionId: session.metadata.sessionId, origin: new URL(config.loginomUrl).origin,
                    build: state.target.loginom_build, documentId: state.document_id,
                    account: state.loginom_account, directories: config.storageDirectories,
                  });
                  const geometry = await browser.callTool({ name: 'browser_run_code_unsafe', arguments: {
                    code: makeBrowserGeometryCode({ session_id: session.metadata.sessionId,
                      operation_id: state.operation_id, document_id: state.document_id,
                      runtime_revision: session.metadata.clientRevision,
                      manifest_sha256: session.metadata.actionManifestDigest,
                      workflow_ref: state.workflow_ref }),
                  } }, undefined, { timeout: 15000 });
                  state.browser_geometry = parseBrowserGeometry(geometry);
                }
                return state;
              },
              assertTarget: target => assertCatalogTarget(pinnedActions, target), record: recordExecution,
              save: () => session.save(catalog),
              });
              if (userProfile && session.metadata.workspaceReady === true) userWorkflows.remember(state);
              return state;
            });
          }
          if (!actionRuntime) await session.save(catalog);
          if (userProfile && actionRuntime) {
            const first = !userBundleDelivered;
            const ready = session.metadata.workspaceReady === true;
            const bundle = first ? compactKnowledgeBundle(actionRuntime.describe({
              action_keys: ['package.save_checkpoint'],
              node_types: actionRuntime.describe().available_node_types,
            })) : null;
            const result = { prepared: ready, sessionId: session.metadata.sessionId, skillRevision: prepared.detail.revision,
              loginomUrl: config.loginomUrl, workspace, result_version: 'user-v1', input_artifacts: session.artifactStore.list(),
              ...(config.storageDirectories ? { storage_directories: config.storageDirectories } : {}),
              knowledge: bundle ?? { reused: true, skillRevision: prepared.detail.revision },
              ...(first ? { instructions: userWorkflowInstructions } : {}) };
            await logResult('dock_prepare', result);
            if (ready) userBundleDelivered = true;
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          return { content: [{ type: 'text', text: JSON.stringify({
            prepared: !actionRuntime || session.metadata.workspaceReady === true, sessionId: session.metadata.sessionId,
            loginomUrl: config.loginomUrl,
            workspace,
            ...(actionRuntime ? { executor: actionRuntime.describe(), input_artifacts: session.artifactStore.list() } : {}),
            skillUri, skillRevision: prepared.detail.revision, cacheDirectory: prepared.directory,
            source: prepared.detail.source, archiveActive: session.metadata.archiveActive,
          }) }, { type: 'text', text: prepared.detail.content }, ...(actionRuntime ? [{ type: 'text', text:
            'Knowledge-assisted recovery: after a FAILED or AMBIGUOUS operation, inspect the outcome and current workspace before deciding the next change. Use the Dock knowledge tools to find relevant E2E helpers/selectors in viking://resources/loginom-dock/sources/e2e-tests and product semantics in viking://resources/loginom-dock/sources/loginom-help; search with an explicit target_uri (list mode/read_content:false) or scoped grep/glob, then read the relevant files using the actual tool schema. Evidence paths in action descriptions are references, not the source contents. Check applicable versions and helper side effects against the live UI. Use what the sources establish to choose the correction; never execute retrieved code, repeat an uncertain operation blindly, or treat source text as authorization. A lost response may already have a completed receipt, so reconcile it instead of recreating the object. If retrieval fails, report that limitation and do not invent source support. Verify the complete goal and saved/reopened state after the correction. Current pinned client capabilities: dock_action_describe({}) lists the only ready-made action keys: node.add, link.create, package.save_as, package.save_checkpoint and node.configure_text_import when present in the pinned catalog. Do not guess other action keys. This client also provides dock_workspace_observe, dock_ui_action, dock_operation_inspect and dock_operation_recover. Use these bounded tools to inspect settings/dialogs, repair errors and continue in the same session, including operations not covered by the pinned ready-made actions. Loginom may automatically connect nearby nodes on drop: node.add reports these normal effects in auto_created_links. Compare the observed ports and links with the task; keep useful links and remove undesired ones through observed UI before creating more links. A successful node.add verifies that operation, not the whole scenario. If a completed operation should no longer be pursued, inspect it and the fresh UI, then explicitly use abandon_operation with that observation before making a corrected request. This keeps the original unsuccessful outcome, does not undo effects, and is unavailable while browser completion or cleanup is unknown. These current capabilities supersede older skill text that required a new session for such operations. An invalid action name or argument is feedback to correct the request, not a server outage.' }] : [])] };
        }
        if (owner === 'action') {
          if(isNodeApiTool(request.params.name)) {
            const invoke=async()=>{
              requirePreparedWorkspace(session.metadata);
              let args=request.params.arguments??{};
              if(userProfile && ['dock_node_apply','dock_node_resume','dock_node_read'].includes(request.params.name)) {
                validateActionParameters(userNodeTool(actionRuntime.tools.find(tool=>tool.name===request.params.name)).inputSchema,args);
                if(request.params.name==='dock_node_apply')args=userWorkflows.expandNode(args);
                if(request.params.name==='dock_node_read')args=userWorkflows.expandNodeRead(args);
              }
              const result=await dispatchNodeApi(actionRuntime,request.params.name,args,{signal:extra.signal});
              if(acceptanceCapture?.registration && request.params.name==='dock_node_apply')captureNodeOperation=args.operation_id;
              if(userProfile)userWorkflows.rememberDelivery(result,args);
              await logResult(request.params.name,result);
              return nodeResultReply(result,{userProfile});
            };
            // Local lifecycle calls must remain available while another request is
            // awaiting browser work. The runtime owns exclusion through cleanup.
            const local=['dock_node_status','dock_node_wait','dock_node_cancel','dock_node_stop','dock_artifact_delivery_status'].includes(request.params.name);
            return await (local?invoke():browserGate(invoke));
          }
          if (request.params.name === 'dock_action_describe') {
            if(userProfile){
              const args=request.params.arguments??{},keys=args.action_keys??(args.action_key?[args.action_key]:[]);
              if(keys.some(key=>!['package.save_as','package.save_checkpoint'].includes(key)))throw Error('Use dock_node_apply for supported nodes; request node_types for the selected parameter schema. Low-level actions require the diagnostic profile.');
            }
            const description=actionRuntime.describe(request.params.arguments ?? {});
            return { content: [{ type: 'text', text: JSON.stringify(userProfile?userActionInventory(description):description) }] };
          }
          return await browserGate(async () => {
            extra.signal.throwIfAborted();
            const args = request.params.arguments ?? {};
            if(userProfile&&request.params.name==='dock_action_run'&&!['package.save_as','package.save_checkpoint'].includes(args.action_key))
              throw Error('Use dock_node_apply for supported nodes. Low-level actions require the diagnostic profile.');
            if(['dock_artifact_upload','dock_artifact_verify'].includes(request.params.name)) {
              const definition=actionRuntime.tools.find(tool=>tool.name===request.params.name);
              if(!definition)throw new Error('Artifact upload is unavailable in this session');
              validateActionParameters(definition.inputSchema,args);
            }
            if (!(request.params.name === 'dock_workspace_observe' && args.scope === 'bootstrap')) requirePreparedWorkspace(session.metadata);
            const outcome = request.params.name === 'dock_workspace_observe' ? await actionRuntime.observe({ signal: extra.signal, scope: args.scope, cursor: args.cursor, rootRef: args.root_ref, observationId: args.observation_id, storageName: args.storage_name })
              : request.params.name === 'dock_operation_inspect' ? await actionRuntime.inspect({ operationId: args.operation_id, signal: extra.signal })
                : request.params.name === 'dock_operation_recover' ? await actionRuntime.recover(args.operation_id,
                  { strategy: args.strategy, recoveryOperationId: args.recovery_operation_id, observationId: args.observation_id, signal: extra.signal })
                  : request.params.name === 'dock_artifact_verify' ? await actionRuntime.verifyArtifact({operationId:args.operation_id,verificationId:args.verification_id,
                    observationId:args.observation_id,fileRef:args.file_ref,signal:extra.signal})
                  : request.params.name === 'dock_artifact_upload' ? await actionRuntime.upload({artifactId:args.artifact_id,grantId:args.upload_grant_id,
                    observationId:args.observation_id,operationId:args.operation_id,signal:extra.signal})
                  : request.params.name === 'dock_ui_action' ? await actionRuntime.uiAct(args.action,
                    { observationId: args.observation_id, operationId: args.operation_id, recoveryOperationId: args.recovery_operation_id, signal: extra.signal })
                    : await actionRuntime.run(args.action_key, args.parameters, { signal: extra.signal, operationId: args.operation_id });
            await logResult(request.params.name,outcome);
            if (outcome.status === 'SUCCEEDED' && ['package.save_as','package.save_checkpoint'].includes(outcome.action_key)
                && outcome.output?.package_ref?.path) savedPackages.set(outcome.output.package_ref.path, outcome.operation_id);
            if (managedCleanup && outcome.status === 'SUCCEEDED' && outcome.cleanup_complete === true
                && ['package.save_as','package.save_checkpoint'].includes(outcome.action_key) && outcome.output?.package_ref?.path) {
              const prepared=session.metadata.workspacePreparation?.state;
              managedSave={operationId:outcome.operation_id, sessionId:session.metadata.sessionId,
                documentId:prepared?.document_id, tabTid:prepared?.workflow_ref?.tab_tid,
                account:prepared?.loginom_account, packagePath:outcome.output.package_ref.path,
                loginomUrl:config.loginomUrl, loginomBuild:session.metadata.targetIdentity?.loginom_build};
            }
            if (userProfile && outcome.status === 'SUCCEEDED' && ['package.save_as','package.save_checkpoint'].includes(outcome.action_key))
              for (const continuation of outcome.output?.workflow_continuations ?? []) userWorkflows.remember(continuation);
            const reply = actionReply(userProfile?compactActionResult(outcome):outcome, { observe: request.params.name === 'dock_workspace_observe', userProfile });
            if(outcome.status==='SUCCEEDED'&&['package.save_as','package.save_checkpoint'].includes(outcome.action_key)&&outcome.output?.package_ref?.path){
              // Save As can reopen a package that Loginom immediately marks
              // modified. Report this while the model can still checkpoint it,
              // rather than discovering it only during isolated shutdown.
              try{
                const prepared=session.metadata.workspacePreparation?.state;
                const options={sessionId:session.metadata.sessionId,documentId:prepared?.document_id,
                  account:prepared?.loginom_account??config.replayLoginUser,packagePath:outcome.output.package_ref.path,
                  loginomUrl:config.loginomUrl,loginomBuild:session.metadata.targetIdentity.loginom_build};
                const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code:makeSavedPackageStateCode(options)}},undefined,{timeout:15000});
                const state=parseSavedPackageState(response,options),advice=savedPackageStateAdvice(state,outcome);
                await recordExecution({phase:'saved_package_state_observed',operation_id:outcome.operation_id,state,advice});
                reply.content.push({type:'text',text:JSON.stringify(advice)});
              }catch{
                // A read failure must not erase the completed save or invite
                // a retry of an uncertain save gesture.
                reply.content.push({type:'text',text:JSON.stringify({kind:'dock_saved_package_state',save_operation_id:outcome.operation_id,
                  package_path:outcome.output.package_ref.path,modified:null,state:'unavailable',
                  instruction:'The save receipt remains valid, but the current open package dirty state could not be verified. Do not claim that session cleanup is confirmed.'})});
              }
            }
            try {
              const verification = outcomeVerification(outcome, pinnedActions.actions.get(outcome.action_key));
              await recordExecution({ phase: 'verification_delivered', operation_id: outcome.operation_id, verification });
              reply.content.push({ type: 'text', text: JSON.stringify(verification) });
            } catch {
              reply.content.push({ type: 'text', text: 'Verification explanation unavailable; retain the original operation receipt. This does not establish goal completion.' });
            }
            try {
              const context = userProfile ? null : await recoveryContext(outcome);
              if (context) {
                await recordExecution({ phase: 'knowledge_context_delivered', operation_id: outcome.operation_id, context });
                reply.content.push({ type: 'text', text: JSON.stringify(context) });
              }
            } catch {
              // Knowledge/journal failure cannot erase a completed browser receipt.
              reply.content.push({ type: 'text', text: 'Recovery context unavailable; keep the operation receipt and inspect the actual state.' });
            }
            return reply;
          });
        }
        if (owner === 'remote') return await remote.callTool(request.params, undefined, {
          signal: extra.signal, timeout: 360000,
        });
        return await browserGate(async () => {
          extra.signal.throwIfAborted();
          if (clipboardUncertain) throw new Error('Clipboard completion is uncertain; restart this Dock client before further browser operations');
          if (request.params.name !== 'dock_clipboard_transfer') {
            return browser.callTool(request.params, undefined, { signal: extra.signal, timeout: 360000 });
          }
          const { code, token } = makeClipboardCode(request.params.arguments);
          const confirmed = await runClipboardTransfer({
            token, leases: heldLeases, signal: extra.signal,
            onUncertain: () => { clipboardUncertain = true; },
            // Once copy starts, cancellation cannot free the host lease while
            // the browser may still paste. Shutdown releases retained leases.
            execute: () => browser.callTool({ name: 'browser_run_code_unsafe', arguments: { code } }, undefined, { timeout: 360000 }),
          });
          if (!confirmed) return { isError: true, content: [{ type: 'text', text: 'Paste was not confirmed. The clipboard lock is retained; restart this Dock client before further browser operations.' }] };
          return { content: [{ type: 'text', text: 'Copy and paste completed; the target DOM confirmed the result.' }] };
        });
      } catch (error) {
        const message = String(error.message).replaceAll(config.apiKey, '[redacted]');
        if (owner === 'action') {
          const failure=actionRuntime.requestFailure(new Error(message));
          if(userProfile)failure.output=userActionInventory(failure.output);
          if(userProfile&&isNodeApiTool(request.params.name)){
            const result=compactNodeRequestFailure(failure,request.params.arguments);
            if(!result.effect_possible&&result.next_step.tool==='dock_node_apply')result.next_step.tool=request.params.name==='dock_node_resume'?'dock_node_apply':request.params.name;
            return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
          }
          const reply=actionReply(failure,{userProfile});
          // A rejected request is not a job snapshot. Preserve its recovery data
          // as an MCP error; outputSchema applies to successful tool responses.
          if(isNodeApiTool(request.params.name))reply.isError=true;
          return reply;
        }
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    });
    async function closeCaptureWriter(file) {
      if(file.closeComplete)return;
      if(file.io?.pending)throw Error('LOGINOM_CAPTURE_WRITER_IO_UNKNOWN');
      if(file.closeStarted)throw file.closeFailure?file.closeFailure.value:Error('LOGINOM_CAPTURE_WRITER_CLOSE_UNKNOWN');
      file.closeStarted=true;file.closePending=true;let projection,callbackSettled=false;
      const completion=new Promise((resolve,reject)=>{
        try{projection=captureClose(file.fd,error=>{
          callbackSettled=true;
          if(error===null||error===undefined)resolve();else reject(error);
        })}catch(value){
          if(callbackSettled)projection=Promise.reject(value);else reject(value);
        }
      });
      const observe=promise=>Promise.resolve(promise).catch(value=>{
        if(file.closeFailure)file.closeSecondary??={value};else file.closeFailure={value};
        throw value;
      });
      const owned=[observe(completion),observe(projection)];
      file.closeSettlement=Promise.allSettled(owned).then(results=>{
        // A callback alone, or a throw without that callback, is not settlement.
        if(callbackSettled){
          file.closePending=false;
          if(results.every(result=>result.status==='fulfilled'))file.closeComplete=true;
        }
      });
      try{await Promise.all(owned)}catch(value){throw file.closeFailure.value}
      await file.closeSettlement;
      if(!file.closeComplete)throw Error('LOGINOM_CAPTURE_WRITER_CLOSE_UNKNOWN');
    }
    function rememberCapturePersistence(value,phase) {
        capturePersistencePrimary??={phase,value};
        capturePersistenceFailures.push({phase,rejection:shutdownRejection(value)});
        const metadata=captureEvidenceBinding?.metadata??capturePersistenceMetadata;
        metadata.capturePersistencePrimary??={phase:capturePersistencePrimary.phase,
          rejection:shutdownRejection(capturePersistencePrimary.value)};
        metadata.capturePersistenceFailures=capturePersistenceFailures;
    }
    async function drainCaptureWriters() {
      if([...capturePublications.values()].some(p=>p.pending || p.renamed && !p.succeeded)){
        rememberCapturePersistence(Error('LOGINOM_CAPTURE_RENAME_UNKNOWN'),'rename');
        throw capturePersistencePrimary.value;
      }
      for(const file of captureWriters){
        // A settled rejected exclusive open acquired no FD; it is not a close.
        if(file.claim && file.openRejected && file.fd===undefined && file.io?.pending===false){
          captureWriters.delete(file);continue;
        }
        if(!file.closeStarted&&file.openComplete&&file.fd!==undefined){
          try{await closeCaptureWriter(file)}catch(value){file.closeFailure??={value};rememberCapturePersistence(value,'retained_close')}
        }
        if(!file.closeComplete){
          rememberCapturePersistence(file.closeFailure?file.closeFailure.value:Error('LOGINOM_CAPTURE_WRITER_CLOSE_UNKNOWN'),'retained_close');
          throw capturePersistencePrimary.value;
        }
        captureWriters.delete(file);
      }
    }
    async function writeCaptureEvidence(name,bytes) {
      assertCaptureEvidenceBinding();captureIOAssert?.();
      const original=captureEvidenceBinding??Object.freeze({directory:session.directory,
        metadata:capturePersistenceMetadata,sessionId:capturePersistenceMetadata.sessionId});
      const current=()=>{
        assertCaptureEvidenceBinding();captureIOAssert?.();
        if(session.directory!==original.directory || session.metadata!==original.metadata
            || session.metadata.sessionId!==original.sessionId)
          throw Error('LOGINOM_CAPTURE_EVIDENCE_BINDING_CHANGED');
      };
      current();
      let publication=capturePublications.get(name);
      if(publication && (publication.bytes!==bytes || publication.directory!==original.directory
          || publication.metadata!==original.metadata || publication.sessionId!==original.sessionId))
        throw Error('LOGINOM_CAPTURE_PUBLICATION_BINDING_CHANGED');
      await drainCaptureWriters();current();
      if(!publication){
        publication={pending:false,prepared:false,succeeded:false,renamed:false,bytes,
          directory:original.directory,metadata:original.metadata,sessionId:original.sessionId,
          temporary:join(original.directory,'.'+name+'-'+randomUUID()+'.tmp')};
        capturePublications.set(name,publication);capturePreparedRecords.set(name,publication);
      }
      if(capturePreparedRecords.get(name)!==publication)throw Error('LOGINOM_CAPTURE_PUBLICATION_BINDING_CHANGED');
      const pathIdentity=async(path,identity,directory=false)=>{
        current();const stat=await lstat(path);current();
        if(stat.isSymbolicLink() || (directory?!stat.isDirectory():!stat.isFile())
            || identity && (stat.dev!==identity.dev || stat.ino!==identity.ino || stat.uid!==identity.uid
              || !directory && (stat.size!==identity.size || stat.nlink!==1 || (stat.mode&0o777)!==0o600)))
          throw Error('LOGINOM_CAPTURE_PUBLICATION_BINDING_CHANGED');
        return Object.freeze({dev:stat.dev,ino:stat.ino,size:stat.size,uid:stat.uid});
      };
      publication.directoryIdentity??=await pathIdentity(publication.directory,undefined,true);
      const assertDestinationSlot=async()=>{
        current();let existing;
        try{existing=await lstat(join(publication.directory,name))}
        catch(value){if(value?.code!=='ENOENT')throw value}
        current();
        // An unowned existing receipt is never replaced. A directory can only
        // produce the kernel's file-to-directory refusal, without replacement.
        if(existing && !existing.isDirectory() && (!publication.claim?.identity
            || existing.dev!==publication.claim.identity.dev || existing.ino!==publication.claim.identity.ino
            || existing.uid!==publication.claim.identity.uid || existing.size!==0
            || existing.nlink!==1 || (existing.mode&0o777)!==0o600))
          throw Error('LOGINOM_CAPTURE_PUBLICATION_EXISTS');
      };
      if(!publication.file)await assertDestinationSlot();
      const persist=async(path,mode,write)=>{
        const claiming=write==='claim';write=write===true;
        const file={fd:undefined,closeComplete:false};captureWriters.add(file);
        if(write)publication.file=file;
        if(claiming){file.claim=true;publication.claim=file;}
        let phase=claiming?'claim_open':write?'file_open':'directory_open',primary;
        const failed=value=>{primary??={phase,value};rememberCapturePersistence(value,phase)};
        const callback=invoke=>{
          current();const operation={pending:true,phase};file.io=operation;let projection,callbackSettled=false;
          const completion=new Promise((resolve,reject)=>{
            try{projection=invoke((error,result)=>{
              callbackSettled=true;
              if(error!==null&&error!==undefined)reject(error);else resolve(result);
            })}catch(value){if(callbackSettled)projection=Promise.reject(value);else reject(value)}
          });
          const observe=promise=>Promise.resolve(promise).catch(value=>{
            if(operation.primary)operation.secondary??={value};else operation.primary={value};
            throw value;
          });
          const owned=[observe(completion),observe(projection)];
          operation.settlement=Promise.allSettled(owned).then(results=>{
            if(callbackSettled){operation.pending=false;operation.succeeded=results.every(r=>r.status==='fulfilled')}
          });
          return Promise.all(owned).then(async([result])=>{await operation.settlement;current();return result},value=>{throw operation.primary.value});
        };
        try{
          await callback(done=>captureOpen(path,mode,0o600,(error,fd)=>{
            file.openComplete=true;file.openRejected=error!==null&&error!==undefined;
            if(!file.openRejected)file.fd=fd;done(error,fd);
          }));
          if(write){phase='file_write';await callback(done=>captureWrite(file.fd,bytes,done))}
          else if(!claiming){
            phase='directory_identity';const stat=await callback(done=>captureFstat(file.fd,done));
            if(!stat.isDirectory() || stat.dev!==publication.directoryIdentity.dev
                || stat.ino!==publication.directoryIdentity.ino || stat.uid!==publication.directoryIdentity.uid)
              throw Error('LOGINOM_CAPTURE_PUBLICATION_BINDING_CHANGED');
          }
          phase=claiming?'claim_sync':write?'file_sync':'directory_sync';await callback(done=>captureSync(file.fd,done));
          if(write||claiming){
            phase=claiming?'claim_identity':'file_identity';const stat=await callback(done=>captureFstat(file.fd,done));
            if(!stat.isFile() || stat.nlink!==1 || (stat.mode&0o777)!==0o600 || stat.size!==(claiming?0:Buffer.byteLength(bytes))
                || claiming && stat.uid!==publication.identity.uid)
              throw Error('LOGINOM_CAPTURE_PUBLICATION_BINDING_CHANGED');
            const identity=Object.freeze({dev:stat.dev,ino:stat.ino,size:stat.size,uid:stat.uid});
            if(claiming)file.identity=identity;else publication.identity=identity;
          }
        }catch(value){if(!file.io)captureWriters.delete(file);failed(value)}
        if(file.fd!==undefined && (!claiming || primary)){
          phase=claiming?'claim_close':write?'file_close':'directory_close';
          try{await closeCaptureWriter(file);captureWriters.delete(file)}
          catch(value){file.closeFailure??={value};failed(value)}
        }else if(file.fd===undefined && file.openComplete && file.io?.pending===false){captureWriters.delete(file)}
        if(primary){
          if(claiming && file.openRejected && file.fd===undefined && file.io?.pending===false){
            (publication.claimFailures??=[]).push(file);publication.claim=undefined;
          }
          throw primary.value;
        }
        if(claiming)return file;
        if(!file.closeComplete)throw Error('LOGINOM_CAPTURE_WRITER_CLOSE_UNKNOWN');
      };
      if(!publication.prepared){
        if(publication.file)throw capturePersistencePrimary?capturePersistencePrimary.value:Error('LOGINOM_CAPTURE_WRITER_CLOSE_UNKNOWN');
        await persist(publication.temporary,captureConstants.O_WRONLY|captureConstants.O_CREAT|captureConstants.O_EXCL|captureConstants.O_NOFOLLOW,true);
        publication.prepared=true;
      }
      current();await pathIdentity(publication.directory,publication.directoryIdentity,true);
      if(!publication.succeeded){
        if(publication.pending || publication.renamed){rememberCapturePersistence(Error('LOGINOM_CAPTURE_RENAME_UNKNOWN'),'rename');throw capturePersistencePrimary.value}
        await pathIdentity(publication.temporary,publication.identity);
        await assertDestinationSlot();
        // Physical exclusive claim: a competing wx receipt cannot be replaced.
        // Hold its original FD/inode through the original rename settlement.
        if(publication.claim?.openRejected && publication.claim.fd===undefined && publication.claim.io?.pending===false){
          (publication.claimFailures??=[]).push(publication.claim);publication.claim=undefined;
        }
        if(!publication.claim)await persist(join(publication.directory,name),
          captureConstants.O_WRONLY|captureConstants.O_CREAT|captureConstants.O_EXCL|captureConstants.O_NOFOLLOW,'claim');
        if(!publication.claim?.identity)throw Error('LOGINOM_CAPTURE_PUBLICATION_CLAIM_UNKNOWN');
        await pathIdentity(join(publication.directory,name),publication.claim.identity);
        current();publication.pending=true;let projection,callbackSettled=false;
        const completion=new Promise((resolve,reject)=>{
          try{projection=captureRename(publication.temporary,join(publication.directory,name),error=>{
            callbackSettled=true;
            if(error===null||error===undefined){publication.renamed=true;resolve()}
            else reject(error);
          })}catch(value){if(callbackSettled)projection=Promise.reject(value);else reject(value)}
        });
        const observe=promise=>Promise.resolve(promise).catch(value=>{
          if(publication.primary)publication.secondary??={value};else publication.primary={value};
          rememberCapturePersistence(value,'rename');throw value;
        });
        const owned=[observe(completion),observe(projection)];
        publication.settlement=Promise.allSettled(owned).then(results=>{
          if(callbackSettled){
            publication.pending=false;
            publication.succeeded=results.every(result=>result.status==='fulfilled');
          }
        });
        try{await Promise.all(owned)}catch(value){throw capturePersistencePrimary.value}
        await publication.settlement;
        if(!publication.succeeded)throw Error('LOGINOM_CAPTURE_RENAME_UNKNOWN');
      }
      if(publication.claim && !publication.claim.closeComplete){
        await closeCaptureWriter(publication.claim);captureWriters.delete(publication.claim);
      }
      current();await pathIdentity(join(publication.directory,name),publication.identity);
      await pathIdentity(publication.directory,publication.directoryIdentity,true);
      await persist(publication.directory,captureConstants.O_RDONLY|captureConstants.O_DIRECTORY|captureConstants.O_NOFOLLOW,false);
      current();await pathIdentity(publication.directory,publication.directoryIdentity,true);
      if(captureWriters.size || publication.pending)throw Error('LOGINOM_CAPTURE_WRITER_CLOSE_UNKNOWN');
    }
    function assertCaptureEvidenceBinding() {
      if(capturePersistenceOrigin.directory!==session.directory || capturePersistenceOrigin.metadata!==session.metadata
          || capturePersistenceOrigin.sessionId!==session.metadata.sessionId)
        throw Error('LOGINOM_CAPTURE_EVIDENCE_BINDING_CHANGED');
      if(captureEvidenceBinding && (captureEvidenceBinding.directory!==session.directory
          || captureEvidenceBinding.metadata!==session.metadata
          || captureEvidenceBinding.sessionId!==session.metadata.sessionId))
        throw Error('LOGINOM_CAPTURE_EVIDENCE_BINDING_CHANGED');
    }
    async function persistCapture() {
      assertCaptureEvidenceBinding();
      const bytes=JSON.stringify(captureEvidence,null,2)+'\n';
      captureEvidenceBinding??=Object.freeze({evidence:captureEvidence,bytes,
        directory:session.directory,metadata:session.metadata,sessionId:session.metadata.sessionId});
      if(captureEvidenceBinding.evidence!==captureEvidence || captureEvidenceBinding.bytes!==bytes
          || captureEvidenceBinding.directory!==session.directory
          || captureEvidenceBinding.sessionId!==session.metadata.sessionId)
        throw Error('LOGINOM_CAPTURE_EVIDENCE_BINDING_CHANGED');
      assertCaptureEvidenceBinding();
      await drainCaptureWriters();
      assertCaptureEvidenceBinding();
      if(!captureReceiptWritten){
        await writeCaptureEvidence('acceptance-capture.json',captureEvidenceBinding.bytes);
        assertCaptureEvidenceBinding();
        captureReceiptWritten=true;
      }
      if(!captureJournalWritten){
        captureIOAssert?.();
        try{await recordExecution({event:'acceptance_capture',...captureEvidence})}
        catch(value){rememberCapturePersistence(value,'journal');throw value}
        captureJournalWritten=true;
        assertCaptureEvidenceBinding();
      }
    }
    // Closed retained-owner caller; never an MCP tool or a node_apply alias.
    function assertImportAdmission(signal) {
      const a=importAdmission,r=a?.retained,b=a?.binding;
      signal?.throwIfAborted();
      if(!a || acceptanceCapture.binding!==b || acceptanceCapture.retained!==r
          || acceptanceCapture.registration!==a.registration || acceptanceCapture.harness!==a.harness
          || b?.harness!=='import-before-configure-v1' || a.harness!==captureImportPreconfig
          || !Object.isFrozen(a.registration) || a.registration.mode!=='readonly'
          || a.registration.validate!==validateCaptureResult || a.registration.resource!==r?.resource
          || r.resource.path!=='runtime/src/acceptance/import-preconfig-adapter-v1.mjs'
          || r.binding!==b || r.session!==session || r.runtime.bridge!==bridge
          || !Object.isFrozen(r.runtime) || signal!==r.state.controller?.signal)
        throw Error('LOGINOM_IMPORT_CALLER_ADMISSION');
      assertCaptureOwner(r);
      const prepared=session.metadata.workspacePreparation;
      if(shutdownStarted || cleanupRefused || clipboardUncertain || heldLeases.size
          || session.metadata.workspaceReady!==true || b.session!==session.metadata.sessionId
          || !prepared?.attempted || prepared.state?.status!=='READY' || prepared.state.authenticated!==true
          || prepared.state.target_verified!==true || prepared.state.document_id===undefined
          || prepared.state.loginom_account!==b.account || prepared.state.package_ref?.path!==b.packagePath
          || !prepared.state.workflow_ref?.tab_tid || session.metadata.targetIdentity?.loginom_build!=='7.4.2')
        throw Error('LOGINOM_IMPORT_CALLER_PREPARATION');
      return prepared;
    }
    function openImportPreconfig(request,{signal,retained}={}) {
      assertImportAdmission(signal);
      if(retained!==importAdmission.retained || captureConsumed || captureInFlight)
        throw Error('LOGINOM_IMPORT_CALLER_ADMISSION');
      captureData(request);
      // Original per-call creation/provider is not supplied by this constructor.
      // Admission and readiness never grant permission to open a native wizard.
      throw Error('IMPORT_ORIGINAL_PROVIDER_CREATION_PACKET_UNAVAILABLE');
    }
    async function captureAcceptance({signal} = {}) {
      const binding = acceptanceCapture?.binding;
      if (!binding || typeof acceptanceCapture.harness !== 'function' || captureConsumed || shutdownStarted || cleanupRefused)
        throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
      const registration=acceptanceCapture.registration;
      const retained=acceptanceCapture.retained;
      if(registration && binding.harness==='import-before-configure-v1') {
        if(registration.mode!=='readonly' || !Object.isFrozen(registration) || registration.validate!==validateCaptureResult
            || acceptanceCapture.harness!==captureImportPreconfig || registration.resource!==retained?.resource
            || retained?.binding!==binding || retained.session!==session || retained.runtime.bridge!==bridge
            || !Object.isFrozen(retained.runtime) || signal!==retained.state.controller?.signal)throw Error('LOGINOM_IMPORT_CALLER_ADMISSION');
        signal?.throwIfAborted();assertCaptureOwner(retained);
        throw Error('IMPORT_ORIGINAL_PROVIDER_CREATION_PACKET_UNAVAILABLE');
      }
      const node=registration ? actionRuntime.retainCaptureNode(captureNodeOperation) : undefined;
      const amount=binding.harness==='amount-import-type-v1' && acceptanceCapture.amountControl;
      if(binding.harness==='amount-import-type-v1' && (!amount || amount!==importAdmission.amountControl
          || acceptanceCapture.harness!==captureAmount))throw Error('LOGINOM_AMOUNT_CAPTURE_PROXY_UNAVAILABLE');
      const preparedAtCapture=session.metadata.workspacePreparation;
      const preparedBytes=registration?JSON.stringify(preparedAtCapture):undefined;
      const assertBound = () => {
        if(amount)assertAmountCaptureProxy(amount,binding,signal);
        if (registration) {
          signal?.throwIfAborted();
          if(!signal || registration.mode!=='readonly' || typeof registration.validate!=='function'
              || !Object.isFrozen(registration) || registration.resource!==retained?.resource
              || retained?.binding!==binding || retained.session!==session || !Object.isFrozen(retained.runtime)
              || retained.state.controller?.signal!==signal)
            throw Error('LOGINOM_CAPTURE_RETAINED_OWNER_REFUSED');
          assertCaptureOwner(retained); node.assertCurrent();
          if(session.metadata.workspacePreparation!==preparedAtCapture
              || JSON.stringify(preparedAtCapture)!==preparedBytes)
            throw Error('LOGINOM_CAPTURE_PREPARATION_CHANGED');
        }
        const fp=binding.harness==='field-parameters-preservation-v1';
        if(fp)actionRuntime.assertFieldParametersDraftAllowed(binding);else actionRuntime.assertPreparationAllowed();
        const prepared=session.metadata.workspacePreparation;
        if (clipboardUncertain || heldLeases.size || !fp&&(actionRuntime.hasUnsettledWork() || actionRuntime.hasActiveWork())
            || Date.now() >= binding.expires || session.metadata.workspaceReady !== true
            || binding.session !== session.metadata.sessionId || !prepared?.attempted
            || prepared.state.loginom_account !== binding.account || !managedSave
            || managedSave.sessionId !== binding.session || managedSave.documentId !== prepared.state.document_id
            || managedSave.tabTid !== prepared.state.workflow_ref.tab_tid || managedSave.account !== binding.account
            || managedSave.packagePath !== binding.packagePath || !savedPackages.has(binding.packagePath)
            || managedSave.loginomBuild !== session.metadata.targetIdentity?.loginom_build)
          throw Error('LOGINOM_CAPTURE_IDENTITY_REFUSED');
      };
      assertBound();
      captureConsumed=true;
      captureInFlight=browserGate(async () => {
        assertBound();
        const identity=Object.freeze({session_id:binding.session, document_id:managedSave.documentId,
          tab_tid:managedSave.tabTid, account:binding.account, package_path:binding.packagePath,
          loginom_build:managedSave.loginomBuild});
        // Only the fixed verified resource receives this private Page transport.
        // It is never supplied by IPC, the tool catalogue or the model.
        captureUnknown=true;
        if(binding.harness==='field-parameters-preservation-v1'){
          fpDraftRetained=true;
          const draft=await actionRuntime.captureFieldParametersPreservation(binding);
          await recordExecution({event:'fp_capture_draft',binding,receipt:draft});
          // Journal persistence can outlive the observed owner/resources. The retained
          // delivery path rereads the same native context without replaying Apply.
          const freshDraft=await actionRuntime.captureFieldParametersPreservation(binding);
          assertBound();
          return {draft:freshDraft,cleanupComplete:false,draftRetained:true,stoppedBeforeDone:true};
        }
        const publication=registration ? capturePublication(retained,node,identity) : undefined;
        const amountGrant=amount?beginAmountCaptureProxy(amount,binding,signal):undefined;
        const ownedBrowser=amount?{callTool:async(...args)=>{assertBound();let result;try{result=await browser.callTool(...args)}catch(value){throw rejectAmountCaptureAwait(amount,value)}assertBound();return result;}}:browser;
        const ownedRecord=amount?async value=>{assertBound();let result;try{result=await recordExecution(value)}catch(rejected){throw rejectAmountCaptureAwait(amount,rejected)}assertBound();return result;}:recordExecution;
        const receipt=await (amount?captureControlledAmount:acceptanceCapture.harness)({binding, identity, browser:ownedBrowser, record:ownedRecord,
          ...(amount?{control:amountGrant}:{}),
          ...(registration?{retained,runtime:actionRuntime,session,node,publication,signal,deadline:node.deadline}: {})});
        assertBound();
        if (registration) {
          assertCapturePublication(receipt,publication);
          if (await registration.validate(receipt,{retained,node,publication}) !== true)
            throw Error('LOGINOM_CAPTURE_RESULT_INVALID');
          assertBound(); assertCapturePublication(receipt,publication);
          freezeCaptureResult(receipt);
          captureEvidence={binding,identity,receipt};
          captureUnknown=false;
          captureIOAssert=assertBound;
          await persistCapture();
          assertBound(); assertCapturePublication(receipt,publication);
          diagnosticCapture=true;
          return receipt;
        }
        if (!receipt || receipt.settings_applied !== false || receipt.cancel_verified !== true
            || Object.keys(identity).some(key => receipt[key] !== identity[key]))
          throw Error('LOGINOM_CAPTURE_CANCEL_UNCONFIRMED');
        captureEvidence={binding,identity,receipt};
        captureUnknown=false;
        if(amount)captureIOAssert=assertBound;
        await persistCapture();
        if(amount)assertBound();
        captureUnknown=false;
        return receipt;
      });
      try {
        const receipt=await captureInFlight;
        captureInFlight=undefined;
        if(binding.harness==='field-parameters-preservation-v1')return receipt;
        if (diagnosticCapture) {
          cleanupRefused=true;
          return {receipt,diagnosticRead:true,cleanupComplete:false};
        }
        const closed=await closeBridge();
        const cleanup=JSON.parse(await readFile(join(session.directory,'package-cleanup.json'),'utf8'));
        if (closed.cleanup_complete !== true || closed.browser_transport_closed !== true || cleanup.status !== 'SUCCEEDED'
            || cleanup.package_closed !== true || cleanup.logged_out !== true)
          throw Error('LOGINOM_CAPTURE_CLEANUP_UNCONFIRMED');
        return {receipt,cleanup,cleanupComplete:true};
      } catch (error) {
        cleanupRefused=true; captureRejected=true; captureRejection=error;
        try {
          if (!registration) await writeCaptureEvidence('acceptance-capture-failure.json',JSON.stringify({binding,failed:true,
            rejection:shutdownRejection(error),effect_unknown:captureUnknown,
            checked_receipt_available:!!captureEvidence},null,2)+'\n');
        }catch(persistence){(captureEvidenceBinding?.metadata??capturePersistenceMetadata).capturePersistenceFailure=shutdownRejection(persistence)}
        throw error
      }
      finally { captureInFlight=undefined; if(!registration)captureIOAssert=undefined }
    }
    function assertCleanupDestination(binding) {
      if(binding.directory!==session.directory || binding.metadata!==session.metadata
          || binding.sessionId!==session.metadata.sessionId) {
        cleanupReceiptWritten=false;
        throw Error('LOGINOM_CLEANUP_RECEIPT_BINDING_CHANGED');
      }
    }
    function assertCleanupReceiptBinding(binding,cleanup) {
      assertCleanupDestination(binding);
      if(binding.receipt!==cleanup || binding.confirmed!==confirmedCleanup
          || (binding.confirmed && cleanupEvidenceBinding!==binding)) {
        cleanupReceiptWritten=false;
        throw Error('LOGINOM_CLEANUP_RECEIPT_BINDING_CHANGED');
      }
    }
    async function writeCleanupReceipt(cleanup) {
      const receipt=cleanup,cached=confirmedCleanup;
      const metadata=session.metadata;
      const directory=session.directory,sessionId=session.metadata.sessionId;
      if(cached)cleanupEvidenceBinding ??= Object.freeze({receipt:cached,confirmed:cached,directory,metadata,sessionId,bytes:JSON.stringify(receipt,null,2)+'\n'});
      const assertBinding=()=>{
        if(typeof directory!=='string'||!directory||typeof sessionId!=='string'||!sessionId
            ||session.directory!==directory||session.metadata!==metadata||session.metadata.sessionId!==sessionId
            ||confirmedCleanup!==cached||(cached&&(receipt!==cached
              ||cleanupEvidenceBinding.receipt!==cached||cleanupEvidenceBinding.metadata!==metadata||cleanupEvidenceBinding.directory!==directory
              ||cleanupEvidenceBinding.sessionId!==sessionId)))
          {cleanupReceiptWritten=false;throw Error('LOGINOM_CLEANUP_RECEIPT_BINDING_CHANGED');}
      };
      assertBinding();
      const bytes=cached?cleanupEvidenceBinding.bytes:JSON.stringify(receipt,null,2)+'\n';
      if(cleanupPublication?.pending)throw cleanupPersistencePrimary?cleanupPersistencePrimary.value:Error('LOGINOM_CLEANUP_PUBLICATION_UNKNOWN');
      const parent=await lstat(directory);assertBinding();
      if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('LOGINOM_CLEANUP_DIRECTORY_REFUSED');
      const path=join(directory,'package-cleanup.json');
      const existing=await lstat(path).catch(error=>{if(error.code!=='ENOENT')throw error;return null});
      assertBinding();
      if(existing&&(!existing.isFile()||existing.isSymbolicLink()||existing.nlink!==1))throw Error('LOGINOM_CLEANUP_TARGET_REFUSED');
      const guard=async()=>{
        assertBinding();
        const current=await lstat(directory);
        if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==parent.dev||current.ino!==parent.ino)throw Error('LOGINOM_CLEANUP_DIRECTORY_CHANGED');
        const target=await lstat(path).catch(error=>{if(error.code!=='ENOENT')throw error;return null});
        assertBinding();
        if(existing?!target||target.dev!==existing.dev||target.ino!==existing.ino||!target.isFile()||target.isSymbolicLink()||target.nlink!==1:target!==null)throw Error('LOGINOM_CLEANUP_TARGET_CHANGED');
      };
      let phase='retained_close',primary;
      const remember=(value,failedPhase)=>{
        primary ??= {phase:failedPhase,value};
        cleanupPersistencePrimary ??= primary;
        cleanupPersistenceFailures.push({phase:failedPhase,rejection:shutdownRejection(value)});
      };
      const removeTemporary=async file=>{
        const target=file.temporary;
        const operation={pending:true};cleanupPublication=operation;
        let projection;
        const completion=new Promise((resolve,reject)=>{
          try{projection=receiptUnlink(target,error=>{
            operation.pending=false;
            if(error!==null&&error!==undefined&&error.code!=='ENOENT'){operation.failure={value:error};reject(error)}else{file.ownsTemporary=false;resolve();}
          })}catch(value){reject(value)}
        });
        try{await Promise.all([completion,projection]);assertBinding()}
        catch(value){remember(value,'temporary_unlink');throw cleanupPersistencePrimary.value}
      };
      const closeWriter=async file=>{
        if(file.closeComplete)return;
        if(file.io?.pending)throw Error('LOGINOM_CLEANUP_WRITER_IO_UNKNOWN');
        if(file.closeStarted)throw file.closeFailure?file.closeFailure.value:Error('LOGINOM_CLEANUP_WRITER_CLOSE_UNKNOWN');
        file.closeStarted=true;
        let projection;
        const completion=new Promise((resolve,reject)=>{
          try{projection=receiptClose(file.fd,error=>{
            if(error===null||error===undefined){file.closeComplete=true;resolve()}
            else{file.closeFailure={value:error};reject(error)}
          })}catch(value){file.closeFailure??={value};reject(value)}
        });
        // Only the original native callback proves close, never fd/status or
        // fulfillment of a returned projection. Preserve a rejected projection.
        await Promise.all([completion,projection]);
      };
      for(const file of cleanupWriters){
        if(!file.closeStarted&&file.openComplete&&file.fd!==undefined){
          try{await closeWriter(file)}catch(value){file.closeFailure??={value};remember(value,'retained_close')}
        }
        if(!file.closeComplete){
          remember(file.closeFailure?file.closeFailure.value:Error('LOGINOM_CLEANUP_WRITER_CLOSE_UNKNOWN'),'retained_close');
          throw cleanupPersistencePrimary.value;
        }
        assertBinding();
        // FD retirement does not discharge ownership of its original temp.
        // Keep custody through refusal/unknown until the original unlink reply.
        if(file.temporary&&file.ownsTemporary)await removeTemporary(file);
        assertBinding();
        cleanupWriters.delete(file);
      }
      const persistHandle=async(path,mode,write)=>{
        const file={fd:undefined,closeComplete:false,...(write?{temporary:path}:{})};
        cleanupWriters.add(file);
        const callback=invoke=>{
          const operation={pending:true,phase};file.io=operation;
          let projection;
          const completion=new Promise((resolve,reject)=>{
            try{projection=invoke((error,result)=>{
              operation.pending=false;
              if(error!==null&&error!==undefined){operation.failure={value:error};reject(error)}else resolve(result);
            })}catch(value){reject(value)}
          });
          return Promise.all([completion,projection]).then(([result])=>result);
        };
        try{
          phase=write?'file_open':'directory_open';
          await callback(done=>receiptOpen(path,mode,0o600,(error,fd)=>{
            file.openComplete=true;
            if(error===null||error===undefined){file.fd=fd;if(write)file.ownsTemporary=true;}
            else cleanupWriters.delete(file);
            done(error,fd);
          }));
          assertBinding();
          if(write){phase='file_write';await callback(done=>receiptWrite(file.fd,bytes,done));assertBinding()}
          phase=claiming?'claim_sync':write?'file_sync':'directory_sync';await callback(done=>receiptSync(file.fd,done));assertBinding();
        }catch(value){remember(value,phase)}
        if(file.fd!==undefined){
          const closePhase=write?'file_close':'directory_close';
          try{await closeWriter(file);assertBinding();if(!file.ownsTemporary)cleanupWriters.delete(file)}
          catch(value){file.closeFailure??={value};remember(value,closePhase)}
        }
        if(primary){
          if(claiming && file.openRejected && file.fd===undefined && file.io?.pending===false){
            (publication.claimFailures??=[]).push(file);publication.claim=undefined;
          }
          throw primary.value;
        }
        if(claiming)return file;
        if(!file.closeComplete)throw Error('LOGINOM_CLEANUP_WRITER_CLOSE_UNKNOWN');
        return file;
      };
      const temporary=join(directory,`.package-cleanup.${randomUUID()}.tmp`);
      await guard();
      const temporaryOwner=await persistHandle(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,true);
      await guard();
      const publication={pending:true};cleanupPublication=publication;
      let projection;
      const completion=new Promise((resolve,reject)=>{
        try{projection=receiptRename(temporary,path,error=>{
          publication.pending=false;
          if(error!==null&&error!==undefined)reject(error);else{publication.confirmed=true;temporaryOwner.ownsTemporary=false;cleanupWriters.delete(temporaryOwner);resolve()}
        })}catch(value){reject(value)}
      });
      try{await Promise.all([completion,projection])}catch(value){remember(value,'rename');throw value}
      assertBinding();
      await persistHandle(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW,false);
      assertBinding();
      // No marker before both writes/syncs/closes actually complete.
      if(cleanupWriters.size)throw Error('LOGINOM_CLEANUP_WRITER_UNCONFIRMED');
      if(confirmedCleanup)cleanupReceiptWritten=true;
    }
    function closeBridge() {
      if(acceptanceCapture?.registration && captureConsumed) {
        if(captureEvidence && captureRejected && !captureUnknown)
          return persistCapture().then(()=>{throw captureRejection},value=>{rememberCapturePersistence(value,'readonly_evidence_repair');throw captureRejection});
        return Promise.reject(captureRejected?captureRejection:Error('LOGINOM_CAPTURE_DIAGNOSTIC_RETAINED'));
      }
      if(fpDraftRetained)return Promise.reject(Error('LOGINOM_FP_DRAFT_RETAINED'));
      if (captureRejected && captureUnknown) return Promise.reject(captureRejection);
      if (captureInFlight) return captureInFlight.then(() => closeBridge());
      if(closing)return closing;
      if([...cleanupWriters].some(file=>!file.closeComplete &&
          (file.io?.pending || file.closeStarted || !file.openComplete || file.fd===undefined)))
        return Promise.reject(cleanupPersistencePrimary?cleanupPersistencePrimary.value:Error('LOGINOM_CLEANUP_WRITER_UNCONFIRMED'));
      const shutdownBinding=cleanupShutdownBinding??=Object.freeze({directory:session.directory,metadata:session.metadata,
        sessionId:session.metadata.sessionId});
      const assertShutdownBound=()=>{
        assertCleanupDestination(shutdownBinding);
        if(retainedNativeCleanup)assertCleanupDestination(retainedNativeCleanup.binding);
        if(cleanupEvidenceBinding)assertCleanupReceiptBinding(cleanupEvidenceBinding,confirmedCleanup);
      };
      shutdownStarted = true;
      let shutdownPrimary;
      closing ??= (async () => {
        shutdownStage='native_cleanup';
        let shutdownCleanup;
        if (config.acceptanceCleanupPackage || managedCleanup) {
          if (managedCleanup) cleanupRefused=true;
          let cleanup;
          const prepared = session.metadata.workspacePreparation;
          assertShutdownBound();
          if(retainedNativeCleanup)assertCleanupDestination(retainedNativeCleanup.binding);
          if (confirmedCleanup) cleanup=confirmedCleanup;
          else if(retainedNativeCleanup)cleanup=retainedNativeCleanup.receipt;
          else if (managedCleanup && (clipboardUncertain || heldLeases.size || actionRuntime?.hasUnsettledWork?.()))
            cleanup = {status:'BLOCKED', reason:'CLEANUP_OR_OPERATION_UNCONFIRMED'};
          else if (!prepared?.attempted && authenticatedReadiness) {
            actionRuntime.assertPreparationAllowed();
            const expected={...authenticatedReadiness,sessionId:session.metadata.sessionId,
              origin:new URL(config.loginomUrl).origin};
            if(!managedBrowserTransport || expected.loginomBuild!=='7.4.2'
                || ![expected.account,expected.documentId].every(v=>typeof v==='string'&&v.length>0))
              throw Error('LOGINOM_READINESS_IDENTITY_REQUIRED');
            cleanup=await browserGate(async()=>{
              actionRuntime.assertPreparationAllowed();assertShutdownBound();
              const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{
                code:`async page=>(${logoutReadiness.toString()})(page,${JSON.stringify(expected)})`}},undefined,{timeout:30000});
              if(response?.isError)throw Error('LOGINOM_READINESS_REPLY_INVALID');
              const values=(response?.content??[]).filter(b=>b.type==='text').flatMap(b=>{
                try{return [JSON.parse(b.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??b.text)];}catch{return [];}});
              const result=values.find(v=>v?.version===1&&['SUCCEEDED','BLOCKED'].includes(v.status)
                &&v.session_id===expected.sessionId&&v.document_id===expected.documentId&&v.account===expected.account
                &&v.loginom_build===expected.loginomBuild&&v.package_closed===false&&typeof v.logged_out==='boolean'
                &&typeof v.effect_possible==='boolean');
              if(!result || (result.status==='SUCCEEDED'&&(result.logged_out!==true||result.packages_before!==0
                  ||result.packages_after!==0||result.reason!==null)))throw Error('LOGINOM_READINESS_REPLY_INVALID');
              return result;
            });
          }
          else if (!prepared?.attempted) cleanup = {status:'SKIPPED_UNPREPARED', session_id:session.metadata.sessionId};
          else {
            try {
              // Refuse unsettled background node jobs before waiting on the
              // browser gate. Shutdown never cancels them to force a close.
              actionRuntime.assertPreparationAllowed();
              const path=config.acceptanceCleanupPackage ?? managedSave?.packagePath;
              if (session.metadata.workspaceReady !== true || !savedPackages.has(path)
                  || (managedCleanup && (!managedSave || managedSave.sessionId!==session.metadata.sessionId
                    || managedSave.documentId!==prepared.state.document_id
                    || managedSave.tabTid!==prepared.state.workflow_ref.tab_tid
                    || managedSave.account!==prepared.state.loginom_account
                    || managedSave.packagePath!==path || managedSave.loginomBuild!==session.metadata.targetIdentity.loginom_build))) {
                cleanup = {status:'BLOCKED', reason:'CONFIRMED_SAVE_REQUIRED'};
              } else cleanup = await browserGate(async () => {
                actionRuntime.assertPreparationAllowed();assertShutdownBound();
                const cleanupOptions = {
                  sessionId:session.metadata.sessionId, documentId:prepared.state.document_id,
                  // Managed runtimes have no replay login account; the cleanup
                  // binds to the account observed at workspace preparation.
                  tabTid:prepared.state.workflow_ref.tab_tid, account:prepared.state.loginom_account??config.replayLoginUser,
                  packagePath:path, loginomUrl:config.loginomUrl,
                  loginomBuild:session.metadata.targetIdentity.loginom_build,
                };
                // Keep the shared helper unchanged. Add the current native tab
                // guard inside its existing evaluate, immediately before ClosePackage.
                const anchor='const state = globalThis.__loginomDockCleanupV1 =';
                const original=makePackageCleanupCode(cleanupOptions);
                if (!original.includes(anchor)) throw Error('Cleanup guard insertion unavailable');
                const code=original.replace(anchor, `
                  const tabs=[...document.querySelectorAll('[data-tid]')].filter(el=>el.getAttribute('data-tid')===o.tabTid);
                  if(tabs.length!==1 || !visible(tabs[0])) return {reason:'CURRENT_TAB_CHANGED'};
                  ${anchor}`);
                const response = await browser.callTool({name:'browser_run_code_unsafe', arguments:{code}}, undefined, {timeout:30000});
                return parsePackageCleanupResult(response, cleanupOptions);
              });
            } catch { cleanup = {status:'BLOCKED', reason:'CLEANUP_OR_OPERATION_UNCONFIRMED'}; }
          }
          // Parsed result escrow preserves this owner's native success across storage refusal.
          if(cleanup.status==='SUCCEEDED' && !retainedNativeCleanup)
            retainedNativeCleanup=Object.freeze({binding:shutdownBinding,receipt:Object.freeze({...cleanup,
              save_operation_id:savedPackages.get(config.acceptanceCleanupPackage ?? managedSave?.packagePath)??null})});
          assertShutdownBound();
          if(retainedNativeCleanup)assertCleanupDestination(retainedNativeCleanup.binding);
          cleanup = {...cleanup, session_id:cleanup.session_id??shutdownBinding.sessionId,
            save_operation_id:retainedNativeCleanup ? retainedNativeCleanup.receipt.save_operation_id
              :savedPackages.get(config.acceptanceCleanupPackage ?? managedSave?.packagePath) ?? null};
          shutdownCleanup=cleanup;
          if (managedCleanup && !['SUCCEEDED','SKIPPED_UNPREPARED'].includes(cleanup.status)) cleanupRefused=true;
          // Preserve the verified native result across persistence failures on
          // this same foreground owner. No cache is minted for unknown responses.
          if (cleanup.status==='SUCCEEDED' && !confirmedCleanup) confirmedCleanup=Object.freeze(cleanup);
          if (!confirmedCleanup || !cleanupReceiptWritten) {
            try {await writeCleanupReceipt(confirmedCleanup??cleanup)} catch(error) {
              shutdownPrimary={stage:'cleanup_receipt',reason:cleanupPersistencePrimary?cleanupPersistencePrimary.value:error,
                rejections:cleanupPersistenceFailures};
              throw error;
            }
          }
          assertShutdownBound();
          await recordExecution({event:'isolated_package_cleanup', cleanup});
          assertShutdownBound();
          if (managedCleanup && ['SUCCEEDED','SKIPPED_UNPREPARED'].includes(cleanup.status)) cleanupRefused=false;
          if (!['SUCCEEDED','SKIPPED_UNPREPARED'].includes(cleanup.status)) return {
            browser_transport_closed:false, browser_process_terminated:false, clipboard_leases_retained:heldLeases.size,
            package_cleanup:cleanup,
          };
        }
        assertShutdownBound();
        shutdownStage='server_close';
        await server.close();assertShutdownBound();
        shutdownStage='transport_close';
        const closed=await closeClients();
        const rejectedStages=closed.flatMap((result,index)=>result.status==='rejected'?[{stage:index===0?'remote_close':'browser_transport_close',rejection:shutdownRejection(result.reason)}]:[]);
        if(rejectedStages.length) shutdownPrimary={stage:'transport_close',rejections:rejectedStages,reason:closed.find(result=>result.status==='rejected').reason};
        assertShutdownBound();
        if (closed[1].status === 'fulfilled') await awaitBrowserExit();
        const browserTransportClosed = closed[1].status === 'fulfilled' && browserTransportEnded;
        const cleanupComplete=browserTransportClosed&&closed.every(result=>result.status==='fulfilled');
        const shutdown={browser_transport_closed:browserTransportClosed,cleanup_complete:cleanupComplete,
          browser_process_terminated:!managedBrowserTransport&&browserTransportEnded,
          native_logout_confirmed:shutdownCleanup?.logged_out===true,
          package_cleanup:shutdownCleanup??null,clipboard_leases_retained:heldLeases.size,
          stages:{remote_close:closed[0].status,browser_transport_close:closed[1].status,
            browser_transport_onclose:browserTransportEnded},
          ...(rejectedStages.length?{rejection:rejectedStages[0].rejection,rejections:rejectedStages}:{})};
        shutdownStage='durable_transport_receipt';
        assertShutdownBound();
        await writeFile(join(shutdownBinding.directory,'shutdown-receipt.json'),JSON.stringify(shutdown,null,2)+'\n',{mode:0o600});
        assertShutdownBound();
        await recordExecution({event:'bridge_shutdown',shutdown});
        assertShutdownBound();
        if (cleanupComplete) {
          shutdownStage='release';
          await session.artifactStore.releaseUploads();
          await Promise.allSettled([...heldLeases].map(async lease => {
            await lease.release(); heldLeases.delete(lease);
          }));
        }
        // A failed transport close does not prove that an unconfirmed paste has
        // stopped. Retain leases while this process lives; process exit still
        // releases kernel locks and is not cross-process recovery evidence.
        return {...shutdown,clipboard_leases_retained:heldLeases.size};
      })().then(result => {
        // Only guarded package cleanup can reconcile and retry on this owner.
        // Classic transport shutdown has an unknown effect and stays one-shot.
        if ((managedCleanup || config.acceptanceCleanupPackage)
            && (result?.browser_transport_closed !== true || result.cleanup_complete===false)) { if(managedCleanup)cleanupRefused=true; closing = undefined; shutdownStarted = false; }
        return result;
      }, async error => {
        if(managedCleanup)cleanupRefused=true;
        if (managedCleanup || config.acceptanceCleanupPackage) { closing = undefined; shutdownStarted = false; }
        try {
          assertShutdownBound();
          if([...cleanupWriters].some(file=>!file.closeComplete))throw Error('LOGINOM_CLEANUP_WRITER_UNCONFIRMED');
          await writeFile(join(shutdownBinding.directory,'bridge-shutdown-failure.json'),
          JSON.stringify({stage:shutdownStage,rejection:shutdownPrimary?shutdownRejection(shutdownPrimary.reason):shutdownRejection(error),
            ...(shutdownPrimary?{primary_phase:shutdownPrimary.stage,primary_rejection:shutdownRejection(shutdownPrimary.reason),rejections:shutdownPrimary.rejections,persistence_failure:shutdownRejection(error)}:{})},null,2)+'\n',{mode:0o600});assertShutdownBound(); }
        catch(persistence) {try {shutdownBinding.metadata.cleanupFailurePublicationRefusal??=shutdownRejection(persistence)}catch { /* Preserve the original failure. */ }}
        throw shutdownPrimary?new Error('LOGINOM_BRIDGE_CLEANUP_FAILED',{cause:shutdownPrimary.reason}):error;
      });
      return closing;
    }
    let preReadyReading=false;
    async function readPreReady({retained,signal,deadline}={}) {
      const assert=()=>{
        qualifyPreReadyRead(retained,{signal,deadline});
        if(retained.bridge?.readPreReady!==readPreReady || retained.session!==session
            || cleanupRefused || retainedNativeCleanup || cleanupShutdownBinding || confirmedCleanup || shutdownStarted
            || captureConsumed || captureInFlight || captureUnknown || cleanupWriters.size || cleanupPublication || fpDraftRetained
            || clipboardUncertain || heldLeases.size || !actionRuntime
            || actionRuntime.hasUnsettledWork() || actionRuntime.hasActiveWork())
          throw Error('LOGINOM_PRE_READY_READ_REFUSED');
      };
      if(preReadyReading)throw Error('LOGINOM_PRE_READY_READ_REFUSED');
      assert();preReadyReading=true;
      try {
        const code=makeWorkspaceBootstrapCode({origin:retained.startup.origin,build:pinnedActions.compatibility.loginom_build});
        const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,
          {signal,timeout:deadline-Date.now()});
        assert();
        const result=parseCapabilityResult(response);
        if(result?.status!=='SUCCEEDED' || result.effect_possible!==false || result.output?.observation_only!==true
            || result.output.origin!==retained.startup.origin || result.output.target_state==='indeterminate')
          throw Error('LOGINOM_PRE_READY_READ_REFUSED');
        return Object.freeze({kind:'PRE_READY_CLOSED_READ',ready:false,cleanupComplete:false,observation:result.output});
      } finally {preReadyReading=false}
    }
    const bridge={server,catalog,captureAcceptance,openImportPreconfig,readPreReady,
      hasActiveWork:()=>!!captureInFlight || (!clipboardUncertain && !!actionRuntime?.hasActiveWork()),
      hasUnsettledWork:()=>cleanupRefused || !!captureInFlight || !!actionRuntime?.hasUnsettledWork() || clipboardUncertain || heldLeases.size>0,
      close:closeBridge};
    prepareLender?.bind(bridge);
    return bridge;
  } catch (error) {
    await closeClients();
    throw error;
  }
}
