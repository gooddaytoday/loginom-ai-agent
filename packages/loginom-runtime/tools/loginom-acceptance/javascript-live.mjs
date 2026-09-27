import {javascriptNamedIds,javascriptNamedCase} from './javascript-native-named-cases.mjs';
import {createJavascriptNamedTrial,writeJavascriptNamedReport} from './javascript-native-named-run.mjs';
import {createJavascriptCoercionTrial,writeJavascriptCoercionReport} from './javascript-native-coercion-run.mjs';
import {javascriptCoercionIds} from './javascript-native-coercion-cases.mjs';
import {captureJavascriptNativeClassifierDiagnostic} from './javascript-native-classifier-diagnostic.mjs';
import {verifyJavascriptDeclaredEmpty} from './javascript-native-zero.mjs';
import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripMapping} from './javascript-native-roundtrip-contract.mjs';
import {bindJavascriptNativeRoundtripSource,bindJavascriptNativeRoundtripSchema,prepareJavascriptNativeRoundtripWizard,sealJavascriptNativeRoundtripDone} from './javascript-native-roundtrip-owner.mjs';
import {withJavascriptWizardAddress} from './javascript-wizard-settlement.mjs';
import {cleanupJavascriptColumnEditor} from './javascript-column-editor.mjs';
import {dragJavascriptPalette} from './javascript-palette-drag.mjs';
import {withJavascriptWizardMasks} from './javascript-wizard-masks.mjs';
// Operator-only G1/G4 discovery. No public editor guards are changed here.
import {readFile, mkdir, writeFile, readdir} from 'node:fs/promises';
import {resolve, isAbsolute, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {javascriptBatchCases,runJavascriptBatch,caseEffect,javascriptBatchInputIdentity,javascriptDropPoint} from './javascript-batch-plan.mjs';
import {loginBrowser} from '../../src/connection-check.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {javascriptEngineProbes} from './javascript-engine-probes.mjs';
import {javascriptDiscoveryIds,javascriptDiscoveryProbe,observeJavascriptDiscovery,javascriptDiscoveryWizardDiagnostic} from './javascript-discovery-probes.mjs';
import {javascriptSourceSample,javascriptSourceBoundary} from './javascript-source-probes.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {createJavascriptExecutionRuntime} from './javascript-execution-runtime.mjs';
import {openJavascriptInitialWizard,requireJavascriptInitialOpeningCleanup} from './javascript-initial-opening.mjs';
import {javascriptExecutionProbes} from './javascript-execution-probes.mjs';
import {javascriptMismatchSource,runJavascriptMismatchMaterialization,javascriptMismatchExecutionProgress,javascriptProbeFailure} from './javascript-mismatch-probe.mjs';
import {readJavascriptSchema,configureJavascriptSchema} from './javascript-schema-probe.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {javascriptSentinelOutcome,verifyJavascriptInputMapping,javascriptInitialPages,compactJavascriptJournalRecord,observeJavascriptBrowserLifecycle} from './javascript-execution-evidence.mjs';
import {readJavascriptStage,closeJavascriptPreviewOnce,javascriptStageTerminal,requireJavascriptStageAdmission,waitJavascriptStageObservation} from './javascript-stage-observer.mjs';

export async function runJavascriptOperator(args=process.argv.slice(2),{batchCases=null,nativeInputOnly=false,nativeRoundtrip=false}={}) {
process.umask(0o077);
const batch=batchCases===null?null:javascriptBatchCases(batchCases);
const batchDeadline=nativeRoundtrip?Date.now()+600000:batch?Date.now()+1800000:Infinity;
let cleaning=false;
const phaseDeadline=ms=>Math.min(cleaning?Infinity:batchDeadline,Date.now()+ms);
const remainingBatch=()=>{const ms=batchDeadline-Date.now();if(!cleaning&&ms<=0)throw Error('Original batch deadline expired');return cleaning?Infinity:ms;};
const usage = 'node javascript-live.mjs --config PRIVATE.json --profile ABS --browser ABS --evidence NEW_ABS [--palette-only | --palette-hit-test | --create-node [--inspect-pages [--probe-source]] | --execution-case CASE | --discovery-probe ID]\nCASE: {declared,code}-sentinel-{next,done,preview,execute}, {declared,code}-table-execute, code-table-mismatch\nIsolated discovery IDs: '+javascriptDiscoveryIds.join(',');
if (args.includes('--help')) { if(nativeRoundtrip)console.log('Stage A named cases: --native-named-case '+javascriptNamedIds.join('|')); if(nativeRoundtrip||nativeInputOnly)console.log('Fixed Integer coercion cases (one per fresh run): '+javascriptCoercionIds.join('|')); console.log(nativeRoundtrip?'node javascript-native-roundtrip-live.mjs --config PRIVATE.json --profile NEW_ABS --browser ABS --evidence NEW_ABS\n[--native-fixture real|boolean|string|integer-safe|integer-outside-safe|civil-datetime|cardinality-keep2|cardinality-odd|cardinality-duplicate|cardinality-empty] Private typed/NULL input admission then one fixed Data-only JS Execute (empty uses UI-declared schema), native output and upstream reread.':nativeInputOnly?'node javascript-native-input-live.mjs --config PRIVATE.json --profile NEW_ABS --browser ABS --evidence NEW_ABS\n[--native-fixture real|boolean|string|integer-safe|integer-outside-safe|civil-datetime|cardinality-keep2|cardinality-odd|cardinality-duplicate|cardinality-empty] Private input-only Value typed admission; one import Execute, typed UI + full fixed native read; no JS creation.':usage); return; }
const allowed = new Set(['--config','--profile','--browser','--evidence','--create-node','--palette-only','--palette-hit-test','--inspect-pages','--probe-source','--execution-case','--discovery-probe',...(nativeInputOnly||nativeRoundtrip?['--native-fixture']:[]),...(nativeRoundtrip?['--native-named-case']:[])]);
const options = {};
for (let i=0;i<args.length;i++) {
  const key=args[i];
  if (!allowed.has(key) || key in options) throw Error('Unknown or duplicate option');
  options[key]=['--create-node','--palette-only','--palette-hit-test','--inspect-pages','--probe-source'].includes(key) ? true : args[++i];
  if (options[key]===undefined) throw Error(usage);
}
if(batch&&options['--execution-case'])throw Error('Batch cannot also select a single case');
if(nativeInputOnly||nativeRoundtrip){
  if(batch||Object.keys(options).some(k=>!['--config','--profile','--browser','--evidence','--native-fixture',...(nativeRoundtrip?['--native-named-case']:[])].includes(k)))throw Error('Native input-only requires its separate private entrypoint and no JS modes');
  options['--create-node']=true;
}
const nativeNamedCaseId=options['--native-named-case'];
if(nativeNamedCaseId!==undefined&&options['--native-fixture']!==undefined)throw Error('Named case owns its immutable input fixture');
const nativeFixtureId=nativeNamedCaseId!==undefined?javascriptNamedCase(nativeNamedCaseId).input_fixture_id:options['--native-fixture']??'real',nativeFixture=javascriptNativeFixture(nativeFixtureId),nativeRoundtripProbe=javascriptNativeRoundtripProbe(nativeFixtureId,nativeNamedCaseId);
const namedTrial=nativeNamedCaseId!==undefined?createJavascriptNamedTrial(nativeNamedCaseId):null;
const coercionTrial=nativeRoundtrip&&nativeFixture.coercion?createJavascriptCoercionTrial(nativeFixtureId):null;
const discoveryProbe=options['--discovery-probe']?javascriptDiscoveryProbe(options['--discovery-probe']):null;
if(discoveryProbe&&(batch||options['--execution-case']))throw Error('Discovery requires one isolated probe, not a batch or execution case');
let executionCase=nativeRoundtrip?nativeRoundtripProbe.schema_mode+'-table-execute':discoveryProbe?'code-table-execute':batch?.[0]??options['--execution-case'];
if(executionCase){
  if(!/^(declared|code)-(sentinel-(next|done|preview|execute)|table-execute)$/.test(executionCase)&&executionCase!=='code-table-mismatch')throw Error('Unknown execution case');
  if(!nativeRoundtrip&&['--create-node','--palette-only','--palette-hit-test','--inspect-pages','--probe-source'].some(k=>options[k]))throw Error('Execution case is a separate mode');
  options['--create-node']=true;options['--inspect-pages']=true;
}
if (['--create-node','--palette-only','--palette-hit-test'].filter(k=>options[k]).length>1) throw Error('Choose one discovery mode');
if(options['--inspect-pages']&&!options['--create-node'])throw Error('--inspect-pages requires --create-node');
if(options['--probe-source']&&!options['--inspect-pages'])throw Error('--probe-source requires --inspect-pages');
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
if(batch||discoveryProbe||nativeInputOnly||nativeRoundtrip){const entries=await readdir(options['--profile']).catch(error=>{if(error.code==='ENOENT')return [];throw error;});if(entries.length)throw Error('Isolated discovery/batch requires an empty fresh assigned profile');}
const executionJournal=createExecutionJournal({directory,metadata:{sessionId:'javascript-g2',clientRevision:'operator-source',targetIdentity:{origin:address.origin,loginom_build:'7.4.2'}},knownSecrets:[config.password]});
const rootReport={version:1,scope:'G1 preparation',started_at:new Date().toISOString(),status:'RUNNING',stage:'login',
  node:process.versions.node,headless:false,server_os:{status:'not_observed'},storage:{status:'not_observed'},
  snapshots:[],effects:[],cleanup:{package_closed:false,logged_out:false,browser_closed:false},
  probes:javascriptEngineProbes.map(p=>({id:p.id,sha256:p.source_sha256,status:'not_run'}))};
let report=rootReport;
let session,page,owner,packageHandle,wizardBinding,wizardHandle,wizardRoot,openedWizard=false,closeDispatched=false,closeConfirmed=false,closeDeadline=0,wizardDeadline=0,createDeadline=0,wizardAddressEpoch=0;
let executionRuntime,executionInput,executionNode,executionPrepared,executionInputProof,executionDrop,paletteAdmission;
let browserLifecycle,inputBinding,previewCloseState={dispatched:false};
const columnState={pending:null};
let executionJournalLine=0;
let nativeClassifierBinding;
let readingExisting=false,initialOpening={};
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
  const saved=await executionJournal({...event,...(report.case_id?{case_id:report.case_id,execution_case:executionCase}:{})});
  if(nativeRoundtrip&&report.stage==='prepare-typed-input'&&saved.phase==='node_observation_completed'
    &&saved.outcome?.output?.prepared_node_context?.verified===true
    &&saved.outcome.output.prepared_node_context.surface==='graph') {
    const context=saved.outcome.output.prepared_node_context;
    nativeClassifierBinding={context:{verified:true,surface:'graph',node_id:context.node_id,tid:context.tid},
      prefix:saved.outcome.output.workflow_ref?.prefix};
  }
  (report.execution_records??=[]).push(compactJavascriptJournalRecord(saved,++executionJournalLine));
  await save();return saved;
};
const createRemaining=()=>{const remaining=createDeadline-Date.now();if(remaining<=0)throw Error('Original package preparation deadline expired');return remaining;};
const save=async()=>{
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
  if (owner&&(s.packages!==1||s.package_name!==owner.package_name||s.package_path||owner.prefix&&s.prefix!==owner.prefix)) throw Error('Owned draft changed');
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
  await page.waitForFunction(({prefix,account,packageName,owned})=>{
    const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm,m=f?.FMapTree;
    if(m?.FServerConnection?.UserName!==account||m.PackageNodes?.Count!==1||m.PackageNodes.Items(0)!==owned||m.PackageNodes.Items(0)?.PackageName!==packageName||m.PackageNodes.Items(0)?.PackageFileName)throw Error('Graph readiness package changed');
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
  },{prefix:owner.prefix,account:config.username,packageName:owner.package_name,owned:packageHandle},{timeout});
  await guard();
};
// Serialized by Playwright for both polling and diagnostics. Read only cached
// native identities: never dereference FModelNode/server proxy properties.
const wizardReadiness=withJavascriptWizardAddress(withJavascriptWizardMasks(function wizardReadiness({prefix,owned,account,id,binding,addressEpoch,expectedWizard,expectedRoot,inspect=false,inputOnly=true,initialPages=[],afterIndex=null,afterPageTid=null}) {
  const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm,m=f?.FMapTree;
  const tab=f?.Items?.Workspace?.getActiveTab?.(),native=tab?.Controller?.Node?.data?.node,model=tab?.Controller?.FController;
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')].filter(visible);
  const roots=exact(prefix+';WizrdMCF'),root=roots.length===1?roots[0]:null;
  const title=exact(prefix+';WizrdMCF;cardWizardPanel;p.h;p.t'),close=exact(prefix+';WizrdMCF;btnClose');
  const pageBase=prefix+';WizrdMCF;';
  const pages=root?[...root.querySelectorAll('[data-tid]')].filter(e=>{
    const tid=e.getAttribute('data-tid');
    return tid.startsWith(pageBase)&&/^[^;]*Wizard$/.test(tid.slice(pageBase.length))&&visible(e);
  }):[];
  const inputPage=pages.length===1&&pages[0].getAttribute('data-tid')===pageBase+'TuneDataSourceInputPortWizard';
  const activePage=pages.length===1&&globalThis.Ext?.getCmp?.(pages[0].id);
  const pageOwners=new Set();
  for(let c=activePage;c&&pageOwners.size<16&&!pageOwners.has(c);c=c.ownerCt)pageOwners.add(c);
  const indicatorRoots=exact(pageBase+'rgpBottom');
  const indicatorGroup=indicatorRoots.length===1&&globalThis.Ext?.getCmp?.(indicatorRoots[0].id);
  const indicatorItems=[],indicatorQueue=indicatorGroup?[indicatorGroup]:[],indicatorSeen=new Set();
  let indicatorOverflow=false;
  while(indicatorQueue.length&&indicatorSeen.size<32){
    const component=indicatorQueue.shift();
    if(!component||indicatorSeen.has(component))continue;
    indicatorSeen.add(component);
    const children=component.items?.items;
    if(Array.isArray(children)&&children.length<=32)indicatorQueue.push(...children);
    if(Array.isArray(children)&&children.length>32)indicatorOverflow=true;
    const dom=component.el?.dom,tid=dom?.getAttribute('data-tid');
    if(tid?.startsWith(pageBase+'rgpBottom;')&&/^radiofield(?:-\d+)?$/.test(tid.slice((pageBase+'rgpBottom;').length)))indicatorItems.push(component);
  }
  const indicators=indicatorItems.map(c=>{
    const dom=c.el.dom,tid=dom.getAttribute('data-tid');
    const inputs=[...document.querySelectorAll('[data-tid='+JSON.stringify(tid+';InputEl')+']')];
    const chain=new Set();for(let p=c;p&&chain.size<16&&!chain.has(p);p=p.ownerCt)chain.add(p);
    return {id:dom.id,tid,native_class:c.$className??null,checked:typeof c.checked==='boolean'?c.checked:null,
      dom_checked:dom.classList.contains('x-form-cb-checked'),input_tag:c.inputEl?.dom?.tagName??null,
      input_type:c.inputEl?.dom?.getAttribute('type')??null,
      visible:visible(dom),
      bound:indicatorRoots.length===1&&indicatorGroup?.el?.dom===indicatorRoots[0]&&indicatorRoots[0].contains(dom)
        &&chain.has(indicatorGroup)&&dom.isConnected&&inputs.length===1&&inputs[0]===c.inputEl?.dom&&dom.contains(inputs[0])
        &&typeof c.checked==='boolean'&&c.checked===dom.classList.contains('x-form-cb-checked')};
  });
  const indicatorDom=indicatorRoots.length===1?[...indicatorRoots[0].querySelectorAll('[data-tid]')].filter(e=>
    e.getAttribute('data-tid').startsWith(pageBase+'rgpBottom;')&&/^radiofield(?:-\d+)?$/.test(e.getAttribute('data-tid').slice((pageBase+'rgpBottom;').length))):[];
  const indicatorBinding=indicators.length>=2&&indicators.length<=12&&!indicatorQueue.length&&!indicatorOverflow&&indicators.every(e=>e.bound)
    &&indicatorDom.length===indicators.length&&indicatorDom.every((e,i)=>e.id===indicators[i].id);
  const checked=indicators.map((e,i)=>e.checked===true?i:-1).filter(i=>i>=0);
  const pageIndex=indicatorBinding&&checked.length===1&&indicators[checked[0]].visible?checked[0]:null;
  const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(prefix+';cnrNaviMode;b.s_')+']')].filter(visible);
  const overlays=[...document.querySelectorAll('.bg-mask-message,.x-mask-msg,.x-mask,[role="dialog"],.x-message-box')].filter(visible);
  // Ext masks a disabled delete-all column even when the wizard is ready.
  // Match only that observed control, never arbitrary .x-mask elements.
  const {maskObservations,deleteHeaders,header,column,columnOwners}=classifyJavascriptWizardMasks({prefix,root,model,binding,pages,overlays});
  const blockers=maskObservations.filter(m=>!m.disabled_delete_mask).map(m=>m.element);
  const lineage=[],seen=new Set();
  for(let n=native;n&&lineage.length<32&&!seen.has(n);n=n.ParentNode){seen.add(n);lineage.push(n);}
  const nodeTree=native?.ParentNode;
  const address=inspectJavascriptWizardAddress({prefix,id,binding,native,model,crumbs,epoch:addressEpoch});
  const checks={
    account:m?.FServerConnection?.UserName===account,
    package_count:m?.PackageNodes?.Count===1,
    package_identity:m?.PackageNodes?.Count===1&&m.PackageNodes.Items(0)===owned,
    root_unique:roots.length===1,
    native_wizard_class:native?.constructor?.name==='WizardTreeNode',
    controller_present:!!model,
    no_visible_blockers:blockers.length===0,
    title_unique:title.length===1,
    title_nonempty:title.length===1&&!!title[0].textContent.trim(),
    page_unique:pages.length===1,
    input_page_expected:!inputOnly||inputPage||pageIndex===0&&pages.length===1&&initialPages.includes(pages[0].getAttribute('data-tid')),
    native_page_identity:pages.length===1&&activePage?.el?.dom===pages[0],
    native_page_root_owner:!!root&&[...pageOwners].some(c=>c.el?.dom===root),
    expected_page_transition:afterIndex===null||Number.isInteger(pageIndex)&&pageIndex>afterIndex
      &&pages.length===1&&pages[0].getAttribute('data-tid')!==afterPageTid,
    close_unique:close.length===1,
    close_enabled:close.length===1&&!close[0].closest('.x-item-disabled,.x-btn-disabled'),
    node_breadcrumb:address.ready,
    wizard_breadcrumb:address.checks.wizard_binding&&address.checks.wizard_text,
    native_wizard_instance:!!app?.WizardTreeNode&&native instanceof app.WizardTreeNode,
    native_node_instance:!!app?.ModelNodeTreeNode&&nodeTree instanceof app.ModelNodeTreeNode,
    node_guid:nodeTree?.FGuid===id,
    model_class:model?.constructor?.name==='WizardModelComponentForm',
    model_node_identity:!!nodeTree?.FModelNode&&model?.FModelNode===nodeTree.FModelNode,
    original_node_identity:!!binding&&nodeTree?.FModelNode===binding.nodeData,
    original_workflow_identity:!!binding&&nodeTree?.ParentNode===binding.workflow,
    original_tab_identity:!!binding&&tab===binding.tab,
    package_ancestry:lineage.includes(owned),
    native_root_identity:!!root&&model?.FView?.el?.dom===root,
    page_within_root:!!root&&pages.length===1&&root.contains(pages[0]),
    title_within_root:!!root&&title.length===1&&root.contains(title[0]),
    close_within_root:!!root&&close.length===1&&root.contains(close[0]),
    close_aria_enabled:close.length===1&&close[0].getAttribute('aria-disabled')!=='true',
    retained_wizard_identity:!expectedWizard||native===expectedWizard,
    retained_root_identity:!expectedRoot||root===expectedRoot
  };
  const failed=Object.keys(checks).filter(k=>!checks[k]);
  const fatal=!checks.account||!checks.package_count||!checks.package_identity||roots.length>1
    ||!checks.original_tab_identity||!checks.retained_wizard_identity||!checks.retained_root_identity
    ||checks.native_node_instance&&(!checks.node_guid||!checks.original_node_identity||!checks.original_workflow_identity);
  if(!inspect&&!fatal&&failed.length)return false;
  const describe=e=>({tid:e.getAttribute('data-tid'),id:e.id,classes:String(e.className).slice(0,240),
    parent_tid:e.parentElement?.closest('[data-tid]')?.getAttribute('data-tid')??null,
    display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity,
    within_root:!!root&&root.contains(e),contains_root:!!root&&e.contains(root),
    rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}});
  return {ready:failed.length===0,fatal,checks,failed,address,
    transition:afterIndex===null?null:{from_index:afterIndex,to_index:pageIndex,from_tid:afterPageTid,
      skipped_indices:Number.isInteger(pageIndex)&&pageIndex>afterIndex?Array.from({length:pageIndex-afterIndex-1},(_,i)=>afterIndex+i+1):[]},
    native_class:native?.constructor?.name??null,model_class:model?.constructor?.name??null,
    node_guid:typeof nodeTree?.FGuid==='string'?nodeTree.FGuid:null,
    page:pages.length===1?{tid:pages[0].getAttribute('data-tid'),title:title.length===1?title[0].textContent.trim().slice(0,200):null,
      index:pageIndex,indicator_count:indicators.length,indicators:indicators.slice(0,12),visible_editors:[...pages[0].querySelectorAll('.CodeMirror')].filter(visible).length}:null,
    page_ownership:{native_class:activePage?.$className??null,
      owners:[...pageOwners].map(c=>({class:c.$className??null,id:c.el?.dom?.id??null})),
      checked_indicators:checked.slice(0,12),indicator_binding:indicatorBinding,indicator_bound_exceeded:indicatorOverflow||indicators.length>12||indicatorQueue.length>0,
      indicator_group_class:indicatorGroup?.$className??null,indicator_native_items:indicatorSeen.size,
      indicator_dom:indicatorDom.slice(0,12).map(e=>({id:e.id,tid:e.getAttribute('data-tid'),checked_class:e.classList.contains('x-form-cb-checked')}))},
    lineage_classes:lineage.map(n=>n.constructor?.name??null),lineage_bound_reached:lineage.length===32,
    counts:{roots:roots.length,titles:title.length,pages:pages.length,close:close.length,crumbs:crumbs.length,overlays:overlays.length,blockers:blockers.length},
    roots:roots.slice(0,2).map(describe),close:close.slice(0,2).map(describe),
    titles:title.slice(0,2).map(e=>(e.textContent??'').slice(0,200)),
    crumbs:crumbs.slice(-12).map(e=>({tid:e.getAttribute('data-tid'),raw:(e.textContent??'').slice(0,200),trimmed:(e.textContent??'').trim().slice(0,200)})),
    blockers:blockers.slice(0,16).map(describe),blockers_truncated:blockers.length>16,
    mask_classification:maskObservations.slice(0,16).map(m=>({element:describe(m.element),
      disabled_delete_mask:m.disabled_delete_mask,checks:m.checks,
      markup:{role:m.element.getAttribute('role'),text_length:(m.element.textContent??'').length,
        direct_children:m.element.children.length,
        descendants:[...m.element.querySelectorAll('*')].slice(0,8).map(e=>({tag:e.tagName,classes:String(e.className).slice(0,160),
          role:e.getAttribute('role'),visible:visible(e),text_length:(e.textContent??'').length})),
        descendants_truncated:m.element.querySelectorAll('*').length>8}})),
    delete_header:{matches:deleteHeaders.length,element:header?describe(header):null,
      native_class:column?.$className??null,disabled:column?.disabled??null,
      cached_mask_id:header?._extData?.maskEl?.dom?.id??null,
      native_owners:columnOwners.map(c=>({class:c.$className??null,id:c.el?.dom?.id??null})),
      owner_bound_reached:columnOwners.length===16}};
}));
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
    if(executionCase&&!remainingPages&&current.tid.endsWith(';JavaScriptColumnsWizard')){
      if(readingExisting){
        const schema=await page.evaluate(readJavascriptSchema,schemaContext());
        await executionRecord({phase:'existing_schema_read',schema});
        if(!schema.verified||schema.generation?.checked!==report.execution_schema.generation.checked)throw Error('Existing JavaScript schema mode changed');
        report.execution_existing_schema=schema;
      }else report.execution_schema=await configureJavascriptSchema({page,context:schemaContext(),mode:executionCase.split('-')[0],fixedCase:nativeRoundtrip&&nativeFixtureId==='cardinality-empty'?'cardinality-empty':undefined,
        once:(id,identity,perform)=>executionRuntime.once(caseEffect(report.case_id,id),identity,perform),record:executionRecord,deadline,columnState});
      if(nativeRoundtrip){
        if(nativeFixtureId==='cardinality-empty')verifyJavascriptDeclaredEmpty(report.execution_schema.declaration,report.execution_schema.declaration_sha256);
        const event={phase:'native_roundtrip_schema_bound',...await page.evaluate(bindJavascriptNativeRoundtripSchema,{...schemaContext(),schema:report.execution_schema})};
        const saved=await executionRecord(event);
        if((nativeFixtureId==='cardinality-empty'||nativeFixture.coercion||namedTrial)&&JSON.stringify(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])))!==JSON.stringify(event))throw Error('Declared schema binding journal ACK differs');
      }
    }
    if(current.visible_editors===1&&!remainingPages)return current;
    if(remainingPages&&Number.isInteger(current.index)&&current.index===current.indicator_count-1)return current;
    if(current.visible_editors>1)throw Error('Multiple visible editors on owned page');
    if(step===8||!Number.isInteger(current.index)||current.indicator_count<2||current.indicator_count>12
      ||current.index>=current.indicator_count-1)throw Error('Editor not reached within observed page bounds');
    await guard();
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
const runExecutionTrial=async probe=>{
  const deadline=phaseDeadline(600000),trigger=executionCase.split('-').at(-1),sentinel=executionCase.includes('-sentinel-');
  let trialPhase='initial',sourceSha=probe.source_sha256,roundtripDone;
  const read=async()=>{
    const snapshot=await page.evaluate(readJavascriptStage,schemaContext());
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
      }
      await page.mouse.click(point.x,point.y);
    });
    // Wait only on the result of the original dispatch. Neither a timeout nor
    // lack of a sentinel authorizes another click.
    const after=await waitJavascriptStageObservation({read,wait:ms=>page.waitForTimeout(ms),deadline,stage,before,identity,record:executionRecord});
    const terminal=javascriptStageTerminal({stage,before,after});
    const outcome=javascriptSentinelOutcome({stage,identity,baselineIds:before.messages.map(message=>message.id),
      messages:(after?.messages??[]).map(message=>({...message,...identity})),ownerVerified:after?.owner_verified===true,terminal});
    await executionRecord({phase:'execution_stage_observed',identity,before,after,outcome});
    if(after?.boundary_refusal)throw Error('Execution stage boundary refused: '+after.boundary_refusal);
    if(nativeRoundtrip&&after?.messages?.some(m=>!before.messages.some(old=>old.id===m.id)))throw Error('Native roundtrip wizard diagnostic; no replay');
    if(!terminal)throw Error('Execution stage result remains unconfirmed: '+stage);
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
    if(outcome.sentinel_observed||outcome.discovery_diagnostic||trigger==='next'){
      report.execution_probe.outcome=outcome;return;
    }
    if(step===7)throw Error('Done page not reached within bounded transitions');
  }
  const done=await waitWizardReady({deadline,inputOnly:false});
  if(!done.page.tid.endsWith(';DoneWizard'))throw Error('Exact Done page required');
  const outcome=await dispatch('done',owner.prefix+';WizrdMCF;btnDone',0);
  report.execution_probe.done_outcome=outcome;
  if(outcome.sentinel_observed||outcome.discovery_diagnostic){report.execution_probe.outcome=outcome;return;}
  await exact(owner.prefix+';WizrdMCF').waitFor({state:'hidden',timeout:Math.max(1,deadline-Date.now())});
  openedWizard=false;await waitGraphReady(Math.max(1,deadline-Date.now()));
  if(trigger==='done'){report.execution_probe.outcome=outcome;return;}
  if(nativeRoundtrip){
    const attestation=await page.evaluate(sealJavascriptNativeRoundtripDone,roundtripDone);
    const saved=await executionRecord({phase:'native_roundtrip_done_sealed',attestation});
    if(JSON.stringify(saved.attestation)!==JSON.stringify(attestation))throw Error('Done seal journal ACK differs');
    if(coercionTrial){
      report.native_roundtrip=await coercionTrial.run({runtime:executionRuntime,input:executionInput,node:executionNode,sourceProbe:probe,deadline,
        record:executionRecord,onExecution:async execution=>{report.execution_probe.execution=execution;await save();}});
      report.stage='native-coercion-awaiting-finalization';report.gates_closed=[];await save();return;
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
      const execution=await executionRuntime.executeNode(executionNode,deadline,{phase:'initial',source_sha256:probe.source_sha256});
      report.execution_probe.execution=execution;await save();
      await executionRuntime.verifyExecutionBoundary(boundary);await verifyBatchInputIdentity();
      const result=await observeJavascriptDiscovery({probe,node:executionNode,execution,deadline,
        readOutput:()=>executionRuntime.readPassive(executionNode,'discovery',deadline),record:executionRecord,
        onProgress:async progress=>{report.discovery_result={...progress,oracle_passed:progress.gate_passed,gate_passed:false,boundary_verified:false};await save();}});
      await executionRuntime.verifyExecutionBoundary(boundary);await verifyBatchInputIdentity();
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
    report.stage='existing-mapping-baseline';
    const before={input:await executionRuntime.readPortMapping(executionNode,'input'),output:await executionRuntime.readPortMapping(executionNode,'output')};
    report.stage='existing-source-readback';
    const reopened=await executionRuntime.reopen(executionNode);wizardAddressEpoch++;
    wizardHandle=null;wizardRoot=null;openedWizard=true;closeDispatched=false;closeConfirmed=false;closeDeadline=0;wizardDeadline=phaseDeadline(90000);
    await executionRuntime.handoffReopenedWizard();
    await executionRecord({phase:'existing_wizard_opened',reopened});
    await waitWizardReady();readingExisting=true;
    await inspectWizardPages();
    const source=await readOwnedExecutionSource();
    if(source!==probe.source)throw Error('Existing JavaScript source differs from applied trial');
    await executionRecord({phase:'existing_source_verified',source_sha256:digest(source)});
    await closeWizardOnce();
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
    wizardBinding=await page.evaluateHandle(({id,tid,icon,owned})=>{
      const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm;
      const tab=f?.Items?.Workspace?.getActiveTab?.(),workflow=tab?.Controller?.Node?.data?.node;
      const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
      const matches=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===id):[];
      const ancestors=new Set();
      for(let n=workflow;n&&ancestors.size<32&&!ancestors.has(n);n=n.ParentNode)ancestors.add(n);
      if(!app?.WorkFlowTreeNode||!(workflow instanceof app.WorkFlowTreeNode)||!ancestors.has(owned)
        ||matches.length!==1||!matches[0].data||matches[0].FIconCls!==icon
        ||diagram.FmxGraph.view.getState(matches[0].FCell)?.shape?.node?.getAttribute('data-tid')!==tid)throw Error('Wizard source binding unavailable');
      return {document,tab,workflow,nodeData:matches[0].data,native:matches[0],cell:matches[0].FCell};
    },{id:node.id,tid:node.tid,icon:expectedIcon,owned:packageHandle});
    wizardDeadline=phaseDeadline(90000);report.wizard_open_deadline=new Date(wizardDeadline).toISOString();await save();
    if(executionCase){
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
    if(typeof editor.source_text==='string'){
      editor.source_sha256=digest(Buffer.from(editor.source_text,'utf8'));
      editor.source_redaction_changed=redactor.text(editor.source_text)!==editor.source_text;
      delete editor.source_text;
    }
    const afterRead=await waitWizardReady({deadline:options['--inspect-pages']?Date.parse(report.page_inspection_deadline):wizardDeadline,inputOnly:!options['--inspect-pages']});
    if(JSON.stringify(afterRead.page)!==JSON.stringify(editorPage))throw Error('Editor page changed during read');
    report.snapshots.push({at:new Date().toISOString(),label:options['--inspect-pages']?'wizard-editor-read':'wizard-editor-first-page',page:editorPage,...editor});await save();
    if(options['--inspect-pages']&&editor.status!=='observed')throw Error('Full bounded editor read unavailable');
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
      await probeOwnedSource(baselineSource,probe.source);
      report.execution_probe.status='source_verified';await save();
      if(nativeRoundtrip){
        const event={phase:'native_roundtrip_source_bound',...await page.evaluate(bindJavascriptNativeRoundtripSource,{...schemaContext(),schema:report.execution_schema})};
        const saved=await executionRecord(event);
        if((nativeFixtureId==='cardinality-empty'||nativeFixture.coercion||namedTrial)&&JSON.stringify(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])))!==JSON.stringify(event))throw Error('Declared source binding journal ACK differs');
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
    if(nativeRoundtrip&&report.native_roundtrip&&!coercionTrial&&!namedTrial)report.stage=report.native_roundtrip.outcome?.characterization_only?'native-roundtrip-characterized':'native-roundtrip-observed';
    }
    }
};

