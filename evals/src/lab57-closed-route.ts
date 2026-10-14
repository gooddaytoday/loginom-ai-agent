import path from "node:path"
import {privateDiagnosticRun} from "./lab57-preonce-diagnostics"
import {rootAuthority,verifyEntryActor,operatorRecord} from "./lab57-root-actor"
import {constants} from "node:fs"
import {mkdir,lstat,open,readFile,readdir,realpath,rmdir,copyFile,chmod} from "node:fs/promises"
import {pathToFileURL} from "node:url"
import {createHash} from "node:crypto"
import {verifyNodeIdentity} from "./lab57-node-identity"
import {admitClosedNative} from "./lab57-native-permit"
import {connectDispatcherMcp} from "./lab57-dispatcher-host"
import {parseDispatcherResponse,observeDispatcher,runDispatcherBoundary} from "./lab57-dispatcher-transport"
import {deriveOriginalBinding,dispatcherScope} from "./lab57-dispatcher"
import {routeRoot,routeCli,routeNode,routeProfile,routeRun,routeStand,routeConfig,routeLease,routeDigest,routeBirth,
  routePrivateJson,writeRouteRecord,routeCommand,verifyRouteSources,assertRouteEffect} from "./lab57-route-host"
import type {RouteAdmission,RouteContext} from "./lab57-route-host"

export function closedRouteArguments(args:string[]) {
  if(args.length===1&&args[0]==="plan")return {command:"plan" as const,file:null}
  if(args.length===3&&args[0]==="execute"&&args.slice(1).every(s=>s.startsWith("/")&&!s.includes("\0")))return {command:"execute" as const,file:args[1]!,proofRoot:args[2]!}
  if(args.length!==2||!["worker","admit-helper"].includes(args[0]!)||!args[1]!.startsWith("/")||args[1]!.includes("\0"))throw Error("CLOSED_ROUTE_ARGUMENTS")
  return {command:args[0] as "worker"|"admit-helper",file:args[1]!}
}

export const closedRoutePlan=["Independent final source/pin admission (no self adoption)","Original common owner/held operation guard and fresh full admission",
  "Original helper recovery reservation plus distinct durable overall once before any resource effect","Coherent original profile/history snapshot and all77 actual model rows",
  "Exact sibling registration archive; guard/CSV retained","Supervised exact Node/d6/bubblewrap private managed observer: genuine administration, bounded closure or full stable absence",
  "Own diagnostic logout and genuine continuous process capture","Supported original recovery/history and independent77-row preservation",
  "Whole exact legacy guard archive and exact owned CSV removal","Verified separate recovery completion; ordinary release and fresh FREE"]

async function contextFile(ctx:RouteContext) {return writeRouteRecord(routeStand,`lab57-context-${crypto.randomUUID()}.json`,ctx)}
async function helper(ctx:RouteContext,stage:string) {
  await assertRouteEffect(ctx,"helper-"+stage,ctx.once?routeStand+"/lab57-closed":undefined)
  const file=await contextFile(ctx)
  const command=stage==="history"?routeRoot+"/bin/with-env":routeRoot+"/bin/bun"
  const args=stage==="history"?[routeRoot+"/runtime.env",routeRoot+"/bin/with-env",routeRoot+"/roles/ben/eval.env",routeRoot+"/bin/with-env",
    routeRoot+"/roles/ben/agent-work/lab57-eb1-independent/overrides.env",routeRoot+"/bin/bun",ctx.sourceRoot+"/evals/script/lab57-route-helper.ts",stage,file]
    :[ctx.sourceRoot+"/evals/script/lab57-route-helper.ts",stage,file]
  const result=await routeCommand(command,args,ctx.once?routeStand+"/lab57-closed":undefined,stage==="native"?960000:120000)
  return JSON.parse(result.trim().split("\n").at(-1)!) as Record<string,unknown>
}

