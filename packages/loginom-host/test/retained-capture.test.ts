import {test,expect} from 'bun:test'
import {EventEmitter} from 'node:events'
import vm from 'node:vm'
import {readFile,mkdtemp,rm,readdir} from 'node:fs/promises'
import {open,writeFile,fsync,close} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {transport} from '../src/transport'
import {connectionService} from '../src/connection/connection-service'
import {connectionStore} from '../src/connection/connection-store'
import {recoveryStore} from '../src/connection/recovery-store'
import {loginomHostPort} from '../src/host-port'
const root=process.env.RETAINED_RUNTIME_ROOT??new URL('../../loginom-runtime/',import.meta.url).pathname
const {retainCaptureOwner,bindCaptureRuntime,assertCaptureOwner,capturePublication,assertCapturePublication,freezeCaptureResult}=await import(process.env.RETAINED_HELPER_ENTRY??join(root,'src/retained-capture.mjs'))
const bridgeSource=await readFile(join(root,'client/lib/bridge.mjs'),'utf8')
const captureBody=bridgeSource.slice(bridgeSource.indexOf('    async function closeCaptureWriter('),bridgeSource.indexOf('    function closeBridge('))
const managedSource=await readFile(join(root,'src/managed-entry.mjs'),'utf8')
const managedBody=managedSource.slice(managedSource.indexOf('async function handle(message)'))
if(process.env.RETAINED_HOST_BUNDLE)process.send=(()=>true) as typeof process.send
const portFunction=process.env.RETAINED_HOST_BUNDLE?(await import(process.env.RETAINED_HOST_BUNDLE)).loginomHostPort:loginomHostPort

// Exact production managed dispatch, bridge capture and callback writer in VM;
// real port/transport, connection lease, strict journal and filesystem.
// Page, native opening/reader/validator and external SDK are labelled doubles.
const scenarios=['valid','missing-slot','foreign-page','foreign-owner','foreign-context','foreign-origin','foreign-account','foreign-generation','foreign-chat','foreign-session','foreign-bridge','foreign-client','pending','active','cancelled-node','expired-node',
  'foreign-publication','affirmative-result','calculator-receipt','accessor','late-page','late-request','late-deadline',
  'interrupt','pending-close','write-error','write-undefined','write-null','write-false','write-zero','write-empty','zero-write','error-journal','unknown-reader','duplicate','foreign-grant','stale-grant']
