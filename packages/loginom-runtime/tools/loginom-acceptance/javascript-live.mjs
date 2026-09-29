import {javascriptMappingState,javascriptPreservedMappings} from './javascript-mapping-state.mjs';
import {javascriptSourceMappings} from './javascript-source-cycle.mjs';
import {createJavascriptSourceReader,javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {createJavascriptSourceAdmission} from '../../client/lib/javascript-source-admission.mjs';
import {createJavascriptManagedSourceAdapter} from '../../client/lib/javascript-managed-source-adapter.mjs';
import {replaceManagedJavascriptSource} from '../../client/lib/javascript-managed-source-write.mjs';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createJavascriptTrialNodeSupport} from '../../client/lib/javascript-trial-node.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {nodeResultReply} from '../../client/lib/node-result-reply.mjs';
import {createJavascriptSourceWriter} from '../../client/lib/javascript-source-write.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
import {verifyJavascriptPersistenceOutput} from './javascript-persistence-oracle.mjs';
import {observeJavascriptSource,observeJavascriptSourceProcesses} from '../../client/lib/javascript-source-browser.mjs';
import {verifyJavascriptSourceCycle,javascriptSourceSettings} from './javascript-source-cycle.mjs';
import {requireJavascriptMetadataMode} from './javascript-native-metadata.mjs';
import {beginCalibrationWizard,readCalibrationWizard,finishCalibrationWizardObservation,checkCalibrationWizardBaseline} from './javascript-calibration-wizard.mjs';
import {acknowledgeJavascriptCalibrationRecord} from './javascript-calibration-journal.mjs';
import {javascriptCalibrationIds,captureCalibrationWizard} from './javascript-calibration-cases.mjs';
import {createJavascriptCalibrationTrial} from './javascript-calibration-run.mjs';
import {javascriptTelemetryIds,javascriptTelemetryCase,requireJavascriptTelemetryMode} from './javascript-schema-telemetry-cases.mjs';
import {createJavascriptTelemetryTrial} from './javascript-schema-telemetry-run.mjs';
import {javascriptNamedIds,javascriptNamedCase} from './javascript-native-named-cases.mjs';
import {createJavascriptNamedTrial,writeJavascriptNamedReport} from './javascript-native-named-run.mjs';
import {createJavascriptCoercionTrial,writeJavascriptCoercionReport} from './javascript-native-coercion-run.mjs';
import {javascriptCoercionIds} from './javascript-native-coercion-cases.mjs';
import {captureJavascriptNativeClassifierDiagnostic} from './javascript-native-classifier-diagnostic.mjs';
import {verifyJavascriptDeclaredEmpty} from './javascript-native-zero.mjs';
import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripMapping} from './javascript-native-roundtrip-contract.mjs';
import {bindJavascriptNativeRoundtripSource,bindJavascriptNativeRoundtripSchema,prepareJavascriptNativeRoundtripWizard,sealJavascriptNativeRoundtripDone} from './javascript-native-roundtrip-owner.mjs';
import {cleanupJavascriptColumnEditor,openJavascriptColumnEditor,observeJavascriptColumnEditor,openJavascriptColumnUsagePicker,selectJavascriptColumnUsageOption,fillJavascriptColumnField,openJavascriptColumnTypePicker,selectJavascriptColumnTypeOption,verifyJavascriptColumnEditor} from './javascript-column-editor.mjs';
import {dragJavascriptPalette} from './javascript-palette-drag.mjs';
// Operator-only G1/G4 discovery. No public editor guards are changed here.
import {readFile, mkdir, writeFile, readdir} from 'node:fs/promises';
import {resolve, isAbsolute, dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {javascriptBatchCases,runJavascriptBatch,caseEffect,javascriptBatchInputIdentity,javascriptDropPoint} from './javascript-batch-plan.mjs';
import {loginBrowser} from '../../src/connection-check.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {javascriptEngineProbes} from './javascript-engine-probes.mjs';
import {javascriptDiscoveryIds,javascriptDiscoveryProbe,javascriptDiscoveryOracle,observeJavascriptDiscovery,javascriptDiscoveryWizardDiagnostic,javascriptDiscoveryErrorButtonDiagnostic} from './javascript-discovery-probes.mjs';
import {javascriptMaterializationObservation} from './javascript-materialization-observation.mjs';
import {javascriptBridgeObservation} from './javascript-bridge-probe.mjs';
import {javascriptSourceSample,javascriptSourceBoundary} from './javascript-source-probes.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {createJavascriptExecutionRuntime,createJavascriptSavedExecutionRuntime} from './javascript-execution-runtime.mjs';
import {createJavascriptColdSource} from './javascript-cold-source.mjs';
import {requireJavascriptSavedPackagePath,bindJavascriptPackage} from './javascript-package-binding.mjs';
import {javascriptColdNodes,observeJavascriptWizardBinding} from './javascript-cold-binding.mjs';
import {openJavascriptInitialWizard,requireJavascriptInitialOpeningCleanup} from './javascript-initial-opening.mjs';
import {openManagedJavascriptInitialWizard} from './javascript-managed-initial-opening.mjs';
import {javascriptExecutionProbes} from './javascript-execution-probes.mjs';
import {javascriptMismatchSource,runJavascriptMismatchMaterialization,javascriptMismatchExecutionProgress,javascriptProbeFailure} from './javascript-mismatch-probe.mjs';
import {readJavascriptSchema,configureJavascriptSchema} from './javascript-schema-probe.mjs';
import {makeJavascriptSchemaContextCode} from '../../client/lib/javascript-schema-context.mjs';
import {makeJavascriptSourceContextCode} from '../../client/lib/javascript-source-context.mjs';
import {makeJavascriptManagedSourceCode} from '../../client/lib/javascript-managed-source.mjs';
import {makeJavascriptManagedSelectionReadCode} from '../../client/lib/javascript-managed-selection.mjs';
import {wizardReadiness} from '../../client/lib/javascript-wizard-page.mjs';
import {makeJavascriptManagedPageCode} from '../../client/lib/javascript-managed-page.mjs';
import {dispatchManagedJavascriptNext} from '../../client/lib/javascript-managed-next.mjs';
import {dispatchManagedJavascriptCodeNext} from '../../client/lib/javascript-managed-code-next.mjs';
import {dispatchManagedJavascriptDone} from '../../client/lib/javascript-managed-done.mjs';
import {openManagedJavascriptExistingWizard} from '../../client/lib/javascript-managed-existing.mjs';
import {closeManagedJavascriptWizard} from '../../client/lib/javascript-managed-close.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {javascriptSentinelOutcome,verifyJavascriptInputMapping,javascriptInitialPages,compactJavascriptJournalRecord,observeJavascriptBrowserLifecycle} from './javascript-execution-evidence.mjs';
import {readJavascriptStage,closeJavascriptPreviewOnce,javascriptStageTerminal,requireJavascriptStageAdmission,waitJavascriptStageObservation} from './javascript-stage-observer.mjs';
import {captureJavascriptWizardError} from './javascript-wizard-error.mjs';
import {readJavascriptG1Type} from './javascript-g1-type.mjs';
import {readJavascriptServerVersion} from './javascript-server-version.mjs';
import {openJavascriptPackageFileTab,readJavascriptPackageFile} from './javascript-package-file.mjs';
import {createJavascriptHeadedFocusX11} from './javascript-headed-focus-x11.mjs';
import {runJavascriptStopProbe} from './javascript-stop-probe.mjs';

export async function runJavascriptOperator(args=process.argv.slice(2),{batchCases=null,nativeInputOnly=false,nativeRoundtrip=false,sourceReadCycle=false,persistenceMode=null,coldReader=false,packageFile=false}={}) {
process.umask(0o077);
if(coldReader&&(batchCases!==null||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistenceMode!==null))throw Error('Cold reader requires its separate private entrypoint');
if(packageFile&&(coldReader||batchCases!==null||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistenceMode!==null))throw Error('Package-file audit requires its separate private entrypoint');
const {javascriptPersistenceCase}=persistenceMode===null?{}:await import('./javascript-persistence-cases.mjs');
const batch=batchCases===null?null:javascriptBatchCases(batchCases);
const persistence=persistenceMode===null?null:javascriptPersistenceCase(persistenceMode);
const batchDeadline=coldReader||packageFile?Math.floor(performance.timeOrigin)+600000:persistence?Math.floor(performance.timeOrigin)+persistence.writer_budget_ms:nativeRoundtrip||sourceReadCycle?Date.now()+600000:batch?Date.now()+1800000:Infinity;
let cleaning=false,cleanupDeadline=Infinity;
const phaseDeadline=ms=>Math.min(cleaning?cleanupDeadline:batchDeadline,Date.now()+ms);
const remainingBatch=()=>{const ms=(cleaning?cleanupDeadline:batchDeadline)-Date.now();if(ms<=0)throw Error(cleaning?'Original cleanup deadline expired':'Original batch deadline expired');return ms;};
const usage = 'node javascript-live.mjs --config PRIVATE.json --profile ABS --browser ABS --evidence NEW_ABS [--server-version-only | --palette-only | --palette-hit-test | --create-node [--inspect-pages [--inspect-declared-editor [--inspect-usage-picker [--select-usage-option [--apply-usage-option]]] | --probe-source]] | --execution-case CASE [--managed-opening-probe --x11-no-focus [--verify-managed-source-write | --verify-managed-source-commit] | --verify-public-node-apply] | --discovery-probe ID]\nCASE: {declared,code}-sentinel-{next,done,preview,execute}, {declared,code}-table-execute, code-table-mismatch\nIsolated discovery IDs: '+javascriptDiscoveryIds.join(',');
if(args.includes('--help')&&coldReader){console.log('node javascript-persistence-read-live.mjs --config PRIVATE.json --profile NEW_ABS --browser ABS --evidence NEW_ABS --package EXACT_OWNED_LGP\nCold reader: observe actual source/settings/mappings, one fresh Execute and full output; 10 minutes from process start; headed only. No source or configuration input.');return;}
if(args.includes('--help')&&packageFile){console.log('node javascript-package-file-live.mjs --config PRIVATE.json --profile NEW_ABS --browser ABS --evidence NEW_ABS --package EXACT_OWNED_LGP\nRead one previously saved owned package through pinned native FileDownloader; no JS Execute. Headed only.');return;}
if(args.includes('--help')&&persistence){console.log('node javascript-persistence-'+persistenceMode+'-live.mjs --config PRIVATE.json --profile NEW_ABS --browser ABS --evidence NEW_ABS\nFixed '+persistenceMode+' writer: two source revisions, two explicit JS executions and two saves to one owned package; 30 minutes total; headed only. Cold reader runs separately.');return;}
if (args.includes('--help')) { if(nativeRoundtrip)console.log('Fixed telemetry: --schema-telemetry-case '+javascriptTelemetryIds.join('|')+'; first ROOT live control only'); if(nativeRoundtrip)console.log('Opt-in: --metadata-diagnostic with --native-named-case C-set-index only; one point-in-time metadata round, no D acceptance'); if(nativeRoundtrip)console.log('Fixed calibration: --error-calibration '+javascriptCalibrationIds.join('|')+'; no OUTPUT; K3/K4 inactive'); if(nativeRoundtrip)console.log('Stage A/B named cases: --native-named-case '+javascriptNamedIds.join('|')); if(nativeRoundtrip||nativeInputOnly)console.log('Fixed Integer coercion cases (one per fresh run): '+javascriptCoercionIds.join('|')); console.log(nativeRoundtrip?'node javascript-native-roundtrip-live.mjs --config PRIVATE.json --profile NEW_ABS --browser ABS --evidence NEW_ABS\n[--native-fixture real|boolean|string|integer-safe|integer-outside-safe|civil-datetime|cardinality-keep2|cardinality-odd|cardinality-duplicate|cardinality-empty] Private typed/NULL input admission then one fixed Data-only JS Execute (empty uses UI-declared schema), native output and upstream reread.':nativeInputOnly?'node javascript-native-input-live.mjs --config PRIVATE.json --profile NEW_ABS --browser ABS --evidence NEW_ABS\n[--native-fixture real|boolean|string|integer-safe|integer-outside-safe|civil-datetime|cardinality-keep2|cardinality-odd|cardinality-duplicate|cardinality-empty] Private input-only Value typed admission; one import Execute, typed UI + full fixed native read; no JS creation.':usage); return; }
const allowed = new Set([...(coldReader||packageFile?['--package']:[]),'--config','--profile','--browser','--evidence','--server-version-only','--create-node','--palette-only','--palette-hit-test','--inspect-pages','--inspect-declared-editor','--inspect-usage-picker','--select-usage-option','--apply-usage-option','--probe-source','--execution-case','--managed-opening-probe','--verify-source-admission','--verify-public-source-read','--verify-managed-source-write','--verify-managed-source-commit','--verify-public-node-apply','--verify-runtime-schema','--verify-runtime-source','--x11-no-focus','--discovery-probe',...(nativeInputOnly||nativeRoundtrip?['--native-fixture']:[]),...(nativeRoundtrip?['--native-named-case','--error-calibration','--metadata-diagnostic','--schema-telemetry-case']:[])]);
const options = {};
for (let i=0;i<args.length;i++) {
  const key=args[i];
  if (!allowed.has(key) || key in options) throw Error('Unknown or duplicate option');
  options[key]=['--server-version-only','--create-node','--palette-only','--palette-hit-test','--inspect-pages','--inspect-declared-editor','--inspect-usage-picker','--select-usage-option','--apply-usage-option','--probe-source','--managed-opening-probe','--verify-source-admission','--verify-public-source-read','--verify-managed-source-write','--verify-managed-source-commit','--verify-public-node-apply','--verify-runtime-schema','--verify-runtime-source','--x11-no-focus','--metadata-diagnostic'].includes(key) ? true : args[++i];
  if (options[key]===undefined) throw Error(usage);
}
if(coldReader){
  if(batch||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||Object.keys(options).some(k=>!['--config','--profile','--browser','--evidence','--package'].includes(k)))throw Error('Cold reader requires its separate private entrypoint');
  requireJavascriptSavedPackagePath(options['--package']);
}
if(packageFile){
  if(Object.keys(options).some(k=>!['--config','--profile','--browser','--evidence','--package'].includes(k)))throw Error('Package-file audit accepts only exact saved package');
  requireJavascriptSavedPackagePath(options['--package']);
}
if(persistence){
  if(batch||nativeInputOnly||nativeRoundtrip||sourceReadCycle||Object.keys(options).some(k=>!['--config','--profile','--browser','--evidence'].includes(k)))throw Error('Persistence requires its separate fixed writer entrypoint');
  for(const revision of persistence.revisions)if(inspectJavascriptModulePolicy(revision.source).status!=='ADMITTED')throw Error('Fixed persistence source policy refused');
  options['--execution-case']=persistence.schema_mode+'-table-execute';
}
if(sourceReadCycle){
  if(batch||nativeInputOnly||nativeRoundtrip||Object.keys(options).some(k=>!['--config','--profile','--browser','--evidence'].includes(k)))throw Error('Source cycle requires its separate fixed private entrypoint');
  options['--execution-case']='code-table-execute';
}
if(options['--managed-opening-probe']&&(options['--execution-case']!=='code-table-execute'
  ||batch||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||coldReader||packageFile||options['--discovery-probe']))
  throw Error('Managed opening probe requires one isolated code-table-execute case');
if(options['--x11-no-focus']&&!options['--managed-opening-probe']&&!options['--server-version-only'])
  throw Error('X11 focus guard requires the isolated managed opening probe or read-only recovery');
if(options['--verify-source-admission']&&!options['--managed-opening-probe'])throw Error('Source admission requires the isolated managed opening probe');
if(options['--verify-public-source-read']&&!options['--managed-opening-probe'])throw Error('Public source read requires the isolated managed opening probe');
if(options['--verify-managed-source-write']&&(!options['--managed-opening-probe']||!options['--verify-public-source-read']))
  throw Error('Managed source write requires the isolated managed opening and independent public source read');
if(options['--verify-managed-source-commit']&&(!options['--managed-opening-probe']||!options['--verify-public-source-read']
  ||options['--verify-managed-source-write']))
  throw Error('Managed source commit requires managed opening, independent public source read and no discard trial');
if(options['--verify-public-node-apply']&&(options['--execution-case']!=='code-table-execute'
  ||batch||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||coldReader||packageFile
  ||options['--managed-opening-probe']||options['--x11-no-focus']))
  throw Error('Public JavaScript trial requires one isolated code-table-execute case in ordinary headed mode');
if(options['--verify-runtime-schema']&&(options['--execution-case']!=='code-table-execute'||batch||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||coldReader||packageFile))
  throw Error('Runtime schema verification requires one isolated code-table-execute case');
if(options['--verify-runtime-source']&&(options['--execution-case']!=='code-table-execute'||batch||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||coldReader||packageFile))
  throw Error('Runtime source verification requires one isolated code-table-execute case');
if(batch&&options['--execution-case'])throw Error('Batch cannot also select a single case');
if(nativeInputOnly||nativeRoundtrip){
  if(batch||Object.keys(options).some(k=>!['--config','--profile','--browser','--evidence','--native-fixture',...(nativeRoundtrip?['--native-named-case','--error-calibration','--metadata-diagnostic','--schema-telemetry-case']:[])].includes(k)))throw Error('Native input-only requires its separate private entrypoint and no JS modes');
  options['--create-node']=true;
}
const nativeNamedCaseId=options['--native-named-case'],nativeCalibrationId=options['--error-calibration'],nativeTelemetryCaseId=options['--schema-telemetry-case'];
requireJavascriptTelemetryMode(nativeTelemetryCaseId,{namedCaseId:nativeNamedCaseId,calibrationId:nativeCalibrationId,metadataDiagnostic:options['--metadata-diagnostic']});
if(nativeTelemetryCaseId!==undefined&&options['--native-fixture']!==undefined)throw Error('Telemetry owns its immutable input fixture');
const telemetryTrial=nativeTelemetryCaseId!==undefined?createJavascriptTelemetryTrial(nativeTelemetryCaseId):null;
const metadataDiagnostic=requireJavascriptMetadataMode(options['--metadata-diagnostic'],{nativeRoundtrip,namedCaseId:nativeNamedCaseId,calibrationId:nativeCalibrationId});
if(nativeCalibrationId!==undefined&&(nativeNamedCaseId!==undefined||options['--native-fixture']!==undefined))throw Error('Calibration owns its separate fixed identity/input');
const calibrationTrial=nativeCalibrationId!==undefined?createJavascriptCalibrationTrial(nativeCalibrationId):null;
if(nativeNamedCaseId!==undefined&&options['--native-fixture']!==undefined)throw Error('Named case owns its immutable input fixture');
const nativeFixtureId=telemetryTrial?javascriptTelemetryCase(nativeTelemetryCaseId).input_fixture_id:calibrationTrial?'integer-safe':nativeNamedCaseId!==undefined?javascriptNamedCase(nativeNamedCaseId).input_fixture_id:options['--native-fixture']??'real',nativeFixture=coldReader?null:javascriptNativeFixture(nativeFixtureId),nativeRoundtripProbe=coldReader?null:calibrationTrial?calibrationTrial.probe:javascriptNativeRoundtripProbe(nativeFixtureId,nativeNamedCaseId,nativeTelemetryCaseId);
const namedTrial=nativeNamedCaseId!==undefined?createJavascriptNamedTrial(nativeNamedCaseId):null;
const coercionTrial=nativeRoundtrip&&nativeFixture.coercion?createJavascriptCoercionTrial(nativeFixtureId):null;
const discoveryProbe=options['--discovery-probe']?javascriptDiscoveryProbe(options['--discovery-probe']):null;
const materializationProbe=['C0-materialization','G3-bridge'].includes(discoveryProbe?.scope);
if(discoveryProbe&&(batch||options['--execution-case']))throw Error('Discovery requires one isolated probe, not a batch or execution case');
let executionCase=nativeRoundtrip?nativeRoundtripProbe.schema_mode+'-table-execute':discoveryProbe?discoveryProbe.schema_mode+'-table-execute':batch?.[0]??options['--execution-case'];
if(executionCase){
  if(!/^(declared|code)-(sentinel-(next|done|preview|execute)|table-execute)$/.test(executionCase)&&executionCase!=='code-table-mismatch')throw Error('Unknown execution case');
  if(!nativeRoundtrip&&['--create-node','--palette-only','--palette-hit-test','--inspect-pages','--inspect-declared-editor','--probe-source'].some(k=>options[k]))throw Error('Execution case is a separate mode');
  options['--create-node']=true;options['--inspect-pages']=true;
}
if (['--create-node','--palette-only','--palette-hit-test'].filter(k=>options[k]).length>1) throw Error('Choose one discovery mode');
if(options['--server-version-only']&&(['--create-node','--palette-only','--palette-hit-test','--inspect-pages','--inspect-declared-editor','--inspect-usage-picker','--select-usage-option','--apply-usage-option','--probe-source','--execution-case','--discovery-probe'].some(k=>options[k])
  ||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||coldReader||packageFile||batch))throw Error('Server version requires its own read-only mode');
if(options['--inspect-pages']&&!options['--create-node'])throw Error('--inspect-pages requires --create-node');
if(options['--inspect-usage-picker']&&!options['--inspect-declared-editor'])throw Error('--inspect-usage-picker requires --inspect-declared-editor');
if(options['--select-usage-option']&&!options['--inspect-usage-picker'])throw Error('--select-usage-option requires --inspect-usage-picker');
if(options['--apply-usage-option']&&!options['--select-usage-option'])throw Error('--apply-usage-option requires --select-usage-option');
if(options['--probe-source']&&!options['--inspect-pages'])throw Error('--probe-source requires --inspect-pages');
if(options['--inspect-declared-editor']&&(!options['--inspect-pages']||options['--probe-source']||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||coldReader||packageFile||batch))
  throw Error('--inspect-declared-editor requires its own create-node page inspection');
for (const key of ['--config','--profile','--browser','--evidence']) {
  if (typeof options[key]!=='string' || !isAbsolute(options[key])) throw Error('Absolute '+key+' required');
}
if (process.versions.node!=='24.19.0' || process.platform!=='linux' || !process.env.DISPLAY) throw Error('Pinned Node24.19.0/Linux and existing DISPLAY required');
const config=JSON.parse(await readFile(options['--config'],'utf8'));
const assignment=JSON.parse(await readFile(resolve(dirname(options['--config']),'assignment.json'),'utf8'));
if (assignment.campaign_id!=='javascript-20260926-ubuntu' || resolve(options['--profile'])!==resolve(assignment.profile)) throw Error('Assigned isolated profile required');
// Only this explicit shape is accepted; no shell/environment credentials.
if (typeof config.url!=='string' || config.username!=='jsteach' || typeof config.password!=='string') throw Error('Config requires url, username=jsteach, password strings');
const address=new URL(config.url);
if (address.href!=='http://logi-test-plan.bg.local/app/') throw Error('Assigned exact target URL required');
const release=JSON.parse(await readFile(new URL('../../../product/loginom-release.json',import.meta.url),'utf8'));
const playwright=JSON.parse(await readFile(new URL('../../client/node_modules/playwright-core/package.json',import.meta.url),'utf8'));
const browsers=JSON.parse(await readFile(new URL('../../client/node_modules/playwright-core/browsers.json',import.meta.url),'utf8'));
if (playwright.version!==release.playwright || browsers.browsers.find(b=>b.name==='chromium')?.revision!==release.chromiumRevision) throw Error('Playwright/Chromium revision mismatch');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
if (digest(await readFile(process.execPath))!==release.nodeSha256 || digest(await readFile(options['--browser']))!==release.browserSha256) throw Error('Node/browser release pin mismatch');
const directory=resolve(options['--evidence']);
// Refuse reuse: no old evidence is overwritten and no uncertain run is replayed.
await mkdir(directory,{mode:0o700});
const redactor=createRedactor([config.password]);
if(batch||discoveryProbe||nativeInputOnly||nativeRoundtrip||sourceReadCycle||persistence||coldReader||packageFile||options['--server-version-only']||options['--managed-opening-probe']||options['--verify-public-node-apply']){const entries=await readdir(options['--profile']).catch(error=>{if(error.code==='ENOENT')return [];throw error;});if(entries.length)throw Error('Isolated discovery/batch requires an empty fresh assigned profile');}
const executionJournal=createExecutionJournal({directory,metadata:{sessionId:'javascript-g2',clientRevision:'operator-source',targetIdentity:{origin:address.origin,loginom_build:'7.4.2'}},redactor});
const rootReport={version:1,scope:'G1 preparation',started_at:new Date().toISOString(),status:'RUNNING',stage:'login',
  ...(coldReader||persistence||packageFile?{host_process:{pid:process.pid,started_at:new Date(performance.timeOrigin).toISOString(),profile:resolve(options['--profile'])}}:{}),
  ...(coldReader?{scope:'private G7 cold saved-package observation',original_deadline:batchDeadline,explicit_execution_limit:1,gates_closed:[]}:{}),
  ...(packageFile?{scope:'private G7 saved-package byte audit',original_deadline:batchDeadline,explicit_execution_limit:0,gates_closed:[]}:{}),
  ...(persistence?{persistence_mode:persistence.schema_mode,original_deadline:batchDeadline,explicit_execution_limit:2}:{}),
  node:process.versions.node,headless:false,server_os:{status:'not_observed'},storage:{status:'not_observed'},
  snapshots:[],effects:[],cleanup:{package_closed:false,logged_out:false,browser_closed:false},
  probes:coldReader?[]:javascriptEngineProbes.map(p=>({id:p.id,sha256:p.source_sha256,status:'not_run'}))};
let report=rootReport;
let session,page,owner,packageHandle,wizardBinding,wizardHandle,wizardRoot,openedWizard=false,closeDispatched=false,closeConfirmed=false,closeDeadline=0,wizardDeadline=0,createDeadline=0,wizardAddressEpoch=0;
let executionRuntime,executionInput,executionNode,executionPrepared,executionInputProof,executionDrop,paletteAdmission;
const ownedPackageName=()=>executionRuntime?.persistencePackage?.prepared.package_ref.name??(coldReader||packageFile?executionPrepared?.package_ref?.name:owner?.package_name);
const ownedPackagePath=()=>executionRuntime?.persistencePackage?.path??(coldReader||packageFile?executionPrepared?.package_ref?.path??null:null);
let browserLifecycle,focusGuard,inputBinding,previewCloseState={dispatched:false};
const columnState={pending:null};
let executionJournalLine=0;
let nativeClassifierBinding;
let sourceCycleUncertain=false,coldOpenPending=false,packageFileReadUncertain=false;
const sourceReaders=[];
let readingExisting=false,initialOpening={},managedSourceTask=null,managedCloseUncertain=false;
const schemaContext=()=>({root:wizardRoot,native:wizardHandle,binding:wizardBinding,prefix:owner.prefix,account:config.username,build:'7.4.2'});
const executionRecord=async event=>{
  if(discoveryProbe&&event.phase==='execution_terminal'){
    report.execution_probe.execution=event.terminal;report.execution_probe.status='execution_terminal';
    report.execution_probe.execution_started=true;
  }
  if(event.phase==='execution_terminal'&&event.terminal?.trial?.phase==='generated-mismatch'){
    const readback=report.execution_probe.existing_readback;
    readback.generated_schema_mismatch_trial=javascriptMismatchExecutionProgress(readback.generated_schema_mismatch_trial,event.terminal);
  }
  const submitted=calibrationTrial?structuredClone({...event,...(report.case_id?{case_id:report.case_id,execution_case:executionCase}:{})}):{...event,...(report.case_id?{case_id:report.case_id,execution_case:executionCase}:{})};
  const saved=await executionJournal(submitted),line=++executionJournalLine;
  const acknowledged=calibrationTrial?acknowledgeJavascriptCalibrationRecord(submitted,saved):saved;
  if(nativeRoundtrip&&report.stage==='prepare-typed-input'&&saved.phase==='node_observation_completed'
    &&saved.outcome?.output?.prepared_node_context?.verified===true
    &&saved.outcome.output.prepared_node_context.surface==='graph') {
    const context=saved.outcome.output.prepared_node_context;
    nativeClassifierBinding={context:{verified:true,surface:'graph',node_id:context.node_id,tid:context.tid},
      prefix:saved.outcome.output.workflow_ref?.prefix};
  }
  (report.execution_records??=[]).push(compactJavascriptJournalRecord(saved,line));
  await save();return acknowledged;
};
const createRemaining=()=>{const remaining=createDeadline-Date.now();if(remaining<=0)throw Error('Original package preparation deadline expired');return remaining;};
const save=async()=>{
  if(calibrationTrial){
    rootReport.calibration=calibrationTrial.coverage;
    const cleaned=redactor.redact(rootReport);
    cleaned.calibration_delivery={redacted:JSON.stringify(cleaned.calibration_result)!==JSON.stringify(rootReport.calibration_result),
      native_text_complete:rootReport.calibration_result?.failed?.native_error_complete===true||rootReport.calibration_result?.wizard?.native_text_complete===true,
      truncation_status:rootReport.calibration_result?.failed?(rootReport.calibration_result.failed.native_error_complete?'not_truncated':'truncated'):rootReport.calibration_result?.wizard?.native_text_complete===true?'not_truncated':'not_established'};
    return writeJavascriptNamedReport(directory,cleaned);
  }
  if(telemetryTrial){rootReport.schema_telemetry=telemetryTrial.coverage;return writeJavascriptNamedReport(directory,redactor.redact(rootReport));}
  if(namedTrial){rootReport.native_named=namedTrial.coverage;return writeJavascriptNamedReport(directory,redactor.redact(rootReport));}
  if(coercionTrial){rootReport.native_coercion=coercionTrial.coverage;return writeJavascriptCoercionReport(directory,redactor.redact(rootReport));}
  return writeFile(directory+'/report.json',JSON.stringify(redactor.redact(rootReport),null,2)+'\n',{mode:0o600});
};
const exact=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
const visibleOne=async locator=>{
  const visible=locator.filter({visible:true});
  if (await visible.count()!==1) throw Error('Expected one visible control');
  return visible;
};
const click=async tid=>{ await (await visibleOne(exact(tid))).click({timeout:Math.min(10000,remainingBatch())}); };
const refusalEvidence=async label=>{
  const details=await page.evaluate(()=>{
    const visible=e=>!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
    const dialogs=[...document.querySelectorAll('.x-message-box,[role="dialog"]')].filter(visible);
    return {dialogs_truncated:dialogs.length>4,dialogs:dialogs.slice(0,4).map(e=>({
      tid:e.getAttribute('data-tid'),role:e.getAttribute('role'),
      title:(e.querySelector('.x-title,[role="heading"]')?.textContent??'').slice(0,250),
      text:(e.innerText??'').slice(0,1800),text_truncated:(e.innerText??'').length>1800,
      buttons:[...e.querySelectorAll('button,[role="button"],.x-btn')].filter(visible).slice(0,12).map(b=>({
        tid:b.getAttribute('data-tid'),text:(b.innerText??'').slice(0,120),disabled:b.getAttribute('aria-disabled')??null}))
    }))};
  });
  report.snapshots.push({at:new Date().toISOString(),label,...details});await save();
  const identity=await page.evaluate(()=>globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName??null);
  if(identity!==config.username){report.snapshots.push({at:new Date().toISOString(),label:label+'-image',status:'omitted-account-unverified'});return;}
  // Private evidence only. Inputs/editors are masked; screenshots are not public
  // sanitized text and must not be committed or forwarded without inspection.
  const file=(report.case_id?report.case_id+'-'+report.snapshots.length+'-':'')+label+'.png';
  await page.screenshot({path:directory+'/'+file,fullPage:false,
    mask:[page.locator('input,textarea,[contenteditable="true"],.CodeMirror,.monaco-editor')],timeout:10000});
  report.snapshots.push({at:new Date().toISOString(),label:label+'-image',file,scope:'private-masked-viewport'});await save();
};
const paletteSnapshot=async label=>{
  const state=await page.evaluate(prefix=>{
    const rootTid=prefix+';ModelForm;pnlVendors;tree';
    const roots=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===rootTid);
    const visible=e=>!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
    const items=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid').startsWith(prefix+';ModelForm;')&&/colVendors_|pnlVendors/.test(e.getAttribute('data-tid'))&&visible(e));
    const scoped=items.filter(e=>{const tid=e.getAttribute('data-tid');return !tid.includes('colVendors_')||tid.startsWith(prefix+';ModelForm;colVendors_Компоненты>Программирование')||[prefix+';ModelForm;colVendors_Компоненты',prefix+';ModelForm;colVendors_Компоненты;TreeText',prefix+';ModelForm;colVendors_Компоненты;TreeExpander'].includes(tid);});
    const view=roots.length===1?globalThis.Ext?.getCmp?.(roots[0].id):null;
    const store=view?.getStore?.(),root=store?.getRoot?.()??store?.getRootNode?.();
    const records=new Map(),pending=root?[root]:[];let visited=0;
    while(pending.length&&visited++<2000){const r=pending.pop();if(!r||records.has(String(r.internalId)))continue;records.set(String(r.internalId),r);if(Array.isArray(r.childNodes))pending.push(...r.childNodes);}
    const nativeExpanded=e=>{
      const row=e.closest('table.x-grid-item[data-recordid]');
      if(!row||roots.length!==1||!roots[0].contains(row)||pending.length)return null;
      const record=records.get(row.getAttribute('data-recordid'));
      return record?.isModel&&typeof record.data?.expanded==='boolean'?record.data.expanded:null;
    };
    return {root_tid:rootTid,root_count:roots.length,root_visible:roots.length===1&&visible(roots[0]),truncated:scoped.length>60,scope:'programming-group-and-owner-containers',
      vendor_rows:items.filter(e=>e.getAttribute('data-tid').startsWith(prefix+';ModelForm;colVendors_')&&roots.length===1&&roots[0].contains(e)).length,
      native_tree:{available:!!root,loaded:root?.data?.loaded??null,loading:root?.data?.loading??null,records:records.size,truncated:pending.length>0},
      items:scoped.slice(0,60).map(e=>({tid:e.getAttribute('data-tid'),text:e.getAttribute('data-tid').endsWith(';TreeText')?(e.innerText??'').slice(0,120):'',
        tag:e.tagName,role:e.getAttribute('role'),classes:typeof e.className==='string'?e.className.slice(0,200):'',
        expanded:e.getAttribute('aria-expanded')??e.closest('[aria-expanded]')?.getAttribute('aria-expanded')??null,
        expanded_owner_tid:e.closest('[aria-expanded]')?.getAttribute('data-tid')??null,
        native_expanded:nativeExpanded(e),record_id:e.closest('table.x-grid-item[data-recordid]')?.getAttribute('data-recordid')??null,
        row_classes:e.closest('tr,[role="treeitem"]')?.className?.toString().slice(0,200)??null,
        in_tree:roots.length===1&&roots[0].contains(e)}))};
  },owner.prefix);
  report.snapshots.push({at:new Date().toISOString(),label,palette:state});await save();return state;
};
const observe=async()=>page.evaluate(()=>{
  const app=globalThis.bg?.app,form=app?.Application?.FInstance?.FMainForm,map=form?.FMapTree;
  const tab=form?.Items?.Workspace?.getActiveTab?.(),model=tab?.Controller?.FController;
  const graph=model?.FDiagram?.FmxGraph,collection=model?.FDiagram?.FNodes?.FCollection;
  const visible=e=>!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
  const tabs=[...document.querySelectorAll('[data-tid]')].filter(e=>/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(e.getAttribute('data-tid'))&&e.classList.contains('x-tab-active'));
  const prefix=tabs.length===1?'MF;TF'+(tabs[0].getAttribute('data-tid').match(/;tb(-\d+)?$/)?.[1]??''):null;
  const own=map?.PackageNodes?.Count===1?map.PackageNodes.Items(0):null;
  // Only own scalar data properties with relevant names, never arbitrary getter
  // invocation or RPC. Candidates retain their origin; absence proves nothing.
  const fields=[];
  for (const [path,obj] of [['bg.app',app],['FServerConnection',map?.FServerConnection]]) {
    if (!obj) continue;
    for (const [key,d] of Object.entries(Object.getOwnPropertyDescriptors(obj))) {
      if (!/^(?:F)?(?:ServerOS|ServerPlatform|OperatingSystem|OSName|PlatformEdition|Version|StoragePath|UserDirectory|FilesDirectory)$/i.test(key)) continue;
      if (typeof d.value==='string' || typeof d.value==='boolean' || typeof d.value==='number') fields.push({path:path+'.'+key,value:String(d.value).slice(0,200)});
    }
  }
  const elements=[...document.querySelectorAll('[data-tid]')].filter(visible);
  const controls=elements.filter(e=>/HomePage|WizrdMCF|JavaScript|About|FileManager|FilesForm/.test(e.getAttribute('data-tid')))
    .slice(0,120).map(e=>({tid:e.getAttribute('data-tid').slice(0,300),text:e.matches('input,textarea')?'':(e.innerText??'').slice(0,180)}));
  const nodes=Array.isArray(collection)&&collection.length<=20?collection.map(n=>{
    const dom=graph?.view?.getState(n.FCell)?.shape?.node;
    // n.data is a server proxy. Match readGraph's cached icon/GUID identity;
    // do not inspect FullType or any other property through that proxy.
    return {id:n.FGuid??null,tid:dom?.getAttribute('data-tid')??null,label:n.FLabel?.FRawValue??null,
      icon_class:typeof n.FIconCls==='string'?n.FIconCls:null,
      rendered:!!dom&&graph?.container?.contains(dom)===true};
  }):null;
  return {account:map?.FServerConnection?.UserName??null,connected:map?.FServerConnection?.Connected===true,
    build:app?.Version??null,edition:app?.PlatformEdition??null,packages:map?.PackageNodes?.Count??null,
    package_name:own?.PackageName??null,package_path:own?.PackageFileName??null,
    running:own?.HasRunningNodes?.()??null,prefix,native_model:!!app?.ModelForm&&model instanceof app.ModelForm,
    native_tab_class:tab?.Controller?.Node?.data?.node?.constructor?.name??null,fields,nodes,controls,
    controls_truncated:elements.filter(e=>/HomePage|WizrdMCF|JavaScript|About|FileManager|FilesForm/.test(e.getAttribute('data-tid'))).length>120};
});
const snapshot=async label=>{
  const state=await observe();
  report.snapshots.push({at:new Date().toISOString(),label,...state});await save();return state;
};
const guard=async()=>{
  remainingBatch();
  const s=await observe();
  if (!s.connected) throw Error('Connection unavailable');
  if (s.account!==config.username||s.build!=='7.4.2') throw Error('Account/build changed');
  const path=s.package_path?'/'+s.package_path.replaceAll('\\','/').replace(/^\/+/, ''):null;
  if (owner&&(s.packages!==1||s.package_name!==ownedPackageName()||path!==ownedPackagePath()||owner.prefix&&s.prefix!==owner.prefix)) throw Error('Owned package changed');
  if(packageHandle&&!await page.evaluate(owned=>{
    const m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
    return m?.PackageNodes?.Count===1&&m.PackageNodes.Items(0)===owned;
  },packageHandle))throw Error('Native package owner changed');
  return s;
};
const settlePackageMetadata=async()=>{
  await guard();
  const observed=await snapshot('package-metadata-observation');
  if(typeof observed.package_name==='string'&&observed.package_name.length>0&&observed.package_path==='') {
    owner={...observed,prefix:null};await guard();return;
  }
  await page.waitForFunction(({owned,account})=>{
    const m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
    if(m?.FServerConnection?.UserName!==account||m.PackageNodes?.Count!==1||m.PackageNodes.Items(0)!==owned)throw Error('Package metadata owner changed');
    if(typeof owned.PackageFileName==='string'&&owned.PackageFileName!=='')throw Error('Created package unexpectedly persisted');
    return typeof owned.PackageName==='string'&&owned.PackageName.length>0&&owned.PackageFileName==='';
  },{owned:packageHandle,account:config.username},{timeout:createRemaining()});
  const ready=await snapshot('package-metadata-ready');
  owner={...ready,prefix:null};await guard();
};
const waitGraphReady=async(timeout=60000)=>{
  timeout=Math.min(timeout,remainingBatch());
  await page.waitForFunction(({prefix,account,packageName,packagePath,owned})=>{
    const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm,m=f?.FMapTree;
    const rawPath=owned?.PackageFileName,path=rawPath?'/'+rawPath.replaceAll('\\','/').replace(/^\/+/, ''):null;
    if(m?.FServerConnection?.UserName!==account||m.PackageNodes?.Count!==1||m.PackageNodes.Items(0)!==owned||owned.PackageName!==packageName||path!==packagePath)throw Error('Graph readiness package changed');
    const roots=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===prefix+';ModelForm');
    if(roots.length>1)throw Error('Graph form owner ambiguous');
    if(roots.length===0)return false;
    const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    const model=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    const graph=model?.FDiagram?.FmxGraph,nodes=model?.FDiagram?.FNodes?.FCollection;
    const materialized=Array.isArray(nodes)&&nodes.length<=20&&nodes.every(n=>{
      const dom=graph?.view?.getState(n.FCell)?.shape?.node;
      return n.FGuid&&typeof n.FIconCls==='string'&&n.FIconCls&&dom?.isConnected&&graph.container.contains(dom)&&dom.getAttribute('data-tid')&&visible(dom);
    });
    return model?.FDiagram?.FmxGraph?.container?.getAttribute('data-tid')===prefix+';ModelForm;cmpDiagram'
      &&materialized
      &&model.FCreateDraggedNodeStarted===false&&model.FDraggingOverGraph===false&&!model.FDraggedNode
      &&!roots[0].classList.contains('bg-mask-message')&&!Array.from(document.querySelectorAll('.bg-mask-message,.x-mask-msg,[role="dialog"],.x-message-box')).some(visible);
  },{prefix:owner.prefix,account:config.username,packageName:ownedPackageName(),packagePath:ownedPackagePath(),owned:packageHandle},{timeout});
  await guard();
};
// Serialized by Playwright for both polling and diagnostics. Read only cached
// native identities: never dereference FModelNode/server proxy properties.
const waitWizardReady=async({deadline=wizardDeadline,inputOnly=true,afterIndex=null,afterPageTid=null}={})=>{
  deadline=Math.min(deadline,cleaning?Infinity:batchDeadline);
  const args={prefix:owner.prefix,owned:packageHandle,account:config.username,
    id:report.owned_node.id,binding:wizardBinding,addressEpoch:wizardAddressEpoch,expectedWizard:wizardHandle??null,expectedRoot:wizardRoot??null,inputOnly,
    initialPages:nativeRoundtrip&&executionInputProof?.verified?[owner.prefix+';WizrdMCF;TuneDataSourceInputPortWizard',owner.prefix+';WizrdMCF;JavaScriptColumnsWizard']:javascriptInitialPages(owner.prefix,executionNode,executionInputProof),afterIndex,afterPageTid};
  const record=async(label,state)=>{
    report.snapshots.push({at:new Date().toISOString(),label,remaining_ms:Math.max(0,deadline-Date.now()),...state});await save();
  };
  const initial=await page.evaluate(wizardReadiness,{...args,inspect:true});
  await record('wizard-readiness-start',initial);
  if(initial.fatal)throw Error('Wizard readiness ownership refused: '+initial.failed.join(','));
  const remaining=deadline-Date.now();
  if(remaining<=0)throw Error('Original wizard readiness deadline expired');
  let readyState;
  try {
    const result=await page.waitForFunction(wizardReadiness,args,{timeout:remaining,polling:250});
    const state=await result.jsonValue();await result.dispose();
    await record('wizard-readiness-result',state);
    if(!state.ready)throw Error('Wizard readiness ownership refused: '+state.failed.join(','));
    readyState=state;
  } catch(error) {
    // Report every predicate, including those formerly hidden by early returns.
    // Failure diagnostics are read-only and do not renew the opening deadline.
    await record('wizard-readiness-failure',await page.evaluate(wizardReadiness,{...args,inspect:true}));
    throw error;
  }
  await guard();
  if(!wizardHandle)wizardHandle=await page.evaluateHandle(()=>globalThis.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.Node.data.node);
  if(!wizardRoot)wizardRoot=await exact(owner.prefix+';WizrdMCF').elementHandle();
  if(!wizardRoot)throw Error('Ready wizard root disappeared');
  report.wizard_address=readyState.address;await save();
  return readyState;
};
const inspectWizardPages=async({remainingPages=false,deadline=phaseDeadline(180000)}={})=>{
  const visited=new Set();
  report.page_inspection_deadline=new Date(deadline).toISOString();await save();
  for(let step=0;step<=8;step++){
    const state=await waitWizardReady({deadline,inputOnly:false}),current=state.page;
    const key=JSON.stringify(current&&[current.tid,current.title,current.index]);
    if(!current||visited.has(key))throw Error('Wizard page missing or revisited; do not replay Next');
    visited.add(key);
    report.snapshots.push({at:new Date().toISOString(),label:'inspect-page',step,...current});await save();
    await snapshot('inspect-page-controls');
    if(executionCase&&!remainingPages&&current.tid.endsWith(';TuneDataSourceInputPortWizard')){
      const schema=await page.evaluate(readJavascriptSchema,schemaContext());await executionRecord({phase:'input_mapping_inventory',schema});
      if(!schema.verified)throw Error('Native JavaScript input schema contract unconfirmed');
      const fields=schema.grids.find(grid=>grid.tid===schema.page_tid+';grdTargetColumns;tbl')?.fields;
      if(nativeRoundtrip?fields?.length!==1||fields[0].Name!=='Value'||fields[0].DataType!==nativeFixture.native_type:fields?.length!==5||!fields.some(field=>field.Name==='RowID'&&field.DataType===4))throw Error('Verified fixed input mapping unavailable');
    }
    if(options['--inspect-declared-editor']&&!remainingPages&&current.tid.endsWith(';JavaScriptColumnsWizard')){
      const before=await page.evaluate(readJavascriptSchema,schemaContext());
      await executionRecord({phase:'declared_editor_admission',schema:before});
      const add=before.controls?.filter(control=>control.tid===before.page_tid+';btnAddMappingColumn');
      if(!before.verified||before.generation?.checked!==false||before.grids.find(grid=>grid.tid===before.page_tid+';grdTargetColumns;tbl')?.count!==0
        ||add?.length!==1||add[0].disabled||!add[0].visible)throw Error('Owned empty declared editor admission unavailable');
      const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']').filter({visible:true});
      const columnOnce=async(id,identity,perform)=>{
        report.effects.push({at:new Date().toISOString(),action:id,state:'dispatching',identity});await save();await perform();
      };
      let settlement;
      try{
        await openJavascriptColumnEditor({page,context:schemaContext(),index:0,state:columnState,record:executionRecord,deadline,
          once:columnOnce,
          add:()=>at(add[0].tid).click({timeout:Math.max(1,Math.min(10000,deadline-Date.now()))})});
        const inventory=await page.evaluate(observeJavascriptColumnEditor,{held:columnState.pending.held,phase:'editing',readDeclaredControls:true});
        if(inventory.status!=='ready'||!inventory.declared_controls?.cbxDataKind||!inventory.declared_controls?.cbxUsageType)
          throw Error('Owned declared control inventory unavailable: '+(inventory.reason??inventory.status));
        report.declared_editor_controls=inventory.declared_controls;await save();
        if(options['--apply-usage-option']){
          for(const field of ['edtName','edtDisplayName']){
            await fillJavascriptColumnField({page,state:columnState,record:executionRecord,once:columnOnce,deadline,
              id:'usage-column-'+field,target:field,expected:'UsageValue',
              fill:text=>at(inventory.base+';'+field).locator('input').fill(text,{timeout:Math.max(1,deadline-Date.now())})});
          }
          await openJavascriptColumnTypePicker({page,state:columnState,record:executionRecord,once:columnOnce,deadline,
            id:'usage-column-type-open',expectedType:4,expectedLabel:'Целый',click:(tid,timeout)=>at(tid).click({timeout})});
          await selectJavascriptColumnTypeOption({page,state:columnState,record:executionRecord,once:columnOnce,deadline,
            id:'usage-column-type-select',expectedType:4,expectedLabel:'Целый'});
        }
        if(options['--inspect-usage-picker']){
          const opened=await openJavascriptColumnUsagePicker({page,state:columnState,record:executionRecord,deadline,id:'usage-picker-open',
            once:columnOnce,
            click:(tid,timeout)=>at(tid).click({timeout})});
          report.declared_usage_picker=opened.usage_picker;await save();
          if(options['--select-usage-option']){
            const selected=await selectJavascriptColumnUsageOption({page,state:columnState,record:executionRecord,deadline,
              id:'usage-option-select',once:columnOnce});
            report.declared_usage_selected=selected.usage_picker;await save();
            if(options['--apply-usage-option']){
              await columnOnce('usage-column-apply',{base:inventory.base,name:'UsageValue',default_usage_type:4},async()=>{
                const current=await page.evaluate(observeJavascriptColumnEditor,
                  {held:columnState.pending.held,phase:'editing',readUsagePicker:'selected'});
                if(current.status!=='ready'||current.usage_picker?.cached_value!==4)
                  throw Error('Selected default usage changed before Apply');
                await verifyJavascriptColumnEditor({page,state:columnState,record:executionRecord,deadline,target:'btnApply'});
                columnState.pending.applyDispatched=true;
                await at(inventory.base+';btnApply').click({timeout:Math.max(1,deadline-Date.now())});
              });
            }
          }
        }
      }finally{settlement=await cleanupJavascriptColumnEditor({page,state:columnState,record:executionRecord,deadline});}
      const after=await page.evaluate(readJavascriptSchema,schemaContext());
      const target=after.grids.find(grid=>grid.tid===before.page_tid+';grdTargetColumns;tbl');
      if(options['--apply-usage-option']){
        await executionRecord({phase:'declared_usage_apply_readback',settlement,schema:after});
        const field=target?.fields?.[0];
        if(settlement?.status!=='settled'||settlement.reason!=='apply_settlement'||settlement.checks?.applied!==true
          ||after.verified!==true||target?.count!==1||field?.Name!=='UsageValue'||field.DisplayName!=='UsageValue'
          ||field.DataType!==4||field.DefaultUsageType!==4||field.Index!==0||typeof field.Required!=='boolean')
          throw Error('Applied default usage native record unconfirmed');
        report.declared_usage_applied={field,record_count:target.count,source:'native_grid_after_apply'};await save();
      }else{
        await executionRecord({phase:'declared_editor_cancel_readback',schema:after});
        const cancelled=settlement?.status==='settled'&&settlement.reason==='cancel_settlement'
          &&settlement.checks?.baseline===true&&settlement.checks?.record_removed===true
          &&settlement.checks?.writes_clean===true&&settlement.checks?.records_clean===true
          &&settlement.record_count===0&&settlement.source_count===0;
        const staleTotal=after.diagnostic_only===true&&after.reason==='JavaScript schema cache is filtered or incomplete'
          &&target?.view_bound===true&&target.store_class==='Ext.data.Store'&&target.records?.length===0
          &&target.total===settlement?.proxy_total_count&&target.total>0&&settlement.checks?.proxy_total_matches===false;
        if(!cancelled||!(after.verified===true&&target?.count===0||staleTotal))
          throw Error('Cancelled declared editor changed output schema');
        report.declared_editor_cancelled=true;report.declared_editor_stale_total=staleTotal;await save();
      }
    }
    if(coldReader&&!remainingPages&&current.tid.endsWith(';JavaScriptColumnsWizard')){
      const schema=await page.evaluate(readJavascriptSchema,schemaContext());
      if(!schema.verified||typeof schema.generation?.checked!=='boolean')throw Error('Cold observed JavaScript settings incomplete');
      report.execution_existing_schema=schema;await executionRecord({phase:'cold_schema_observed',schema});
    }
    if(executionCase&&!remainingPages&&current.tid.endsWith(';JavaScriptColumnsWizard')){
      if(readingExisting){
        const schema=await page.evaluate(readJavascriptSchema,schemaContext());
        await executionRecord({phase:'existing_schema_read',schema});
        if(!schema.verified||schema.generation?.checked!==report.execution_schema.generation.checked)throw Error('Existing JavaScript schema mode changed');
        report.execution_existing_schema=schema;
      }else report.execution_schema=await configureJavascriptSchema({page,context:schemaContext(),mode:executionCase.split('-')[0],fixedCase:discoveryProbe?.scope==='P1-business'&&discoveryProbe.schema_mode==='declared'?'business-output':persistence?.id==='persistence-usage'?'usage-output':nativeRoundtrip&&nativeFixtureId==='cardinality-empty'?'cardinality-empty':undefined,
        once:(id,identity,perform)=>executionRuntime.once(caseEffect(report.case_id,id),identity,perform),record:executionRecord,deadline,columnState});
      if(options['--verify-runtime-schema']){
        const prepared={document_id:executionPrepared.document_id,
          workflow_ref:executionPrepared.workflow_ref,
          node:{document_id:executionPrepared.document_id,workflow_id:executionPrepared.workflow_ref.workflow_id,node_id:executionNode.node_id}};
        const observed=await Function('return ('+makeJavascriptSchemaContextCode(prepared)+')')()(page);
        await executionRecord({phase:'runtime_javascript_schema_observed',schema:observed});
        if(observed.verified!==true||observed.form!==report.execution_schema.form
          ||observed.generation?.checked!==report.execution_schema.generation?.checked
          ||JSON.stringify(observed.grids)!==JSON.stringify(report.execution_schema.grids))
          throw Error('Prepared runtime JavaScript schema differs from owned operator observation');
        report.runtime_schema_observation={verified:true,form:observed.form,generation:observed.generation,
          node_context:observed.node_context,grid_count:observed.grids.length};
        await save();
      }
      if(nativeRoundtrip){
        if(nativeFixtureId==='cardinality-empty')verifyJavascriptDeclaredEmpty(report.execution_schema.declaration,report.execution_schema.declaration_sha256);
        const event={phase:'native_roundtrip_schema_bound',...await page.evaluate(bindJavascriptNativeRoundtripSchema,{...schemaContext(),schema:report.execution_schema})};
        const saved=await executionRecord(event);
        if((nativeFixtureId==='cardinality-empty'||nativeFixture.coercion||namedTrial||telemetryTrial||calibrationTrial)&&JSON.stringify(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])))!==JSON.stringify(event))throw Error('Declared schema binding journal ACK differs');
      }
    }
    if(current.visible_editors===1&&!remainingPages)return current;
    if(remainingPages&&Number.isInteger(current.index)&&current.index===current.indicator_count-1)return current;
    if(current.visible_editors>1)throw Error('Multiple visible editors on owned page');
    if(step===8||!Number.isInteger(current.index)||current.indicator_count<2||current.indicator_count>12
      ||current.index>=current.indicator_count-1)throw Error('Editor not reached within observed page bounds');
    await guard();
    if(managedSourceTask&&!remainingPages&&current.tid===owner.prefix+';WizrdMCF;JavaScriptColumnsWizard'){
      const namespace='private-managed-js-next-'+randomUUID();
      const execute=code=>Function('return ('+code+')')()(page);
      const receiptOptions=(id,key,signature)=>({receipt_namespace:namespace,receipt_id:id,receipt_signature:signature});
      const result=await dispatchManagedJavascriptNext({task:managedSourceTask,execute,record:executionRecord,receiptOptions});
      if(result.status!=='SUCCEEDED'||result.output?.next_gesture_returned!==true)
        throw Error('Managed JavaScript Next gesture refused');
      const after=await waitWizardReady({deadline:Math.min(deadline,managedSourceTask.deadline),
        inputOnly:false,afterIndex:current.index,afterPageTid:current.tid});
      if(after.page?.tid!==owner.prefix+';WizrdMCF;JavaScriptCodeWizard'
        ||after.page.index!==1||after.page.visible_editors!==1)throw Error('Managed JavaScript Next transition differs');
      report.managed_next_observation={verified:true,from_tid:current.tid,to_tid:after.page.tid,
        from_index:current.index,to_index:after.page.index,node_id:managedSourceTask.owner.node_id};
      const event={phase:'javascript_managed_next_verified',...report.managed_next_observation};
      const saved=await executionRecord(event);
      if(JSON.stringify(Object.fromEntries(Object.keys(event).map(key=>[key,saved?.[key]])))!==JSON.stringify(event))
        throw Error('Managed JavaScript Next verification journal ACK differs');
      await save();
      continue;
    }
    const point=await page.evaluate(({prefix,root,native,binding,current})=>{
      const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
      const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
      if(tab!==binding.tab||tab?.Controller?.Node?.data?.node!==native||tab.Controller.FController?.FView?.el?.dom!==root
        ||tab.Controller.FController?.FModelNode!==binding.nodeData)throw Error('Next wizard owner changed');
      const exact=tid=>[...root.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')].filter(visible);
      const pageRoots=exact(current.tid),titles=exact(prefix+';WizrdMCF;cardWizardPanel;p.h;p.t');
      const groups=exact(prefix+';WizrdMCF;rgpBottom'),group=groups.length===1&&globalThis.Ext?.getCmp?.(groups[0].id);
      const radios=current.indicators.map(entry=>{
        const control=globalThis.Ext?.getCmp?.(entry.id);
        const elements=[...root.querySelectorAll('[data-tid='+JSON.stringify(entry.tid)+']')],inputs=[...root.querySelectorAll('[data-tid='+JSON.stringify(entry.tid+';InputEl')+']')];
        const owners=new Set();for(let c=control;c&&owners.size<16&&!owners.has(c);c=c.ownerCt)owners.add(c);
        if(elements.length!==1||control?.el?.dom!==elements[0]||!groups[0]?.contains(elements[0])||!owners.has(group)
          ||inputs.length!==1||control.inputEl?.dom!==inputs[0]||control.checked!==entry.checked
          ||elements[0].classList.contains('x-form-cb-checked')!==entry.checked)throw Error('Native page indicator changed');
        return control;
      });
      if(pageRoots.length!==1||titles.length!==1||titles[0].textContent.trim()!==current.title
        ||groups.length!==1||group?.el?.dom!==groups[0]
        ||radios.length!==current.indicator_count||radios.filter(e=>e.checked).length!==1||!radios[current.index]?.checked
        ||!visible(radios[current.index]?.el?.dom))throw Error('Next source page changed');
      const buttons=exact(prefix+';WizrdMCF;btnNext'),button=buttons[0],control=button&&globalThis.Ext?.getCmp?.(button.id);
      if(buttons.length!==1||control?.el?.dom!==button||control.disabled===true
        ||button.closest('.x-item-disabled,.x-btn-disabled')||button.getAttribute('aria-disabled')==='true')throw Error('Owned Next unavailable');
      const bounds=button.getBoundingClientRect(),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
      const hit=document.elementFromPoint(x,y);
      if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===button||button.contains(hit)))throw Error('Owned Next covered');
      return{x,y,tid:button.getAttribute('data-tid')};
    },{prefix:owner.prefix,root:wizardRoot,native:wizardHandle,binding:wizardBinding,current});
    if(Date.now()>=deadline)throw Error('Original page inspection deadline expired before Next');
    report.effects.push({at:new Date().toISOString(),action:'wizard-next',state:'dispatching',step,from:current,control:point.tid});await save();
    if(Date.now()>=deadline)throw Error('Original page inspection deadline expired before Next');
    await page.mouse.click(point.x,point.y);
    // Observe the outcome once under the same deadline. Never resend Next on
    // timeout: cleanup may only discard the original, settled wizard draft.
    await waitWizardReady({deadline,inputOnly:false,afterIndex:current.index,afterPageTid:current.tid});
  }
  throw Error('Page inspection bound reached');
};
const probeOwnedSource=async (baseline,executionSource=null)=>{
  const deadline=phaseDeadline(120000);
  report.source_probe_deadline=new Date(deadline).toISOString();await save();
  await waitWizardReady({deadline,inputOnly:false});
  if((sourceReadCycle||persistence)&&executionSource!==null){
    if(redactor.text(baseline)!==baseline)throw Error('Source baseline redacted before owned write');
    const sourceOwner={operation_id:persistence?'source99-draft-'+digest(executionSource).slice(0,12):'source97-draft',document_id:executionPrepared.document_id,
      workflow_id:executionPrepared.workflow_ref.workflow_id,node_id:executionNode.node_id,ui_epoch:wizardAddressEpoch};
    const writer=createJavascriptSourceWriter({page,context:schemaContext(),owner:sourceOwner,
      epoch:wizardAddressEpoch,deadline,record:executionRecord});
    try{
      report.source_write=await writer.replace({expected_source_sha256:digest(baseline),source_text:executionSource});
      await save();return;
    }catch(error){
      if(error.code==='JAVASCRIPT_SOURCE_WRITE_UNCERTAIN')sourceCycleUncertain=true;
      throw error;
    }
  }
  const handle=await page.evaluateHandle(({root,native,binding})=>{
    const wrappers=[...root.querySelectorAll('.CodeMirror')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden');
    if(wrappers.length!==1)throw Error('Probe editor is ambiguous');
    const wrapper=wrappers[0],cm=wrapper.CodeMirror,doc=cm?.getDoc?.(),input=cm?.getInputField?.();
    if(!doc||!input||cm.getWrapperElement()!==wrapper||!wrapper.contains(input))throw Error('Probe editor identity missing');
    return{root,native,binding,wrapper,cm,doc,input};
  },{root:wizardRoot,native:wizardHandle,binding:wizardBinding});
  const read=async(focus=false)=>page.evaluate(({h,focus})=>{
    const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    if(tab!==h.binding.tab||tab?.Controller?.Node?.data?.node!==h.native||tab.Controller.FController?.FView?.el?.dom!==h.root
      ||tab.Controller.FController?.FModelNode!==h.binding.nodeData||!h.root.contains(h.wrapper)||!h.wrapper.isConnected
      ||h.cm.getWrapperElement()!==h.wrapper||h.cm.getDoc()!==h.doc||h.cm.getInputField()!==h.input||!h.wrapper.contains(h.input)
      ||h.cm.getOption('readOnly')!==false||h.input.disabled||h.input.readOnly||focus&&document.activeElement!==h.input)throw Error('Probe owner/document/focus changed');
    const count=h.doc.lineCount();
    if(count<1||count>1024||h.doc.firstLine()!==0||h.doc.lastLine()!==count-1)throw Error('Probe document outside line bound');
    const lines=[];let bytes=0;
    for(let i=0;i<count;i++){
      const line=h.doc.getLine(i);
      if(typeof line!=='string'||/[\r\n\0]/.test(line))throw Error('Probe document has unsupported characters');
      bytes+=new TextEncoder().encode(line).length+(i?1:0);if(bytes>32768)throw Error('Probe document outside byte bound');lines.push(line);
    }
    return{source:lines.join('\n'),bytes,lines:count};
  },{h:handle,focus});
  const first=await read();
  if(first.source!==baseline||redactor.text(baseline)!==baseline)throw Error('Probe baseline changed or redacted');
  const replace=async(method,source,label)=>{
    if(Date.now()>=deadline)throw Error('Original source probe deadline expired');
    await waitWizardReady({deadline,inputOnly:false});
    const before=await read();
    if(executionSource!==null&&before.source!==baseline)throw Error('Expected old source changed before replacement');
    const point=await page.evaluate(h=>{
      const b=h.wrapper.getBoundingClientRect(),x=b.x+Math.min(35,b.width/2),y=b.y+Math.min(15,b.height/2),hit=document.elementFromPoint(x,y);
      if(x<0||y<0||x>=innerWidth||y>=innerHeight||!h.wrapper.contains(hit))throw Error('Probe editor covered');
      return{x,y};
    },handle);
    await page.mouse.click(point.x,point.y);
    if((await read(true)).source!==before.source)throw Error('Source changed during focus');
    report.effects.push({at:new Date().toISOString(),action:'source-replace',state:'dispatching',label,method,
      before_sha256:digest(before.source),expected_sha256:digest(source)});await save();
    if(Date.now()>=deadline)throw Error('Original source probe deadline expired before input');
    const started=Date.now();
    await page.keyboard.press('Control+A');
    if((await read(true)).source!==before.source)throw Error('Source changed before replacement');
    await page.keyboard.press('Backspace');
    if((await read(true)).source!=='')throw Error('Owned editor did not clear');
    if(method==='type')await page.keyboard.type(source,{delay:0});
    else await page.keyboard.insertText(source);
    const result=await read(true);
    const exact=result.source===source;
    report.snapshots.push({at:new Date().toISOString(),label:'source-probe-result',probe:label,method,exact,
      elapsed_ms:Date.now()-started,bytes:result.bytes,lines:result.lines,sha256:digest(result.source),
      expected_sha256:digest(source),redaction_changed:redactor.text(result.source)!==result.source});await save();
    if(Date.now()>=deadline)throw Error('Original source probe deadline expired after input');
    return exact;
  };
  if(executionSource!==null){
    if(!await replace('insertText',executionSource,'execution-case-source'))throw Error('Execution source full readback differs');
    await handle.dispose();return;
  }
  const typed=await replace('type',javascriptSourceSample,'sample-type');
  const inserted=await replace('insertText',javascriptSourceSample,'sample-insertText');
  report.source_probe_verdict={status:'INCOMPLETE',sample:{type_exact:typed,insert_text_exact:inserted},
    selected_method:inserted?'insertText':typed?'type':null,boundary_exact:null,boundary_status:'not_run',baseline_restored:false,full_g4_status:'not_closed'};await save();
  if(!typed&&!inserted)throw Error('No exact source input method; discard draft');
  if(inserted){
    report.source_probe_verdict.boundary_status='pending';await save();
    report.source_probe_verdict.boundary_exact=await replace('insertText',javascriptSourceBoundary,'boundary-insertText');
    report.source_probe_verdict.boundary_status='observed';await save();
  }
  const restoreMethod=inserted?'insertText':'type';
  if(!await replace(restoreMethod,baseline,'restore-baseline'))throw Error('Exact baseline restore failed; discard draft');
  report.source_probe_baseline_restored=true;
  report.source_probe_verdict.baseline_restored=true;
  report.source_probe_verdict.status=report.source_probe_verdict.boundary_exact===true?'PROBE_PASS':'INCOMPLETE';
  report.source_probe_verdict.full_g4_status='not_closed';
  await save();await handle.dispose();
  if(report.source_probe_verdict.boundary_exact!==true)throw Error('Baseline restored, but G4 boundary exactness is not proven');
};
const closeWizardOnce=async()=>{
  const remaining=()=>{const ms=closeDeadline-Date.now();if(ms<=0)throw Error('Original wizard close deadline expired; do not replay Close');return ms;};
  if(!closeDispatched){
    // Cleanup admits the actually open owned wizard on any recognized page.
    // Its one deadline is independent of an expired opening/page expectation;
    // full native identity, quiet-state and close-control checks still apply.
    if(!closeDeadline)closeDeadline=phaseDeadline(60000);
    await waitWizardReady({deadline:closeDeadline,inputOnly:false});
    report.effects.push({at:new Date().toISOString(),action:'wizard-close',state:'dispatching',deadline:new Date(closeDeadline).toISOString()});await save();
    closeDispatched=true;
    await (await visibleOne(exact(owner.prefix+';WizrdMCF;btnClose'))).click({timeout:remaining()});
  }
  const result=await page.waitForFunction(({root,native})=>{
    const visible=e=>e&&e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    const dialogs=[...document.querySelectorAll('.x-message-box,[role="dialog"]')].filter(visible);
    if(!visible(root)&&dialogs.length===0)return 'closed';
    const current=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.Node?.data?.node;
    if(visible(root)&&current!==native)throw Error('Wizard close owner changed');
    if(dialogs.length===1&&visible(root)){
      const text=(dialogs[0].innerText??'').replace(/\s+/g,' ').trim();
      if(text==='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет')return 'confirmation';
      throw Error('Unexpected wizard close dialog');
    }
    return false;
  },{root:wizardRoot,native:wizardHandle},{timeout:remaining()});
  const state=await result.jsonValue();await result.dispose();
  if(state==='confirmation'){
    await guard();await refusalEvidence('owned-wizard-close-confirmation');
    if(closeConfirmed)throw Error('Wizard close confirmation already dispatched; do not replay');
    const yes=await visibleOne(page.locator('.x-message-box:visible,[role="dialog"]:visible').locator('[data-tid="msgbox;tlb;yes"]'));
    if((await yes.innerText()).trim()!=='Да')throw Error('Wizard confirmation button changed');
    report.effects.push({at:new Date().toISOString(),action:'wizard-close-confirmation',state:'dispatching'});await save();
    closeConfirmed=true;await yes.click({timeout:remaining()});
  }
  await exact(owner.prefix+';WizrdMCF').waitFor({state:'hidden',timeout:remaining()});
  await waitGraphReady(remaining());
  const after=await snapshot('wizard-close-settled');
  if(!after.nodes?.some(n=>n.id===report.owned_node.id&&n.icon_class===report.owned_node.icon_class&&n.rendered))throw Error('Closed wizard did not restore owned node');
  openedWizard=false;
};
const readOwnedExecutionSource=()=>page.evaluate(({root,native,binding})=>{
      const tab=globalThis.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
      if(tab!==binding.tab||tab.Controller.Node.data.node!==native||tab.Controller.FController.FView.el.dom!==root)throw Error('Existing source owner changed');
      const wrappers=[...root.querySelectorAll('.CodeMirror')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
      if(wrappers.length!==1)throw Error('Existing source editor ambiguous');
      const doc=wrappers[0].CodeMirror?.getDoc?.(),count=doc?.lineCount?.();
      if(!Number.isInteger(count)||count<1||count>1024||doc.firstLine()!==0||doc.lastLine()!==count-1)throw Error('Existing source outside bounds');
      const lines=[];let bytes=0;
      for(let i=0;i<count;i++){const line=doc.getLine(i);if(typeof line!=='string'||/[\r\n\0]/.test(line))throw Error('Existing source line differs');bytes+=new TextEncoder().encode(line).length+(i?1:0);if(bytes>32768)throw Error('Existing source outside byte bound');lines.push(line);}
      return lines.join('\n');
    },schemaContext());
const runSourceReadCycle=async(probe,deadline,expectedSettings,{allowConfiguredOnly=false}={})=>{
  // Baseline was explicitly committed/executed by setup. No execution method is
  // reachable from this adapter; Next stops on the code page, Close discards.
  const boundary=await executionRuntime.captureExecutionBoundary();
  const processes=await page.evaluateHandle(observeJavascriptSourceProcesses,{capture:true});
  const sourceOwner={operation_id:persistence?'source99-'+probe.source_sha256.slice(0,12):'source97',document_id:executionPrepared.document_id,
    workflow_id:executionPrepared.workflow_ref.workflow_id,node_id:executionNode.node_id,ui_epoch:wizardAddressEpoch};
  const expectedGeneration=report.execution_schema.generation.checked;
  const checkBoundary=async()=>{
    if(Date.now()>=deadline)throw Error('Source cycle original deadline expired');
    await executionRuntime.verifyExecutionBoundary(boundary);
    return page.evaluate(observeJavascriptSourceProcesses,{held:processes});
  };
  const createReader=readerOwner=>{
    const reader=createJavascriptSourceReader({owner:readerOwner,deadline,redactor,record:executionRecord,
      adapter:{
        async open(){
          await checkBoundary();
          await executionRuntime.reopen(executionNode,deadline);wizardAddressEpoch++;
          wizardHandle=null;wizardRoot=null;openedWizard=true;closeDispatched=false;closeConfirmed=false;closeDeadline=0;
          wizardDeadline=Math.min(deadline,phaseDeadline(90000));
          await executionRuntime.handoffReopenedWizard();
          await waitWizardReady({deadline:wizardDeadline});readingExisting=true;report.execution_existing_schema=null;
          await inspectWizardPages({deadline});
          const context=schemaContext(),epoch=wizardAddressEpoch;
          const held=await page.evaluateHandle(observeJavascriptSource,{context,owner:readerOwner,epoch,capture:true});
          return {held,context,epoch,settings:javascriptSourceSettings(report.execution_existing_schema)};
        },
        async read(handle){
          await waitWizardReady({deadline,inputOnly:false});
          const observed=await page.evaluate(observeJavascriptSource,{...handle,owner:readerOwner});
          return {...observed,settings:handle.settings};
        },
        async discard(handle){
          if(Date.now()>=deadline)throw Error('Source discard deadline expired');
          closeDeadline=deadline;
          await closeWizardOnce();
          await handle.held.dispose();
          await executionRuntime.settleClosedExecutionBoundary(boundary,executionNode,deadline);
          await checkBoundary();
          return {closed:true,owner:readerOwner};
        }
      }});
    sourceReaders.push(reader);return reader;
  };
  try{
    report.source_read_cycle=await verifyJavascriptSourceCycle({createReader,owner:sourceOwner,
      readMappings:async()=>({input:await executionRuntime.readPortMapping(executionNode,'input',{operationDeadline:deadline}),
        output:await executionRuntime.readPortMapping(executionNode,'output',{operationDeadline:deadline,allowConfiguredOnly})}),
      checkBoundary,record:executionRecord,expectedSource:probe.source,expectedSettings,expectedGeneration});
    await save();return structuredClone(report.source_read_cycle);
  }catch(error){sourceCycleUncertain=true;throw error;}
  finally{await processes.dispose();await boundary.native.dispose();}
};
const runColdRead=async()=>{
  const deadline=batchDeadline;
  const boundary=await executionRuntime.captureExecutionBoundary();
  let processes;
  try{
    await executionRuntime.prepareSourceProcessHistory(executionNode,deadline);
    await executionRuntime.verifyExecutionBoundary(boundary);
    processes=await page.evaluateHandle(observeJavascriptSourceProcesses,{capture:true});
  }catch(error){sourceCycleUncertain=true;await boundary.native.dispose();throw error;}
  const sourceOwner={operation_id:'source99-cold',document_id:executionPrepared.document_id,
    workflow_id:executionPrepared.workflow_ref.workflow_id,node_id:executionNode.node_id,ui_epoch:wizardAddressEpoch};
  const checkReadBoundary=async()=>{
    remainingBatch();await executionRuntime.verifyExecutionBoundary(boundary);
    return page.evaluate(observeJavascriptSourceProcesses,{held:processes});
  };
  const gate=createJavascriptColdSource({owner:sourceOwner,deadline,redactor,record:executionRecord,
    sourceAdapter:async readerOwner=>({
      async open(){
        await checkReadBoundary();
        await executionRuntime.reopen(executionNode,deadline);wizardAddressEpoch++;
        wizardHandle=null;wizardRoot=null;openedWizard=true;closeDispatched=false;closeConfirmed=false;closeDeadline=0;
        wizardDeadline=phaseDeadline(90000);report.execution_existing_schema=null;
        await executionRuntime.handoffReopenedWizard();
        await waitWizardReady({deadline:wizardDeadline,inputOnly:false});
        await inspectWizardPages({deadline});
        const context=schemaContext(),epoch=wizardAddressEpoch;
        const held=await page.evaluateHandle(observeJavascriptSource,{context,owner:readerOwner,epoch,capture:true});
        return {held,context,epoch,settings:javascriptSourceSettings(report.execution_existing_schema)};
      },
      async read(handle){
        await waitWizardReady({deadline,inputOnly:false});
        return {...await page.evaluate(observeJavascriptSource,{...handle,owner:readerOwner}),settings:handle.settings};
      },
      async discard(handle){
        remainingBatch();closeDeadline=deadline;await closeWizardOnce();await handle.held.dispose();
        await executionRuntime.settleClosedExecutionBoundary(boundary,executionNode,deadline);
        await checkReadBoundary();return {closed:true,owner:readerOwner};
      }
    })});
  const mappings=async(allowConfiguredOnly=false)=>({input:await executionRuntime.readPortMapping(executionNode,'input',{operationDeadline:deadline}),
    output:await executionRuntime.readPortMapping(executionNode,'output',{operationDeadline:deadline,allowConfiguredOnly})});
  try{
    report.stage='cold-read-source';
    const source=await gate.read();
    report.cold={status:'SOURCE_OBSERVED',path:ownedPackagePath(),prepared:structuredClone(executionPrepared),
      node:structuredClone(executionNode),source,graph_before:boundary.before,mappings_before:await mappings(true)};
    javascriptMappingState(report.cold.mappings_before.input,executionNode,{direction:'input'});
    javascriptMappingState(report.cold.mappings_before.output,executionNode,{direction:'output',allowConfiguredOnly:true});
    await checkReadBoundary();await save();
    report.stage='cold-execute';
    const execution=await gate.execute(async checked=>{
      await checkReadBoundary();
      return executionRuntime.executeNode(executionNode,deadline,checked.policy.source_sha256);
    });
    if(execution?.verified!==true||execution.owner_verified!==true||execution.cleanup_complete!==true||execution.status!=='completed'
      ||!execution.execution_id||execution.trial?.node_id!==executionNode.node_id||execution.trial.source_sha256!==source.source_sha256
      ||JSON.stringify(execution.fresh_baseline?.node)!==JSON.stringify(executionNode)
      ||JSON.stringify(execution.launch_identity?.node)!==JSON.stringify(executionNode)
      ||execution.launch_identity.execution_id!==execution.execution_id||execution.launch_identity.group_id!==execution.group_id
      ||!Array.isArray(execution.fresh_baseline.roots)||execution.fresh_baseline.roots.some(row=>row.process_id===execution.group_id))
      throw Error('Cold new owned execution unconfirmed');
    report.cold.execution=execution;await save();report.stage='cold-read-output';
    report.cold.output=await executionRuntime.readOutput(executionNode,deadline);
    report.cold.mappings_after=await mappings();
    javascriptMappingState(report.cold.mappings_after.input,executionNode,{direction:'input'});
    javascriptMappingState(report.cold.mappings_after.output,executionNode,{direction:'output'});
    await executionRuntime.verifyExecutionBoundary(boundary);
    report.cold.graph_after=await executionRuntime.graph();
    remainingBatch();report.cold.status='COLD_OBSERVED';report.cold.persistence_verified=false;
    report.cold.package_bytes_verified=false;await save();
  }catch(error){
    if(gate.state==='retired'||gate.state==='effect_dispatched')sourceCycleUncertain=true;
    throw error;
  }finally{await processes.dispose();await boundary.native.dispose();}
};
const runExecutionTrial=async probe=>{
  const deadline=persistence?batchDeadline:phaseDeadline(600000),trigger=executionCase.split('-').at(-1),sentinel=executionCase.includes('-sentinel-');
  let trialPhase='initial',sourceSha=probe.source_sha256,roundtripDone,calibrationObserving=false,committedSource=probe.source;
  const read=async()=>{
    const snapshot=await page.evaluate(readJavascriptStage,schemaContext());
    if(calibrationObserving&&snapshot.wizard_visible&&!snapshot.pending&&!snapshot.boundary_refusal)
      snapshot.calibration_native_exception=await page.evaluate(readCalibrationWizard);
    return {...snapshot,messages:snapshot.messages.map(message=>({...message,id:digest(message.key+'\n'+message.text)}))};
  };
  const dispatch=async(stage,tid,index)=>{
    await guard();const before=await read();
    const identity={effect_id:caseEffect(report.case_id,executionCase+':'+trialPhase+':'+stage+':'+index),node_id:executionNode.node_id,source_sha256:sourceSha};
    await requireJavascriptStageAdmission({stage,before,identity,record:executionRecord});
    const point=await exact(tid).filter({visible:true}).evaluate(element=>{
      const control=globalThis.Ext?.getCmp?.(element.id),b=element.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);
      if(control?.el?.dom!==element||control.disabled===true||element.getAttribute('aria-disabled')==='true'
        ||!(hit===element||element.contains(hit)))throw Error('Execution control native binding or hit-test refused');
      return {x,y};
    });
    await executionRuntime.once(identity.effect_id,{...identity,before},async()=>{
      if(nativeRoundtrip){
        const attestation=await page.evaluate(prepareJavascriptNativeRoundtripWizard,{context:schemaContext(),before,identity,stage,deadline});
        const saved=await executionRecord({phase:'native_roundtrip_wizard_preflight',attestation});
        if(JSON.stringify(saved.attestation)!==JSON.stringify(attestation))throw Error('Wizard preflight journal ACK differs');
        if(calibrationTrial){
          const baseline=await page.evaluate(beginCalibrationWizard,{id:nativeCalibrationId,stage,identity,deadline});
          const savedBaseline=await executionRecord({phase:'calibration_wizard_baseline',baseline});
          if(JSON.stringify(savedBaseline.baseline)!==JSON.stringify(baseline))throw Error('Calibration baseline journal ACK differs');
          await page.evaluate(checkCalibrationWizardBaseline);
          calibrationObserving=true;
        }
      }
      await page.mouse.click(point.x,point.y);
    });
    // Wait only on the result of the original dispatch. Neither a timeout nor
    // lack of a sentinel authorizes another click.
    const after=await waitJavascriptStageObservation({read,wait:ms=>page.waitForTimeout(ms),deadline,stage,before,identity,record:executionRecord});
    const terminal=!after?.wizard_error_refusal&&javascriptStageTerminal({stage,before,after});
    const outcome=javascriptSentinelOutcome({stage,identity,baselineIds:before.messages.map(message=>message.id),
      messages:(after?.messages??[]).map(message=>({...message,...identity})),ownerVerified:after?.owner_verified===true,terminal});
    await executionRecord({phase:'execution_stage_observed',identity,before,after,outcome});
    if(after?.wizard_error_refusal){
      const error=await captureJavascriptWizardError({page,read,identity,stage,before,after,record:executionRecord,deadline});
      report.execution_probe.wizard_error=error;await save();
      if(discoveryProbe){
        report.discovery_result=javascriptDiscoveryErrorButtonDiagnostic({probe,identity,error});
        await executionRecord({phase:'discovery_wizard_error',diagnostic:report.discovery_result});await save();
        return {...outcome,discovery_diagnostic:true,wizard_error:true};
      }
      throw Error('Native wizard refusal: '+error.dialog_text);
    }
    if(after?.boundary_refusal)throw Error('Execution stage boundary refused: '+after.boundary_refusal);
    if(calibrationTrial&&after?.calibration_native_exception?.present){
      const witness=await page.evaluate(captureCalibrationWizard,{id:nativeCalibrationId,stage,identity,before,after});
      report.calibration_result=await calibrationTrial.wizard({witness,record:executionRecord});calibrationObserving=false;await save();
      return {...outcome,calibration_diagnostic:true};
    }
    if(nativeRoundtrip&&after?.messages?.some(m=>!before.messages.some(old=>old.id===m.id)))throw Error('Native roundtrip wizard diagnostic; no replay');
    if(!terminal)throw Error('Execution stage result remains unconfirmed: '+stage);
    if(calibrationTrial){await page.evaluate(finishCalibrationWizardObservation);calibrationObserving=false;}
    if(discoveryProbe){
      const diagnostic=javascriptDiscoveryWizardDiagnostic({probe,identity,stage,before,after});
      if(diagnostic){report.discovery_result=diagnostic;await executionRecord({phase:'discovery_wizard_diagnostic',diagnostic});
        await save();return {...outcome,discovery_diagnostic:true};}
    }
    if(nativeRoundtrip&&stage==='done')roundtripDone={identity,confirmation:{effect_settled:true,terminal,after,no_new_messages:!after.messages.some(m=>!before.messages.some(old=>old.id===m.id))}};
    if(stage==='next'&&after.page_tid!==before.page_tid)report.execution_page_transition={from:before.page_tid,to:after.page_tid};
    return outcome;
  };
  if(trigger==='preview'){
    const outcome=await dispatch('preview',owner.prefix+';WizrdMCF;JavaScriptCodeWizard;btnPreview',0);
    report.execution_probe.outcome=outcome;
    await closeJavascriptPreviewOnce({read,state:previewCloseState,record:executionRecord,
      close:()=>executionRuntime.once(caseEffect(report.case_id,'preview-close'),{node_id:executionNode.node_id},()=>click(owner.prefix+';WizrdMCF;JavaScriptOutputPreviewForm;p.h;close')),
      waitHidden:()=>exact(owner.prefix+';WizrdMCF;JavaScriptOutputPreviewForm').waitFor({state:'hidden'})});
    return;
  }
  for(let step=0;step<8;step++){
    const state=await waitWizardReady({deadline,inputOnly:false});
    if(state.page.tid.endsWith(';DoneWizard'))break;
    const outcome=await dispatch('next',owner.prefix+';WizrdMCF;btnNext',step);
    if(outcome.sentinel_observed||outcome.discovery_diagnostic||outcome.calibration_diagnostic||trigger==='next'){
      report.execution_probe.outcome=outcome;return;
    }
    if(step===7)throw Error('Done page not reached within bounded transitions');
  }
  const done=await waitWizardReady({deadline,inputOnly:false});
  if(!done.page.tid.endsWith(';DoneWizard'))throw Error('Exact Done page required');
  const outcome=await dispatch('done',owner.prefix+';WizrdMCF;btnDone',0);
  report.execution_probe.done_outcome=outcome;
  if(outcome.sentinel_observed||outcome.discovery_diagnostic||outcome.calibration_diagnostic){report.execution_probe.outcome=outcome;return;}
  await exact(owner.prefix+';WizrdMCF').waitFor({state:'hidden',timeout:Math.max(1,deadline-Date.now())});
  openedWizard=false;await waitGraphReady(Math.max(1,deadline-Date.now()));
  if(trigger==='done'){report.execution_probe.outcome=outcome;return;}
  if(nativeRoundtrip){
    const attestation=await page.evaluate(sealJavascriptNativeRoundtripDone,roundtripDone);
    const saved=await executionRecord({phase:'native_roundtrip_done_sealed',attestation});
    if(JSON.stringify(saved.attestation)!==JSON.stringify(attestation))throw Error('Done seal journal ACK differs');
    if(calibrationTrial){
      report.calibration_result=await calibrationTrial.run({runtime:executionRuntime,input:executionInput,node:executionNode,sourceProbe:probe,deadline,
        record:executionRecord,onExecution:async execution=>{report.execution_probe.execution=execution;await save();}});
      report.stage='calibration-awaiting-finalization';await save();return;
    }
    if(coercionTrial){
      report.native_roundtrip=await coercionTrial.run({runtime:executionRuntime,input:executionInput,node:executionNode,sourceProbe:probe,deadline,
        record:executionRecord,onExecution:async execution=>{report.execution_probe.execution=execution;await save();}});
      report.stage='native-coercion-awaiting-finalization';report.gates_closed=[];await save();return;
    }
    if(telemetryTrial){
      report.native_roundtrip=await telemetryTrial.run({runtime:executionRuntime,input:executionInput,node:executionNode,sourceProbe:probe,deadline,
        record:executionRecord,onExecution:async execution=>{report.execution_probe.execution=execution;}});
      report.stage='schema-telemetry-awaiting-finalization';report.gates_closed=[];await save();return;
    }
    if(namedTrial){
      report.native_roundtrip=await namedTrial.run({runtime:executionRuntime,input:executionInput,node:executionNode,sourceProbe:probe,deadline,
        record:executionRecord,onExecution:async execution=>{report.execution_probe.execution=execution;}});
      report.stage='native-named-awaiting-finalization';report.gates_closed=[];await save();return;
    }
    await executionRuntime.checkNativeRoundtripBeforeExecute();
    const boundary=await executionRuntime.captureExecutionBoundary();
    try{
      const execution=await executionRuntime.executeNode(executionNode,deadline,{phase:'initial',source_sha256:probe.source_sha256});
      report.execution_probe.execution=execution;await save();
      await executionRuntime.verifyExecutionBoundary(boundary);
      report.native_roundtrip=await executionRuntime.readNativeRoundtrip(executionInput,executionNode,execution);
      await executionRuntime.verifyExecutionBoundary(boundary);
      report.stage=report.native_roundtrip.outcome?.characterization_only?'native-roundtrip-characterized':'native-roundtrip-observed';report.gates_closed=[];await save();return;
    }finally{await boundary.native.dispose();}
  }
  if(discoveryProbe){
    const boundary=await executionRuntime.captureExecutionBoundary();
    try{
      await verifyBatchInputIdentity();
      if(discoveryProbe.scope==='P1-stop'){
        report.stage='p1-stop-finite';report.explicit_execution_limit=2;await save();
        report.stop_result=await runJavascriptStopProbe({page,runtime:executionRuntime,prepared:executionPrepared,
          node:executionNode,probe,deadline,record:executionRecord,redactor,
          onSourcePending:value=>{managedCloseUncertain=value;}});
        await executionRuntime.verifyExecutionBoundary(boundary);await verifyBatchInputIdentity();
        report.stop_result.boundary_verified=true;await save();return;
      }
      const mappingBefore=materializationProbe
        ?await executionRuntime.readPortMapping(executionNode,'output',{operationDeadline:deadline,allowConfiguredOnly:true}):undefined;
      const execution=await executionRuntime.executeNode(executionNode,deadline,{phase:'initial',source_sha256:probe.source_sha256});
      report.execution_probe.execution=execution;await save();
      await executionRuntime.verifyExecutionBoundary(boundary);await verifyBatchInputIdentity();
      const mappingAfter=mappingBefore?await executionRuntime.readPortMapping(executionNode,'output',
        {operationDeadline:deadline,allowConfiguredOnly:true,allowOwnedUnlock:true}):undefined;
      const readExecution=mappingBefore?await executionRuntime.executeNode(executionNode,deadline,
        {phase:'materialization-final',source_sha256:probe.source_sha256}):execution;
      if(mappingBefore){report.materialization_initial_execution=execution;report.execution_probe.execution=readExecution;await save();}
      const result=await observeJavascriptDiscovery({probe,node:executionNode,execution:readExecution,
        previousExecution:mappingBefore?execution:undefined,deadline,
        readOutput:()=>executionRuntime.readPassive(executionNode,mappingBefore?'bridge':'discovery',deadline),record:executionRecord,
        onProgress:async progress=>{report.discovery_result={...progress,oracle_passed:progress.gate_passed,gate_passed:false,boundary_verified:false};await save();}});
      await executionRuntime.verifyExecutionBoundary(boundary);await verifyBatchInputIdentity();
      if(mappingBefore){
        report.materialization_result=javascriptMaterializationObservation({node:executionNode,
          before:mappingBefore,after:mappingAfter,table:result.output});
        await executionRecord({phase:'c0_materialization_observed',...report.materialization_result});
        if(discoveryProbe.scope==='G3-bridge'){
          const projected={...result.output,schema:result.output.schema.slice(0,4),
            sample:result.output.sample.map(row=>row.slice(0,4))};
          const businessOracle=javascriptDiscoveryOracle(javascriptDiscoveryProbe('p1-business-code-base'),projected);
          report.bridge_result={...javascriptBridgeObservation({node:executionNode,before:mappingBefore,
            after:mappingAfter,table:result.output}),business_oracle:businessOracle};
          result.gate_passed=report.bridge_result.bridge_verified&&businessOracle.gate_passed;
          result.status=result.gate_passed?'logical_physical_bridge_verified':'logical_physical_characterization';
          await executionRecord({phase:'g3_bridge_observed',...report.bridge_result});
        }
      }
      report.discovery_result={...result,boundary_verified:true};await save();return;
    }finally{await boundary.native.dispose();}
  }
  const execution=await executionRuntime.executeNode(executionNode,deadline,{phase:'initial',source_sha256:probe.source_sha256});
  report.execution_probe.execution=execution;
  if(sentinel){
    // Failed launch groups may fail in an upstream dependency. Retain the
    // fresh execution identity, but do not claim JS-body ownership from it.
    const identity={...execution.trial,effect_id:caseEffect(report.case_id,execution.trial.effect_id)};
    report.execution_probe.outcome=javascriptSentinelOutcome({stage:'execute',identity,baselineIds:[],
      messages:execution.error?[{...identity,id:execution.execution_id,text:execution.error.message}]:[],
      ownerVerified:execution.owner_verified===true,terminal:execution.verified===true});
  }else{
    if(execution.status!=='completed'||execution.owner_verified!==true)throw Error('Table trial execution not confirmed');
    report.execution_probe.output=await executionRuntime.readPassive(executionNode);
    report.execution_probe.status='typed_output_verified';
    if(persistence){
      const first=persistence.revisions[0],last=persistence.revisions[1];
      if(probe.source!==first.source||probe.source_sha256!==first.source_sha256)throw Error('Persistence initial source differs');
      if(execution.verified!==true||execution.cleanup_complete!==true||execution.trial?.source_sha256!==first.source_sha256
        ||execution.trial.node_id!==executionNode.node_id||!execution.execution_id)throw Error('Persistence initial execution unconfirmed');
      verifyJavascriptPersistenceOutput(report.execution_probe.output,1);
      report.persistence={status:'RUNNING',case_id:persistence.id,schema_mode:persistence.schema_mode,deadline,
        initial:{source:first,execution,output:report.execution_probe.output},saves:[]};
      const initialCycle=await runSourceReadCycle(first,deadline);
      report.persistence.initial.source_cycle=initialCycle;
      for(const proof of Object.values(initialCycle.mapping_evidence))
        javascriptPreservedMappings(initialCycle.mappings.after,proof,executionNode);
      const initialSettings=initialCycle.rounds[0].settings;
      report.stage='persistence-save-initial';
      const initialSave=await executionRuntime.savePersistenceCheckpoint(1);
      executionPrepared=initialSave.prepared;report.persistence.saves.push(initialSave);await save();await guard();

      report.stage='persistence-replace-source';
      await executionRuntime.reopen(executionNode,deadline);wizardAddressEpoch++;
      wizardHandle=null;wizardRoot=null;openedWizard=true;closeDispatched=false;closeConfirmed=false;closeDeadline=0;
      wizardDeadline=Math.min(deadline,phaseDeadline(90000));readingExisting=true;report.execution_existing_schema=null;
      await executionRuntime.handoffReopenedWizard();
      await waitWizardReady();await inspectWizardPages();
      if(JSON.stringify(javascriptSourceSettings(report.execution_existing_schema))!==JSON.stringify(initialSettings))throw Error('Saved initial settings changed');
      await probeOwnedSource(first.source,last.source);
      trialPhase='persistence-final';sourceSha=last.source_sha256;
      await inspectWizardPages({remainingPages:true});
      const changedDone=await dispatch('done',owner.prefix+';WizrdMCF;btnDone',0);
      if(changedDone.sentinel_observed)throw Error('Unexpected persistence source diagnostic');
      await exact(owner.prefix+';WizrdMCF').waitFor({state:'hidden',timeout:Math.max(1,deadline-Date.now())});openedWizard=false;
      await waitGraphReady(Math.max(1,deadline-Date.now()));
      await executionRuntime.settleAppliedNode(executionNode,deadline);
      const beforeFinal=await runSourceReadCycle(last,deadline,initialSettings,{allowConfiguredOnly:true});
      for(const proof of Object.values(beforeFinal.mapping_evidence))
        javascriptPreservedMappings(initialCycle.mappings.after,proof,executionNode,{allowConfiguredOnly:true});
      const boundary=await executionRuntime.captureExecutionBoundary();
      try{
        report.stage='persistence-execute-final';
        await guard();
        const finalExecution=await executionRuntime.executeNode(executionNode,deadline,{phase:'persistence-final',source_sha256:last.source_sha256});
        if(finalExecution.status!=='completed'||finalExecution.verified!==true||finalExecution.owner_verified!==true
          ||finalExecution.cleanup_complete!==true||!finalExecution.execution_id||finalExecution.execution_id===execution.execution_id
          ||finalExecution.trial?.source_sha256!==last.source_sha256||finalExecution.trial.node_id!==executionNode.node_id)
          throw Error('Fresh persistence execution unconfirmed');
        await executionRuntime.verifyExecutionBoundary(boundary);
        const output=await executionRuntime.readPassive(executionNode,'persistence-final',deadline);
        verifyJavascriptPersistenceOutput(output,2);
        await executionRuntime.verifyExecutionBoundary(boundary);
        report.persistence.final={source:last,before_execute:beforeFinal,execution:finalExecution,output};await save();
        const mappingsAfterExecute={input:await executionRuntime.readPortMapping(executionNode,'input',{operationDeadline:deadline}),
        output:await executionRuntime.readPortMapping(executionNode,'output',{operationDeadline:deadline})};
      javascriptPreservedMappings(initialCycle.mappings.after,mappingsAfterExecute,executionNode);
      report.persistence.final.mappings_after_execute=mappingsAfterExecute;
      await executionRuntime.verifyExecutionBoundary(boundary);
      await executionRecord({phase:'persistence_post_execution_mappings_verified',mappings:structuredClone(mappingsAfterExecute)});
      await save();
      }finally{await boundary.native.dispose();}
      report.stage='persistence-save-final';
      const finalSave=await executionRuntime.savePersistenceCheckpoint(2);
      executionPrepared=finalSave.prepared;report.persistence.saves.push(finalSave);await save();await guard();
      const finalCycle=await runSourceReadCycle(last,deadline,initialSettings);
      for(const proof of Object.values(finalCycle.mapping_evidence))
        javascriptPreservedMappings(initialCycle.mappings.after,proof,executionNode);
      report.persistence.final.source_cycle=finalCycle;
      report.persistence.status='WRITER_OBSERVED';report.persistence.cold_persistence_verified=false;
      report.persistence.package_bytes_verified=false;
      await save();return;
    }
    if(sourceReadCycle){await runSourceReadCycle(probe,Math.min(deadline,batchDeadline));return;}
    report.stage='existing-mapping-baseline';
    const before={input:await executionRuntime.readPortMapping(executionNode,'input'),output:await executionRuntime.readPortMapping(executionNode,'output')};
    if(options['--verify-public-node-apply']){
      const boundary=await executionRuntime.captureExecutionBoundary();
      try{
      const source=probe.source+'\n// public Done trial: "Проверка" \\ 😀';
      const identity=javascriptSourceIdentity(source);
      const remaining=deadline-Date.now()-60000;
      if(remaining<120000)throw Error('Public JavaScript trial has insufficient original cleanup budget');
      const target={document_id:executionNode.document_id,workflow_id:executionNode.workflow_id,node_id:executionNode.node_id};
      const origin=new URL(config.url).origin,base=createCandidateNodeSupport({targetOrigin:origin,targetBuild:'7.4.2'});
      const trial=createJavascriptTrialNodeSupport({page,targetOrigin:origin,targetBuild:'7.4.2',redactor,
        pinned:{node:target,expected_source_sha256:probe.source_sha256,source_text:source}});
      const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},
        allowCandidate:true,targetOrigin:origin,targetBuild:'7.4.2',redactor,onRecord:executionRecord,
        execute:code=>Function('return ('+code+')')()(page),
        nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...trial.nodeApplyHandlers]),
        nodeApplyDriverFactory:options=>options.operation.parameters.target.type==='programming.javascript'
          ?trial.nodeApplyDriverFactory(options):base.nodeApplyDriverFactory(options)});
      const request={operation_id:'js-public-'+randomUUID(),contract_revision:'1.0.0',
        document_id:executionPrepared.document_id,workflow_ref:executionPrepared.workflow_ref,
        target:{kind:'existing',type:'programming.javascript',ref:target},inputs:[],mode:'script',
        parameters:{source_text:source,expected_source_sha256:probe.source_sha256},mappings:[],finish:'done',
        read:{ports:[],sample_rows:0,require_exact_numbers:true},
        budgets:{configure_ms:Math.min(360000,remaining),execute_ms:30000,total_ms:Math.min(420000,remaining)}};
      report.stage='public-node-apply';report.public_node_apply={status:'RUNNING',operation_id:request.operation_id,
        previous_source_sha256:probe.source_sha256,expected_source_sha256:identity.source_sha256};
      managedCloseUncertain=true;await save();
      let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
      while(job.state==='running'){
        job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:request.operation_id,timeout_ms:30000});
        report.public_node_apply.progress=job.progress;await save();
      }
      report.public_node_apply.job=job;await save();
      if(job.outcome?.status!=='SUCCEEDED'||job.outcome.output?.configuration?.readback?.source?.sha256!==identity.source_sha256
        ||job.outcome.output?.execution?.status!=='not_requested'||job.outcome.output?.output?.status!=='not_refreshed'
        ||runtime.hasUnsettledWork())throw Error('Public JavaScript Done result unconfirmed');
      const projected=nodeResultReply(job,{userProfile:true});
      if(projected.structuredContent?.configuration?.readback?.source?.sha256!==identity.source_sha256
        ||projected.structuredContent?.configuration?.readback?.execution_effects?.internal_execution_started!==null)
        throw Error('Public JavaScript user-v1 readback differs');
      const read=await dispatchNodeApi(runtime,'dock_node_read',{kind:'source',operation_id:'js-after-'+randomUUID(),
        document_id:executionPrepared.document_id,workflow_ref:executionPrepared.workflow_ref,node:target,
        budget_ms:Math.max(1,Math.min(180000,deadline-Date.now()-30000))});
      if(read.kind!=='source'||read.source_text!==source||read.source_sha256!==identity.source_sha256
        ||read.cursor!==null||runtime.hasUnsettledWork())throw Error('Independent public JavaScript source read differs');
      const after={input:await executionRuntime.readPortMapping(executionNode,'input',{allowOwnedUnlock:true}),
        output:await executionRuntime.readPortMapping(executionNode,'output',{allowConfiguredOnly:true})};
      const mapping=javascriptPreservedMappings(javascriptSourceMappings(before),after,executionNode,{allowConfiguredOnly:true});
      await executionRuntime.verifyExecutionBoundary(boundary);
      report.public_node_apply={status:'OBSERVED',operation_id:request.operation_id,
        previous_source_sha256:probe.source_sha256,source_sha256:identity.source_sha256,
        source_utf8_bytes:identity.source_utf8_bytes,source_lf_lines:identity.source_lf_lines,
        configuration:job.outcome.output.configuration,execution:job.outcome.output.execution,
        output:job.outcome.output.output,public_source_read_verified:true,
        input_mapping_preserved:true,output_mapping: mapping.output,graph_links_preserved:true,
        raw_source_in_report:false};
      managedCloseUncertain=false;await save();return;
      }finally{await boundary.native.dispose();}
    }
    report.stage='existing-source-readback';
    const boundary=await executionRuntime.captureExecutionBoundary();
    try{
      const existingDeadline=phaseDeadline(options['--verify-managed-source-write']||options['--verify-managed-source-commit']?150000:90000);
      const existingReceiptNamespace=randomUUID();
      const existingManaged=options['--managed-opening-probe']
        ?await openManagedJavascriptExistingWizard({prepared:executionPrepared,node:executionNode,
          deadline:existingDeadline,targetOrigin:new URL(config.url).origin,
          execute:code=>Function('return ('+code+')')()(page),record:executionRecord,
          receiptOptions:(id,key,signature)=>({receipt_namespace:'private-managed-js-existing-'+existingReceiptNamespace,
            receipt_id:id,receipt_signature:signature}),
          channel:executionRuntime.channel(executionNode,existingDeadline)})
        :null;
      const reopened=existingManaged?.opened??await executionRuntime.reopen(executionNode);wizardAddressEpoch++;
      wizardHandle=null;wizardRoot=null;openedWizard=true;closeDispatched=false;closeConfirmed=false;closeDeadline=0;
      wizardDeadline=existingManaged?existingDeadline:phaseDeadline(90000);
      if(!existingManaged)await executionRuntime.handoffReopenedWizard();
      await executionRecord({phase:'existing_wizard_opened',reopened});
      await waitWizardReady();readingExisting=true;
      if(existingManaged)managedSourceTask=existingManaged.task;
      await inspectWizardPages();
      managedSourceTask=null;
      const source=await readOwnedExecutionSource();
      if(source!==probe.source)throw Error('Existing JavaScript source differs from applied trial');
      await executionRecord({phase:'existing_source_verified',source_sha256:digest(source)});
      if(existingManaged){
        const observed=await Function('return ('+makeJavascriptManagedSourceCode(existingManaged.task)+')')()(page);
        if(observed.verified!==true||observed.source!==source)throw Error('Managed existing JavaScript source differs');
        report.managed_existing_observation={verified:true,node_id:existingManaged.task.owner.node_id,
          source_sha256:digest(observed.source),source_utf8_bytes:observed.source_utf8_bytes,
          source_lf_lines:observed.source_lf_lines};
        await executionRecord({phase:'javascript_managed_existing_source_observed',...report.managed_existing_observation});
        await save();
      }
      if(existingManaged&&(options['--verify-managed-source-write']||options['--verify-managed-source-commit'])){
        const draft=probe.source+'\n// managed draft: "Проверка" \\ 😀';
        const sourceOwner={...existingManaged.task.owner,operation_id:existingManaged.task.operation_id,
          ui_epoch:wizardAddressEpoch};
        const handle={task:existingManaged.task,owner:sourceOwner};
        const read=async()=>{
          const observed=await Function('return ('+makeJavascriptManagedSourceCode(existingManaged.task)+')')()(page);
          if(observed.verified!==true)throw Error('Managed writer owned source unavailable');
          return {owner:sourceOwner,source:observed.source,settings:{}};
        };
        report.stage='managed-source-write';managedCloseUncertain=true;await save();
        const written=await replaceManagedJavascriptSource({task:existingManaged.task,handle,
          owner:sourceOwner,deadline:existingManaged.task.deadline,expected_source_sha256:digest(probe.source),
          source_text:draft,read,execute:code=>Function('return ('+code+')')()(page),record:executionRecord,
          receiptOptions:(id,key,signature)=>({receipt_namespace:'private-managed-js-existing-'+existingReceiptNamespace,
            receipt_id:id,receipt_signature:signature}),markUncertain:()=>{}});
        if(written.draft_exact!==true||written.source_sha256!==digest(draft))
          throw Error('Managed writer draft exact readback differs');
        report.managed_source_write={verified:true,source_sha256:written.source_sha256,
          source_utf8_bytes:written.source_utf8_bytes,source_lf_lines:written.source_lf_lines,
          wizard_commit_verified:false,raw_source_in_report:false};
        await save();
        if(options['--verify-managed-source-commit']){
          report.stage='managed-source-commit';
          const codeNext=await dispatchManagedJavascriptCodeNext({task:existingManaged.task,
            expected_source_sha256:written.source_sha256,
            execute:code=>Function('return ('+code+')')()(page),record:executionRecord,
            receiptOptions:(id,key,signature)=>({receipt_namespace:'private-managed-js-existing-'+existingReceiptNamespace,
              receipt_id:id,receipt_signature:signature})});
          if(codeNext.output?.transition_verified!==false)
            throw Error('Managed JavaScript Code Next gesture claimed premature transition');
          const done=await waitWizardReady({deadline:existingDeadline,inputOnly:false,
            afterIndex:1,afterPageTid:owner.prefix+';WizrdMCF;JavaScriptCodeWizard'});
          if(done.page?.tid!==owner.prefix+';WizrdMCF;DoneWizard'
            ||done.page.index!==done.page.indicator_count-1)
            throw Error('Managed JavaScript commit Done page unavailable');
          report.effects.push({at:new Date().toISOString(),action:'managed-source-done',state:'dispatching',
            node_id:executionNode.node_id,source_sha256:written.source_sha256});await save();
          const doneReceipt=await dispatchManagedJavascriptDone({task:existingManaged.task,
            expected_source_sha256:written.source_sha256,
            execute:code=>Function('return ('+code+')')()(page),record:executionRecord,
            receiptOptions:(id,key,signature)=>({receipt_namespace:'private-managed-js-existing-'+existingReceiptNamespace,
              receipt_id:id,receipt_signature:signature})});
          if(doneReceipt.output?.wizard_commit_verified!==false)
            throw Error('Managed JavaScript Done gesture claimed premature commit');
          await exact(owner.prefix+';WizrdMCF').waitFor({state:'hidden',timeout:Math.max(1,existingDeadline-Date.now())});
          openedWizard=false;await waitGraphReady(Math.max(1,existingDeadline-Date.now()));
          const graph=await snapshot('managed-source-done-settled');
          if(!graph.nodes?.some(item=>item.id===executionNode.node_id
            &&item.icon_class==='bg-vendor-icon-javascript'&&item.rendered))
            throw Error('Managed JavaScript Done did not restore owned node');
          committedSource=draft;managedCloseUncertain=false;
          report.managed_source_write.wizard_commit_verified=true;
          await executionRecord({phase:'javascript_managed_source_commit_observed',
            node_id:executionNode.node_id,source_sha256:written.source_sha256,
            wizard_hidden:true,graph_node_rendered:true});
          await save();
        }
      }
      if(existingManaged&&!options['--verify-managed-source-commit']){
        managedCloseUncertain=true;
        const cleanupDeadline=phaseDeadline(60000);
        report.effects.push({at:new Date().toISOString(),action:'wizard-close-managed',state:'dispatching',
          deadline:new Date(cleanupDeadline).toISOString()});await save();
        const closed=await closeManagedJavascriptWizard({task:{...existingManaged.task,cleanup_deadline:cleanupDeadline},
          execute:code=>Function('return ('+code+')')()(page),record:executionRecord,
          receiptOptions:(id,key,signature)=>({receipt_namespace:'private-managed-js-existing-'+existingReceiptNamespace,
            receipt_id:id,receipt_signature:signature})});
        await waitGraphReady(Math.max(1,cleanupDeadline-Date.now()));
        const afterClose=await snapshot('managed-wizard-close-settled');
        if(!afterClose.nodes?.some(item=>item.id===existingManaged.task.owner.node_id
          &&item.icon_class==='bg-vendor-icon-javascript'&&item.rendered))
          throw Error('Managed JavaScript Close did not restore owned node');
        report.managed_existing_close=closed;openedWizard=false;managedCloseUncertain=false;await save();
      }else if(!existingManaged)await closeWizardOnce();
      if(existingManaged){
        const {prepared,allowDeactivation,...selectionTask}=existingManaged.task;
        await Function('return ('+makeJavascriptManagedSelectionReadCode({...selectionTask,mode:'dispose'})+')')()(page);
      }
      if(options['--verify-source-admission']){
        const admissionDeadline=phaseDeadline(90000);
        const admissionOwner={document_id:executionPrepared.document_id,
          workflow_id:executionPrepared.workflow_ref.workflow_id,node_id:executionNode.node_id,
          operation_id:'managed-source-admission',ui_epoch:wizardAddressEpoch};
        const admissionNamespace=randomUUID();
        let managedAdapter=null;
        report.stage='managed-source-admission';managedCloseUncertain=true;openedWizard=true;await save();
        const admission=createJavascriptSourceAdmission({kind:'existing',owner:admissionOwner,
          deadline:admissionDeadline,redactor,record:executionRecord,
          sourceAdapter:async boundOwner=>{
            if(JSON.stringify(boundOwner)!==JSON.stringify(admissionOwner))throw Error('Admission owner changed');
            managedAdapter=createJavascriptManagedSourceAdapter({page,prepared:executionPrepared,node:executionNode,
              uiEpoch:admissionOwner.ui_epoch,deadline:admissionDeadline,targetOrigin:new URL(config.url).origin,
              execute:code=>Function('return ('+code+')')()(page),record:executionRecord,
              receiptOptions:(id,key,signature)=>({receipt_namespace:'private-managed-js-admission-'+admissionNamespace,
                receipt_id:id,receipt_signature:signature}),
              channel:operationDeadline=>executionRuntime.channel(executionNode,operationDeadline)});
            return managedAdapter;
          }});
        const admitted=await admission.admit({}).catch(error=>{
          if(managedAdapter&&!managedAdapter.uncertain&&!managedAdapter.active){
            openedWizard=false;managedCloseUncertain=false;
          }
          throw error;
        });
        if(admitted.intent!=='preserve'||admitted.previous_source?.source_sha256!==digest(probe.source)
          ||admitted.effective_source?.source_sha256!==digest(probe.source)
          ||admitted.settings_sha256===null||admission.state!=='admitted')
          throw Error('Managed JavaScript source admission differs from executed baseline');
        report.managed_source_admission={verified:true,receipt:admitted,raw_source_in_report:false};
        openedWizard=false;managedCloseUncertain=false;await save();
      }
      if(options['--verify-public-source-read']){
        const publicDeadline=phaseDeadline(180000);
        const publicRuntime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},
          allowCandidate:true,nodeApplyHandlers:new Map([['imports.text',{}]]),nodeApplyDriverFactory:()=>({}),
          targetOrigin:address.origin,targetBuild:'7.4.2',redactor,onRecord:executionRecord,
          execute:code=>Function('return ('+code+')')()(page)});
        const request={kind:'source',operation_id:'public-source-'+randomUUID(),
          document_id:executionPrepared.document_id,workflow_ref:executionPrepared.workflow_ref,
          node:{document_id:executionPrepared.document_id,workflow_id:executionPrepared.workflow_ref.workflow_id,
            node_id:executionNode.node_id},budget_ms:Math.max(1,publicDeadline-Date.now())};
        report.stage='public-source-read';managedCloseUncertain=true;openedWizard=true;await save();
        const receipt=await dispatchNodeApi(publicRuntime,'dock_node_read',request).catch(error=>{
          if(!publicRuntime.hasUnsettledWork()){managedCloseUncertain=false;openedWizard=false;}
          throw error;
        });
        const delivered=nodeResultReply(receipt,{userProfile:true});
        if(receipt.kind!=='source'||receipt.source_text!==committedSource||receipt.source_sha256!==digest(committedSource)
          ||receipt.cursor!==null||delivered.structuredContent?.source_text!==committedSource
          ||JSON.parse(delivered.content[0].text).source_text!==committedSource
          ||publicRuntime.hasUnsettledWork())throw Error('Public JavaScript source receipt differs from baseline');
        report.public_source_read={verified:true,kind:receipt.kind,source_sha256:receipt.source_sha256,
          source_utf8_bytes:receipt.source_utf8_bytes,source_lf_lines:receipt.source_lf_lines,
          chunk_utf8_bytes:receipt.chunk_utf8_bytes,cursor:receipt.cursor,
          user_reply_verified:true,raw_source_in_report:false};
        openedWizard=false;managedCloseUncertain=false;await save();
      }
      await executionRuntime.settleClosedExecutionBoundary(boundary,executionNode,deadline);
      await executionRuntime.verifyExecutionBoundary(boundary);
    }finally{await boundary.native.dispose();}
    if(options['--verify-managed-source-commit']){
      const after={input:await executionRuntime.readPortMapping(executionNode,'input'),
        output:await executionRuntime.readPortMapping(executionNode,'output',{allowConfiguredOnly:true})};
      const states=javascriptPreservedMappings(javascriptSourceMappings(before),after,executionNode,{allowConfiguredOnly:true});
      report.execution_probe.existing_readback={source_verified:true,mode_verified:true,
        source_sha256:digest(committedSource),post_done_mapping_states:states,
        input_mapping_preserved:true,configured_output_targets_preserved:true,
        full_output_source_identity_verified:states.output==='complete',
        before,after};
      await save();return;
    }
    const after={input:await executionRuntime.readPortMapping(executionNode,'input'),output:await executionRuntime.readPortMapping(executionNode,'output')};
    const semantic=mapping=>({autosync:mapping.autosync,
      source_fields:mapping.source_fields.map(({record_id,field_id,...field})=>field),
      target_fields:mapping.target_fields.map(({record_id,field_id,source,exclusion_source,...field})=>({...field,source:source?Object.fromEntries(Object.entries(source).filter(([key])=>!['record_id','field_id'].includes(key))):null,
        exclusion_source:exclusion_source?Object.fromEntries(Object.entries(exclusion_source).filter(([key])=>!['record_id','field_id'].includes(key))):null}))});
    if(['input','output'].some(direction=>JSON.stringify(semantic(before[direction]))!==JSON.stringify(semantic(after[direction]))))throw Error('Existing JavaScript port mapping changed');
    report.execution_probe.existing_readback={source_verified:true,mode_verified:true,port_mappings_unchanged:true,before,after,
      generated_schema_mismatch_trial:'not_run'};
    if(trigger==='mismatch'){
      report.stage='generated-schema-mismatch';
      const manual=await executionRuntime.prepareManualMapping(executionNode);
      await executionRuntime.reopen(executionNode);wizardAddressEpoch++;
      wizardHandle=null;wizardRoot=null;openedWizard=true;closeDispatched=false;closeConfirmed=false;closeDeadline=0;wizardDeadline=phaseDeadline(90000);
      await executionRuntime.handoffReopenedWizard();
      await waitWizardReady();await inspectWizardPages();
      const changed=javascriptMismatchSource(probe);
      await probeOwnedSource(probe.source,changed.source);
      trialPhase=changed.phase;sourceSha=changed.source_sha256;
      // Unknown mapping pages/dialogs stop through the existing ownership
      // gates. No reset/autosync gesture is sent to make this trial succeed.
      await inspectWizardPages({remainingPages:true});
      const changedDone=await dispatch('done',owner.prefix+';WizrdMCF;btnDone',0);
      if(changedDone.sentinel_observed)throw Error('Unexpected sentinel in changed-schema trial');
      await exact(owner.prefix+';WizrdMCF').waitFor({state:'hidden',timeout:Math.max(1,deadline-Date.now())});openedWizard=false;
      await waitGraphReady(Math.max(1,deadline-Date.now()));
      const postDone=await executionRuntime.readPortMapping(executionNode,'output',{characterize:true,operationDeadline:deadline});
      report.execution_probe.existing_readback.generated_schema_mismatch_trial={status:'pending_materialization',
        phase:changed.phase,source_sha256:changed.source_sha256,post_done:postDone,execution_started:false};
      await save();
      // Read persisted code/mode after Done; navigation itself is not evidence
      // of execution. The next driver captures history after these transitions.
      if(Date.now()>=deadline)throw Error('Original mismatch deadline expired before persisted source read');
      await executionRuntime.reopen(executionNode,deadline);wizardAddressEpoch++;
      wizardHandle=null;wizardRoot=null;openedWizard=true;closeDispatched=false;closeConfirmed=false;closeDeadline=0;wizardDeadline=Math.min(deadline,phaseDeadline(90000));
      await executionRuntime.handoffReopenedWizard();
      report.execution_existing_schema=null;
      await waitWizardReady();await inspectWizardPages({deadline:Math.min(deadline,phaseDeadline(180000))});
      if(report.execution_existing_schema?.verified!==true||report.execution_existing_schema.generation?.checked!==true)
        throw Error('Persisted changed source generation mode unconfirmed');
      if(await readOwnedExecutionSource()!==changed.source)throw Error('Persisted changed source differs before Execute');
      const sourceProof={...executionNode,verified:true,owner_verified:true,schema_mode:'code',source_sha256:changed.source_sha256};
      await executionRecord({phase:'changed_source_persisted_verified',...sourceProof});
      await closeWizardOnce();
      const boundary=await executionRuntime.captureExecutionBoundary();
      try{
        report.stage='generated-schema-materialization';
        report.execution_probe.existing_readback.generated_schema_mismatch_trial=await runJavascriptMismatchMaterialization({
          node:executionNode,changed,sourceProof,manual,postDone,baseline:execution,deadline,
          verifyBoundary:async()=>{await executionRuntime.verifyExecutionBoundary(boundary);await verifyBatchInputIdentity();},
          execute:identity=>executionRuntime.executeNode(executionNode,deadline,identity),
          onProgress:async trial=>{report.execution_probe.existing_readback.generated_schema_mismatch_trial=trial;await save();},
          readMapping:execution=>executionRuntime.readPortMapping(executionNode,'output',{characterize:true,operationDeadline:deadline,
            failedExecution:execution.status==='failed'?execution:undefined}),
          readOutput:()=>executionRuntime.readPassive(executionNode,'mismatch',deadline),record:executionRecord});
      }finally{await boundary.native.dispose();}
    }
  }
  await save();
};
const verifyBatchInputIdentity=async()=>{
  await guard();
  const valid=await page.evaluate(javascriptBatchInputIdentity,{held:inputBinding,input:executionInput});
  if(!valid)throw Error('Batch original input native identity changed');
};
const runPreparedCase=async()=>{
    report.stage='palette';await guard();
    await paletteSnapshot('palette-before');
    report.stage='palette-ready';
    await page.waitForFunction(({prefix,account})=>{
      const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
      if(f?.FMapTree?.FServerConnection?.UserName!==account||f.FMapTree.PackageNodes?.Count!==1)throw Error('Palette owner changed');
      const model=f?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
      const root=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===prefix+';ModelForm;pnlVendors;tree');
      if(model?.FDiagram?.FmxGraph?.container?.getAttribute('data-tid')!==prefix+';ModelForm;cmpDiagram')throw Error('Palette active graph changed');
      if(root.length!==1||!root[0].getBoundingClientRect().width)return false;
      return [...root[0].querySelectorAll('[data-tid]')].some(e=>e.getAttribute('data-tid').startsWith(prefix+';ModelForm;colVendors_')&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&!e.closest('.x-item-disabled,.x-grid-row-disabled'));
    },{prefix:owner.prefix,account:config.username},{timeout:30000});
    await guard();await paletteSnapshot('palette-ready');
    if (options['--create-node']||options['--palette-hit-test']) {
    report.stage='palette-target';
    // E2E candidate selector: observed uniqueness/visibility required before drag.
    const itemTid=owner.prefix+';ModelForm;colVendors_Компоненты>Программирование>JavaScript;TreeText';
    if (await exact(itemTid).filter({visible:true}).count()===0) {
      // Expand only a rendered, explicitly collapsed group in the exact tree.
      // Class names alone or an absent child do not establish collapsed state.
      for (const path of ['Компоненты','Компоненты>Программирование']) {
        if (await exact(itemTid).filter({visible:true}).count()===1) break;
        const current=await paletteSnapshot('palette-inspect-'+path);
        const expanderTid=owner.prefix+';ModelForm;colVendors_'+path+';TreeExpander';
        const candidates=current.items.filter(i=>i.tid===expanderTid);
        if (candidates.length===0) continue;
        if (current.truncated||current.root_count!==1||!current.root_visible||candidates.length!==1||!candidates[0].in_tree) throw Error('Palette group ownership unavailable');
        const group=candidates[0];
        if (group.native_expanded!==null&&group.expanded!==null&&String(group.native_expanded)!==group.expanded) throw Error('Palette expansion evidence conflicts');
        const expanded=group.native_expanded===null?group.expanded:String(group.native_expanded);
        if (expanded==='true') continue;
        if (expanded!=='false') throw Error('Palette expanded state unknown; return snapshot for discovery');
        await guard();report.effects.push({at:new Date().toISOString(),action:'expand-palette',tid:expanderTid,state:'dispatching'});await save();
        await click(expanderTid);
        await page.waitForFunction(({tid,rootTid})=>{
          const all=[...document.querySelectorAll('[data-tid]')],roots=all.filter(e=>e.getAttribute('data-tid')===rootTid),es=all.filter(e=>e.getAttribute('data-tid')===tid);
          if(roots.length!==1||es.length!==1||!roots[0].contains(es[0]))throw Error('Palette expansion owner changed');
          const row=es[0].closest('table.x-grid-item[data-recordid]'),view=globalThis.Ext?.getCmp?.(roots[0].id),store=view?.getStore?.();
          const pending=[store?.getRoot?.()??store?.getRootNode?.()],seen=new Set();
          while(pending.length&&seen.size<2000){const r=pending.pop();if(!r||seen.has(r))continue;seen.add(r);
            if(row&&String(r.internalId)===row.getAttribute('data-recordid')&&r.isModel&&typeof r.data?.expanded==='boolean')return r.data.expanded;
            if(Array.isArray(r.childNodes))pending.push(...r.childNodes);}
          return (es[0].getAttribute('aria-expanded')??es[0].closest('[aria-expanded]')?.getAttribute('aria-expanded'))==='true';
        },{tid:expanderTid,rootTid:current.root_tid},{timeout:10000});
        await paletteSnapshot('palette-expanded-'+path);
      }
    }
    const palette=await visibleOne(exact(itemTid));
    report.stage='palette-scroll';
    await palette.scrollIntoViewIfNeeded({timeout:10000});
    report.stage='palette-hit-test';
    const hit=await palette.evaluate(e=>{
      const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
      const description=n=>n?{tag:n.tagName,tid:n.getAttribute('data-tid'),owner_tid:n.closest('[data-tid]')?.getAttribute('data-tid')??null,
        classes:typeof n.className==='string'?n.className.slice(0,250):'',role:n.getAttribute('role'),
        rect:{x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}}:null;
      const top=document.elementFromPoint(x,y),ancestors=[];let parent=e.parentElement;
      while(parent&&ancestors.length<8){const style=getComputedStyle(parent);ancestors.push({...description(parent),overflow_x:style.overflowX,overflow_y:style.overflowY,scroll_top:parent.scrollTop,scroll_left:parent.scrollLeft});parent=parent.parentElement;}
      return {point:{x,y},viewport:{width:innerWidth,height:innerHeight},target:description(e),hit:description(top),
        stack:document.elementsFromPoint(x,y).slice(0,8).map(description),ancestors,
        admissible:x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&(top===e||e.contains(top))};
    });
    report.snapshots.push({at:new Date().toISOString(),label:'palette-hit-test',...hit});await paletteSnapshot('palette-target-group');await save();
    if(options['--palette-hit-test']||!hit.admissible)await refusalEvidence('palette-hit-test');
    if(!hit.admissible)throw Error('Palette item covered after scroll; see recorded hit-test');
    await guard();
    if(options['--create-node']) {
    await waitGraphReady();
    const baseline=await snapshot('before-drag');
    if(!Array.isArray(baseline.nodes)||baseline.nodes.some(n=>!n.id||!n.rendered)||new Set(baseline.nodes.map(n=>n.id)).size!==baseline.nodes.length)throw Error('Incomplete baseline graph');
    const expectedIcon=await palette.evaluate(e=>{
      const cell=e.closest('td[data-tid]');
      const icons=[...new Set([...(cell?.querySelectorAll('[class]')??[])].flatMap(n=>[...n.classList].filter(c=>c.startsWith('bg-vendor-icon-'))))];
      if(icons.length!==1)throw Error('Unique observed palette icon required');return icons[0];
    });
    if(expectedIcon==='bg-vendor-icon-modelvariables')throw Error('Palette is not JavaScript');
    report.expected_js_icon={value:expectedIcon,source_tid:itemTid};await save();
    const graph=await visibleOne(exact(owner.prefix+';ModelForm;cmpDiagram'));
    const target=await graph.evaluate(javascriptDropPoint);
    const from=await palette.evaluate(e=>{const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);if(!(hit===e||e.contains(hit)))throw Error('Palette hit changed');return{x,y};});
    if(JSON.stringify((await guard()).nodes)!==JSON.stringify(baseline.nodes))throw Error('Graph changed before drag');
    if(executionCase)executionDrop=await executionRuntime.captureDropTopology();
    report.drop_point=target;report.stage='create-js-node';report.effects.push({at:new Date().toISOString(),action:'drag-js',state:'dispatching',modifiers:['Alt']});await save();
    paletteAdmission=executionDrop??{};
    const gesture=await dragJavascriptPalette(page,{from,to:target,deadline:phaseDeadline(60000),
      admission:paletteAdmission,record:executionRecord,guard,
      validate:async()=>{await guard();if(executionCase)await executionRuntime.checkDropTopology(executionDrop);}});
    if(executionCase)executionDrop.gesture=gesture;
    report.stage='verify-created-diff';
    await page.waitForFunction(({ids,icon})=>{
      const model=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
      const nodes=model?.FDiagram?.FNodes?.FCollection;
      if(!Array.isArray(nodes))return false;
      const added=nodes.filter(n=>!ids.includes(n.FGuid));
      if(added.length>1||ids.some(id=>!nodes.some(n=>n.FGuid===id)))throw Error('Unexpected graph delta');
      if(added.length!==1||model.FCreateDraggedNodeStarted!==false||model.FDraggingOverGraph!==false||model.FDraggedNode)return false;
      const node=added[0],graph=model.FDiagram.FmxGraph;
      const dom=graph?.view?.getState(node.FCell)?.shape?.node;
      // A GUID appears before its icon/DOM materialize. Do not classify that
      // intermediate state as a completed node of the wrong type.
      if(typeof node.FIconCls!=='string'||!node.FIconCls||!dom?.isConnected||!graph.container.contains(dom)||!dom.getAttribute('data-tid')||!dom.getBoundingClientRect().width||!dom.getBoundingClientRect().height)return false;
      if(node.FIconCls!==icon)throw Error('Materialized node icon differs from observed JS palette');
      return true;
    },{ids:baseline.nodes.map(n=>n.id),icon:expectedIcon},{timeout:30000});
    await waitGraphReady();
    const created=await snapshot('created-node');await guard();
    const added=created.nodes?.filter(n=>!baseline.nodes.some(b=>b.id===n.id));
    const node=added?.length===1?added[0]:null;
    if (!node?.id||!node.tid||!node.rendered||node.icon_class!==expectedIcon||baseline.nodes.some(b=>JSON.stringify(created.nodes.find(n=>n.id===b.id))!==JSON.stringify(b))) throw Error('Created node not bound to unchanged baseline and JS identity');
    report.owned_node=node;
    if(batch&&!await page.evaluate(id=>{
      const d=globalThis.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;
      const rectangles=d.FNodes.FCollection.map(n=>({id:n.FGuid,box:d.FmxGraph.view.getState(n.FCell).shape.node.getBoundingClientRect()}));
      const target=rectangles.find(n=>n.id===id)?.box;
      return target&&rectangles.every(n=>n.id===id||target.right<=n.box.left||target.left>=n.box.right||target.bottom<=n.box.top||target.top>=n.box.bottom);
    },node.id))throw Error('Created batch node overlaps an existing native shape');
    if(executionCase){
      report.stage='link-js-input';executionNode=await executionRuntime.connectInput(executionInput.node,node.id,executionDrop);
      report.stage='verify-js-input-port';
      const mapping=await executionRuntime.readPortMapping(executionNode,'input');
      executionInputProof=(nativeRoundtrip?verifyNativeRoundtripMapping:verifyJavascriptInputMapping)(mapping,executionNode,nativeFixtureId);
      if(nativeRoundtrip)await executionRuntime.bindNativeRoundtripGraph(executionNode,executionInputProof.port_guid);
      await executionRecord({phase:'javascript_input_port_verified',proof:executionInputProof,mapping});
      report.execution_input_port=executionInputProof;
      await waitGraphReady();await guard();
    }
    report.stage='open-wizard';
    wizardBinding=await page.evaluateHandle(observeJavascriptWizardBinding,{id:node.id,tid:node.tid,icon:expectedIcon,owned:packageHandle});
    wizardDeadline=phaseDeadline(90000);report.wizard_open_deadline=new Date(wizardDeadline).toISOString();await save();
    if(options['--managed-opening-probe']){
      const managed=await openManagedJavascriptInitialWizard({page,prepared:executionPrepared,node,deadline:wizardDeadline,
        record:executionRecord,lifecycle:initialOpening,report,save,retainLease:options['--verify-runtime-source']===true});
      managedSourceTask=managed.source_task??null;
      openedWizard=true;
    }else if(executionCase){
      await openJavascriptInitialWizard({page,binding:wizardBinding,node,icon:expectedIcon,deadline:wizardDeadline,
        record:executionRecord,guard,report,save,lifecycle:initialOpening,
        waitVisible:async deadline=>{await exact(owner.prefix+';WizrdMCF').waitFor({state:'visible',timeout:Math.max(1,deadline-Date.now())});openedWizard=true;}});
    }else{
      report.effects.push({at:new Date().toISOString(),action:'open-wizard',node_id:node.id,state:'dispatching'});await save();
      const point=await page.evaluate(({id,tid,icon})=>{
        const d=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController?.FDiagram;
        const matches=d?.FNodes?.FCollection?.filter(n=>n.FGuid===id);
        if(matches?.length!==1||matches[0].FIconCls!==icon||d.FmxGraph.view.getState(matches[0].FCell)?.shape?.node?.getAttribute('data-tid')!==tid)throw Error('Wizard target identity changed');
        const settings=[...d.FmxGraph.container.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===tid+';Setting');
        if(settings.length!==1)throw Error('Unique bound Setting control required');
        const setting=settings[0],b=setting.getBoundingClientRect();
        if(setting.closest('.x-item-disabled,.x-grid-row-disabled')||setting.getAttribute('aria-disabled')==='true')throw Error('Setting disabled');
        for(const dy of [.5,.25,.75])for(const dx of [.5,.25,.75]){const x=b.x+b.width*dx,y=b.y+b.height*dy,hit=document.elementFromPoint(x,y);
          const control=hit?.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"]');
          if(x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&hit&&(hit===setting||setting.contains(hit))
            &&hit.closest('[data-tid]')===setting&&(!control||control===setting))return{x,y,setting_tid:tid+';Setting',hit_tid:tid+';Setting'};}
        throw Error('Bound Setting covered');
      },{id:node.id,tid:node.tid,icon:expectedIcon});
      report.wizard_hit=point;await save();await guard();
      if(Date.now()>=wizardDeadline)throw Error('Original wizard opening deadline expired');
      await page.mouse.click(point.x,point.y);
      await exact(owner.prefix+';WizrdMCF').waitFor({state:'visible',timeout:Math.max(1,wizardDeadline-Date.now())});
    }
    openedWizard=true;
    report.stage='wizard-ready';
    let editorPage=(await waitWizardReady()).page;
    await snapshot('wizard-first-page');await guard();
    if(options['--inspect-pages']){
      report.stage='inspect-pages';editorPage=await inspectWizardPages();
      await snapshot('wizard-editor-page');await guard();
    }
    const editor=await page.evaluate(({prefix,expectedPage,root,native,binding})=>{
      const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
      const roots=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===prefix+';WizrdMCF'&&visible(e));
      const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
      if(roots.length!==1||roots[0]!==root||tab!==binding.tab||tab?.Controller?.Node?.data?.node!==native
        ||tab.Controller.FController?.FModelNode!==binding.nodeData||tab.Controller.FController?.FView?.el?.dom!==root)throw Error('Wizard owner changed during editor observation');
      const pages=[...root.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===expectedPage.tid&&visible(e));
      if(pages.length!==1)throw Error('Editor page changed');
      const wrappers=[...pages[0].querySelectorAll('.CodeMirror')].filter(visible);
      const breadcrumbs=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid').startsWith(prefix+';cnrNaviMode;b.s_')&&visible(e)).slice(0,24).map(e=>({tid:e.getAttribute('data-tid'),label:(e.textContent??'').trim().slice(0,180)}));
      if(wrappers.length!==1)return{status:wrappers.length?'ambiguous':'not_visible_on_observed_page',breadcrumbs,visible_editors:wrappers.length};
      const cm=wrappers[0].CodeMirror,doc=cm?.getDoc?.(),input=cm?.getInputField?.();
      if(cm?.getWrapperElement?.()!==wrappers[0]||!input?.isConnected||!wrappers[0].contains(input)||!doc)throw Error('Editor identity unavailable');
      const lines=doc.lineCount(),parts=[];
      if(!Number.isInteger(lines)||lines<1||lines>1024||doc.firstLine()!==0||doc.lastLine()!==lines-1)return{status:'outside_read_bound',breadcrumbs,lines};
      let bytes=0;
      for(let i=0;i<lines;i++){const line=doc.getLine(i);if(typeof line!=='string'||/[\r\n\0]/.test(line))throw Error('Unsupported editor document');bytes+=new TextEncoder().encode(line).length+(i?1:0);if(bytes>32768)return{status:'outside_read_bound',breadcrumbs,lines};parts.push(line);}
      return {status:'observed',breadcrumbs,lines,bytes,source_text:parts.join('\n'),
        editor_version:typeof globalThis.CodeMirror?.version==='string'?globalThis.CodeMirror.version:null,
        owner_tid:wrappers[0].closest('[data-tid]')?.getAttribute('data-tid'),
        options:Object.fromEntries(['readOnly','mode','indentUnit','indentWithTabs','smartIndent','electricChars'].map(k=>[k,cm.getOption(k)]).filter(([,v])=>['string','number','boolean'].includes(typeof v)))};
    },{prefix:owner.prefix,expectedPage:editorPage,root:wizardRoot,native:wizardHandle,binding:wizardBinding});
    const baselineSource=editor.source_text;
    if(managedSourceTask){
      try{
        const managedPage=await Function('return ('+makeJavascriptManagedPageCode(managedSourceTask)+')')()(page);
        if(managedPage.ready!==true||managedPage.page?.tid!==owner.prefix+';WizrdMCF;JavaScriptCodeWizard'
          ||managedPage.page.visible_editors!==1||managedPage.node_guid!==managedSourceTask.owner.node_id)
          throw Error('Managed JavaScript page does not own the CodeMirror editor');
        report.managed_page_observation={verified:true,page_tid:managedPage.page.tid,
          page_index:managedPage.page.index,indicator_count:managedPage.page.indicator_count,
          node_id:managedPage.node_guid};
        await executionRecord({phase:'managed_javascript_page_observed',...report.managed_page_observation});
        await save();
        const observed=await Function('return ('+makeJavascriptManagedSourceCode(managedSourceTask)+')')()(page);
        if(observed.verified!==true||observed.source!==baselineSource
          ||observed.source_utf8_bytes!==Buffer.byteLength(baselineSource,'utf8'))
          throw Error('Managed JavaScript source differs from the owned editor baseline');
        report.managed_source_observation={verified:true,source_sha256:digest(observed.source),
          source_utf8_bytes:observed.source_utf8_bytes,source_lf_lines:observed.source_lf_lines,
          node_context:observed.node_context};
        await executionRecord({phase:'managed_javascript_source_observed',...report.managed_source_observation});
        await save();
      }finally{
        const {prepared,allowDeactivation,...selectionTask}=managedSourceTask;
        await Function('return ('+makeJavascriptManagedSelectionReadCode({...selectionTask,mode:'dispose'})+')')()(page);
        managedSourceTask=null;
      }
    }
    if(typeof editor.source_text==='string'){
      editor.source_sha256=digest(Buffer.from(editor.source_text,'utf8'));
      editor.source_redaction_changed=redactor.text(editor.source_text)!==editor.source_text;
      delete editor.source_text;
    }
    const afterRead=await waitWizardReady({deadline:options['--inspect-pages']?Date.parse(report.page_inspection_deadline):wizardDeadline,inputOnly:!options['--inspect-pages']});
    if(JSON.stringify(afterRead.page)!==JSON.stringify(editorPage))throw Error('Editor page changed during read');
    report.snapshots.push({at:new Date().toISOString(),label:options['--inspect-pages']?'wizard-editor-read':'wizard-editor-first-page',page:editorPage,...editor});await save();
    if(options['--inspect-pages']&&editor.status!=='observed')throw Error('Full bounded editor read unavailable');
    if(options['--inspect-pages']&&!executionCase){
      report.g1_native_type=await page.evaluate(readJavascriptG1Type,schemaContext());await save();
    }
    if(options['--probe-source']){
      report.stage='source-probes';
      await probeOwnedSource(baselineSource);
      report.stage='remaining-pages';
      await inspectWizardPages({remainingPages:true});
    }
    if(executionCase){
      const mode=executionCase.split('-')[0],sentinel=executionCase.includes('-sentinel-');
      const probe=(nativeRoundtrip?nativeRoundtripProbe:discoveryProbe)??javascriptExecutionProbes('RowID').find(p=>p.schema_mode===mode&&p.id.endsWith(sentinel?'execution-sentinel':'table-v1'));
      report.execution_probe={id:probe.id,source_sha256:probe.source_sha256,status:'source_pending'};await save();
      if(calibrationTrial)await calibrationTrial.capturePrior({source:baselineSource,input:executionInput,node:executionNode,record:executionRecord});
      await probeOwnedSource(baselineSource,probe.source);
      if(options['--verify-runtime-source']){
        const prepared={document_id:executionPrepared.document_id,workflow_ref:executionPrepared.workflow_ref,
          node:{document_id:executionPrepared.document_id,workflow_id:executionPrepared.workflow_ref.workflow_id,node_id:executionNode.node_id}};
        const observed=await Function('return ('+makeJavascriptSourceContextCode(prepared,config.username)+')')()(page);
        if(observed.verified!==true||observed.source!==probe.source
          ||observed.source_utf8_bytes!==Buffer.byteLength(probe.source,'utf8')
          ||observed.source_lf_lines!==probe.source.split('\n').length)
          throw Error('Prepared runtime JavaScript source differs from owned operator observation: '+observed.reason);
        report.runtime_source_observation={verified:true,source_sha256:digest(observed.source),
          source_utf8_bytes:observed.source_utf8_bytes,source_lf_lines:observed.source_lf_lines,
          node_context:observed.node_context};
        await executionRecord({phase:'runtime_javascript_source_observed',...report.runtime_source_observation});
        await save();
      }
      report.execution_probe.status='source_verified';await save();
      if(nativeRoundtrip){
        const event={phase:'native_roundtrip_source_bound',...await page.evaluate(bindJavascriptNativeRoundtripSource,{...schemaContext(),schema:report.execution_schema})};
        const saved=await executionRecord(event);
        if((nativeFixtureId==='cardinality-empty'||nativeFixture.coercion||namedTrial||telemetryTrial||calibrationTrial)&&JSON.stringify(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])))!==JSON.stringify(event))throw Error('Declared source binding journal ACK differs');
      }
      // Execution dispatch is kept separate from source replacement; each
      // trigger receives its own fresh error baseline and once-only receipt.
      await runExecutionTrial(probe);
    }
    // Each execution case retains its observed outcome before discarding an open draft.
    report.stage='discard-wizard';
    if(openedWizard)await closeWizardOnce();
    await snapshot('wizard-discarded');
    if(coercionTrial&&report.native_roundtrip)report.stage='native-coercion-awaiting-finalization';
    if(nativeRoundtrip&&report.native_roundtrip&&!coercionTrial&&!namedTrial&&!telemetryTrial)report.stage=report.native_roundtrip.outcome?.characterization_only?'native-roundtrip-characterized':'native-roundtrip-observed';
    }
    }
};

