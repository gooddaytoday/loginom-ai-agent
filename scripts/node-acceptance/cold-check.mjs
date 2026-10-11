import {parseExpectedOutputs,matchExpectedOutputs} from "./expected-outputs.mjs"
import { parseArgs } from "node:util"
import { readFile, mkdir, writeFile, open } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import {observeStaticSources,verifyStaticSourceBytes,bindColdExecutions} from './static-source-proof.mjs'
import {makeColdSourceRevealCode} from './cold-source-viewport.mjs'
import {coldNativeEligible} from './cold-reader-policy.mjs'

import {withDiagnosticSession} from './diagnostic-session.mjs'
// Foreground owners retain the original handles through every rejection.
export async function runColdCheck(args, owner, foreground = {}) {
 if (!owner || owner.context) throw Error('FOREGROUND_OWNER_REQUIRED')
 process.umask(0o077)
 try {
const root = resolve(args.resources)
const load = foreground.load ?? (name => import(pathToFileURL(join(root,'runtime',name)).href))
const {verifyResources}=await load('src/resources.mjs')
const resources=await verifyResources(root)
const compatibilityPlatform=resources.manifest.target?.startsWith('win32-')?'windows':resources.manifest.target?.startsWith('darwin-')?'macos':'linux'
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

const config=JSON.parse(await readFile(args.config,'utf8'))
const loginPassword=config.workflow_profile?.password??''
if(config.workflow_profile?.passwordless_login===true&&loginPassword!=='' || config.workflow_profile?.passwordless_login!==true&&loginPassword==='')throw Error('TEST_PASSWORD_UNAVAILABLE')
const expected=JSON.parse(await readFile(args.expected,'utf8'))
const {multiple,outputs:expectedOutputs}=parseExpectedOutputs(expected)
const saved=await loadSaved(args.saved)
if(saved.path!==expected.package_path)throw Error('PACKAGE_PATH_MISMATCH')
await mkdir(args.output,{recursive:true,mode:0o700})
const session=foreground.sessionId??randomUUID(),account=config.workflow_profile.loginom_user
const identity=Object.freeze({sessionId:session,account,packagePath:saved.path,personalDirectory:'/'+account,loginomUrl:config.loginom_url,loginomBuild:'7.4.2',diagnosticDiscard:false})
const record=createExecutionJournal({directory:args.output,metadata:{sessionId:session,clientRevision:resources.manifestHash,actionManifestDigest:resources.manifest.actionManifestSha256},knownSecrets:[config.api_key,loginPassword].filter(Boolean)})
let context=foreground.context,page=foreground.page
if(!context){
 const {createRequire}=await import('node:module'),{chromium}=createRequire(pathToFileURL(join(root,'runtime/client/package.json')))('playwright-core')
 const {loginPage,browserEnvironment,browserLoggingArguments}=await load('src/connection-check.mjs')
 const {browserLaunch}=await load('client/lib/browser-launch.mjs'),{browserDownloadScript}=await load('client/lib/browser-downloads.mjs')
 const profile=join(args.output,'browser'),launch=browserLaunch(process.env.LOGINOM_AI_AGENT_TEST_HEADLESS!=='0')
 context=await chromium.launchPersistentContext(profile,{executablePath:resources.browserPath,headless:process.env.LOGINOM_AI_AGENT_TEST_HEADLESS!=='0',chromiumSandbox:true,env:browserEnvironment(profile),args:['--no-proxy-server',...browserLoggingArguments(profile),...launch.args],viewport:launch.viewport})
 page=context.pages()[0]??await context.newPage()
 Object.assign(owner,{context,page,failed:false,closed:false})
 await context.addInitScript({content:browserDownloadScript(config.loginom_url)})
 await loginPage(page,{url:config.loginom_url,username:account,password:loginPassword})
}
const transport=foreground.execute??(code=>new Function('page',`return (${code})(page)`)(page))
let unknownEffect=false
const execute=async code=>{
 try{const receipt=await transport(code);if(receipt?.status==='AMBIGUOUS'||receipt?.outcome?.status==='AMBIGUOUS'||receipt?.status!=='SUCCEEDED'&&receipt?.effect_possible===true&&receipt?.cleanup_complete===false){unknownEffect=true;owner.unknownEffect=true}return receipt}
 catch(error){unknownEffect=true;owner.unknownEffect=true;throw error}
}
Object.assign(owner,{context,page,execute,identity:{...identity},failed:false,closed:false,unknownEffect:false})
const {createActionRuntime}=await load('client/lib/executor.mjs')
const catalog=JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'),'utf8')),selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'),'utf8'))
catalog.actions.find(a=>a.action_key==='package.save_checkpoint').effect.allowed_roots=[identity.personalDirectory]
const runtime=foreground.runtime??createActionRuntime({pinned:{actions:new Map(catalog.actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,targetOrigin:new URL(config.loginom_url).origin,targetBuild:'7.4.2',allowCandidate:true})
owner.runtime=runtime
const settled=()=>{
 if(owner.runtime!==runtime||typeof runtime.hasUnsettledWork!=='function')throw Error('DIAGNOSTIC_RUNTIME_UNVERIFIED')
 if(runtime.hasUnsettledWork()||unknownEffect)throw Error('DIAGNOSTIC_RUNTIME_UNSETTLED')
 if(owner.context!==context||owner.page!==page||owner.execute!==execute||owner.closed)throw Error('DIAGNOSTIC_OWNER_CHANGED')
}
let prepared,verifiedPrepared,binding,nativeHandle
const requireBinding=()=>{
 if(!binding||owner.prepared!==verifiedPrepared||owner.prepared.status!=='READY'||owner.prepared.document_id!==binding.documentId||owner.prepared.workflow_ref?.tab_tid!==binding.tabTid||owner.prepared.package_ref?.path!==binding.path||owner.identity.packagePath!==binding.path||owner.identity.account!==identity.account||owner.identity.sessionId!==identity.sessionId)throw Error('DIAGNOSTIC_PACKAGE_IDENTITY_UNCONFIRMED')
}
const observe=foreground.observeIdentity??(()=>page.evaluate(({b,o})=>{
 const app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree,p=globalThis.__loginomDockPreparationV1,n=m?.PackageNodes?.Count===1?m.PackageNodes.Items(0):null
 const tabs=document.querySelectorAll('[data-tid='+JSON.stringify(o.tabTid)+']')
 const path=n?.PackageFileName?'/'+n.PackageFileName.replaceAll('\\','/').replace(/^\/+/, ''):null
 return Promise.resolve(n?m.FServerConnection.Session.IsPackageModified(n.Package):null).then(modified=>({account:m?.FServerConnection?.UserName,sessionId:o.sessionId,documentId:p?.id,tabTid:tabs.length===1&&tabs[0]===b.tab&&tabs[0].classList.contains('x-tab-active')?o.tabTid:null,path,modified,running:n?n.HasRunningNodes()||m.HasRunningNodes():null,readOnly:n?.ReadOnly,owned:p===b.prep&&p.document===document&&n===b.node&&n?.Package===b.package&&m?.FServerConnection===b.connection&&m.FServerConnection.Connected===true,personalDirectory:o.personalDirectory}))
},{b:nativeHandle,o:{...identity,tabTid:binding.tabTid}}))
const requireState=state=>{requireBinding();if(state.account!==identity.account||state.sessionId!==identity.sessionId||state.documentId!==binding.documentId||state.tabTid!==binding.tabTid||state.path!==binding.path||state.owned!==true||state.running!==false||state.readOnly!==false)throw Error('DIAGNOSTIC_RECOVERY_IDENTITY_UNCONFIRMED')}
const durable=async(name,value)=>{
 const f=await open(join(args.output,name),'w',0o600);try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync()}finally{await f.close()}
 const dir=await open(args.output,'r');try{await dir.sync()}finally{await dir.close()}
}
let coldResult,recovering=false
owner.recover=async()=>{
 if(recovering)throw Error('DIAGNOSTIC_RECOVERY_RUNNING')
 recovering=true
 try{
 settled();requireBinding();const state=await observe();requireState(state);settled()
 if(state.modified!==false){
  if(state.modified!==true)throw Error('DIAGNOSTIC_DIRTY_UNCONFIRMED')
  if(state.personalDirectory!==identity.personalDirectory||!/^[^/\\\x00-\x1f]+$/.test(account)||['.','..'].includes(account))throw Error('DIAGNOSTIC_PERSONAL_PATH_UNCONFIRMED')
  const path=identity.personalDirectory+'/'+randomUUID()+'.lgp'
  settled();requireBinding()
  const savedCopy=await runtime.run('package.save_checkpoint',{path,conflict_policy:'fail'},{operationId:'cold-preserve-'+randomUUID()})
  owner.preservation=savedCopy
  if(savedCopy?.status!=='SUCCEEDED'||savedCopy.output?.save_completed!==true||savedCopy.output.package_ref?.path!==path)throw Error('DIAGNOSTIC_SAVE_UNCONFIRMED')
  settled();requireBinding()
  owner.identity={...identity,packagePath:path};owner.prepared={...verifiedPrepared,package_ref:savedCopy.output.package_ref};verifiedPrepared=owner.prepared;binding={...binding,path}
  await durable('preservation.json',savedCopy)
  const after=await observe();requireState(after);if(after.modified!==false)throw Error('DIAGNOSTIC_SAVE_DIRTY')
 }
 settled();requireBinding()
 const cleanupExecute=async code=>{
  settled();requireBinding();const receipt=await execute(code);owner.cleanup=receipt
  const confirmed=receipt?.status==='SUCCEEDED'&&receipt.package_closed===true&&receipt.logged_out===true&&receipt.unsaved_changes_discarded===false&&receipt.session_id===identity.sessionId&&receipt.document_id===binding.documentId&&receipt.account===identity.account&&receipt.package_path===binding.path
  const noEffect=receipt?.status==='BLOCKED'&&receipt.package_closed===false&&receipt.logged_out===false&&['ACCOUNT_CHANGED','DOCUMENT_IDENTITY_CHANGED','CONNECTION_DISCONNECTED','DIALOG_OR_OPERATION_OPEN','PACKAGE_INVENTORY_CHANGED','PACKAGE_IDENTITY_CHANGED','RUNNING_NODES','UNSAVED_CHANGES','PACKAGE_CHANGED_DURING_CHECK'].includes(receipt.reason)
  if(!confirmed&&!noEffect){unknownEffect=true;owner.unknownEffect=true}
  if(receipt?.status==='SUCCEEDED'&&receipt.package_closed===true&&receipt.logged_out===true&&receipt.unsaved_changes_discarded===false&&receipt.session_id===identity.sessionId&&receipt.document_id===binding.documentId&&receipt.account===identity.account&&receipt.package_path===binding.path){
   await durable('package-cleanup.json',receipt)
   if(!owner.failed&&coldResult)await durable('result.json',{...coldResult,cleanup:{package_closed:true,logged_out:true},preservation:owner.preservation??null})
  }
  if(receipt?.status==='SUCCEEDED'&&receipt.unsaved_changes_discarded!==false)throw Error('DIAGNOSTIC_DISCARD_UNCONFIRMED')
  return receipt
 }
 await withDiagnosticSession({context,execute:cleanupExecute,directory:args.output,identity:{...identity,packagePath:binding.path},makeCleanupCode:foreground.makeCleanupCode??makePackageCleanupCode},async({bindPrepared})=>bindPrepared(owner.prepared))
 owner.closed=true;return owner
 }finally{recovering=false}
}
prepared=await execute(makeWorkspacePrepareCode({loginomUrl:config.loginom_url,compatibility:{loginom_build:'7.4.2',platform:compatibilityPlatform,browser:'chromium'},sessionId:session,operationId:'cold-open',intent:'open_package',packagePath:saved.path}))
owner.preparedCandidate=prepared
if(prepared?.status!=='READY'||prepared.package_ref?.path!==saved.path||!prepared.document_id||!prepared.workflow_ref?.tab_tid||prepared.workflow_ref.navigation_path.some(item=>item.label.endsWith('(только чтение)')))throw Error('COLD_PACKAGE_NOT_WRITABLE')
verifiedPrepared=structuredClone(prepared);owner.prepared=verifiedPrepared;binding={documentId:prepared.document_id,tabTid:prepared.workflow_ref.tab_tid,path:saved.path}
if(!foreground.observeIdentity)nativeHandle=await page.evaluateHandle(tabTid=>{const p=globalThis.__loginomDockPreparationV1,m=bg.app.Application.FInstance.FMainForm.FMapTree,n=m.PackageNodes.Count===1?m.PackageNodes.Items(0):null,tabs=document.querySelectorAll('[data-tid='+JSON.stringify(tabTid)+']');return {prep:p,node:n,package:n?.Package,connection:m.FServerConnection,tab:tabs.length===1?tabs[0]:null}},binding.tabTid)
requireState(await observe());settled()
if(foreground.scenario){await foreground.scenario({owner,prepared,execute,runtime});coldResult={status:'PASS',phase:'diagnostic_cold_caller',path:saved.path,settingsReapplied:false}}
else{
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
   const account=config.workflow_profile.loginom_user;
   const before=await observeStaticSources({load,graph:{...graph,nodes:graph.nodes.filter(n=>n.type==='imports.text')},channelFor,account,revealSource});
   const verified=await verifyStaticSourceBytes({load,runtime,execute,sources:before,allowed:expected.static_sources,account,origin,output:args.output});
   const returned=await adapter.activateWorkflow({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},{deadline:Date.now()+30000,receipt_id:'cold-return-from-files'});
   if(returned.status!=='SUCCEEDED'||!returned.verified||!returned.cleanup_complete)throw Error('COLD_SOURCE_RETURN_UNCONFIRMED');
   graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
   staticSources=await observeStaticSources({load,graph,channelFor,account,revealSource,verifiedSources:verified});
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
  // Recovery preserves temporary views only in a new private copy; the source
  // package is never overwritten. Exact decoding remains independent of cleanup.
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

coldResult={status:'PASS',phase:'independent_cold_reopen_readback',path:saved.path,...(multiple?{outputs:actual.map(a=>({node:a.node,execution:a.execution,output:{ports:[a.data]}})),correspondence}:{node:actual[0].node,execution:actual[0].execution,output:{ports:[actual[0].data]}}),settingsReapplied:false}
const text=JSON.stringify(coldResult);if([config.api_key,loginPassword].filter(Boolean).some(secret=>text.includes(secret)))throw Error('SECRET_IN_RESULT')
await durable('actual-readback.json',coldResult)
}
owner.result=coldResult
await owner.recover()
 }catch(error){
  owner.failed=true;owner.error=error
  let message=String(error?.message??error)
  try{const config=JSON.parse(await readFile(args.config,'utf8'));for(const secret of [config.api_key,config.workflow_profile?.password].filter(Boolean))message=message.split(secret).join('[REDACTED]')
   await writeFile(join(args.output,'result.json'),JSON.stringify({status:'FAIL',phase:'independent_cold_reopen_readback',error:message,settingsReapplied:false,cleanup:{package_closed:owner.cleanup?.package_closed===true,logged_out:owner.cleanup?.logged_out===true}})+'\n',{mode:0o600})
  }catch(evidenceError){owner.evidenceError=evidenceError}
 }
 return owner
}

export const coldOwner={}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=parseArgs({options:{config:{type:'string'},resources:{type:'string'},saved:{type:'string'},expected:{type:'string'},output:{type:'string'}},strict:true}).values
 if(!args.config||!args.resources||!args.saved||!args.expected||!args.output)throw Error('Required: --config --resources --saved --expected --output')
 await runColdCheck(args,coldOwner)
 if(coldOwner.failed){process.exitCode=1;console.error('COLD_CHECK_FAILED; original foreground owner retained for guarded recovery')}
 else console.log(JSON.stringify({status:'PASS',phase:'independent_cold_reopen_readback',path:coldOwner.result.path,settingsReapplied:false,cleanup:{package_closed:true,logged_out:true}}))
}

async function loadSaved(value) {
  // Путь пакета Loginom передаётся напрямую; локальный JSON — {path, node?}.
  if (value.endsWith(".lgp")) return { path: value }
  const parsed = JSON.parse(await readFile(resolve(value), "utf8"))
  if (typeof parsed === "string" && parsed.endsWith(".lgp")) return { path: parsed }
  if (parsed && typeof parsed.path === "string") return { path: parsed.path, node: parsed.node }
  throw Error("SAVED_SHAPE_INVALID")
}
