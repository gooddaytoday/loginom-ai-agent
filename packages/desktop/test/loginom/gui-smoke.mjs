import { createRequire } from "node:module"
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { resolve, join } from "node:path"
import { tmpdir } from "node:os"
const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const directory = resolve(import.meta.dirname, "../..")
const profile = await mkdtemp(join(tmpdir(), "loginom-gui-"))
const launch = () =>
  _electron.launch({
    executablePath:
      process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ?? resolve(directory, "node_modules/electron/dist/electron"),
    args: [
      ...(process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory]),
      ...(process.env.LOGINOM_AI_AGENT_TEST_WAYLAND === "1" ? ["--ozone-platform=wayland"] : []),
    ],
    cwd: directory,
    env: { ...process.env, LOGINOM_AI_AGENT_TEST_ONBOARDING: "1", LOGINOM_AI_AGENT_TEST_ROOT: profile },
    timeout: 120_000,
  })
const application = await launch()
try {
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
      urlDefault: inputs.some((input) => input.value === "http://logi-test-plan.bg.local/app/"),
      usernameDefault: inputs.some((input) => input.value === "user"),
      secretValuesEmpty: inputs.filter((input) => input.type === "password").every((input) => input.value === ""),
    }
  })
  if (
    result.fields !== 4 ||
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
  await mkdir("/tmp/loginom-gui-evidence", { recursive: true })
  await page.screenshot({ path: "/tmp/loginom-gui-evidence/first-launch.png" })
  console.log(JSON.stringify({ status: "PASS", ...result }))
  if (process.env.LOGINOM_AI_AGENT_TEST_CONFIG) {
    const config = JSON.parse(await readFile(process.env.LOGINOM_AI_AGENT_TEST_CONFIG, "utf8"))
    if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
    await form.locator('input[type="password"]').first().fill(config.api_key)
    await form.locator('input[type="url"]').fill(config.loginom_url)
    await form.locator('input[autocomplete="username"]').fill(config.workflow_profile.loginom_user)
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
    await page.locator('[data-action="home-new-session"]').first().click()
    const wordmark = page.locator('[data-component="wordmark-v2"]')
    await wordmark.waitFor({ timeout: 30_000 })
    const brand = await wordmark.evaluate((svg) => {
      const text = svg.querySelector("text")
      const bounds = text.getBBox()
      return {
        label: svg.getAttribute("aria-label"),
        text: text.textContent.trim(),
        fits: bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 720 && bounds.y + bounds.height <= 129,
      }
    })
    if (brand.label !== "Loginom AI" || brand.text !== "Loginom AI" || !brand.fits)
      throw Error("NEW_CHAT_BRANDING_INVALID")
    await page.screenshot({ path: "/tmp/loginom-gui-evidence/new-chat.png" })
    console.log(JSON.stringify({ status: "PASS", newChatBrand: brand }))
    const safe = await page.evaluate(() => window.api.loginom.read())
    if (!safe.hasApiKey || JSON.stringify(safe).includes(config.api_key)) throw Error("SECRET_READBACK_INVALID")
    const file = join(profile, "desktop/loginom/connection/connection.json")
    if ((await stat(file)).mode % 512 !== 0o600) throw Error("SECRET_PERMISSIONS_INVALID")
    if (!JSON.stringify(JSON.parse(await readFile(file, "utf8"))).includes(config.api_key))
      throw Error("PLAINTEXT_POLICY_NOT_APPLIED")
    console.log("PASS: GUI connection check/save, safe IPC readback and Linux plaintext permissions")
    await application.close()
    const again = await launch()
    try {
      const page = await again.firstWindow()
      await waitReady(page)
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

async function waitReady(page) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => window.api.loginom.status())
    if (current.failure || current.state === "recoverable-error")
      throw Error(current.failure ?? "RUNTIME_RESTORE_FAILED")
    if (current.state === "ready" && current.hasApiKey) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw Error("CONNECTION_READINESS_TIMEOUT")
}
