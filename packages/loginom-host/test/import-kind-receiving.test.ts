import {test,expect,mock} from 'bun:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join,isAbsolute} from 'node:path'
import {randomUUID} from 'node:crypto'
import {tmpdir} from 'node:os'

// Actual host/connection service/lease and FS. Store/native/supervisor are doubles,
// matching the published grant control. No native/private-IPC exploit is claimed.
let forwarded:any
const active={generation:1,revision:1,url:'http://fixture.invalid',username:'own',password:'fixture',apiKey:'fixture'}
mock.module('../src/connection/connection-store',()=>({connectionStore:()=>({read:async()=>active,pending:async()=>undefined,latestGeneration:async()=>1})}))
mock.module('../src/supervisor',()=>({supervise:async(input:any)=>{
 if(input.acceptanceCapture)forwarded=input.acceptanceCapture
 let finish!:()=>void;const exited=new Promise<void>(r=>finish=r)
 return {exited,close:async()=>finish(),request:async()=>{throw Error('no reader/native in grant fixture')}}
}}))
const {createLoginomHost}=await import('../src/host')
let createHost=createLoginomHost
function attemptKindChange(value:any){
 try{value.harness='calculator-grouped-before-done-v1'}catch{/* Immutable references are a valid refusal. */}
}
if(process.env.IMPORT_HOST_MODE==='compiled'){
 const body=await readFile(process.env.IMPORT_COMPILED_HOST_BODY!,'utf8')
 const {inputStore}=await import('../src/inputs')
 const {recoveryStore}=await import('../src/connection/recovery-store')
 const {connectionService}=await import('../src/connection/connection-service')
 const {connectionStore}=await import('../src/connection/connection-store')
 const {supervise}=await import('../src/supervisor')
 const deps={inputStore,join5:join,recoveryStore,readFile2:readFile,supervise,connectionService,connectionStore,randomUUID5:randomUUID,rm3:rm,isAbsolute2:isAbsolute}
 // Exact installed createLoginomHost body. Source service/lease/FS dependencies
 // and named store/supervisor doubles are explicit; not a whole installed host.
 createHost=Function(...Object.keys(deps),'return ('+body+')')(...Object.values(deps))
}
for(const scenario of ['original-import','startup-kind-drift','coupled-kind-drift'])test('retains original Import grant kind: '+scenario,async()=>{
 const root=await mkdtemp(join(tmpdir(),'retained-kind-fixture-')),resources=join(root,'resources');await mkdir(resources)
 await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'fixture',actionManifestUri:'fixture',actionManifestSha256:'0'.repeat(64)}))
 const capture:any={authorization:'a'.repeat(64),packagePath:'/own/result.lgp',harness:'import-before-configure-v1'}
 const options={root,resources,codec:{encode:(v:any)=>v,decode:(v:any)=>v},environment:{},acceptanceCapture:capture}
 const host=await createHost(options)
 let lease:any
 try{
  await host.settled();lease=host.acquire('owner:run')
  if(scenario==='startup-kind-drift')attemptKindChange(capture)
  let bound=true
  try{host.bindCapture('owner','run','chat',lease);await host.runtime(1,'chat')}catch{bound=false}
  if(scenario==='coupled-kind-drift'){
   attemptKindChange(capture)
   attemptKindChange(forwarded)
  }
  const allowed=bound&&host.authorizeCapture('a'.repeat(64),'owner','run','chat',lease)
  console.log(JSON.stringify({scenario,bound,allowed,originalKind:'import-before-configure-v1',forwardedKind:forwarded?.harness}))
  if(scenario==='original-import'){expect(allowed).toBe(true);expect(host.authorizeCapture('a'.repeat(64),'owner','run','chat',lease,'import-before-configure-v1')).toBe(true);expect(host.authorizeCapture('a'.repeat(64),'owner','run','chat',lease,'calculator-grouped-before-done-v1')).toBe(false)}
  // Safe implementations may ignore a late caller mutation and retain Import.
  // The required invariant is that a different kind cannot gain authorization.
  else expect(allowed&&forwarded?.harness!=='import-before-configure-v1').toBe(false)
 }finally{lease?.release();await host.close()}
})

// Additional compatibility control; original reviewer cases/assertions above unchanged.
test('original Calculator default and authorization/path survive outer options replacement',async()=>{
 const root=await mkdtemp(join(tmpdir(),'calculator-kind-fixture-')),resources=join(root,'resources');await mkdir(resources)
 await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'fixture',actionManifestUri:'fixture',actionManifestSha256:'0'.repeat(64)}))
 const options:any={root,resources,codec:{encode:(v:any)=>v,decode:(v:any)=>v},environment:{},acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/own/result.lgp'}}
 const host=await createHost(options);let lease:any
 try{
  await host.settled();lease=host.acquire('owner:run');options.acceptanceCapture={authorization:'b'.repeat(64),packagePath:'/own/replacement.lgp',harness:'import-before-configure-v1'}
  host.bindCapture('owner','run','chat',lease);await host.runtime(1,'chat')
  expect(forwarded.harness).toBe('calculator-grouped-before-done-v1');expect(forwarded.packagePath).toBe('/own/result.lgp')
  expect(host.authorizeCapture('a'.repeat(64),'owner','run','chat',lease)).toBe(true)
  expect(host.authorizeCapture('b'.repeat(64),'owner','run','chat',lease)).toBe(false)
  expect(host.authorizeCapture('a'.repeat(64),'owner','run','chat',lease,'import-before-configure-v1')).toBe(false)
 }finally{lease?.release();await host.close()}
})

// Independent correction control: mutate caller immediately across startup await.
test('Import snapshot precedes startup awaits without freezing caller objects',async()=>{
 const root=await mkdtemp(join(tmpdir(),'import-early-mutation-')),resources=join(root,'resources');await mkdir(resources)
 await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'fixture',actionManifestUri:'fixture',actionManifestSha256:'0'.repeat(64)}))
 const capture:any={authorization:'a'.repeat(64),packagePath:'/own/result.lgp',harness:'import-before-configure-v1'}
 const options:any={root,resources,codec:{encode:(v:any)=>v,decode:(v:any)=>v},environment:{},acceptanceCapture:capture}
 const starting=createHost(options)
 expect(Object.isFrozen(options)).toBe(false);expect(Object.isFrozen(capture)).toBe(false)
 capture.authorization='b'.repeat(64);capture.packagePath='/foreign/other.lgp';capture.harness='calculator-grouped-before-done-v1'
 expect(options.acceptanceCapture).toBe(capture)
 const host=await starting;let lease:any
 try{
  await host.settled();lease=host.acquire('owner:run');host.bindCapture('owner','run','chat',lease);await host.runtime(1,'chat')
  expect(forwarded.harness).toBe('import-before-configure-v1');expect(forwarded.packagePath).toBe('/own/result.lgp')
  expect(host.authorizeCapture('a'.repeat(64),'owner','run','chat',lease)).toBe(true)
  expect(host.authorizeCapture('b'.repeat(64),'owner','run','chat',lease)).toBe(false)
 }finally{lease?.release();await host.close();await rm(root,{recursive:true,force:true})}
})
