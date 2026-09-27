import { fork } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { isAbsolute } from "node:path"

export type LoginBinding = Readonly<{
  attemptId: string
  loginId: string
  generation: number
  purpose: "validation" | "readiness" | "chat"
  chat: string
  account: string
}>
export type LoginBarrier = (
  event: Readonly<{ phase: "begin" | "authenticated"; binding: LoginBinding }>,
) => Promise<void>
export function validateLoginBinding(value: unknown): LoginBinding {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).sort().join() !== "account,attemptId,chat,generation,loginId,purpose"
  )
    throw Error("LOGINOM_LOGIN_BARRIER_INVALID")
  const item = value as LoginBinding
  const uuid = (v: unknown) =>
    typeof v === "string" &&
    v.length === 36 &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
  if (
    typeof item.attemptId !== "string" ||
    !item.attemptId.length ||
    item.attemptId.length > 160 ||
    /[^A-Za-z0-9_-]/.test(item.attemptId) ||
    !uuid(item.loginId) ||
    !Number.isSafeInteger(item.generation) ||
    item.generation < 1 ||
    typeof item.account !== "string" ||
    !item.account.length ||
    item.account.length > 128 ||
    /[\x00-\x1f\x7f]/.test(item.account) ||
    !(item.purpose === "validation"
      ? uuid(item.chat)
      : item.purpose === "readiness"
        ? item.chat === "readiness"
        : item.purpose === "chat" &&
          typeof item.chat === "string" &&
          item.chat.length === 64 &&
          !/[^a-f0-9]/.test(item.chat))
  )
    throw Error("LOGINOM_LOGIN_BARRIER_INVALID")
  return Object.freeze({ ...item })
}

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
  trustedAttempt?: { attemptId: string }
  loginBinding?: LoginBinding
  loginBarrier?: LoginBarrier
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

// One child per generation/chat. Credentials travel only through Node's private IPC pipe.
export async function supervise(input: Launch) {
  if (![input.node, input.entry, input.resources, input.stateDir].every(isAbsolute))
    throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const login = input.loginBinding === undefined ? undefined : validateLoginBinding(input.loginBinding)
  if (
    (login !== undefined) !== (typeof input.loginBarrier === "function") ||
    (login &&
      (login.generation !== input.generation ||
        login.chat !== input.chat ||
        login.account !== input.connection.username ||
        login.attemptId !== input.trustedAttempt?.attemptId))
  )
    throw Error("LOGINOM_LOGIN_BARRIER_INVALID")
  const barrier = input.loginBarrier
  const loginState = { phase: "begin", busy: false, failed: false }
  await mkdir(input.stateDir, { recursive: true, mode: 0o700 })
  const child = fork(input.entry, [], {
    execPath: input.node,
    execArgv: ["--use-system-ca"],
    cwd: input.stateDir,
    env: runtimeEnvironment(input.environment ?? process.env),
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  })
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >()
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }))
    child.once("error", () => resolve({ code: 1, signal: null }))
  })
  function fail() {
    loginState.failed = true
    pending.forEach((request) => {
      clearTimeout(request.timer)
      request.reject(new Error("LOGINOM_RUNTIME_DISCONNECTED"))
    })
    pending.clear()
  }
  child.on("disconnect", fail)
  child.on("exit", fail)
  child.on("error", fail)
  child.on("message", (message) => {
    if (message && typeof message === "object" && "operation" in message && message.operation === "login-barrier") {
      const event = message as { id?: unknown; input?: unknown }
      const phase =
        event.input && typeof event.input === "object" && "phase" in event.input ? event.input.phase : undefined
      if (
        !login ||
        !barrier ||
        loginState.failed ||
        loginState.busy ||
        typeof event.id !== "string" ||
        event.id.length !== 36 ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(event.id) ||
        Object.keys(message).sort().join() !== "id,input,operation" ||
        !event.input ||
        Object.keys(event.input).join() !== "phase" ||
        (phase !== "begin" && phase !== "authenticated") ||
        phase !== loginState.phase
      ) {
        fail()
        if (child.connected && typeof event.id === "string")
          child.send({ id: event.id, error: "LOGINOM_LOGIN_BARRIER_UNKNOWN" })
        return
      }
      loginState.busy = true
      const timer = setTimeout(fail, 60_000)
      void Promise.resolve()
        .then(() => barrier(Object.freeze({ phase: phase as "begin" | "authenticated", binding: login })))
        .then((result) => {
          if (result !== undefined || loginState.failed || !child.connected)
            throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
          loginState.phase = phase === "begin" ? "authenticated" : "done"
          loginState.busy = false
          child.send({ id: event.id, result: { accepted: true } })
        })
        .catch(() => {
          fail()
          if (child.connected) child.send({ id: event.id, error: "LOGINOM_LOGIN_BARRIER_UNKNOWN" })
        })
        .finally(() => clearTimeout(timer))
      return
    }
    if (!message || typeof message !== "object" || !("id" in message) || typeof message.id !== "string") return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if ("error" in message) {
      request.reject(
        new Error(
          typeof message.error === "string" && /^LOGINOM_[A-Z_]+$/.test(message.error)
            ? message.error
            : "LOGINOM_RUNTIME_FAILED",
        ),
      )
      return
    }
    request.resolve("result" in message ? message.result : undefined)
  })
  function request(operation: string, value?: unknown, timeout = 120_000) {
    if (!child.connected) return Promise.reject(new Error("LOGINOM_RUNTIME_DISCONNECTED"))
    const id = randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error("LOGINOM_RUNTIME_TIMEOUT"))
      }, timeout)
      pending.set(id, { resolve, reject, timer })
      child.send({ id, operation, input: value }, (error) => {
        if (error) fail()
      })
    })
  }
  const closing: { promise?: Promise<void> } = {}
  function close() {
    if (closing.promise) return closing.promise
    loginState.failed = true
    closing.promise = (async () => {
      const reply = await request("close", undefined, 5000).catch(() => undefined)
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
    return closing.promise
  }
  // Connection validation can spend 30 seconds on MCP initialization and up
  // to 150 seconds navigating/authenticating Loginom. Do not race that
  // documented budget with the ordinary 120-second runtime handshake.
  const ready = await request(
    "start",
    { ...input, environment: undefined, loginBinding: login, loginBarrier: login ? 2 : undefined, protocol: 1 },
    login ? 330_000 : input.validation ? 210_000 : 120_000,
  ).catch(async (error: Error) => {
    await close()
    throw error
  })
  if (
    (login && (loginState.failed || loginState.busy || loginState.phase !== "done")) ||
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
    await close()
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  }
  return { ready, request, close, exited }
}
