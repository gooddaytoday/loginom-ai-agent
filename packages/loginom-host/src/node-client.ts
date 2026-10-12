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
  acceptanceCleanupPackage?: string
}
const diagnostics = new WeakMap<object, { authorization: string; packagePath: string; harness?: "amount-import-type-v1" | "sorting-before-close-v1" | "import-before-configure-v1"; deadline?: number }>()

// Closed diagnostic launcher. Resource paths and harness are fixed; callers
// cannot supply executable code, a module path or a transport capability.
export async function launchCalculatorDiagnostic(input: NodeHostInput & { packagePath: string }) {
  return launchDiagnostic(input, "calculator-grouped-before-done-v1")
}
export async function launchAmountDiagnostic(input: NodeHostInput & { packagePath: string }) {
  return launchDiagnostic(input, "amount-import-type-v1")
}
export async function launchSortingDiagnostic(input: NodeHostInput & {packagePath?: string}) {
  if (!input.packagePath) throw Error("LOGINOM_HANDSHAKE_INVALID")
  return launchDiagnostic({...input,packagePath:input.packagePath}, "sorting-before-close-v1")
}
export async function launchImportDiagnostic(input: NodeHostInput & {packagePath: string; deadline: number}) {
  if (!Number.isSafeInteger(input.deadline) || input.deadline <= Date.now() || input.deadline > Date.now()+600000)
    throw Error("LOGINOM_HANDSHAKE_INVALID")
  return launchDiagnostic(input, "import-before-configure-v1")
}
async function launchDiagnostic(input: NodeHostInput & { packagePath: string; deadline?: number }, harness: "calculator-grouped-before-done-v1" | "amount-import-type-v1" | "sorting-before-close-v1" | "import-before-configure-v1") {
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
    ...(harness !== "calculator-grouped-before-done-v1" ? { harness } : {}),
    ...(harness === "import-before-configure-v1" ? {deadline: input.deadline} : {}) }
  const options = { ...input }
  diagnostics.set(options, grant)
  const host = await launchNodeHost(options)
  return { ...host, ...(harness === "sorting-before-close-v1" ? {auditAuthorization:grant.authorization} : {}), capture: (run: string) => host.request("acceptance.capture", { run, authorization: grant.authorization }) }
}

export async function launchNodeHost(input: NodeHostInput) {
  // Ordinary product callers cannot turn structural fields into authority.
  if ("acceptanceCapture" in input) throw Error("LOGINOM_HANDSHAKE_INVALID")
  const diagnostic = diagnostics.get(input)
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
        ...(input.acceptanceCleanupPackage !== undefined ? { acceptanceCleanupPackage: input.acceptanceCleanupPackage } : {}),
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
}
