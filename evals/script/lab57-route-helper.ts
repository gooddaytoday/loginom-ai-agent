import path from "node:path"
import {mkdir,lstat,readFile,writeFile,open,readdir,copyFile,chmod,realpath} from "node:fs/promises"
import {constants} from "node:fs"
import {createHash} from "node:crypto"
import {assertNodeStandOwner,reserveNodeRecovery} from "../src/node-eval-ops"
import type {NodeOpsConfig,NodeStandLease,NodeStandCompletion} from "../src/node-eval-ops"
import {snapshotPrivateRecord,reserveRecordArchive,archiveReservedRecord} from "../src/lab57-record-archive"
import {archiveProfileHistory,recoverIfNeeded} from "../src/profile"
import {agentCommand} from "../src/cli"
import {loadConfig} from "../src/config"
import {superviseProcess} from "../src/process-supervisor"
import {verifyClosedProcessCapture} from "../src/lab57-native-capture"
import {verifyClosedSettlement} from "../src/lab57-closed-route"
import {verifyDispatcherCessation,stableDispatcherDecision} from "../src/lab57-dispatcher"
import type {DispatcherInventory,OriginalBinding} from "../src/lab57-dispatcher"
import {routeRoot,routeCli,routeNode,routeProfile,routeRun,routeStand,routeConfig,routeLease,routePrivateJson,routeDigest,routeBirth,writeRouteRecord,routeCommand} from "../src/lab57-route-host"
import type {RouteContext} from "../src/lab57-route-host"
import {ownedCsv} from "../src/lab57-route-admission"
const [stage,file]=process.argv.slice(2)
if(!["reserve","archive-registration","native","history","archive-guard","cleanup-csv","complete"].includes(stage??"")
  ||!file?.startsWith(routeStand+"/lab57-context-")||!file.endsWith(".json"))throw Error("CLOSED_HELPER_ARGUMENTS")
