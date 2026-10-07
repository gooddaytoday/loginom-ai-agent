import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { createHash } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { pathToFileURL } from "node:url"
// Scripted provider verifies permissions and original file admission, not natural model routing.
const executable = process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE
const resources = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
const evidence = process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS
if (![executable, resources, evidence].every((path) => path && isAbsolute(path)))
  throw Error("ABSOLUTE_TEST_PATHS_REQUIRED")
if (process.platform !== "linux" || process.getuid() === 0) throw Error("NONROOT_LINUX_TEST_REQUIRED")
await mkdir(evidence, { mode: 0o700 })
const require = createRequire(join(resources, "runtime/client/package.json"))
const { _electron } = require("playwright-core")
const observations = new Map()
let stopped = false
const monitor = (async () => {
  while (!stopped) {
    const rows = await Promise.all(
      (await readdir("/proc"))
        .filter((pid) => /^\d+$/.test(pid))
        .map(async (pid) => {
          const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "")
          const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
          const command = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")
          return {
            pid: Number(pid),
            parent: Number(fields[1]),
            start: fields[19],
            state: fields[0],
            command: command.replaceAll("\0", " ").trim(),
          }
        }),
    )
    const owned = new Set([
      process.pid,
      ...rows.filter((row) => observations.has(`${row.pid}:${row.start}`)).map((row) => row.pid),
    ])
    let count = 0
    do {
      count = owned.size
      rows.filter((row) => owned.has(row.parent)).forEach((row) => owned.add(row.pid))
    } while (owned.size !== count)
    rows
      .filter((row) => owned.has(row.pid) && row.pid !== process.pid && row.start)
      .forEach((row) => {
        const key = `${row.pid}:${row.start}`
        if (row.command || !observations.has(key)) observations.set(key, row)
      })
    await setTimeout(25)
  }
})()