try {
  await save();
  session=await loginBrowser({browserPath:options['--browser'],profile:options['--profile'],candidate:config,headless:false,keepOpen:true});
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
  report.storage={status:'not_established',candidates:home.fields.filter(f=>/Storage|Directory/i.test(f.path)),expected_account_folder:'/jsteach',permissions:'not_checked'};
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
      report.scope=namedTrial?'private stage A named access: '+nativeNamedCaseId:coercionTrial?'private Integer coercion characterization: '+nativeFixtureId:nativeRoundtrip?'private native '+nativeFixtureId+'/NULL identity roundtrip':nativeInputOnly?'private native '+nativeFixtureId+' input-only admission':discoveryProbe?'isolated engine/G5 UI/diagnostic discovery':'G2/G3 operator trial';report.execution_case=executionCase;
      if(discoveryProbe){report.discovery_probe=discoveryProbe;report.explicit_execution_limit=1;report.gates_closed=[];}
      if(nativeRoundtrip){report.explicit_execution_limit=1;report.gates_closed=[];}
      executionRuntime=await createJavascriptExecutionRuntime({page,prepared:executionPrepared,directory,account:config.username,
        record:executionRecord,effectScope:()=>report.case_id,deadline:batch||nativeRoundtrip?batchDeadline:Date.now()+1200000,nativeInputOnly:nativeInputOnly||nativeRoundtrip,nativeFixtureId,nativeNamedCaseId});
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
  report.status=coercionTrial||namedTrial?'PENDING_EVIDENCE':'OBSERVED';
} catch(error) {
  report.status='FAILED';report.failure={stage:report.stage,...redactor.redact(javascriptProbeFailure(error))};
  const diagnostic=await captureJavascriptNativeClassifierDiagnostic({nativeRoundtrip,stage:report.stage,page,binding:nativeClassifierBinding});
  if(diagnostic)report.native_classifier_diagnostic=diagnostic;
  if(discoveryProbe)report.discovery_failure_context={source_sha256:discoveryProbe.source_sha256,
    terminal_receipt_observed:!!report.execution_probe?.execution,syntax_support:'not_determined'};
  if (page) await snapshot('failure').catch(()=>{report.failure.snapshot='unavailable';});
  if (page&&owner) await paletteSnapshot('failure-palette').catch(()=>{report.failure.palette_snapshot='unavailable';});
  if (page) await refusalEvidence('work-refusal').catch(()=>{report.failure.refusal_evidence='unavailable';});
} finally {
  cleaning=true;report.work_stage=report.stage;report.stage='cleanup';
  try {
    if (page) {
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
          await executionRuntime.restoreWorkflowForCleanup();
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
        if (heading.trim()!==owner.package_name) throw Error('Close menu owner mismatch');
        const packageCloseDeadline=Date.now()+25000;
        const packageCloseRemaining=()=>{const ms=packageCloseDeadline-Date.now();if(ms<=0)throw Error('Original package close deadline expired; no replay');return ms;};
        report.effects.push({at:new Date().toISOString(),action:'package-close',state:'dispatching',deadline:new Date(packageCloseDeadline).toISOString()});await save();
        await (await visibleOne(exact('MF;MainMenuForm;btnClosePackage'))).click({timeout:packageCloseRemaining()});
        report.cleanup.stage='close-confirmation';
        const proof=await page.waitForFunction(({owned,account,name})=>{
          const map=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
          if(map?.FServerConnection?.UserName!==account)throw Error('Package close account changed');
          if(map.PackageNodes?.Count===0)return {state:'closed'};
          if(map.PackageNodes?.Count!==1||map.PackageNodes.Items(0)!==owned||owned.PackageName!==name||owned.PackageFileName)throw Error('Package close owner changed');
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
        },{owned:packageHandle,account:config.username,name:owner.package_name},{timeout:packageCloseRemaining(),polling:100});
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
    if(page) {await snapshot('cleanup-failure').catch(()=>{});await refusalEvidence('cleanup-refusal').catch(()=>{report.cleanup.refusal_evidence='unavailable';});}}
  if (session) {
    if(browserLifecycle)await browserLifecycle.beforeClose();
    await session.context.close().then(()=>{report.cleanup.browser_closed=true;},()=>{report.cleanup.browser_closed=false;});
  }
  if(browserLifecycle)Object.assign(report.browser_lifecycle,await browserLifecycle.finish());
  if (!report.cleanup.package_closed||!report.cleanup.logged_out||!report.cleanup.browser_closed) report.status='CLEANUP_UNCONFIRMED';
  report.finished_at=new Date().toISOString();
  if(coercionTrial){
    try{await coercionTrial.finish({cleanup:report.cleanup,failure:report.failure,record:executionRecord,persist:async status=>{report.status=status;await save();}});}
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
