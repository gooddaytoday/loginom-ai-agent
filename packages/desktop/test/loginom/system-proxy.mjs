import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { connect, createServer as createTcpServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const directory = resolve(import.meta.dirname, "../..")
const electron = resolve(directory, "node_modules/electron/dist/electron")
const off = await launch({ LOGINOM_AI_AGENT_SYSTEM_PROXY: "off" })
try {
  const log = await waitForLog(off.root, "system proxy: off", 20_000)
  if (!log) throw new Error(`SYSTEM_PROXY_OFF_NOT_LOGGED\n${await readLogs(off.root)}`)
  console.log(JSON.stringify({ status: "PASS", case: "off" }))
} finally {
  await stop(off.child)
  await rm(off.root, { recursive: true, force: true })
}

const silentPac = createServer(() => undefined)
silentPac.listen(0, "127.0.0.1")
await once(silentPac, "listening")
const silentAddress = silentPac.address()
if (!silentAddress || typeof silentAddress === "string") throw new Error("PAC_PORT")
const silent = await launch(
  {
    XDG_CURRENT_DESKTOP: "GNOME",
    GSETTINGS_BACKEND: "keyfile",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    no_proxy: "",
    NODE_USE_ENV_PROXY: "",
  },
  [],
  async (root) => {
    const settings = join(root, "config", "glib-2.0", "settings")
    await mkdir(settings, { recursive: true })
    await writeFile(
      join(settings, "keyfile"),
      `[system/proxy]\nmode='auto'\nautoconfig-url='http://127.0.0.1:${silentAddress.port}/proxy.pac'\n`,
    )
  },
)
try {
  const ready = await waitForLog(silent.root, "loading task finished", 10_000)
  if (!ready) throw new Error(`SILENT_PAC_NOT_READY\n${await readLogs(silent.root)}`)
  console.log(JSON.stringify({ status: "PASS", case: "silent-pac" }))
} finally {
  await stop(silent.child)
  await rm(silent.root, { recursive: true, force: true })
  silentPac.close()
}

const shellRoot = await mkdtemp(join(tmpdir(), "loginom-proxy-shell-"))
const shellBin = join(shellRoot, "shell")
await writeFile(shellBin, "#!/bin/sh\nprintf 'PATH=/usr/bin\\0'\n", { mode: 0o755 })
const fallback = await launch({
  SHELL: shellBin,
  LOGINOM_AI_AGENT_TEST_SIDECAR_PROXY: "http://[:8080]",
  HTTPS_PROXY: "",
  https_proxy: "",
  HTTP_PROXY: "",
  http_proxy: "",
  ALL_PROXY: "",
  all_proxy: "",
  NO_PROXY: "",
  no_proxy: "",
  NODE_USE_ENV_PROXY: "",
})
try {
  const fell = await waitForLog(fallback.root, "system proxy: fallback", 20_000)
  if (!fell) throw new Error(`SYSTEM_PROXY_FALLBACK_NOT_LOGGED\n${await readLogs(fallback.root)}\n${fallback.output()}`)
  const ready = await waitForLog(fallback.root, "loading task finished", 20_000)
  if (!ready) throw new Error(`FALLBACK_NOT_READY\n${await readLogs(fallback.root)}`)
  console.log(JSON.stringify({ status: "PASS", case: "sidecar-fallback" }))
} finally {
  await stop(fallback.child)
  await rm(fallback.root, { recursive: true, force: true })
  await rm(shellRoot, { recursive: true, force: true })
}

// Without explicit HTTP(S)_PROXY the relay owns proxy selection (proxy-relay.ts):
// the gsettings reader never starts, so it cannot hang or fail startup. A
// resolver that never answers is reported per connection: the client gets 502
// and the journal gets "system proxy: unreachable" with the requested target.
// GIO's keyfile backend stores /org/gnome/system/proxy in group [system/proxy].
const target = createTcpServer((socket) => socket.end())
target.listen(0, "127.0.0.1")
await once(target, "listening")
const targetAddress = target.address()
if (!targetAddress || typeof targetAddress === "string") throw new Error("TARGET_PORT")
const authority = `127.0.0.1:${targetAddress.port}`
const hungPac = createServer(() => undefined)
hungPac.listen(0, "127.0.0.1")
await once(hungPac, "listening")
const hungAddress = hungPac.address()
if (!hungAddress || typeof hungAddress === "string") throw new Error("PAC_PORT")
const failed = await launch(gnome(), [], async (root) => {
  const settings = join(root, "config", "glib-2.0", "settings")
  await mkdir(settings, { recursive: true })
  await writeFile(
    join(settings, "keyfile"),
    `[system/proxy]\nmode='auto'\nautoconfig-url='http://127.0.0.1:${hungAddress.port}/proxy.pac'\n`,
  )
})
try {
  const relay = await relayAddress(failed.root)
  const status = await connectThrough(relay, authority)
  if (status !== 502) throw new Error(`RELAY_RESOLVER_FAILURE_NOT_REJECTED status=${status}`)
  const log = await waitForLog(failed.root, `system proxy: unreachable { address: '${authority}' }`, 20_000)
  if (!log) throw new Error(`RELAY_RESOLVER_FAILURE_NOT_LOGGED\n${await readLogs(failed.root)}`)
  if (log.includes("system proxy: failed")) throw new Error("SYSTEM_PROXY_READER_STARTED")
  console.log(JSON.stringify({ status: "PASS", case: "relay-resolver-failed", code: "unreachable" }))
} finally {
  await stop(failed.child)
  await rm(failed.root, { recursive: true, force: true })
  hungPac.close()
}

const defaults = await launch(gnome())
try {
  const relay = await relayAddress(defaults.root)
  const status = await connectThrough(relay, authority)
  if (status !== 200) throw new Error(`RELAY_DIRECT_FAILED status=${status}\n${await readLogs(defaults.root)}`)
  const ready = await waitForLog(defaults.root, "loading task finished", 20_000)
  if (!ready) throw new Error(`LOADING_NOT_FINISHED\n${await readLogs(defaults.root)}`)
  if (ready.includes("system proxy: unreachable")) throw new Error(`RELAY_DIRECT_REPORTED_UNREACHABLE\n${ready}`)
  console.log(JSON.stringify({ status: "PASS", case: "gnome-defaults", route: "direct" }))
} finally {
  await stop(defaults.child)
  await rm(defaults.root, { recursive: true, force: true })
  target.close()
}

function gnome() {
  return {
    XDG_CURRENT_DESKTOP: "GNOME",
    GSETTINGS_BACKEND: "keyfile",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    no_proxy: "",
    NODE_USE_ENV_PROXY: "",
  }
}

async function relayAddress(root) {
  const log = await waitForLog(root, "system proxy: relay", 20_000)
  const address = log?.match(/system proxy: relay \{\s*address: '(http:\/\/127\.0\.0\.1:\d+)'/)?.[1]
  if (!address) throw new Error(`SYSTEM_PROXY_RELAY_NOT_LOGGED\n${log ?? (await readLogs(root))}`)
  return new URL(address)
}

function connectThrough(relay, authority) {
  return new Promise((resolve, reject) => {
    const socket = connect(Number(relay.port), relay.hostname)
    let head = ""
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`RELAY_CONNECT_TIMEOUT ${authority}`))
    }, 20_000)
    socket.once("connect", () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`))
    socket.on("data", (chunk) => {
      head += chunk.toString("latin1")
      const line = head.split("\r\n")[0]
      if (!head.includes("\r\n")) return
      clearTimeout(timer)
      socket.destroy()
      resolve(Number(line.split(" ")[1]))
    })
    socket.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.once("close", () => {
      clearTimeout(timer)
      if (!head.includes("\r\n")) reject(new Error(`RELAY_CLOSED_WITHOUT_STATUS ${authority}`))
    })
  })
}

async function launch(env, args = [], prepare) {
  const root = await mkdtemp(join(tmpdir(), "loginom-system-proxy-"))
  if (prepare) await prepare(root)
  const child = spawn(electron, [...args, directory], {
    cwd: directory,
    env: {
      ...process.env,
      ...env,
      LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
      LOGINOM_AI_AGENT_TEST_ROOT: root,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout?.on("data", (chunk) => {
    output += chunk.toString()
  })
  child.stderr?.on("data", (chunk) => {
    output += chunk.toString()
  })
  return { child, root, output: () => output }
}

async function waitForLog(root, text, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const log = await readLogs(root)
    if (log.includes(text)) return log
    await delay(200)
  }
}

async function readLogs(root) {
  const files = []
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (entry.name.endsWith(".log")) files.push(path)
    }
  }
  await walk(join(root, "desktop", "logs"))
  const texts = await Promise.all(files.map((file) => readFile(file, "utf8").catch(() => "")))
  return texts.join("\n")
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([onceExit(child), delay(5_000)])
  if (child.exitCode === null) child.kill("SIGKILL")
  await onceExit(child)
}

function onceExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) resolve()
    else child.once("exit", resolve)
  })
}
