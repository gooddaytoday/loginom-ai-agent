import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const { expect } = createRequire(new URL("../../../app/package.json", import.meta.url))("@playwright/test")
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
const evidence = await mkdtemp(join(tmpdir(), "loginom-settings-live-"))
const application = await _electron.launch({
  executablePath: input.executable,
  args: [],
  cwd: resolve(import.meta.dirname, "../.."),
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_HEADLESS: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: join(evidence, "profile"),
    LOGINOM_AI_AGENT_PURE: "1",
  },
  timeout: 120000,
})
try {
  const page = await application.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  const save = form.getByRole("button", { name: /^(Save and close|Сохранить и закрыть)$/ })
  const check = form.getByRole("button", { name: /^(Check connection|Проверить подключение)$/ })
  await expect(check).toBeEnabled()
  await form.locator('input[type="password"]').nth(0).fill(input.connection.apiKey)
  await form.locator('input[type="url"]').fill(input.connection.url)
  await form.locator('input[autocomplete="username"]').fill(input.connection.username)
  await form.locator('input[type="password"]').nth(1).fill(input.connection.password)
  const before = await page.evaluate(() => window.api.loginom.read())
  await check.click()
  await expect(form.getByRole("status")).toContainText(/not been saved|ещё не сохранены/, { timeout: 180000 })
  const checked = await page.evaluate(() => window.api.loginom.read())
  assert.equal(checked.revision, before.revision)
  assert.equal(checked.hasApiKey, false)
  await save.click()
  await expect(form).toHaveCount(0, { timeout: 240000 })
  const saved = await page.evaluate(() => window.api.loginom.read())
  assert.equal(saved.state, "ready")
  assert.equal(saved.hasApiKey, true)
  assert.equal(saved.failure, undefined)
  await expect(page.getByText(/Loginom settings saved|Настройки Loginom сохранены/, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Loginom", exact: true }).click()
  const key = form.locator('input[type="password"]').nth(0)
  await expect(key).toHaveValue("")
  await expect(key).toHaveAttribute("placeholder", "••••••••")
  await expect(save).toBeDisabled()
  await check.click()
  await expect(form.getByRole("status")).toContainText(/Connection verified|Подключение проверено/, { timeout: 180000 })
  const unchanged = await page.evaluate(() => window.api.loginom.read())
  assert.equal(unchanged.revision, saved.revision)
  await page.screenshot({ path: join(evidence, "saved-connection.png") })
  await form
    .locator(".loginom-heading")
    .getByRole("button", { name: /^(Close|Закрыть)$/ })
    .click()
  await expect(form).toHaveCount(0)
  const summary = {
    status: "PASS",
    version: await application.evaluate(({ app }) => app.getVersion()),
    realDockAndLoginom: true,
    checkDoesNotSave: true,
    saveClosesWindow: true,
    maskedAfterReopen: true,
    savedKeyCheck: true,
    closeWithoutEdits: true,
  }
  await writeFile(join(evidence, "summary.json"), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ ...summary, evidence }))
} finally {
  await application.close()
}
