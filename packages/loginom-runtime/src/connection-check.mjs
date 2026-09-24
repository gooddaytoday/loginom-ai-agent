import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { browserDownloadScript } from "../client/lib/browser-downloads.mjs"

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
  await page.goto(loginomAddress(candidate.url), { waitUntil: "domcontentloaded", timeout: 60_000 })
  const field = (name) => page.locator(`[data-tid="LoginForm;Login;${name}"]`)
  const avatar = page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]')
  await avatar.or(field("edtUsername")).first().waitFor({ state: "visible", timeout: 60_000 })
  if (!(await avatar.isVisible())) {
    await field("edtUsername").locator("input").fill(candidate.username)
    const password = field("edtPassword").locator("input")
    // Passwordless accounts may make an already empty field readonly after username lookup.
    if (candidate.password !== "" || (await password.inputValue()) !== "") await password.fill(candidate.password)
    await field("btnLogin").click()
    await avatar.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
      throw Error("LOGINOM_LOGIN_REJECTED")
    })
  }
  const identity = await page.evaluate(
    () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName ?? null,
  )
  if (identity !== candidate.username) throw Error("LOGINOM_ACCOUNT_MISMATCH")
  return { authenticated: true }
}

export async function checkKnowledge(endpoint, apiKey) {
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js")
  const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js")
  const client = new Client({ name: "loginom-ai-agent-connection-check", version: "0.1.0" })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error" },
      }),
      { timeout: 30_000 },
    )
    // Initialize/authentication is sufficient; no user file requests are made here.
  } catch (error) {
    throw Error(
      [401, 403].includes(error?.code ?? error?.status)
        ? "LOGINOM_KNOWLEDGE_AUTH_FAILED"
        : "LOGINOM_KNOWLEDGE_UNAVAILABLE",
    )
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function loginBrowser({ browserPath, profile, candidate, headless = false, keepOpen = false }) {
  const { chromium } = require("playwright-core")
  await mkdir(profile, { recursive: true, mode: 0o700 })
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
        ...browserLoggingArguments(profile),
        ...(!headless
          ? [
              "--start-maximized",
              ...(process.platform === "linux" &&
              process.env.WAYLAND_DISPLAY &&
              (process.env.XDG_SESSION_TYPE === "wayland" || !process.env.DISPLAY)
                ? ["--ozone-platform=wayland"]
                : []),
            ]
          : []),
      ],
      viewport: headless ? { width: 1280, height: 800 } : null,
    })
    .catch(() => {
      throw Error("LOGINOM_BROWSER_START_FAILED")
    })
  try {
    // This authenticated page predates MCP; its capability choice must already
    // match the executor's download/byte-verification path on the first load.
    await context.addInitScript({ content: browserDownloadScript(candidate.url) })
    const result = await loginPage(context.pages()[0] ?? (await context.newPage()), candidate)
    if (!keepOpen) {
      await context.close()
      return result
    }
    // MCP receives this same live context through its public contextGetter API.
    return { ...result, context }
  } catch (error) {
    await context.close().catch(() => undefined)
    if (["LOGINOM_ACCOUNT_MISMATCH", "LOGINOM_LOGIN_REJECTED"].includes(error?.message)) throw error
    throw Error("LOGINOM_LOGIN_UNAVAILABLE")
  }
}

export async function checkConnection(options) {
  await checkKnowledge(options.endpoint, options.candidate.apiKey)
  return loginBrowser(options)
}