/** Entry owns the operation guard; no acquire, transfer, retry, resumed once or caller-provided admission callback. */
export async function executeClosedRoute(admissionFile:string,proofRoot:string) {
  const prefix=routeRoot+"/roles/ben/agent-work/lab57-preonce/"
  if(!proofRoot.startsWith(prefix)||!/^[a-z0-9-]+$/.test(proofRoot.slice(prefix.length))||process.getuid!()!==1000||process.geteuid!()!==1000)throw Error("PRIVATE_DIAGNOSTICS_REQUIRED")
  const sourceSha=process.argv[1]?.match(/\/evalrunner-([0-9a-f]{40})\/lab57-owned-route\.mjs$/)?.[1]??"UNVERIFIED"
  return privateDiagnosticRun(proofRoot,{issue:dispatcherScope.issue,sourceSha,ownerTask:dispatcherScope.ownerTask,controller:{pid:process.pid,birth:await routeBirth(process.pid)}},async enter=>{
    await enter("private-admission")
    return executeClosedRouteInner(admissionFile,proofRoot,enter)
  })
}
async function executeClosedRouteInner(admissionFile:string,proofRoot:string,enter:(stage:string)=>Promise<void>) {
  const a=await routePrivateJson<RouteAdmission>(admissionFile),sourceRoot=routeRoot+"/support/evalrunner-"+a.sourceSha
  if(process.argv[1]!==sourceRoot+"/lab57-owned-route.mjs")throw Error("ADMITTED_SOURCE_OWNER_TASK_REQUIRED")
  verifyEntryActor(a,a.actor?await readFile(sourceRoot+"/evals/docs/evaler/lab57-root-handover.json"):new Uint8Array(),process.env.MULTICA_TASK_ID,process.getuid!())
  await enter("sources-and-administrator")
  await verifyRouteSources(a,sourceRoot)
  const admin=await routePrivateJson<{account:string;password:string}>(a.administratorFile)
  if(!/^[a-zA-Z0-9_.-]+$/.test(admin.account)||admin.account.toLowerCase()==="user"||typeof admin.password!=="string"
    ||await routeDigest(a.administratorFile)!==a.administratorSha)throw Error("EXISTING_TRUSTED_ADMINISTRATOR_ROUTE_REQUIRED")
  if(await routeDigest(a.historyInventory)!=="c40d6b1bfe6742a5d9b8ca695cb3e7c31754765f8f21e44ce488af034b4f38b0")throw Error("ORIGINAL_HISTORY_BINDING_REQUIRED")
  // Creating this common guard is a lifecycle exclusion, never a new resource admission or lease.
  await enter("original-operation-guard");await verifyNodeIdentity(routeNode);await mkdir(routeStand+"/operation",{mode:0o700})
  const operation=await lstat(routeStand+"/operation")
  const ctx:RouteContext={admission:a,sourceRoot,diagnosticsRoot:proofRoot,operation:{device:operation.dev,inode:operation.ino},controller:{pid:process.pid,starttime:await routeBirth(process.pid)},
    moves:{},csvRemoved:false,historyArchived:false}
  try {
    await enter("fresh-guard");await assertRouteEffect(ctx,"original-reservation")
    // Check overall once absence BEFORE reserving the unspent original helper recovery.
    await lstat(routeStand+"/lab57-closed.once.json").then(()=>{throw Error("ORIGINAL_ONCE_ALREADY_SPENT")},e=>{if(e.code!=="ENOENT")throw e})
    await enter("original-reservation");const reservation=await helper(ctx,"reserve")
    await enter("overall-once");const once=await writeRouteRecord(routeStand,"lab57-closed.once.json",{version:1,status:"CONSUMED_BEFORE_EFFECT",controller:ctx.controller,operation:ctx.operation,
      operator:operatorRecord(a),observerBindingSha256:a.observerBindingSha256,
      issue:dispatcherScope.issue,ownerTask:dispatcherScope.ownerTask,frozen:dispatcherScope.frozen,sourceSha:a.sourceSha,sourceManifestSha:a.sourceManifestSha,reservation,
      administratorSha:a.administratorSha,admissionSha:await routeDigest(admissionFile),acquiredAt:"2026-10-13T22:28:17.228Z"})
    const onceInfo=await lstat(once,{bigint:true})
    ctx.once={path:once,sha256:await routeDigest(once),device:Number(onceInfo.dev),inode:Number(onceInfo.ino),mtimeNs:String(onceInfo.mtimeNs),ctimeNs:String(onceInfo.ctimeNs)}
    await enter("after-once");await assertRouteEffect(ctx,"private-diagnostic-root")
    await mkdir(routeStand+"/lab57-closed",{mode:0o700})
    await writeRouteRecord(routeStand+"/lab57-closed","source-admission.json",a)
    await snapshotClosedHistory(ctx)
    const archived=await helper(ctx,"archive-registration")
    ctx.moves[routeProfile+".process-group"]=String(archived.destination)
    await assertRouteEffect(ctx,"new-diagnostic-directory",routeStand+"/lab57-closed")
    await mkdir(routeStand+"/lab57-closed/diagnostic",{mode:0o700})
    const native=await helper(ctx,"native")
    if(native.status!=="NATIVE_CESSATION_AND_OWN_LOGOUT_CONFIRMED")throw Error("NATIVE_RECOVERY_UNCONFIRMED")
    const history=await helper(ctx,"history")
    if(history.status!=="OFFICIAL_HISTORY_VERIFIED")throw Error("OFFICIAL_HISTORY_UNCONFIRMED")
    ctx.historyArchived=true
    const guard=await helper(ctx,"archive-guard")
    ctx.moves[routeProfile+".harness-lease"]=String(guard.destination)
    const csv=await helper(ctx,"cleanup-csv")
    if(csv.status!=="OWNED_CSV_REMOVED")throw Error("OWNED_STORAGE_UNCONFIRMED")
    ctx.csvRemoved=true
    const completion=await helper(ctx,"complete")
    if(completion.status!=="SETTLED"||typeof completion.evidence!=="string")throw Error("GENUINE_COMPLETION_UNCONFIRMED")
    await assertRouteEffect(ctx,"ordinary-release",routeStand+"/lab57-closed")
    // Ordinary release must acquire the same common guard itself. No source helper steals it.
    const last=await lstat(routeStand+"/operation")
    if(last.dev!==ctx.operation.device||last.ino!==ctx.operation.inode)throw Error("OPERATION_GUARD_CHANGED")
    await rmdir(routeStand+"/operation")
    const released=JSON.parse(await routeCommand(routeRoot+"/bin/bun",[sourceRoot+"/evals/script/node-eval-ops.ts","release","--config",routeConfig,"--lease",routeLease,"--evidence",completion.evidence],routeStand+"/lab57-closed")) as {status:string}
    if(released.status!=="RELEASED")throw Error("ORDINARY_RELEASE_UNCONFIRMED")
    const free=JSON.parse(await routeCommand(routeRoot+"/bin/bun",[sourceRoot+"/evals/script/node-eval-ops.ts","status","--config",routeConfig])) as {status:string}
    if(free.status!=="FREE")throw Error("FRESH_FREE_UNCONFIRMED")
    return {status:"RELEASED",stand:"FREE",originalOutcome:"ERROR",quality:"EXCLUDED",reviewCycle:2,sourceSha:a.sourceSha}
  } catch(error) {
    if(ctx.once)await writeRouteRecord(routeStand,`lab57-failure-${crypto.randomUUID()}.json`,{status:"BLOCKED",reason:String(error),onceSha256:ctx.once.sha256,
      originalOutcome:"ERROR",cleanup:"UNCONFIRMED",sourceSha:a.sourceSha})
    throw error
  } finally {
    const current=await lstat(routeStand+"/operation").catch(e=>{if(e.code==="ENOENT")return null;throw e})
    if(current&&current.dev===ctx.operation.device&&current.ino===ctx.operation.inode)await rmdir(routeStand+"/operation")
  }
}

