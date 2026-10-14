import path from "node:path"
import { constants } from "node:fs"
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises"

export type PrivateRecordEntry = { name: string; kind: "file" | "directory"; device: number; inode: number; uid: number;
  mode: number; size: number; mtimeNs: string; ctimeNs: string; sha256: string | null }
export type RecordArchivePlan = { root: string; source: string; destination: string; once: string; expected: PrivateRecordEntry[] }
type RecordArchiveReservation = RecordArchivePlan & {onceSha256:string;onceDevice:number;onceInode:number;onceMtimeNs:string;onceCtimeNs:string;
  owner:{pid:number;uid:number;starttime:string}}
const hash = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Filesystem primitive only. No operator authorisation, lease retirement or recovery is inferred. */
export async function snapshotPrivateRecord(root: string, source: string): Promise<PrivateRecordEntry[]> {
  if (!path.isAbsolute(root) || await realpath(root) !== root || path.dirname(source) !== root ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path.basename(source))) throw Error("Record path refused")
  const parent = await lstat(root)
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid!() || parent.mode & 0o077) throw Error("Private root refused")
  const records: PrivateRecordEntry[] = []
  const visit = async (file: string): Promise<void> => {
    const info = await lstat(file,{bigint:true})
    const kind = info.isDirectory() ? "directory" : "file"
    if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory() || info.uid !== BigInt(process.getuid!()) ||
      (info.mode & 0o777n) !== (kind === "directory" ? 0o700n : 0o600n) || info.isFile() && info.nlink !== 1n) throw Error("Private record refused")
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|(info.isDirectory()?constants.O_DIRECTORY:0))
    try {
      const opened=await handle.stat({bigint:true})
      const sha256=info.isFile()?hash(await handle.readFile()):null
      if (info.isDirectory()) for (const name of (await readdir(file)).sort()) await visit(path.join(file,name))
      const after=await lstat(file,{bigint:true})
      for (const observed of [opened,after]) if (["dev","ino","uid","mode","size","mtimeNs","ctimeNs"].some(k=>
        observed[k as keyof typeof observed]!==info[k as keyof typeof info])) throw Error("Record changed during read")
      records.push({name:path.relative(source,file)||".",kind,device:Number(info.dev),inode:Number(info.ino),uid:Number(info.uid),
        mode:Number(info.mode&0o777n),size:Number(info.size),mtimeNs:String(info.mtimeNs),ctimeNs:String(info.ctimeNs),sha256})
    } finally {await handle.close()}
  }
  await visit(source)
  return records.sort((a,b)=>a.name.localeCompare(b.name))
}

async function syncDirectory(directory: string) {
  const handle=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW)
  try {await handle.sync()} finally {await handle.close()}
}

async function currentOwner() {
  const raw=await readFile(`/proc/${process.pid}/stat`,"utf8")
  return {pid:process.pid,uid:process.getuid!(),starttime:raw.slice(raw.lastIndexOf(")")+2).split(" ")[19]!}
}

/** wx+fsync file AND parent. Crash/error never makes this reservation repeatable. */
export async function reserveRecordArchive(plan: RecordArchivePlan) {
  if ([plan.destination,plan.once].some(file=>path.dirname(file)!==plan.root ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path.basename(file))) || new Set([plan.source,plan.destination,plan.once]).size!==3)
    throw Error("Archive path refused")
  if (!same(await snapshotPrivateRecord(plan.root,plan.source),plan.expected)) throw Error("Record identity changed")
  const found=await lstat(plan.destination).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error})
  if (found) throw Error("Archive destination already exists")
  const owner=await currentOwner()
  const bytes=JSON.stringify({version:1,status:"CONSUMED_BEFORE_MUTATION",operation:"record-archive-proposal-v1",plan,owner,
    expectedSha256:hash(JSON.stringify(plan.expected)),at:new Date().toISOString()})
  const file=await open(plan.once,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
  try {await file.writeFile(bytes);await file.sync()} finally {await file.close()}
  await syncDirectory(plan.root)
  const identity=await lstat(plan.once,{bigint:true})
  return {...plan,owner,onceSha256:hash(bytes),onceDevice:Number(identity.dev),onceInode:Number(identity.ino),
    onceMtimeNs:String(identity.mtimeNs),onceCtimeNs:String(identity.ctimeNs)}
}

