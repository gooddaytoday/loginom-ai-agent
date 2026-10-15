import {test, expect} from "bun:test"
import {EventEmitter} from "node:events"
import {createHash} from "node:crypto"
if (process.env.CAPTURE_PORT_BUNDLE) process.send = (() => true) as typeof process.send
const {loginomHostPort}=await import(process.env.CAPTURE_PORT_BUNDLE ?? new URL('../src/host-port.ts',import.meta.url).href)
import {transport} from "../src/transport"

function fixture(importKind=false) {
  const messages=new EventEmitter(), replies=new EventEmitter(), events:string[]=[], pending:string[]=[]
  let binding:any, result:any={cleanupComplete:true}, blocked:Promise<void>|undefined
  const lease={generation:7,release(){events.push("release")},holdRecovery(){events.push("hold")},reconciled(){}}
  const service:any={recoveries:new Map(),acquire:()=>lease,retireRuntime:async()=>{},resetRestarts(){},
    authorizeCapture:(value:unknown,owner:string,run:string,chat:string,actual:unknown,harness?:string)=> (harness===undefined || importKind && harness==="import-before-configure-v1") && value==="trusted-private-capability"
      &&owner===binding?.owner&&run===binding?.run&&chat===binding?.chat&&actual===lease,
    bindCapture:(owner:string,run:string,chat:string,actual:unknown)=>{expect(actual).toBe(lease);binding={owner,run,chat,generation:lease.generation}},
    journal:{pending:()=>pending,begin:async()=>{events.push("begin");return "operation"},
      settle:async(_:string,known:boolean)=>{events.push(known?"settle":"uncertain");if(!known)pending.push("operation")}},
    runtime:async(g:number,chat:string)=>{expect(g).toBe(binding.generation);expect(chat).toBe(binding.chat);return {
      request:async(operation:string,input?:unknown)=>{if(operation==="call")return {result:{sameOwner:true}};events.push(operation);if(input)events.push(JSON.stringify(input));await blocked;events.push("durable-native-cleanup");return result},
      close:async()=>{events.push("runtime-close")}}}}
  const port=loginomHostPort({on:messages.on.bind(messages),postMessage:(value:unknown)=>replies.emit("message",{data:value}),start(){}},service)
  const client=transport({on:replies.on.bind(replies),postMessage:value=>messages.emit("message",{data:value}),start(){}})
  return {events,pending,port,client,get binding(){return binding},setResult(value:any){result=value},block(value:Promise<void>){blocked=value},
    acquire:()=>client.request("acquire",{run:"original-run",session:"original-chat"}),
    capture:(patch:object={})=>client.request("acceptance.capture",{run:"original-run",authorization:"trusted-private-capability",...patch})}
}

test("capture derives binding from the actual retained lease; cleanup and exit precede release",async()=>{
 const f=fixture();await f.acquire();expect(f.binding).toMatchObject({run:"original-run",generation:7,
   chat:createHash("sha256").update("original-chat").digest("hex")})
 expect(await f.capture()).toEqual({cleanupComplete:true});await expect(f.capture()).rejects.toThrow()
 await f.client.request("release",{run:"original-run"});await f.port.close()
 expect(f.events).toEqual(["begin","acceptance.capture","durable-native-cleanup","runtime-close","settle","release"])
 f.client.close()
})
for(const patch of [{authorization:"random-admission-id"},{run:"foreign"},{generation:7},{harness:"arbitrary"},{code:"evil"}])
 test("private capture rejects structural authority or foreign identity "+JSON.stringify(patch),async()=>{
  const f=fixture();await f.acquire();await expect(f.capture(patch)).rejects.toThrow();expect(f.events).toEqual([])
  await f.port.close();f.client.close()
 })
test("pending refuses before dispatch",async()=>{
 const f=fixture();await f.acquire();f.pending.push("historical");await expect(f.capture()).rejects.toThrow();expect(f.events).toEqual([])
 await expect(f.port.close()).rejects.toThrow();f.client.close()
})
test("capture keeps the lease while pending and rejects concurrent release and call",async()=>{
 const f=fixture();await f.acquire();let resolve!:()=>void;f.block(new Promise<void>(r=>resolve=r));const capture=f.capture()
 await Bun.sleep(5);await expect(f.client.request("release",{run:"original-run"})).rejects.toThrow()
 await expect(f.client.request("call",{run:"original-run",name:"mutation",userMessage:"x"})).rejects.toThrow()
 expect(f.events).not.toContain("release");resolve();await capture;await f.port.close();f.client.close()
})
for(const rejected of [false,0,"",null,undefined])test("capture refusal retains exact falsy value "+String(rejected),async()=>{
 const f=fixture();await f.acquire();const value={cleanupComplete:false,refused:true,rejected,rejectedIsUndefined:rejected===undefined};f.setResult(value)
 expect(await f.capture()).toEqual(value);expect(f.events).not.toContain("runtime-close")
 await expect(f.client.request("release",{run:"original-run"})).rejects.toThrow();await expect(f.capture()).rejects.toThrow()
 await expect(f.port.close()).rejects.toThrow();expect(f.events).not.toContain("release")
 expect(await f.client.request("call",{run:"original-run",name:"dock_diagnostics",args:{checkConnections:false}})).toEqual({sameOwner:true})
 expect(f.pending).toEqual(["operation"]);f.client.close()
})

for(const allowed of [false,true])test('original opening request requires actual Import kind grant '+allowed,async()=>{
 const f=fixture(allowed);await f.acquire();const request={operation_id:'original-opening',target:{kind:'existing',type:'imports.text'}};
 if(!allowed){await expect(f.capture({request})).rejects.toThrow();expect(f.events).toEqual([]);await f.port.close();}
 else {f.setResult({cleanupComplete:false,diagnosticRead:true});await f.capture({request});
  expect(f.events).toContain(JSON.stringify({request}));expect(f.events).not.toContain('runtime-close');
  await expect(f.capture({request})).rejects.toThrow();await expect(f.port.close()).rejects.toThrow();}
 f.client.close();
})
