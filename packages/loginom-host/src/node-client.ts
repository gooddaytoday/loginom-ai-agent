import { fork } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, realpath } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { EventEmitter } from "node:events"
import { runtimeEnvironment } from "./supervisor"
import { privateNodeHostTransport, type Port } from "./transport"

type NodeHostInput = {
  node: string
  entry: string
  root: string
  resources: string
  headless: boolean
  environment?: NodeJS.ProcessEnv
  strictRecovery?: boolean
}
// Private original factory-channel registry. Projected IPC scalars are not an
// owner capability: acquisition/currentness must complete on this same channel.
type ParentRoot={port:Port;input:NodeHostInput;snapshot:NodeHostInput;alive():boolean;
 request:ReturnType<typeof privateNodeHostTransport>["requestOwnedAcquire"];call:ReturnType<typeof privateNodeHostTransport>["requestOwnedCall"];methods:Readonly<Port>;environment:string;runs:Map<string,ParentAcquisition>}
type ParentAcquisition={root:ParentRoot;run:string;session:string;phase:"pending"|"acquired"|"disposed"|"refused";
 value?:Readonly<{owner:string;run:string;lease:string;generation:number;chat:string;account:string}>;
 primary?:{value:unknown};secondary?:{value:unknown};checking?:boolean;capability:object;requestId?:string;pending?:boolean;control?:{signal:AbortSignal;deadline:number};signal?:AbortSignal;deadline?:number}
