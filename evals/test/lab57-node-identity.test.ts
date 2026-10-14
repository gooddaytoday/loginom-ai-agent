import { test, expect } from "bun:test"
import { mkdtemp, copyFile, lstat, realpath, symlink, unlink, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { verifyNodeIdentity } from "../src/lab57-node-identity"

test("actual executable cannot be admitted by matching version or equal-byte copy", async () => {
  const root=await mkdtemp("/tmp/lab57-node-")
  const executable=await realpath(process.execPath), info=await lstat(executable)
  const raw=await Bun.file(executable).arrayBuffer()
  const original={path:executable,device:info.dev,inode:info.ino,bytes:info.size,sha256:createHash("sha256").update(new Uint8Array(raw)).digest("hex")}
  expect((await verifyNodeIdentity(original)).path).toBe(executable)
  await copyFile(executable,root+"/same-version")
  const copy=await lstat(root+"/same-version")
  await expect(verifyNodeIdentity({...original,path:root+"/same-version",inode:copy.ino})).rejects.toThrow("EXECUTABLE_IDENTITY")
})

test("running d6 image refuses wrong identity, aliases, deletion, replacement and a concurrent pathname race",async()=>{
  const root=await mkdtemp("/tmp/lab57-actual-node-")
  const built=await Bun.build({entrypoints:[new URL("../src/lab57-node-identity.ts",import.meta.url).pathname],target:"node",format:"esm"})
  expect(built.success).toBe(true)
  const module=root+"/identity.mjs";await Bun.write(module,built.outputs[0]!)
  for(const scenario of ["valid","inode","device","bytes","sha","equal-copy","symlink","delete","replace","race"]){
    const executable=root+"/node-"+scenario;await copyFile("/opt/node",executable)
    const script=`import {verifyNodeIdentity} from ${JSON.stringify(module)};
      import {lstat,readFile,unlink,symlink,copyFile,rename} from 'node:fs/promises';import {createHash} from 'node:crypto';
      const scenario=${JSON.stringify(scenario)},image=process.execPath,s=await lstat(image);
      const identity={path:image,device:s.dev,inode:s.ino,bytes:s.size,sha256:createHash('sha256').update(await readFile(image)).digest('hex')};
      let refusal=false,effect=0;
      if(scenario==='inode')identity.inode++;
      if(scenario==='device')identity.device++;
      if(scenario==='bytes')identity.bytes++;
      if(scenario==='sha')identity.sha256='0'.repeat(64);
      if(scenario==='equal-copy'){identity.path='/opt/node';const o=await lstat('/opt/node');identity.inode=o.ino;identity.device=o.dev;}
      if(scenario==='symlink'){await unlink(image);await symlink('/opt/node',image);}
      if(scenario==='delete')await unlink(image);
      if(scenario==='replace'||scenario==='race')await copyFile('/opt/node',image+'.replacement');
      if(scenario==='replace')await rename(image+'.replacement',image);
      const race=scenario==='race'?new Promise(resolve=>setTimeout(()=>rename(image+'.replacement',image).then(resolve),1)):Promise.resolve();
      try{await verifyNodeIdentity(identity);effect++;}catch{refusal=true;}
      await race;console.log(JSON.stringify({scenario,node:process.versions.node,refusal,effect}));`
    const child=Bun.spawn([executable,"--input-type=module","-e",script],{stdout:"pipe",stderr:"pipe"})
    const [code,text,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
    expect(err).toBe("");expect(code).toBe(0)
    const result=JSON.parse(text)
    expect(result).toEqual({scenario,node:"24.19.0",refusal:scenario!=="valid",effect:scenario==="valid"?1:0})
  }
},30000)
