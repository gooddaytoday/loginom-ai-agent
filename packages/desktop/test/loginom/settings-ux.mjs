import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const { expect } = createRequire(new URL("../../../app/package.json", import.meta.url))("@playwright/test")
const directory = resolve(import.meta.dirname, "../..")
const evidence = await mkdtemp(join(tmpdir(), "loginom-settings-ux-"))
const application = await _electron.launch({
  executablePath:
    process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ?? resolve(directory, "node_modules/electron/dist/electron.exe"),
  args: process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory],
  cwd: directory,
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: join(evidence, "profile"),
    LOGINOM_AI_AGENT_PURE: "1",
  },
  timeout: 120000,
})
try {
  const page = await application.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  // Deterministic IPC fixture in this isolated application's main process.
  // The rendered form, event handlers, preload and dialog dismissal are real.
  await application.evaluate(({ ipcMain }) => {
    let view = {
      revision: 1,
      generation: 1,
      url: "http://loginom.test/app/",
      username: "user",
      folder: "/user",
      hasApiKey: true,
      hasPassword: false,
      state: "ready",
    }
    let candidate
    let mode = "ready"
    const calls = { checks: 0, saves: 0, preserved: 0 }
    for (const name of ["loginom-read", "loginom-status", "loginom-check", "loginom-save"]) ipcMain.removeHandler(name)
    ipcMain.handle("loginom-read", () => view)
    ipcMain.handle("loginom-status", () => view)
    ipcMain.handle("loginom-check", (_event, input) => {
      calls.checks++
      if (input.apiKey.operation === "preserve") calls.preserved++
      if (input.apiKey.value === "invalid-test-key") throw Error("LOGINOM_KNOWLEDGE_AUTH_FAILED")
      if (input.apiKey.value === "••••••••") throw Error("MASK_SUBMITTED_AS_KEY")
      candidate = input
      return { validationId: "test-validated", expiresAt: Date.now() + 60000 }
    })
    ipcMain.handle("loginom-save", () => {
      calls.saves++
      view = { ...view, revision: view.revision + 1, state: mode }
      if (mode === "ready")
        view = { ...view, generation: view.generation + 1, url: candidate.url, username: candidate.username }
      return view
    })
    ipcMain.on("loginom-settings-test-mode", (_event, value) => {
      mode = value
    })
    ipcMain.on("loginom-settings-test-fail", () => {
      view = { ...view, state: "ready", failure: "LOGINOM_RUNTIME_START_FAILED" }
    })
    ipcMain.handle("loginom-settings-test-calls", () => calls)
  })
  const closeName = /^(Close|Закрыть)$/
  const saveName = /^(Save and close|Сохранить и закрыть)$/
  const checkName = /^(Check connection|Проверить подключение)$/
  const keepName = /^(Continue editing|Продолжить редактирование)$/
  const discardName = /^(Close without saving|Закрыть без сохранения)$/
  const footerClose = () => form.locator(".loginom-actions").getByRole("button", { name: closeName })
  const open = async () => {
    await page.getByRole("button", { name: "Loginom", exact: true }).click()
    await expect(form.getByRole("button", { name: checkName })).toBeEnabled()
  }
  await footerClose().click()
  await expect(form).toHaveCount(0)
  await open()
  const key = () => form.locator('input[type="password"]').nth(0)
  const username = () => form.locator('input[autocomplete="username"]')
  await expect(key()).toHaveValue("")
  await expect(key()).toHaveAttribute("placeholder", "••••••••")
  await expect(form.getByRole("button", { name: saveName })).toBeDisabled()
  await expect(form.getByRole("button", { name: /Reload current settings|Загрузить текущие настройки/ })).toHaveCount(0)
  await page.screenshot({ path: join(evidence, "saved-key.png") })
  await form.locator(".loginom-heading").getByRole("button", { name: closeName }).click()
  await expect(form).toHaveCount(0)
  await open()
  await page.keyboard.press("Escape")
  await expect(form).toHaveCount(0)

  for (const method of ["button", "cross", "escape", "overlay"]) {
    await open()
    await username().fill(`draft-${method}`)
    if (method === "button") await footerClose().click()
    if (method === "cross") await form.locator(".loginom-heading").getByRole("button", { name: closeName }).click()
    if (method === "escape") await page.keyboard.press("Escape")
    if (method === "overlay")
      await page.locator('[data-component="dialog-overlay"]').click({ position: { x: 2, y: 2 } })
    await expect(form.getByRole("alertdialog")).toBeVisible()
    await form.getByRole("button", { name: keepName }).click()
    await expect(username()).toHaveValue(`draft-${method}`)
    await footerClose().click()
    await form.getByRole("button", { name: discardName }).click()
    await expect(form).toHaveCount(0)
  }

  await open()
  await form.getByRole("button", { name: checkName }).click()
  await expect(form.getByRole("status")).toContainText(/Connection verified|Подключение проверено/)
  await username().fill("checked-user")
  await expect(form.getByRole("status")).toHaveCount(0)
  await form.getByRole("button", { name: checkName }).click()
  await expect(form.getByRole("status")).toContainText(/not been saved|ещё не сохранены/)
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByText(/Loginom settings saved|Настройки Loginom сохранены/, { exact: true })).toBeVisible()
  await open()
  await expect(username()).toHaveValue("checked-user")
  await expect(key()).toHaveAttribute("placeholder", "••••••••")
  await key().fill("invalid-test-key")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form.getByRole("alert")).toContainText(/API key|API-ключ/)
  await expect(key()).toHaveValue("invalid-test-key")
  await page.screenshot({ path: join(evidence, "invalid-key.png") })
  await key().fill("replacement-test-key")
  await expect(form.getByRole("alert")).toHaveCount(0)
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)

  await page.keyboard.press("Control+,")
  await page.getByRole("tab", { name: "Loginom", exact: true }).click()
  await expect(form.getByRole("button", { name: checkName })).toBeEnabled()
  await username().fill("from-general-settings")
  await form.getByRole("button", { name: saveName }).click()
  await expect(page.getByRole("tab", { name: "Loginom", exact: true })).toHaveCount(0)
  await expect(form).toHaveCount(0)

  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "pending"))
  await open()
  await key().fill("pending-test-key")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByText(/Changes are saved and will apply|Изменения сохранены и будут применены/)).toBeVisible()
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-fail"))
  await expect(
    page.getByText(/Saved Loginom settings could not be applied|Не удалось применить сохранённые настройки Loginom/),
  ).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: join(evidence, "deferred-failure.png") })
  const calls = await application.evaluate(async ({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
      "window.api.loginom.read().then(v => ({ revision: v.revision, hasApiKey: v.hasApiKey }))",
    )
  })
  assert.equal(calls.hasApiKey, true)
  assert.equal(calls.revision, 5)
  const summary = {
    status: "PASS",
    version: await application.evaluate(({ app }) => app.getVersion()),
    maskedKey: true,
    closeMethods: 4,
    unsavedConfirmation: true,
    checkWithoutSave: true,
    saveAndClose: true,
    rejectedKeyPreserved: true,
    deferredFailureAfterClose: true,
  }
  await writeFile(join(evidence, "summary.json"), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ ...summary, evidence }))
} finally {
  await application.close()
}
