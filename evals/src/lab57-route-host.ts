import path from "node:path"
import {constants,createReadStream} from "node:fs"
import {lstat,open,readFile,readdir,readlink,realpath} from "node:fs/promises"
import {createHash} from "node:crypto"
import {execFile} from "node:child_process"
import {promisify} from "node:util"
import protectedOriginals from "../test/fixtures/lab57-cleanup-proposal/protected-originals.json"
import {lab57CleanupScope} from "./lab57-cleanup-proposal"
import {verifyNodeIdentity} from "./lab57-node-identity"
import {validateFreshRouteState} from "./lab57-route-admission"
import type {FreshRouteState} from "./lab57-route-admission"

export const routeRoot="/home/user/.local/share/loginom-evals-runtime"
export const routeCli=routeRoot+"/cli-rich-startup-proposal-d6fc9c9b7b499d0a182c972815913b541e4cb81b"
export const routeProfile=routeRoot+"/roles/ben/eval-profile"
export const routeStand=routeRoot+"/operations/stand.lease"
export const routeConfig=routeRoot+"/roles/ben/agent-work/lab57-eb1-independent/node-eval-ops.json"
export const routeLease=routeRoot+"/roles/ben/agent-work/lab57-eb1-independent/stand-lease.json"
export const routeRun=routeRoot+"/roles/ben/results/lab57-eb1-independent/20261013-225027-eb1c2b0da"
export const routeNode={path:routeCli+"/resources/loginom/bin/node",device:64512,inode:3840497,bytes:125989464,
  sha256:"bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12"}
export type RouteAdmission={version:1;operation:"LAB57-closed-owned-v1";decision:"FINAL_OPERATOR_ADMITTED";sourceSha:string;
  sourceManifestSha:string;executableSha:string;followupTask:string;administratorFile:string;administratorSha:string;
  historyInventory:string;canonicalVerificationSha:string}
export type RouteContext={admission:RouteAdmission;sourceRoot:string;operation:{device:number;inode:number};once?:{path:string;sha256:string};
  controller:{pid:number;starttime:string};moves:Record<string,string>;csvRemoved:boolean;historyArchived:boolean}
