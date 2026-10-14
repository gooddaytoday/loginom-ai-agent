import {parentRootMessage} from './original-root-association'
import {retainOriginalRunOrigin} from "./original-run-control"
import {bindOriginalRootPort} from "./original-root-port"
import { fork } from "node:child_process"
import { isAbsolute, join, resolve } from "node:path"
import { readFile, realpath } from "node:fs/promises"
import { createHash, randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { runtimeEnvironment } from "./supervisor"
import { transport, privateFPTransport, type Port } from "./transport"

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
const diagnostics = new WeakMap<object, { authorization: string; packagePath: string; harness: "sorting-before-close-v1" | "field-parameters-preservation-v1" }>()

type FPStart = {
  control: {signal: AbortSignal; deadline: number}
  guard(): void
  observed<T>(work: Promise<T>): Promise<T>
  retain(host: Awaited<ReturnType<typeof launchNodeHost>>): void
  dispose(): void
}
const fpStarts = new WeakMap<object, FPStart>()
const fpRetained = new WeakMap<object, Awaited<ReturnType<typeof launchNodeHost>>>()
const fpAttempts = new WeakSet<object>()
const rootAttempts = new WeakSet<object>()
export const launchFieldParametersDiagnostic = Object.assign(async (input: NodeHostInput & {packagePath:string}, control: {signal:AbortSignal;deadline:number}) => {
  if (fpAttempts.has(input)) throw Error("LOGINOM_RECOVERY_REQUIRED")
  const signal = control.signal, deadline = control.deadline
  signal.throwIfAborted()
  if (!Number.isSafeInteger(deadline) || Date.now() >= deadline || deadline - Date.now() > 180_000) throw Error("LOGINOM_PRE_READY_READ_EXPIRED")
  const snapshot = {...input, environment: runtimeEnvironment(input.environment ?? process.env)}
  const environment = input.environment
  const keys = ["node", "entry", "root", "resources", "headless", "packagePath", "strictRecovery", "acceptanceCleanupPackage"] as const
  const state: {primary?: {value:unknown}; secondary?:{value:unknown}} = {}
  const refuse = (value:unknown) => { state.primary ??= {value} }
  const abort = () => refuse(signal.reason)
  signal.addEventListener("abort", abort, {once:true})
  const timer = setTimeout(() => refuse(Error("LOGINOM_PRE_READY_READ_EXPIRED")), deadline-Date.now())
  const fp: FPStart = {
    control: {signal, deadline},
    guard() {
      if (signal.aborted) refuse(signal.reason)
      if (Date.now() >= deadline) refuse(Error("LOGINOM_PRE_READY_READ_EXPIRED"))
      if (state.primary) throw state.primary.value
      if (control.signal !== signal || control.deadline !== deadline || keys.some(key=>input[key] !== snapshot[key])
          || input.environment !== environment || JSON.stringify(runtimeEnvironment(input.environment ?? process.env)) !== JSON.stringify(snapshot.environment))
        { refuse(Error("LOGINOM_HANDSHAKE_INVALID")); throw state.primary!.value }
    },
    async observed(work) {
      let value
      try { value = await work }
      catch (error) { if (state.primary) { state.secondary ??= {value:error}; throw state.primary.value }; refuse(error); throw error }
      fp.guard()
      return value
    },
    retain(host) { fpRetained.set(input, host) },
    dispose() {clearTimeout(timer);signal.removeEventListener("abort",abort)},
  }
  fpAttempts.add(input)
  try { fp.guard(); return await launchFPDiagnostic(snapshot, "field-parameters-preservation-v1", fp) }
  finally { fp.dispose() }
}, {
  // Same original private child only; no minted readiness/authority or replay.
  retained(input: object) { return fpRetained.get(input) },
})
async function launchFPDiagnostic(input: NodeHostInput & { packagePath: string }, harness: "field-parameters-preservation-v1", fp?: FPStart) {
  const observed = <T>(work:Promise<T>) => fp ? fp.observed(work) : work
  fp?.guard()
  if (typeof input.packagePath !== "string" || input.packagePath.length > 1024 || !/^\/[^/\\\x00-\x1f]+\/[^/\\\x00-\x1f]+\.lgp$/.test(input.packagePath)
      || input.packagePath.split("/").some(x => x === "." || x === ".."))
    throw Error("LOGINOM_HANDSHAKE_INVALID")
  const manifest = JSON.parse(await observed(readFile(join(input.resources, "resource-manifest.json"), "utf8")))
  // The post-staging Node host belongs to the product inventory, not the
  // runtime resource inventory. Use its canonical receiving product location.
  const product = resolve(input.resources, "../..")
  if (await observed(realpath(input.resources)) !== join(product, "resources/loginom"))
    throw Error("LOGINOM_HANDSHAKE_INVALID")
  const cli = JSON.parse(await observed(readFile(join(product, "cli-manifest.json"), "utf8")))
  const hosts = cli.files?.filter((file: { path: string }) => file.path === "resources/loginom/host/node-host.mjs")
  const hostItem = hosts?.[0]
  if (cli.format !== "loginom-cli-artifact-v1" || hosts?.length !== 1 || !/^[a-f0-9]{64}$/.test(hostItem.sha256)
      || await observed(realpath(input.entry)) !== join(product, "resources/loginom/host/node-host.mjs")
      || createHash("sha256").update(await observed(readFile(input.entry))).digest("hex") !== hostItem.sha256)
    throw Error("LOGINOM_HANDSHAKE_INVALID")
  const fixedResources = ["runtime/src/original-prepare-lender.mjs","runtime/src/fp-managed-startup.mjs"]
  for (const [path, actual] of [["bin/node", input.node], ...fixedResources.map(path => [path, join(input.resources, path)])]) {
    const items = manifest.files?.filter((file: { path: string }) => file.path === path)
    const item = items?.[0]
    if (items?.length !== 1 || !/^[a-f0-9]{64}$/.test(item.sha256) || await observed(realpath(actual!)) !== resolve(input.resources, path!)
        || createHash("sha256").update(await observed(readFile(actual!))).digest("hex") !== item.sha256)
      throw Error("LOGINOM_HANDSHAKE_INVALID")
  }
  const grant = { authorization: randomBytes(32).toString("hex"), packagePath: input.packagePath,
    harness }
  const options = { ...input }
  diagnostics.set(options, grant)
  if (fp) fpStarts.set(options, fp)
  const host = await observed(launchNodeHost(options))
  return host
}

// Closed diagnostic launcher. Resource paths and harness are fixed; callers
// cannot supply executable code, a module path or a transport capability.
export async function launchSortingDiagnostic(input: NodeHostInput & { packagePath?: string }, originalControl?: object) {
  const root = originalControl ? retainOriginalRunOrigin(originalControl) : undefined
  root?.guard()
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
    ["runtime/src/acceptance/sorting-before-close-v1.mjs", join(input.resources, "runtime/src/acceptance/sorting-before-close-v1.mjs")]]) {
    const items = manifest.files?.filter((file: { path: string }) => file.path === path)
    const item = items?.[0]
    if (items?.length !== 1 || !/^[a-f0-9]{64}$/.test(item.sha256) || await realpath(actual!) !== resolve(input.resources, path!)
        || createHash("sha256").update(await readFile(actual!)).digest("hex") !== item.sha256)
      throw Error("LOGINOM_HANDSHAKE_INVALID")
  }
  const grant = { authorization: randomBytes(32).toString("hex"), packagePath: input.packagePath, harness: "sorting-before-close-v1" as const }
  const options = { ...input }
  diagnostics.set(options, grant)
  root?.guard()
  const host = await launchNodeHost(options, originalControl)
  return { ...host, auditAuthorization: grant.authorization, capture: (run: string) => host.request("acceptance.capture", { run, authorization: grant.authorization }) }
}

