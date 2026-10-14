import { fork } from "node:child_process"
import { isAbsolute, join, resolve } from "node:path"
import { readFile, realpath } from "node:fs/promises"
import { createHash, randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { runtimeEnvironment } from "./supervisor"
import { transport, privateAmountTransport, type Port } from "./transport"

type NodeHostInput = {
  node: string
  entry: string
  root: string
  resources: string
  headless: boolean
  environment?: NodeJS.ProcessEnv
  strictRecovery?: boolean
  acceptanceCleanupPackage?: string
}
const diagnostics = new WeakMap<object, { authorization: string; packagePath: string; harness?: "amount-import-type-v1" }>()

type AmountStartupControl = { signal: AbortSignal; deadline: number; operation: string; request: string }
type AmountInput = NodeHostInput & { packagePath: string }
type AmountRoot = {
  input: AmountInput; control: AmountStartupControl; original: Readonly<AmountStartupControl>;
  authorization: string; phase: "inventory" | "provider_unavailable" | "refused" | "startup" | "host_ready" | "acquired" | "inspecting" | "preparing" | "prepared" | "capturing" | "completed";
  pending: boolean; resourcesAttempted?:boolean;fileAttempted?:boolean;prepareAttempted?:boolean; captureAttempted?:boolean; host?: Awaited<ReturnType<typeof launchNodeHost>>; acquireRun?:string; acquireSession?:string; primary?: { value: unknown }; secondary?: { value: unknown };
}
// Stage A retains the real foreground object before inventory IO. It makes no
// claim about a run/lease that stage B has not acquired. Map entries also fence
// reconstructed carriers after pending/lost replies and eventual settlement.
const amountRoots = new Map<string, AmountRoot>()
const amountControls = new WeakMap<object,AmountRoot>()
export const launchStagedAmountDiagnostic = Object.assign(async (input: AmountInput, control: AmountStartupControl) => {
  if (!input || typeof input!=="object" || !control || Object.keys(control).sort().join(",")!=="deadline,operation,request,signal"
    || !(control.signal instanceof AbortSignal) || !Number.isSafeInteger(control.deadline)
    || control.deadline <= Date.now() || ![control.operation,control.request].every(v=>typeof v==="string" && v.length>0))
    throw Error("LOGINOM_AMOUNT_STARTUP_CONTROL_REQUIRED")
  control.signal.throwIfAborted()
  const original = Object.freeze({ signal:control.signal, deadline:control.deadline, operation:control.operation, request:control.request })
  const key = JSON.stringify([original.operation,original.request])
  if (amountRoots.has(key) || amountControls.has(control)) throw Error("LOGINOM_RECOVERY_REQUIRED")
  const snapshot = { ...input, environment:runtimeEnvironment(input.environment??process.env) }, environment=input.environment
  const root: AmountRoot = {
    input,control,original,authorization:randomBytes(32).toString("hex"),phase:"inventory",pending:false,
  }
  amountRoots.set(key,root)
  amountControls.set(control,root)
  const carriers=new WeakSet<object>();
  const primary = (value:unknown) => { root.primary ??= {value}; return root.primary.value }
  const abort = () => { primary(original.signal.reason) }
  original.signal.addEventListener("abort",abort,{once:true})
  const guard = () => {
    if (original.signal.aborted) primary(original.signal.reason)
    if (Date.now()>=original.deadline) primary(Error("LOGINOM_AMOUNT_STARTUP_EXPIRED"))
    if (root.primary) throw root.primary.value
    if (control.signal!==original.signal || control.deadline!==original.deadline || control.operation!==original.operation || control.request!==original.request
      || ["node","entry","root","resources","headless","packagePath","strictRecovery","acceptanceCleanupPackage"].some(k=>(input as any)[k] !== (snapshot as any)[k])
      || input.environment!==environment || JSON.stringify(runtimeEnvironment(input.environment??process.env))!==JSON.stringify(snapshot.environment))
      throw primary(Error("LOGINOM_AMOUNT_STARTUP_CHANGED"))
  }
  const observed = async <T>(work:()=>Promise<T>) => {
    guard();root.pending=true
    let value:T
    try { value=await work() }
    catch (error) { if(error!==null && typeof error==="object" && carriers.has(error))throw root.primary!.value; if(root.primary)root.secondary??={value:error};throw primary(error) }
    finally { root.pending=false }
    guard();return value
  }
  try {
    guard()
    if (!input || ![snapshot.node,snapshot.entry,snapshot.root,snapshot.resources].every(isAbsolute)
      || typeof snapshot.packagePath!=="string" || snapshot.packagePath.length>1024
      || !/^\/[^/\\\x00-\x1f]+\/[^/\\\x00-\x1f]+\.lgp$/.test(snapshot.packagePath)
      || snapshot.packagePath.split("/").some(x=>x==="."||x==="..")) throw Error("LOGINOM_HANDSHAKE_INVALID")
    const product=resolve(snapshot.resources,"../..")
    if(await observed(()=>realpath(snapshot.resources))!==join(product,"resources/loginom"))throw Error("LOGINOM_HANDSHAKE_INVALID")
    const cli=await observed(async()=>JSON.parse(await readFile(join(product,"cli-manifest.json"),"utf8")))
    const manifest=await observed(async()=>JSON.parse(await readFile(join(snapshot.resources,"resource-manifest.json"),"utf8")))
    if(cli.format!=="loginom-cli-artifact-v1" || !Array.isArray(cli.files) || !Array.isArray(manifest.files))throw Error("LOGINOM_HANDSHAKE_INVALID")
    for (const [path,actual,files] of [
      ["resources/loginom/host/node-host.mjs",snapshot.entry,cli.files],
      ["resources/loginom/host/amount-private-launcher.mjs",join(product,"resources/loginom/host/amount-private-launcher.mjs"),cli.files],
      ["resources/loginom/host/amount-launcher-build-inputs.json",join(product,"resources/loginom/host/amount-launcher-build-inputs.json"),cli.files],
      ["bin/node",snapshot.node,manifest.files],
      ["runtime/src/acceptance/amount-import-type-v1.mjs",join(snapshot.resources,"runtime/src/acceptance/amount-import-type-v1.mjs"),manifest.files],
      ["runtime/src/acceptance/ui-scan-collector.mjs",join(snapshot.resources,"runtime/src/acceptance/ui-scan-collector.mjs"),manifest.files],
    ] as const) {
      const entries=files?.filter((f:{path:string})=>f.path===path),entry=entries?.[0]
      const expected=path.startsWith("resources/")?join(product,path):join(snapshot.resources,path)
      if(entries?.length!==1 || !/^[a-f0-9]{64}$/.test(entry.sha256)
        || await observed(()=>realpath(actual))!==expected
        || createHash("sha256").update(await observed(()=>readFile(actual))).digest("hex")!==entry.sha256)
        throw Error("LOGINOM_HANDSHAKE_INVALID")
    }
    guard()
    const receive=(value:unknown,origin:unknown,secondary?:{value:unknown})=>{
      if(!["control","guard","await"].includes(origin as string))throw Error("LOGINOM_STARTUP_RECEIPT_INVALID");
      if(root.primary && origin==="await")root.secondary??={value};
      primary(value);if(secondary)root.secondary??=secondary;const carrier={};carriers.add(carrier);return carrier;
    };
    const options={...snapshot};diagnostics.set(options,{authorization:root.authorization,packagePath:snapshot.packagePath,harness:"amount-import-type-v1"});
    amountStarts.set(options,{control:original,guard,observed,receive,retain(host){root.host=host}});
    root.phase="startup";const host=await observed(()=>launchNodeHost(options));root.phase="host_ready";
    const dispatch=async(method:"acceptance.resources"|"acceptance.files"|"acceptance.prepare"|"acceptance.capture",run:string)=>{
      guard();if(run!==root.acquireRun || !run)throw Error("LOGINOM_RUN_INVALID");
      const resources=method==="acceptance.resources",preparing=method==="acceptance.prepare";
      if(resources){if(root.phase!=="acquired" || root.resourcesAttempted)throw Error("LOGINOM_RECOVERY_REQUIRED");root.resourcesAttempted=true;root.phase="inspecting";const result=await observed(()=>host.dispatchAmount(method,run));if(!result || typeof result!=="object" || !("resourceReadComplete" in result) || result.resourceReadComplete!==true){root.phase="refused";throw primary(Error("LOGINOM_AMOUNT_RESOURCES_UNAVAILABLE"))}root.phase="acquired";return result;}
      if(method==='acceptance.files'){if(root.phase!=='acquired'||!root.resourcesAttempted||root.fileAttempted)throw Error('LOGINOM_RECOVERY_REQUIRED');root.fileAttempted=true;root.phase='inspecting';const result=await observed(()=>host.dispatchAmount(method,run));if(!result||typeof result!=='object'||!('fileReadComplete' in result)||result.fileReadComplete!==true){root.phase='refused';throw primary(Error('LOGINOM_AMOUNT_FILE_UNAVAILABLE'))}root.phase='acquired';return result;}
      if(preparing ? root.phase!=="acquired" || root.prepareAttempted : root.phase!=="prepared" || root.captureAttempted)throw Error("LOGINOM_RECOVERY_REQUIRED");
      if(preparing)root.prepareAttempted=true;else root.captureAttempted=true;
      root.phase=preparing?"preparing":"capturing";
      const result=await observed(()=>host.dispatchAmount(method,run));
      if(!result || typeof result!=="object" || (preparing ? !("preparationComplete" in result) || result.preparationComplete!==true : !("cleanupComplete" in result) || result.cleanupComplete!==true)){
        root.phase="refused";throw primary(Error("LOGINOM_AMOUNT_COMPLETION_UNAVAILABLE"));
      }
      root.phase=preparing?"prepared":"completed";return result;
    };
    return Object.assign(host,{files:(run:string)=>dispatch('acceptance.files',run),resources:(run:string)=>dispatch("acceptance.resources",run),prepare:(run:string)=>dispatch("acceptance.prepare",run),capture:(run:string)=>dispatch("acceptance.capture",run),acquire:async(run:string,session:string)=>{
      guard();if(root.acquireRun!==undefined)throw Error("LOGINOM_RECOVERY_REQUIRED");
      if(!run||!session)throw Error("LOGINOM_RUN_INVALID");root.acquireRun=run;root.acquireSession=session;
      try {const result=await observed(()=>host.acquireAmount(run,session));guard();
      if(result===null){root.phase="provider_unavailable";throw primary(Error("ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE"))}
      if(!result||typeof result!=="object"||!("generation" in result)||!Number.isSafeInteger(result.generation))throw primary(Error("LOGINOM_GENERATION_UNAVAILABLE"));
      root.phase="acquired";return result;}catch(error){if(root.phase!=="provider_unavailable")root.phase="refused";throw error}
    }});
  } catch(error) {
    if(root.phase!=="provider_unavailable")root.phase="refused"
    throw primary(error)
  }
}, {
  retained(input: object, control: AmountStartupControl) {
    if(!control)return undefined
    const root=amountControls.get(control)
    if(!root || root.input!==input || root.control!==control)return undefined
    return Object.freeze({original:root.original,authorization:root.authorization,phase:root.phase,pending:root.pending,host:root.host,run:root.acquireRun,session:root.acquireSession,
      primaryFailurePresent:root.primary!==undefined,primaryFailure:root.primary?.value,
      secondaryFailurePresent:root.secondary!==undefined,secondaryFailure:root.secondary?.value,
      originalControlRetained:true,bindingPhase:root.phase==="acquired"?"acquired" as const:"unavailable" as const,nativeOwnerVerified:false,
      evidenceSettled:false,cleanupSettled:false,acknowledged:false})
  },
})

type AmountStart={control:Readonly<AmountStartupControl>;guard():void;observed<T>(work:()=>Promise<T>):Promise<T>;receive(value:unknown,origin:unknown,secondary?:{value:unknown}):unknown;retain(host:Awaited<ReturnType<typeof launchNodeHost>>):void}
const amountStarts=new WeakMap<object,AmountStart>();
// Closed diagnostic launcher. Resource paths and harness are fixed; callers
// cannot supply executable code, a module path or a transport capability.
export async function launchCalculatorDiagnostic(input: NodeHostInput & { packagePath: string }) {
  return launchDiagnostic(input, "calculator-grouped-before-done-v1")
}
export async function launchAmountDiagnostic(input: NodeHostInput & { packagePath: string }) {
  return launchDiagnostic(input, "amount-import-type-v1")
}
async function launchDiagnostic(input: NodeHostInput & { packagePath: string }, harness: "calculator-grouped-before-done-v1" | "amount-import-type-v1") {
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
  const fixedResources = [`runtime/src/acceptance/${harness}.mjs`,
    ...(harness === "amount-import-type-v1" ? ["runtime/src/acceptance/ui-scan-collector.mjs"] : [])]
  for (const [path, actual] of [["bin/node", input.node], ...fixedResources.map(path => [path, join(input.resources, path)])]) {
    const items = manifest.files?.filter((file: { path: string }) => file.path === path)
    const item = items?.[0]
    if (items?.length !== 1 || !/^[a-f0-9]{64}$/.test(item.sha256) || await realpath(actual!) !== resolve(input.resources, path!)
        || createHash("sha256").update(await readFile(actual!)).digest("hex") !== item.sha256)
      throw Error("LOGINOM_HANDSHAKE_INVALID")
  }
  const grant = { authorization: randomBytes(32).toString("hex"), packagePath: input.packagePath,
    ...(harness === "amount-import-type-v1" ? { harness } : {}) }
  const options = { ...input }
  diagnostics.set(options, grant)
  const host = await launchNodeHost(options)
  return { ...host, capture: (run: string) => host.request("acceptance.capture", { run, authorization: grant.authorization }) }
}

export async function launchNodeHost(input: NodeHostInput) {
  // Ordinary product callers cannot turn structural fields into authority.
  if ("acceptanceCapture" in input) throw Error("LOGINOM_HANDSHAKE_INVALID")
  const diagnostic = diagnostics.get(input)
  const amount=amountStarts.get(input)
  amount?.guard()
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
  child.on("message", (data) => events.emit("message", { data }))
  const port: Port = {
    postMessage(value) {
      if (state.closed || !child.connected) throw new Error("LOGINOM_HOST_CLOSED")
      child.send(value as object, (error) => {
        if (error) closePort()
      })
    },
    on: (event, listener) => {
      events.on(event, listener)
    },
    off: (event, listener) => { events.off(event, listener) },
    onClose: (listener) => {
      if (state.closed) {
        listener()
        return
      }
      events.on("close", listener)
      return () => { events.off("close", listener) }
    },
    start() {},
  }
  const amountClient=amount ? privateAmountTransport(port,amount.receive):undefined
  const client = amountClient ?? transport(port)
  const startupInput = {
    protocol: 1 as const,
    ...(amount&&diagnostic?{amountStartup:{purpose:"amount-import-type-v1" as const,authorization:diagnostic.authorization,operation:amount.control.operation,request:amount.control.request,deadline:amount.control.deadline}}:{}),
    ...(diagnostic ? {acceptanceCapture: diagnostic} : {}),
    root: input.root, resources: input.resources, headless: input.headless,
    ...(input.acceptanceCleanupPackage !== undefined ? {acceptanceCleanupPackage: input.acceptanceCleanupPackage} : {}),
    ...(input.strictRecovery !== undefined ? {strictRecovery: input.strictRecovery} : {}),
  }
  const handle = {
    port, exited, request: client.request,
    dispatchAmount:(method:"acceptance.resources"|"acceptance.files"|"acceptance.prepare"|"acceptance.capture",run:string)=>{if(!amountClient||!amount||!diagnostic)throw Error("LOGINOM_HANDSHAKE_INVALID");amount.guard();return amountClient.dispatch(method,{run,authorization:diagnostic.authorization,operation:amount.control.operation,request:amount.control.request},amount.control)},
    acquireAmount:(run:string,session:string)=>{if(!amountClient||!amount||!diagnostic)throw Error("LOGINOM_HANDSHAKE_INVALID");amount.guard();return amountClient.acquire({run,session,amountControl:{authorization:diagnostic.authorization,operation:amount.control.operation,request:amount.control.request}},amount.control)},
    get alive() { return !state.closed },
    close,
  }
  amount?.retain(handle)
  const ready = await (amount && amountClient && diagnostic
    ? amountClient.start(startupInput as Parameters<typeof amountClient.start>[0],amount.control)
    : client.request("start", startupInput, 180_000))
    .catch(async (error:unknown) => {
      // Keep the original FP child UNKNOWN after dispatch, without kill/replay.
      if (!amount) { child.kill("SIGTERM"); client.close() }
      throw error
    })
  amount?.guard()
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
    if (!amount) { child.kill("SIGTERM"); client.close() }
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  }
  return handle
  function close() {
      if (state.closing) return state.closing
      state.closing = (async () => {
        const result = await client.request("close", {}, 30_000)
        if (!result || typeof result !== "object" || !("closed" in result) || result.closed !== true)
          throw new Error("LOGINOM_HOST_CLEANUP_FAILED")
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
      const attempt = state.closing
      attempt.catch(() => { if (state.closing === attempt) state.closing = undefined })
      return attempt
  }
}
