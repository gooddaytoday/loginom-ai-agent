import {test,expect} from 'bun:test'
import {EventEmitter} from 'node:events'
import vm from 'node:vm'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import * as Adapter from '../src/adapter'
import {transport} from '../src/transport'
import {loginomHostPort as sourcePort} from '../src/host-port'
import {recoveryStore} from '../src/connection/recovery-store'
import {connectionStore} from '../src/connection/connection-store'
import {connectionService} from '../src/connection/connection-service'
const {validateActionParameters}=await import(new URL('../../loginom-runtime/client/lib/action-catalog.mjs',import.meta.url).href)
const {workspaceObserveTool}=await import(new URL('../../loginom-runtime/client/lib/workspace.mjs',import.meta.url).href)
// Production managed handle and bridge policy in VM; Page/native/external SDK
// and service launch are doubles. Real Adapter/transport/port/leases/journal/FS.
if(process.env.READONLY_HOST_BUNDLE)process.send=(()=>true) as any
const portFunction=process.env.READONLY_HOST_BUNDLE?(await import(process.env.READONLY_HOST_BUNDLE)).loginomHostPort:sourcePort
const resource=process.env.READONLY_RUNTIME_ROOT??new URL('../../loginom-runtime/',import.meta.url).pathname
const bridge=await readFile(join(resource,'client/lib/bridge.mjs'),'utf8'),managed=await readFile(join(resource,'src/managed-entry.mjs'),'utf8')
const policy=bridge.includes('    function readonlyContinuation(')?bridge.slice(bridge.indexOf('    function readonlyContinuation('),bridge.indexOf('    return {server,catalog,captureAcceptance,')):'function readonlyContinuation(){return false}'
const handle=managed.slice(managed.indexOf('async function handle(message)'))
const scenarios=['normal','invalid-args','mutation','pending','running','unknown','native-dispatched','confirmed-cleanup','capture-consumed','writer-retained','clipboard','foreign-owner','foreign-page','foreign-account','late-replacement','late-generation','late-chat','late-page-await','late-running','late-pending','missing-flag','error','undefined','null','false','zero','empty']
for(const scenario of scenarios)test('linked readonly continuation: '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'readonly-linked-'));let connection:any;
 const parent=new EventEmitter(),child=new EventEmitter();let stale=0,lookups=0,dispatches=0,acquires=0;
 const journal=await recoveryStore(join(directory,'recovery'),{strict:true});
 const store=connectionStore(join(directory,'connection'),{encode:async(v:any)=>v,decode:async(v:any)=>v});
 await store.stage({generation:7,revision:1,url:'http://fixture.invalid',username:'user',apiKey:'test-only',password:'test-only'});await store.activate(7);
 connection=await connectionService(store,{check:async()=>{},prepare:async()=>({close:async()=>{}})},journal);await connection.settled();
 const owner:any={id:'original-owner',account:'user',origin:'http://fixture.invalid',generation:7,chat:'a'.repeat(64),page:{},context:{}},original=Object.freeze({owner,id:owner.id,account:owner.account,origin:owner.origin,generation:owner.generation,chat:owner.chat,page:owner.page,context:owner.context});
 const raw=Error('original guard',{cause:0});const globals:any={readonlyCleanupRefusal:true,nativeCleanupDispatched:false,confirmedCleanup:undefined,shutdownStarted:false,captureConsumed:false,captureInFlight:undefined,captureUnknown:false,captureWriters:new Set(),cleanupWriters:new Set(),clipboardUncertain:false,heldLeases:new Set(),actionRuntime:{hasUnsettledWork:()=>globals.unknown===true,hasActiveWork:()=>globals.running===true},workspaceObserveTool,validateActionParameters};
 const readPolicy=vm.runInNewContext(policy+';readonlyContinuation',globals);
 const state:any={startupOwner:owner,startupBinding:original,session:{metadata:{sessionId:'s'},directory},bridge:{readonlyContinuation:readPolicy,hasUnsettledWork:()=>true,hasActiveWork:()=>globals.running===true},client:{callTool:async()=>{dispatches++;return raw}}};
 state.readonlyBinding=Object.freeze({startup:original,owner,bridge:state.bridge,client:state.client,session:state.session,metadata:state.session.metadata,directory:state.session.directory,sessionId:state.session.metadata.sessionId});
 let reply:any;const api=vm.runInNewContext(handle+';({handle})',{state,Error,AbortController,send:(v:any)=>reply=v});
 const runtime={request:async(op:string,input:any)=>{reply=undefined;await api.handle({id:'managed',operation:op,input});if(reply.error)throw Error(reply.error);return scenario==='missing-flag'?{...reply.result,readonlyContinuation:undefined}:reply.result}};
 const service:any={recoveries:new Map(),journal,acquire:(run:string)=>{acquires++;return connection.acquire(run)},retireRuntime:async()=>{},resetRestarts(){},bindCapture(){},runtime:async()=>{lookups++;return runtime},markRuntimeStale(){stale++}};
 const hostPort=portFunction({on:child.on.bind(child),start(){},postMessage:(v:any)=>parent.emit('message',{data:v})},service);
 const hostOwner={deferRelease:true,leases:new Set<any>()};Adapter.connect({on:parent.on.bind(parent),start(){},postMessage:(v:any)=>child.emit('message',{data:v})},hostOwner);
 try{
  const lease=await Adapter.acquire('original-chat');
  for(const [name,key] of [['running','running'],['unknown','unknown'],['native-dispatched','nativeCleanupDispatched'],['capture-consumed','captureConsumed'],['clipboard','clipboardUncertain']])if(scenario===name)globals[key]=true;
  if(scenario==='confirmed-cleanup')globals.confirmedCleanup={};if(scenario==='writer-retained')globals.captureWriters.add({});
  if(scenario==='foreign-owner')state.startupOwner={...owner};if(scenario==='foreign-page')owner.page={};if(scenario==='foreign-account')owner.account='foreign';
  if(scenario==='pending'){const id=await journal.begin('a'.repeat(64),7);await journal.settle(id,false);await expect(lease!.call('dock_workspace_observe',{scope:'all'},'read')).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');expect(dispatches).toBe(0);return}
  if(['foreign-owner','foreign-page','foreign-account'].includes(scenario)){
   await expect(lease!.call('dock_workspace_observe',{scope:'all'},'read')).rejects.toThrow();expect(dispatches).toBe(0);return
  }
  expect(await lease!.call('dock_workspace_observe',{scope:'all'},'read')).toBe(raw);
  const safe=!['running','unknown','native-dispatched','confirmed-cleanup','capture-consumed','writer-retained','clipboard','foreign-owner','foreign-page','foreign-account','missing-flag'].includes(scenario);
  if(!safe){expect(stale).toBe(scenario==='running'?0:1);return}
  expect(stale).toBe(0);expect(journal.pending()).toEqual([]);expect(service.recoveries.size).toBe(1);
  const beforeLookups=lookups;
  if(scenario==='late-replacement')state.startupOwner={...owner};if(scenario==='late-generation')owner.generation++;if(scenario==='late-chat')owner.chat='b'.repeat(64);if(scenario==='late-page-await')state.client.callTool=async()=>{dispatches++;owner.page={};return raw};if(scenario==='late-running')globals.running=true;
  if(scenario==='late-pending'){const id=await journal.begin('b'.repeat(64),7);await journal.settle(id,false)}
  const values:any={error:Error('read rejection',{cause:false}),undefined:undefined,null:null,false:false,zero:0,empty:''};
  if(Object.hasOwn(values,scenario))state.client.callTool=async()=>{dispatches++;throw values[scenario]};
  const name=scenario==='mutation'?'dock_ui_action':'dock_diagnostics',args=scenario==='invalid-args'?{checkConnections:false,code:'forbidden'}:{checkConnections:false};
  if(['late-replacement','late-generation','late-chat','late-page-await','late-running','late-pending','mutation','invalid-args',...Object.keys(values)].includes(scenario)){
   await expect(lease!.call(name,args,'same owner')).rejects.toThrow();expect(dispatches).toBe(Object.hasOwn(values,scenario)||scenario==='late-page-await'?2:1);
  }else{expect(await lease!.call(name,args,'same owner')).toBe(raw);expect(dispatches).toBe(2)}
  expect(lookups).toBe(beforeLookups);expect(stale).toBe(0);expect(acquires).toBe(1);expect(hostOwner.leases.size).toBe(1);expect(service.recoveries.size).toBe(1);expect(raw.cause).toBe(0);
  await expect(lease!.call('dock_action_run',{},'no mutation')).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');
  await expect(Adapter.acquire('original-chat')).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');
  expect(acquires).toBe(1);await expect(hostPort.close()).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');
  const foreign=transport({on:parent.on.bind(parent),start(){},postMessage:(v:any)=>child.emit('message',{data:v})});
  await expect(foreign.request('call',{run:'foreign-run',name:'dock_diagnostics',args:{checkConnections:false}})).rejects.toThrow('LOGINOM_HOST_REQUEST_FAILED');foreign.close();
 }finally{Adapter.disconnect();await connection.close();await rm(directory,{recursive:true,force:true})}
})
