import {test,expect} from 'bun:test'
import {mkdtemp,mkdir,writeFile,rm,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
if(process.env.REVIEW_HOST_BUNDLE)process.send=(()=>true) as typeof process.send
const exports=await import(process.env.REVIEW_HOST_BUNDLE??new URL('../src/host.ts',import.meta.url).href)
const create=exports.createLoginomHost
const portFunction=exports.loginomHostPort??(await import('../src/host-port')).loginomHostPort
const storeFunction=exports.connectionStore??(await import('../src/connection/connection-store')).connectionStore
// Real host/store/lease/HostPort/journal; managed RPC and native are labelled doubles.
for(const stage of ['initial','post-runtime','post-journal','post-capture'])test('original tuple authority '+stage,async()=>{
 const root=await mkdtemp(join(tmpdir(),'receiving-tuple-'));let host:any
 try{
  const resources=join(root,'resources');await mkdir(join(resources,'bin'),{recursive:true});await mkdir(join(resources,'runtime/src'),{recursive:true});
  await copyFile(process.env.LOGINOM_AI_AGENT_TEST_NODE!,join(resources,'bin/node'));
  await writeFile(join(resources,'runtime/src/managed-entry.mjs'),`process.on('message',m=>{if(m.operation==='start')process.send({id:m.id,result:{protocol:1,ready:true,generation:m.input.generation,chat:m.input.chat}});if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect())});`);
  await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'http://fixture.invalid'}))
  const codec={encode:async(v:any)=>({apiKey:v.apiKey,password:v.password}),decode:async(v:any)=>v}
  const store=storeFunction(join(root,'connection'),codec);await store.stage({generation:7,revision:1,url:'http://fixture.invalid',username:'own',apiKey:'fixture',password:'fixture'});await store.activate(7)
  host=await create({root,resources,codec,environment:{},acceptanceCapture:{authorization:'trusted',packagePath:'/own/result.lgp'}});await host.settled()
  let tuple:any,dispatch=0,begins=0;const bind=host.bindCapture.bind(host)
  const service={...host,bindCapture:(owner:string,run:string,chat:string,lease:any)=>{tuple={owner,run,chat,lease};bind(owner,run,chat,lease)},
   runtime:async()=>{if(stage==='post-runtime')host.markRuntimeStale(tuple.chat);return {request:async()=>{dispatch++;if(stage==='post-capture')host.markRuntimeStale(tuple.chat);return {cleanupComplete:false,refused:true,rejected:0}}}},
   journal:{...host.journal,begin:async(...args:any[])=>{begins++;const id=await host.journal.begin(...args);if(stage==='post-journal')host.markRuntimeStale(tuple.chat);return id}}}
  const handlers=new Map(),waiting=new Map();let sequence=0
  const port=portFunction({on:(k:string,f:any)=>handlers.set(k,f),start(){},postMessage:(v:any)=>waiting.get(v.id)?.(v)},service)
  const send=(method:string,input:any)=>new Promise<any>(resolve=>{const id=String(++sequence);waiting.set(id,resolve);handlers.get('message')({data:{id,method,input}})})
  expect((await send('acquire',{run:'original',session:'original'})).result.generation).toBe(7)
  const authorized=(p:any={})=>host.authorizeCapture('trusted',p.owner??tuple.owner,p.run??tuple.run,p.chat??tuple.chat,p.lease??tuple.lease)
  expect(authorized()).toBe(true)
  for(const p of [{owner:'foreign'},{run:'foreign'},{chat:'foreign'},{lease:{}}])expect(authorized(p)).toBe(false)
  expect(host.authorizeCapture('foreign',tuple.owner,tuple.run,tuple.chat,tuple.lease)).toBe(false)
  if(stage==='initial')host.markRuntimeStale(tuple.chat)
  const reply=await send('acceptance.capture',{run:'original',authorization:'trusted'})
  expect(reply.error).toBeDefined();expect(authorized()).toBe(false)
  expect(dispatch).toBe(stage==='post-capture'?1:0);expect(begins).toBe(['post-journal','post-capture'].includes(stage)?1:0)
  // Only fixture host resources are closed; no native startup/runtime was launched.
  await port.close().catch(()=>{});
 }finally{await host?.close();await rm(root,{recursive:true,force:true})}
})
