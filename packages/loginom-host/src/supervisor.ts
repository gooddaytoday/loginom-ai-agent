import { fork } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { isAbsolute } from "node:path"

export type Launch = {
  node: string
  entry: string
  resources: string
  stateDir: string
  generation: number
  chat: string
  endpoint: string
  connection: { apiKey: string; password: string; url: string; username: string }
  actionManifestUri?: string
  actionManifestSha256?: string
  validation?: boolean
  headless?: boolean
  environment?: NodeJS.ProcessEnv
  // Acceptance-only: exact saved package path the runtime closes and logs out of during
  // its own shutdown (bridge acceptanceCleanupPackage). Product code never sets it.
  acceptanceCleanupPackage?: string
  acceptanceCapture?: { revision: 1; harness: "calculator-grouped-before-done-v1" | "amount-import-type-v1"; owner: string; run: string;
    lease: string; generation: number; chat: string; account: string; packagePath: string; admission: string; expires: number }
}

export function runtimeEnvironment(environment: NodeJS.ProcessEnv, platform = process.platform) {
  const env: NodeJS.ProcessEnv = {}
  const keys = [
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "PROGRAMDATA",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "NODE_USE_SYSTEM_CA",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "NODE_USE_ENV_PROXY",
  ]
  if (platform === "linux")
    keys.push(
      "DISPLAY",
      "XAUTHORITY",
      "XDG_RUNTIME_DIR",
      "WAYLAND_DISPLAY",
      "XDG_SESSION_TYPE",
      "XDG_CURRENT_DESKTOP",
      "DBUS_SESSION_BUS_ADDRESS",
      "XDG_CONFIG_HOME",
    )
  if (platform === "win32") {
    const allowed = new Set(keys.map((key) => key.toUpperCase()))
    // Match Windows case-insensitive names, including plain IPC/environment
    // objects. Emit one spelling per key; sorted precedence matches Node spawn.
    Object.keys(environment)
      .sort()
      .forEach((key) => {
        const name = key.toUpperCase()
        if (allowed.has(name) && environment[key] && !(name in env)) env[name] = environment[key]
      })
    return env
  }
  keys.forEach((key) => {
    if (environment[key]) env[key] = environment[key]
  })
  return env
}

