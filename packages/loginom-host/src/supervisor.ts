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
    { ...input, environment: undefined, protocol: 1 },
    input.validation ? 210_000 : 120_000,
  ).catch(
    async (error: Error) => {
      await close()
      throw error
    },
  )
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
    await close()
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  }
  return { ready, request, close }
}