const originalParentPorts=new WeakMap<Port,ParentRoot>(),parentAcquisitions=new WeakMap<object,ParentAcquisition>()
function guardParent(p:ParentAcquisition) {
 if(p.primary)throw p.primary.value
 const r=p.root
 if(p.control){
  if(p.control.signal!==p.signal||p.control.deadline!==p.deadline){p.primary={value:Error("LOGINOM_ORIGINAL_HOST_OWNER_CHANGED")};throw p.primary.value}
  if(p.signal!.aborted){p.primary={value:p.signal!.reason};throw p.primary.value}
  if(Date.now()>=p.deadline!){p.primary={value:Error("LOGINOM_PRE_READY_READ_EXPIRED")};throw p.primary.value}
 }
 if(p.phase==="disposed" || !r.alive() || originalParentPorts.get(r.port)!==r || r.runs.get(p.run)!==p
    || ['postMessage','on','off','start','onClose'].some(k=>(r.port as any)[k] !== (r.methods as any)[k])
    || r.input.environment!==r.snapshot.environment || JSON.stringify(runtimeEnvironment(r.input.environment??process.env))!==r.environment
    || ["node","entry","root","resources","headless","strictRecovery","acceptanceCleanupPackage"].some(k=>(r.input as any)[k] !== (r.snapshot as any)[k]))
   {p.primary={value:Error("LOGINOM_ORIGINAL_HOST_OWNER_CHANGED")};p.phase='refused';throw p.primary.value}
}
function originalProjection(value:any,p:ParentAcquisition) {
 const t=value?.acquiredService
 if(!value || Object.keys(value).sort().join(',')!=='acquiredService,generation' || !t
    || Object.keys(t).sort().join(',')!=='account,chat,generation,lease,owner,phase,run'
    || t.phase!=='acquired-service' || t.run!==p.run || t.lease!==t.owner+':'+p.run
    || !Number.isSafeInteger(t.generation) || t.generation<1 || value.generation!==t.generation
    || !['owner','account'].every(k=>typeof t[k]==='string'&&t[k])
    || t.chat!==createHash('sha256').update(p.session).digest('hex'))throw Error('LOGINOM_ORIGINAL_HOST_REPLY_INVALID')
 return Object.freeze({owner:t.owner,run:t.run,lease:t.lease,generation:t.generation,chat:t.chat,account:t.account})
}
async function verifyOriginalParentInventory(p:ParentAcquisition) {
 const {root:r}=p,product=resolve(r.snapshot.resources,'../..')
 const cli=JSON.parse(await readFile(join(product,'cli-manifest.json'),'utf8'));guardParent(p)
 const manifest=JSON.parse(await readFile(join(r.snapshot.resources,'resource-manifest.json'),'utf8'));guardParent(p)
 if(cli.format!=='loginom-cli-artifact-v1' || !Array.isArray(cli.files) || !Array.isArray(manifest.files))throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 for(const[path,file,rows]of [['resources/loginom/host/node-host.mjs',r.snapshot.entry,cli.files],['bin/node',r.snapshot.node,manifest.files]] as const) {
  const pins=rows.filter((row:any)=>row.path===path)
  if(pins.length!==1 || pins[0].link || pins[0].directory || !/^[a-f0-9]{64}$/.test(pins[0].sha256))throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
  const canonical=await realpath(file);guardParent(p)
  if(canonical!==file)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
  const bytes=await readFile(file);guardParent(p)
  if(createHash('sha256').update(bytes).digest('hex')!==pins[0].sha256)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 }
}
export function hasOriginalNodeHostPort(port:Port) {return originalParentPorts.has(port)}
export async function acquireOriginalNodeHostOwner(port:Port,run:string,session:string,control?:{signal:AbortSignal;deadline:number}) {
 const root=originalParentPorts.get(port)
 if(!root || !run || !session || root.runs.has(run))throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 const capability=Object.freeze({}),p:ParentAcquisition={root,run,session,capability,phase:'pending',...(control?{control,signal:control.signal,deadline:control.deadline}:{})}
 root.runs.set(run,p);parentAcquisitions.set(capability,p);
 if(control&&!Number.isSafeInteger(p.deadline))throw Error("LOGINOM_PRE_READY_READ_EXPIRED");guardParent(p)
 try {
  await verifyOriginalParentInventory(p);guardParent(p)
  const value=await root.request({run,session,receiverPurpose:'union-acquired-service-v1'},p,p.control)
  guardParent(p);if(!value)throw Error('LOGINOM_HOST_NOT_READY');p.value=originalProjection(value,p);p.phase='acquired'
  return {capability,generation:p.value.generation}
 }catch(value){p.primary??={value};p.phase='refused';throw p.primary.value}
}
export function retainedOriginalNodeHostOwner(capability:object) {
 const p=parentAcquisitions.get(capability)
 if(!p || p.capability!==capability)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 guardParent(p)
 if(p.phase!=='acquired' || !p.value)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 return p.value
}
export async function assertOriginalNodeHostOwner(capability:object) {
 const p=parentAcquisitions.get(capability)
 if(!p || p.capability!==capability)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 guardParent(p)
 if(p.phase!=='acquired' || !p.value)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 if(p.checking)throw Error('LOGINOM_RECOVERY_REQUIRED')
 p.checking=true
 try {
  const value=await p.root.request({run:p.run,receiverPurpose:'union-acquired-service-v1',receiverPhase:'current'},p,p.control)
  guardParent(p);const next=originalProjection(value,p)
  if(Object.keys(next).some(k=>next[k as keyof typeof next]!==p.value![k as keyof typeof next]))throw Error('LOGINOM_ORIGINAL_HOST_OWNER_CHANGED')
  return p.value
 }catch(value){p.primary??={value};throw p.primary.value}finally{p.checking=false}
}
export function refuseOriginalUnionCreation(capability:object):never {
 const p=parentAcquisitions.get(capability)
 if(!p || p.capability!==capability)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 guardParent(p)
 if(p.phase!=='acquired')throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 throw Error('UNION_ORIGINAL_SDK_CREATION_UNAVAILABLE')
}
export function callOriginalNodeHostOwner(capability:object,input:{name:string;args:unknown;userMessage:string},control:{signal:AbortSignal;deadline:number}) {
 const p=parentAcquisitions.get(capability)
 if(!p || p.capability!==capability || p.phase!=='acquired')throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 guardParent(p)
 return p.root.call({run:p.run,...input,receiverPurpose:'row-filter-sdk-v1',deadline:control.deadline},p,control)
}
export function disposeOriginalNodeHostOwner(capability:object) {
 const p=parentAcquisitions.get(capability)
 if(!p || p.capability!==capability)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 p.phase='disposed'
}
export async function launchNodeHost(input:NodeHostInput) {
  const originalInput={...input}
  if (![input.node, input.entry, input.root, input.resources].every(isAbsolute))
    throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const environment = runtimeEnvironment(input.environment ?? process.env)
  const child = fork(input.entry, [], {
    execPath: input.node,
    execArgv: ["--use-system-ca"],
    env: environment,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  })
  const events = new EventEmitter()
  const state = { closed: false, closing: undefined as Promise<void> | undefined }
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once("exit", (code, signal) => {
      closePort()
      resolve({ code, signal })
    })
    child.once("error", () => {
      closePort()
      resolve({ code: 1, signal: null })
    })
  })
  function closePort() {
    if (state.closed) return
    state.closed = true
    const root=originalParentPorts.get(port);if(root)for(const p of root.runs.values())p.primary??={value:Error("LOGINOM_HOST_CLOSED")}
    events.emit("close")
  }
  child.on("disconnect", closePort)
  child.on("message", (data) => events.emit("message", { data }))
  const port: Port = {
    postMessage(value) {
      if (state.closed || !child.connected) throw new Error("LOGINOM_HOST_CLOSED")
      child.send(value as object, (error) => {
        if(error){
          const packet=value as any,root=originalParentPorts.get(port),owned=root?.runs.get(packet.input?.run);
          const id=packet.method==='readonly.preReady.cancel'?packet.input?.requestId:packet.id;
          if(owned?.pending&&owned.requestId===id&&['union-acquired-service-v1','row-filter-sdk-v1'].includes(packet.input?.receiverPurpose)){
            if(owned.primary)owned.secondary??={value:error};else owned.primary={value:error};
          }
          closePort();
        }
      })
    },
    on: (event, listener) => {
      events.on(event, listener)
    },
    off: (event,listener) => {events.off(event,listener)},
    onClose: (listener) => {
      if (state.closed) {
        listener()
        return
      }
      events.on("close", listener)
      return ()=>{events.off("close",listener)}
    },
    start() {},
  }
  const client = privateNodeHostTransport(port)
  const ready = await client
    .request(
      "start",
      {
        protocol: 1,
        root: input.root,
        resources: input.resources,
        headless: input.headless,
        ...(input.strictRecovery !== undefined ? { strictRecovery: input.strictRecovery } : {}),
      },
      // Startup restores the saved connection and waits for browser/MCP readiness.
      // Use the normal bounded RPC budget; browser login alone can exceed 30s.
      180_000,
    )
    .catch(async (error: unknown) => {
      child.kill("SIGTERM")
      client.close()
      throw error
    })
  if (
    !ready ||
    typeof ready !== "object" ||
    !("protocol" in ready) ||
    ready.protocol !== 1 ||
    !("ready" in ready) ||
    ready.ready !== true ||
    !("pid" in ready) ||
    ready.pid !== child.pid
  ) {
    child.kill("SIGTERM")
    client.close()
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  }
  if(input.strictRecovery===true&&input.entry===join(input.resources,"host/node-host.mjs")&&input.node===join(input.resources,"bin",process.platform==="win32"?"node.exe":"node"))
    originalParentPorts.set(port,{port,input,snapshot:originalInput,alive:()=>!state.closed&&child.connected,request:client.requestOwnedAcquire,call:client.requestOwnedCall,methods:Object.freeze({...port}),environment:JSON.stringify(environment),runs:new Map()})
  return {
    port,
    exited,
    request: client.request,
    get alive() {
      return !state.closed
    },
    close() {
      if (state.closing) return state.closing
      state.closing = (async () => {
        const result = await client.request("close", {}, 30_000).catch(() => undefined)
        // An acknowledgement alone does not prove exit. Bound a stuck host while
        // retaining a failed cleanup result so the caller keeps its profile guard.
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000)
        try {
          const outcome = await exited
          if (
            !result ||
            typeof result !== "object" ||
            !("closed" in result) ||
            result.closed !== true ||
            outcome.code !== 0 ||
            outcome.signal
          )
            throw new Error("LOGINOM_HOST_CLEANUP_FAILED")
        } finally {
          clearTimeout(timer)
          client.close()
        }
      })()
      return state.closing
    },
  }
}
