// Native/runtime/connection services are explicit doubles; actual private host port and RPC transport.
import {test, expect} from "bun:test"
import {EventEmitter} from "node:events"
import {createHash} from "node:crypto"
if (process.env.CAPTURE_PORT_BUNDLE) process.send = (() => true) as typeof process.send
const {loginomHostPort}=await import(process.env.CAPTURE_PORT_BUNDLE ?? new URL('../src/host-port.ts',import.meta.url).href)
import {transport} from "../src/transport"

function fixture() {
  const messages=new EventEmitter(), replies=new EventEmitter(), events:string[]=[], pending:string[]=[]
  let binding:any, result:any={cleanupComplete:true}, blocked:Promise<void>|undefined
  const lease={generation:7,release(){events.push("release")},holdRecovery(){events.push("hold")},reconciled(){}}
  const service:any={recoveries:new Map(),acquire:()=>lease,retireRuntime:async()=>{},resetRestarts(){},
    captureHarness:()=>"field-parameters-preservation-v1",captureBinding:()=>binding,
    authorizeCapture:(value:unknown)=>value==="trusted-private-capability",
    bindCapture:(owner:string,run:string,chat:string,actual:unknown)=>{expect(actual).toBe(lease);binding={owner,run,chat,generation:lease.generation,lease:owner+":"+run,account:"worker",packagePath:"/worker/fp.lgp",admission:"fixture",expires:Date.now()+60000}},
    journal:{pending:()=>pending,begin:async()=>{events.push("begin");return "operation"},
      settle:async(_:string,known:boolean)=>{events.push(known?"settle":"uncertain");if(!known)pending.push("operation")}},
    runtime:async(g:number,chat:string)=>{expect(g).toBe(binding.generation);expect(chat).toBe(binding.chat);return {
      request:async(operation:string)=>{if(operation==="call")return {result:{sameOwner:true}};events.push(operation);await blocked;events.push("durable-native-cleanup");return result},
      close:async()=>{events.push("runtime-close")}}}}
  const port=loginomHostPort({on:messages.on.bind(messages),postMessage:(value:unknown)=>replies.emit("message",{data:value}),start(){}},service)
  const client=transport({on:replies.on.bind(replies),postMessage:value=>messages.emit("message",{data:value}),start(){}})
  return {events,pending,port,client,get binding(){return binding},setResult(value:any){result=value},block(value:Promise<void>){blocked=value},
    acquire:()=>client.request("acquire",{run:"original-run",session:"original-chat"}),
    capture:(patch:object={})=>client.request("acceptance.capture",{run:"original-run",authorization:"trusted-private-capability",...patch})}
}


function draft(f:any){return {cleanupComplete:false,draftRetained:true,stoppedBeforeDone:true,draft:{kind:'field_parameters_preservation_draft',stopped_before_done:true,settings_applied:false,execution_started:false,owner:{...f.binding}}}}
test('FP host port retains exact owner/lease/journal; draft forbids Close/release ACK',async()=>{const f=fixture();await f.acquire();const result=draft(f);f.setResult(result);expect(await f.capture()).toEqual(result);expect(f.events).not.toContain('runtime-close');expect(f.events).not.toContain('release');expect(f.events).toContain('hold');expect(f.events).toContain('uncertain');await expect(f.client.request('release',{run:'original-run'})).rejects.toThrow();await expect(f.capture()).rejects.toThrow();await expect(f.port.close()).rejects.toThrow();f.client.close()});
for(const key of ['owner','run','lease','generation','chat','account','packagePath','admission','expires'])test('FP host port refuses changed receipt '+key,async()=>{const f=fixture();await f.acquire();const result=draft(f);result.draft.owner[key]='foreign';f.setResult(result);await expect(f.capture()).rejects.toThrow();expect(f.events).not.toContain('runtime-close');expect(f.events).not.toContain('release');expect(f.pending).toContain('operation');await expect(f.port.close()).rejects.toThrow();f.client.close()});
for(const result of [{cleanupComplete:true},{cleanupComplete:false,draftRetained:true,stoppedBeforeDone:false},false,0,'',null,undefined])test('FP does not admit completion/falsy instead of retained draft '+String(result),async()=>{const f=fixture();await f.acquire();f.setResult(result);await expect(f.capture()).rejects.toThrow();expect(f.events).not.toContain('runtime-close');expect(f.events).not.toContain('release');await expect(f.port.close()).rejects.toThrow();f.client.close()});
