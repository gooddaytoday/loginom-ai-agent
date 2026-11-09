import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const { expect } = require("playwright/test")
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
  // Only this isolated main process is stubbed; renderer, preload and dialogs are real.
  await application.evaluate(({ ipcMain, shell }) => {
    let view = {
      mode: "cloud",
      endpoint: "https://custom.test/mcp",
      hasApiKey: true,
      server: "primary",
      cloud: { connected: false },
      help: { state: "connection-required" },
      revision: 1,
      generation: 1,
      url: "http://loginom.test/app/",
      username: "user",
      folder: "/user",
      hasPassword: false,
      state: "connection-required",
      browser: { state: "unknown" },
    }
    let candidate
    let browser = { state: "verified" }
    let activation = "connection-required"
    const calls = { checks: [], saves: 0, starts: 0, cancels: 0, disconnects: 0, links: [] }
    shell.openExternal = async (url) => {
      calls.links.push(url)
    }
    for (const name of [
      "loginom-read",
      "loginom-status",
      "loginom-check",
      "loginom-save",
      "loginom-cloud-start",
      "loginom-cloud-cancel",
      "loginom-cloud-disconnect",
    ])
      ipcMain.removeHandler(name)
    ipcMain.handle("loginom-read", () => view)
    ipcMain.handle("loginom-status", () => view)
    ipcMain.handle("loginom-cloud-start", () => {
      calls.starts++
      view = {
        ...view,
        cloud: {
          connected: false,
          pending: {
            userCode: "TEST-CODE",
            verificationUrl: "https://loginom.ai/device",
            expiresAt: Date.now() + 60000,
          },
        },
      }
      return view
    })
    ipcMain.handle("loginom-cloud-cancel", () => {
      calls.cancels++
      view = { ...view, cloud: { connected: false } }
      return view
    })
    ipcMain.handle("loginom-cloud-disconnect", () => {
      calls.disconnects++
      view = {
        ...view,
        cloud: { connected: false, failure: "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" },
        help: { state: "connection-required" },
        state: "connection-required",
      }
      return view
    })
    ipcMain.handle("loginom-check", (_event, input) => {
      calls.checks.push(input)
      if (input.username === "rejected-key-user") throw Error("LOGINOM_KNOWLEDGE_AUTH_FAILED")
      candidate = input
      return {
        help: view.help,
        browser: input.verifyBrowser ? browser : { state: "unknown" },
        validationId: "test-validated",
        expiresAt: Date.now() + 60000,
      }
    })
    ipcMain.handle("loginom-save", () => {
      calls.saves++
      view = {
        ...view,
        revision: view.revision + 1,
        state: activation,
        mode: candidate.mode,
        endpoint: candidate.endpoint,
        url: candidate.url,
        username: candidate.username,
      }
      if (activation !== "pending") view = { ...view, generation: view.generation + 1 }
      return view
    })
    ipcMain.on("loginom-settings-test-account", () => {
      view = {
        ...view,
        cloud: { connected: true, email: "account@test.invalid" },
        help: { state: "ready" },
        state: "ready",
      }
    })
    ipcMain.on("loginom-settings-test-browser", (_event, value) => {
      browser = value
    })
    ipcMain.on("loginom-settings-test-mode", (_event, value) => {
      activation = value
    })
    ipcMain.on("loginom-settings-test-fail", () => {
      view = { ...view, state: "ready", failure: "LOGINOM_RUNTIME_START_FAILED" }
    })
    ipcMain.on("loginom-settings-test-calls", (reply) => reply(calls))
  })
  const closeName = /^(Close|Закрыть)$/
  const saveName = /^(Save and close|Сохранить и закрыть)$/
  const checkName = /^(Check connection|Проверить подключение)$/
  const connectName = /^(Connect|Подключиться)$/
  const cancelName = /^(Cancel sign-in|Отменить вход)$/
  const disconnectName = /^(Disconnect|Отключиться)$/
  const cloudName = /^(Cloud server|Облачный сервер)$/
  const customName = /^(Custom server|Свой сервер)$/
  const keepName = /^(Continue editing|Продолжить редактирование)$/
  const discardName = /^(Close without saving|Закрыть без сохранения)$/
  const footerClose = () => form.locator(".loginom-actions").getByRole("button", { name: closeName })
  const username = () => form.locator('input[autocomplete="username"]')
  const feedback = () => form.locator('[data-component="loginom-connection-status"]')
  const counters = () =>
    application.evaluate(
      ({ ipcMain }) =>
        new Promise((resolve) => {
          ipcMain.emit("loginom-settings-test-calls", resolve)
        }),
    )
  const open = async () => {
    await page.getByRole("button", { name: "Loginom", exact: true }).click()
    await expect(form.getByRole("button", { name: checkName })).toBeEnabled()
  }
  await footerClose().click()
  await open()
  await expect(form.getByRole("radio", { name: cloudName })).toBeChecked()
  await expect(form.locator('[data-component="loginom-cloud-card"]')).toBeVisible()
  await expect(form.locator('[data-component="loginom-custom-card"]')).toHaveCount(0)
  await expect(
    form.getByRole("button", {
      name: /Reload current settings|Загрузить текущие настройки|Refresh connection|Обновить подключение/,
    }),
  ).toHaveCount(0)
  await form.getByRole("radio", { name: cloudName }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(form.getByRole("radio", { name: customName })).toBeChecked()
  const key = () => form.getByLabel(/^(Loginom AI key|Ключ Loginom AI)$/)
  const endpoint = () => form.getByLabel(/Loginom AI server URL|Адрес сервера Loginom AI/)
  await expect(key()).toHaveAttribute("type", "password")
  await expect(key()).toHaveValue("")
  await expect(key()).toHaveAttribute("placeholder", "••••••••")
  await expect(endpoint()).toHaveValue("https://custom.test/mcp")
  await key().fill("draft-fixture-key")
  await page.screenshot({ path: join(evidence, "custom-card.png") })
  await form.getByText(cloudName).click()
  await form.getByText(customName).click()
  await expect(key()).toHaveValue("draft-fixture-key")
  await endpoint().fill("https://typo.test/mcp")
  await expect(key()).toHaveValue("")
  await expect(key()).not.toHaveAttribute("placeholder", "••••••••")
  await endpoint().fill("https://CUSTOM.test:443/other")
  await expect(key()).toHaveValue("")
  await expect(key()).toHaveAttribute("placeholder", "••••••••")
  assert.equal((await counters()).starts, 0)
  await footerClose().click()
  await form.getByRole("button", { name: discardName }).click()
  await open()
  await form.getByRole("button", { name: connectName }).click()
  await expect(form.getByText(/TEST-CODE/)).toBeVisible()
  const expiry = await page.evaluate(async () =>
    new Date((await window.api.loginom.status()).cloud.pending.expiresAt).toLocaleString(
      document.documentElement.lang,
      {
        dateStyle: "medium",
        timeStyle: "long",
      },
    ),
  )
  await expect(form.locator('[data-component="loginom-cloud-card"]')).toContainText(expiry)
  await expect(form.getByRole("button", { name: "https://loginom.ai/device", exact: true })).toBeVisible()
  await form.getByRole("button", { name: "https://loginom.ai/device", exact: true }).click()
  assert.deepEqual((await counters()).links, ["https://loginom.ai/device"])
  await expect(footerClose()).toBeEnabled()
  await form.getByRole("button", { name: cancelName }).click()
  await expect(form.getByRole("button", { name: connectName })).toBeEnabled()
  for (const method of ["button", "cross", "escape", "overlay"]) {
    await form.getByRole("button", { name: connectName }).click()
    await expect(form.getByRole("button", { name: cancelName })).toBeVisible()
    await username().fill(`draft-${method}`)
    if (method === "button") await footerClose().click()
    if (method === "cross") await form.locator(".loginom-heading").getByRole("button", { name: closeName }).click()
    if (method === "escape") await page.keyboard.press("Escape")
    if (method === "overlay")
      await page.locator('[data-component="dialog-overlay"]').click({ position: { x: 2, y: 2 } })
    await expect(form.getByRole("alertdialog")).toBeVisible()
    assert.equal((await counters()).cancels, 1 + ["button", "cross", "escape", "overlay"].indexOf(method))
    await form.getByRole("button", { name: keepName }).click()
    await expect(username()).toHaveValue(`draft-${method}`)
    await footerClose().click()
    await form.getByRole("button", { name: discardName }).click()
    await expect(form).toHaveCount(0)
    await open()
    await expect(form.getByRole("button", { name: connectName })).toBeEnabled()
  }
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-account"))
  await expect(form.getByText(/account@test.invalid/)).toBeVisible()
  await username().fill("discard-account-draft")
  await footerClose().click()
  await form.getByRole("button", { name: discardName }).click()
  await open()
  await expect(form.getByText(/account@test.invalid/)).toBeVisible()
  await form.getByRole("button", { name: disconnectName }).click()
  await expect(form.getByText(/server revocation was not confirmed|отзыв на сайте не подтверждён/)).toBeVisible()
  await page.screenshot({ path: join(evidence, "cloud-card.png") })
  await username().fill("save-before-login")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  assert.equal((await counters()).checks.at(-1).verifyBrowser, false)
  await open()
  await form.getByRole("button", { name: checkName }).click()
  await expect(feedback().locator('[data-browser-state="verified"]')).toBeVisible()
  assert.equal((await counters()).checks.at(-1).verifyBrowser, true)
  assert.deepEqual((await counters()).checks.at(-1).apiKey, { operation: "preserve" })
  await expect(form.locator('.loginom-feedback[data-failed="false"]')).toContainText(
    /Connect to Loginom AI to continue|Требуется подключение к Loginom AI/,
  )
  await expect(form).not.toContainText(
    /Help is accessible|the AI server is accessible|Справка доступна|AI-сервер доступен/,
  )
  await application.evaluate(({ ipcMain }) =>
    ipcMain.emit("loginom-settings-test-browser", {}, { state: "failed", failure: "LOGINOM_LOGIN_REJECTED" }),
  )
  await form.getByRole("button", { name: checkName }).click()
  await expect(feedback().locator('[data-browser-state="failed"]')).toBeVisible()
  await expect(form.locator('.loginom-feedback[data-failed="false"]')).toContainText(
    /Connect to Loginom AI to continue|Требуется подключение к Loginom AI/,
  )
  await expect(form).not.toContainText(
    /Help is accessible|the AI server is accessible|Справка доступна|AI-сервер доступен/,
  )
  await form.locator('.loginom-feedback[data-failed="false"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(evidence, "check-help-required.png") })
  await username().fill("rejected-key-user")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form.locator('[data-failed="true"]')).toBeVisible()
  await expect(username()).toHaveValue("rejected-key-user")
  await username().fill("replacement-user")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  await page.getByRole("button", { name: /Loginom AI Agent/ }).click()
  await page.getByRole("menuitem", { name: /^(File|Файл)$/ }).hover()
  await page.getByRole("menuitem", { name: /^(Settings|Настройки)/ }).click()
  await page.getByRole("tab", { name: "Loginom", exact: true }).click()
  await expect(form.getByRole("button", { name: checkName })).toBeEnabled()
  await username().fill("from-general-settings")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "pending"))
  await open()
  await username().fill("pending-user")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByText(/Changes are saved and will apply|Изменения сохранены и будут применены/)).toBeVisible()
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-fail"))
  await expect(
    page.getByText(/Saved Loginom settings could not be applied|Не удалось применить сохранённые настройки Loginom/),
  ).toBeVisible({ timeout: 10000 })
  const summary = {
    status: "PASS",
    version: await application.evaluate(({ app }) => app.getVersion()),
    cards: 2,
    defaultCloud: true,
    keyboardRadio: true,
    storedKeyHidden: true,
    closeMethods: 4,
    cancel: true,
    account: true,
    saveBeforeLogin: true,
    explicitCheckHelpRequired: true,
    deferredFailureAfterClose: true,
    calls: await counters(),
  }
  await writeFile(join(evidence, "summary.json"), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ ...summary, evidence }))
} catch (error) {
  const page = await application.firstWindow()
  await page.screenshot({ path: join(evidence, "failure.png") }).catch(() => {})
  console.error(`Settings UX evidence: ${evidence}`)
  throw error
} finally {
  await application.close()
}
