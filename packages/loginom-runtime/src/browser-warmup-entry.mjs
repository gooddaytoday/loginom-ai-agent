// Installer-only worker. No connection, account, model or Loginom URL is admitted.
import { createRequire } from "node:module"
import { appendFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { createHook } from "node:async_hooks"
import { browserEnvironment, browserLoggingArguments } from "./connection-check.mjs"
import { browserLaunch } from "../client/lib/browser-launch.mjs"
import { startupDiagnostic } from "../client/lib/catalog.mjs"

if (!process.send) throw Error("LOGINOM_PRIVATE_IPC_REQUIRED")
const require = createRequire(new URL("../client/package.json", import.meta.url))
const state = {
  initialized: false,
  closing: false,
  exiting: false,
  work: undefined,
  close: undefined,
  root: undefined,
  context: undefined,
}
const timers = new Map()
createHook({
  init(id, type, _trigger, resource) {
    if (type !== "Timeout") return
    if (state.exiting) resource.unref()
    else timers.set(id, resource)
  },
  destroy(id) {
    timers.delete(id)
  },
}).enable()
const phase = (event) =>
  appendFile(
    join(state.root, "browser-warmup-phases.jsonl"),
    JSON.stringify({
      at: new Date().toISOString(),
      pid: process.pid,
      ...event,
    }) + "\n",
    { mode: 0o600 },
  ).catch(() => undefined)
const reason = (error, fallback) => {
  const value = startupDiagnostic(error)
  if (!value.code)
    value.code =
      /\b(?:EACCES|ENOENT|ENOEXEC|EPERM)\b/.exec(value.message)?.[0] ??
      (value.name === "TimeoutError" || /Timeout \d+ms exceeded/.test(value.message) ? "ETIMEDOUT" : fallback)
  return value
}
const reply = (message, disconnect = false) => {
  if (!process.connected) return
  process.send(message, () => {
    if (disconnect) {
      state.exiting = true
      for (const timer of timers.values()) timer.unref()
      process.channel?.unref()
      if (process.connected) process.disconnect()
    }
  })
}
function close() {
  state.closing = true
  return (state.close ??= (async () => {
    await state.work?.catch(() => undefined)
    if (state.context) await state.context.close()
    state.context = undefined
  })())
}
async function dispatch(message) {
  if (!message || typeof message.id !== "string") return
  try {
    if (message.method === "close") {
      await close()
      reply({ id: message.id, result: { closed: true } }, true)
      return
    }
    if (state.closing) throw Error("LOGINOM_HOST_CLOSED")
    if (message.method === "start") {
      const input = message.input
      if (
        state.initialized ||
        input?.protocol !== 1 ||
        input.headless !== true ||
        !isAbsolute(input.root) ||
        !isAbsolute(input.resources)
      )
        throw Error("LOGINOM_HANDSHAKE_INVALID")
      state.initialized = true
      state.root = input.root
      reply({ id: message.id, result: { protocol: 1, ready: true, pid: process.pid } })
      return
    }
    if (
      message.method !== "warm" ||
      !state.initialized ||
      state.work ||
      !isAbsolute(message.input?.browserPath) ||
      !isAbsolute(message.input?.profile)
    )
      throw Error("LOGINOM_HANDSHAKE_INVALID")
    const { browserPath, profile } = message.input
    state.work = (async () => {
      const dependencies = performance.now()
      await phase({ phase: "browser.dependencies", status: "starting" })
      let chromium
      try {
        chromium = require("playwright-core").chromium
        await phase({
          phase: "browser.dependencies",
          status: "ready",
          duration_ms: Math.round(performance.now() - dependencies),
        })
      } catch (error) {
        await phase({
          phase: "browser.dependencies",
          status: "failed",
          reason: reason(error, "LOGINOM_BROWSER_DEPENDENCIES_FAILED"),
        })
        throw error
      }
      const started = performance.now(),
        launch = browserLaunch(true)
      await phase({ phase: "browser.launch", status: "starting" })
      try {
        state.context = await chromium.launchPersistentContext(profile, {
          ...launch,
          executablePath: browserPath,
          headless: true,
          chromiumSandbox: true,
          timeout: Math.max(1, Math.min(30_000, Number(message.input.timeout_ms) || 30_000)),
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
          env: browserEnvironment(profile),
          args: ["--no-proxy-server", ...browserLoggingArguments(profile), ...launch.args],
        })
        await phase({ phase: "browser.launch", status: "ready", duration_ms: Math.round(performance.now() - started) })
        const page = state.context.pages()[0] ?? (await state.context.newPage())
        if (page.url() !== "about:blank" || (await page.evaluate(() => document.readyState)) !== "complete")
          throw Error("LOGINOM_BROWSER_WARMUP_FAILED")
      } catch (error) {
        await phase({
          phase: "browser.launch",
          status: "failed",
          duration_ms: Math.round(performance.now() - started),
          reason: reason(error, "LOGINOM_BROWSER_START_FAILED"),
        })
        throw error
      } finally {
        if (state.context) {
          await state.context.close()
          state.context = undefined
        }
        await phase({ phase: "browser.close", status: "ready" })
      }
      return { warmed: true }
    })()
    const result = await state.work.catch((error) => ({
      warmed: false,
      reason: reason(error, "LOGINOM_BROWSER_WARMUP_FAILED"),
    }))
    reply({ id: message.id, result })
  } catch {
    reply({ id: message.id, error: "LOGINOM_BROWSER_WARMUP_FAILED" }, message.method === "close")
    if (message.method === "close") process.exitCode = 1
  }
}
process.on("message", (message) => {
  void dispatch(message)
})
process.on("disconnect", () => {
  void close().catch(() => {
    process.exitCode = 1
  })
})
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
  process.on(signal, () => {
    void close()
      .catch(() => {
        process.exitCode = 1
      })
      .finally(() => {
        if (process.connected) process.disconnect()
      })
  })
