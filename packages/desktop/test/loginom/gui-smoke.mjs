import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { resolve, join } from "node:path"
import { tmpdir } from "node:os"
const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
  ? createRequire(join(process.env.LOGINOM_AI_AGENT_TEST_RESOURCES, "runtime/client/package.json"))("playwright-core")
  : require("playwright-core")
const directory = resolve(import.meta.dirname, "../..")
const profile = await mkdtemp(join(tmpdir(), "loginom-gui-"))
const evidence = join(tmpdir(), "loginom-gui-evidence")
const launch = () =>
  _electron.launch({
    executablePath:
      process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ?? resolve(directory, process.platform === "darwin"
        ? "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
        : "node_modules/electron/dist/electron"),
    args: [
      ...(process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory]),
      ...(process.env.LOGINOM_AI_AGENT_TEST_WAYLAND === "1" ? ["--ozone-platform=wayland"] : []),
    ],
    cwd: directory,
    env: { ...process.env, LOGINOM_AI_AGENT_TEST_ONBOARDING: "1", LOGINOM_AI_AGENT_TEST_ROOT: profile },
    chromiumSandbox: true,
    timeout: 120_000,
  })
const defaultConnection = process.env.LOGINOM_AI_AGENT_TEST_DEFAULT_CONNECTION === "1"
let application = await launch()
try {
  if (defaultConnection) {
    const first = await application.firstWindow()
    await first.locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
    await application.close()
    application = await launch()
  }
  const page = await application.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120_000 })
  const result = await form.evaluate((form) => {
    const inputs = [...form.querySelectorAll("input")]
    return {
      fields: inputs.filter((input) => input.type !== "checkbox").length,
      passwordPlaceholders: inputs
        .filter((input) => input.type === "password")
        .map((input) => input.getAttribute("placeholder")),
      urlDefault: inputs.some((input) => input.value === "https://app.loginom.ai"),
      usernameDefault: inputs.some((input) => input.value === "user"),
      secretValuesEmpty: inputs.filter((input) => input.type === "password").every((input) => input.value === ""),
    }
  })
  if (
    result.fields !== 3 ||
    !result.urlDefault ||
    !result.usernameDefault ||
    !result.secretValuesEmpty ||
    result.passwordPlaceholders.some(Boolean)
  )
    throw Error("ONBOARDING_FIELDS_INVALID")
  const bounds = await form.locator('button[type="submit"]').boundingBox()
  const viewport = await page.evaluate(() => ({ height: innerHeight, width: innerWidth }))
  if (!bounds || bounds.y < 0 || bounds.y + bounds.height > (viewport?.height ?? 800))
    throw Error("ONBOARDING_ACTIONS_CLIPPED")
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, "first-launch.png") })
  console.log(JSON.stringify({ status: "PASS", ...result }))
  if (defaultConnection || process.env.LOGINOM_AI_AGENT_TEST_CONFIG) {
    const file = join(profile, "desktop/loginom/connection/connection.json")
    if (defaultConnection) {
      const check = form.getByRole("button", { name: /^(Check connection|Проверить подключение)$/ })
      await check.click()
      await form.locator('[data-browser-state="verified"]').waitFor({ timeout: 180_000 })
      const checked = await page.evaluate(() => window.api.loginom.read())
      assert.equal(checked.revision, 0)
      assert.equal(checked.generation, 0)
      assert.equal(checked.state, "unconfigured")
      await assert.rejects(stat(file), { code: "ENOENT" })
    } else {
      const config = JSON.parse(await readFile(process.env.LOGINOM_AI_AGENT_TEST_CONFIG, "utf8"))
      if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
      await form.locator('input[type="url"]').fill(config.loginom_url)
      await form.locator('input[autocomplete="username"]').fill(config.workflow_profile.loginom_user)
    }
    await form.locator('button[type="submit"]').click()
    await waitReady(page)
    await form.waitFor({ state: "hidden", timeout: 10_000 }).catch(async () => {
      const status = await page.evaluate(() => window.api.loginom.status())
      console.log(
        JSON.stringify({
          status,
          alerts: await form.locator("[role=alert]").allTextContents(),
          submit: await form.locator("button[type=submit]").textContent(),
        }),
      )
      throw Error("ONBOARDING_DID_NOT_CLOSE")
    })
    await page.getByRole("button", { name: "Loginom", exact: true }).waitFor({ timeout: 60_000 })
    if (!defaultConnection) await checkNewChatBrand(page)
    const safe = await page.evaluate(() => window.api.loginom.read())
    if (!safe.generation || "hasApiKey" in safe) throw Error("SECRET_READBACK_INVALID")
    if (defaultConnection) assert.equal(safe.generation, 1)
    if (process.platform !== "win32" && (await stat(file)).mode % 512 !== 0o600)
      throw Error("SECRET_PERMISSIONS_INVALID")
    const stored = JSON.parse(await readFile(file, "utf8"))
    if (process.platform === "linux") {
      // The built-in knowledge key is never stored with the connection.
      if (stored.secrets?.apiKey !== "" || typeof stored.secrets?.password !== "string")
        throw Error("PLAINTEXT_POLICY_NOT_APPLIED")
    } else {
      if (!stored.secrets?.encrypted) throw Error("SECRET_PROTECTION_INVALID")
    }
    console.log("PASS: GUI connection check/save, safe IPC readback and platform credential storage")
    await application.close()
    const again = await launch()
    try {
      const page = await again.firstWindow()
      await waitReady(page)
      await page.getByRole("button", { name: "Loginom", exact: true }).waitFor({ timeout: 60_000 })
      if (await page.locator('[data-component="settings-loginom"]').count()) throw Error("WIZARD_REPEATED")
      console.log("PASS: saved connection restored without repeating first-launch wizard")
    } finally {
      await again.close()
    }
  }
} finally {
  await application.close().catch(() => undefined)
  await rm(profile, { recursive: true, force: true })
}

async function checkNewChatBrand(page) {
  const wordmark = page.locator('[data-component="wordmark-v2"]')
  if (!(await wordmark.count())) await page.locator('[data-action="home-new-session"]').first().click()
  await wordmark.waitFor({ timeout: 30_000 })
  const brand = await wordmark.evaluate((svg) => {
    const text = svg.querySelector("text")
    const accent = svg.querySelector("tspan")
    const bounds = text.getBBox()
    return {
      label: svg.getAttribute("aria-label"),
      text: text.textContent.trim(),
      accent: accent.textContent.trim(),
      accentFill: getComputedStyle(accent).fill,
      accentOpacity: getComputedStyle(accent).fillOpacity,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      fits: bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 720 && bounds.y + bounds.height <= 129,
    }
  })
  await page.screenshot({ path: join(evidence, "new-chat.png") })
  if (
    brand.label !== "Loginom AI" ||
    brand.text !== "Loginom AI" ||
    brand.accent !== "AI" ||
    brand.accentFill !== "rgb(199, 146, 146)" ||
    brand.accentOpacity !== "0.32" ||
    !brand.fits
  )
    throw Error(`NEW_CHAT_BRANDING_INVALID: ${JSON.stringify(brand)}`)
  console.log(JSON.stringify({ status: "PASS", newChatBrand: brand }))
}

async function waitReady(page) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => window.api.loginom.status())
    if (current.failure || current.state === "recoverable-error")
      throw Error(current.failure ?? "RUNTIME_RESTORE_FAILED")
    if (current.state === "ready" && current.generation) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw Error("CONNECTION_READINESS_TIMEOUT")
}
