import { createRequire } from "node:module"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { setTimeout } from "node:timers/promises"
import assert from "node:assert/strict"
const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const directory = resolve(import.meta.dirname, "../..")
const profile = await mkdtemp(join(tmpdir(), "loginom-chatgpt-proxy-"))
// Uses a private empty profile and never authorizes an account or stores OAuth credentials.
const application = await _electron.launch({
  executablePath:
    process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ?? resolve(directory, "node_modules/electron/dist/electron"),
  args: process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory],
  cwd: directory,
  env: { ...process.env, LOGINOM_AI_AGENT_TEST_ONBOARDING: "1", LOGINOM_AI_AGENT_TEST_ROOT: profile },
  timeout: 120000,
})
try {
  const page = await application.firstWindow()
  const server = await page.evaluate(() => window.api.awaitInitialization())
  const call = (action, method) =>
    fetch(`${server.url}/provider/openai/oauth/${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`,
      },
      body: JSON.stringify({ method }),
      signal: AbortSignal.timeout(30000),
    })
  const device = await call("authorize", 1)
  assert.equal(device.status, 200, "device authorization initialization failed")
  const instructions = await device.json()
  assert.equal(instructions.url, "https://auth.openai.com/codex/device")
  assert.ok(instructions.instructions.length > 0)
  // Check the browser callback's actual token-exchange network path with an intentionally invalid code.
  const browser = await call("authorize", 0)
  assert.equal(browser.status, 200)
  const authorization = new URL((await browser.json()).url)
  const callback = call("callback", 0)
  const redirect = new URL(authorization.searchParams.get("redirect_uri"))
  redirect.searchParams.set("state", authorization.searchParams.get("state"))
  redirect.searchParams.set("code", "loginom-diagnostic-invalid-code")
  const result = await fetch(redirect, { signal: AbortSignal.timeout(30000) })
  await result.text()
  const exchange = await callback
  await exchange.text()
  assert.equal(exchange.status, 500)
  const log = await (async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const text = await readServerLog(profile)
      if (text.includes("Token exchange failed:")) return text
      await setTimeout(50)
    }
    return await readServerLog(profile)
  })()
  const legacy = await namedFiles(join(profile, "data"), "loginom-ai-agent.log")
  assert.equal(legacy.length, 0, "backend log file was created outside the desktop log directory")
  const diagnostic = log.match(/Token exchange failed: HTTP [0-9]+(?: \([a-z_]+\))?/)?.[0]
  assert.ok(
    diagnostic === "Token exchange failed: HTTP 401 (token_expired)",
    `browser exchange: ${diagnostic ?? "no diagnostic"}`,
  )
  assert.ok(!log.includes("Token exchange failed: HTTP 403"), "browser exchange bypassed the system proxy")
  const proxy = await application.evaluate(() => ({
    http: Boolean(process.env.HTTP_PROXY),
    https: Boolean(process.env.HTTPS_PROXY),
  }))
  assert.ok(proxy.http && proxy.https)
  console.log(
    JSON.stringify({
      status: "PASS",
      systemProxy: proxy,
      deviceAuthorization: 200,
      browserTokenExchange: 401,
      browserTokenError: "token_expired",
      invalidCodeOnly: true,
      accountLoginPerformed: false,
    }),
  )
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}

async function readServerLog(profile) {
  const paths = await namedFiles(join(profile, "desktop", "logs"), "server.log")
  const texts = await Promise.all(paths.map((path) => readFile(path, "utf8").catch(() => "")))
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
