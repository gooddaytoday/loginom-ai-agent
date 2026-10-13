import {test,expect} from 'bun:test'
import vm from 'node:vm'
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const runtime=process.env.CONTROL_RUNTIME_ROOT!,host=process.env.CONTROL_HOST_MODULE!
const {captureAmount,...amountExports}=await import(runtime+'/src/acceptance/amount-import-type-v1.mjs')
const {validateStartInput}=await import(runtime+'/src/start-input.mjs')
// Test-only private IPC presence for importing the exact installed host copy.
if(process.env.CONTROL_ACTUAL)process.send=(()=>true) as typeof process.send
const {supervise}=await import(host)
const report=(stage,value)=>console.log(JSON.stringify({stage,...value,native:false,qualification:'stock-route missing control, not a native authority PASS'}))
const binding=()=>({revision:1,harness:'amount-import-type-v1',owner:'own',run:'run',lease:'own:run',generation:7,chat:'chat',account:'worker',packagePath:'/worker/result.lgp',admission:'admission',session:'session',expires:Date.now()+600000})
const identity={session_id:'session',account:'worker',package_path:'/worker/result.lgp',document_id:'doc',tab_tid:'tab',loginom_build:'7.4.2'}
test('selected fixed Amount does not opt into retained readonly registration',()=>{
 expect(amountExports.captureMode).toBeUndefined();expect(amountExports.validateCaptureResult).toBeUndefined()
 report('fixed-registration',{readonly_registration:false})
})
test('fixed Amount does not consume supplied original cancellation/deadline (first RPC is a labelled double)',async()=>{
 const caller=new AbortController();caller.abort(Error('original caller cancelled'));const deadline=Date.now()-1
 const primary=Error('stop before any Page read',{cause:0});let calls=0,timeout:number|undefined
 const browser={callTool:async(_request:any,_schema:any,options:any)=>{calls++;timeout=options.timeout;throw primary}}
 try{await captureAmount({binding:binding(),identity,browser,record:async()=>{},signal:caller.signal,deadline} as any);throw Error('probe did not stop')}catch(value){expect(value).toBe(primary)}
 expect(calls).toBe(1);expect(timeout!>0&&timeout!<=120000).toBe(true)
 report('amount-first-rpc',{original_aborted:caller.signal.aborted,original_deadline:deadline,rpc_calls:calls,rpc_timeout:timeout,original_control_consumed:false,primary_cause_preserved:true})
})
test('managed capture mints child-local signal independently of original caller',async()=>{
 const text=await readFile(runtime+'/src/managed-entry.mjs','utf8');const start=text.indexOf('    if (message.operation === "acceptance.capture") {'),end=text.indexOf('    if (message.operation === "admit")',start)
 const caller=new AbortController();caller.abort();let observed:any,reply:any
 const state:any={bridge:{captureAcceptance:async(args:any)=>{observed=args;return {cleanupComplete:false,refused:true}}}}
 const run=vm.runInNewContext('(async()=>{'+text.slice(start,end)+'})',{message:{id:'probe',operation:'acceptance.capture'},state,AbortController,Error,Date,send:(v:any)=>reply=v,assertCaptureOwner:()=>{throw Error('unexpected retained registration')},closeRejection:(v:any)=>v})
 await run();expect(observed.signal).not.toBe(caller.signal);expect(observed.signal.aborted).toBe(false);expect(state.controller).toBeUndefined();expect(reply.result.refused).toBe(true)
 report('managed-local-control',{caller_aborted:true,child_aborted:false,same_signal:false})
})
test('bridge fixed legacy harness receives no original control or retained node',async()=>{
 const text=await readFile(runtime+'/client/lib/bridge.mjs','utf8');const start=text.indexOf('    async function captureAcceptance('),end=text.indexOf('    async function writeCleanupReceipt(',start)
 const b=binding();let args:any,retains=0,failures=0;const primary=false
 const state={acceptanceCapture:{binding:b,harness:async(value:any)=>{args=value;throw primary}},session:{metadata:{sessionId:'session',workspaceReady:true,targetIdentity:{loginom_build:'7.4.2'},workspacePreparation:{attempted:true,state:{loginom_account:'worker',document_id:'doc',workflow_ref:{tab_tid:'tab'}}}}},actionRuntime:{assertPreparationAllowed(){},hasUnsettledWork:()=>false,hasActiveWork:()=>false,retainCaptureNode(){retains++;throw Error('unexpected generic retention')}},captureConsumed:false,shutdownStarted:false,cleanupRefused:false,captureInFlight:undefined,captureEvidence:undefined,captureUnknown:false,captureRejected:false,captureRejection:undefined,captureIOAssert:undefined,diagnosticCapture:undefined,captureNodeOperation:'node-op',clipboardUncertain:false,heldLeases:new Set(),savedPackages:new Map([[b.packagePath,'save']]),managedSave:{sessionId:'session',documentId:'doc',tabTid:'tab',account:'worker',packagePath:b.packagePath,loginomBuild:'7.4.2'},browser:{fixture:true},browserGate:(f:any)=>f(),recordExecution:async()=>{},writeCaptureEvidence:async()=>{failures++},shutdownRejection:(x:any)=>({value:x}),Error,Date,Object,JSON}
 const fn=vm.runInNewContext(text.slice(start,end)+';captureAcceptance',state);const controller=new AbortController();controller.abort()
 try{await fn({signal:controller.signal});throw Error('probe did not stop')}catch(value){expect(value).toBe(primary)}
 expect(Object.keys(args).sort()).toEqual(['binding','browser','identity','record']);expect(retains).toBe(0);expect(failures).toBe(1)
 report('bridge-fixed-arguments',{keys:Object.keys(args).sort(),retained_node_calls:retains,caller_aborted:true,harness_called:true,first_falsy_preserved:true})
})
test('strict start binding refuses an invented deadline field',()=>{
 const b=binding();delete (b as any).session
 const input={protocol:1,generation:7,chat:'chat',stateDir:'/fixture',connection:{username:'worker'},acceptanceCapture:b}
 expect(validateStartInput(input).acceptanceCapture).toBe(b)
 expect(()=>validateStartInput({...input,acceptanceCapture:{...b,deadline:123}})).toThrow('LOGINOM_START_INVALID')
 report('private-start-shape',{invented_deadline_refused:true})
})
test('real supervisor IPC carries binding but no original control (owned fixture child; no browser)',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lab69-control-trace-'));let child:any
 try{
  const entry=join(dir,'child.mjs');await writeFile(entry,`let start;process.on('message',m=>{if(m.operation==='start'){start=m.input;process.send({id:m.id,result:{protocol:1,ready:true,generation:start.generation,chat:start.chat}})}if(m.operation==='acceptance.capture')process.send({id:m.id,result:{message_keys:Object.keys(m),input_keys:m.input?Object.keys(m.input):[],start_capture_keys:Object.keys(start.acceptanceCapture),binding:start.acceptanceCapture}});if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect())})`)
  const b=binding();delete (b as any).session
  child=await supervise({node:process.env.CONTROL_NODE!,entry,resources:dir,stateDir:dir,generation:7,chat:'chat',endpoint:'http://fixture.invalid',connection:{username:'worker',url:'http://fixture.invalid',apiKey:'fixture',password:'fixture'},acceptanceCapture:b,environment:{}})
  const value=await child.request('acceptance.capture');expect(value.binding).toEqual(b);expect(value.input_keys).toEqual([]);expect(value.message_keys).not.toContain('signal');expect(value.message_keys).not.toContain('deadline');expect(value.start_capture_keys).not.toContain('deadline')
  await child.close();expect((await child.exited).code).toBe(0);child=undefined
  report('supervisor-private-ipc',{message_keys:value.message_keys,input_keys:value.input_keys,original_control_fields_present:false,owner_run_lease_generation_chat_carried:true,fixture_child_closed:true})
 }finally{if(child)await child.close();await rm(dir,{recursive:true,force:true})}
})

if(!process.env.CONTROL_ACTUAL)test('private launcher source facade accepts run only; original controls are not passed',async()=>{
 const source=await readFile(process.env.CONTROL_SOURCE_ROOT+'/packages/loginom-host/src/node-client.ts','utf8');const line=source.split('\n').find(l=>l.includes('return { ...host, capture:'))!
 const code=line.trim().replace(/^return /,'').replace(/;$/,'');let call:any
 const facade=vm.runInNewContext(new Bun.Transpiler({loader:'ts'}).transformSync('globalThis.__facade='+code+';')+'\n__facade',{host:{request:(...args:any[])=>{call=args;return true}},grant:{authorization:'private'}})
 const signal=new AbortController().signal;await facade.capture('run',{signal,deadline:1})
 expect(call).toEqual(['acceptance.capture',{run:'run',authorization:'private'}])
 report('launcher-source-facade',{arguments:call[1],control_forwarded:false,actual_binary_entry:'opaque; this is source facade only'})
})
