import { createRequire } from "node:module"
import { mkdir, mkdtemp, open, readdir, readFile, rm, stat, utimes } from "node:fs/promises"
import { createConnection, createServer } from "node:net"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { setTimeout } from "node:timers/promises"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const directory = resolve(import.meta.dirname, "../..")
const profile = await mkdtemp(join(tmpdir(), "loginom-crash-logging-"))
const launch = async (root, env = {}) => {
  await waitUntilDebuggerPortFree()
  return _electron.launch({
    executablePath:
      process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ??
      resolve(
        directory,
        process.platform === "darwin"
          ? "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
          : "node_modules/electron/dist/electron",
      ),
    args: [
      ...(process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory]),
      ...(process.env.LOGINOM_AI_AGENT_TEST_WAYLAND === "1" ? ["--ozone-platform=wayland"] : []),
    ],
    cwd: directory,
    env: { ...process.env, ...env, LOGINOM_AI_AGENT_TEST_ONBOARDING: "1", LOGINOM_AI_AGENT_TEST_ROOT: root },
    timeout: 120_000,
  })
}

const application = await launch(profile)
try {
  const page = await application.firstWindow()
  await page.locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  const server = await waitFor(async () => {
    const text = await readNamed(join(profile, "desktop", "logs"), "server.log")
    return text.includes("level=") ? text : undefined
  }, 30_000)
  const legacy = await namedFiles(join(profile, "data"), "loginom-ai-agent.log")
  if (!server || legacy.length > 0) {
    throw new Error(
      `BACKEND_LOG_ROUTING_FAILED server=${Boolean(server)} legacy=${legacy.join(",") || "none"}`,
    )
  }
  await application.evaluate(() => {
    Promise.reject(new Error("main-rejection"))
  })
  const main = await waitFor(async () => {
    const text = await readNamed(join(profile, "desktop", "logs"), "main.log")
    return text.includes("main-rejection") ? text : undefined
  }, 15_000)
  if (!main) throw new Error("MAIN_REJECTION_NOT_LOGGED")
  await page.evaluate(() => setTimeout(() => { throw new Error("renderer-boom") }, 0))
  const renderer = await waitFor(async () => {
    const text = await readNamed(join(profile, "desktop", "logs"), "renderer.log")
    return text.includes("renderer-boom") ? text : undefined
  }, 15_000)
  if (!renderer) throw new Error("RENDERER_ERROR_NOT_LOGGED")
  const sidecar = await application.evaluate(({ app }) => {
    const metric = app.getAppMetrics().find((item) => item.type === "Utility" && item.name === "loginom-ai-agent server")
    return metric?.pid
  })
  if (!sidecar) throw new Error("SIDECAR_PID_UNAVAILABLE")
  process.kill(sidecar, "SIGKILL")
  const exited = await waitFor(async () => {
    const text = await readNamed(join(profile, "desktop", "logs"), "server.log")
    return text.includes("sidecar exited") && text.includes("[error]") ? text : undefined
  }, 15_000)
  if (!exited) throw new Error("SIDECAR_EXIT_NOT_LOGGED")
  console.log(JSON.stringify({ status: "PASS", backend: "server.log", legacy: false, mainRejection: true, rendererError: true, sidecarExit: true }))
} finally {
  await stop(application)
  await rm(profile, { recursive: true, force: true })
}

const blocked = createServer()
const port = await new Promise((resolve, reject) => {
  blocked.once("error", reject)
  blocked.listen(0, "127.0.0.1", () => {
    const address = blocked.address()
    if (!address || typeof address === "string") {
      reject(new Error("PORT_UNAVAILABLE"))
      return
    }
    resolve(address.port)
  })
})
const failedProfile = await mkdtemp(join(tmpdir(), "loginom-crash-logging-"))
const failed = await launch(failedProfile, { LOGINOM_AI_AGENT_PORT: String(port) })
try {
  const text = await waitFor(async () => {
    const log = await readNamed(join(failedProfile, "desktop", "logs"), "main.log")
    return log.includes("initialization failed") ? log : undefined
  }, 30_000)
  if (!text || !text.includes(String(port))) throw new Error(`INITIALIZATION_FAILURE_NOT_LOGGED port=${port}`)
  console.log(JSON.stringify({ status: "PASS", initialization: "logged", port }))
} finally {
  blocked.close()
  await stop(failed)
  await rm(failedProfile, { recursive: true, force: true })
}

const killedProfile = await mkdtemp(join(tmpdir(), "loginom-crash-logging-"))
const killed = await launch(killedProfile)
try {
  await (await killed.firstWindow()).locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  const child = killed.process()
  child.kill("SIGKILL")
  await waitForExit(child)
} finally {
  await stop(killed)
}
const restarted = await launch(killedProfile)
try {
  await (await restarted.firstWindow()).locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  const crash = await readNamed(join(killedProfile, "desktop", "logs"), "crash.log")
  if (!crash.includes("previous session ended unexpectedly")) throw new Error("UNEXPECTED_EXIT_NOT_LOGGED")
  console.log(JSON.stringify({ status: "PASS", unexpectedExit: true }))
} finally {
  await stop(restarted)
  await rm(killedProfile, { recursive: true, force: true })
}

