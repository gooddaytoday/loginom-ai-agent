import { constants } from "node:fs"
import { open, lstat, realpath, readlink } from "node:fs/promises"
import { createHash } from "node:crypto"

export type ExecutableIdentity={path:string;device:number;inode:number;bytes:number;sha256:string}
const fail=():never=>{throw Error("EXECUTABLE_IDENTITY_CHANGED")}
async function inspectExecutable(file:string,noFollow=true) {
  const f=await open(file,constants.O_RDONLY|(noFollow?constants.O_NOFOLLOW:0))
  try {
    const before=await f.stat({bigint:true}),hash=createHash("sha256")
    if(!before.isFile() || before.nlink!==1n)fail()
    for await(const chunk of f.createReadStream({autoClose:false}))hash.update(chunk)
    const after=await f.stat({bigint:true})
    if(["dev","ino","size","mtimeNs","ctimeNs","nlink"].some(k=>before[k as keyof typeof before]!==after[k as keyof typeof after]))fail()
    return {device:Number(before.dev),inode:Number(before.ino),bytes:Number(before.size),sha256:hash.digest("hex")}
  } finally {await f.close()}
}

/** Reads the running kernel image and its manifested pathname independently; no version-only admission. */
export async function verifyNodeIdentity(expected:ExecutableIdentity) {
  const image="/proc/self/exe"
  if(process.execPath!==expected.path || await realpath(expected.path)!==expected.path
    || (await lstat(expected.path)).isSymbolicLink() || await readlink(image)!==expected.path)fail()
  const pathname=await inspectExecutable(expected.path),kernel=await inspectExecutable(image,false)
  if([pathname,kernel].some(actual=>Object.entries(actual).some(([k,v])=>expected[k as keyof ExecutableIdentity]!==v)))fail()
  const after=await lstat(expected.path)
  if(after.dev!==expected.device || after.ino!==expected.inode || after.size!==expected.bytes
    || after.isSymbolicLink() || process.execPath!==expected.path || await readlink(image)!==expected.path)fail()
  return {...expected,processExecPath:process.execPath,kernelImage:await readlink(image),pid:process.pid}
}