async function snapshotClosedHistory(ctx:RouteContext) {
  await assertRouteEffect(ctx,"coherent-history-snapshot",routeStand+"/lab57-closed")
  const manifest=JSON.parse(await readFile(ctx.admission.historyInventory,"utf8")) as {files:{root:string;path:string;device:number;inode:number;bytes:number;sha256:string}[]}
  if(manifest.files.length!==28972)throw Error("ORIGINAL_HISTORY_COUNT_CHANGED")
  const root=routeStand+"/lab57-closed/snapshot"
  await mkdir(root,{mode:0o700})
  for(const f of manifest.files){
    if(!["eval-profile","eval-profile.history"].includes(f.root)||f.path.split("/").includes("..")||path.isAbsolute(f.path))throw Error("HISTORY_PATH_CHANGED")
    const original=path.join(path.dirname(routeProfile),f.root,f.path),destination=path.join(root,f.root,f.path)
    const before=await lstat(original,{bigint:true})
    if(before.isSymbolicLink()||!before.isFile()||Number(before.dev)!==f.device||Number(before.ino)!==f.inode||Number(before.size)!==f.bytes||await routeDigest(original)!==f.sha256)throw Error("ORIGINAL_HISTORY_CHANGED")
    await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await copyFile(original,destination,constants.COPYFILE_EXCL);await chmod(destination,0o600)
    const durable=await open(destination,constants.O_RDONLY|constants.O_NOFOLLOW);try{await durable.sync()}finally{await durable.close()}
    const after=await lstat(original,{bigint:true})
    if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs
      ||await routeDigest(destination)!==f.sha256||await routeDigest(original)!==f.sha256)throw Error("COHERENT_SNAPSHOT_RACE")
  }
  await syncSnapshotDirectories(root)
  await assertRouteEffect(ctx,"coherent-history-snapshot-after",routeStand+"/lab57-closed")
  const rows=JSON.parse(await routeCommand("/usr/bin/python3",[ctx.sourceRoot+"/evals/script/lab57-history-rows.py",root,routeRun+"/summary.json"],routeStand+"/lab57-closed")) as {assistantRows:number}
  if(rows.assistantRows!==77)throw Error("ACTUAL_77_ROWS_UNCONFIRMED")
  await writeRouteRecord(routeStand+"/lab57-closed","history-before.json",rows)
  await writeRouteRecord(routeStand+"/lab57-closed","snapshot.json",{status:"COHERENT_PRIVATE_SNAPSHOT",files:manifest.files,historyInventorySha:await routeDigest(ctx.admission.historyInventory)})
}