for(const scenario of scenarios)test('linked retained capture '+scenario,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'retained-linked-'))
  const journal=await recoveryStore(join(directory,'recovery'),{strict:true})
  const store=connectionStore(join(directory,'connection'),{encode:async v=>({apiKey:v.apiKey,password:v.password}),decode:async v=>{if(!('apiKey' in v)||!('password' in v))throw Error('invalid fixture secrets');return {apiKey:String(v.apiKey),password:String(v.password)}}})
  await store.stage({generation:7,revision:1,url:'http://fixture.invalid',username:'user',apiKey:'test-only',password:'test-only'})
  await store.activate(7)
  const connection=await connectionService(store,{check:async()=>{},prepare:async()=>({close:async()=>{}})},journal)
  await connection.settled()
  const parent=new EventEmitter(),child=new EventEmitter()
  const counters={read:0,validate:0,write:0,native:0,release:0}
  let bound:any,lease:any,state:any,managed:any,bridge:any,context:any
  const primary=Error('original reader',{cause:0}),nodeController=new AbortController()
  const writeFailures:any={error:primary,undefined:undefined,null:null,false:false,zero:0,empty:''}
  let finishClose:any,closeReady:any;const closed=new Promise<void>(resolve=>closeReady=resolve)
  const nodeRequest={operation_id:'own-node',document_id:'doc',workflow_ref:{workflow_id:'workflow',tab_tid:'tab'},inputs:[{port:0,connection:'own'}]}
  const opening={receipt_id:'own-node:open',status:'verified',value:{verified:true,cleanup_complete:true,epoch:'own'}}
  const nodeState={request:nodeRequest,node:{node_id:'node',document_id:'doc',workflow_id:'workflow'},deadline:Date.now()+60000,pending:null}
  const node=Object.freeze({request:nodeRequest,opening,state:nodeState,signal:nodeController.signal,deadline:nodeState.deadline,
    requestSha256:createHash('sha256').update(JSON.stringify(nodeRequest)).digest('hex'),
    openingSha256:createHash('sha256').update(JSON.stringify(opening)).digest('hex'),
    assertCurrent(){if(nodeController.signal.aborted || nodeState.pending || Date.now()>=nodeState.deadline
      || nodeState.deadline!==node.deadline || nodeRequest.operation_id!=='own-node')throw Error('node refused')}})
  const runtime={request:async(operation:string,input:unknown)=>{
    let response:any
    managed.send=(value:any)=>response=value
    await managed.handle({id:'managed',operation,input})
    if(response.error)throw Error(response.error)
    return response.result
  },close:async()=>{counters.release++}}
  const service:any={journal,recoveries:new Map(),acquire:(id:string)=>(lease=connection.acquire(id)),retireRuntime:async()=>{},resetRestarts(){},
    authorizeCapture:(value:unknown,owner:string,run:string,chat:string,actual:unknown)=>value==='trusted'&&actual===lease
      &&owner===bound.owner&&run===bound.run&&chat===bound.chat&&scenario!=='stale-grant',
    bindCapture(owner:string,run:string,chat:string){
      bound=Object.freeze({revision:1,harness:'calculator-grouped-before-done-v1',owner,run,lease:owner+':'+run,
        generation:7,chat,account:'user',packagePath:'/user/result.lgp',admission:'original',session:'session',expires:Date.now()+600000})
      const session={directory,metadata:{clientRevision:'a'.repeat(64),sessionId:'session',workspaceReady:true,targetIdentity:{loginom_build:'7.4.2'},
        workspacePreparation:{attempted:true,state:{loginom_account:'user',document_id:'doc',workflow_ref:{tab_tid:'tab'}}}}}
      const originalPage={isClosed:()=>false};
      const ownerState={id:'browser-owner',account:'user',origin:'http://fixture.invalid',generation:7,chat,context:{pages:()=>[originalPage]},page:originalPage}
      state={startupOwner:ownerState,session}
      state.captureStartupBinding=Object.freeze({...ownerState,owner:ownerState})
      const resource=Object.freeze({path:'runtime/src/acceptance/calculator-grouped-before-done-v1.mjs',sha256:'a'.repeat(64)})
      const retained=retainCaptureOwner(state,bound,resource);state.captureRetained=retained
      const registration=Object.freeze({mode:'readonly',resource,validate:async()=>{counters.validate++;return true}})
      const acceptanceCapture={binding:bound,retained:scenario==='missing-slot'?undefined:retained,registration,
        harness:async({publication,signal}:any)=>{
          counters.read++
          if(scenario==='unknown-reader')throw primary
          if(scenario==='late-page')ownerState.page={isClosed:()=>false}
          if(scenario==='late-request')nodeRequest.operation_id='foreign'
          if(scenario==='late-deadline')nodeState.deadline+=10000
          if(scenario==='interrupt')await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
          if(scenario==='calculator-receipt')return {cancel_verified:true,settings_applied:false}
          const receipt:any={status:'DIAGNOSTIC_READ',effect_possible:false,admission_confirmed:false,settings_applied:false,publication:{...publication},root:Object.fromEntries(['document_id','workflow_id','node_id','session_id','account','package_path'].map(key=>[key,publication[key]])),result:{input0:'labelled native double'}}
          if(scenario==='foreign-publication')receipt.publication.node_id='foreign'
          if(scenario==='affirmative-result')receipt.admission_confirmed=true
          if(scenario==='accessor')Object.defineProperty(receipt,'result',{get(){throw Error('must not evaluate')},enumerable:true})
          return receipt
        }}
      context=vm.createContext({acceptanceCapture,session,actionRuntime:{assertPreparationAllowed(){},retainCaptureNode:()=>node,
        hasUnsettledWork:()=>scenario==='pending',hasActiveWork:()=>scenario==='active'},
        captureNodeOperation:'own-node',captureIOAssert:undefined,diagnosticCapture:undefined,
        captureConsumed:false,shutdownStarted:false,cleanupRefused:false,clipboardUncertain:false,heldLeases:new Set(),
        captureWriters:new Set(),capturePersistenceFailures:[],capturePersistencePrimary:undefined,
        captureEvidenceBinding:undefined,captureEvidence:undefined,captureReceiptWritten:false,captureJournalWritten:false,
        captureInFlight:undefined,captureUnknown:false,captureRejected:false,captureRejection:undefined,
        savedPackages:new Map([[bound.packagePath,'save']]),managedSave:{sessionId:'session',documentId:'doc',tabTid:'tab',account:'user',packagePath:bound.packagePath,loginomBuild:'7.4.2'},
        browser:{},browserGate:(fn:any)=>fn(),readFile,join,assertCaptureOwner,capturePublication,assertCapturePublication,freezeCaptureResult,
        captureOpen:open,captureSync:fsync,captureClose:(fd:number,callback:any)=>{
          if(scenario==='pending-close'&&!finishClose)return close(fd,e=>{finishClose=()=>callback(e);closeReady()});return close(fd,callback)},captureWrite:(fd:number,bytes:string,cb:any)=>{
          counters.write++;if(scenario.startsWith('write-'))return new Promise<void>((resolve,reject)=>writeFile(fd,bytes,e=>{cb(e);reject(writeFailures[scenario.slice(6)])}));if(scenario==='zero-write')return new Promise<void>((resolve,reject)=>writeFile(fd,bytes,e=>{cb(e);reject(0)}));return writeFile(fd,bytes,cb)},
        recordExecution:async()=>{if(scenario==='error-journal')throw primary},
        shutdownRejection:(v:any)=>v instanceof Error?{kind:'Error',message:v.message,cause:v.cause}:{value:v,is_undefined:v===undefined},
        closeBridge:async()=>{counters.native++;return {}},Object,Error,JSON,Date,Set})
      bridge=vm.runInContext(captureBody+';({captureAcceptance})',context)
      state.bridge={...bridge,hasUnsettledWork:()=>true,hasActiveWork:()=>false}
      state.client={callTool:async()=>({sameOwner:true})}
      bindCaptureRuntime(retained,state.bridge,state.client)
      managed=vm.createContext({state,Error,AbortController,assertCaptureOwner,closeRejection:(v:any)=>({value:v instanceof Error?v.message:v,cause:v?.cause}),recordClose:async()=>{}})
      vm.runInContext(managedBody+';globalThis.handle=handle',managed)
      if(scenario==='foreign-page')ownerState.page={isClosed:()=>false}
      if(scenario==='foreign-owner')state.startupOwner={...ownerState}
      if(scenario==='foreign-context')ownerState.context={pages:()=>[]}
      if(scenario==='foreign-origin')ownerState.origin='foreign'
      if(scenario==='foreign-account')ownerState.account='foreign'
      if(scenario==='foreign-generation')ownerState.generation++
      if(scenario==='foreign-chat')ownerState.chat='foreign'
      if(scenario==='foreign-session')state.session={...session}
      if(scenario==='foreign-bridge')state.bridge={...state.bridge}
      if(scenario==='foreign-client')state.client={...state.client}
      if(scenario==='cancelled-node')nodeController.abort()
      if(scenario==='expired-node')nodeState.deadline=0
    },runtime:async()=>runtime}
  const port=portFunction({on:child.on.bind(child),start(){},postMessage:(v:any)=>parent.emit('message',{data:v})},service)
  const client=transport({on:parent.on.bind(parent),start(){},postMessage:v=>child.emit('message',{data:v})})
  try{
    await client.request('acquire',{run:'original-run',session:'original-chat'})
    if(scenario==='pending'){const id=await journal.begin(bound.chat,7);await journal.settle(id,false)}
    const pending=client.request('acceptance.capture',{run:'original-run',authorization:scenario==='foreign-grant'?'foreign':'trusted'}).then(result=>({result}),error=>({error}))
    if(scenario==='interrupt'){
      for(let wait=0;!state.controller&&wait<100;wait++)await Bun.sleep(1)
      expect(state.controller).toBeDefined()
      await client.request('interrupt',{run:'original-run'})
    }
    if(scenario==='pending-close'){let done=false;pending.then(()=>done=true);await closed;expect(done).toBe(false);expect(counters.release).toBe(0);finishClose()}
    const response:any=await pending
    const valid=['valid','duplicate','pending-close'].includes(scenario)
    if(valid){
      expect(response.result.diagnosticRead).toBe(true);expect(response.result.cleanupComplete).toBe(false)
      expect(JSON.parse(await readFile(join(directory,'acceptance-capture.json'),'utf8')).receipt.publication.deadline).toBe(node.deadline)
      expect(counters.read).toBe(1);expect(counters.validate).toBe(1)
    }else{
      expect(response.result?.diagnosticRead).toBeUndefined()
      if(!['zero-write','error-journal'].includes(scenario)&&!scenario.startsWith('write-'))expect(counters.write).toBe(0)
      if(scenario.startsWith('write-'))expect(vm.runInContext('captureRejection',context)).toBe(writeFailures[scenario.slice(6)])
      if(scenario==='zero-write')expect(vm.runInContext('captureRejection',context)).toBe(0)
      if(['unknown-reader','error-journal'].includes(scenario))expect(vm.runInContext('captureRejection',context)).toBe(primary)
    }
    if(!['foreign-grant','stale-grant','pending'].includes(scenario)){
      await expect(client.request('release',{run:'original-run'})).rejects.toThrow()
      await expect(client.request('acceptance.capture',{run:'original-run',authorization:'trusted'})).rejects.toThrow()
      await expect(port.close()).rejects.toThrow()
      expect(journal.pending()).toHaveLength(1)
    }
    expect(counters.native).toBe(0);expect(counters.release).toBe(0)
  }finally{client.close();await connection.close();await rm(directory,{recursive:true,force:true})}
})
