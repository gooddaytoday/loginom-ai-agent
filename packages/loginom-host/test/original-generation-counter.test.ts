import {test,expect} from 'bun:test'
import {mkdtemp,mkdir,writeFile,rm,copyFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import vm from 'node:vm'

// Only the new receiving authorizer is extracted; closure operands are doubles.
const source=await readFile(process.env.REVIEW_AUTH_SOURCE!,'utf8')
const start=source.indexOf('authorizeCapture(authorization'),end=source.indexOf('bindCapture(',start)
const method=source.slice(start,end).trim().replace(/,$/,'')
const code=new Bun.Transpiler({loader:'ts'}).transformSync('globalThis.api={'+method+'};')+'\napi'
test('same original lease generation drift is refused by the exact authorizer',()=>{
 const lease={generation:7},bound={owner:'owner',run:'run',chat:'chat',generation:7,account:'own',expires:Date.now()+60000}
 const api=vm.runInNewContext(code,{options:{acceptanceCapture:{authorization:'trusted'}},captures:new Map([['chat',bound]]),captureLeases:new Map([['chat',lease]]),generations:new Map([[7,{connection:{username:'own'}}]]),lost:new Set(),stale:new Set(),Date})
 expect(api.authorizeCapture('trusted','owner','run','chat',lease)).toBe(true)
 lease.generation=8
 const observed=api.authorizeCapture('trusted','owner','run','chat',lease)
 console.log(JSON.stringify({scope:'exact authorizer VM; closure/native operands doubles',original_generation:7,current_same_lease_generation:8,authorized:observed}))
 expect(observed).toBe(false)
})

if(process.env.REVIEW_LINKED_HOST){
 process.send=(()=>true) as typeof process.send
 const {createLoginomHost,loginomHostPort,connectionStore}=await import(process.env.REVIEW_LINKED_HOST)
 for(const stage of ['matching','initial','post-runtime','post-journal','post-capture'])test('real host/lease/HostPort refuses original generation drift '+stage,async()=>{
  const root=await mkdtemp(join(tmpdir(),'review-original-generation-'));let host:any,port:any
  let tuple:any,dispatch=0,begins=0,closes=0,observed:any,journalGenerations:number[]=[]
  try{
   const resources=join(root,'resources');await mkdir(join(resources,'bin'),{recursive:true});await mkdir(join(resources,'runtime/src'),{recursive:true})
   await copyFile(process.env.LOGINOM_AI_AGENT_TEST_NODE!,join(resources,'bin/node'))
   await writeFile(join(resources,'runtime/src/managed-entry.mjs'),`process.on('message',m=>{if(m.operation==='start')process.send({id:m.id,result:{protocol:1,ready:true,generation:m.input.generation,chat:m.input.chat}});if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect())});`)
   await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'http://fixture.invalid'}))
   const codec={encode:async(v:any)=>({apiKey:v.apiKey,password:v.password}),decode:async(v:any)=>v}
   const store=connectionStore(join(root,'connection'),codec);await store.stage({generation:7,revision:1,url:'http://fixture.invalid',username:'own',apiKey:'fixture',password:'fixture'});await store.activate(7)
   host=await createLoginomHost({root,resources,codec,environment:{},acceptanceCapture:{authorization:'trusted',packagePath:'/own/result.lgp'}});await host.settled()
   const bind=host.bindCapture.bind(host)
   const service={...host,bindCapture:(owner:string,run:string,chat:string,lease:any)=>{tuple={owner,run,chat,lease};bind(owner,run,chat,lease)},
    runtime:async()=>{if(stage==='post-runtime')tuple.lease.generation=8;return {request:async()=>{dispatch++;if(stage==='post-capture')tuple.lease.generation=8;return {cleanupComplete:true}},close:async()=>{closes++}}},
    journal:{...host.journal,begin:async(chat:string,generation:number)=>{begins++;journalGenerations.push(generation);const id=await host.journal.begin(chat,generation);if(stage==='post-journal')tuple.lease.generation=8;return id}}}
   const handlers=new Map(),waiting=new Map();let sequence=0
   port=loginomHostPort({on:(k:string,f:any)=>handlers.set(k,f),start(){},postMessage:(v:any)=>waiting.get(v.id)?.(v)},service)
   const send=(method:string,input:any)=>new Promise<any>(resolve=>{const id=String(++sequence);waiting.set(id,resolve);handlers.get('message')({data:{id,method,input}})})
   expect((await send('acquire',{run:'original',session:'original'})).result.generation).toBe(7)
   expect(host.authorizeCapture('trusted',tuple.owner,tuple.run,tuple.chat,tuple.lease)).toBe(true)
   if(stage==='initial')tuple.lease.generation=8
   observed=await send('acceptance.capture',{run:'original',authorization:'trusted'})
   console.log(JSON.stringify({stage,original_generation:7,current_same_lease_generation:tuple.lease.generation,dispatch,begins,closes,journalGenerations,reply:observed,scope:'real installed host/store/lease/HostPort/journal; managed RPC/native result/close are doubles; no Loginom'}))
   if(stage==='matching'){expect(observed.error).toBeUndefined();expect(observed.result.cleanupComplete).toBe(true);expect(dispatch).toBe(1);expect(closes).toBe(1);return}
   expect(observed.error).toBeDefined()
   expect(dispatch).toBe(stage==='post-capture'?1:0)
   expect(closes).toBe(0)
  }finally{
   // Restore only the test fixture lease before disposing its own mock resources.
   if(tuple)tuple.lease.generation=7
   await port?.close().catch(()=>{});await host?.close();await rm(root,{recursive:true,force:true})
  }
 })
}
