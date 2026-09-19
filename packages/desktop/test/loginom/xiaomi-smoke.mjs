import { createRequire } from "node:module"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert/strict"
const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const directory = resolve(import.meta.dirname, "../..")
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
const authPath = process.env.LOGINOM_AI_AGENT_TEST_PROVIDER
if (!configPath || !authPath) throw Error("Explicit private Dock config and provider file are required")
const config = JSON.parse(await readFile(configPath, "utf8"))
const auth = JSON.parse(await readFile(authPath, "utf8"))
const provider = "xiaomi-token-plan-sgp"
const model = "mimo-v2.5"
if (auth.baseURL !== "https://token-plan-sgp.xiaomimimo.com/v1" || !auth.apiKey)
  throw Error("XIAOMI_TOKEN_PLAN_CONFIG_REQUIRED")
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const profile = await mkdtemp(join(tmpdir(), "loginom-macos-model-"))
const workspace = join(profile, "workspace")
await mkdir(workspace)
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
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  await form.locator('input[type="password"]').first().fill(config.api_key)
  await form.locator('input[type="url"]').fill(config.loginom_url)
  await form.locator('input[autocomplete="username"]').fill(config.workflow_profile.loginom_user)
  await form.locator('button[type="submit"]').click()
  await form.waitFor({ state: "hidden", timeout: 120000 })
  const server = await page.evaluate(() => window.api.awaitInitialization())
  const call = async (path, body, method = "POST") => {
    const response = await fetch(`${server.url}${path}?directory=${encodeURIComponent(workspace)}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    })
    assert.ok(response.ok, `backend ${path} returned ${response.status}`)
    return response.json()
  }
  await call(`/auth/${provider}`, { type: "api", key: auth.apiKey }, "PUT")
  const session = await call("/session", {
    title: "Schema acceptance",
    permission: [{ permission: "*", pattern: "*", action: "ask" }],
  })
  // All tools remain advertised, but executing any tool requires approval which this test never grants.
  const answer = await call(`/session/${session.id}/message`, {
    model: { providerID: provider, modelID: model },
    parts: [
      { type: "text", text: "Reply with exactly OK. Do not call any tools, inspect anything, or perform any actions." },
    ],
  })
  assert.ok(!answer.info?.error, `model error: ${answer.info?.error?.name ?? "unknown"}`)
  assert.ok(!answer.parts.some((part) => part.type === "tool"), "unexpected tool request")
  assert.equal(
    answer.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim(),
    "OK",
  )
  const status = await page.evaluate(() => window.api.loginom.status())
  assert.ok(status)
  assert.ok(!JSON.stringify(answer).includes(auth.apiKey), "provider secret in response")
  console.log(
    JSON.stringify({
      status: "PASS",
      version: await application.evaluate(({ app }) => app.getVersion()),
      provider,
      model,
      reply: "OK",
      toolCalls: 0,
      isolatedProfile: true,
      credentialsRefreshed: false,
    }),
  )
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
