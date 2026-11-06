import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, writeFile, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const { expect } = require("playwright/test")
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
assert.equal(new URL(input.cloud.control).hostname, "127.0.0.1")
assert.equal(new URL(input.cloud.proxy).hostname, "127.0.0.1")
const evidence = await mkdtemp(join(tmpdir(), "loginom-settings-live-"))
const shell = join(evidence, "login-shell")
await writeFile(shell, `#!/bin/sh\nexport HTTPS_PROXY='${input.cloud.proxy}'\nexport HTTP_PROXY='${input.cloud.proxy}'\nexport NO_PROXY=''\n/usr/bin/env -0\n`)
await chmod(shell, 0o700)
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(https?|all|no)_proxy$/i.test(key)))
const beforeNetwork = await (await fetch(input.cloud.control)).json()
const application = await _electron.launch({
  executablePath: input.executable,
  args: [],
  cwd: resolve(import.meta.dirname, "../.."),
  env: {
    ...environment,
    SHELL: shell,
    NODE_EXTRA_CA_CERTS: input.cloud.cert,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_HEADLESS: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: join(evidence, "profile"),
    LOGINOM_AI_AGENT_PURE: "1",
  },
  timeout: 120000,
})
try {
  // The OS browser opener is the only substituted boundary; Host/IPC/preload stay real.
  await application.evaluate(({ shell }) => {
    globalThis.openedFixtureLinks = []
    shell.openExternal = async (url) => { globalThis.openedFixtureLinks.push(url) }
  })
  const page = await application.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  const save = form.getByRole("button", { name: /^(Save and close|Сохранить и закрыть)$/ })
  await form.locator('input[type="url"]').fill(input.connection.url)
  await form.locator('input[autocomplete="username"]').fill(input.connection.username)
  const before = await page.evaluate(() => window.api.loginom.read())
  await save.click()
  await expect(form).toHaveCount(0, { timeout: 120000 })
  const saved = await page.evaluate(() => window.api.loginom.read())
  assert.equal(saved.state, "connection-required")
  assert.equal(saved.help.state, "connection-required")
  assert.equal(saved.browser.state, "unknown")
  assert.equal(saved.cloud.connected, false)
  assert.ok(saved.generation > before.generation)
  assert.equal((await (await fetch(input.cloud.control)).json()).starts, beforeNetwork.starts)
  await page.getByRole("button", { name: "Loginom", exact: true }).click()
  const connect = form.getByRole("button", { name: /^(Connect|Подключиться)$/ })
  await connect.click()
  await expect(form.getByText(/TASK13-CODE/)).toBeVisible({ timeout: 30000 })
  const verificationUrl = (await page.evaluate(() => window.api.loginom.read())).cloud.pending.verificationUrl
  await expect.poll(() => application.evaluate(() => globalThis.openedFixtureLinks)).toEqual([verificationUrl])
  await expect(form.getByRole("button", { name: verificationUrl, exact: true })).toBeVisible()
  await form.getByRole("button", { name: /^(Cancel sign-in|Отменить вход)$/ }).click()
  await expect(connect).toBeVisible()
  assert.equal((await page.evaluate(() => window.api.loginom.read())).cloud.pending, undefined)
  await connect.click()
  await expect(form.getByText(/TASK13-CODE/)).toBeVisible()
  await expect.poll(() => application.evaluate(() => globalThis.openedFixtureLinks)).toEqual([verificationUrl, verificationUrl])
  await fetch(input.cloud.control + "/approve")
  await expect.poll(async () => (await page.evaluate(() => window.api.loginom.status())).state, { timeout: 30000 }).toBe("ready")
  const connected = await page.evaluate(() => window.api.loginom.read())
  assert.equal(connected.cloud.connected, true)
  assert.equal(connected.cloud.email, "fixture@example.test")
  assert.equal(connected.generation, saved.generation)
  assert.equal(connected.revision, saved.revision)
  assert.equal(connected.browser.state, "unknown")
  await expect(form.getByText(/fixture@example.test/)).toBeVisible()
  await page.screenshot({ path: join(evidence, "cloud-ready.png") })
  await form.getByRole("button", { name: /^(Disconnect|Отключиться)$/ }).click()
  await expect.poll(async () => (await page.evaluate(() => window.api.loginom.status())).cloud.connected).toBe(false)
  const disconnected = await page.evaluate(() => window.api.loginom.read())
  assert.equal(disconnected.generation, saved.generation)
  assert.equal(disconnected.cloud.pending, undefined)
  const network = await (await fetch(input.cloud.control)).json()
  assert.equal(network.direct - beforeNetwork.direct, 0)
  const paths = network.requests.slice(beforeNetwork.requests.length)
  assert.ok(paths.includes("/api/auth/device/code") && paths.includes("/primary/mcp"))
  assert.equal(network.starts - beforeNetwork.starts, 2)
  const summary = { status: "PASS", version: await application.evaluate(({ app }) => app.getVersion()),
    localFixtures: true, realPreloadIpcHost: true, saveBeforeLogin: true, sameGenerationReady: true,
    cancelAndDisconnect: true, firstRequestViaLoginShellProxy: true, siteAndHelpDirect: 0,
    automaticOpenRequests: 2, manualLinkClicks: 0, osBrowserOpens: 0, browserVerification: "unknown", generation: saved.generation }
  await writeFile(join(evidence, "summary.json"), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ ...summary, evidence }))
} finally {
  await application.close()
}
