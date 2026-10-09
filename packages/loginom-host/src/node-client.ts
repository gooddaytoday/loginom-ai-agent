import { fork } from "node:child_process"
import { isAbsolute } from "node:path"
import { EventEmitter } from "node:events"
import { runtimeEnvironment } from "./supervisor"
import { transport, type Port } from "./transport"

export class NodeHostStartupError extends Error {
  constructor(
    cause: unknown,
    readonly cleanupConfirmed: boolean,
  ) {
    super(cause instanceof Error ? cause.message : "LOGINOM_HOST_REQUEST_FAILED", { cause })
    this.name = "NodeHostStartupError"
  }
}

export async function launchNodeHost(input: {
  node: string
  entry: string
  root: string
  resources: string
  headless: boolean
  environment?: NodeJS.ProcessEnv
  strictRecovery?: boolean
}) {
  if (![input.node, input.entry, input.root, input.resources].every(isAbsolute))
    throw new NodeHostStartupError(new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED"), true)
  const environment = runtimeEnvironment(input.environment ?? process.env)
  const child = await Promise.resolve()
    .then(() =>
      fork(input.entry, [], {
        execPath: input.node,
        execArgv: ["--use-system-ca"],
        env: environment,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      }),
    )
    .catch((error: unknown) => {
      throw new NodeHostStartupError(error, true)
    })
  const events = new EventEmitter()
  const state = { closed: false, spawnFailed: false, closing: undefined as Promise<void> | undefined }
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once("exit", (code, signal) => {
      closePort()
      resolve({ code, signal })
    })
    child.once("error", () => {
      closePort()
      // An IPC/send error after spawn is not evidence that the process exited.
      if (child.pid === undefined) {
        state.spawnFailed = true
        resolve({ code: 1, signal: null })
      }
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
  function close() {
    if (state.closing) return state.closing
    state.closing = (async () => {
      const result = await client.request("close", {}, 30_000).catch(() => undefined)
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000)
      try {
        const outcome = await exited
        if (
          !state.spawnFailed &&
          (!result ||
            typeof result !== "object" ||
            !("closed" in result) ||
            result.closed !== true ||
            outcome.code !== 0 ||
            outcome.signal)
        )
          throw new Error("LOGINOM_HOST_CLEANUP_FAILED")
      } finally {
        clearTimeout(timer)
        client.close()
      }
    })()
    return state.closing
  }
  await client
    .request(
      "start",
      {
        protocol: 1,
        root: input.root,
        resources: input.resources,
        headless: input.headless,
        ...(input.strictRecovery !== undefined ? { strictRecovery: input.strictRecovery } : {}),
      },
      // Restored startup acknowledges local activation independently of the Help catalog.
      // Preserve the bounded private-host budget; explicit Help preflight is a separate request.
      180_000,
    )
    .then((ready) => {
      if (
        !ready ||
        typeof ready !== "object" ||
        !("protocol" in ready) ||
        ready.protocol !== 1 ||
        !("ready" in ready) ||
        ready.ready !== true ||
        !("pid" in ready) ||
        ready.pid !== child.pid
      )
        throw new Error("LOGINOM_HANDSHAKE_INVALID")
      return ready
    })
    .catch(async (error: unknown) => {
      const cleanupConfirmed = await close().then(
        () => true,
        () => false,
      )
      throw new NodeHostStartupError(error, cleanupConfirmed)
    })
  return {
    port,
    exited,
    request: client.request,
    get alive() {
      return !state.closed
    },
    close,
  }
}
