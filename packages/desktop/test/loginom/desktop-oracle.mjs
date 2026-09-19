import { createRequire } from "node:module"
import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
const directory = resolve(import.meta.dirname, "../..")
const profile = join(input.directory, "profile")
const workspace = join(input.directory, "workspace")
await mkdir(workspace, { recursive: true, mode: 0o700 })
await writeFile(join(workspace, "sales.csv"), input.csv, { mode: 0o600 })
const application = await _electron.launch({
  executablePath: input.executable,
  args: [],
  cwd: directory,
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
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
  await form.locator('input[type="password"]').first().fill(input.connection.apiKey)
  await form.locator('input[type="url"]').fill(input.connection.url)
  await form.locator('input[autocomplete="username"]').fill(input.connection.username)
  await form.locator('input[type="password"]').nth(1).fill(input.connection.password)
  await form.locator('button[type="submit"]').click()
  await page.waitForTimeout(3000)
  if (await form.isVisible()) console.error(`LOGINOM_SETUP_REJECTED: ${await form.innerText()}`)
  await form.waitFor({ state: "hidden", timeout: 120000 })
  const server = await page.evaluate(() => window.api.awaitInitialization())
  const call = async (path, body) => {
    const response = await fetch(`${server.url}${path}?directory=${encodeURIComponent(workspace)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600000),
    })
    if (!response.ok) throw Error(`DESKTOP_ORACLE_BACKEND_${response.status}`)
    return response.json()
  }
  const session = await call("/session", {
    title: "CSV oracle",
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  })
  const answer = await call(`/session/${session.id}/message`, {
    model: { providerID: "test", modelID: "test-model" },
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
  if (text.trim() !== "CLI oracle completed") throw Error("DESKTOP_ORACLE_FINAL_INVALID")
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