export async function runClosedNativeWorker(ctx:RouteContext) {
  if(!ctx.once||process.argv[1]!==ctx.sourceRoot+"/lab57-owned-route.mjs")throw Error("CLOSED_WORKER_BINDING_REQUIRED")
  const proof=routeStand+"/lab57-closed",diagnostic=proof+"/diagnostic",sessionDirectory=diagnostic+"/loginom/runtime/generations/1/chats/owned/attempts/closed-original"
  await assertRouteEffect(ctx,"create-managed-diagnostic",proof)
  const {createSession}=await import(pathToFileURL(routeCli+"/resources/loginom/runtime/client/lib/session.mjs").href) as
    {createSession(c:unknown,o:unknown):Promise<{directory:string;browserCli:string;browserConfig:string;metadata:{sessionId:string}}>}
  await assertRouteEffect(ctx,"create-managed-diagnostic-final",proof)
  const session=await createSession({stateDir:diagnostic,loginomUrl:"http://localhost/app/",agent:"trusted-operator",mode:"diagnostic",storageDirectories:[]},
    {headless:true,managed:{directory:sessionDirectory,browserRoot:routeCli+"/resources/loginom/browsers",browserPath:routeCli+"/resources/loginom/browsers/chromium-1243/chrome-linux64/chrome"}})
  const gate=async()=>admitClosedNative(ctx,"native-call",proof)
  const mcp=await connectDispatcherMcp(session,gate,{directory:sessionDirectory,sandbox:true})
  const call=async(code:string)=>{
    await gate()
    try{const raw=await mcp.callTool({name:"browser_run_code_unsafe",arguments:{code}})
      await writeRouteRecord(proof,`native-response-${crypto.randomUUID()}.json`,{at:new Date().toISOString(),codeSha256:createHash("sha256").update(code).digest("hex"),raw})
      return parseDispatcherResponse(raw)
    }catch(error){await writeRouteRecord(proof,`native-cause-${crypto.randomUUID()}.json`,{cause:String(error)});throw Error("NATIVE_CALL_UNCONFIRMED")}
  }
  let own:{observerKey:string;account:string}|null=null,failure:unknown=null
  try {
  const admin=await routePrivateJson<{account:string;password:string}>(ctx.admission.administratorFile)
  await call(`async page=>{if(page.url()!=='about:blank')throw Error('FRESH_PAGE_REQUIRED');await page.goto('http://localhost/app/');return {status:'OWN_PAGE_NAVIGATED'}}`)
  await call(`async page=>page.evaluate(({account,password})=>{const a=window.bg?.app?.Application?.FInstance,f=a?.FLogin?.FLogin;
    if(location.origin!=='http://localhost'||window.bg.app.Version!=='7.4.2'||!f||a.FServerConnection?.Connected===true||!f.Items.btnLogin.isVisible()||f.Items.btnLogin.isDisabled())throw Error('OWN_LOGIN_FORM_UNCONFIRMED');
    f.Items.edtUsername.setValue(account);f.Items.edtPassword.setValue(password);return {status:'OWN_LOGIN_FIELDS_SET'}},${JSON.stringify(admin)})`)
  await call(`async page=>{await page.evaluate(()=>{const a=window.bg?.app?.Application?.FInstance,f=a?.FLogin?.FLogin;
    if(!f||!f.Items.btnLogin.isVisible()||f.Items.btnLogin.isDisabled())throw Error('OWN_LOGIN_GESTURE_UNCONFIRMED');f.btnLoginHandler();});
    await page.waitForFunction(()=>window.bg?.app?.Application?.FInstance?.FServerConnection?.Connected===true,undefined,{timeout:60000});return {status:'OWN_LOGIN_OBSERVED'}}`)
  const inventory=await observeDispatcher(async request=>{await gate();return mcp.callTool(request)})
  const observer=inventory.sessions.find(s=>s.key===inventory.observer)!
  if(observer.name.split(":")[0]!==admin.account||observer.packages.length)throw Error("OWN_DIAGNOSTIC_BINDING_UNCONFIRMED")
  // The diagnostic never creates/restores a Loginom document or package; native observer proxy is its server identity.
  own={observerKey:observer.key,account:admin.account}
  await writeRouteRecord(proof,"diagnostic-owner.json",{...own,clientSessionId:session.metadata.sessionId,
    nativeDocument:"NOT_PRESENT_UNPREPARED_OBSERVER",emptyPackages:true})
  const journal=routeProfile+"/loginom/runtime/generations/1/chats/508b5bad6abd325d1273e6c9ac51b3771eeae66393792cc82b512b6f62ef5aaa/attempts/19b02f46-040a-416a-94e8-162917ce476e/execution-events.jsonl"
  const original=deriveOriginalBinding(await readFile(routeRun+"/txt-semicolon-cp1251-decimal/1/run.json"),await readFile(journal),
    await readFile(routeRun+"/txt-semicolon-cp1251-decimal/1/artifact/package.lgp"),"2026-10-07T09:05:53.309342637Z")
  await writeRouteRecord(proof,"original-binding.json",original)
  await runDispatcherBoundary(async request=>{await gate();const raw=await mcp.callTool(request);
    await writeRouteRecord(proof,`dispatcher-native-${crypto.randomUUID()}.json`,{at:new Date().toISOString(),codeSha256:createHash("sha256").update(request.arguments.code).digest("hex"),raw});return raw},original,proof,async()=>{await gate()})
  } catch(error) {failure=error;await writeRouteRecord(proof,`native-failure-${crypto.randomUUID()}.json`,{cause:String(error),status:"BLOCKED"})}
  // Only the independently observed empty diagnostic proxy may be logged out. Unsafe original target remains untouched.
  if(own)try {
  const logout=await call(`async page=>page.evaluate(async expected=>{const bg=window.bg,a=bg?.app?.Application?.FInstance,c=a?.FServerConnection;
    if(location.origin!=='http://localhost'||bg.app.Version!=='7.4.2'||!c?.Connected||c.UserName!==expected.account||!a.LogOut||window.__loginomDockPreparationV1)throw Error('OWN_LOGOUT_SCOPE_UNCONFIRMED');
    if(typeof window.safeCast!=='function')throw Error('OWN_LOGOUT_INTERFACE_UNCONFIRMED');const self=window.safeCast(c.ServerContainer.Session,bg.IBGDeductorSessionsManagerContainer);if(!self)throw Error('OWN_LOGOUT_INTERFACE_UNCONFIRMED');
    const m=await self.GetSessionsManager();await m.UpdateSessionInfos();let count=await m.Count,own=null;for(let i=0;i<count;i++){const s=await m.SessionInfo(i);if(await s.SessionType===1) {if(own)throw Error('OWN_LOGOUT_AMBIGUOUS');own=s;}}
    if(!own||(await bg.objectId(own)).toString()!==expected.observerKey||await own.Count!==0||count!==await m.Count)throw Error('OWN_LOGOUT_MEMBERSHIP_CHANGED');
    await a.LogOut();if(c.Connected===true||!a.FLogin||a.FServerConnection)throw Error('OWN_LOGOUT_NOT_OBSERVED');
    return {status:'OWN_DIAGNOSTIC_LOGGED_OUT',observerKey:expected.observerKey,account:expected.account,document:'NOT_PRESENT_UNPREPARED_OBSERVER',emptyPackages:true};
  },${JSON.stringify(own)})`)
  await writeRouteRecord(proof,"diagnostic-logout.json",logout)
  }catch(error){if(failure===null)failure=error;await writeRouteRecord(proof,`logout-failure-${crypto.randomUUID()}.json`,{cause:String(error)})}
  try {const close=await mcp.close();await writeRouteRecord(proof,"diagnostic-transport.json",close)}
  catch(error){if(failure===null)failure=error;await writeRouteRecord(proof,`transport-failure-${crypto.randomUUID()}.json`,{cause:String(error)})}
  if(failure!==null)throw failure
  return {status:"NATIVE_CESSATION_AND_OWN_LOGOUT_CONFIRMED"}
}

