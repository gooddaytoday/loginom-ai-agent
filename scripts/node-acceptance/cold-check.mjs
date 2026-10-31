import {excelColdExpected,verifyExcelColdSettings} from './exports-excel-cold.mjs'
import {execFileSync} from 'node:child_process'
import {parseExpectedOutputs,matchExpectedOutputs,resolveExportInput,parseExportCsvHeader,selectColdOutputReads} from "./expected-outputs.mjs"
import { parseArgs } from "node:util"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import {observeStaticSources,verifyStaticSourceBytes,bindColdExecutions,observeExportDestinations} from './static-source-proof.mjs'
import {makeColdSourceRevealCode} from './cold-source-viewport.mjs'
import {coldNativeEligible,performColdNodeAction,runColdExecution,openColdOutputViews,openColdTableFilter,coldProcessObservation,readColdPortWindows} from './cold-reader-policy.mjs'

// Независимый oracle приёмки узла. Ожидания берутся из --expected, а не из
// захардкоженных Alpha/Beta. Существующий cold-readback.mjs не меняется.
process.umask(0o077)
const args = parseArgs({
  options: {
    config: { type: "string" },
    resources: { type: "string" },
    saved: { type: "string" },
    expected: { type: "string" },
    output: { type: "string" },
    csv: { type: "string" },
    xlsx: { type: "string" },
    "xlsx-expected": { type: "string" },
    'csv-delimiter': { type: "string", default: ',' },
    'csv-header': { type: "string", default: 'names' },
    'exact-port-windows': { type: 'boolean', default: false },
  },
  strict: true,
}).values
if (!args.config || !args.resources || !args.saved || !args.expected || !args.output)
  throw Error("Required: --config --resources --saved --expected --output")

const root = resolve(args.resources)
const load = (name) => import(pathToFileURL(join(root, "runtime", name)).href)
const { verifyResources } = await load("src/resources.mjs")
const resources = await verifyResources(root)
const compatibilityPlatform = resources.manifest.target?.startsWith("win32-")
  ? "windows"
  : resources.manifest.target?.startsWith("darwin-")
    ? "macos"
    : "linux"
const { loginBrowser } = await load("src/connection-check.mjs")
const { makeWorkspacePrepareCode } = await load("client/lib/workspace.mjs")
const { createNodeTargetBrowserAdapter } = await load("client/lib/node-target-browser.mjs")
const { createNodeProcedure } = await load("client/lib/node-procedure.mjs")
const { createNodeExecutionProcedure } = await load("client/lib/node-execution-procedure.mjs")
const { createExecutionJournal } = await load("client/lib/execution-journal.mjs")
const { withBrowserReceipt } = await load("client/lib/executor.mjs")
const { makePackageCleanupCode,makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode } = await load("client/lib/package-cleanup.mjs")
const { openNewOutputTable, configureTablePrecision, prepareTableRead, returnFromOutputTable } =
  await load("client/lib/node-output-procedure.mjs")
const { readTableOutputPages } = await load("client/lib/table-output-pages.mjs")
const { decodeTableOutput } = await load("client/lib/table-output-values.mjs")

const config = JSON.parse(await readFile(args.config, "utf8"))
const loginPassword = config.workflow_profile?.password ?? ""
if (config.workflow_profile?.passwordless_login === true && loginPassword !== "") throw Error("TEST_PASSWORD_UNAVAILABLE")
if (config.workflow_profile?.passwordless_login !== true && loginPassword === "") throw Error("TEST_PASSWORD_UNAVAILABLE")
const rawExpected = JSON.parse(await readFile(args.expected, "utf8"))
const excelExpected=excelColdExpected(rawExpected)
if(excelExpected){
 if(!args.xlsx||!args["xlsx-expected"])throw Error("COLD_XLSX_REQUIRED")
 execFileSync("python3",["-B",new URL("../../docs/node-development/nodes/exports-excel/acceptance/oracle.py",import.meta.url).pathname,"--xlsx",resolve(args.xlsx),"--expected",resolve(args["xlsx-expected"])],{stdio:"pipe"})
}
const expected = excelExpected??rawExpected
const {multiple,outputs:expectedOutputs}=parseExpectedOutputs(expected)
if(!['names','labels'].includes(args['csv-header']))throw Error('COLD_EXPORT_CSV_HEADER_MODE_INVALID')
// --csv is the actual runtime-downloaded export, already checked in full by
// the scenario's file oracle. It supplies order only, never cold cell values.
const exportCsv=args.csv?{columns:parseExportCsvHeader(await readFile(resolve(args.csv),'utf8'),args['csv-delimiter']),
 header:args['csv-header'],delimiter:args['csv-delimiter']}:undefined

