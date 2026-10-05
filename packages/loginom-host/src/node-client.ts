import { fork } from "node:child_process"
import { isAbsolute } from "node:path"
import { EventEmitter } from "node:events"
import { runtimeEnvironment } from "./supervisor"
import { transport, type Port } from "./transport"
import { hostError } from "./errors"

export class NodeHostStartupError extends Error {
  constructor(
    cause: unknown,
    readonly cleanupConfirmed: boolean,
    readonly cleanupError?: unknown,
  ) {
    super(
      cause instanceof Error && ["LOGINOM_HOST_TIMEOUT", "LOGINOM_ABSOLUTE_PATH_REQUIRED"].includes(cause.message)
        ? cause.message
        : hostError(cause),
      { cause },
    )
    this.name = "NodeHostStartupError"
  }
}

export async function launchNodeHost(
  input: {
    node: string
    entry: string
    root: string
    resources: string
    headless: boolean
    environment?: NodeJS.ProcessEnv
    strictRecovery?: boolean
  },
  timing: { start?: number; close?: number; terminate?: number; teardown?: number } = {},
) {
  if (![input.node, input.entry, input.root, input.resources].every(isAbsolute))
    throw new NodeHostStartupError(new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED"), true)
  const environment = runtimeEnvironment(input.environment ?? process.env)
  const child = (() => {
    try {
      return fork(input.entry, [], {
        execPath: input.node,
        execArgv: ["--use-system-ca"],
        env: environment,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      })
    } catch (error) {
      throw new NodeHostStartupError(error, true)
    }
  })()
  const events = new EventEmitter()
  const state = {
    closed: false,
    spawned: child.pid !== undefined,
    noProcess: false,
    closing: undefined as Promise<void> | undefined,
  }
  child.once("spawn", () => {
    state.spawned = true
  })
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once("exit", (code, signal) => {
      closePort()
      resolve({ code, signal })
    })
    child.on("error", () => {
      closePort()
      if (state.spawned || child.pid !== undefined) return
      state.noProcess = true
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
  function waitForExit(timeout: number) {
    return new Promise<Awaited<typeof exited> | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), Math.max(0, timeout))
      void exited.then((outcome) => {
        clearTimeout(timer)
        resolve(outcome)
      })
    })
  }
  function close() {
    if (state.closing) return state.closing
    state.closing = (async () => {
      const deadline = Date.now() + (timing.teardown ?? 60_000)
      const gracefulDeadline = Math.min(deadline, Date.now() + (timing.close ?? 30_000))
      try {
        const result = await client
          .request("close", {}, Math.max(0, gracefulDeadline - Date.now()))
          .catch(() => undefined)
        const graceful = await waitForExit(gracefulDeadline - Date.now())
        if (state.noProcess) return
        const outcome =
          graceful ??
          (await (async () => {
            await Promise.resolve()
              .then(() => child.kill("SIGTERM"))
              .catch(() => false)
            const terminated = await waitForExit(Math.min(timing.terminate ?? 5000, deadline - Date.now()))
            if (terminated) return terminated
            await Promise.resolve()
              .then(() => child.kill("SIGKILL"))
              .catch(() => false)
            return waitForExit(deadline - Date.now())
          })())
        // Exit after a signal bounds teardown but cannot certify resource cleanup.
        if (
          !graceful ||
          !result ||
          typeof result !== "object" ||
          !("closed" in result) ||
          result.closed !== true ||
          !outcome ||
          outcome.code !== 0 ||
          outcome.signal
        )
          throw new Error("LOGINOM_HOST_CLEANUP_FAILED")
      } finally {
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
      // Startup restores the saved connection and waits for browser/MCP readiness.
      // Use the normal bounded RPC budget; browser login alone can exceed 30s.
      timing.start ?? 180_000,
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
    })
    .catch(async (error: unknown) => {
      const cleanup = await close().then(
        () => undefined,
        (failure: unknown) => failure,
      )
      throw new NodeHostStartupError(error, cleanup === undefined, cleanup)
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
