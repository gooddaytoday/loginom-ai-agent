import { createRequire } from "node:module"
import { mkdir, writeFile, symlink, stat, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const { expect } = createRequire(new URL("../../../app/package.json", import.meta.url))("@playwright/test")
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
const directory = resolve(import.meta.dirname, "../..")
const profile = join(input.directory, "profile")
const workspace = join(input.directory, "workspace")
await mkdir(workspace, { recursive: true, mode: 0o700 })
await writeFile(join(workspace, "sales.csv"), input.csv, { mode: 0o600 })
if (input.outputCards) {
  const auth = join(profile, "data/loginom-ai-agent-dev")
  await mkdir(auth, { recursive: true, mode: 0o700 })
  await symlink(join(homedir(), ".local/state/loginom-cli-oauth/shared-oauth-v1/auth.json"), join(auth, "auth.json"))
}
const application = await _electron.launch({
  executablePath: input.executable,
  args: input.application ? [input.application] : [],
  chromiumSandbox: true,
  cwd: directory,
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_HEADLESS: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: profile,
    LOGINOM_AI_AGENT_PURE: "1",
    LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify(input.config),
    LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
  },
  timeout: 120000,
})
try {
  const page = await application.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  await form.locator('input[type="url"]').fill(input.connection.url)
  await form.locator('input[autocomplete="username"]').fill(input.connection.username)
  await form.locator('input[type="password"]').first().fill(input.connection.password)
  // Exercise the packaged preload/main-process boundary directly. The visual
  // fields above still verify that the onboarding form is present and usable;
  // invoking the same API here gives the oracle an observable promise instead
  // of relying on a fire-and-forget Solid event handler.
  await page.evaluate(async (connection) => {
    const current = await window.api.loginom.read()
    const validation = await window.api.loginom.check({
      revision: current.revision,
      url: connection.url,
      username: connection.username,
      password: connection.password ? { operation: "replace", value: connection.password } : { operation: "empty" },
    })
    await window.api.loginom.save({ revision: current.revision, validationId: validation.validationId })
  }, input.connection)
  // Direct IPC saving intentionally leaves the form's local `editing` signal
  // untouched, so form visibility is not an authoritative readiness signal.
  // Wait on the packaged backend state that gates actual Loginom work.
  await page.evaluate(async () => {
    const deadline = Date.now() + 360000
    while (Date.now() < deadline) {
      const current = await window.api.loginom.status()
      if (current.state === "ready" && !current.failure) return
      if (current.failure) throw Error(current.failure)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw Error("LOGINOM_READY_TIMEOUT")
  })
  const server = await page.evaluate(() => window.api.awaitInitialization())
  const call = async (path, body, method = "POST") => {
    const response = await fetch(`${server.url}${path}?directory=${encodeURIComponent(workspace)}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.outputCards ? 1800000 : 600000),
    })
    if (!response.ok) throw Error(`DESKTOP_ORACLE_BACKEND_${response.status}`)
    return response.json()
  }
  const session = await call("/session", {
    title: "CSV oracle",
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  })
  const answer = await call(`/session/${session.id}/message`, {
    model: input.model ?? { providerID: "test", modelID: "test-model" },
    ...(input.model ? { variant: "medium" } : {}),
    parts: [
      { type: "text", text: input.prompt },
      {
        type: "file",
        filename: "sales.csv",
        mime: "text/plain",
        url: `data:text/plain;base64,${Buffer.from(input.csv).toString("base64")}`,
      },
    ],
  })
  if (answer.info?.error) throw Error(`DESKTOP_ORACLE_MODEL_${answer.info.error.name}`)
  const text = answer.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
  if (!input.outputCards && text.trim() !== "CLI oracle completed") throw Error("DESKTOP_ORACLE_FINAL_INVALID")
  if (input.outputCards) {
    const history = await call(`/session/${session.id}/message`, undefined, "GET")
    const files = history.flatMap((message) => message.parts.flatMap((part) =>
      part.type === "tool" && part.state.status === "completed" ? part.state.metadata?.outputFiles ?? [] : [],
    ))
    const paths = [...new Set(files.map((file) => file.path))]
    if (paths.length !== 1 || !(await stat(paths[0])).isFile()) throw Error("DESKTOP_EXPORT_FILE_MISSING")
    const route = `/${Buffer.from(workspace).toString("base64url")}/session/${session.id}`
    await page.evaluate(async (route) => {
      await window.api.finishFirstLaunchOnboarding(false)
      const id = await window.api.getWindowID()
      localStorage.setItem(`loginom-ai-agent.desktop.window.${id}.last-active-url`, route)
    }, route)
    await page.reload()
    const card = page.locator('[data-tid="generated-file-card"]')
    await expect(card).toHaveCount(1)
    await expect(card).toBeEnabled()
    await expect(card).toHaveAttribute("title", paths[0])
    if (!(await page.evaluate((path) => window.api.revealPath(path, { checkOnly: true }), paths[0])))
      throw Error("DESKTOP_EXPORT_CHECK_FAILED")
    await card.click()
    await page.screenshot({ path: join(input.directory, "export-card.png") })
    await unlink(paths[0])
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await expect(card).toBeDisabled()
    await expect(card).toHaveAttribute("title", /File not found|Файл не найден/)
    if (await page.evaluate((path) => window.api.revealPath(path), paths[0])) throw Error("DESKTOP_DELETED_FILE_REVEALED")
    await page.screenshot({ path: join(input.directory, "deleted-card.png") })
    await writeFile(join(input.directory, "output-cards.json"), JSON.stringify({
      status: "PASS", sessionID: session.id, files, presentCard: true, missingCardDisabled: true, checkOnly: true,
    }, null, 2))
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      version: await application.evaluate(({ app }) => app.getVersion()),
      sessionID: session.id,
      originalAttachment: true,
    }),
  )
} finally {
  await application.close()
}