const ctx=await routePrivateJson<RouteContext>(file),root=routeStand+"/lab57-closed"
const config=await routePrivateJson<NodeOpsConfig>(routeConfig),lease=await routePrivateJson<NodeStandLease>(routeLease)
async function gate(){
  if(await routeBirth(ctx.controller.pid)!==ctx.controller.starttime||await realpath(`/proc/${ctx.controller.pid}/exe`)!==routeNode.path)throw Error("CLOSED_CONTROLLER_CHANGED")
  const admitted=JSON.parse(await routeCommand(routeNode.path,[ctx.sourceRoot+"/lab57-owned-route.mjs","admit-helper",file!],ctx.once?root:undefined)) as {status:string;sourceSha:string}
  if(admitted.status!=="ORIGINAL_OPERATION_ADMITTED"||admitted.sourceSha!==ctx.admission.sourceSha)throw Error("CLOSED_HELPER_ADMISSION_REFUSED")
  await assertNodeStandOwner(config,lease)
}
async function nativeEvidence(){
  const result=await routePrivateJson<{exitCode:number;processCleanup:import("../src/process-supervisor").ProcessCleanup}>(root+"/native-command.json")
  const p=result.processCleanup
  verifyClosedProcessCapture(p,routeNode,root+"/diagnostic/loginom/runtime/generations/1/chats/owned/attempts/closed-original",lease.acquiredAt)
  if(JSON.stringify(p)!==JSON.stringify(await routePrivateJson(root+"/native-capture/process-cleanup.json")))throw Error("RAW_NATIVE_CAPTURE_CHANGED")
  if(result.exitCode!==0||p.status!=="confirmed"||p.error||p.observation_mode!=="continuous"||!p.capture_complete||p.unknownProcesses?.length
    ||p.selectedCli?.executable!==routeNode.path||p.selectedCli.device!==routeNode.device||p.selectedCli.inode!==routeNode.inode
    ||p.verification?.length!==2||p.verification.some(v=>v.owned_remaining!==0)||p.admissions?.some(v=>v.status!=="allowed"))throw Error("GENUINE_NATIVE_PROCESS_PROOF_REQUIRED")
  const original=await routePrivateJson<OriginalBinding>(root+"/original-binding.json")
  const before=await routePrivateJson<{before:DispatcherInventory;fresh:DispatcherInventory}>(root+"/dispatcher-before.json")
  const after=await routePrivateJson<{actualBefore:DispatcherInventory;actualAfter:DispatcherInventory;post:DispatcherInventory}>(root+"/dispatcher-after.json").catch(e=>{if(e.code==="ENOENT")return null;throw e})
  const final=after?verifyDispatcherCessation(after.actualBefore,after.post,original,after.post.collectedAt):verifyDispatcherCessation(before.before,before.fresh,original,before.fresh.collectedAt)
  if(after)stableDispatcherDecision(after.actualAfter,after.post,original,after.post.collectedAt)
  const saved=await routePrivateJson<typeof final>(root+"/dispatcher-cessation.json")
  if(JSON.stringify(saved)!==JSON.stringify(final))throw Error("CESSATION_RECEIPT_CHANGED")
  const logout=await routePrivateJson<{status:string;observerKey:string;account:string;document:string;emptyPackages:boolean}>(root+"/diagnostic-logout.json")
  const own=await routePrivateJson<{observerKey:string;account:string}>(root+"/diagnostic-owner.json")
  if(logout.status!=="OWN_DIAGNOSTIC_LOGGED_OUT"||logout.observerKey!==final.observerKey||logout.observerKey!==own.observerKey||logout.account!==own.account||logout.account.toLowerCase()==="user"
    ||logout.document!=="NOT_PRESENT_UNPREPARED_OBSERVER"||logout.emptyPackages!==true)throw Error("GENUINE_OWN_LOGOUT_REQUIRED")
  return {process:p,cessation:final,logout}
}
await gate()
const result=await (async()=>{
  if(stage==="reserve"){
    if(ctx.once)throw Error("RECOVERY_ALREADY_ATTEMPTED")
    const receipt=await reserveNodeRecovery(config,lease,"LAB57-original-owned-dispatcher-v1")
    const s=await lstat(receipt)
    return {receipt,sha256:await routeDigest(receipt),device:s.dev,inode:s.ino,status:"ATTEMPTED",initialBytes:(await readFile(receipt)).toString("base64")}
  }
  if(!ctx.once)throw Error("ORIGINAL_OVERALL_ONCE_REQUIRED")
  if(stage==="archive-registration"||stage==="archive-guard"){
    if(stage==="archive-guard"){await nativeEvidence();if(!ctx.historyArchived||(await routePrivateJson<{status:string}>(root+"/history.json")).status!=="OFFICIAL_HISTORY_VERIFIED")throw Error("CESSATION_HISTORY_BEFORE_GUARD_REQUIRED")}
    const name=path.basename(routeProfile)+(stage==="archive-registration"?".process-group":".harness-lease"),parent=path.dirname(routeProfile),source=path.join(parent,name)
    const expected=await snapshotPrivateRecord(parent,source)
    await gate();const reserved=await reserveRecordArchive({root:parent,source,destination:source+".lab57-preserved",once:path.join(parent,"lab57-"+stage+".once"),expected})
    await gate();const archived=await archiveReservedRecord(reserved)
    await writeRouteRecord(root,stage+".json",{...archived,reservation:reserved})
    return archived
  }
  if(stage==="native"){
    await gate();await mkdir(root+"/native-capture",{mode:0o700})
    const r=await superviseProcess({cmd:[routeNode.path,ctx.sourceRoot+"/lab57-owned-route.mjs","worker",file!],cwd:ctx.sourceRoot+"/evals",
      env:{PATH:"/usr/local/bin:/usr/bin:/bin",HOME:"/home/user",TMPDIR:"/tmp",LOGINOM_AI_AGENT_CLI_BUNDLE:routeCli+"/resources/loginom"},
      profileDir:root+"/diagnostic",outDir:root+"/native-capture",timeoutMs:900000})
    await writeRouteRecord(root,"native-command.json",r)
    await nativeEvidence()
    return {status:"NATIVE_CESSATION_AND_OWN_LOGOUT_CONFIRMED"}
  }
  if(stage==="history"){
    await nativeEvidence()
    // Current-handle recovery is used ONLY after genuine original-scope cessation; never as that proof.
    const current=loadConfig(["--skip-judge","--repeat","1"],{...process.env,EVAL_CLI_MODE:"binary",EVAL_CLI_BIN:config.roles.ben.cliBin??config.cliBin,
      EVAL_PROFILE_DIR:routeProfile,EVAL_WORKSPACE_ROOT:config.roles.ben.workRoots[0],EVAL_RESULTS_DIR:config.roles.ben.resultsRoot,LOGINOM_URL:config.endpoint,
      LOGINOM_CONTAINER:config.container.name,LOGINOM_STORAGE_DIR:config.container.storageDir,EVAL_AGENT_MODEL:"openai/gpt-6-luna",EVAL_AGENT_VARIANT:"high"})
    await gate();await recoverIfNeeded({...agentCommand(current,process.env),cleanupDir:root+"/official-recovery",cleanupSecrets:[current.loginom.password,current.dock.apiKey,current.agent.provider?.apiKey??""]},2,gate)
    const history=await archiveProfileHistory(routeProfile,"lab57-original-owned",gate)
    // Copy the closed resulting history before normal SQLite reads; original files are never SQL-opened.
    await gate();const audit=root+"/after-history";await mkdir(audit,{mode:0o700})
    const databases=(await routeCommand("/usr/bin/find",[routeProfile+".history","-type","f","-name","loginom-ai-agent.db"],root)).trim().split("\n")
    for(const [index,db] of databases.entries()){
      const destination=audit+"/db-"+index;await mkdir(destination,{mode:0o700})
      for(const suffix of ["","-wal","-shm"]){const source=db+suffix;const s=await lstat(source).catch(e=>{if(e.code==="ENOENT")return null;throw e});if(!s)continue;
        const sha=await routeDigest(source);await copyFile(source,destination+"/"+path.basename(source),constants.COPYFILE_EXCL);await chmod(destination+"/"+path.basename(source),0o600)
        if(await routeDigest(source)!==sha||await routeDigest(destination+"/"+path.basename(source))!==sha)throw Error("OFFICIAL_HISTORY_COPY_RACE")}
    }
    const rows=JSON.parse(await routeCommand("/usr/bin/python3",[ctx.sourceRoot+"/evals/script/lab57-history-rows.py",audit,routeRun+"/summary.json"],root)) as {rows:unknown;assistantRows:number}
    const before=await routePrivateJson<{rows:unknown}>(root+"/history-before.json")
    if(rows.assistantRows!==77||JSON.stringify(rows.rows)!==JSON.stringify(before.rows))throw Error("ORIGINAL_MESSAGE_ROWS_CHANGED")
    const proof={status:"OFFICIAL_HISTORY_VERIFIED",historyArchive:history,assistantRows:77,model:"openai/gpt-6-luna/high",originalRowsPreserved:true,coherentSnapshot:true,
      beforeSha:await routeDigest(root+"/history-before.json"),snapshotSha:await routeDigest(root+"/snapshot.json"),rows,archiveFiles:await historyFiles(routeProfile+".history")}
    await writeRouteRecord(root,"history.json",proof);return proof
  }
  if(stage==="cleanup-csv"){
    await nativeEvidence();if(!ctx.historyArchived||!ctx.moves[routeProfile+".harness-lease"])throw Error("GUARD_HISTORY_BEFORE_CSV_REQUIRED")
    const script="import os,hashlib; p='"+ownedCsv.path+"'; h=os.open(p,os.O_RDONLY|os.O_NOFOLLOW); s=os.fstat(h); assert f'{s.st_dev}:{s.st_ino}:{s.st_size}:{s.st_mode:x}'=='"+ownedCsv.identity+"'; assert hashlib.sha256(os.read(h,1000000)).hexdigest()=='"+ownedCsv.sha256+"'; t=os.lstat(p); assert (t.st_dev,t.st_ino,t.st_ctime_ns)==(s.st_dev,s.st_ino,s.st_ctime_ns); os.unlink(p); os.fsync(os.open(os.path.dirname(p),os.O_RDONLY|os.O_DIRECTORY)); os.close(h)"
    await gate();await routeCommand("/usr/bin/docker",["exec",lease.containerId,"python3","-c",script],root)
    // No other removal, lock claim, broad glob or foreign package operation.
    const proof={status:"OWNED_CSV_REMOVED",...ownedCsv,containerId:lease.containerId}
    await writeRouteRecord(root,"storage.json",proof);return proof
  }
  if(stage==="complete"){
    if(!ctx.csvRemoved||!ctx.historyArchived)throw Error("CLOSED_SEQUENCE_INCOMPLETE")
    const native=await nativeEvidence(),history=await routePrivateJson<import("../src/lab57-closed-route").ClosedSettlement["history"] & {historyArchive:string}>(root+"/history.json")
    const guard=await routePrivateJson<{status:string}>(root+"/archive-guard.json"),csv=await routePrivateJson<{status:string}>(root+"/storage.json")
    const attestation={operation:"LAB57-closed-owned-v1" as const,sourceSha:ctx.admission.sourceSha,originalOutcome:"ERROR" as const,quality:"EXCLUDED" as const,...native,
      process:{...native.process,observation_mode:native.process.observation_mode!,error:native.process.error!,unknownProcesses:native.process.unknownProcesses!,verification:native.process.verification!},history,guard,csv}
    verifyClosedSettlement(attestation)
    const proof=await writeRouteRecord(root,"attestation.json",{...attestation,context:ctx,files:await proofFiles(root)})
    const once=await routePrivateJson<{reservation:{receipt:string}}>(ctx.once.path),receipt=once.reservation.receipt
    const owner={issue:lease.issue,task:lease.task,role:lease.role,phase:lease.phase,sha:lease.sha}
    await gate();const f=await open(receipt,constants.O_WRONLY|constants.O_NOFOLLOW)
    try{const identity=await f.stat(),reservation=await routePrivateJson<{reservation:{device:number;inode:number}}>(ctx.once.path)
      if(identity.dev!==reservation.reservation.device||identity.ino!==reservation.reservation.inode||identity.nlink!==1)throw Error("ORIGINAL_RECOVERY_RESERVATION_CHANGED")
      await f.truncate(0);await f.writeFile(JSON.stringify({owner,acquiredAt:lease.acquiredAt,status:"SETTLED",profile:"eval",historyArchive:history.historyArchive,
        processEvidence:root+"/native-command.json",operation:"LAB57-closed-owned-v1",attestation:proof,attestationSha256:await routeDigest(proof)}));await f.sync()
    }finally{await f.close()}
    const completion:NodeStandCompletion={version:1,owner,acquiredAt:lease.acquiredAt,kind:"recovery",receipt,profile:"eval",historyArchive:history.historyArchive,processEvidence:root+"/native-command.json"}
    const evidence=await writeRouteRecord(routeStand,"lab57-recovery-completion.json",completion)
    return {status:"SETTLED",evidence}
  }
  throw Error("CLOSED_HELPER_STAGE_UNKNOWN")
})()
console.log(JSON.stringify(result))

async function proofFiles(directory:string):Promise<{path:string;sha256:string}[]> {
  const out:{path:string;sha256:string}[]=[]
  for(const item of await readdir(directory,{withFileTypes:true})){
    if(item.name==="diagnostic"||item.name==="snapshot"||item.name==="after-history")continue
    const f=path.join(directory,item.name)
    if(item.isSymbolicLink())throw Error("PRIVATE_PROOF_LINK")
    if(item.isFile())out.push({path:f,sha256:await routeDigest(f)})
    if(item.isDirectory())out.push(...await proofFiles(f))
  }
  return out
}

async function historyFiles(directory:string):Promise<{path:string;sha256:string;device:number;inode:number;bytes:number}[]> {
  const out:{path:string;sha256:string;device:number;inode:number;bytes:number}[]=[]
  for(const item of await readdir(directory,{withFileTypes:true})){
    const f=path.join(directory,item.name)
    if(item.isSymbolicLink())throw Error("OFFICIAL_HISTORY_LINK")
    if(item.isFile()){const s=await lstat(f);out.push({path:f,sha256:await routeDigest(f),device:s.dev,inode:s.ino,bytes:s.size})}
    if(item.isDirectory())out.push(...await historyFiles(f))
  }
  return out
}
