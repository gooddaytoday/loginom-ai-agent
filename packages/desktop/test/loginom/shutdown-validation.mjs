import { createRequire } from "node:module"
import { createServer } from "node:http"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { once } from "node:events"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { knowledgeServer } from "../../../loginom-runtime/client/test/support/knowledge-server.mjs"

// Opt-in native acceptance. Uses only private profiles and local HTTP fixtures.
const executable = process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE
const report = process.env.LOGINOM_AI_AGENT_TEST_REPORT
const source = process.env.LOGINOM_AI_AGENT_TEST_SOURCE_SHA
if (!executable || !report || !source) throw Error("Set TEST_EXECUTABLE, TEST_REPORT and TEST_SOURCE_SHA")
const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const command = promisify(execFile)
const observations = []

async function processes() {
  return (await command("ps", ["-eo", "pid=,ppid=,args="])).stdout
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
      return { pid: Number(match[1]), parent: Number(match[2]), args: match[3] }
    })
}

for (const phase of ["navigation", "login-form"]) {
  const profile = await mkdtemp(join(tmpdir(), "desktop-validation-shutdown-"))
  const cleanup = []
  const help = await knowledgeServer({ after: (callback) => cleanup.push(callback) })
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  const http = createServer(async (request, response) => {
    if (request.url.startsWith("/app/")) {
      if (phase === "navigation") {
        entered.resolve()
        await release.promise
      }
      response.setHeader("Content-Type", "text/html")
      response.end(
        phase === "login-form"
          ? `<script>fetch('/release').then(()=>{
        document.body.innerHTML='<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</div>';
        window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'user'}}}}}}};
      });</script>`
          : '<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</div><script>window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:"user"}}}}}}};</script>',
      )
      return
    }
    if (request.url === "/release") {
      entered.resolve()
      await release.promise
    }
    response.end("released")
  })
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve))
  let application
  const owned = new Set()
  const ports = new Set()
  const deadlines = []
  const bounded = (promise, timeout, code) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        deadlines.push(setTimeout(() => reject(Error(code)), timeout))
      }),
    ])
  try {
    application = await _electron.launch({
      executablePath: executable,
      args: [],
      timeout: 90000,
      env: {
        ...process.env,
        LOGINOM_AI_AGENT_TEST_ROOT: profile,
        LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
        LOGINOM_AI_AGENT_TEST_HEADLESS: "1",
        LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT: help.endpoint,
        LOGINOM_AI_AGENT_SYSTEM_PROXY: "off",
      },
    })
    owned.add(application.process().pid)
    const inspector = await application.evaluate(() => process.debugPort)
    ports.add(inspector)
    application.process().stderr.on("data", (chunk) => {
      for (const match of chunk.toString().matchAll(/(?:Debugger|DevTools) listening on ws:\/\/[^:/]+:(\d+)/g))
        ports.add(Number(match[1]))
    })
    const page = await application.firstWindow()
    await page.waitForFunction(() => window.api?.loginom, undefined, { timeout: 90000 })
    const data = await application.evaluate(({ app }) => app.getPath("sessionData"))
    const electronCdpPort = Number((await readFile(join(data, "DevToolsActivePort"), "utf8")).split("\n")[0])
    if (!Number.isInteger(electronCdpPort) || electronCdpPort < 1) throw Error("ELECTRON_CDP_PORT_UNKNOWN")
    ports.add(electronCdpPort)
    const checking = page.evaluate(async (url) => {
      const current = await window.api.loginom.read()
      try {
        return await window.api.loginom.check({
          revision: current.revision,
          url,
          username: "user",
          apiKey: { operation: "replace", value: "UNIT-NONSECRET" },
          password: { operation: "empty" },
        })
      } catch {
        return "cancelled"
      }
    }, `http://127.0.0.1:${http.address().port}/app/`)
    void checking.catch(() => {})
    await bounded(
      Promise.race([
        entered.promise,
        checking.then((result) => {
          throw Error("VALIDATION_FINISHED_BEFORE_BROWSER_BARRIER: " + JSON.stringify(result))
        }),
      ]),
      30000,
      "BROWSER_NOT_STARTED",
    )
    const before = await processes()
    for (let changed = true; changed; ) {
      changed = false
      for (const entry of before)
        if (owned.has(entry.parent) && !owned.has(entry.pid)) {
          owned.add(entry.pid)
          changed = true
        }
    }
    if (
      before
        .filter((entry) => owned.has(entry.pid))
        .every(
          (entry) => !entry.args.includes("/resources/loginom/browsers/") || !entry.args.includes("--user-data-dir="),
        )
    )
      throw Error("REAL_CHROMIUM_NOT_OBSERVED")
    // DevToolsActivePort belongs to this isolated Electron sessionData directory.
    const cdp = await application.evaluate(() =>
      process.argv.find((value) => value.startsWith("--remote-debugging-port=")),
    )
    const started = Date.now()
    const exit = once(application.process(), "exit")
    await application
      .evaluate(({ app }) => {
        app.quit()
      })
      .catch(() => {})
    const outcome = await bounded(exit, 12000, "DESKTOP_SHUTDOWN_DID_NOT_CANCEL_VALIDATION")
    if (outcome[0] !== 0 || outcome[1]) throw Error("DESKTOP_EXIT_UNCONFIRMED")
    await checking.catch(() => {})
    const after = await processes()
    const remaining = after.filter((entry) => owned.has(entry.pid))
    if (remaining.length) throw Error("OWN_PROCESSES_REMAIN: " + remaining.map((entry) => entry.pid))
    const listening = (await command("ss", ["-ltnp"])).stdout
    if ([...ports].some((port) => new RegExp(":" + port + "\\s").test(listening)))
      throw Error("OWN_DEBUGGER_STILL_LISTENING")
    observations.push({
      phase,
      status: "PASS",
      exit: outcome,
      elapsedMs: Date.now() - started,
      ownedPids: [...owned],
      nodeInspectorPort: inspector,
      electronCdpPort,
      debuggerPorts: [...ports],
      electronCdpArgument: cdp,
      remaining: 0,
    })
  } catch (error) {
    observations.push({ phase, status: "FAIL", failure: error.message, ownedPids: [...owned] })
    await writeFile(report, JSON.stringify({ status: "FAIL", source, executable, observations }, null, 2) + "\n")
    throw error
  } finally {
    deadlines.forEach(clearTimeout)
    release.resolve()
    await application?.close().catch(() => {})
    http.closeAllConnections()
    await new Promise((resolve) => http.close(resolve))
    for (const callback of cleanup) await callback()
    await rm(profile, { recursive: true, force: true })
  }
}
await writeFile(
  report,
  JSON.stringify({ status: "PASS", source, executable, node: process.version, observations }, null, 2) + "\n",
)
console.log(JSON.stringify({ status: "PASS", source, observations }))
