import {test,expect} from 'bun:test'
import vm from 'node:vm'
import {readFile,writeFile,mkdtemp,rm,mkdir,rename} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

// Exercise actual shutdown functions and durable files; their lifecycle handles
// are explicitly fixtures. No authenticated login or browser is started here.
const source=await readFile(new URL('../src/node-entry.ts',import.meta.url),'utf8')
const snippet=source.slice(source.indexOf('function closeRejection('),source.indexOf('function reply('))
const code=new Bun.Transpiler({loader:'ts'}).transformSync(snippet)
const managed=await readFile(process.env.SHUTDOWN_MANAGED_SOURCE??new URL('../../loginom-runtime/src/managed-entry.mjs',import.meta.url),'utf8')
const managedCode=managed.slice(managed.indexOf('function closeRejection('),managed.indexOf('const stop ='))
function managedFixture(state:any){return vm.runInNewContext(managedCode+';({close,recordClose})',{
 state,requests:new Set(),writeFile,join,rm,Promise,Error})}

for(const scenario of ['own','foreign-account','foreign-origin','changed-build','disconnected','existing-owner'])
 test('private readiness binds only its authenticated login document: '+scenario,async()=>{
 const document={},state:any={}
 const pageContext=vm.createContext({document,location:{origin:scenario==='foreign-origin'?'https://foreign.invalid':'https://loginom.invalid'},
  bg:{app:{Version:scenario==='changed-build'?'other':'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{
   UserName:scenario==='foreign-account'?'foreign':'user',Connected:scenario!=='disconnected'}}}}}}},
  __loginomDockReadinessV1:scenario==='existing-owner'?{documentId:'retained'}:undefined,Error})
 const chunk=managed.slice(managed.indexOf('const documentId=randomUUID()'),managed.indexOf('const { Client } = require',managed.indexOf('const documentId=randomUUID()')))
 const bind=vm.runInNewContext('(async()=>{'+chunk+'})',{
  state,randomUUID:()=> 'original-document',session:{metadata:{sessionId:'original-session'}},config:{loginomUrl:'https://loginom.invalid/app'},
  input:{connection:{username:'user'}},URL,
  authenticated:{context:{pages:()=>[{evaluate:async(fn:any,arg:any)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',pageContext)}]}}})
 if(scenario==='own'){
  await bind();expect(state.authenticatedReadiness).toEqual({documentId:'original-document',account:'user',loginomBuild:'7.4.2'})
  expect(pageContext.__loginomDockReadinessV1.document).toBe(document)
 }else{
  await expect(bind()).rejects.toThrow('LOGINOM_READINESS_IDENTITY_REQUIRED');expect(state.authenticatedReadiness).toBeUndefined()
  if(scenario==='existing-owner')expect(pageContext.__loginomDockReadinessV1.documentId).toBe('retained')
 }
})

for(const rejected of [Error('inner close rejected'),0,false,'',null,undefined])test('managed close preserves primary refusal: '+String(rejected),async()=>{
 const root=await mkdtemp(join(tmpdir(),'managed-shutdown-'))
 const events:string[]=[],state:any={session:{directory:root},authenticatedReadiness:{},
  bridge:{close:async()=>{events.push('bridge');throw rejected}},controller:{abort:()=>events.push('abort')},
  browser:{close:async()=>events.push('browser-close')}}
 const f=managedFixture(state)
 try{
  let caught:any,failed=false;try{await f.close()}catch(error){caught=error;failed=true}
  expect(failed).toBe(true);expect(caught).toBe(rejected);expect(state.closeFailure).toBe(rejected)
  expect(events).toEqual(['bridge'])
  const proof=JSON.parse(await readFile(join(root,'managed-shutdown.json'),'utf8'))
  const failure=proof.stages.at(-1).rejection
  if(rejected instanceof Error)expect(failure.message).toBe(rejected.message)
  else expect(failure).toEqual({kind:'value',value:rejected===undefined?null:rejected,is_undefined:rejected===undefined})
 }finally{await rm(root,{recursive:true,force:true})}
})
for(const scenario of ['ready','unconfigured','unconfirmed-logout','unknown-transport','browser-error','write-failure'])
 test('managed shutdown stage boundaries: '+scenario,async()=>{
 const root=await mkdtemp(join(tmpdir(),'managed-shutdown-boundary-')),events:string[]=[]
 const receipt={cleanup_complete:true,browser_transport_closed:scenario!=='unknown-transport',native_logout_confirmed:scenario!=='unconfirmed-logout'}
 const state:any={session:{directory:root},...(scenario==='unconfigured'?{}:{authenticatedReadiness:{}}),
  bridge:{close:async()=>{events.push('bridge');return receipt}},controller:{abort:()=>events.push('abort')},
  client:{close:async()=>events.push('client')},browserServer:{close:async()=>events.push('server')},
  browser:{close:async()=>{events.push('browser');if(scenario==='browser-error')throw 0}}}
 const f=managedFixture(state)
 try{
  if(scenario==='write-failure')await mkdir(join(root,'managed-shutdown.json'))
  if(['ready','unconfigured'].includes(scenario)){
   await f.close();expect(events).toEqual(['bridge','abort','client','server','browser'])
   const proof=JSON.parse(await readFile(join(root,'managed-shutdown.json'),'utf8'))
   expect(proof.stages.at(-1)).toEqual({stage:'outer_acknowledgement',status:'allowed'})
  }else{
   await expect(f.close()).rejects.toThrow()
   if(scenario==='write-failure')expect(events).toEqual([])
   else if(scenario!=='browser-error')expect(events).toEqual(['bridge'])
   else expect(state.closeFailure.cause).toBe(0)
  }
 }finally{await rm(root,{recursive:true,force:true})}
})

let actual:any
if(process.env.SHUTDOWN_HOST_BUNDLE){process.send=(()=>true) as typeof process.send;actual=await import(process.env.SHUTDOWN_HOST_BUNDLE)}
for(const phase of ['interrupt','host_close','port_close'])for(const rejected of [Error('primary refusal'),0,false,'',null,undefined])
 test('outer host preserves '+phase+' refusal '+String(rejected),async()=>{
 const root=await mkdtemp(join(tmpdir(),'host-shutdown-')),events:string[]=[]
 const state:any=actual?.shutdownState??{}
 Object.assign(state,{root,closed:false,stopping:undefined,starting:undefined,shutdown:undefined,closeFailure:undefined,
  host:{interruptAll:async()=>{events.push('interrupt');if(phase==='interrupt')throw rejected},
   close:async()=>{events.push('host_close');if(phase==='host_close')throw rejected}},
  port:{close:async()=>{events.push('port_close');if(phase==='port_close')throw rejected}}})
 const f=actual?{stop:actual.shutdownStop}:vm.runInNewContext(code+';({stop})',{
  state,operations:new Set(),events:{emit:(event:string)=>events.push(event)},writeFile,join,Promise,Error})
 try{
  const attempt=f.stop();expect(f.stop()).toBe(attempt)
  let caught:any,failed=false;try{await attempt}catch(error){failed=true;caught=error}
  expect(failed).toBe(true);expect(state.closed).toBe(false)
  if(phase==='port_close')expect(caught).toBe(rejected)
  else {expect(caught.message).toBe('LOGINOM_HOST_CLEANUP_FAILED');expect(caught.cause).toBe(rejected)}
  const proof=JSON.parse(await readFile(join(root,'host-shutdown.json'),'utf8'))
  expect(proof.stages.at(-1).stage).toBe('refused')
  if(phase!=='port_close')expect(events).not.toContain('port_close')
  state.host={interruptAll:async()=>{},close:async()=>{}}
  state.port={close:async()=>events.push('released-after-receipt')}
  await f.stop();expect(state.closed).toBe(true)
  const proof2=JSON.parse(await readFile(join(root,'host-shutdown.json'),'utf8'))
  expect(proof2.stages.at(-1)).toEqual({stage:'outer_acknowledgement',status:'prepared'})
 }finally{await rm(root,{recursive:true,force:true})}
})
test('outer durable receipt failure precedes release; same owner can retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'host-shutdown-write-')),events:string[]=[]
 const state:any=actual?.shutdownState??{}
 Object.assign(state,{root,closed:false,stopping:undefined,starting:undefined,shutdown:undefined,
  host:{interruptAll:async()=>events.push('interrupt'),close:async()=>events.push('host_close')},
  port:{close:async()=>events.push('release')}})
 const f=actual?{stop:actual.shutdownStop}:vm.runInNewContext(code+';({stop})',{
  state,operations:new Set(),events:{emit:()=>{}},writeFile,join,Promise,Error})
 try{
  await mkdir(join(root,'host-shutdown.json'));await expect(f.stop()).rejects.toThrow();expect(events).toEqual([])
  expect(state.closed).toBe(false);await rename(join(root,'host-shutdown.json'),join(root,'failed-write'))
  await f.stop();expect(events).toEqual(['interrupt','host_close','release']);expect(state.closed).toBe(true)
 }finally{await rm(root,{recursive:true,force:true})}
})

// Regression cases from independent review: actual functions and filesystem failures.
test('authenticated managed close refuses missing cleanup_complete',async()=>{
 const root=await mkdtemp(join(tmpdir(),'review-managed-incomplete-')),events:string[]=[]
 const state:any={session:{directory:root},authenticatedReadiness:{account:'fixture'},
  bridge:{close:async()=>({browser_transport_closed:true,native_logout_confirmed:true})},
  client:{close:async()=>events.push('client-close')},browser:{close:async()=>events.push('context-close')}}
 const f=vm.runInNewContext(managedCode+';({close})',{state,requests:new Set(),writeFile,join,rm,Promise,Error})
 try{
  let refused=false;try{await f.close()}catch{refused=true}
  expect(refused).toBe(true);expect(events).toEqual([])
 }finally{await rm(root,{recursive:true,force:true})}
})

for(const phase of ['interrupt','host_close'])test('outer '+phase+' rejection survives subsequent diagnostic write failure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'review-outer-primary-')),events:string[]=[]
 const diagnostic=join(root,'host-shutdown.json'),state:any=actual?.shutdownState??{}
 async function reject(){await rename(diagnostic,diagnostic+'.prior');await mkdir(diagnostic);throw 0}
 Object.assign(state,{root,closed:false,stopping:undefined,starting:undefined,shutdown:undefined,closeFailure:undefined,
  host:{interruptAll:async()=>{events.push('interrupt');if(phase==='interrupt')await reject()},
   close:async()=>{events.push('host_close');if(phase==='host_close')await reject()}},port:{close:async()=>events.push('release')}})
 const f=actual?{stop:actual.shutdownStop}:vm.runInNewContext(code+';({stop})',{
  state,operations:new Set(),events:{emit:(s:string)=>events.push(s)},writeFile,join,Promise,Error})
 try{
  let caught:any;try{await f.stop()}catch(e){caught=e}
  expect(state.closed).toBe(false);expect(events).not.toContain('release')
  expect(caught.message).toBe('LOGINOM_HOST_CLEANUP_FAILED');expect(caught.cause).toBe(0)
 }finally{await rm(root,{recursive:true,force:true})}
})

test('managed context rejection survives its stage write failure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'review-managed-primary-')),events:string[]=[],diagnostic=join(root,'managed-shutdown.json')
 const state:any={session:{directory:root},authenticatedReadiness:{},bridge:{close:async()=>({browser_transport_closed:true,cleanup_complete:true,native_logout_confirmed:true})},
  browser:{close:async()=>{events.push('context-close');await rename(diagnostic,diagnostic+'.prior');await mkdir(diagnostic);throw 0}}}
 const f=vm.runInNewContext(managedCode+';({close})',{state,requests:new Set(),writeFile,join,rm,Promise,Error})
 try{
  let caught:any;try{await f.close()}catch(e){caught=e}
  expect(caught.message).toBe('LOGINOM_RUNTIME_CLEANUP_FAILED');expect(caught.cause).toBe(0)
 }finally{await rm(root,{recursive:true,force:true})}
})
