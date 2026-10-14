import {constants} from "node:fs"
import {lstat,open,realpath} from "node:fs/promises"
import path from "node:path"
/** Exclusive durable private record. Caller never chooses a stand/profile path in the executable. */
export async function writePrivateRecord(root:string,name:string,value:unknown) {
 if(!/^[a-z0-9.-]+$/.test(name)||await realpath(root)!==root)throw Error("PRIVATE_RECORD_PATH")
 const dir=await lstat(root)
 if(!dir.isDirectory()||dir.uid!==process.getuid!()||(dir.mode&0o777)!==0o700)throw Error("PRIVATE_RECORD_ROOT")
 const parent=await open(root,constants.O_DIRECTORY|constants.O_RDONLY|constants.O_NOFOLLOW)
 try {const p=await parent.stat();if(p.dev!==dir.dev||p.ino!==dir.ino)throw Error("PRIVATE_RECORD_RACE")
  const f=await open(`/proc/self/fd/${parent.fd}/${name}`,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
  try {await f.writeFile(JSON.stringify(value,null,2)+"\n");await f.sync()}finally{await f.close()}
  await parent.sync();const after=await lstat(root)
  if(after.dev!==dir.dev||after.ino!==dir.ino)throw Error("PRIVATE_RECORD_RACE")
 }finally{await parent.close()}
 return path.join(root,name)
}
