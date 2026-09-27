import { fork } from "node:child_process"
import { isAbsolute } from "node:path"
import { EventEmitter } from "node:events"
import { runtimeEnvironment, validateLoginBinding, type LoginBarrier } from "./supervisor"
import { transport, type Port } from "./transport"

export async function launchNodeHost(input: {
  node: string
  entry: string
  root: string
  resources: string
  headless: boolean
  environment?: NodeJS.ProcessEnv
  strictRecovery?: boolean
  loginBarrier?: LoginBarrier
}) {
  if (![input.node, input.entry, input.root, input.resources].every(isAbsolute))
    throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const barrier = input.loginBarrier
  if (barrier !== undefined && typeof barrier !== "function") throw Error("LOGINOM_LOGIN_BARRIER_INVALID")
  let loginBusy = false
  const loginRequests = new Set<string>()
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
  child.on("message", (data: unknown) => {
    if (data && typeof data === "object" && "method" in data && data.method === "login-barrier") {
      void (async () => {
        if (
          !barrier ||
          state.closed ||
          loginBusy ||
          loginRequests.size >= 64 ||
          Object.keys(data).sort().join() !== "id,input,method" ||
          !("id" in data) ||
          typeof data.id !== "string" ||
          data.id.length !== 36 ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.id) ||
          loginRequests.has(data.id) ||
          !("input" in data) ||
          !data.input ||
          typeof data.input !== "object" ||
          Object.keys(data.input).sort().join() !== "binding,phase" ||
          !("phase" in data.input) ||
          (data.input.phase !== "begin" && data.input.phase !== "authenticated") ||
          !("binding" in data.input)
        )
          throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
        const binding = validateLoginBinding(data.input.binding)
        loginRequests.add(data.id)
        loginBusy = true
        const timer = setTimeout(closePort, 60_000)
        try {
          const result = await barrier(Object.freeze({ phase: data.input.phase as "begin" | "authenticated", binding }))
          if (result !== undefined || state.closed || !child.connected) throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
          child.send({ id: data.id, result: { accepted: true } }, (error) => {
            if (error) closePort()
          })
        } finally {
          clearTimeout(timer)
          loginBusy = false
        }
      })().catch(() => {
        closePort()
        if (child.connected && "id" in data && typeof data.id === "string")
          child.send({ id: data.id, error: "LOGINOM_LOGIN_BARRIER_UNKNOWN" })
      })
      return
    }
    events.emit("message", { data })
  })
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
        ...(barrier ? { loginBarrier: 2 } : {}),
        root: input.root,
        resources: input.resources,
        headless: input.headless,
        ...(input.strictRecovery !== undefined ? { strictRecovery: input.strictRecovery } : {}),
      },
      barrier ? 330_000 : 30_000,
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
