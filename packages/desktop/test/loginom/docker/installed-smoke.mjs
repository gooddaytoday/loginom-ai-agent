import { createRequire } from "node:module"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
const root = process.env.LOGINOM_AI_AGENT_INSTALL_ROOT ?? "/opt/loginom-ai-agent"
const resources = join(root, "resources/loginom")
const require = createRequire(join(resources, "runtime/client/package.json"))
const { _electron, chromium } = require("playwright-core")
const { verifyResources } = await import(join(resources, "runtime/src/resources.mjs"))
if (process.getuid() === 0) throw Error("NONROOT_TEST_REQUIRED")
const verified = await verifyResources(resources)
const profile = await mkdtemp(join(tmpdir(), "loginom-installed-"))
const browser = await chromium.launch({ executablePath: verified.browserPath, headless: true, chromiumSandbox: true })
try {
  const page = await browser.newPage()
  await page.setContent("<title>Bundled Chromium</title><p>Offline runtime</p>")
  if ((await page.title()) !== "Bundled Chromium") throw Error("BROWSER_FAILED")
} finally {
  await browser.close()
}
const app = await _electron.launch({
  executablePath: join(root, "loginom-ai-agent"),
  args: [],
  timeout: 120_000,
  env: { ...process.env, LOGINOM_AI_AGENT_TEST_ONBOARDING: "1", LOGINOM_AI_AGENT_TEST_ROOT: profile },
})
try {
  const page = await app.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120_000 })
  if ((await form.locator("input:not([type=checkbox])").count()) !== 4) throw Error("FOUR_FIELDS_REQUIRED")
  if ((await form.locator("input[type=url]").inputValue()) !== "http://logi-test-plan.bg.local/app/")
    throw Error("URL_DEFAULT_INVALID")
  if ((await form.locator("input[autocomplete=username]").inputValue()) !== "user") throw Error("USER_DEFAULT_INVALID")
  if (
    await form
      .locator("input[type=password]")
      .evaluateAll((inputs) => inputs.some((input) => input.value || input.getAttribute("placeholder")))
  )
    throw Error("SECRET_DEFAULT_INVALID")
  const status = await page.evaluate(() => window.api.loginom.read())
  if (status.hasApiKey || status.state !== "unconfigured") throw Error("UNCONFIGURED_STATE_INVALID")
  console.log(
    JSON.stringify({
      status: "PASS",
      uid: process.getuid(),
      node: process.version,
      os: await readFile("/etc/os-release", "utf8"),
      manifestHash: verified.manifestHash,
      browserSandbox: true,
      offlineWizard: true,
    }),
  )
} finally {
  await app.close()
  await rm(profile, { recursive: true, force: true })
}
