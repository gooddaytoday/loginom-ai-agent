import assert from 'node:assert/strict'
import {test} from 'bun:test'
import vm from 'node:vm'
import {EventEmitter} from 'node:events'
import {readFile,writeFile,mkdir,rm,mkdtemp,stat} from 'node:fs/promises'
import {join,isAbsolute} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'

// OFFLINE ONLY: actual source/compiled function bodies, fake IPC child and
// connection-service adapter, real temporary filesystem. No fork/native login.
const repo=new URL('../../../',import.meta.url).pathname
const output=process.env.RETENTION_RESULTS
const candidate=process.env.RETENTION_PRODUCT
const host=await readFile(join(repo,'packages/loginom-host/src/host.ts'),'utf8')
const supervisor=await readFile(join(repo,'packages/loginom-host/src/supervisor.ts'),'utf8')
const service=await readFile(join(repo,'packages/loginom-host/src/connection/connection-service.ts'),'utf8')
const entry=await readFile(join(repo,'packages/loginom-host/src/node-entry.ts'),'utf8')
const bundle=candidate?await readFile(join(candidate,'resources/loginom/host/node-host.mjs'),'utf8'):''
const transpiler=new Bun.Transpiler({loader:'ts'})
function rejection(value:any):any {return value instanceof Error?{kind:'Error',message:value.message,...(Object.hasOwn(value,'cause')?{cause:rejection(value.cause)}:{})}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}}
const sourceHost=transpiler.transformSync(host.slice(host.indexOf('export async function createLoginomHost')).replace('export async function','async function'))
const sourceSupervisor=transpiler.transformSync(supervisor.slice(supervisor.indexOf('export function runtimeEnvironment')).replaceAll('export ',''))
const sourceCloseStart=service.indexOf('    close() {')
const sourceClose=transpiler.transformSync('const closeContainer={'+service.slice(sourceCloseStart,service.indexOf('\n    },',sourceCloseStart)+8)+'};')
const sourceOuter=transpiler.transformSync(entry.slice(entry.indexOf('function closeRejection('),entry.indexOf('function reply(')))
const compiledHost=bundle.slice(bundle.indexOf('async function createLoginomHost(options)'),bundle.indexOf('// src/host-port.ts'))
const compiledSupervisor=bundle.slice(bundle.indexOf('function runtimeEnvironment('),bundle.indexOf('// src/connection/connection-service.ts',bundle.indexOf('function runtimeEnvironment(')))
const compiledServiceStart=bundle.indexOf('    close() {',bundle.indexOf('async function connectionService('))
const compiledClose='const closeContainer={'+bundle.slice(compiledServiceStart,bundle.indexOf('\n    }\n  };',compiledServiceStart)+6)+'};'
const compiledOuter=bundle.slice(bundle.indexOf('function closeRejection('),bundle.indexOf('function reply(',bundle.indexOf('function closeRejection(')))
for(const kind of candidate?['compiled']:['source'])for(const scenario of ['validation-success','start-error-cleanup-confirmed','start-error-cleanup-refused','checked-cleanup-refused','checked-missing-receipt','checked-persistence-refused','readiness-start-error-cleanup-refused','readiness-start-error-cleanup-confirmed'])for(const rejected of [Error('fixture native refusal'),undefined,null,false,0,'']) test(kind+' validation retention '+scenario+' '+String(rejected),async()=>{
  const directory=await mkdtemp(join(tmpdir(),'review-validation-retention-'))
  try {
    const stateDir=join(directory,'host'),resources=join(directory,'resources')
    await mkdir(stateDir,{recursive:true});await mkdir(resources,{recursive:true})
    await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'https://fixture.invalid'}))
    const refused=scenario.endsWith('cleanup-refused')||scenario==='checked-missing-receipt'||scenario==='checked-persistence-refused'
    const startError=scenario.includes('start-error')
    const events:string[]=[]
    let capturedDirectory='',closeCalls=0,fakeExited=false,returnedHandle=false
    const fakeChild=new EventEmitter() as EventEmitter & {connected:boolean;send:Function;kill:Function}
    fakeChild.connected=true
    fakeChild.kill=()=>{throw Error('UNEXPECTED_FIXTURE_KILL')}
    fakeChild.send=(message:any,callback:Function)=>{
      callback?.()
      void (async()=>{
        if(message.operation==='start') {
          capturedDirectory=join(message.input.stateDir,'generations',String(message.input.generation),'chats',message.input.chat)
          await mkdir(capturedDirectory,{recursive:true})
          await writeFile(join(capturedDirectory,'startup-cleanup.json'),JSON.stringify({fixture:true,cleanup_complete:!refused,authentication_rejection:rejection(Error('original authentication')),native_rejection:rejection(rejected),persistence_failure:scenario==='checked-persistence-refused'?rejection(Error('EISDIR')):undefined}))
          events.push('fixture.start')
          fakeChild.emit('message',startError?{id:message.id,error:'LOGINOM_LOGIN_UNAVAILABLE'}:
            {id:message.id,result:{checked:true,protocol:1,generation:message.input.generation}})
        } else if(message.operation==='close') {
          closeCalls++;events.push('fixture.close')
          fakeChild.emit('message',scenario==='checked-missing-receipt'?{id:message.id,result:undefined}:
            refused?{id:message.id,error:scenario==='checked-persistence-refused'?Error('EISDIR',{cause:rejected}):rejected}:
            {id:message.id,result:{closed:true}})
          if(!refused){fakeExited=true;fakeChild.emit('exit',0,null)}
        } else throw Error('UNEXPECTED_FIXTURE_OPERATION')
      })().catch(error=>fakeChild.emit('error',error))
    }
    const symbols:any={Error,AggregateError,Promise,Map,Set,JSON,process:{platform:'linux',env:{}},
      randomUUID,randomUUID5:randomUUID,join,join5:join,isAbsolute,isAbsolute2:isAbsolute,
      mkdir,mkdir2:mkdir,readFile,readFile2:readFile,rm,rm3:rm,setTimeout,clearTimeout,
      fork:()=>fakeChild,inputStore:()=>({}),recoveryStore:async()=>({}),connectionStore:()=>({})}
    const supervised=vm.runInNewContext((kind==='source'?sourceSupervisor:compiledSupervisor)+';supervise',symbols)
    symbols.supervise=async(input:any)=>{
      const handle=await supervised(input)
      returnedHandle=true
      return handle
    }
    const serviceState:any={revision:0,generation:0,phase:'unconfigured'}
    symbols.connectionService=async(_store:any,adapter:any)=>{
      // Fresh validation failure has no prepared handle. Use the actual close
      // implementation with that exact state; public schema/API are fixtures.
      const close=vm.runInNewContext((kind==='source'?sourceClose:compiledClose)+';closeContainer.close',
        {state:serviceState,runtime:adapter,Error,Promise,clearValidations:()=>events.push('fixture.clearValidations')})
      return {api:{check:(connection:any)=>scenario.startsWith('readiness-')?adapter.prepare(connection):adapter.check(connection),save:async()=>{},acknowledgeRecovery:async()=>{}},acquire:()=>({fixture:true}),close}
    }
    const factory=vm.runInNewContext((kind==='source'?sourceHost:compiledHost)+';createLoginomHost',symbols)
    const actualHost=await factory({root:stateDir,resources,codec:{},environment:{}})
    let checkError:any
    try {await actualHost.api.check({generation:1,url:'https://fixture.invalid',username:'fixture',password:'',apiKey:'fixture'})}
    catch(error){checkError=error}
    assert(capturedDirectory)
    const evidenceDirectoryExists=await stat(capturedDirectory).then(()=>true,()=>false)
    const originalEvidence=evidenceDirectoryExists?await readFile(join(capturedDirectory,'startup-cleanup.json')):undefined
    let portCloseCalls=0
    const outerState:any={host:actualHost,root:stateDir,port:{close:async()=>{portCloseCalls++;events.push('fixture.port.close')}}}
    const outer=vm.runInNewContext((kind==='source'?sourceOuter:compiledOuter)+';stop',{
      state:outerState,operations:new Set(),writeFile,writeFile2:writeFile,join,join7:join,Error,Promise,
      events:{emit:()=>events.push('fixture.outer.closed')}})
    let outerFailure:any,outerFailed=false
    try {await outer()}catch(error){outerFailure=error;outerFailed=true}
    const stages=JSON.parse(await readFile(join(stateDir,'host-shutdown.json'),'utf8')).stages
    assert.equal(evidenceDirectoryExists,startError||refused)
    assert.equal(outerFailed,refused)
    assert.equal(portCloseCalls,refused?0:1)
    assert.equal(fakeExited,!refused)
    if(refused){
      assert(checkError)
      assert.equal(outerFailure.message,'LOGINOM_HOST_CLEANUP_FAILED')
      assert(!stages.some((s:any)=>s.stage==='outer_acknowledgement'&&s.status==='prepared'))
      assert.equal(actualHost.acquire('forbidden'),undefined)
      await assert.rejects(actualHost.api.check({}),/LOGINOM_RUNTIME_CLEANUP_FAILED/)
      await assert.rejects(actualHost.api.save({}),/LOGINOM_RUNTIME_CLEANUP_FAILED/)
      await assert.rejects(actualHost.api.acknowledgeRecovery({}),/LOGINOM_RUNTIME_CLEANUP_FAILED/)
      const proof=JSON.parse(await readFile(join(capturedDirectory,'startup-cleanup.json'),'utf8'))
      assert.equal(proof.cleanup_complete,false)
      assert.deepEqual(await readFile(join(capturedDirectory,'startup-cleanup.json')),originalEvidence)
      const unwrap=(value:any):any=>value instanceof Error&&Object.hasOwn(value,'cause')?unwrap(value.cause):value
      assert.equal(unwrap(outerFailure),scenario==='checked-missing-receipt'?undefined:rejected)
      assert.equal(closeCalls,2) // Same child; no fork/acquire or native replay.
    }else{
      assert.equal(closeCalls,1)
      assert(stages.some((s:any)=>s.stage==='outer_acknowledgement'&&s.status==='prepared'))
      assert.equal(checkError?.message,startError?'LOGINOM_LOGIN_UNAVAILABLE':undefined)
    }
    if(output)await writeFile(join(output,kind+'-'+scenario+'-'+String(rejected)+'.json'),JSON.stringify({fixture:true,scenario,
      evidenceDirectoryExists,closeCalls,fakeExited,portCloseCalls,outerFailed,stages,events},null,2)+'\n')
  } finally {await rm(directory,{recursive:true,force:true})}
})

