import { spawn, execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: { "old-app": { type: "string" }, "new-app": { type: "string" }, output: { type: "string" } },
})
if (process.platform !== "darwin" || !values["old-app"] || !values["new-app"] || !values.output)
  throw Error("Requires macOS, --old-app, --new-app and a new --output directory")
const root = resolve(values.output)
await mkdir(root)
const marker = `upgrade-${randomUUID()}`
const paths = Object.fromEntries(
  ["home", "app-data", "config", "data", "state", "cache", "workspace"].map((name) => [name, join(root, name)]),
)
await Promise.all(Object.values(paths).map((path) => mkdir(path)))
// Skip legacy migration only in this fresh sandbox; never import the real user profile.
await mkdir(join(paths["app-data"], "com.loginom.aiagent.dev"))
await writeFile(
  join(paths["app-data"], "com.loginom.aiagent.dev/loginom-ai-agent.settings"),
  JSON.stringify({ tauriMigrated: true }),
)
await mkdir(join(paths.config, "loginom-ai-agent-dev"))
await writeFile(
  join(paths.config, "loginom-ai-agent-dev/loginom-ai-agent.json"),
  JSON.stringify({
    provider: {
      test: {
        npm: "@ai-sdk/openai-compatible",
        name: "Offline persistence fixture",
        options: { baseURL: "http://127.0.0.1:1/v1", apiKey: "synthetic-unused" },
        models: { "test-model": { name: "Offline persistence fixture", limit: { context: 200000, output: 16000 } } },
      },
    },
  }),
)
const { chromium } = createRequire(
  join(resolve(values["new-app"]), "Contents/Resources/loginom/runtime/client/package.json"),
)("playwright-core")
const evidence = []
let sessionID
let messageID
let ciphertext
for (const [phase, source] of [
  ["before", values["old-app"]],
  ["after", values["new-app"]],
]) {
  const parent = join(root, phase)
  await mkdir(parent)
  const application = join(parent, "Loginom AI Agent Dev.app")
  execFileSync("/usr/bin/ditto", [resolve(source), application])
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", application])
  const plist = JSON.parse(
    execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", join(application, "Contents/Info.plist")], {
      encoding: "utf8",
    }),
  )
  const child = spawn(
    join(application, "Contents/MacOS", plist.CFBundleExecutable),
    ["--inspect-brk=127.0.0.1:0", "--remote-debugging-port=0"],
    {
      cwd: paths.workspace,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        // Security.framework needs the existing login Keychain. appData/XDG are isolated before main runs.
        HOME: homedir(),
        SHELL: "/usr/bin/false",
        LANG: "en_US.UTF-8",
        XDG_CONFIG_HOME: paths.config,
        XDG_DATA_HOME: paths.data,
        XDG_CACHE_HOME: paths.cache,
        XDG_STATE_HOME: paths.state,
      },
    },
  )
  let stderr = ""
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  child.stdout.resume()
  const exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })))
  let inspector
  let browser
  try {
    const nodeURL = await until(
      () => stderr.match(/Debugger listening on (ws:\/\/[^\s]+)/)?.[1],
      "INSPECTOR_NOT_AVAILABLE",
    )
    console.log(phase + ": inspector connected")
    inspector = await connectInspector(nodeURL)
    console.log(phase + ": runtime enable")
    await inspector.send("Runtime.enable")
    console.log(phase + ": debugger enable")
    await inspector.send("Debugger.enable")
    const paused = inspector.event("Debugger.paused")
    console.log(phase + ": run until initial pause")
    await inspector.send("Runtime.runIfWaitingForDebugger")
    // The first breakpoint occurs before packaged application code can open a profile.
    const frame = await paused
    console.log(phase + ": paused before app")
    const electron = 'process.getBuiltinModule("module").createRequire(process.execPath)("electron")'
    const prestart = await inspector.evaluate(
      `(() => { const { app } = ${electron}; if (app.isReady()) throw Error("ISOLATION_TOO_LATE"); app.setPath("appData", ${JSON.stringify(paths["app-data"])}); return { appData: app.getPath("appData"), ready: app.isReady() }; })()`,
      frame.callFrames[0].callFrameId,
    )
    if (prestart.appData !== paths["app-data"] || prestart.ready) throw Error("PRESTART_ISOLATION_FAILED")
    console.log(phase + ": isolated; resume")
    await inspector.send("Debugger.resume")
    const browserURL = await until(
      () => stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1],
      "BROWSER_DEBUGGER_NOT_AVAILABLE",
    )
    browser = await chromium.connectOverCDP(browserURL)
    const page = await until(() => browser.contexts()[0]?.pages()[0], "WINDOW_NOT_AVAILABLE")
    await page.waitForFunction(() => !!window.api, null, { timeout: 120000 })
    const isolation = await inspector.evaluate(
      `({ userData: ${electron}.app.getPath("userData"), appData: ${electron}.app.getPath("appData"), dbOverride: process.env.LOGINOM_AI_AGENT_DB ?? null, data: process.env.XDG_DATA_HOME, config: process.env.XDG_CONFIG_HOME, version: ${electron}.app.getVersion(), safeStorage: ${electron}.safeStorage.isEncryptionAvailable(), onboardingTest: process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING ?? null })`,
    )
    if (
      isolation.userData !== join(paths["app-data"], "com.loginom.aiagent.dev") ||
      isolation.data !== paths.data ||
      isolation.config !== paths.config ||
      isolation.dbOverride === ":memory:" ||
      isolation.onboardingTest !== null ||
      !isolation.safeStorage
    )
      throw Error("PROFILE_OR_STORAGE_NOT_ISOLATED")
    const server = await page.evaluate(() => window.api.awaitInitialization())
    const request = async (path, method = "GET", body) => {
      const response = await fetch(`${server.url}${path}?directory=${encodeURIComponent(paths.workspace)}`, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) throw Error(`PERSISTENCE_BACKEND_${response.status}`)
      return response.json()
    }
    if (phase === "before") {
      await page.evaluate(
        (value) => window.api.storeSet("loginom-ai-agent.settings", "upgradeAcceptance", value),
        marker,
      )
      const session = await request("/session", "POST", { title: marker })
      sessionID = session.id
      const message = await request(`/session/${sessionID}/message`, "POST", {
        noReply: true,
        model: { providerID: "test", modelID: "test-model" },
        parts: [{ type: "text", text: marker }],
      })
      messageID = message.info.id
      ciphertext = await inspector.evaluate(
        `${electron}.safeStorage.encryptString(${JSON.stringify(marker)}).toString("base64")`,
      )
      if (Buffer.from(ciphertext, "base64").includes(Buffer.from(marker))) throw Error("PLAINTEXT_SECRET_STORAGE")
      await writeFile(join(root, "synthetic-secret.encrypted"), Buffer.from(ciphertext, "base64"), { mode: 0o600 })
    } else {
      if ((await page.evaluate(() => window.api.storeGet("loginom-ai-agent.settings", "upgradeAcceptance"))) !== marker)
        throw Error("SETTINGS_NOT_PRESERVED")
      const session = await request(`/session/${sessionID}`)
      if (session.title !== marker) throw Error("SESSION_NOT_PRESERVED")
      const messages = await request(`/session/${sessionID}/message`)
      if (
        !messages.some(
          (message) =>
            message.info.id === messageID && message.parts.some((part) => part.type === "text" && part.text === marker),
        )
      )
        throw Error("HISTORY_NOT_PRESERVED")
      const saved = (await readFile(join(root, "synthetic-secret.encrypted"))).toString("base64")
      if (
        (await inspector.evaluate(
          `${electron}.safeStorage.decryptString(Buffer.from(${JSON.stringify(saved)}, "base64"))`,
        )) !== marker
      )
        throw Error("SECRET_NOT_PRESERVED")
    }
    evidence.push({
      phase,
      version: isolation.version,
      userData: isolation.userData,
      diskDatabase: true,
      safeStorageAvailable: true,
      sessionID,
      messageID,
    })
    await inspector.evaluate(`setImmediate(() => ${electron}.app.quit()); true`)
    inspector.close()
    await browser.close()
    browser = undefined
    const end = await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(Error("DESKTOP_EXIT_TIMEOUT")), 30000)),
    ])
    if (end.code !== 0 || end.signal) throw Error("DESKTOP_UNCLEAN_EXIT")
    const db = join(paths.data, "loginom-ai-agent-dev/loginom-ai-agent.db")
    if ((await stat(db)).size === 0) throw Error("DISK_DATABASE_MISSING")
    if (phase === "before")
      await writeFile(join(root, "before-summary.json"), JSON.stringify(evidence[0], null, 2) + "\n")
  } finally {
    inspector?.close()
    await browser?.close().catch(() => {})
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
      await Promise.race([exited, new Promise((done) => setTimeout(done, 5000))])
      if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, "SIGKILL")
    }
    await writeFile(join(root, `${phase}-private-stderr.log`), stderr, { mode: 0o600 })
  }
}
await writeFile(
  join(root, "summary.json"),
  JSON.stringify(
    {
      status: "PASS",
      os: execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim(),
      evidence,
      settingsPreserved: true,
      sessionAndUserMessagePreserved: true,
      safeStorageCiphertextPreserved: true,
      limitations: [
        "Synthetic no-reply history; no Loginom/model network activity",
        "safeStorage uses synthetic ciphertext retained by the harness, not a real Loginom credential migration",
        "Isolated appData set through pre-start inspector; production runtime unchanged",
        "Ad-hoc local macOS27 acceptance, not Gatekeeper or macOS14 acceptance",
      ],
    },
    null,
    2,
  ) + "\n",
)
console.log(`PASS Desktop upgrade persistence: ${root}/summary.json`)