try {
  await save();
  if(options['--x11-no-focus']){
    report.stage='focus-setup';
    focusGuard=await createJavascriptHeadedFocusX11({profile:options['--profile'],browserPath:options['--browser'],
      record:async value=>{report.focus_x11=value;await save();}});
  }
  session=await loginBrowser({browserPath:options['--browser'],profile:options['--profile'],candidate:config,headless:false,keepOpen:true,
    ...(focusGuard?{onContextCreated:focusGuard.onContextCreated}:{})});
  page=session.context.pages()[0];page.setDefaultTimeout(10000);
  await mkdir(directory+'/browser-lifecycle',{mode:0o700});
  browserLifecycle=observeJavascriptBrowserLifecycle({context:session.context,page,stage:()=>report.stage,
    record:createExecutionJournal({directory:directory+'/browser-lifecycle',metadata:{sessionId:'javascript-g2',clientRevision:'operator-source'}})});
  report.browser_lifecycle={journal:'browser-lifecycle/execution-events.jsonl',scope:'post-login; bounded Playwright events; closure cause not inferred'};
  report.stage='home-ready';
  await page.locator('[data-tid$="HomePage"]').filter({visible:true}).waitFor({timeout:30000});
  const home=await snapshot('home');await guard();
  if (home.packages!==0) throw Error('Preexisting packages; no ownership');
  report.geometry={viewport:page.viewportSize(),...await page.evaluate(()=>({inner_width:innerWidth,outer_width:outerWidth,available_width:screen.availWidth}))};
  if (report.geometry.viewport!==null) throw Error('Expected headed null viewport');
  report.server_os={status:'not_established',candidates:home.fields.filter(f=>/ServerOS|OperatingSystem|OSName|ServerPlatform/i.test(f.path))};
  if(options['--server-version-only']){
    report.stage='read-server-version';
    report.server_os=await page.evaluate(readJavascriptServerVersion,{account:config.username,build:'7.4.2'});
    await executionRecord({phase:'server_version_read',observation:report.server_os});
    if(report.server_os.status!=='observed'||report.server_os.edition!=='Enterprise')throw Error('Owned Loginom server version unavailable');
    await save();
  }
  report.storage={status:'not_established',candidates:home.fields.filter(f=>/Storage|Directory/i.test(f.path)),expected_account_folder:'/jsteach',permissions:'not_checked'};
  if(packageFile){
    report.stage='package-file-open';coldOpenPending=true;
    const code=makeWorkspacePrepareCode({loginomUrl:config.url,compatibility:{profile_id:'javascript-ubuntu',loginom_build:'7.4.2',platform:'linux',browser:'chromium'},
      sessionId:'javascript-package-file',operationId:'javascript-package-file-open',intent:'open_package',packagePath:options['--package'],timeoutMs:Math.min(120000,remainingBatch())});
    executionPrepared=await Function('return ('+code+')')()(page);
    await executionRecord({phase:'package_file_workspace_prepared',prepared:executionPrepared});
    if(executionPrepared.status!=='READY'||executionPrepared.target_verified!==true)throw Error('Own saved package opening unconfirmed');
    const binding=await bindJavascriptPackage({page,prepared:executionPrepared,account:config.username,savedPath:options['--package']});
    try{packageHandle=await page.evaluateHandle(bound=>bound.packageNode,binding);}finally{await binding.dispose();}
    const observed=await observe();
    if(observed.package_name!==executionPrepared.package_ref.name||observed.prefix!==executionPrepared.workflow_ref.prefix)
      throw Error('Own saved package identity differs');
    owner=observed;coldOpenPending=false;await guard();await waitGraphReady();
    try {
      report.stage='package-file-directory';
      report.package_file_observation=await openJavascriptPackageFileTab(page,{account:config.username,
        path:options['--package'],packageHandle});await save();
      report.stage='package-file-read';packageFileReadUncertain=true;
      report.package_file=await readJavascriptPackageFile({page,documentId:executionPrepared.document_id,
        path:options['--package'],packageHandle,directory:directory+'/package-bytes'});
      packageFileReadUncertain=false;
      await executionRecord({phase:'package_file_bytes_verified',receipt:report.package_file});await save();
    } finally {
      if(!packageFileReadUncertain){
        report.stage='package-file-return-workflow';
        const returnable=await page.evaluate(({account,owned,tabTid})=>{
          const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
          const card=form?.Items?.Workspace?.getActiveTab?.(),controller=card?.Controller?.FController;
          const tabs=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===tabTid&&e.isConnected);
          return form?.FMapTree?.FServerConnection?.UserName===account&&form.FMapTree.PackageNodes?.Count===1
            &&form.FMapTree.PackageNodes.Items(0)===owned&&controller?.constructor?.name==='FileStorageForm'&&tabs.length===1;
        },{account:config.username,owned:packageHandle,tabTid:executionPrepared.workflow_ref.tab_tid});
        if(returnable){await page.locator('[data-tid="'+executionPrepared.workflow_ref.tab_tid+'"]').click();await waitGraphReady();await guard();}
      }
    }
  }
  if(coldReader){
    report.stage='cold-open-package';await guard();coldOpenPending=true;
    const code=makeWorkspacePrepareCode({loginomUrl:config.url,compatibility:{profile_id:'javascript-ubuntu',loginom_build:'7.4.2',platform:'linux',browser:'chromium'},
      sessionId:'javascript-cold',operationId:'javascript-cold-open',intent:'open_package',packagePath:options['--package'],timeoutMs:Math.min(120000,remainingBatch())});
    executionPrepared=await Function('return ('+code+')')()(page);
    await executionRecord({phase:'cold_workspace_prepared',prepared:executionPrepared});
    if(executionPrepared.status!=='READY'||executionPrepared.target_verified!==true)throw Error('Cold package preparation unconfirmed');
    const binding=await bindJavascriptPackage({page,prepared:executionPrepared,account:config.username,savedPath:options['--package']});
    try{packageHandle=await page.evaluateHandle(bound=>bound.packageNode,binding);}finally{await binding.dispose();}
    const observed=await observe();
    if(typeof observed.package_name!=='string'||!observed.package_name||observed.package_name!==executionPrepared.package_ref.name
      ||observed.prefix!==executionPrepared.workflow_ref.prefix)throw Error('Cold observed package metadata differs');
    owner=observed;await guard();await waitGraphReady();
    executionRuntime=await createJavascriptSavedExecutionRuntime({page,prepared:executionPrepared,directory,account:config.username,
      record:executionRecord,deadline:batchDeadline,savedPath:options['--package']});
    coldOpenPending=false;
    const graph=await executionRuntime.graph(),nodes=javascriptColdNodes(graph,await observe(),executionPrepared);
    executionNode=nodes.node;report.owned_node=nodes.rendered;report.cold_discovery={graph,...nodes};
    wizardBinding=await page.evaluateHandle(observeJavascriptWizardBinding,{id:nodes.rendered.id,tid:nodes.rendered.tid,icon:nodes.rendered.icon_class,owned:packageHandle});
    await save();await runColdRead();
  }
  if (options['--create-node']||options['--palette-only']||options['--palette-hit-test']) {
    report.stage='create-draft';await guard();
    createDeadline=phaseDeadline(120000);
    report.package_preparation_deadline=new Date(createDeadline).toISOString();
    report.effects.push({at:new Date().toISOString(),action:'create-draft',state:'dispatching'});await save();
    if(executionCase||nativeInputOnly){
      const code=makeWorkspacePrepareCode({loginomUrl:config.url,compatibility:{profile_id:'javascript-ubuntu',loginom_build:'7.4.2',platform:'linux',browser:'chromium'},
        sessionId:'javascript-g2',operationId:'javascript-g2-prepare',timeoutMs:createRemaining()});
      executionPrepared=await Function('return ('+code+')')()(page);
      await executionRecord({phase:'workspace_prepared',prepared:executionPrepared});
      if(executionPrepared.status!=='READY')throw Error('G2 workspace preparation failed');
    }else{
      await click('MF;cntMain;tlbMainToolbar;btnPackagesMenu');
      await click('MF;MainMenuForm;btnCreateUnsavedPackage');
    }
    report.stage='bind-created-package';
    await page.waitForFunction(account=>{
      const m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
      if(m?.FServerConnection?.UserName!==account||m?.PackageNodes?.Count>1)throw Error('Create package ownership changed');
      return m?.PackageNodes?.Count===1;
    },config.username,{timeout:createRemaining()});
    packageHandle=await page.evaluateHandle(()=>globalThis.bg.app.Application.FInstance.FMainForm.FMapTree.PackageNodes.Items(0));
    await snapshot('created-package-before-metadata');
    // The package exists before its active workflow/controller. Retain the
    // native object handle now; graph admission is a separate readonly wait.
    await guard();report.effects.push({at:new Date().toISOString(),action:'create-draft',state:'native-package-bound'});await save();
    report.stage='await-package-metadata';await settlePackageMetadata();
    report.stage='await-created-workflow';
    await page.waitForFunction(({owned,account})=>{
      const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm,m=f?.FMapTree;
      if(m?.FServerConnection?.UserName!==account||m.PackageNodes?.Count!==1||m.PackageNodes.Items(0)!==owned)throw Error('Bound package changed while awaiting workflow');
      const model=f.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
      const app=globalThis.bg?.app;
      if(!app?.ModelForm||!(model instanceof app.ModelForm)||!model?.FDiagram?.FmxGraph?.container)return false;
      const tabs=[...document.querySelectorAll('[data-tid]')].filter(e=>/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(e.getAttribute('data-tid'))&&e.classList.contains('x-tab-active'));
      if(tabs.length!==1)return false;
      const prefix='MF;TF'+(tabs[0].getAttribute('data-tid').match(/;tb(-\d+)?$/)?.[1]??'');
      return model.FDiagram.FmxGraph.container.getAttribute('data-tid')===prefix+';ModelForm;cmpDiagram';
    },{owned:packageHandle,account:config.username},{timeout:createRemaining()});
    owner=await snapshot('created-workflow');
    if(!owner.native_model||!owner.prefix)throw Error('Created workflow identity unavailable');
    await guard();
    report.effects.push({at:new Date().toISOString(),action:'create-draft',state:'observed',package_name:owner.package_name,prefix:owner.prefix});
    report.stage='graph-ready';await waitGraphReady(createRemaining());
    await snapshot('graph-ready-baseline');
    if(executionCase||nativeInputOnly){
      report.scope=telemetryTrial?'private fixed schema telemetry: '+nativeTelemetryCaseId:calibrationTrial?'private fixed error calibration: '+nativeCalibrationId:namedTrial?'private stage A/B named access: '+nativeNamedCaseId:coercionTrial?'private Integer coercion characterization: '+nativeFixtureId:nativeRoundtrip?'private native '+nativeFixtureId+'/NULL identity roundtrip':nativeInputOnly?'private native '+nativeFixtureId+' input-only admission':discoveryProbe?.scope==='P1-business'?'private P1 business 6x4 oracle':discoveryProbe?.scope==='P1-stop'?'private P1 finite Stop and same-node rerun':discoveryProbe?.scope==='C0-materialization'?'private C0 output0 mapping materialization and bound Table; G3 lineage unverified':discoveryProbe?.scope==='G3-bridge'?'private G3 observed logical metadata to physical output0; business oracle separate':discoveryProbe?'isolated engine/G5 UI/diagnostic discovery':'G2/G3 operator trial';report.execution_case=executionCase;
      if(discoveryProbe){report.discovery_probe=discoveryProbe;report.explicit_execution_limit=materializationProbe?2:1;report.gates_closed=[];}
      if(persistence){report.scope='private G7 persistence writer: '+persistence.schema_mode;report.gates_closed=[];}
      if(nativeRoundtrip){report.explicit_execution_limit=1;report.gates_closed=[];}
      executionRuntime=await createJavascriptExecutionRuntime({page,prepared:executionPrepared,directory,account:config.username,
        record:executionRecord,effectScope:()=>report.case_id,deadline:batch||nativeRoundtrip||persistence?batchDeadline:Date.now()+1200000,nativeInputOnly:nativeInputOnly||nativeRoundtrip,nativeFixtureId,nativeNamedCaseId,nativeCalibrationId,nativeTelemetryCaseId,metadataDiagnostic,persistence:!!persistence,inputVariant:discoveryProbe?.input_variant??'base',materialization:materializationProbe});
      report.stage='prepare-typed-input';executionInput=await executionRuntime.prepareInput();
      report.execution_input=executionInput;await save();await guard();await waitGraphReady();
      if(nativeRoundtrip)await executionRuntime.armNativeRoundtrip(executionInput);
      if(batch||discoveryProbe){
        if(!executionInput.table?.execution_id)throw Error('Batch input execution proof absent');
        inputBinding=await page.evaluateHandle(input=>{
          const tab=globalThis.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),controller=tab.Controller;
          const diagram=controller.FController.FDiagram,nodes=diagram.FNodes.FCollection;
          const found=nodes.filter(n=>n.FGuid===input.node.node_id);
          if(found.length!==1||!found[0].data)throw Error('Batch input native identity absent');
          const node=found[0],ports=node.FPorts?.flatMap(list=>list.FCollection??[]).filter(p=>p.FGuid===input.table.port_guid);
          if(ports?.length!==1)throw Error('Batch input native output port absent');
          return {document,tab,controller,diagram,node,data:node.data,cell:node.FCell,port:ports[0]};
        },executionInput);
      }
    }
    if(nativeInputOnly){
      if(!executionInput.native_input?.native.exact.native_bytes_verified)throw Error('Complete native input admission required');
      report.native_input=executionInput.native_input;report.js_created=false;report.js_executed=false;report.gates_closed=[];
      report.stage='native-input-observed';await save();
    }
    else if(!batch)await runPreparedCase();
    else {
      rootReport.scope='G2/G3 bounded batch';delete rootReport.execution_case;rootReport.execution_cases=batch;rootReport.batch_deadline=new Date(batchDeadline).toISOString();rootReport.cases=[];
      try {
        await runJavascriptBatch({cases:batch,deadline:batchDeadline,
          begin:async entry=>{
            executionCase=entry.execution_case;report={...entry,stage:'case-start',status:'RUNNING',snapshots:[],effects:[]};
            rootReport.cases.push(report);await save();
            for(const handle of [wizardRoot,wizardHandle,wizardBinding,executionDrop?.native])await handle?.dispose();
            executionDrop=null;
            wizardRoot=null;wizardHandle=null;wizardBinding=null;executionNode=null;executionInputProof=null;
            openedWizard=false;closeDispatched=false;closeConfirmed=false;previewCloseState={dispatched:false};closeDeadline=0;wizardDeadline=0;readingExisting=false;initialOpening={};
            await verifyBatchInputIdentity();
            report.input_reuse={node:executionInput.node,original_execution_id:executionInput.table.execution_id,
              original_schema:executionInput.table.schema,original_proof:executionInput.proof,
              current_table:await executionRuntime.readPassive(executionInput.node,'input'),execution_started:false};
            await verifyBatchInputIdentity();await waitGraphReady();await save();
          },
          run:async()=>{await runPreparedCase();return {node_id:report.owned_node?.id,probe:report.execution_probe};},
          settle:async()=>{
            if(openedWizard)throw Error('Batch wizard remains open');
            await verifyBatchInputIdentity();
            await waitGraphReady();const state=await guard();
            const proof=await page.evaluate(({binding,inputId,nodeId})=>{
              const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
              const nodes=tab?.Controller?.FController?.FDiagram?.FNodes?.FCollection;
              if(tab!==binding.tab||tab?.Controller?.Node?.data?.node!==binding.workflow||!Array.isArray(nodes)||nodes.length>20
                ||nodes.filter(n=>n.FGuid===nodeId&&n.data===binding.nodeData).length!==1||nodes.filter(n=>n.FGuid===inputId).length!==1)
                throw Error('Batch original workflow/node/input identity changed');
              return {owner_verified:true,node_count:nodes.length};
            },{binding:wizardBinding,inputId:executionInput.node.node_id,nodeId:report.owned_node.id});
            if(state.running!==false)throw Error('Batch package still running');
            return {...proof,wizard_closed:true,quiet:true};
          },
          record:async event=>{Object.assign(report,event);await save();}
        });
      } finally {
        rootReport.owned_node=report.owned_node;rootReport.stage=report.stage;rootReport.last_case_id=report.case_id;
        report=rootReport;
      }
    }
  }
  if(coldReader||persistence||packageFile)report.work_finished_at=new Date().toISOString();
  report.status=coercionTrial||namedTrial||telemetryTrial||calibrationTrial?'PENDING_EVIDENCE':'OBSERVED';
} catch(error) {
  report.status='FAILED';report.failure={stage:report.stage,...redactor.redact(javascriptProbeFailure(error))};
  const diagnostic=(coldOpenPending||sourceCycleUncertain||sourceReaders.some(reader=>reader.uncertain)||executionRuntime?.metadataReadUncertain||(telemetryTrial&&executionRuntime?.nativeReadUncertain))?null:await captureJavascriptNativeClassifierDiagnostic({nativeRoundtrip,stage:report.stage,page,binding:nativeClassifierBinding});
  if(diagnostic)report.native_classifier_diagnostic=diagnostic;
  if(discoveryProbe)report.discovery_failure_context={source_sha256:discoveryProbe.source_sha256,
    terminal_receipt_observed:!!report.execution_probe?.execution,syntax_support:'not_determined'};
  if (page&&!(coldOpenPending||sourceCycleUncertain||sourceReaders.some(reader=>reader.uncertain)||executionRuntime?.metadataReadUncertain||(telemetryTrial&&executionRuntime?.nativeReadUncertain))) await snapshot('failure').catch(()=>{report.failure.snapshot='unavailable';});
  if (page&&owner&&!(coldOpenPending||sourceCycleUncertain||sourceReaders.some(reader=>reader.uncertain)||executionRuntime?.metadataReadUncertain||(telemetryTrial&&executionRuntime?.nativeReadUncertain))) await paletteSnapshot('failure-palette').catch(()=>{report.failure.palette_snapshot='unavailable';});
  if (page&&!(coldOpenPending||sourceCycleUncertain||sourceReaders.some(reader=>reader.uncertain)||executionRuntime?.metadataReadUncertain||(telemetryTrial&&executionRuntime?.nativeReadUncertain))) await refusalEvidence('work-refusal').catch(()=>{report.failure.refusal_evidence='unavailable';});
} finally {
  cleaning=true;cleanupDeadline=Date.now()+180000;report.work_stage=report.stage;report.stage='cleanup';
  try {
    if (page) {
      if(coldOpenPending)throw Error('Cold package opening/binding uncertain; close own browser only');
      if(packageFileReadUncertain)throw Error('Native package read uncertain; no UI cleanup replay, close own browser');
      if(sourceCycleUncertain||sourceReaders.some(reader=>reader.uncertain))throw Error('Source cycle uncertain; no UI cleanup replay, close own browser');
      if(managedCloseUncertain)throw Error('Managed JavaScript Close uncertain; no UI cleanup replay, close own browser');
      if(executionRuntime?.persistenceUncertain)throw Error('Persistence save/binding uncertain; no UI cleanup replay, close own browser');
      if(executionRuntime?.nativeReadUncertain)throw Error('Native input pending/retired or buffer cleanup unconfirmed; UI cleanup refused, close own browser');
      if(paletteAdmission?.inputReleaseConfirmed===false)throw Error('Palette mouse/Alt release unconfirmed; UI cleanup refused, browser must close');
      if(createDeadline&&!packageHandle){
        report.cleanup.stage='inspect-pending-create';
        const pending=await snapshot('cleanup-create-reconciliation');
        if(pending.account===config.username&&pending.packages===1){
          packageHandle=await page.evaluateHandle(()=>globalThis.bg.app.Application.FInstance.FMainForm.FMapTree.PackageNodes.Items(0));
          report.effects.push({at:new Date().toISOString(),action:'create-draft',state:'native-package-bound-during-cleanup'});
        }
      }
      if(packageHandle&&!owner){report.cleanup.stage='settle-created-package';await settlePackageMetadata();}
      requireJavascriptInitialOpeningCleanup(initialOpening);
      if(executionRuntime&&owner&&!openedWizard){
        const surface=await observe();
        if(surface.prefix!==owner.prefix||executionRuntime.passiveSurfacePending||executionRuntime.wizardOpeningPending||executionRuntime.manualMappingPending){
          report.cleanup.stage='restore-owned-workflow';
          await executionRuntime.restoreWorkflowForCleanup(phaseDeadline(60000));
        }
      }
      await guard();
      if (openedWizard) {
        if(columnState.pending){
          report.cleanup.stage='settle-owned-column-editor';
          await cleanupJavascriptColumnEditor({page,state:columnState,record:executionRecord,deadline:Date.now()+60000});
        }
        if(executionCase&&wizardRoot&&wizardHandle){
          await closeJavascriptPreviewOnce({read:()=>page.evaluate(readJavascriptStage,schemaContext()),state:previewCloseState,
            record:executionRecord,close:()=>click(owner.prefix+';WizrdMCF;JavaScriptOutputPreviewForm;p.h;close'),
            waitHidden:()=>exact(owner.prefix+';WizrdMCF;JavaScriptOutputPreviewForm').waitFor({state:'hidden'})});
        }
        report.cleanup.stage='observe-original-wizard-close';
        await closeWizardOnce();
      }
      if (owner) {
        report.cleanup.stage='close-owned-package';
        const current=await guard();
        if(current.native_model&&owner.prefix)await waitGraphReady();
        else {
          report.cleanup.stage='wait-owned-package-ui';
          await page.waitForFunction(()=>![...document.querySelectorAll('.bg-mask-message,.x-mask-msg,[role="dialog"],.x-message-box')].some(e=>e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'),undefined,{timeout:30000});
          await guard();
        }
        if ((await guard()).running!==false) throw Error('Cannot close: running state not proven false');
        await click('MF;cntMain;tlbMainToolbar;btnPackagesMenu');
        const heading=await (await visibleOne(exact('MF;MainMenuForm;pnlSaveClosePackage;p.h;p.t'))).innerText();
        if (heading.trim()!==ownedPackageName()) throw Error('Close menu owner mismatch');
        const packageCloseDeadline=phaseDeadline(90000);
        const packageCloseRemaining=()=>{const ms=packageCloseDeadline-Date.now();if(ms<=0)throw Error('Original package close deadline expired; no replay');return ms;};
        report.effects.push({at:new Date().toISOString(),action:'package-close',state:'dispatching',deadline:new Date(packageCloseDeadline).toISOString()});await save();
        await (await visibleOne(exact('MF;MainMenuForm;btnClosePackage'))).click({timeout:packageCloseRemaining()});
        report.cleanup.stage='close-confirmation';
        const proof=await page.waitForFunction(({owned,account,name,packagePath})=>{
          const map=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
          if(map?.FServerConnection?.UserName!==account)throw Error('Package close account changed');
          if(map.PackageNodes?.Count===0)return {state:'closed'};
          const rawPath=owned.PackageFileName,path=rawPath?'/'+rawPath.replaceAll('\\','/').replace(/^\/+/, ''):null;
          if(map.PackageNodes?.Count!==1||map.PackageNodes.Items(0)!==owned||owned.PackageName!==name||path!==packagePath)throw Error('Package close owner changed');
          const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
          const dialogs=[...document.querySelectorAll('.x-message-box,[role="dialog"]')].filter(visible);
          if(!dialogs.length)return false;
          if(dialogs.length!==1)throw Error('Ambiguous package close dialog');
          const dialog=dialogs[0],component=globalThis.Ext?.getCmp?.(dialog.id);
          const expected='Loginom 7.4.2 Сохранить изменения в пакете "'+name+'"? Сохранить Не сохранять Отмена';
          if((dialog.innerText??'').replace(/\s+/g,' ').trim()!==expected)return false;
          const buttons=[...dialog.querySelectorAll('[data-tid="msgbox;tlb;no"]')].filter(visible),button=buttons[0];
          const control=button&&globalThis.Ext?.getCmp?.(button.id);
          if(component?.el?.dom!==dialog||buttons.length!==1||control?.el?.dom!==button||control.disabled===true
            ||button.closest('.x-item-disabled,.x-btn-disabled')||button.textContent.trim()!=='Не сохранять')return false;
          return {state:'confirm',dialog,component,button,control,expected};
        },{owned:packageHandle,account:config.username,name:ownedPackageName(),packagePath:ownedPackagePath()},{timeout:packageCloseRemaining(),polling:100});
        const decision=await proof.getProperty('state');
        if(await decision.jsonValue()==='confirm'){
          await guard();
          if(!await page.evaluate(p=>{
            const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
            const ds=[...document.querySelectorAll('.x-message-box,[role="dialog"]')].filter(visible);
            return ds.length===1&&ds[0]===p.dialog&&p.component.el.dom===p.dialog&&p.control.el.dom===p.button
              &&p.dialog.contains(p.button)&&visible(p.button)&&p.control.disabled!==true
              &&(p.dialog.innerText??'').replace(/\s+/g,' ').trim()===p.expected;
          },proof))throw Error('Observed package discard dialog changed');
          const discard=await proof.getProperty('button');
          report.effects.push({at:new Date().toISOString(),action:'package-discard',state:'dispatching'});await save();
          await discard.asElement().click({timeout:packageCloseRemaining()});await discard.dispose();
        }
        await decision.dispose();await proof.dispose();
        await page.waitForFunction(({account,owned})=>{
          const map=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
          if(map?.FServerConnection?.UserName!==account)throw Error('Account changed during package discard');
          if(map.PackageNodes?.Count===0)return true;
          if(map.PackageNodes?.Count!==1||map.PackageNodes.Items(0)!==owned)throw Error('Package changed during discard');
          return false;
        },{account:config.username,owned:packageHandle},{timeout:packageCloseRemaining()});
      } else if ((await guard()).packages!==0) throw Error('No owned package cleanup authority');
      report.cleanup.package_closed=true;
      report.cleanup.stage='wait-home';
      await page.locator('[data-tid$="HomePage"]').filter({visible:true}).waitFor({timeout:30000});
      await page.waitForFunction(()=>{
        const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
        const n=f?.Items?.Workspace?.getActiveTab?.()?.Controller?.Node?.data?.node;
        return f?.FMapTree?.PackageNodes?.Count===0&&n?.constructor?.name==='HomePageTreeNode';
      },undefined,{timeout:30000});
      report.cleanup.stage='wait-avatar';
      await exact('MF;cntMain;tlbMainToolbar;btnAvatar').waitFor({state:'visible',timeout:15000});
      report.cleanup.stage='open-account-menu';
      await click('MF;cntMain;tlbMainToolbar;btnAvatar');
      report.cleanup.stage='wait-account-menu';
      await exact('MF;AppMenuForm;p.h;p.t').waitFor({state:'visible',timeout:10000});
      if ((await exact('MF;AppMenuForm;p.h;p.t').innerText()).trim()!==config.username) throw Error('Logout identity changed');
      await exact('MF;AppMenuForm;btnLogOut').waitFor({state:'visible',timeout:10000});
      report.cleanup.stage='logout';
      await click('MF;AppMenuForm;btnLogOut');
      await exact('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible',timeout:15000});
      report.cleanup.logged_out=true;
    }
  } catch(error) {report.cleanup.failure=redactor.text(String(error.message)).slice(0,1200);
    if(page&&!(coldOpenPending||sourceCycleUncertain||sourceReaders.some(reader=>reader.uncertain)||executionRuntime?.metadataReadUncertain||(telemetryTrial&&executionRuntime?.nativeReadUncertain))) {await snapshot('cleanup-failure').catch(()=>{});await refusalEvidence('cleanup-refusal').catch(()=>{report.cleanup.refusal_evidence='unavailable';});}}
  if (session) {
    if(browserLifecycle)await browserLifecycle.beforeClose();
    await session.context.close().then(()=>{report.cleanup.browser_closed=true;},()=>{report.cleanup.browser_closed=false;});
  }
  if(focusGuard)report.focus_x11={...report.focus_x11,monitor:await focusGuard.stop()};
  if(browserLifecycle)Object.assign(report.browser_lifecycle,await browserLifecycle.finish());
  if (!report.cleanup.package_closed||!report.cleanup.logged_out||!report.cleanup.browser_closed) report.status='CLEANUP_UNCONFIRMED';
  report.finished_at=new Date().toISOString();
  if(calibrationTrial){
    try{await calibrationTrial.finish({cleanup:report.cleanup,failure:report.failure,record:executionRecord,persist:async status=>{report.status=status;await save();}});}
    catch(error){report.status='EVIDENCE_UNCONFIRMED';report.evidence_failure=redactor.text(String(error.message)).slice(0,1200);await save().catch(()=>{});}
  }else if(coercionTrial){
    try{await coercionTrial.finish({cleanup:report.cleanup,failure:report.failure,record:executionRecord,persist:async status=>{report.status=status;await save();}});}
    catch(error){report.status='EVIDENCE_UNCONFIRMED';report.evidence_failure=redactor.text(String(error.message)).slice(0,1200);await save().catch(()=>{});}
  }else if(telemetryTrial){
    try{await telemetryTrial.finish({cleanup:report.cleanup,failure:report.failure,record:executionRecord,persist:async status=>{report.status=status;await save();}});}
    catch(error){report.status='EVIDENCE_UNCONFIRMED';report.evidence_failure=redactor.text(String(error.message)).slice(0,1200);await save().catch(()=>{});}
  }else if(namedTrial){
    try{await namedTrial.finish({cleanup:report.cleanup,failure:report.failure,record:executionRecord,persist:async status=>{report.status=status;await save();}});}
    catch(error){report.status='EVIDENCE_UNCONFIRMED';report.evidence_failure=redactor.text(String(error.message)).slice(0,1200);await save().catch(()=>{});}
  }else await save();
  console.log(JSON.stringify({status:report.status,work_stage:report.work_stage,report:directory+'/report.json',cleanup:report.cleanup}));
  if (!['OBSERVED','CHARACTERIZED'].includes(report.status)) process.exitCode=1;
}

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runJavascriptOperator();
