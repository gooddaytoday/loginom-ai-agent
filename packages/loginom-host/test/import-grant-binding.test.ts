import {test,expect,mock} from 'bun:test'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
// Real host/connection-service/lease and recovery FS; store/native/supervisor are named doubles.
let forwarded:any
const active={generation:1,revision:1,url:'http://fixture.invalid',username:'own',password:'fixture',apiKey:'fixture'}
mock.module('../src/connection/connection-store',()=>({connectionStore:()=>({read:async()=>active,pending:async()=>undefined,latestGeneration:async()=>1})}))
mock.module('../src/supervisor',()=>({supervise:async(input:any)=>{
 if(input.acceptanceCapture)forwarded=input.acceptanceCapture
 let finish!:()=>void;const exited=new Promise<void>(r=>finish=r)
 return {exited,close:async()=>finish(),request:async()=>{throw Error('no reader/native in grant fixture')}}
}}))
const {createLoginomHost}=await import('../src/host')
test('Import grant is bound to original real lease/run/kind before dispatch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'import-grant-')),resources=join(root,'resources');await mkdir(resources)
 await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'fixture',actionManifestUri:'fixture',actionManifestSha256:'0'.repeat(64)}))
 const host=await createLoginomHost({root,resources,codec:{encode:v=>v,decode:v=>v as any},environment:{},acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/own/result.lgp',harness:'import-before-configure-v1'}})
 let lease:any,foreign:any
 try{
  await host.settled();lease=host.acquire('owner:run');expect(lease?.generation).toBe(1)
  host.bindCapture('owner','run','chat',lease);await host.runtime(1,'chat')
  const allowed=()=>host.authorizeCapture('a'.repeat(64),'owner','run','chat',lease)
  expect(allowed()).toBe(true);expect(forwarded.harness).toBe('import-before-configure-v1')
  foreign=host.acquire('foreign');expect(host.authorizeCapture('a'.repeat(64),'owner','run','chat',foreign)).toBe(false)
  expect(host.authorizeCapture('a'.repeat(64),'foreign','run','chat',lease)).toBe(false)
  forwarded.harness='calculator-grouped-before-done-v1';expect(allowed()).toBe(false)
  forwarded.harness='import-before-configure-v1';forwarded.expires=Date.now()-1;expect(allowed()).toBe(false)
 }finally{lease?.release();foreign?.release();await host.close();await rm(root,{recursive:true,force:true})}
})
