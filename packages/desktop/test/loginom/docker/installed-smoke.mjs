import { execFile, spawn } from "node:child_process"
import { once } from "node:events"
import { openSync } from "node:fs"
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { promisify } from "node:util"

// Installed Linux smoke, run by run-matrix.ts on the bundled Node as UID 1200 without network, under Xvfb.
// PKG-02: every resource hash, `--verify-resources` exits 0, the bundled Chromium starts with its sandbox.
// PKG-01 (decision В-97 п. 10): in a clean profile the application window opens, with no wizard, and the window's own
// service (`service-desktop.json`, B4.9) answers. Electron runs with its sandbox; `--no-sandbox` anywhere is a failure.
const root = process.env.LOGINOM_AI_AGENT_INSTALL_ROOT

const slug = process.env.LOGINOM_AI_AGENT_TEST_SLUG

if (!root || !slug) throw Error("Set LOGINOM_AI_AGENT_INSTALL_ROOT and LOGINOM_AI_AGENT_TEST_SLUG")

if (process.getuid() === 0) throw Error("NONROOT_TEST_REQUIRED")

const executable = process.env.LOGINOM_AI_AGENT_EXECUTABLE ?? join(root, slug)

const appId =
  { "loginom-ai-agent": "com.loginom.aiagent", "loginom-ai-agent-beta": "com.loginom.aiagent.beta" }[slug] ??
  "com.loginom.aiagent.dev"

const resources = join(root, "resources/loginom")

const require = createRequire(join(resources, "runtime/client/package.json"))

const { chromium } = require("playwright-core")

const { verifyResources } = await import(join(resources, "runtime/src/resources.mjs"))

const command = promisify(execFile)

// What the renderer shows once the application has loaded: never the 0.4 wizard form.
const rendererState = `(() => {
  const root = document.querySelector("#root")
  if (!root || !root.childElementCount || document.readyState !== "complete") return undefined
  return {
    url: location.href.split("?")[0],
    title: document.title,
    wizard: !!document.querySelector('[data-component="settings-loginom"]'),
    text: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 120),
  }
})()`

const verified = await verifyResources(resources)

const verify = await exited(spawn(executable, ["--verify-resources"], { stdio: ["ignore", "ignore", "pipe"] }), 180_000)

if (verify.code !== 0) throw Error(`VERIFY_RESOURCES_FAILED: ${verify.code} ${verify.stderr.trim()}`)

const browser = await chromium.launch({ executablePath: verified.browserPath, headless: true, chromiumSandbox: true })

try {
  const page = await browser.newPage()
  await page.setContent("<title>Bundled Chromium</title><p>Offline runtime</p>")

  if ((await page.title()) !== "Bundled Chromium") throw Error("BROWSER_FAILED")
} finally {
  await browser.close()
}

// A clean profile: a new home and no test root, as for a user who has just installed the package.
const home = await mkdtemp(join(tmpdir(), "loginom-installed-"))

const debug = 29400

const started = Date.now()

const log = openSync(join(home, "app.log"), "w")

const app = spawn(executable, [`--remote-debugging-port=${debug}`], {
  env: { ...process.env, HOME: home },
  stdio: ["ignore", log, log],
})