/** Linux RENAME_NOREPLACE preserves the entire object. No unlink, delete, rollback or retry. */
export async function archiveReservedRecord(reservation: RecordArchiveReservation) {
  if (!same(reservation.owner,await currentOwner())) throw Error("Reservation owner changed")
  const once=await lstat(reservation.once,{bigint:true})
  const handle=await open(reservation.once,constants.O_RDONLY|constants.O_NOFOLLOW)
  try {
    const bytes=await handle.readFile()
    for (const observed of [once,await handle.stat({bigint:true}),await lstat(reservation.once,{bigint:true})]) {
      if (!observed.isFile() || observed.isSymbolicLink() || observed.uid!==BigInt(process.getuid!()) || (observed.mode&0o777n)!==0o600n ||
        observed.nlink!==1n || Number(observed.dev)!==reservation.onceDevice || Number(observed.ino)!==reservation.onceInode ||
        String(observed.mtimeNs)!==reservation.onceMtimeNs || String(observed.ctimeNs)!==reservation.onceCtimeNs) throw Error("Once identity changed")
    }
    if (hash(bytes)!==reservation.onceSha256) throw Error("Once bytes changed")
    const recorded=JSON.parse(bytes.toString()) as {status:string;plan:RecordArchivePlan;owner:RecordArchiveReservation["owner"]}
    if (recorded.status!=="CONSUMED_BEFORE_MUTATION" || !same(recorded.owner,reservation.owner) || !same(recorded.plan,{root:reservation.root,source:reservation.source,
      destination:reservation.destination,once:reservation.once,expected:reservation.expected})) throw Error("Once plan changed")
  } finally {await handle.close()}
  const attempted=await open(`${reservation.once}.archive-attempted`,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
    .catch(()=>{throw Error("Archive already attempted")})
  try {await attempted.writeFile(JSON.stringify({status:"ATTEMPTED",onceSha256:reservation.onceSha256,owner:reservation.owner}));await attempted.sync()}
  finally {await attempted.close()}
  await syncDirectory(reservation.root)
  const snapshot=await snapshotPrivateRecord(reservation.root,reservation.source)
  if (!same(snapshot,reservation.expected)) throw Error("Record identity changed after reservation")
  const original=snapshot.find(r=>r.name===".")!
  const proc=Bun.spawn(["python3",new URL("../script/lab57-archive-no-replace.py",import.meta.url).pathname,
    reservation.root,path.basename(reservation.source),path.basename(reservation.destination),JSON.stringify(original)],{stdout:"pipe",stderr:"pipe",
    env:{PATH:"/usr/bin:/bin",TMPDIR:process.env.TMPDIR??"/tmp"}})
  const [code,stderr]=await Promise.all([proc.exited,new Response(proc.stderr).text()])
  if (code) throw Error(`Atomic record archive refused (${code}): ${stderr.trim()}`)
  const archived=await snapshotPrivateRecord(reservation.root,reservation.destination)
  // Rename may change the root ctime; all other identities, times and bytes must survive.
  if (!same(archived.map(r=>r.name==="."?{...r,ctimeNs:original.ctimeNs}:r),reservation.expected)) throw Error("Archived record changed; STOP, once retained")
  const receipt=JSON.stringify({status:"RECORD_ARCHIVED",destination:reservation.destination,onceSha256:reservation.onceSha256,
    expectedSha256:hash(JSON.stringify(reservation.expected)),archived,at:new Date().toISOString(),cleanup:"UNCONFIRMED"})
  const file=await open(`${reservation.once}.record-archived`,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
  try {await file.writeFile(receipt);await file.sync()} finally {await file.close()}
  await syncDirectory(reservation.root)
  return {status:"RECORD_ARCHIVED",destination:reservation.destination,cleanup:"UNCONFIRMED"}
}
