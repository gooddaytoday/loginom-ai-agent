import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"

const require = createRequire(new URL("../client/package.json", import.meta.url))

export function loginomAddress(value) {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error("LOGINOM_URL_INVALID")
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
    await field("edtPassword").locator("input").fill(candidate.password)
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

export async function loginBrowser({ browserPath, profile, candidate, headless = false }) {
  const { chromium } = require("playwright-core")
  await mkdir(profile, { recursive: true, mode: 0o700 })
  const context = await chromium
    .launchPersistentContext(profile, {
      executablePath: browserPath,
      headless,
      chromiumSandbox: true,
      viewport: headless ? { width: 1280, height: 800 } : null,
    })
    .catch(() => {
      throw Error("LOGINOM_BROWSER_START_FAILED")
    })
  try {
    return await loginPage(context.pages()[0] ?? (await context.newPage()), candidate)
  } catch (error) {
    if (["LOGINOM_ACCOUNT_MISMATCH", "LOGINOM_LOGIN_REJECTED"].includes(error?.message)) throw error
    throw Error("LOGINOM_LOGIN_UNAVAILABLE")
  } finally {
    await context.close()
  }
}

export async function checkConnection(options) {
  await checkKnowledge(options.endpoint, options.candidate.apiKey)
  return loginBrowser(options)
}