try {
  const window = { ...(await until("APP_WINDOW_NOT_SHOWN", 120_000, appWindow)), ms: Date.now() - started }

  const service = await until("SERVICE_NOT_REGISTERED", 120_000, async () =>
    JSON.parse(await readFile(join(home, ".local/state", slug, "service-desktop.json"), "utf8")),
  )

  const auth = { authorization: "Basic " + Buffer.from("loginom-ai-agent:" + service.password).toString("base64") }

  const info = await until("SERVICE_NOT_ANSWERING", 60_000, async () => {
    const response = await fetch(new URL("/api/info", service.url), { headers: auth })

    return response.ok && response.json()
  })

  if (info.pid !== service.pid) throw Error("SERVICE_PID_MISMATCH")
  await until("WINDOW_NOT_CONNECTED", 120_000, async () => {
    const logs = join(home, ".config", appId, "logs")
    const runs = await readdir(logs)
    const text = await Promise.all(runs.map((run) => readFile(join(logs, run, "main.log"), "utf8").catch(() => "")))

    return text.join("").includes("v2 CLI background service ready")
  })
  const renderer = await until("RENDERER_NOT_LOADED", 60_000, () => evaluate(rendererState))

  if (renderer.wizard) throw Error("WIZARD_SHOWN")
  const electron = await descendants(app.pid)

  if (electron.some((entry) => entry.args.includes("--no-sandbox"))) throw Error("SANDBOX_DISABLED")
  const sandbox = await stat(join(root, "chrome-sandbox"))
  console.log(
    JSON.stringify({
      status: "PASS",
      uid: process.getuid(),
      node: process.version,
      os: (await readFile("/etc/os-release", "utf8")).match(/^PRETTY_NAME="?([^"\n]*)/m)?.[1],
      manifestHash: verified.manifestHash,
      verifyResources: { exitCode: verify.code, ms: verify.ms },
      browserSandbox: true,
      window,
      renderer,
      service: { pid: service.pid, port: new URL(service.url).port, version: info.version },
      electronSandbox: {
        chromeSandbox: `${(sandbox.mode & 0o7777).toString(8)} uid ${sandbox.uid}`,
        processes: electron.length,
        noSandbox: 0,
      },
    }),
  )
} finally {
  await evaluate("setTimeout(() => window.close(), 50), true").catch(() => undefined)
  await exited(app, 100_000).catch(() => app.kill("SIGKILL"))
  await rm(home, { recursive: true, force: true })
}

// A viewable top-level X window of the application, larger than Chromium's 10×10 helper windows: its WM_CLASS is the
// app ID.
async function appWindow() {
  const tree = (await command("xwininfo", ["-root", "-tree"])).stdout

  const windows = [...tree.matchAll(/^\s+(0x[0-9a-f]+) "([^"]*)": \("[^"]*" "([^"]*)"\)\s+(\d+)x(\d+)/gm)].flatMap(
    (match) =>
      match[3] === appId && +match[4] > 100 && +match[5] > 100
        ? [{ id: match[1], title: match[2], wmClass: match[3], width: +match[4], height: +match[5] }]
        : [],
  )

  for (const item of windows)
    if ((await command("xwininfo", ["-id", item.id])).stdout.includes("Map State: IsViewable")) return item
}

async function evaluate(expression) {
  const targets = await (
    await fetch(`http://127.0.0.1:${debug}/json/list`, { signal: AbortSignal.timeout(2000) })
  ).json()

  const target = targets.find((item) => item.type === "page" && !item.url.startsWith("devtools://"))

  if (!target) return undefined
  const socket = new WebSocket(target.webSocketDebuggerUrl)

  try {
    await once(socket, "open")
    socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }))
    const [message] = await Promise.race([once(socket, "message"), sleep(5000, [undefined], { ref: false })])

    return message && JSON.parse(message.data).result?.result?.value
  } finally {
    socket.close()
  }
}

// The main process and every descendant, from /proc: the slim images have no procps.
async function descendants(pid) {
  const table = (
    await Promise.all(
      (await readdir("/proc"))
        .filter((name) => /^\d+$/.test(name))
        .map(async (name) => {
          const status = await readFile(`/proc/${name}/stat`, "utf8").catch(() => "")
          const args = await readFile(`/proc/${name}/cmdline`, "utf8").catch(() => "")

          if (!status) return []

          return [{ pid: +name, parent: +status.slice(status.lastIndexOf(")") + 2).split(" ")[1], args }]
        }),
    )
  ).flat()

  const owned = new Set([pid])

  for (let changed = true; changed; ) {
    changed = false

    for (const entry of table)
      if (owned.has(entry.parent) && !owned.has(entry.pid)) {
        owned.add(entry.pid)
        changed = true
      }
  }

  return table.filter((entry) => owned.has(entry.pid))
}

async function until(code, timeout, probe) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined)

    if (value) return value
    await sleep(250)
  }

  throw Error(code)
}

async function exited(child, timeout) {
  const started = Date.now()
  const chunks = []
  child.stderr?.on("data", (chunk) => chunks.push(chunk))

  const [code] = await Promise.race([
    child.exitCode === null ? once(child, "exit") : [child.exitCode],
    sleep(timeout, undefined, { ref: false }).then(() => {
      throw Error("EXIT_TIMEOUT")
    }),
  ])

  return { code, ms: Date.now() - started, stderr: Buffer.concat(chunks).toString() }
}
