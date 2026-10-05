import {parseExpectedOutputs,matchExpectedOutputs} from "./expected-outputs.mjs"
import { parseArgs } from "node:util"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import {observeStaticSources,verifyStaticSourceBytes,bindColdExecutions} from './static-source-proof.mjs'
import {makeColdSourceRevealCode} from './cold-source-viewport.mjs'
import {coldNativeEligible} from './cold-reader-policy.mjs'

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
const { makePackageCleanupCode } = await load("client/lib/package-cleanup.mjs")
const { openNewOutputTable, configureTablePrecision, prepareTableRead, returnFromOutputTable } =
  await load("client/lib/node-output-procedure.mjs")
const { readTableOutputPages } = await load("client/lib/table-output-pages.mjs")
const { decodeTableOutput } = await load("client/lib/table-output-values.mjs")

const config = JSON.parse(await readFile(args.config, "utf8"))
const loginPassword = config.workflow_profile?.password ?? ""
if (config.workflow_profile?.passwordless_login === true && loginPassword !== "") throw Error("TEST_PASSWORD_UNAVAILABLE")
if (config.workflow_profile?.passwordless_login !== true && loginPassword === "") throw Error("TEST_PASSWORD_UNAVAILABLE")
const expected = JSON.parse(await readFile(args.expected, "utf8"))
const {multiple,outputs:expectedOutputs}=parseExpectedOutputs(expected)

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
const { context } = await loginBrowser({
  browserPath: resources.browserPath,
  profile: join(args.output, "browser"),
  candidate: { url: config.loginom_url, username: config.workflow_profile.loginom_user, password: loginPassword },
  headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
  keepOpen: true,
})
const page = context.pages()[0]
const execute = (code) => new Function("page", `return (${code})(page)`)(page)
const state = { prepared: undefined, closed: false, cleanupAttempted: false }
try {
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
  if (
    prepared.status !== "READY" ||
    prepared.package_ref.path !== saved.path ||
    prepared.workflow_ref.navigation_path.some((item) => item.label.endsWith("(только чтение)"))
  )
    throw Error("COLD_PACKAGE_NOT_WRITABLE")

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
  for (const want of expected.nodes) {
    if (!graph.nodes.some((node) => node.type === want.type)) throw Error(`COLD_NODE_TYPE_MISSING:${want.type}`)
  }

  const types=new Set(expectedOutputs.map(o=>o.output_node_type));
  const matches=graph.nodes.filter(n=>types.has(n.type)&& (multiple||!saved.node||n.ref.node_id===saved.node));
  if(matches.length!==expectedOutputs.length)throw Error("COLD_EXTRA_OR_MISSING_OUTPUT_NODE");
  const actual=[],ownedExecutions=[];
  for(const [outputIndex,target] of matches.entries()){
  const node=target.ref;

  const operation = {
    id: "cold-read-expected-"+outputIndex,
    action: { action_key: "acceptance.cold_read", revision: "1" },
    deadline: Date.now() + 540_000,
  }
  const channel = createNodeProcedure({
    operation,
    execute,
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
  const nativeSource=staticSources?.crossTables.find(c=>c.node_id===node.node_id);
  const nativeConfiguration=nativeSource?.configuration;
  if(nativeConfiguration){
   const {prepareCrossTableAncestorExecution}=await load('client/lib/crosstable-ancestor-execution.mjs');
   await prepareCrossTableAncestorExecution({graph,node,sources:staticSources,operation,execute,record,targetOrigin:origin,targetBuild:'7.4.2',
    wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
  }
  const driver = createNodeExecutionProcedure(channel, node)
  await driver.prepare()
  await driver.launchGraph()
  await driver.identify()
  const execution = await driver.waitCompleted({})
  if (execution.status !== "completed" || !execution.verified || !execution.owner_verified)
    throw Error("COLD_EXECUTION_NOT_VERIFIED")
  ownedExecutions.push(execution);

  let useNative=false,ownedPreview;
  const ctx={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node,execution,deadline:operation.deadline,receipt_id:operation.id};
  if(nativeConfiguration){
   const {openOwnedNativePreview,closeOwnedNativePreview}=await load('client/lib/collapse-native-output.mjs');
   ownedPreview=await openOwnedNativePreview(channel,ctx);
   useNative=coldNativeEligible(nativeConfiguration,ownedPreview.preview);
   if(!useNative)await closeOwnedNativePreview(channel,ctx,ownedPreview.port,ownedPreview.preview.root_tid);
  }

  let data;
  if(useNative){
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
  const opened = await openNewOutputTable(channel, 0)
  const precision = await configureTablePrecision(channel, opened.table)
  const readSettings = await prepareTableRead(channel, opened.table)
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

  actual.push({node,type:target.type,label:target.label,execution,data});
  // Preserve independently read values before correspondence can refuse. A
  // failed match is still FAIL; this private checkpoint makes it diagnosable.
  const checkpoint=JSON.stringify({phase:'independent_cold_read_checkpoint',path:saved.path,outputs:actual});
  if([config.api_key,loginPassword].filter(Boolean).some(secret=>checkpoint.includes(secret)))throw Error('SECRET_IN_RESULT');
  await writeFile(join(args.output,'actual-readback.json'),checkpoint+'\n');
  }
  const correspondence=matchExpectedOutputs(actual,expectedOutputs);

  // Независимый reader создаёт временные визуализаторы; Loginom помечает пакет dirty.
  // Cleanup проверяет точное владение пакетом/аккаунтом перед discard.
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
    }),
  )
  await writeFile(join(args.output, "cleanup.json"), JSON.stringify(cleanup, null, 2) + "\n")
  state.cleanup=cleanup
  if (cleanup.status !== "SUCCEEDED" || !cleanup.package_closed || !cleanup.logged_out)
    throw Error("COLD_CLEANUP_UNCONFIRMED")
  state.closed = true

  const result = {
    status: "PASS",
    phase: "independent_cold_reopen_readback",
    path: saved.path,
    ...(multiple?{outputs:actual.map(a=>({node:a.node,execution:a.execution,output:{ports:[a.data]}})),correspondence}
      :{node:actual[0].node,execution:actual[0].execution,output:{ports:[actual[0].data]}}),
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
      settingsReapplied: false,
      cleanup: result.cleanup,
    }),
  )
} catch(error) {
  state.failure=String(error?.message??error)
  for(const secret of [config.api_key,loginPassword].filter(Boolean))state.failure=state.failure.split(secret).join('[REDACTED]')
  throw error
} finally {
  if (!state.closed && !state.cleanupAttempted && state.prepared?.status === "READY" && state.prepared.package_ref?.path === saved.path) {
    await execute(
      makePackageCleanupCode({
        sessionId: session,
        documentId: state.prepared.document_id,
        account: config.workflow_profile.loginom_user,
        packagePath: saved.path,
        loginomUrl: config.loginom_url,
        loginomBuild: "7.4.2",
        tabTid: state.prepared.workflow_ref.tab_tid,
        diagnosticDiscard: true,
      }),
    )
      .then((result) => {state.cleanup=result;return writeFile(join(args.output, "cleanup.json"), JSON.stringify(result, null, 2) + "\n")})
      .catch(() => console.error("COLD_PACKAGE_CLEANUP_UNCONFIRMED"))
  }
  if(state.failure)await writeFile(join(args.output,'result.json'),JSON.stringify({status:'FAIL',
   phase:'independent_cold_reopen_readback',path:saved.path,settingsReapplied:false,error:state.failure,
   cleanup:{package_closed:state.cleanup?.status==='SUCCEEDED'&&state.cleanup.package_closed===true,
    logged_out:state.cleanup?.status==='SUCCEEDED'&&state.cleanup.logged_out===true}},null,2)+'\n')
  await context.close()
}

async function loadSaved(value) {
  // Путь пакета Loginom передаётся напрямую; локальный JSON — {path, node?}.
  if (value.endsWith(".lgp")) return { path: value }
  const parsed = JSON.parse(await readFile(resolve(value), "utf8"))
  if (typeof parsed === "string" && parsed.endsWith(".lgp")) return { path: parsed }
  if (parsed && typeof parsed.path === "string") return { path: parsed.path, node: parsed.node }
  throw Error("SAVED_SHAPE_INVALID")
}