export async function routeDigest(file:string) {
  const before=await lstat(file,{bigint:true}),hash=createHash("sha256")
  if(before.isSymbolicLink()||!before.isFile())throw Error("SOURCE_FILE_TYPE_CHANGED")
  const opened=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW)
  try {const info=await opened.stat({bigint:true});if(info.dev!==before.dev||info.ino!==before.ino)throw Error("SOURCE_OPEN_RACE")
    for await(const part of opened.createReadStream({autoClose:false}))hash.update(part)
  }finally{await opened.close()}
  const after=await lstat(file,{bigint:true})
  if(["dev","ino","size","mtimeNs","ctimeNs"].some(k=>before[k as keyof typeof before]!==after[k as keyof typeof after]))throw Error("SOURCE_FILE_RACE")
  return hash.digest("hex")
}
export async function routePrivateJson<T>(file:string):Promise<T> {
  if(await realpath(file)!==file)throw Error("PRIVATE_PATH_REQUIRED")
  const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW)
  try {const s=await h.stat();if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid!()||(s.mode&0o777)!==0o600)throw Error("PRIVATE_FILE_REQUIRED")
    return JSON.parse(await h.readFile("utf8")) as T
  } finally {await h.close()}
}
export async function writeRouteRecord(root:string,name:string,value:unknown) {
  if(!/^[a-z0-9.-]+$/.test(name) || await realpath(root)!==root)throw Error("PRIVATE_RECORD_PATH")
  const dir=await lstat(root)
  if(!dir.isDirectory()||dir.uid!==process.getuid!()||(dir.mode&0o777)!==0o700)throw Error("PRIVATE_RECORD_ROOT")
  const parent=await open(root,constants.O_DIRECTORY|constants.O_RDONLY|constants.O_NOFOLLOW)
  try {const p=await parent.stat();if(p.dev!==dir.dev||p.ino!==dir.ino)throw Error("PRIVATE_RECORD_RACE")
    const h=await open(`/proc/self/fd/${parent.fd}/${name}`,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
    try {await h.writeFile(JSON.stringify(value,null,2)+"\n");await h.sync()}finally{await h.close()}
    await parent.sync();const after=await lstat(root);if(after.dev!==dir.dev||after.ino!==dir.ino)throw Error("PRIVATE_RECORD_RACE")
  } finally {await parent.close()}
  return path.join(root,name)
}
export async function routeCommand(cmd:string,args:string[],diagnostics?:string) {
  try {return (await promisify(execFile)(cmd,args,{encoding:"utf8",maxBuffer:128*1024*1024,timeout:120000,
    env:{PATH:"/usr/local/bin:/usr/bin:/bin",TMPDIR:"/tmp",HOME:"/home/user"}})).stdout}
  catch(error){if(diagnostics)await writeRouteRecord(diagnostics,`command-cause-${crypto.randomUUID()}.json`,
    {command:path.basename(cmd),cause:String(error),stderr:(error as {stderr?:string}).stderr});throw Error("OWNED_COMMAND_FAILED")}
}
async function verifyPin(root:string,name:string,expected:string) {
  if(await routeDigest(path.join(root,name))!==expected)throw Error("SOURCE_MANIFEST_CHANGED")
  const m=JSON.parse(await readFile(path.join(root,name),"utf8")) as {files:{path:string;sha256:string;link?:string}[]}
  if(!Array.isArray(m.files)||new Set(m.files.map(f=>f.path)).size!==m.files.length)throw Error("SOURCE_MANIFEST_INVALID")
  for(const f of m.files){const p=path.join(root,f.path);if(!p.startsWith(root+"/")||f.path.split("/").includes(".."))throw Error("SOURCE_PATH_CHANGED")
    if(f.link!==undefined){if(!(await lstat(p)).isSymbolicLink()||await readlink(p)!==f.link)throw Error("SOURCE_LINK_CHANGED")}
    else if(await routeDigest(p)!==f.sha256)throw Error("SOURCE_BYTES_CHANGED")}
}
export async function verifyRouteSources(a:RouteAdmission,sourceRoot:string) {
  if(a.version!==1||a.operation!=="LAB57-closed-owned-v1"||a.decision!=="FINAL_OPERATOR_ADMITTED"||!/^[0-9a-f]{40}$/.test(a.sourceSha)
    || !/^[0-9a-f]{64}$/.test(a.sourceManifestSha)||!/^[0-9a-f]{64}$/.test(a.executableSha)|| !/^[0-9a-f-]{36}$/.test(a.followupTask)
    || a.canonicalVerificationSha!=="d0a88e88421acc203fb7917050e4b7bbfe00bd59345d6f717a3b0c2af27faa35"
    || sourceRoot!==routeRoot+"/support/evalrunner-"+a.sourceSha)throw Error("FINAL_SOURCE_ADMISSION_REQUIRED")
  await verifyPin(sourceRoot,"manifest.json",a.sourceManifestSha)
  const source=JSON.parse(await readFile(sourceRoot+"/manifest.json","utf8")) as {sourceCommit:string;sourceDirty:boolean}
  if(source.sourceCommit!==a.sourceSha||source.sourceDirty!==false||await routeDigest(sourceRoot+"/lab57-owned-route.mjs")!==a.executableSha)throw Error("FINAL_SOURCE_PIN_CHANGED")
  await verifyPin(routeCli,"cli-manifest.json","71a239098deec163333f2d3515f3ba252144ae10f87d5c7ee6a81926541c1b98")
  await verifyPin(routeRoot+"/support/evalrunner-0fd20f7c7e36724ca78a58bb8f9085b78884a87b","manifest.json","760017f84ae1ebe8144a512243e3e80812db4b757b2407c2c24d82fec2671e5b")
  await verifyPin(routeRoot+"/support/evalrunner-89b416c257a43a187edef4c40b68f3c9b1fa4d53","manifest.json","a42974ffd939bac48f894c8bc8d0f913a2034a54af6761ff7948117a523f4ab1")
  if((await routeCommand("/usr/bin/git",["-C",routeRoot+"/checkouts/ben/loginom-ai-agent","rev-parse","HEAD"])).trim()!==lab57CleanupScope.sha
    || (await routeCommand("/usr/bin/git",["-C",routeRoot+"/checkouts/ben/loginom-ai-agent","status","--porcelain"])).trim())throw Error("FROZEN_CHANGED")
}
export async function routeBirth(pid:number) {const raw=await readFile(`/proc/${pid}/stat`,"utf8");return raw.slice(raw.lastIndexOf(")")+2).split(" ")[19]!}
export async function verifyRouteOwner(ctx:RouteContext) {
  const current=await routePrivateJson<Record<string,unknown>>(routeStand+"/owner.json")
  if(Object.entries(lab57CleanupScope).filter(([k])=>!k.startsWith("raw_")).some(([k,v])=>current[k]!==v)
    ||await routeDigest(routeStand+"/owner.json")!==lab57CleanupScope.raw_owner_sha256||await routeDigest(routeConfig)!==lab57CleanupScope.raw_config_sha256)
    throw Error("ORIGINAL_OWNER_CONFIG_CHANGED")
  const stand=await lstat(routeStand),op=await lstat(routeStand+"/operation")
  if(stand.dev!==lab57CleanupScope.device||stand.ino!==lab57CleanupScope.inode||stand.uid!==process.getuid!()||(stand.mode&0o777)!==0o700
    ||op.dev!==ctx.operation.device||op.ino!==ctx.operation.inode||op.uid!==process.getuid!()||(op.mode&0o777)!==0o700
    ||await routeBirth(ctx.controller.pid)!==ctx.controller.starttime)throw Error("ORIGINAL_OPERATION_GUARD_CHANGED")
  const cfg=await routePrivateJson<{roles:Record<string,{referenceProfile?:string;evalProfile:string}>}>(routeConfig)
  const admission=await routePrivateJson<{owner:Record<string,unknown>;acquiredAt:string;containerId:string;configSha256:string;profiles:string[]}>(routeStand+"/admission.json")
  if(["issue","task","role","phase","sha"].some(k=>admission.owner[k]!==current[k])||admission.acquiredAt!==current.acquiredAt
    ||admission.containerId!==current.containerId||admission.configSha256!==current.configSha256
    ||JSON.stringify(admission.profiles)!==JSON.stringify(Object.values(cfg.roles).flatMap(r=>[...(r.referenceProfile?[r.referenceProfile]:[]),r.evalProfile])))throw Error("ORIGINAL_COMMON_ADMISSION_CHANGED")
  const lease=await routePrivateJson<Record<string,unknown>>(routeLease)
  if(Object.keys(lease).some(k=>lease[k]!==current[k]))throw Error("ORIGINAL_LEASE_HANDLE_CHANGED")
  if(ctx.once){if(await routeDigest(ctx.once.path)!==ctx.once.sha256)throw Error("ORIGINAL_ONCE_CHANGED")
    const once=await routePrivateJson<{controller:RouteContext["controller"];operation:RouteContext["operation"]}>(ctx.once.path)
    if(JSON.stringify(once.controller)!==JSON.stringify(ctx.controller)||JSON.stringify(once.operation)!==JSON.stringify(ctx.operation))throw Error("ORIGINAL_ONCE_BINDING_CHANGED")}
  for(const [file,sha] of Object.entries(protectedOriginals.original_hashes)) {
    const replacement=Object.entries(ctx.moves).find(([old])=>file===old||file.startsWith(old+"/"))
    const actual=replacement?replacement[1]+file.slice(replacement[0].length):file
    if(await routeDigest(actual)!==sha)throw Error("PROTECTED_ORIGINAL_CHANGED")
  }
  for(const name of ["registration","guard","guard_owner"] as const){const r=protectedOriginals[name],m=Object.entries(ctx.moves).find(([old])=>r.path===old||r.path.startsWith(old+"/")),p=m?m[1]+r.path.slice(m[0].length):r.path;
    const s=await lstat(p,{bigint:true});if(Number(s.dev)!==r.device||Number(s.ino)!==r.inode||Number(s.uid)!==r.uid||Number(s.size)!==r.size
      ||Number(s.mode&0o777n)!==r.mode||s.isSymbolicLink()||s.mtimeNs.toString()!==r.mtimeNs||!m&&s.ctimeNs.toString()!==r.ctimeNs)throw Error("ORIGINAL_RECORD_IDENTITY_CHANGED")}
}
/** Concrete fresh collection. A caller-supplied boolean/callback never grants live admission. */
export async function assertRouteEffect(ctx:RouteContext,stage:string,proofRoot?:string) {
  if(process.versions.node!=="24.19.0")throw Error("BUNDLED_NODE_REQUIRED")
  await verifyRouteSources(ctx.admission,ctx.sourceRoot)
  await verifyRouteOwner(ctx)
  const state=JSON.parse(await routeCommand("/usr/bin/python3",[ctx.sourceRoot+"/evals/script/lab57-route-inspect.py",
    String(ctx.controller.pid),ctx.controller.starttime,ctx.admission.followupTask,String(ctx.csvRemoved),String(ctx.historyArchived)],proofRoot)) as FreshRouteState
  validateFreshRouteState(state,ctx.csvRemoved)
  const node=await verifyNodeIdentity(routeNode)
  // Last check is the running kernel image; no source hashing follows this admission before effect.
  if(proofRoot)await writeRouteRecord(proofRoot,`admission-${crypto.randomUUID()}.json`,{version:1,stage,node,sourceSha:ctx.admission.sourceSha,
    ownerTask:lab57CleanupScope.task,acquiredAt:lab57CleanupScope.acquiredAt,state,at:new Date().toISOString(),originalOutcome:"ERROR"})
  return node
}
