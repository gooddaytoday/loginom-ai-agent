import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
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
      `[org/gnome/system/proxy]\nmode='auto'\nautoconfig-url='http://127.0.0.1:${silentAddress.port}/proxy.pac'\n`,
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

const hungBin = await mkdtemp(join(tmpdir(), "loginom-proxy-gsettings-"))
await mkdir(join(hungBin, "bin"))
await writeFile(join(hungBin, "bin", "gsettings"), "#!/bin/sh\n/bin/sleep 30\n", { mode: 0o755 })
const failed = await launch({
  XDG_CURRENT_DESKTOP: "GNOME",
  PATH: `${join(hungBin, "bin")}:${process.env.PATH ?? ""}`,
})
try {
  const log = await waitForLog(failed.root, "system proxy: failed", 20_000)
  if (!log) throw new Error(`SYSTEM_PROXY_FAILED_NOT_LOGGED\n${await readLogs(failed.root)}`)
  console.log(JSON.stringify({ status: "PASS", case: "reader-failed" }))
} finally {
  await stop(failed.child)
  await rm(failed.root, { recursive: true, force: true })
  await rm(hungBin, { recursive: true, force: true })
}

const defaults = await launch({
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
})
try {
  const direct = await waitForLog(defaults.root, "system proxy: direct", 20_000)
  if (!direct) throw new Error(`SYSTEM_PROXY_DIRECT_NOT_LOGGED\n${await readLogs(defaults.root)}`)
  const ready = await waitForLog(defaults.root, "loading task finished", 20_000)
  if (!ready) throw new Error(`LOADING_NOT_FINISHED\n${await readLogs(defaults.root)}`)
  console.log(JSON.stringify({ status: "PASS", case: "gnome-defaults" }))
} finally {
  await stop(defaults.child)
  await rm(defaults.root, { recursive: true, force: true })
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