async function until(read, error) {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const result = read()
    if (result) return result
    await new Promise((done) => setTimeout(done, 50))
  }
  throw Error(error)
}

async function connectInspector(url) {
  const socket = new WebSocket(url)
  await new Promise((done, fail) => {
    socket.addEventListener("open", done, { once: true })
    socket.addEventListener("error", fail, { once: true })
  })
  let id = 0
  const replies = new Map()
  const events = new Map()
  socket.addEventListener("message", (event) => {
    const value = JSON.parse(event.data)
    if (value.method === "Debugger.paused") console.log("Inspector paused event")
    if (value.id) {
      const pending = replies.get(value.id)
      replies.delete(value.id)
      if (value.error) pending?.reject(Error(value.error.message))
      else pending?.resolve(value.result)
    } else if (events.has(value.method)) {
      events.get(value.method)(value.params)
      events.delete(value.method)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("INSPECTOR_TIMEOUT_" + method)), 30000)
      timeout.unref()
      replies.set(++id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  return {
    send,
    event: (method) => new Promise((done) => events.set(method, done)),
    close: () => socket.close(),
    evaluate: async (expression, callFrameId) => {
      const result = await send(callFrameId ? "Debugger.evaluateOnCallFrame" : "Runtime.evaluate", {
        expression,
        returnByValue: true,
        ...(callFrameId ? { callFrameId } : {}),
      })
      if (result.exceptionDetails)
        throw Error(
          "INSPECTOR_EVALUATION_FAILED: " +
            (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text),
        )
      return result.result.value
    },
  }
}
