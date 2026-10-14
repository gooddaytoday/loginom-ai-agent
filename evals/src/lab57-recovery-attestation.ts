import path from "node:path"
import {verifyOperatorContinuity} from "./lab57-root-actor"
import {lstat,readFile,open} from "node:fs/promises"
import {createHash} from "node:crypto"
import {routeRoot,routeStand,routeProfile,routeRun,routeNode,routeConfig,routeDigest,routePrivateJson,verifyRouteSources,verifyControllerNode} from "./lab57-route-host"
import type {RouteContext} from "./lab57-route-host"
import {lab57CleanupScope} from "./lab57-cleanup-proposal"
import {verifyClosedSettlement} from "./lab57-closed-route"
import type {ClosedSettlement} from "./lab57-closed-route"
import {verifyClosedProcessCapture} from "./lab57-native-capture"
import {groupProcesses} from "./process-group"
import {verifyDispatcherCessation,stableDispatcherDecision,deriveOriginalBinding} from "./lab57-dispatcher"
import type {DispatcherInventory,OriginalBinding} from "./lab57-dispatcher"
import type {NodeOpsConfig,NodeStandLease,NodeStandCompletion} from "./node-eval-ops"

/** Additional incident-specific proof, BEFORE the unchanged ordinary release gates. No writer-error eligibility is widened. */
export async function verifyLab57Recovery(config:NodeOpsConfig,lease:NodeStandLease,completion:Extract<NodeStandCompletion,{kind:"recovery"}>) {
  if(config.runtimeRoot!==routeRoot||lease.issue!==lab57CleanupScope.issue||lease.task!==lab57CleanupScope.task||lease.role!=="ben"||lease.phase!=="eval"
    ||lease.sha!==lab57CleanupScope.sha||lease.acquiredAt!==lab57CleanupScope.acquiredAt||lease.configSha256!==lab57CleanupScope.configSha256
    ||completion.profile!=="eval"||completion.execution!==undefined||completion.processEvidence!==routeStand+"/lab57-closed/native-command.json")throw Error("LAB57_ORIGINAL_RECOVERY_ONLY")
  const root=routeStand+"/lab57-closed"
  const receipt=await routePrivateJson<{operation:string;attestation:string;attestationSha256:string;status:string}>(completion.receipt)
  if(receipt.operation!=="LAB57-closed-owned-v1"||receipt.status!=="SETTLED"||receipt.attestation!==root+"/attestation.json"
    ||await routeDigest(receipt.attestation)!==receipt.attestationSha256)throw Error("LAB57_ATTESTATION_UNKNOWN")
  const a=await routePrivateJson<ClosedSettlement&{context:RouteContext;files:{path:string;sha256:string}[]}>(receipt.attestation)
  verifyClosedSettlement(a)
  const ctx=a.context
  verifyOperatorContinuity(a.operator,ctx.admission)
  if(!ctx.once||ctx.once.path!==routeStand+"/lab57-closed.once.json"||await routeDigest(ctx.once.path)!==ctx.once.sha256
    ||ctx.csvRemoved!==true||ctx.historyArchived!==true||ctx.sourceRoot!==routeRoot+"/support/evalrunner-"+a.sourceSha
    ||ctx.admission.sourceSha!==a.sourceSha||process.argv[1]!==ctx.sourceRoot+"/evals/script/node-eval-ops.ts")throw Error("LAB57_SOURCE_LIFECYCLE_UNKNOWN")
  await verifyRouteSources(ctx.admission,ctx.sourceRoot)
  await verifyControllerNode(ctx)
  if(await routeDigest(routeStand+"/owner.json")!==lab57CleanupScope.raw_owner_sha256||await routeDigest(routeConfig)!==lab57CleanupScope.raw_config_sha256)throw Error("LAB57_ORIGINAL_OWNER_CHANGED")
  const once=await routePrivateJson<{operator:unknown;observerBindingSha256:string;reservation:{receipt:string;device:number;inode:number;sha256:string;initialBytes:string};sourceSha:string;sourceManifestSha:string;
    acquiredAt:string;controller:RouteContext["controller"];operation:RouteContext["operation"]}>(ctx.once.path)
  verifyOperatorContinuity(once.operator,ctx.admission)
  if(once.observerBindingSha256!==ctx.admission.observerBindingSha256)throw Error("LAB57_ORIGINAL_ONCE_CHANGED")
  const stat=await lstat(ctx.once.path,{bigint:true}),rstat=await lstat(completion.receipt)
  const key=createHash("sha256").update(`${lease.token}:${lease.issue}:${lease.task}:${lease.acquiredAt}`).digest("hex")
  if(Number(stat.dev)!==ctx.once.device||Number(stat.ino)!==ctx.once.inode||String(stat.mtimeNs)!==ctx.once.mtimeNs||String(stat.ctimeNs)!==ctx.once.ctimeNs
    ||completion.receipt!==routeRoot+"/operations/recovery-incidents/"+key+".json"||once.reservation.receipt!==completion.receipt
    ||rstat.dev!==once.reservation.device||rstat.ino!==once.reservation.inode||rstat.nlink!==1||once.sourceSha!==a.sourceSha
    ||once.sourceManifestSha!==ctx.admission.sourceManifestSha||once.acquiredAt!==lease.acquiredAt||JSON.stringify(once.controller)!==JSON.stringify(ctx.controller)
    ||JSON.stringify(once.operation)!==JSON.stringify(ctx.operation))throw Error("LAB57_ORIGINAL_ONCE_CHANGED")
  const initial=Buffer.from(once.reservation.initialBytes,"base64")
  if(createHash("sha256").update(initial).digest("hex")!==once.reservation.sha256)throw Error("LAB57_INITIAL_RESERVATION_CHANGED")
  const reservation=JSON.parse(initial.toString()) as {status:string;acquiredAt:string;incident:string;owner:{issue:string;task:string;sha:string}}
  if(reservation.status!=="ATTEMPTED"||reservation.acquiredAt!==lease.acquiredAt||reservation.owner.issue!==lease.issue||reservation.owner.task!==lease.task
    ||reservation.owner.sha!==lease.sha||reservation.incident!=="LAB57-original-owned-dispatcher-v1")throw Error("LAB57_INITIAL_RESERVATION_UNKNOWN")
  if(!Array.isArray(a.files)||!a.files.length||new Set(a.files.map(f=>f.path)).size!==a.files.length)throw Error("LAB57_PROOF_MANIFEST_UNKNOWN")
  for(const f of a.files){if(!f.path.startsWith(root+"/")||await routeDigest(f.path)!==f.sha256)throw Error("LAB57_PROOF_BYTES_CHANGED")}
  for(const name of ["native-capture/process-cleanup.json","native-command.json","diagnostic-owner.json","diagnostic-logout.json","diagnostic-transport.json","original-binding.json","dispatcher-before.json","dispatcher-cessation.json","history-before.json","history.json","snapshot.json","archive-registration.json","archive-guard.json","storage.json"])
    if(!a.files.some(f=>f.path===root+"/"+name))throw Error("LAB57_CRITICAL_PROOF_MISSING")
  const before=await routePrivateJson<{before:DispatcherInventory;fresh:DispatcherInventory}>(root+"/dispatcher-before.json")
  const after=await routePrivateJson<{actualBefore:DispatcherInventory;actualAfter:DispatcherInventory;post:DispatcherInventory}>(root+"/dispatcher-after.json").catch(e=>{
    if(e.code==="ENOENT")return null;throw e})
  const binding=deriveOriginalBinding(await readFile(routeRun+"/txt-semicolon-cp1251-decimal/1/run.json"),
    await readFile(root+"/snapshot/eval-profile/loginom/runtime/generations/1/chats/508b5bad6abd325d1273e6c9ac51b3771eeae66393792cc82b512b6f62ef5aaa/attempts/19b02f46-040a-416a-94e8-162917ce476e/execution-events.jsonl"),
    await readFile(routeRun+"/txt-semicolon-cp1251-decimal/1/artifact/package.lgp"),"2026-10-07T09:05:53.309342637Z")
  if(JSON.stringify(binding)!==JSON.stringify(await routePrivateJson<OriginalBinding>(root+"/original-binding.json")))throw Error("LAB57_ORIGINAL_BINDING_CHANGED")
  const cessation=after?verifyDispatcherCessation(after.actualBefore,after.post,binding,after.post.collectedAt):verifyDispatcherCessation(before.before,before.fresh,binding,before.fresh.collectedAt)
  if(after)stableDispatcherDecision(after.actualAfter,after.post,binding,after.post.collectedAt)
  if(JSON.stringify(cessation)!==JSON.stringify(a.cessation))throw Error("LAB57_CESSATION_CHANGED")
  const native=await routePrivateJson<{processCleanup:import("./process-supervisor").ProcessCleanup;exitCode:number}>(completion.processEvidence)
  verifyClosedProcessCapture(native.processCleanup,routeNode,root+"/diagnostic/loginom/runtime/generations/1/chats/owned/attempts/closed-original",lease.acquiredAt)
  if(native.exitCode!==0||native.processCleanup.selectedCli?.executable!==routeNode.path||native.processCleanup.selectedCli.device!==routeNode.device
    ||native.processCleanup.selectedCli.inode!==routeNode.inode||native.processCleanup.admissions?.some(p=>p.status!=="allowed")
    ||JSON.stringify({...native.processCleanup})!==JSON.stringify(a.process))throw Error("LAB57_NATIVE_CAPTURE_CHANGED")
  if(JSON.stringify(native.processCleanup)!==JSON.stringify(await routePrivateJson(root+"/native-capture/process-cleanup.json")))throw Error("LAB57_RAW_CAPTURE_CHANGED")
  const own=await routePrivateJson<{observerKey:string;account:string;nativeDocument:string;emptyPackages:boolean}>(root+"/diagnostic-owner.json")
  const logout=await routePrivateJson<ClosedSettlement["logout"]>(root+"/diagnostic-logout.json")
  const transport=await routePrivateJson<{browserTransportClosed:boolean;browserProcessTerminated:boolean}>(root+"/diagnostic-transport.json")
  if(JSON.stringify(logout)!==JSON.stringify(a.logout)||own.observerKey!==cessation.observerKey||own.observerKey!==logout.observerKey||own.account!==logout.account
    ||own.nativeDocument!=="NOT_PRESENT_UNPREPARED_OBSERVER"||own.emptyPackages!==true||transport.browserTransportClosed!==true||transport.browserProcessTerminated!==true)throw Error("LAB57_OWN_DIAGNOSTIC_CHANGED")
  for(const group of new Set(native.processCleanup.processes.map(p=>p.group)))if((await groupProcesses(group)).length)throw Error("LAB57_PROCESSES_BUSY")
  const originalHashes={"summary.json":"93a750552ae7bfb97697e7e4563f1fd1b0ee046ca4a3018048bb632386985058","code-verdict.json":"b832669145a229999b39d02f293a2e0300ea9466c7e4beae6bbdcae5a2c2bf10",
    "txt-semicolon-cp1251-decimal/1/cleanup.json":"1ef7a1544f4a779bcf9648300a3afa081953cf2eaa7ecda90c35769fb31862f1"}
  for(const [name,sha] of Object.entries(originalHashes))if(await routeDigest(path.join(routeRun,name))!==sha)throw Error("LAB57_ORIGINAL_ERROR_CHANGED")
  const snapshot=await routePrivateJson<{historyInventorySha:string;files:{root:string;path:string;sha256:string}[]}>(root+"/snapshot.json")
  if(snapshot.historyInventorySha!=="c40d6b1bfe6742a5d9b8ca695cb3e7c31754765f8f21e44ce488af034b4f38b0"||snapshot.files.length!==28972
    ||await routeDigest(ctx.admission.historyInventory)!==snapshot.historyInventorySha)throw Error("LAB57_COHERENT_HISTORY_UNKNOWN")
  const original=JSON.parse(await readFile(ctx.admission.historyInventory,"utf8")) as {files:unknown[]}
  if(JSON.stringify(snapshot.files)!==JSON.stringify(original.files))throw Error("LAB57_HISTORY_MANIFEST_CHANGED")
  for(const f of snapshot.files){if(!["eval-profile","eval-profile.history"].includes(f.root)||f.path.split("/").includes("..")
    ||await routeDigest(path.join(root,"snapshot",f.root,f.path))!==f.sha256)throw Error("LAB57_PROTECTED_HISTORY_CHANGED")}
  const old=await routePrivateJson<{rows:unknown}>(root+"/history-before.json"),history=await routePrivateJson<{rows:{rows:unknown};historyArchive:string;archiveFiles:{path:string;sha256:string;device:number;inode:number;bytes:number}[]}>(root+"/history.json")
  if(history.historyArchive!==completion.historyArchive||!completion.historyArchive.startsWith(routeProfile+".history/lab57-original-owned-")
    ||JSON.stringify(old.rows)!==JSON.stringify(history.rows.rows))throw Error("LAB57_77_ROWS_CHANGED")
  if(!Array.isArray(history.archiveFiles)||history.archiveFiles.length<25965)throw Error("LAB57_OFFICIAL_HISTORY_MANIFEST_MISSING")
  for(const f of history.archiveFiles){const stat=await lstat(f.path);if(!f.path.startsWith(routeProfile+".history/")||stat.dev!==f.device||stat.ino!==f.inode||stat.size!==f.bytes||await routeDigest(f.path)!==f.sha256)throw Error("LAB57_OFFICIAL_HISTORY_BYTES_CHANGED")}
  const {snapshotPrivateRecord}=await import("./lab57-record-archive")
  for(const [stage,suffix] of [["archive-registration",".process-group"],["archive-guard",".harness-lease"]] as const){
    const proof=await routePrivateJson<{status:string;destination:string;reservation:{root:string;source:string;destination:string;once:string;onceSha256:string;expected:import("./lab57-record-archive").PrivateRecordEntry[]}}>(root+"/"+stage+".json")
    const r=proof.reservation
    if(proof.status!=="RECORD_ARCHIVED"||r.root!==path.dirname(routeProfile)||r.source!==routeProfile+suffix||r.destination!==routeProfile+suffix+".lab57-preserved"
      ||proof.destination!==r.destination||r.once!==path.dirname(routeProfile)+"/lab57-"+stage+".once"||await routeDigest(r.once)!==r.onceSha256)throw Error("LAB57_ARCHIVE_RESERVATION_CHANGED")
    const actual=await snapshotPrivateRecord(r.root,r.destination),oldRoot=r.expected.find(f=>f.name===".")
    if(!oldRoot||JSON.stringify(actual.map(f=>f.name==="."?{...f,ctimeNs:oldRoot.ctimeNs}:f))!==JSON.stringify(r.expected))throw Error("LAB57_ARCHIVED_IDENTITY_CHANGED")
const archive=routeProfile+suffix+".lab57-preserved"
    if(ctx.moves[routeProfile+suffix]!==archive)throw Error("LAB57_EXACT_ARCHIVE_CHANGED")
    await lstat(routeProfile+suffix).then(()=>{throw Error("LAB57_OWNED_MARKER_PRESENT")},e=>{if(e.code!=="ENOENT")throw e})
    if(await realpathPrivate(archive)!==archive)throw Error("LAB57_ARCHIVE_PATH_CHANGED")}
}

async function realpathPrivate(file:string){const {realpath}=await import("node:fs/promises");return realpath(file)}
