import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { browserDownloadScript } from "../client/lib/browser-downloads.mjs"
import { browserLaunch } from "../client/lib/browser-launch.mjs"
import { createRedactor } from "../client/lib/redact.mjs"

const require = createRequire(new URL("../client/package.json", import.meta.url))

export function browserEnvironment(profile, environment = process.env) {
  return { ...environment, CHROME_LOG_FILE: join(profile, "chrome-debug.log") }
}

export function browserLoggingArguments(profile) {
  return ["--disable-logging", `--log-file=${join(profile, "chrome-debug.log")}`]
}

export function loginomAddress(value) {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error("LOGINOM_URL_INVALID")
  // The public root redirects to /app/ without preserving the testable query.
  if (url.origin === "https://app.loginom.ai" && url.pathname === "/") url.pathname = "/app/"
  url.searchParams.set("testable", "true")
  return url.href
}

// This function is reachable only from the private host channel, never from model tools.
// It performs login and identity read-back only; no file panel or folder permission probe.
export async function loginPage(page, candidate) {
  const started = performance.now()
  let phase = "goto", phaseStarted = started, original
  try {
    await page.goto(loginomAddress(candidate.url), { waitUntil: "domcontentloaded", timeout: 60_000 })
    phase = "form"; phaseStarted = performance.now()
    const field = (name) => page.locator(`[data-tid="LoginForm;Login;${name}"]`)
    const avatar = page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]')
    await avatar.or(field("edtUsername")).first().waitFor({ state: "visible", timeout: 60_000 })
    if (!(await avatar.isVisible())) {
      phase = "submit"; phaseStarted = performance.now()
      await field("edtUsername").locator("input").fill(candidate.username)
      await field("edtUsername").locator("input").press("Tab")
      const password = field("edtPassword").locator("input")
      // Passwordless accounts may make an already empty field readonly after username lookup.
      if (candidate.password !== "" || (await password.inputValue()) !== "") await password.fill(candidate.password)
      await field("btnLogin").click()
      await avatar.waitFor({ state: "visible", timeout: 30_000 }).catch((error) => {
        original = error
        throw Error("LOGINOM_LOGIN_REJECTED")
      })
    }
    phase = "identity"; phaseStarted = performance.now()
    const identity = await page.evaluate(
      () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName ?? null,
    )
    if (identity !== candidate.username) throw Error("LOGINOM_ACCOUNT_MISMATCH")
    return { authenticated: true }
  } catch (error) {
    const ended = performance.now()
    // Only the sanitized diagnostic crosses the browser/host boundary. Never
    // retain the original Error/stack: Playwright call logs can echo inputs.
    const code = ["LOGINOM_LOGIN_REJECTED", "LOGINOM_ACCOUNT_MISMATCH"].includes(error?.message) ? error.message : "LOGINOM_LOGIN_UNAVAILABLE"
    throw Error(code, { cause: { login: loginFailure(original ?? error, candidate,
      phase, ended - phaseStarted, ended - started) } })
  }
}

function loginFailure(error, candidate, phase, duration, elapsed) {
  try {
    const url = new URL(candidate.url)
    const known = [candidate.username, candidate.password, candidate.apiKey, url.username, url.password, ...url.searchParams.values()]
      .filter(value => typeof value === "string" && value.length)
    const redactor = createRedactor(known)
    const clean = value => {
      let text = String(value).replace(/\b(?:https?|wss?)(?::\/\/|%3a%2f%2f)[^\s<>"'`]+/gi, raw => {
        try { const parsed = new URL(raw.includes("://") ? raw : decodeURIComponent(raw)); parsed.username = ""; parsed.password = ""; parsed.search = ""; parsed.hash = ""; return parsed.href }
        catch { return "[URL omitted]" }
      }).replace(/\/[^\s<>"'`?#]*[?#][^\s<>"'`]+/g, raw => raw.split(/[?#]/)[0])
      // The shared redactor intentionally ignores very short known values;
      // login credentials must be removed even when shorter than four chars.
      for (const secret of known.sort((a,b) => b.length - a.length))
        for (const variant of new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1,-1)]))
          text = text.replaceAll(variant, "[redacted]")
      const redacted = redactor.redact(text)
      return typeof redacted === "string" ? redacted.slice(0, 1024) : "[login diagnostic unavailable]"
    }
    return { phase, duration_ms: Math.max(0, Math.round(duration)), elapsed_ms: Math.max(0, Math.round(elapsed)),
      url: clean(candidate.url), original_name: clean(error?.name ?? "Error"),
      original_code: clean(error?.code ?? /net::ERR_[A-Z0-9_]+/.exec(error?.message ?? "")?.[0] ?? "") || null,
      original_message: clean(error?.message ?? error) }
  } catch {
    return { phase, duration_ms: Math.max(0, Math.round(duration)), elapsed_ms: Math.max(0, Math.round(elapsed)),
      original_code: null, original_message: "[login diagnostic unavailable]" }
  }
}

export async function loginBrowser({ browserPath, profile, candidate, headless = false, keepOpen = false, signal, onContextCreated }) {
  signal?.throwIfAborted()
  const { chromium } = require("playwright-core")
  const launch = browserLaunch(headless)
  await mkdir(profile, { recursive: true, mode: 0o700 })
  signal?.throwIfAborted()
  const context = await chromium
    .launchPersistentContext(profile, {
      executablePath: browserPath,
      headless,
      chromiumSandbox: true,
      // Chrome for Testing otherwise writes debug.log beside chrome.exe on
      // Windows, mutating the signed/manifested application payload. Keep all
      // browser state and diagnostics inside the disposable session profile.
      env: browserEnvironment(profile),
      args: [
        // Browser traffic is always direct; backend proxy policy is independent.
        "--no-proxy-server",
        ...browserLoggingArguments(profile),
        ...launch.args,
        ...(!headless
          ? [
              ...(process.platform === "linux" &&
              process.env.WAYLAND_DISPLAY &&
              (process.env.XDG_SESSION_TYPE === "wayland" || !process.env.DISPLAY)
                ? ["--ozone-platform=wayland"]
                : []),
            ]
          : []),
      ],
      viewport: launch.viewport,
    })
    .catch(() => {
      throw Error("LOGINOM_BROWSER_START_FAILED")
    })
  const closing = { promise: undefined }
  const close = () => closing.promise ??= context.close()
  const cancel = () => { void close().catch(() => undefined) }
  signal?.addEventListener("abort", cancel, { once: true })
  try {
    signal?.throwIfAborted()
    // This authenticated page predates MCP; its capability choice must already
    // match the executor's download/byte-verification path on the first load.
    await context.addInitScript({ content: browserDownloadScript(candidate.url) })
    if (onContextCreated) await onContextCreated(context)
    const result = await loginPage(context.pages()[0] ?? (await context.newPage()), candidate)
    signal?.throwIfAborted()
    if (!keepOpen) {
      await close()
      return result
    }
    // MCP receives this same live context through its public contextGetter API.
    return { ...result, context }
  } catch (error) {
    await close().catch(() => { throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED", error?.cause?.login ? { cause: error.cause } : undefined) })
    signal?.throwIfAborted()
    if (["LOGINOM_ACCOUNT_MISMATCH", "LOGINOM_LOGIN_REJECTED", "LOGINOM_FOCUS_SETUP_FAILED"].includes(error?.message)) throw error
    throw Error("LOGINOM_LOGIN_UNAVAILABLE", error?.cause?.login ? { cause: error.cause } : undefined)
  } finally {
    signal?.removeEventListener("abort", cancel)
  }
}
