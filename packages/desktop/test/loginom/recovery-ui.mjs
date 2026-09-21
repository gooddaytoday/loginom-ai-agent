import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const executable = process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE
if (!executable) throw Error("LOGINOM_AI_AGENT_TEST_EXECUTABLE is required")
const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const root = await mkdtemp(join(tmpdir(), "loginom-recovery-ui-"))
const directory = join(root, "desktop/loginom/recovery")
const id = "11111111-1111-4111-8111-111111111111"
await mkdir(directory, { recursive: true, mode: 0o700 })
// Real durable journal in an isolated profile, without remote operations or credentials.
await writeFile(join(directory, `${id}.json`), JSON.stringify({ id, chat: "a".repeat(64), generation: 1 }), {
  mode: 0o600,
})
const app = await _electron.launch({
  executablePath: executable,
  env: { ...process.env, LOGINOM_AI_AGENT_TEST_ROOT: root, LOGINOM_AI_AGENT_TEST_ONBOARDING: "1" },
  timeout: 60000,
})
try {
  const page = await app.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 60000 })
  assert.deepEqual((await page.evaluate(() => window.api.loginom.status())).recoveries, [id])
  // Recovery is the only secondary button inside this form's recovery warning.
  const button = form.getByRole("button", { name: /Результат проверен|Outcome verified|recovery/i })
  await button.click()
  await button.waitFor({ state: "hidden", timeout: 10000 })
  assert.deepEqual(await readdir(directory), [])
  assert.equal((await page.evaluate(() => window.api.loginom.status())).state, "unconfigured")
  assert.deepEqual(await form.locator('[role="alert"]').allTextContents(), [])
  console.log("PASS: rendered recovery button -> preload/IPC -> durable journal acknowledgement, no server error")
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