export async function launchNodeHost(input: NodeHostInput, originalControl?: object) {
  const root = originalControl ? retainOriginalRunOrigin(originalControl) : undefined
  root?.guard()
  if ("rootOrigin" in input) throw Error("LOGINOM_HANDSHAKE_INVALID")
  // Ordinary product callers cannot turn structural fields into authority.
  if ("acceptanceCapture" in input) throw Error("LOGINOM_HANDSHAKE_INVALID")
  const diagnostic = diagnostics.get(input)
  const fp = fpStarts.get(input)
  fp?.guard()
  if (![input.node, input.entry, input.root, input.resources].every(isAbsolute))
    throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const environment = runtimeEnvironment(input.environment ?? process.env)
  if (originalControl) {
    if(rootAttempts.has(originalControl))throw Error("LOGINOM_RECOVERY_REQUIRED")
    rootAttempts.add(originalControl)
  }
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
      child.send(parentRootMessage(port,value) as object, (error) => {
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
  if (originalControl) bindOriginalRootPort(port, originalControl, child)
  const fpClient = diagnostic?.harness === "field-parameters-preservation-v1" ? privateFPTransport(port) : undefined
  const client = fpClient ?? transport(port)
  const startupInput = {
    protocol: 1 as const,
    ...(diagnostic ? {acceptanceCapture: diagnostic} : {}),
    root: input.root, resources: input.resources, headless: input.headless,
    ...(input.acceptanceCleanupPackage !== undefined ? {acceptanceCleanupPackage: input.acceptanceCleanupPackage} : {}),
    ...(input.strictRecovery !== undefined ? {strictRecovery: input.strictRecovery} : {}),
  }
  const handle = {
    port, exited, request: client.request,
    get alive() { return !state.closed },
    close() {
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
    },
  }
  fp?.retain(handle)
  const ready = await (fp && fpClient && diagnostic
    ? fpClient.start(startupInput as Parameters<typeof fpClient.start>[0], fp.control)
    : client.request("start", startupInput, 180_000))
    .catch(async (error:unknown) => {
      // Keep the original FP child UNKNOWN after dispatch, without kill/replay.
      if (!fp) { child.kill("SIGTERM"); client.close() }
      throw error
    })
  fp?.guard()
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
    if (!fp) { child.kill("SIGTERM"); client.close() }
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  }
  return handle
}
