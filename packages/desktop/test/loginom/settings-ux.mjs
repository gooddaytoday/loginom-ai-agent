import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const { _electron, expect } = createRequire(new URL("../../../app/package.json", import.meta.url))("@playwright/test")
const directory = resolve(import.meta.dirname, "../..")
const evidence = await mkdtemp(join(tmpdir(), "loginom-settings-ux-"))
const application = await _electron.launch({
  executablePath:
    process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ??
    resolve(directory, "node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron"),
  args: process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory],
  cwd: directory,
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: join(evidence, "profile"),
    LOGINOM_AI_AGENT_PURE: "1",
    LOGINOM_AI_AGENT_SYSTEM_PROXY: "off",
  },
  chromiumSandbox: true,
  timeout: 120000,
})
try {
  const page = await application.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  const closeName = /^(Close|Закрыть)$/
  const saveName = /^(Save and close|Сохранить и закрыть)$/
  const checkName = /^(Check connection|Проверить подключение)$/
  await expect(form.getByRole("button", { name: closeName })).toHaveCount(0)
  await expect(form.getByRole("button", { name: saveName })).toBeEnabled()

  const startup = await page.evaluate(() => window.api.loginom.read())
  assert.equal(startup.generation, 0)
  assert.equal(startup.state, "unconfigured")
  // Deterministic IPC fixture in this isolated application's main process.
  // The rendered form, event handlers, preload and startup screen are real.
  await application.evaluate(({ ipcMain }, initial) => {
    let view = initial
    let candidate
    let mode = "ready"
    let browser = { state: "verified" }
    let failRead = false
    const calls = { checks: 0, saves: 0, keys: 0 }
    for (const name of ["loginom-read", "loginom-status", "loginom-check", "loginom-save"]) ipcMain.removeHandler(name)
    ipcMain.handle("loginom-read", () => {
      if (!failRead) return view
      failRead = false
      throw Error("LOGINOM_STORE_READ_FAILED")
    })
    ipcMain.handle("loginom-status", () => view)
    ipcMain.handle("loginom-check", (_event, input) => {
      calls.checks++
      // The knowledge service key is built in; the form must never send one.
      if ("apiKey" in input) calls.keys++
      if (input.username === "rejected-key-user") throw Error("LOGINOM_KNOWLEDGE_AUTH_FAILED")
      candidate = input
      browser =
        mode === "login-rejected"
          ? { state: "failed", failure: "LOGINOM_LOGIN_REJECTED" }
          : mode === "login-unavailable"
            ? { state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" }
            : { state: "verified" }
      return { validationId: "test-validated", expiresAt: Date.now() + 60000, browser }
    })
    ipcMain.handle("loginom-save", () => {
      calls.saves++
      if (mode === "rejected") throw Error("LOGINOM_STORE_WRITE_FAILED")
      view = {
        ...view,
        revision: view.revision + 1,
        state: mode === "login-rejected" || mode === "login-unavailable" ? "ready" : mode,
        failure: undefined,
        browser,
      }
      if (view.state === "starting" || view.state === "ready") {
        view = {
          ...view,
          generation: view.generation + 1,
          url: candidate.url,
          username: candidate.username,
          hasPassword:
            candidate.password.operation === "preserve" ? view.hasPassword : candidate.password.operation === "replace",
        }
      }
      if (view.state === "starting") view.setupRequired = true
      if (view.state === "ready") delete view.setupRequired
      return view
    })
    ipcMain.on("loginom-settings-test-mode", (_event, value) => {
      mode = value
    })
    ipcMain.on("loginom-settings-test-state", (_event, state, failure) => {
      view = { ...view, state, failure }
    })
    ipcMain.on("loginom-settings-test-read-failure", () => {
      failRead = true
    })
    ipcMain.handle("loginom-settings-test-calls", () => calls)
  }, startup)

  await page.keyboard.press("Escape")
  await page.mouse.click(2, 60)
  await page.evaluate(() => {
    const unsubscribe = window.api.onMenuCommand((command) => {
      if (command !== "settings.open") return
      document.body.dataset.testSettingsCommandReceived = "true"
      unsubscribe()
    })
  })
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("menu-command", "settings.open")
  })
  await expect(page.locator("body")).toHaveAttribute("data-test-settings-command-received", "true")
  await expect(form).toBeVisible()
  await expect(page.getByRole("tab", { name: "Loginom", exact: true })).toHaveCount(0)
  await expect(page.locator('[data-component="prompt-input"]')).toHaveCount(0)

  async function newWindow() {
    const [window] = await Promise.all([
      application.waitForEvent("window"),
      page.evaluate(() => window.api.runDesktopMenuAction("window.new")),
    ])
    return window
  }
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-read-failure"))
  const other = await newWindow()
  const otherForm = other.locator('[data-component="settings-loginom"]')
  await expect(other.getByRole("alert")).toContainText(
    /Could not load Loginom|Не удалось загрузить настройки Loginom/,
    {
      timeout: 120000,
    },
  )
  await other.getByRole("button", { name: /^(Refresh settings|Обновить настройки)$/ }).click()
  await expect(otherForm.getByRole("button", { name: saveName })).toBeEnabled({ timeout: 120000 })

  await form.getByRole("button", { name: checkName }).click()
  await expect(form.getByText(/Connection verified|Подключение проверено/)).toBeVisible()
  assert.deepEqual(await page.evaluate(() => window.api.loginom.read()), startup)

  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "login-rejected"))
  await form.locator('input[type="password"]').fill("incorrect-password")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form.getByRole("alert")).toContainText(
    /Check your username and password|Проверьте имя пользователя и пароль/,
  )
  await expect(form).toBeVisible()
  await expect(otherForm).toBeVisible()
  await expect(form.locator('input[type="password"]')).toHaveValue("incorrect-password")
  await expect(form.getByRole("button", { name: saveName })).toBeEnabled()
  assert.deepEqual(await page.evaluate(() => window.api.loginom.read()), startup)
  await page.screenshot({ path: join(evidence, "wizard-login-rejected.png") })
  await form.locator('input[type="password"]').fill("")

  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "rejected"))
  await form.getByRole("button", { name: saveName }).click()
  await expect(form.getByRole("alert")).toBeVisible()
  await expect(form.locator('input[type="url"]')).toHaveValue(startup.url)
  await expect(form.getByRole("button", { name: saveName })).toBeEnabled()
  await expect(otherForm).toBeVisible()

  const username = () => form.locator('input[autocomplete="username"]')
  const password = form.locator('input[type="password"]')
  await username().fill("first-activation-user")
  await password.fill("draft-password")
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "starting"))
  await form.getByRole("button", { name: saveName }).click()
  await expect
    .poll(() => page.evaluate(() => window.api.loginom.status()))
    .toMatchObject({
      generation: 1,
      state: "starting",
      setupRequired: true,
    })
  const during = await newWindow()
  const duringForm = during.locator('[data-component="settings-loginom"]')
  await expect(duringForm).toBeVisible({ timeout: 30_000 })
  await expect(during.locator('[data-component="prompt-input"]')).toHaveCount(0)

  await during.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })
  })
  await during.reload()
  await expect(duringForm).toBeVisible()
  const dragRegion = during.locator("[data-tauri-drag-region]")
  await expect(dragRegion).toBeVisible()
  await expect(dragRegion).toHaveCSS("app-region", "drag")

  await application.evaluate(({ ipcMain }) =>
    ipcMain.emit("loginom-settings-test-state", {}, "recoverable-error", "LOGINOM_RUNTIME_START_FAILED"),
  )
  await expect(form.getByRole("button", { name: saveName })).toBeEnabled()
  await expect(
    form.getByText(
      /Could not apply the Loginom connection\. Check your connection settings and save them again\.|Не удалось применить подключение Loginom\. Проверьте параметры и сохраните их повторно\./,
    ),
  ).toBeVisible()
  await expect(username()).toHaveValue("first-activation-user")
  await expect(password).toHaveValue("draft-password")
  await expect(duringForm).toBeVisible()
  await expect(during.locator('[data-component="prompt-input"]')).toHaveCount(0)

  await application.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send("system-proxy-status", {
        state: "failed",
        enabled: true,
        notices: [{ code: "unreachable", detail: "proxy.example.test:3128" }],
      })
  })
  await expect(
    page.getByText(
      /System proxy proxy\.example\.test:3128 is not reachable|Системный прокси proxy\.example\.test:3128 недоступен/,
    ),
  ).toBeVisible()

  // Return to the default address and credentials before retrying the first save.
  await username().fill(startup.username)
  await password.fill("")
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "login-unavailable"))
  await Promise.all([
    expect(page.getByText(/Loginom settings saved|Настройки Loginom сохранены/, { exact: true })).toBeVisible({
      timeout: 60_000,
    }),
    form.getByRole("button", { name: saveName }).click(),
  ])
  await expect(form).toHaveCount(0)
  await expect(page.getByText(/Loginom sign-in is not verified|Вход в Loginom не подтверждён/)).toBeVisible()
  assert.deepEqual((await page.evaluate(() => window.api.loginom.read())).browser, {
    state: "failed",
    failure: "LOGINOM_LOGIN_UNAVAILABLE",
  })
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "ready"))
  await expect(otherForm).toHaveCount(0)
  await expect(other.getByRole("button", { name: "Loginom", exact: true })).toBeVisible({ timeout: 60000 })
  await expect(duringForm).toHaveCount(0)
  await expect(during.getByRole("button", { name: "Loginom", exact: true })).toBeVisible()

  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-state", {}, "starting"))
  const configured = await newWindow()
  await expect(configured.getByRole("button", { name: "Loginom", exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(configured.locator('[data-component="settings-loginom"]')).toHaveCount(0)
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-state", {}, "ready"))

  const keepName = /^(Continue editing|Продолжить редактирование)$/
  const discardName = /^(Close without saving|Закрыть без сохранения)$/
  const footerClose = () => form.locator(".loginom-actions").getByRole("button", { name: closeName })
  const open = async () => {
    await page.getByRole("button", { name: "Loginom", exact: true }).click()
    await expect(form.getByRole("button", { name: checkName })).toBeEnabled()
  }
  await open()
  // Only the Loginom password remains secret in the form.
  await expect(form.locator('input[type="password"]')).toHaveCount(1)
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
  const checkResult = form.locator('[data-failed="false"]')
  await expect(checkResult).toContainText(/Connection verified|Подключение проверено/)
  await username().fill("checked-user")
  await expect(checkResult).toHaveCount(0)
  await form.getByRole("button", { name: checkName }).click()
  await expect(checkResult).toContainText(/not been saved|ещё не сохранены/)
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "login-rejected"))
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByText(/Loginom settings saved|Настройки Loginom сохранены/, { exact: true })).toBeVisible()
  assert.deepEqual((await page.evaluate(() => window.api.loginom.read())).browser, {
    state: "failed",
    failure: "LOGINOM_LOGIN_REJECTED",
  })
  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "ready"))
  await open()
  await expect(username()).toHaveValue("checked-user")
  await username().fill("rejected-key-user")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form.getByRole("alert")).toContainText(/Update the application|Обновите приложение/)
  await expect(username()).toHaveValue("rejected-key-user")
  await page.screenshot({ path: join(evidence, "invalid-key.png") })
  await username().fill("replacement-user")
  await expect(form.getByRole("alert")).toHaveCount(0)
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)

  await page.getByRole("button", { name: /Loginom AI Agent/ }).click()
  await page.getByRole("menuitem", { name: /^(File|Файл)$/ }).hover()
  await page.getByRole("menuitem", { name: /^(Settings|Настройки)/ }).click()
  await page.getByRole("tab", { name: "Loginom", exact: true }).click()
  await expect(form.getByRole("button", { name: checkName })).toBeEnabled()
  await username().fill("from-general-settings")
  await form.getByRole("button", { name: saveName }).click()
  await expect(page.getByRole("tab", { name: "Loginom", exact: true })).toHaveCount(0)
  await expect(form).toHaveCount(0)

  await application.evaluate(({ ipcMain }) => ipcMain.emit("loginom-settings-test-mode", {}, "pending"))
  await open()
  await username().fill("pending-user")
  await form.getByRole("button", { name: saveName }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByText(/Changes are saved and will apply|Изменения сохранены и будут применены/)).toBeVisible()
  await application.evaluate(({ ipcMain }) =>
    ipcMain.emit("loginom-settings-test-state", {}, "ready", "LOGINOM_RUNTIME_START_FAILED"),
  )
  await expect(
    page.getByText(/Saved Loginom settings could not be applied|Не удалось применить сохранённые настройки Loginom/),
  ).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: join(evidence, "deferred-failure.png") })
  const connection = await page.evaluate(async () => {
    const view = await window.api.loginom.read()
    return { revision: view.revision, hasApiKey: "hasApiKey" in view }
  })
  assert.equal(connection.hasApiKey, false)
  assert.equal(connection.revision, 6)
  const summary = {
    status: "PASS",
    version: await application.evaluate(({ app }) => app.getVersion()),
    firstSaveRequired: true,
    rejectedFirstLoginNotSaved: true,
    unavailableFirstLoginSavedWithWarning: true,
    configuredRejectedLoginStillSaved: true,
    defaultsSavedAfterRetry: true,
    loadFailureRetry: true,
    otherWindowUnblocked: true,
    newWindowWaitedForFirstActivation: true,
    configuredWindowOpenedDuringActivation: true,
    wizardWindowsDragRegion: true,
    wizardProxyNotice: true,
    wizardActivationError: true,
    noKeyField: true,
    closeMethods: 4,
    unsavedConfirmation: true,
    checkWithoutSave: true,
    saveAndClose: true,
    rejectedKeyPreserved: true,
    deferredFailureAfterClose: true,
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