const nativeProfile = await mkdtemp(join(tmpdir(), "loginom-crash-logging-"))
const native = await launch(nativeProfile)
try {
  await (await native.firstWindow()).locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  const child = native.process()
  await native.evaluate(() => process.crash()).catch(() => undefined)
  await waitForExit(child)
} finally {
  await stop(native)
}
const nativeRestarted = await launch(nativeProfile)
try {
  await (await nativeRestarted.firstWindow()).locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  const crash = await readNamed(join(nativeProfile, "desktop", "logs"), "crash.log")
  if (!crash.includes("previous session ended unexpectedly") || !crash.includes(".dmp"))
    throw new Error("NATIVE_CRASH_DUMP_NOT_LOGGED")
  console.log(JSON.stringify({ status: "PASS", nativeCrash: true }))
} finally {
  await stop(nativeRestarted)
  await rm(nativeProfile, { recursive: true, force: true })
}

const cleanProfile = await mkdtemp(join(tmpdir(), "loginom-crash-logging-"))
const clean = await launch(cleanProfile)
try {
  await (await clean.firstWindow()).locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  const child = clean.process()
  await clean.evaluate(({ app }) => app.quit()).catch(() => undefined)
  await waitForExit(child)
} finally {
  await stop(clean)
}
const cleanRestarted = await launch(cleanProfile)
try {
  await (await cleanRestarted.firstWindow()).locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  const main = await readNamed(join(cleanProfile, "desktop", "logs"), "main.log")
  const crash = await readNamed(join(cleanProfile, "desktop", "logs"), "crash.log")
  if (!main.includes("app quit") || crash.includes("previous session ended unexpectedly"))
    throw new Error("CLEAN_EXIT_NOT_RECORDED")
  console.log(JSON.stringify({ status: "PASS", cleanExit: true }))
} finally {
  await stop(cleanRestarted)
  await rm(cleanProfile, { recursive: true, force: true })
}

const budgetProfile = await mkdtemp(join(tmpdir(), "loginom-crash-logging-"))
const oldLog = join(budgetProfile, "desktop", "logs", "old", "main.log")
await writeSparse(oldLog, 101 * 1024 * 1024, 2 * 24 * 60 * 60 * 1000)
const budget = await launch(budgetProfile)
try {
  const page = await budget.firstWindow()
  await page.locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
  if ((await directoryBytes(join(budgetProfile, "desktop", "logs"))) > 100 * 1024 * 1024)
    throw new Error("LOG_BUDGET_EXCEEDED_ON_START")
  if (await stat(oldLog).then(() => true, () => false)) throw new Error("OLD_RUN_SURVIVED_START")
  const current = await readNamed(join(budgetProfile, "desktop", "logs"), "main.log")
  if (!current.includes("app starting")) throw new Error("CURRENT_RUN_MISSING")
  const added = join(budgetProfile, "desktop", "logs", "added", "main.log")
  await writeSparse(added, 90 * 1024 * 1024, 24 * 60 * 60 * 1000)
  await page.evaluate(async () => {
    const line = "x".repeat(1000)
    for (let index = 0; index < 8000; index++) console.log(line)
  })
  const withinBudget = await waitFor(async () => {
    const size = await directoryBytes(join(budgetProfile, "desktop", "logs"))
    const addedRemains = await stat(added).then(() => true, () => false)
    return size <= 100 * 1024 * 1024 && !addedRemains ? true : undefined
  }, 20_000)
  if (!withinBudget) throw new Error("LOG_BUDGET_EXCEEDED_AFTER_ROTATION")
  if (!(await readNamed(join(budgetProfile, "desktop", "logs"), "main.log")).includes("app starting"))
    throw new Error("CURRENT_RUN_REMOVED")
  console.log(JSON.stringify({ status: "PASS", budget: "100MB" }))
} finally {
  await stop(budget)
  await rm(budgetProfile, { recursive: true, force: true })
}

async function stop(application) {
  const child = application.process()
  const exited = waitForExit(child)
  await application.close().catch(() => undefined)
  await Promise.race([exited, setTimeout(15_000)])
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
  await exited
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve()
    else child.once("exit", resolve)
  })
}

async function waitUntilDebuggerPortFree() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (!(await portOpen(9222))) return
    await setTimeout(200)
  }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" })
    socket.once("connect", () => {
      socket.end()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

async function writeSparse(file, bytes, age) {
  await mkdir(dirname(file), { recursive: true })
  const handle = await open(file, "w")
  await handle.truncate(bytes)
  await handle.close()
  const when = new Date(Date.now() - age)
  await utimes(file, when, when)
}

async function directoryBytes(dir) {
  const files = []
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      files.push(path)
    }
  }
  await walk(dir)
  const sizes = await Promise.all(files.map(async (file) => (await stat(file).catch(() => undefined))?.size ?? 0))
  return sizes.reduce((sum, size) => sum + size, 0)
}

async function waitFor(read, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined) return value
    await setTimeout(200)
  }
}

async function readNamed(dir, name) {
  const paths = await namedFiles(dir, name)
  const texts = await Promise.all(paths.map((path) => readFile(path, "utf8")))
  return texts.join("\n")
}

async function namedFiles(dir, name) {
  const found = []
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (entry.name === name) found.push(path)
    }
  }
  await walk(dir)
  return found
}