const saved = await loadSaved(args.saved)
if (saved.path !== expected.package_path) throw Error("PACKAGE_PATH_MISMATCH")

await mkdir(args.output, { recursive: true, mode: 0o700 })
const session = randomUUID()
const metadata = {
  sessionId: session,
  clientRevision: resources.manifestHash,
  actionManifestDigest: resources.manifest.actionManifestSha256,
}
const record = createExecutionJournal({
  directory: args.output,
  metadata,
  knownSecrets: [config.api_key, loginPassword].filter(Boolean),
})
const state = { prepared: undefined, closed: false, cleanupAttempted: false }
let context, page
const rawExecute = (code) => new Function("page", `return (${code})(page)`)(page)
const execute = (code) => {
  if (state.cancelled) throw Error("COLD_CANCELLED")
  return rawExecute(code)
}
const cancel = (signal) => {
  if (state.cancelled) return
  state.cancelled = signal
  state.failure = "COLD_CANCELLED"
  process.exitCode = signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129
  // Do not close Chromium while the admitted gesture/read is settling. The
  // normal finally owns native cleanup; this bounds an unresponsive transport.
  state.cancelTimer = setTimeout(async () => {
    state.cleanupExpired = true
    const failure = {status:"FAIL", phase:"independent_cold_reopen_readback", path:saved.path,
      error:"COLD_CANCELLED", settingsReapplied:false, cancellation:{signal,
        cleanup_budget_exhausted:true, lock_may_remain:state.cleanup?.package_closed!==true},
      cleanup:{package_closed:state.cleanup?.package_closed===true,logged_out:state.cleanup?.logged_out===true}}
    const forced = setTimeout(() => process.exit(1), 5000)
    try { await writeFile(join(args.output,"result.json"),JSON.stringify(failure,null,2)+"\n") }
    finally { await context?.close().catch(()=>undefined); clearTimeout(forced); process.exit(1) }
  }, 30000)
}
const signals = ["SIGINT","SIGTERM","SIGHUP"]
const handlers = signals.map(signal => () => cancel(signal))
signals.forEach((signal,i) => process.on(signal,handlers[i]))
try {
const authenticated = await loginBrowser({
  browserPath: resources.browserPath,
  profile: join(args.output, "browser"),
  candidate: { url: config.loginom_url, username: config.workflow_profile.loginom_user, password: loginPassword },
  headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
  keepOpen: true,
  onContextCreated: created => { context = created },
})
context = authenticated.context
page = context.pages()[0]
  state.openAttempted=true
  state.openDeadline=Date.now()+120000
  let prepared = await execute(
    makeWorkspacePrepareCode({
      loginomUrl: page.url(),
      compatibility: { loginom_build: "7.4.2", platform: compatibilityPlatform, browser: "chromium" },
      sessionId: session,
      operationId: "cold-open",
      intent: "open_package",
      packagePath: saved.path,
    }),
  )
  state.prepared = prepared
  await record({phase:"cold_package_opened",prepared,settings_applied:false})
  if (state.cancelled) throw Error("COLD_CANCELLED")
  if (
    prepared.status !== "READY"
  ) {
    state.openFailure={status:prepared.status,reason:prepared.reason??'OPEN_NOT_READY'}
    throw Error("COLD_PACKAGE_OPEN_NOT_READY")
  }
  if(prepared.package_ref?.path!==saved.path) {
    state.openFailure={status:prepared.status,reason:'PACKAGE_PATH_MISMATCH'}
    throw Error("COLD_PACKAGE_PATH_MISMATCH")
  }
  if(prepared.workflow_ref.navigation_path.some(item=>item.label.endsWith("(только чтение)"))) {
    state.openFailure={status:prepared.status,reason:'PACKAGE_READ_ONLY'}
    throw Error("COLD_PACKAGE_NOT_WRITABLE")
  }

  const origin = new URL(config.loginom_url).origin
  const adapter = createNodeTargetBrowserAdapter({ execute, origin, build: "7.4.2" })
  let graph = await adapter.observe(
    { document_id: prepared.document_id, workflow_ref: prepared.workflow_ref },
    Date.now() + 30_000,
  )

  let coldChannelSequence=0;
  const channelFor=(node,id)=>createNodeProcedure({operation:{id:id+'-'+(++coldChannelSequence),action:{action_key:'acceptance.cold_read',revision:'1'},deadline:Date.now()+540000},execute,record,targetOrigin:origin,targetBuild:'7.4.2',maxSteps:4096,
   preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},wrapMutation:(code,receipt)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:session,receipt_id:receipt.id,receipt_signature:receipt.signature,operation_id:receipt.id})});
  let staticSources;
  if(expected.static_sources){
   const {readGraph}=await load('client/lib/node-target-browser.mjs');
   const viewportHelpers=await load('client/lib/node-placement.mjs');
   const {NODE_TYPES}=await load('client/lib/node-contracts.mjs');
   const revealSource=async target=>{
    const id='cold-source-reveal-'+target.ref.node_id+'-'+(++coldChannelSequence);
    const code=makeColdSourceRevealCode({node:target.ref,type:target.type,
     request:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},types:NODE_TYPES,
     origin,build:'7.4.2',deadline:Date.now()+30000},{readGraph,...viewportHelpers});
    const result=await execute(withBrowserReceipt(`(${code})(page)`,{
     receipt_namespace:session,receipt_id:id,receipt_signature:id,operation_id:id}));
    await record({phase:'cold_source_viewport',node:target.ref,receipt_id:id,result});
    if(result.status!=='SUCCEEDED'||result.verified!==true||result.graph_unchanged!==true||result.fully_visible!==true||result.settings_applied!==false)
     throw Error('COLD_SOURCE_REVEAL_UNCONFIRMED');
   };
   const {createActionRuntime}=await load('client/lib/executor.mjs');
   const catalog=JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'),'utf8'));
   const selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'),'utf8'));
   const runtime=createActionRuntime({pinned:{actions:new Map(catalog.actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,targetOrigin:origin,targetBuild:'7.4.2',allowCandidate:true});
   const account=config.workflow_profile.loginom_user;
   const before=await observeStaticSources({load,graph:{...graph,nodes:graph.nodes.filter(n=>n.type==='imports.text')},channelFor,account,revealSource});
   const verified=await verifyStaticSourceBytes({load,runtime,execute,sources:before,allowed:expected.static_sources,account,origin,output:args.output});
   const returned=await adapter.activateWorkflow({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},{deadline:Date.now()+30000,receipt_id:'cold-return-from-files'});
   if(returned.status!=='SUCCEEDED'||!returned.verified||!returned.cleanup_complete)throw Error('COLD_SOURCE_RETURN_UNCONFIRMED');
   graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
   staticSources=await observeStaticSources({load,graph,channelFor,account,revealSource});
   for(const source of staticSources.imports){
    const old=before.imports.find(s=>s.node_id===source.node_id);
    if(!old||JSON.stringify(old.configuration.source)!==JSON.stringify(source.configuration.source)||JSON.stringify(old.configuration.format)!==JSON.stringify(source.configuration.format)||JSON.stringify(old.configuration.output_mapping)!==JSON.stringify(source.configuration.output_mapping))throw Error('COLD_SOURCE_SETTINGS_CHANGED');
    source.source=verified.get(source.configuration.source.source_path);
    if(!source.source)throw Error('COLD_SOURCE_PROVENANCE_MISSING');
   }
  }
  const types=new Set(expectedOutputs.map(o=>o.output_node_type));
  const destination=expectedOutputs.find(o=>o.output_node_type==='export_input')?.export_destination;
  const destinations=destination===undefined?undefined:await observeExportDestinations({load,graph,channelFor,execute});
  if(expected.xlsx_sink)verifyExcelColdSettings(destinations,expected.xlsx_sink);
  if(destinations)await record({phase:'cold_export_destinations',destinations,settings_applied:false});
  const exportInput=types.has('export_input')?resolveExportInput(graph,{destination,destinations,...(expected.xlsx_sink?{type:'exports.excel'}:{})}):null;
  for (const want of expected.nodes) {
    if (!graph.nodes.some((node) => node.type === want.type)) throw Error(`COLD_NODE_TYPE_MISSING:${want.type}`)
  }

  const reads=selectColdOutputReads(graph,expectedOutputs,{exportInput,savedNode:multiple?undefined:saved.node});
  const actual=[],ownedExecutions=[];
  for(const [outputIndex,{node:target,ports}] of reads.entries()){
  const node=target.ref;

  const operation = {
    id: "cold-read-expected-"+outputIndex,
    action: { action_key: "acceptance.cold_read", revision: "1" },
    deadline: Date.now() + 540_000,
  }
  const coldReadCeiling={operation_id:operation.id,node:structuredClone(node),deadline_at:operation.deadline,total_ms:540_000};
  const processObservation=coldProcessObservation(execute,{node,operation,record});
  const procedure = createNodeProcedure({
    operation,
    execute:processObservation.execute,
    record,
    targetOrigin: origin,
    targetBuild: "7.4.2",
    maxSteps: 4096,
    preparedNodeContext: { document_id: prepared.document_id, workflow_ref: prepared.workflow_ref, node },
    wrapMutation: (code, receipt) =>
      withBrowserReceipt(`(${code})(page)`, {
        receipt_namespace: session,
        receipt_id: receipt.id,
        receipt_signature: receipt.signature,
        operation_id: receipt.id,
      }),
  })
  const channel={...procedure,observe:options=>processObservation.observe(procedure,options),get lastPreparedStep(){return procedure.lastPreparedStep;},
    get steps(){return procedure.steps;},perform:options=>performColdNodeAction(procedure,options,{node,operation,record,readReceipt})};
  const nativeSource=staticSources?.crossTables.find(c=>c.node_id===node.node_id);
  const nativeConfiguration=nativeSource?.configuration;
  if(nativeConfiguration){
   const {prepareCrossTableAncestorExecution}=await load('client/lib/crosstable-ancestor-execution.mjs');
   await prepareCrossTableAncestorExecution({graph,node,sources:staticSources,operation,execute,record,targetOrigin:origin,targetBuild:'7.4.2',
    wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
  }
  const driver = createNodeExecutionProcedure(channel, node, { allowDeactivate: true })
  const readReceipt=async reference=>{
    const observed=await execute(withBrowserReceipt('null',{
      receipt_namespace:session,receipt_id:reference.id,receipt_signature:reference.signature,
      operation_id:reference.operation_id,receipt_read:true,
    }));
    if(observed.status!=='SUCCEEDED'||observed.action_key!=='operation.inspect'
      ||observed.operation_id!==reference.operation_id)throw Error('COLD_RECEIPT_IDENTITY_CHANGED');
    const result=observed.output;
    if(result?.state==='completed'&&(result.receipt?.operation_id!==reference.operation_id
      ||result.receipt?.action_key!==reference.action_key))throw Error('COLD_RECEIPT_IDENTITY_CHANGED');
    return result;
  };
  let javascriptAdmission;
  if(target.type==='programming.javascript'){
   const {createJavascriptSourceAdmission}=await load('client/lib/javascript-source-admission.mjs');
   const {createJavascriptManagedSourceAdapter}=await load('client/lib/javascript-managed-source-adapter.mjs');
   const {createRedactor}=await load('client/lib/redact.mjs');
   const redactor=createRedactor([config.api_key,loginPassword]);
   const owner={...node,operation_id:operation.id,ui_epoch:Date.now()};
   const receiptOptions=(id,action_key,signature)=>({receipt_namespace:session,receipt_id:id,
    receipt_signature:signature,operation_id:id});
   const admission=retained=>createJavascriptSourceAdmission({kind:'existing',owner,deadline:operation.deadline,redactor,record,
    ...(retained?{expectedSource:Object.fromEntries(['source_sha256','source_utf8_bytes','source_lf_lines'].map(k=>[k,retained.effective_source[k]])),expectedSettings:retained.settings_sha256}:{}),
    sourceAdapter:()=>createJavascriptManagedSourceAdapter({page:{},prepared:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},
     node,uiEpoch:owner.ui_epoch,deadline:operation.deadline,targetOrigin:origin,execute,record,receiptOptions,redactor,
     channel:()=>procedure,openingBudgetMs:180000})});
   const retained=await admission().admit({});
   javascriptAdmission=admission(retained);
   const receipt=await javascriptAdmission.admit({});
   javascriptAdmission={admission:javascriptAdmission,receipt,owner};
  }
  const run=()=>runColdExecution({driver,channel,node,operation,readReceipt,record});
  const execution = javascriptAdmission
   ?await javascriptAdmission.admission.withEffect({receipt:javascriptAdmission.receipt,owner:javascriptAdmission.owner},run)
   :await run();
  if (execution.status !== "completed" || !execution.verified || !execution.owner_verified)
    throw Error("COLD_EXECUTION_NOT_VERIFIED")
  ownedExecutions.push(execution);

  for(const {port:outputPort,content_candidate} of ports){
  let useNative=false,ownedPreview;
  const ctx={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node,execution,deadline:operation.deadline,receipt_id:operation.id};
  if(!args['exact-port-windows']&&nativeConfiguration&&outputPort===0){
   const {openOwnedNativePreview,closeOwnedNativePreview}=await load('client/lib/collapse-native-output.mjs');
   ownedPreview=await openOwnedNativePreview(channel,ctx);
   useNative=coldNativeEligible(nativeConfiguration,ownedPreview.preview);
   if(!useNative)await closeOwnedNativePreview(channel,ctx,ownedPreview.port,ownedPreview.preview.root_tid);
  }

  let data;
  if(args['exact-port-windows']){
   data=await readColdPortWindows(channel,{node,execution,port:outputPort,rowCount:Math.max(...expectedOutputs.map(o=>o.rows.length))});
  }else if(useNative){
   // Preview enforces the actual 50x8 bound; wide baseline reports retain their
   // existing formatted scalar reader. No native fallback after a failed read.
    const {readCollapseNativeOutput}=await load('client/lib/collapse-native-output.mjs');
    const ancestors=new Set();let upstream=node.node_id;
    for(let depth=0;depth<3;depth++){
     const incoming=graph.links.filter(l=>l.target===upstream);
     if(incoming.length!==1||incoming[0].input!==0||incoming[0].output!==0)throw Error('COLD_STATIC_TOPOLOGY_INVALID');
     upstream=incoming[0].source;if(ancestors.has(upstream))throw Error('COLD_STATIC_CYCLE');ancestors.add(upstream);
     if(staticSources.imports.some(s=>s.node_id===upstream))break;
     if(depth!==0||!staticSources.collapses.some(s=>s.node_id===upstream))throw Error('COLD_STATIC_ANCESTOR_UNSUPPORTED');
    }
    const chain={imports:staticSources.imports.filter(s=>ancestors.has(s.node_id)),collapses:staticSources.collapses.filter(s=>ancestors.has(s.node_id))};
    const coldStaticSources=await bindColdExecutions({execute,sources:chain,ctx,ownedExecutions});
    const read=await readCollapseNativeOutput(channel,{sample_rows:50},ctx,{execute,operation,onRecord:record,now:Date.now,exclusiveNodeOperation:()=>true,coldStaticSources,nativeExecutionProof:execution,ownedPreview},{targetOrigin:origin,targetBuild:'7.4.2'},nativeConfiguration);
    if(!read.cleanup_complete)throw Error('COLD_NATIVE_CLEANUP_UNCONFIRMED');
    data=read.ports[0];
  }
  if(!data){
  const {openManagedJavascriptOutputViews}=target.type==='programming.javascript'?await load('client/lib/javascript-managed-views.mjs'):{};
  const opened = await openNewOutputTable(channel, outputPort,{openViews:args=>target.type==='programming.javascript'
   ?openManagedJavascriptOutputViews({prepared:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},node,output:args.output,
     deadline:operation.deadline,targetOrigin:origin,execute,record,receiptOptions:(id,action_key,signature)=>({receipt_namespace:session,
      receipt_id:id,receipt_signature:signature,operation_id:id}),wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{
      receipt_namespace:session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})})
   :openColdOutputViews(channel,args,{node,operation,readReceipt,record})})
  const precision = await configureTablePrecision(channel, opened.table)
  const readSettings = await prepareTableRead(channel, opened.table, {openFilter:args=>openColdTableFilter(channel,args,{node,operation,readReceipt,record})})
  const raw = await readTableOutputPages(channel, opened.table, {
    sampleRows: Math.max(10, ...expectedOutputs.map(o=>o.rows.length)),
  })
  const observedColumns=precision.fields.map(f=>({name:f.key,label:f.label,type:f.type}));
  data = decodeTableOutput(raw, {
    formatProof: precision,
    readSettings,
    expectedColumns: observedColumns,
    requireExactNumbers: true,
  })
  // This reader created this temporary visualizer with openNewOutputTable.
  // Its formats are never saved: the verified owned-package cleanup below
  // discards every temporary view. Rewriting every field's original format
  // here duplicated the expensive precision protocol and timed out wide reports.
  // Exact mask application/readback and value decoding remain mandatory.
  await returnFromOutputTable(channel, opened.table)
  }

  actual.push({node,type:target.type,label:target.label,output_port:outputPort,execution,data,cold_read_ceiling:coldReadCeiling,
   ...(content_candidate?{content_candidate:true}:{})});
  // Preserve independently read values before correspondence can refuse. A
  // failed match is still FAIL; this private checkpoint makes it diagnosable.
  const checkpoint=JSON.stringify({phase:'independent_cold_read_checkpoint',path:saved.path,outputs:actual});
  if([config.api_key,loginPassword].filter(Boolean).some(secret=>checkpoint.includes(secret)))throw Error('SECRET_IN_RESULT');
  await writeFile(join(args.output,'actual-readback.json'),checkpoint+'\n');
  }
  }
  // REST-dependent schemas are restored by cold execution. Inspect the saved
  // export input only after its source has executed and its output was read.
  if(exportInput){
   const [savedExport]=await observeExportDestinations({load,channelFor,execute,includeInputFields:true,
    graph:{...graph,nodes:graph.nodes.filter(n=>n.ref.node_id===exportInput.export_node_id)}});
   if(savedExport.node_id!==exportInput.export_node_id)throw Error('COLD_EXPORT_INPUT_MAPPING_CHANGED');
   exportInput.input_fields=savedExport.input_fields;
   await record({phase:'cold_export_input_mapping',...savedExport,settings_applied:false});
   state.exportObservation={node_id:savedExport.node_id,input_fields:savedExport.input_fields,
    ...(exportCsv?{csv_order:exportCsv}: {})};
   if(expectedOutputs.some(o=>o.output_node_type==='export_input'&&o.column_order==='exact')&&!exportCsv)
    throw Error('COLD_EXPORT_CSV_REQUIRED');
  }
  const correspondence=matchExpectedOutputs(actual,expectedOutputs,{allowExtraPortReads:true,exportInput,exportCsv});
  const matched=correspondence.map(m=>actual.find(a=>a.node.node_id===m.node.node_id&&a.output_port===m.output_port));

  // Независимый reader создаёт временные визуализаторы; Loginom помечает пакет dirty.
  // Cleanup проверяет точное владение пакетом/аккаунтом перед discard.
  if (state.cancelled) throw Error("COLD_CANCELLED")
  state.cleanupAttempted=true;
  const cleanup = await execute(
    makePackageCleanupCode({
      sessionId: session,
      documentId: prepared.document_id,
      account: config.workflow_profile.loginom_user,
      packagePath: saved.path,
      loginomUrl: config.loginom_url,
      loginomBuild: "7.4.2",
      tabTid: prepared.workflow_ref.tab_tid,
      diagnosticDiscard: true,
      diagnosticWaitForIdle: true,
    }),
  )
  await writeFile(join(args.output, "cleanup.json"), JSON.stringify(cleanup, null, 2) + "\n")
  state.cleanup=cleanup
  if(cleanup.native_close_readback)await record({phase:'cold_native_close_readback',readback:cleanup.native_close_readback,
    modified_before_close:cleanup.modified_before_close,cleanup_status:cleanup.status,cleanup_reason:cleanup.reason}).catch(()=>undefined)
  if (cleanup.status !== "SUCCEEDED" || !cleanup.package_closed || !cleanup.logged_out)
    throw Error("COLD_CLEANUP_UNCONFIRMED")
  state.closed = true

  const result = {
    status: "PASS",
    phase: "independent_cold_reopen_readback",
    path: saved.path,
    ...(state.exportObservation?{export_observation:state.exportObservation}:{}),
    ...(multiple?{outputs:matched.map(a=>({node:a.node,execution:a.execution,output:{ports:[{...a.data,port:a.output_port}]}})),correspondence}
      :{node:matched[0].node,execution:matched[0].execution,output:{ports:[{...matched[0].data,port:matched[0].output_port}]}}),
    settingsReapplied: false,
    cleanup: {
      package_closed: cleanup.package_closed === true,
      logged_out: cleanup.logged_out === true,
    },
  }
  const body = JSON.stringify(result, null, 2)
  if (body.includes(config.api_key) || (loginPassword && body.includes(loginPassword))) throw Error("SECRET_IN_RESULT")
  await writeFile(join(args.output, "result.json"), body + "\n")
  console.log(
    JSON.stringify({
      status: result.status,
      phase: result.phase,
      path: saved.path,
      ...(state.exportObservation?{export_observation:state.exportObservation}:{}),
      settingsReapplied: false,
      cleanup: result.cleanup,
    }),
  )
} catch(error) {
  state.failure=state.cancelled?"COLD_CANCELLED":String(error?.message??error)
  if(state.openAttempted&&state.prepared?.status!=='READY'&&!state.openFailure)
    state.openFailure={status:state.prepared?.status??'UNCONFIRMED',reason:state.prepared?.reason??state.failure}
  for(const secret of [config.api_key,loginPassword].filter(Boolean)){
    state.failure=state.failure.split(secret).join('[REDACTED]')
    if(state.openFailure)state.openFailure.reason=String(state.openFailure.reason).split(secret).join('[REDACTED]')
  }
  if (!state.cancelled) throw error
} finally {
  // Cold teardown: one native cleanup, then browser, including cancellation.
  try {
  if(state.openFailure&&page&&!state.cleanupExpired) {
    let timer
    const budget=Math.max(0,Math.min(1000,(state.openDeadline??Date.now())-Date.now()))
    let snapshot={status:'unavailable',reason:'open_deadline_exceeded'}
    if(budget>0)try {
      const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'unavailable',reason:'diagnostic_timeout'}),budget)})
      snapshot=await Promise.race([timeout,rawExecute(makeColdOpenDiagnosticCode({loginomUrl:config.loginom_url,
        loginomBuild:'7.4.2',account:config.workflow_profile.loginom_user}))])
    } catch {snapshot={status:'unavailable',reason:'diagnostic_read_failed'}} finally {clearTimeout(timer)}
    await record({phase:'cold_open_refused_native',open_failure:state.openFailure,snapshot})
      .catch(()=>{state.openDiagnosticUnconfirmed=true})
  }
  const failedOpen=state.openFailure&&state.prepared?.status!=='READY'
    &&(state.prepared?.effect_possible===true||!state.prepared&&state.openAttempted)
  if (!state.cleanupExpired && !state.closed && !state.cleanupAttempted && (failedOpen || state.prepared?.status === "READY" && state.prepared.package_ref?.path === saved.path)) {
    // A rejected readonly opening owns only this diagnostic copy, never the
    // writer's lock. Native cleanup rechecks its mode and refuses dirty copies.
    const readOnly = state.prepared?.workflow_ref?.navigation_path.some(item => item.label.endsWith("(только чтение)"))
    state.cleanupAttempted=true
    await rawExecute(
      failedOpen?makeFailedOpenCleanupCode({sessionId:session,operationId:'cold-open',account:config.workflow_profile.loginom_user,
        packagePath:saved.path,loginomUrl:config.loginom_url,loginomBuild:'7.4.2'}):makePackageCleanupCode({
        sessionId: session,
        documentId: state.prepared.document_id,
        account: config.workflow_profile.loginom_user,
        packagePath: saved.path,
        loginomUrl: config.loginom_url,
        loginomBuild: "7.4.2",
        tabTid: state.prepared.workflow_ref.tab_tid,
        diagnosticReadOnly: readOnly,
        // Cancellation has no complete persisted-change inventory proving
        // Table-only changes. Never turn package ownership into discard proof.
        // Clean packages close normally; dirty/unknown ones retain BLOCKED.
        diagnosticDiscard: !readOnly && !state.cancelled,
        diagnosticWaitForIdle: !readOnly && !state.cancelled,
      }),
    )
      .then(async (result) => {
        state.cleanup=result
        if(result.native_close_readback)await record({phase:'cold_native_close_readback',readback:result.native_close_readback,
          modified_before_close:result.modified_before_close,cleanup_status:result.status,cleanup_reason:result.reason}).catch(()=>undefined)
        return writeFile(join(args.output, "cleanup.json"), JSON.stringify(result, null, 2) + "\n")
      })
      .catch(async () => {
        state.cleanup={status:'BLOCKED',reason:'COLD_PACKAGE_CLEANUP_UNCONFIRMED',package_closed:false,logged_out:false}
        await writeFile(join(args.output,'cleanup.json'),JSON.stringify(state.cleanup,null,2)+'\n')
      })
  }
  if(state.failure&&!state.cleanupExpired)await writeFile(join(args.output,'result.json'),JSON.stringify({status:'FAIL',
   phase:'independent_cold_reopen_readback',path:saved.path,settingsReapplied:false,error:state.failure,
   ...(state.openFailure?{reason:state.openFailure.reason,open_failure:state.openFailure}:{}),
   ...(state.openDiagnosticUnconfirmed?{open_diagnostic_recorded:false}:{}),
   ...(state.exportObservation?{export_observation:state.exportObservation}:{}),
   ...(state.cancelled?{cancellation:{signal:state.cancelled,cleanup_budget_exhausted:false,
    lock_may_remain:state.cleanup?.package_closed!==true}}:{}),
   cleanup:{status:state.cleanup?.status??'BLOCKED',reason:state.cleanup?.reason??(state.cleanup?.status==='SUCCEEDED'?null:state.cleanup?'CLEANUP_UNCONFIRMED':'CLEANUP_NOT_ADMITTED'),
    package_closed:state.cleanup?.status==='SUCCEEDED'&&state.cleanup.package_closed===true,
    logged_out:state.cleanup?.status==='SUCCEEDED'&&state.cleanup.logged_out===true}},null,2)+'\n')
  } finally {
    await context?.close()
    clearTimeout(state.cancelTimer)
    signals.forEach((signal,i) => process.off(signal,handlers[i]))
  }
}

async function loadSaved(value) {
  // Путь пакета Loginom передаётся напрямую; локальный JSON — {path, node?}.
  if (value.endsWith(".lgp")) return { path: value }
  const parsed = JSON.parse(await readFile(resolve(value), "utf8"))
  if (typeof parsed === "string" && parsed.endsWith(".lgp")) return { path: parsed }
  if (parsed && typeof parsed.path === "string") return { path: parsed.path, node: parsed.node }
  throw Error("SAVED_SHAPE_INVALID")
}
