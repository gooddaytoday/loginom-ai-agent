import { fork } from "node:child_process"
import { isAbsolute, join, resolve } from "node:path"
import { readFile, realpath } from "node:fs/promises"
import { createHash, randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { runtimeEnvironment } from "./supervisor"
import { transport, type Port } from "./transport"

type NodeHostInput = {
  node: string
  entry: string
  root: string
  resources: string
  headless: boolean
  environment?: NodeJS.ProcessEnv
  strictRecovery?: boolean
}
const diagnostics = new WeakMap<object, { authorization: string; packagePath: string; harness?: "replacement-input0-readonly-v1" }>()
type ReplacementChannel = {
  pending: Map<string, any>; leases: Map<string, { generation: number; session: string }>;
  originals: Map<string, any>; captures: Map<string, any>; taken: Set<string>; failure?: { value: unknown };
  packagePath: string; resourceHash: string; authorization: string;
}
const replacementChannels=new WeakMap<object,ReplacementChannel>()
function stockJSON(value:any,seen=new Set<object>()):string {
  const check=(v:any)=>{
    if(v===null || ['string','boolean'].includes(typeof v) || typeof v==='number'&&Number.isFinite(v))return
    if(!v || typeof v!=='object' || seen.has(v) || ![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('REPLACEMENT_STOCK_REPLY_INVALID')
    if(Array.isArray(v) && (Reflect.ownKeys(v).length!==v.length+1 || Reflect.ownKeys(v).some(k=>k!=='length'&&(typeof k!=='string'||!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=v.length))))throw Error('REPLACEMENT_STOCK_REPLY_INVALID')
    seen.add(v)
    for(const k of Reflect.ownKeys(v)){if(Array.isArray(v)&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k)!;if(typeof k!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('REPLACEMENT_STOCK_REPLY_INVALID');check(d.value)}
    seen.delete(v)
  };check(value);return JSON.stringify(value)
}
function stockFreeze(value:any):any {if(value&&typeof value==='object'){for(const v of Object.values(value))stockFreeze(v);Object.freeze(value)}return value}
// Closed receive-only observation. A structural host/packet cannot enter this
// WeakMap; these receipts never substitute for the caller's original signal.
export function takeReplacementDiagnosticReply(host:object,run:string,kind:'original'|'capture') {
  const channel=replacementChannels.get(host),key=kind+':'+run
  if(!channel || !['original','capture'].includes(kind) || channel.taken.has(key))throw Error('REPLACEMENT_STOCK_NO_RETRY')
  channel.taken.add(key)
  if(kind==='original'&&channel.failure)throw channel.failure.value
  const value=(kind==='original'?channel.originals:channel.captures).get(run)
  if(!value){if(channel.failure)throw channel.failure.value;throw Error('REPLACEMENT_STOCK_REPLY_MISSING')}
  return value
}

// Closed diagnostic launcher. Resource paths and harness are fixed; callers
// cannot supply executable code, a module path or a transport capability.
export async function launchCalculatorDiagnostic(input: NodeHostInput & { packagePath: string }) {
  return launchDiagnostic(input, "calculator-grouped-before-done-v1")
}
export async function launchReplacementDiagnostic(input: NodeHostInput & { packagePath: string }) {
  return launchDiagnostic(input, "replacement-input0-readonly-v1")
}
async function launchDiagnostic(input: NodeHostInput & { packagePath: string }, harness: "calculator-grouped-before-done-v1" | "replacement-input0-readonly-v1") {
  if (typeof input.packagePath !== "string" || input.packagePath.length > 1024 || !/^\/[^/\\\x00-\x1f]+\/[^/\\\x00-\x1f]+\.lgp$/.test(input.packagePath)
      || input.packagePath.split("/").some(x => x === "." || x === ".."))
    throw Error("LOGINOM_HANDSHAKE_INVALID")
  const manifest = JSON.parse(await readFile(join(input.resources, "resource-manifest.json"), "utf8"))
  // The post-staging Node host belongs to the product inventory, not the
  // runtime resource inventory. Use its canonical receiving product location.
  const product = resolve(input.resources, "../..")
  if (await realpath(input.resources) !== join(product, "resources/loginom"))
    throw Error("LOGINOM_HANDSHAKE_INVALID")
  const cli = JSON.parse(await readFile(join(product, "cli-manifest.json"), "utf8"))
  const hosts = cli.files?.filter((file: { path: string }) => file.path === "resources/loginom/host/node-host.mjs")
  const hostItem = hosts?.[0]
  if (cli.format !== "loginom-cli-artifact-v1" || hosts?.length !== 1 || !/^[a-f0-9]{64}$/.test(hostItem.sha256)
      || await realpath(input.entry) !== join(product, "resources/loginom/host/node-host.mjs")
      || createHash("sha256").update(await readFile(input.entry)).digest("hex") !== hostItem.sha256)
    throw Error("LOGINOM_HANDSHAKE_INVALID")
  for (const [path, actual] of [["bin/node", input.node],
    [`runtime/src/acceptance/${harness}.mjs`, join(input.resources, `runtime/src/acceptance/${harness}.mjs`)]]) {
    const items = manifest.files?.filter((file: { path: string }) => file.path === path)
    const item = items?.[0]
    if (items?.length !== 1 || item.link || item.directory || !/^[a-f0-9]{64}$/.test(item.sha256) || await realpath(actual!) !== resolve(input.resources, path!)
        || createHash("sha256").update(await readFile(actual!)).digest("hex") !== item.sha256)
      throw Error("LOGINOM_HANDSHAKE_INVALID")
  }
  const grant = { authorization: randomBytes(32).toString("hex"), packagePath: input.packagePath, ...(harness==="replacement-input0-readonly-v1" ? {harness} : {}) }
  const options = { ...input }
  diagnostics.set(options, grant)
  const host = await launchNodeHost(options)
  const facade={ ...host, capture: (run: string) => host.request("acceptance.capture", { run, authorization: grant.authorization }) }
  if(harness==='replacement-input0-readonly-v1')Object.defineProperty(facade,'alive',{get:()=>host.alive,enumerable:true})
  const channel=replacementChannels.get(host);if(channel)replacementChannels.set(facade,channel)
  return facade
}

export async function launchNodeHost(input: NodeHostInput) {
  // Ordinary product callers cannot turn structural fields into authority.
  if ("acceptanceCapture" in input) throw Error("LOGINOM_HANDSHAKE_INVALID")
  const diagnostic = diagnostics.get(input)
  const stock:ReplacementChannel|undefined=diagnostic?.harness==='replacement-input0-readonly-v1' ? {
    pending:new Map(),leases:new Map(),originals:new Map(),captures:new Map(),taken:new Set(),
    packagePath:diagnostic.packagePath,authorization:diagnostic.authorization,
    resourceHash:JSON.parse(await readFile(join(input.resources,'resource-manifest.json'),'utf8')).files.find((f:any)=>f.path==='runtime/src/acceptance/replacement-input0-readonly-v1.mjs').sha256,
  } : undefined
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
    events.emit("close")
  }
  child.on("disconnect", closePort)
  child.on("message", (data:any) => {
    const sent=stock?.pending.get(data?.id)
    if(sent){stock!.pending.delete(data.id)
      if(sent.method==='acquire' && data.result && Number.isSafeInteger(data.result.generation) && data.result.generation>0)
        stock!.leases.set(sent.input.run,{generation:data.result.generation,session:sent.input.session})
      if(sent.method==='call'){
        try {
          if(Object.hasOwn(data,'error'))throw Error(String(data.error))
          stockJSON(data.replacementOriginal);const envelope=data.replacementOriginal,p=envelope.original,lease=stock!.leases.get(sent.input.run)
          if(Object.keys(envelope).sort().join(',')!=='kind,original,outcome,version' || envelope.version!==1 || envelope.kind!=='replacement-original-reply-v1'
              || envelope.outcome?.kind!=='original-pins' || Object.keys(envelope.outcome).sort().join(',')!=='kind,result'
              || stockJSON(envelope.outcome.result)!==stockJSON(data.result) || p?.kind!=='replacement-original-pins-v1'
              || Object.keys(p).sort().join(',')!=='account,cancellation,chat,deadline,document_id,generation,kind,lease,native_opening_operation_id,node_id,opening_epoch,opening_sha256,operation_id,outer_opening_operation_id,owner,package_path,request,request_sha256,resource_path,resource_sha256,run,scope,session_id,version,workflow_id' || p.version!==1
              || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(p.scope) || Object.keys(p.cancellation).sort().join(',')!=='link,scope' || p.cancellation.link!=='original-server-operation'
              || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(p.cancellation.scope) || typeof p.session_id!=='string' || !p.session_id
              || p.document_id!==p.request.document_id || p.workflow_id!==p.request.workflow_ref.workflow_id || p.node_id!==p.request.target.ref.node_id
              || !lease || p.run!==sent.input.run || p.generation!==lease.generation || p.chat!==createHash('sha256').update(lease.session).digest('hex')
              || p.lease!==p.owner+':'+p.run || typeof p.owner!=='string' || !p.owner || p.package_path!==stock!.packagePath
              || p.account!==stock!.packagePath.split('/')[1] || p.resource_path!=='runtime/src/acceptance/replacement-input0-readonly-v1.mjs' || p.resource_sha256!==stock!.resourceHash
              || p.operation_id!==sent.input.args?.operation_id || p.request?.operation_id!==p.operation_id
              || p.request?.target?.type!=='transform.replace_columns' || p.request.target.kind!=='existing'
              || p.request_sha256!==createHash('sha256').update(stockJSON(p.request)).digest('hex')
              || !/^[a-f0-9]{64}$/.test(p.opening_sha256) || typeof p.outer_opening_operation_id!=='string' || !p.outer_opening_operation_id
              || typeof p.native_opening_operation_id!=='string' || !p.native_opening_operation_id || p.outer_opening_operation_id===p.native_opening_operation_id
              || typeof p.opening_epoch!=='string' || !p.opening_epoch || !Number.isSafeInteger(p.deadline) || Date.now()>=p.deadline
              || stock!.originals.has(p.run))throw Error('REPLACEMENT_STOCK_REPLY_INVALID')
          stock!.originals.set(p.run,stockFreeze({envelope,messageId:data.id,run:p.run,session:lease.session,generation:lease.generation}))
        }catch(error){stock!.failure??={value:error};data={id:data.id,error:'LOGINOM_RECOVERY_REQUIRED'}}
      }
      if(sent.method==='acceptance.capture'&&!stock!.captures.has(sent.input.run))stock!.captures.set(sent.input.run,Object.hasOwn(data,'error')?{rejected:true,error:Error(String(data.error))}:{rejected:false,result:stockFreeze(data.result),messageId:data.id})
    }
    events.emit("message", { data })
  })
  const port: Port = {
    postMessage(value) {
      if (state.closed || !child.connected) throw new Error("LOGINOM_HOST_CLOSED")
      if(stock && value && typeof value==='object' && 'id' in value && 'method' in value && 'input' in value){
        const v=value as any
        if(v.method==='acquire' || v.method==='call' && v.input.captureAuthorization===stock.authorization || v.method==='acceptance.capture'&&v.input.authorization===stock.authorization)
          stock.pending.set(v.id,{method:v.method,input:JSON.parse(stockJSON(v.input))})
      }
      child.send(value as object, (error) => {
        if (error) closePort()
      })
    },
    on: (event, listener) => {
      events.on(event, listener)
    },
    onClose: (listener) => {
      if (state.closed) {
        listener()
        return
      }
      events.on("close", listener)
    },
    start() {},
  }
  const client = transport(port)
  const ready = await client
    .request(
      "start",
      {
        protocol: 1,
        ...(diagnostic ? { acceptanceCapture: diagnostic } : {}),
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
  const host={
    port,
    exited,
    request: stock ? (method:string,value:any,timeout?:number)=>{
      const original=method==='call'&&value?.name==='dock_node_wait'
      if(original && stock.failure)return Promise.reject(stock.failure.value)
      return client.request(method,original?{...value,captureAuthorization:stock.authorization}:value,timeout)
        .catch(error=>{if(original)stock.failure??={value:error};throw error})
    } : client.request,
    get alive() {
      return !state.closed
    },
    close() {
      if (state.closing) return state.closing
      state.closing = (async () => {
        // Runtime close owns up to 60s for durable teardown plus 5s for exit.
        // Keep transport headroom without changing ACK or clean-exit criteria.
        const result = await client.request("close", {}, 75_000).catch(() => undefined)
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
  if(stock)replacementChannels.set(host,stock)
  return host
}