async function syncSnapshotDirectories(root:string):Promise<void> {
  for(const item of await readdir(root,{withFileTypes:true}))if(item.isDirectory())await syncSnapshotDirectories(path.join(root,item.name))
  const f=await open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await f.sync()}finally{await f.close()}
}

export type ClosedSettlement={operator?:import("./lab57-root-actor").RouteActor|{kind:"ben-task";task:string};operation:"LAB57-closed-owned-v1";originalOutcome:"ERROR";quality:"EXCLUDED";sourceSha:string;
  cessation:{status:string;ownerTask:string;originalOutcome:string;cleanup:string};logout:{status:string;observerKey:string;account:string;document:string;emptyPackages:boolean};
  process:{status:string;observation_mode:string;capture_complete:boolean;error:string|null;unknownProcesses:unknown[];verification:{owned_remaining:number;observed_at:string}[]};
  history:{status:string;assistantRows:number;model:string;originalRowsPreserved:boolean;coherentSnapshot:boolean};guard:{status:string};csv:{status:string}}
export function verifyClosedSettlement(s:ClosedSettlement) {
  if(s.operator&&s.operator.kind==="codex-coordinator"&&Object.entries(rootAuthority).some(([k,v])=>(s.operator as Record<string,unknown>)[k]!==v))throw Error("GENUINE_CLOSED_SETTLEMENT_REQUIRED")
  if(s.operation!=="LAB57-closed-owned-v1"||s.originalOutcome!=="ERROR"||s.quality!=="EXCLUDED"||!/^[0-9a-f]{40}$/.test(s.sourceSha)
    ||s.cessation?.status!=="SERVER_OWNERSHIP_SCOPE_CEASED"||s.cessation.ownerTask!=="01a1375d-ce4a-7c35-a3a3-94cf64a8b589"||s.cessation.originalOutcome!=="ERROR"||s.cessation.cleanup!=="UNCONFIRMED"
    ||s.logout?.status!=="OWN_DIAGNOSTIC_LOGGED_OUT"||!s.logout.observerKey||!s.logout.account||s.logout.account.toLowerCase()==="user"||s.logout.document!=="NOT_PRESENT_UNPREPARED_OBSERVER"||s.logout.emptyPackages!==true
    ||s.process?.status!=="confirmed"||s.process.observation_mode!=="continuous"||s.process.capture_complete!==true||s.process.error!==null
    ||!Array.isArray(s.process.unknownProcesses)||s.process.unknownProcesses.length||!Array.isArray(s.process.verification)||s.process.verification.length<2
    ||s.process.verification.slice(-2).some(p=>p.owned_remaining!==0||!Number.isFinite(Date.parse(p.observed_at)))
    ||Date.parse(s.process.verification.at(-1)!.observed_at)<=Date.parse(s.process.verification.at(-2)!.observed_at)
    ||s.history?.status!=="OFFICIAL_HISTORY_VERIFIED"||s.history.assistantRows!==77||s.history.model!=="openai/gpt-6-luna/high"
    ||s.history.originalRowsPreserved!==true||s.history.coherentSnapshot!==true||s.guard?.status!=="RECORD_ARCHIVED"||s.csv?.status!=="OWNED_CSV_REMOVED")throw Error("GENUINE_CLOSED_SETTLEMENT_REQUIRED")
}
