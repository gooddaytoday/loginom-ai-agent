import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"

const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
const profile = join(input.directory, "profile")
const workspace = join(input.directory, "workspace")
await mkdir(workspace, { recursive: true, mode: 0o700 })
const application = await _electron.launch({
  executablePath: input.executable,
  args: [],
  cwd: resolve(import.meta.dirname, "../.."),
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_HEADLESS: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: profile,
    LOGINOM_AI_AGENT_PURE: "1",
    LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify(input.config),
    LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost",
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
  await page.evaluate(async (connection) => {
    const current = await window.api.loginom.read()
    const validation = await window.api.loginom.check({
      revision: current.revision,
      url: connection.url,
      username: connection.username,
      apiKey: { operation: "replace", value: connection.apiKey },
      password: connection.password ? { operation: "replace", value: connection.password } : { operation: "empty" },
    })
    await window.api.loginom.save({ revision: current.revision, validationId: validation.validationId })
  }, input.connection)
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
  const request = async (path, method = "POST", body) => {
    const response = await fetch(`${server.url}${path}?directory=${encodeURIComponent(workspace)}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(600000),
    })
    if (!response.ok) throw Error(`DESKTOP_OAUTH_BACKEND_${response.status}`)
    return response.json()
  }
  const authenticated = await request("/mcp/windows-oauth/auth/authenticate")
  const statuses = await request("/mcp", "GET")
  if (authenticated.status !== "connected" || statuses["windows-oauth"]?.status !== "connected")
    throw Error("DESKTOP_OAUTH_NOT_CONNECTED")
  let xiaomiTool = false
  if (input.xiaomi) {
    const session = await request("/session", "POST", {
      title: "Windows installed Xiaomi OAuth acceptance",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    })
    const answer = await request(`/session/${session.id}/message`, "POST", {
      model: { providerID: "xiaomi-token-plan-sgp", modelID: "mimo-v2.5-pro" },
      parts: [
        {
          type: "text",
          text: "This is an installed Desktop tool-call acceptance test. Your first action must be calling loginom_dock_prepare exactly once with intent new_draft and a unique operation_id. Do not answer with text before that call and do not call non-Loginom tools. After the completed tool result, briefly report whether the returned workspace is authenticated.",
        },
      ],
    })
    if (answer.info?.error) throw Error(`DESKTOP_XIAOMI_MODEL_${answer.info.error.name}`)
    const messages = await request(`/session/${session.id}/message`, "GET")
    xiaomiTool = messages.some((message) =>
      message.parts?.some(
        (part) => part.type === "tool" && part.tool === "loginom_dock_prepare" && part.state?.status === "completed",
      ),
    )
    if (!xiaomiTool) {
      const partSummary = messages.flatMap((message) =>
        message.parts?.map((part) => ({
          type: part.type,
          ...(part.type === "tool" ? { tool: part.tool, status: part.state?.status } : {}),
        })) ?? [],
      )
      throw Error(`DESKTOP_XIAOMI_TOOL_MISSING_${JSON.stringify(partSummary)}`)
    }
  }
  console.log(
    JSON.stringify({ status: "PASS", version: await application.evaluate(({ app }) => app.getVersion()), xiaomiTool }),
  )
} finally {
  await application.close()
}