// Exact service check/close with an in-flight validation; schema/store adapters
// are fixtures. No fork, authenticated Page or network operation is performed.
for(const rejected of [Error('authentication original'),undefined,null,false,0,''])test('service waits for validation and preserves cause '+String(rejected),async()=>{
 const checkStart=service.indexOf('    async check(input)')
 const sourceCheck=transpiler.transformSync('const api={'+service.slice(checkStart,service.indexOf('    async save(input)',checkStart))+'};')
 const compiledCheckStart=bundle.indexOf('    async check(input)',bundle.indexOf('async function connectionService('))
 const compiledCheck='const api={'+bundle.slice(compiledCheckStart,bundle.indexOf('    async save(input)',compiledCheckStart))+'};'
 let release:any,started=false,cleanup=false
 const validation=new Promise<void>((_,reject)=>release=()=>reject(rejected))
 const persistence=Error('fixture persistence refusal',{cause:rejected})
 const runtime={check:()=>{started=true;return validation},close:async()=>{cleanup=true;throw persistence}}
 const state:any={revision:0,generation:0,phase:'unconfigured'}
 const input={revision:0,url:'https://fixture.invalid',username:'fixture',apiKey:{operation:'replace',value:'fixture'},password:{operation:'empty'}}
 const symbols:any={state,runtime,Error,Promise,Date,setTimeout,clearTimeout,randomUUID,validations:new Map(),
  Option:{isNone:()=>false},decodeCandidate:()=>({value:input}),validateAddress:()=>{},settingsAddress:(s:string)=>s,
  progress:()=>{},clearValidations:()=>{throw Error('premature acknowledgement')}}
 for(let i=2;i<10;i++){symbols['randomUUID'+i]=randomUUID;symbols['Option'+i]=symbols.Option}
 const api=vm.runInNewContext((candidate?compiledCheck:sourceCheck)+';api',symbols)
 const close=vm.runInNewContext((candidate?compiledClose:sourceClose)+';closeContainer.close',symbols)
 const checking=api.check(input);let checkFailure:any
 void checking.catch((error:any)=>checkFailure=error)
 assert.equal(started,true)
 await assert.rejects(api.check(input),/LOGINOM_APPLICATION_PENDING/)
 const closing=close();let closeFailure:any;void closing.catch((error:any)=>closeFailure=error)
 await Promise.resolve();await Promise.resolve();assert.equal(cleanup,false)
 release();await checking.catch(()=>{})
 await assert.rejects(closing,error=>error===persistence)
 assert.equal(checkFailure.cause,rejected);assert.equal(closeFailure,persistence);assert.equal(state.handle,undefined)
 assert.equal(cleanup,true)
})
