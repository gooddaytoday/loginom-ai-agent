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
}

export function runtimeEnvironment(environment: NodeJS.ProcessEnv, platform = process.platform) {
  const env: NodeJS.ProcessEnv = {}
  const keys = [
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
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
  keys.forEach((key) => {
    if (environment[key]) env[key] = environment[key]
  })
  return env
}

// One child per generation/chat. Credentials travel only through Node's private IPC pipe.
export async function supervise(input: Launch) {
  if (![input.node, input.entry, input.resources, input.stateDir].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  await mkdir(input.stateDir, { recursive: true, mode: 0o700 })
  const child = fork(input.entry, [], { execPath: input.node, execArgv: [], cwd: input.stateDir, env: runtimeEnvironment(process.env), stdio: ["ignore", "ignore", "ignore", "ipc"] })
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  const exited = new Promise<void>((resolve) => { child.once("exit", () => resolve()) })
  function fail() {
    pending.forEach((request) => { clearTimeout(request.timer); request.reject(new Error("LOGINOM_RUNTIME_DISCONNECTED")) })
    pending.clear()
  }
  child.on("exit", fail)
  child.on("error", fail)
  child.on("message", (message) => {
    if (!message || typeof message !== "object" || !("id" in message) || typeof message.id !== "string") return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if ("error" in message) {
      request.reject(new Error(typeof message.error === "string" && /^LOGINOM_[A-Z_]+$/.test(message.error) ? message.error : "LOGINOM_RUNTIME_FAILED"))
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
      child.send({ id, operation, input: value }, (error) => { if (error) fail() })
    })
  }
  async function close() {
    await request("close", undefined, 5000).catch(() => undefined)
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000)
    try { await exited } finally { clearTimeout(timer) }
  }
  const ready = await request("start", { ...input, protocol: 1 }).catch(async (error: Error) => {
    await close()
    throw error
  })
  if (!ready || typeof ready !== "object" || !("protocol" in ready) || ready.protocol !== 1
    || !("generation" in ready) || ready.generation !== input.generation
    || (input.validation ? !("checked" in ready) || ready.checked !== true
      : !("ready" in ready) || ready.ready !== true || !("chat" in ready) || ready.chat !== input.chat)) {
    await close()
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  }
  return { ready, request, close }
}