const requests = []
let source
const provider = createServer(async (request, response) => {
  try {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push(body)
    const has = (id) => body.messages.some((message) => message.role === "tool" && message.tool_call_id === id)
    const action = !body.tools?.length
      ? undefined
      : !has("activate")
        ? { id: "activate", name: "skill", args: { name: "package-docs" } }
        : !has("extract")
          ? { id: "extract", name: "package_docs_run", args: { operation: "extract", lgp: source } }
          : undefined
    if (action)
      assert.ok(
        body.tools.some((tool) => tool.function.name === action.name),
        "tool must be advertised",
      )
    const delta = action
      ? {
          tool_calls: [
            {
              index: 0,
              id: action.id,
              type: "function",
              function: { name: action.name, arguments: JSON.stringify(action.args) },
            },
          ],
        }
      : { content: body.tools?.length ? "Проверка чтения завершена." : "Проверка документации" }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(
      [
        { choices: [{ index: 0, delta, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }] },
      ]
        .map((chunk) => `data: ${JSON.stringify({ id: "gui-docs", object: "chat.completion.chunk", ...chunk })}\n\n`)
        .join("") + "data: [DONE]\n\n",
    )
  } catch (error) {
    await writeFile(join(evidence, "provider-error.txt"), String(error))
    response.writeHead(500).end()
  }
})
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve))
const results = []
try {
  for (const kind of ["text-deny", "text-allow", "attachment", "attachment-read-deny", "attachment-edit-deny"]) {
    const attached = kind.startsWith("attachment")
    const denied = kind.endsWith("deny")
    const output = join(evidence, kind)
    await mkdir(output, { mode: 0o700 })
    const root = await mkdtemp("/tmp/loginom-docs-gui-permissions-")
    const home = join(root, "home"),
      workspace = join(root, "workspace"),
      profile = join(root, "profile"),
      input = join(root, "input")
    for (const directory of [home, workspace, input]) await mkdir(directory, { mode: 0o700 })
    source = join(input, "Исходный сценарий.LGP")
    await cp(new URL("../../../loginom-host/test/fixtures/package-docs/nested.lgp", import.meta.url), source)
    const originalSha256 = createHash("sha256")
      .update(await readFile(source))
      .digest("hex")
    await writeFile(join(output, "roots.json"), JSON.stringify({ root, home, workspace, profile, source }, null, 2))
    const config = {
      model: "test/test-model",
      enabled_providers: ["test"],
      formatter: false,
      lsp: false,
      permission: {
        skill: "allow",
        edit: kind === "attachment-edit-deny" ? "deny" : "allow",
        read: kind === "attachment-read-deny" ? "deny" : "ask",
        external_directory: "ask",
      },
      provider: {
        test: {
          name: "Test",
          id: "test",
          env: [],
          npm: "@ai-sdk/openai-compatible",
          models: {
            "test-model": {
              id: "test-model",
              name: "Test Model",
              attachment: false,
              reasoning: false,
              temperature: false,
              tool_call: true,
              release_date: "2025-01-01",
              limit: { context: 100000, output: 10000 },
              cost: { input: 0, output: 0 },
              options: {},
            },
          },
          options: { apiKey: "test-key", baseURL: `http://127.0.0.1:${provider.address().port}/v1` },
        },
      },
    }
    const app = await _electron.launch({
      executablePath: executable,
      args: [],
      chromiumSandbox: true,
      cwd: workspace,
      timeout: 120000,
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("LOGINOM_AI_AGENT_"))),
        HOME: home,
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_DATA_HOME: join(home, "data"),
        XDG_CACHE_HOME: join(home, "cache"),
        LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
        LOGINOM_AI_AGENT_TEST_ROOT: profile,
        LOGINOM_AI_AGENT_PURE: "1",
        LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify(config),
        LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
      },
    })
    try {
      const page = await app.firstWindow()
      const form = page.locator('[data-component="settings-loginom"]')
      await form.waitFor({ timeout: 120000 })
      await form.locator('[data-component="icon-button"][data-icon="close"]').click()
      await form.waitFor({ state: "hidden", timeout: 30000 })
      const backend = await page.evaluate(() => window.api.awaitInitialization())
      async function call(path, method = "GET", body) {
        const response = await fetch(`${backend.url}${path}?directory=${encodeURIComponent(workspace)}`, {
          method,
          headers: {
            "content-type": "application/json",
            authorization: `Basic ${Buffer.from(`${backend.username}:${backend.password}`).toString("base64")}`,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(30000),
        })
        if (!response.ok) throw Error(`${method}_${path}_${response.status}`)
        return response.json()
      }
      const session = await call("/session", "POST", { title: "GUI " + kind })
      const route = "/" + Buffer.from(workspace).toString("base64url") + "/session/" + session.id
      await page.evaluate(async (route) => {
        const id = await window.api.getWindowID()
        localStorage.setItem(`loginom-ai-agent.desktop.window.${id}.last-active-url`, route)
      }, route)
      const agentsReady = page.waitForResponse(
        (response) => {
          const url = new URL(response.url())
          return response.request().method() === "GET" && ["/agent", "/api/agent"].includes(url.pathname)
        },
        { timeout: 60000 },
      )
      const [agentResponse] = await Promise.all([agentsReady, page.reload()])
      assert.ok(agentResponse.ok(), "renderer agent catalog must load before submission")
      await agentResponse.finished()
      await form.waitFor({ timeout: 120000 })
      await form.locator('[data-component="icon-button"][data-icon="close"]').click()
      await form.waitFor({ state: "hidden", timeout: 30000 })
      const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
      await editor.waitFor({ timeout: 60000 })
      await page.getByText("Test Model", { exact: true }).waitFor({ timeout: 60000 })
      await writeFile(
        join(output, "restored-view.json"),
        JSON.stringify({ text: await page.locator("body").innerText(), route }, null, 2),
      )
      const attachment = page.locator('input[type="file"]')
      assert.ok((await attachment.getAttribute("accept"))?.split(",").includes(".lgp"))
      if (attached) {
        assert.equal(await attachment.count(), 1)
        await attachment.setInputFiles(source)
        await page
          .locator('[data-component="prompt-input-v2-attachments"]')
          .getByText("Исходный сценарий.LGP", { exact: true })
          .waitFor({ timeout: 30000 })
      }
      await editor.fill(
        kind.startsWith("text-")
          ? `Напиши документацию по локальному пакету ${source}.`
          : "Напиши документацию по приложенному пакету.",
      )
      const messageRequest = page.waitForRequest(
        (request) => request.method() === "POST" && request.url().includes(`/session/${session.id}/`),
        { timeout: 30000 },
      )
      const [submitted] = await Promise.all([
        messageRequest,
        page.getByRole("button", { name: /^(Send|Отправить)$/ }).click(),
      ])
      await writeFile(
        join(output, "submitted.json"),
        JSON.stringify({ url: submitted.url(), body: submitted.postDataJSON() }, null, 2),
      )
      const dock = page.locator('[data-component="dock-prompt"][data-kind="permission"]')
      if (kind.startsWith("text-")) {
        await dock.waitFor({ timeout: 60000 })
        const permissions = await call("/permission")
        assert.ok(
          permissions.some(
            (permission) => permission.sessionID === session.id && permission.permission === "external_directory",
          ),
        )
        await writeFile(join(output, "permissions.json"), JSON.stringify(permissions, null, 2))
        await page.screenshot({ path: join(output, "permission.png") })
        await dock
          .getByRole("button", {
            name: kind === "text-deny" ? /^(Deny|Запретить)$/ : /^(Allow once|Разрешить один раз)$/,
          })
          .click()
        if (kind === "text-allow") {
          const deadline = Date.now() + 30000
          while (true) {
            const pending = (await call("/permission")).filter((permission) => permission.sessionID === session.id)
            if (pending.some((permission) => permission.permission === "read")) {
              await writeFile(join(output, "read-permissions.json"), JSON.stringify(pending, null, 2))
              break
            }
            if (Date.now() > deadline) throw Error("READ_PERMISSION_NOT_REQUESTED")
            await setTimeout(100)
          }
          await dock.getByText(/^(Чтение файла|Reading a file) \(/).waitFor({ timeout: 30000 })
          await page.screenshot({ path: join(output, "read-permission.png") })
          await dock.getByRole("button", { name: /^(Allow once|Разрешить один раз)$/ }).click()
        }
      }
      if (!denied) await page.getByText("Проверка чтения завершена.", { exact: true }).waitFor({ timeout: 60000 })
      if (denied) {
        await dock.waitFor({ state: "hidden", timeout: 30000 })
        const deadline = Date.now() + 30000
        while (true) {
          const history = await call(`/session/${session.id}/message`)
          const extracted = history
            .flatMap((message) => message.parts)
            .find((part) => part.type === "tool" && part.tool === "package_docs_run")
          if (extracted?.state.status === "error") break
          if (Date.now() > deadline) throw Error("DENIED_TOOL_NOT_SETTLED")
          await setTimeout(100)
        }
      }
      const messages = await call(`/session/${session.id}/message`)
      await writeFile(join(output, "messages.json"), JSON.stringify(messages, null, 2))
      const tools = messages.flatMap((message) => message.parts).filter((part) => part.type === "tool")
      const extracted = tools.find((part) => part.tool === "package_docs_run")
      assert.ok(
        tools.some((part) => part.tool === "skill" && part.state.metadata?.activation?.profile === "package-docs"),
      )
      assert.equal(extracted.state.status, denied ? "error" : "completed")
      const originalFiles = messages
        .filter((message) => message.info.role === "user")
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "file")
      if (denied) {
        assert.ok(extracted.state.metadata?.permissionDenied)
        assert.ok(!(await readdir(workspace)).includes(".work"))
      }
      if (!attached) assert.equal(originalFiles.length, 0)
      if (attached) {
        assert.equal(originalFiles.length, 1)
        assert.equal(originalFiles[0].mime, "application/x-loginom-package")
        assert.equal(originalFiles[0].url, pathToFileURL(source).href)
      }
      assert.equal((await call("/permission")).filter((permission) => permission.sessionID === session.id).length, 0)
      if (!denied) {
        const structure = JSON.parse(extracted.state.output).structure
        assert.ok(structure.startsWith(join(workspace, ".work/package-docs/")))
        assert.equal(JSON.parse(await readFile(structure, "utf8")).schema_version, "package_docs.structure.v1")
      }
      assert.equal(
        createHash("sha256")
          .update(await readFile(source))
          .digest("hex"),
        originalSha256,
      )
      const result = {
        status: "PASS",
        kind,
        sessionID: session.id,
        originalSha256,
        tools: tools.map((part) => ({ name: part.tool, status: part.state.status })),
        interface: "actual AppImage GUI composer and permission dock",
        routeSetup: "own persisted Desktop MemoryRouter, session fixture created through public API",
        scriptedProvider: true,
      }
      await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2))
      await page.screenshot({ path: join(output, "completed.png") })
      results.push(result)
    } catch (error) {
      const page = await app.firstWindow().catch(() => undefined)
      if (page) {
        await writeFile(
          join(output, "failure-view.txt"),
          await page
            .locator("body")
            .innerText()
            .catch(() => ""),
        )
        await page.screenshot({ path: join(output, "failure.png") }).catch(() => undefined)
      }
      await writeFile(join(output, "failure.txt"), String(error))
      throw error
    } finally {
      await app.close()
      await rm(root, { recursive: true, force: true })
    }
  }
} finally {
  provider.close()
  await writeFile(join(evidence, "requests.json"), JSON.stringify(requests, null, 2))
  await writeFile(join(evidence, "results.json"), JSON.stringify(results, null, 2))
  await setTimeout(250)
  stopped = true
  await monitor
  const processes = [...observations.values()]
  const live = await Promise.all(
    processes.map(async (row) => {
      const stat = await readFile(`/proc/${row.pid}/stat`, "utf8").catch(() => "")
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
      return fields[19] === row.start && !["Z", "X"].includes(fields[0]) ? row : undefined
    }),
  )
  await writeFile(
    join(evidence, "processes.json"),
    JSON.stringify({ samplingMs: 25, processes, remaining: live.filter(Boolean) }, null, 2),
  )
  if (live.some(Boolean)) throw Error("CHILD_PROCESS_REMAINS")
  if (processes.some((row) => row.command.split(" ").includes("--no-sandbox"))) throw Error("SANDBOX_DISABLED")
  if (processes.some((row) => /browsers\/chromium-\d+\/.*\/chrome(?: |$)/.test(row.command)))
    throw Error("LOGINOM_BROWSER_STARTED")
}
console.log(JSON.stringify({ status: "PASS", results }))