type StartupControl = {
  signal:AbortSignal; deadline:number; requestId:string; authorization:string; harness:"amount-import-type-v1";operation:string;request:string
  guard():void; reject(value:unknown):unknown; receive(value:unknown,origin:unknown,secondary?:{value:unknown}):unknown
  retain(runtime: Awaited<ReturnType<typeof supervise>>):void
  phase?: 'capture'
  binding?: NonNullable<Launch['acceptanceCapture']>
}
export type AmountStartupControl = StartupControl
type ClosedStartupControl = AmountStartupControl
// One child per generation/chat. Credentials travel only through Node's private IPC pipe.
export async function supervise(input: Launch, startup?:ClosedStartupControl) {
  startup?.guard()
  const originalStartup=startup
  if(startup)startup=Object.freeze({...startup})
  const original=input, originalConnection=input.connection
  const snapshot={...input,connection:{...input.connection},environment:runtimeEnvironment(input.environment??process.env)}
  const guard=()=>{
    startup?.guard()
    if(startup && ["signal","deadline","requestId","authorization","harness","guard","reject","receive","retain","phase","binding","operation","request"].some(k=>(originalStartup as any)[k] !== (startup as any)[k])) throw Error("LOGINOM_HANDSHAKE_INVALID")
    if(startup && (Object.keys(snapshot).some(key=>key!=="connection" && key!=="environment" && (original as any)[key] !== (snapshot as any)[key])
        || original.connection!==originalConnection || Object.keys(snapshot.connection).some(key=>(originalConnection as any)[key] !== (snapshot.connection as any)[key]))) throw Error("LOGINOM_HANDSHAKE_INVALID")
  }
  if(startup) input=snapshot
  if (![input.node, input.entry, input.resources, input.stateDir].every(isAbsolute))
    throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  await mkdir(input.stateDir, { recursive: true, mode: 0o700 })
  guard()
  const child = fork(input.entry, [], {
    execPath: input.node,
    execArgv: ["--use-system-ca"],
    cwd: input.stateDir,
    env: runtimeEnvironment(input.environment ?? process.env),
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  })
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout>; dispose?: () => void; fp?:boolean; primary?:{value:unknown} }
  >()
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }))
    child.once("error", () => resolve({ code: 1, signal: null }))
  })
  function fail() {
    pending.forEach((request) => {
      clearTimeout(request.timer)
    request.dispose?.()
      request.reject(request.primary?request.primary.value:new Error("LOGINOM_RUNTIME_DISCONNECTED"))
    })
    pending.clear()
  }
  child.on("disconnect", fail)
  child.on("exit", fail)
  child.on("error", fail)
  child.on("message", (message) => {
    if (!message || typeof message !== "object" || !("id" in message) || typeof message.id !== "string") return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    request.dispose?.()
    if(request.fp && "rejection" in message) {
      try {const received=startup!.receive(rejection(message.rejection),"rejectionOrigin" in message?message.rejectionOrigin:undefined,
        "secondaryRejection" in message?{value:rejection(message.secondaryRejection)}:undefined);request.reject(request.primary?request.primary.value:received)}
      catch(error){const rejected=startup!.reject(error);request.reject(request.primary?request.primary.value:rejected)}
      return
    }
    if (request.primary) {request.reject(request.primary.value);return}
    if ("error" in message) {
      request.reject(
        new Error(
          typeof message.error === "string" && /^LOGINOM_[A-Z_]+$/.test(message.error)
            ? message.error
            : "LOGINOM_RUNTIME_FAILED",
          { cause: message.error },
        ),
      )
      return
    }
    request.resolve("result" in message ? message.result : undefined)
  })
  function encodeReadRejection(value: unknown): unknown {
    if(value instanceof Error)return {kind:"Error",name:value.name,message:value.message,...("cause" in value?{cause:encodeReadRejection(value.cause)}:{})}
    return {kind:"value",value:value===undefined?null:value,is_undefined:value===undefined}
  }
  function request(operation: string, value?: unknown, timeout = 120_000, control?: {signal: AbortSignal; deadline: number}) {
    const amountCall=operation==="acceptance.prepare" || operation==="acceptance.capture";
    if(amountCall && startup?.harness==='amount-import-type-v1'){
      guard();if(!startup.binding || control?.signal!==startup.signal || control.deadline!==startup.deadline || value!==undefined)
        return Promise.reject(Error('LOGINOM_HANDSHAKE_INVALID'));
    }

    if(control) {
      control.signal.throwIfAborted()
      if(!Number.isSafeInteger(control.deadline) || Date.now()>=control.deadline) throw Error("LOGINOM_PRE_READY_READ_EXPIRED")
      timeout=control.deadline-Date.now()
    }
    if (!child.connected) return Promise.reject(new Error("LOGINOM_RUNTIME_DISCONNECTED"))
    const id = randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      const deadline=control?.deadline??Date.now()+timeout
      const cancel = (reason: unknown) => {
        if(!pending.has(id)) return
        if(startup && (operation==="start" || amountCall)) {
          const current=pending.get(id)!;if(current.primary)return;current.primary={value:reason};startup.receive(reason,"control")
          if(child.connected) child.send({id:randomUUID(),operation:"readonly.preReady.cancel",input:{phase:amountCall?"amount":"startup",...(amountCall?{method:operation}:{}),requestId:id,startupRequestId:startup.requestId,authorization:startup.authorization,harness:startup.harness,deadline:startup.deadline,
            ...(startup.harness==='amount-import-type-v1'?{operation:startup.operation,request:startup.request}:{}),
            ...(startup.phase?{bindingPhase:startup.phase,captureBinding:startup.binding}:{}),rejection:encodeReadRejection(current.primary.value)}})
          return
        }
        pending.delete(id);clearTimeout(timer);control?.signal.removeEventListener("abort",abort)
        // Cancellation belongs to this original request, never the next call.
        if(control && child.connected)child.send({id:randomUUID(),operation:"readonly.preReady.cancel",input:{requestId:id,rejection:encodeReadRejection(reason)}})
        reject(reason)
      }
      const abort = () => cancel(control!.signal.reason)
      const timer = setTimeout(() => cancel(new Error(control?"LOGINOM_PRE_READY_READ_EXPIRED":"LOGINOM_RUNTIME_TIMEOUT")),timeout)
      pending.set(id, { resolve, reject, timer, ...(startup && (operation==="start" || amountCall)?{fp:true}:{}), dispose:()=>control?.signal.removeEventListener("abort",abort) })
      control?.signal.addEventListener("abort",abort,{once:true})
      child.send({ id, operation, input: value, ...(operation === "start" || amountCall ? { deadline:control?.deadline??deadline } : {}) }, (error) => { if (error) fail() })
      if(control?.signal.aborted)abort()
    })
  }
  const closing: { promise?: Promise<void> } = {}
  function close() {
    if (closing.promise) return closing.promise
    closing.promise = (async () => {
      const reply = await request("close", undefined, 5000)
      if (!reply || typeof reply !== "object" || !("closed" in reply) || reply.closed !== true)
        throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED", { cause: reply })
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000)
      try {
        const outcome = await exited
        if (
          !reply ||
          typeof reply !== "object" ||
          !("closed" in reply) ||
          reply.closed !== true ||
          outcome.code !== 0 ||
          outcome.signal
        )
          throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
      } finally {
        clearTimeout(timer)
      }
    })()
    const attempt = closing.promise
    attempt.catch(() => { if (closing.promise === attempt) closing.promise = undefined })
    return attempt
  }
  // Connection validation can spend 30 seconds on MCP initialization and up
  // to 150 seconds navigating/authenticating Loginom. Do not race that
  // documented budget with the ordinary 120-second runtime handshake.
  function rejection(value: any): unknown {
    if(value?.kind==="Error") {const e=new Error(value.message,"cause" in value?{cause:rejection(value.cause)}:undefined);e.name=value.name;return e}
    return value?.is_undefined?undefined:value?.value
  }
  const runtime = { ready: undefined as unknown, request, close, exited }
  startup?.retain(runtime)
  async function failedStart(error: unknown): Promise<never> {
    if(startup) throw startup.reject(error)
    try { await close() }
    catch (cleanupFailure) {
      const failure = new Error("LOGINOM_RUNTIME_START_FAILED", { cause: error })
      // Private foreground ownership handoff, never serialized into IPC.
      Object.defineProperties(failure, {
        runtime: { value: runtime },
        cleanupFailure: { value: cleanupFailure },
      })
      throw failure
    }
    throw error
  }
  const ready = await request(
    "start",
    { ...input, environment: undefined, protocol: 1, ...(startup? {amountStartup:{requestId:startup.requestId,authorization:startup.authorization,purpose:startup.harness,deadline:startup.deadline,
          operation:startup.operation,request:startup.request,...(startup.phase?{phase:startup.phase,binding:startup.binding}:{})}}
 : {}) },
    input.validation ? 210_000 : 120_000,
    startup,
  ).catch(failedStart)
  guard()
  if (
    !ready ||
    typeof ready !== "object" ||
    !("protocol" in ready) ||
    ready.protocol !== 1 ||
    !("generation" in ready) ||
    ready.generation !== input.generation ||
    (input.validation
      ? !("checked" in ready) || ready.checked !== true
      : !("ready" in ready) || ready.ready !== true || !("chat" in ready) || ready.chat !== input.chat)
  ) {
    return failedStart(new Error("LOGINOM_HANDSHAKE_INVALID", { cause: ready }))
  }
  runtime.ready = ready
  return runtime
}
