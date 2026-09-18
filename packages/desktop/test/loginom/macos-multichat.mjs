import { createRequire } from "node:module"
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { parseArgs } from "node:util"
import assert from "node:assert/strict"

const args = parseArgs({
  options: {
    executable: { type: "string" },
    config: { type: "string" },
    output: { type: "string" },
    lifecycle: { type: "boolean" },
  },
}).values
if (!args.executable || !args.config || !args.output) throw Error("Required: --executable --config --output")
const config = JSON.parse(await readFile(args.config, "utf8"))
if (!config.api_key || config.workflow_profile?.passwordless_login !== true)
  throw Error("PRIVATE_PASSWORDLESS_CONFIG_REQUIRED")
const directory = await mkdtemp(join(tmpdir(), "loginom-macos-multichat-"))
const workspace = join(directory, "Данные продаж")
await mkdir(workspace, { mode: 0o700 })
const require = createRequire(new URL("../../../loginom-runtime/client/package.json", import.meta.url))
const { _electron } = require("playwright-core")
const state = { next: Promise.withResolvers(), pending: undefined, sequence: 0 }
// Scripted tool selection reuses the existing oracle-provider wire contract;
// application, attachment admission, browser upload and Loginom are all real.
const provider = createServer(async (request, response) => {
  try {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const title = JSON.stringify(body.messages).includes("Generate a title for this conversation")
    const previous = body.messages.findLast(
      (message) => message.role === "tool" && message.tool_call_id === state.pending?.id,
    )
    if (previous && state.pending) {
      state.pending.resolve(previous.content)
      state.pending = undefined
    }
    const action = title ? { finish: true } : await state.next.promise
    if (!title) state.next = Promise.withResolvers()
    if (!action.finish && !body.tools?.some((tool) => tool.function?.name === action.name))
      throw Error("TOOL_NOT_ADVERTISED")
    const delta = action.finish
      ? { content: title ? "Acceptance" : "Multichat step complete" }
      : {
          tool_calls: [
            {
              index: 0,
              id: action.id,
              type: "function",
              function: { name: action.name, arguments: JSON.stringify(action.args) },
            },
          ],
        }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(
      [
        { id: "multichat", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] },
        {
          id: "multichat",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: {}, finish_reason: action.finish ? "stop" : "tool-calls" }],
        },
      ]
        .map((value) => `data: ${JSON.stringify(value)}\n\n`)
        .join("") + "data: [DONE]\n\n",
    )
  } catch {
    state.pending?.reject(Error("SCRIPTED_PROVIDER_FAILED"))
    response.writeHead(500).end()
  }
})
await new Promise((done) => provider.listen(0, "127.0.0.1", done))
const model = {
  formatter: false,
  lsp: false,
  provider: {
    test: {
      name: "Acceptance",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Scripted oracle",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 1000000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: { apiKey: "fixture-key", baseURL: `http://127.0.0.1:${provider.address().port}/v1` },
    },
  },
}
const application = await _electron.launch({
  executablePath: resolve(args.executable),
  args: [],
  cwd: resolve(import.meta.dirname, "../.."),
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: join(directory, "profile"),
    LOGINOM_AI_AGENT_PURE: "1",
    LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify(model),
    LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
  },
  timeout: 120000,
})
const child = application.process()
const summary = {
  status: "FAIL",
  directory,
  executable: resolve(args.executable),
  desktopPid: child.pid,
  model: "scripted-oracle",
  attachmentAdmission: "original bytes read from local Unicode paths and sent through Desktop API",
  filePickerTested: false,
  oneDesktopProcess: true,
  chats: [],
}
let deadline
try {
  await Promise.race([
    run(),
    new Promise((_, reject) => {
      deadline = setTimeout(() => reject(Error("MULTICHAT_TIMEOUT")), 600000)
    }),
  ])
  summary.status = "PASS"
} catch (error) {
  summary.failure = error instanceof Error ? error.message : "MULTICHAT_FAILED"
  process.exitCode = 1
} finally {
  clearTimeout(deadline)
  state.next.resolve({ finish: true })
  provider.closeAllConnections()
  provider.close()
  await application.close()
  summary.cleanExit = child.exitCode === 0 && !child.signalCode
  const gone = () =>
    (summary.trackedPids ?? []).filter((pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch (error) {
        if (error.code === "ESRCH") return false
        throw error
      }
    })
  const limit = Date.now() + 10000
  while (gone().length && Date.now() < limit) await new Promise((done) => setTimeout(done, 100))
  summary.remainingTrackedPids = gone()
  if (summary.remainingTrackedPids.length) {
    summary.status = "FAIL"
    summary.failure = "DESCENDANTS_REMAIN"
    process.exitCode = 1
  }
  if (!summary.cleanExit) {
    summary.status = "FAIL"
    process.exitCode = 1
  }
  const serialized = JSON.stringify(summary, null, 2)
  if (serialized.includes(config.api_key)) throw Error("SECRET_IN_REPORT")
  await mkdir(dirname(resolve(args.output)), { recursive: true })
  await writeFile(args.output, serialized + "\n", { mode: 0o600 })
  console.log(JSON.stringify({ status: summary.status, report: resolve(args.output), failure: summary.failure }))
}

async function run() {
  const page = await application.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  await form.locator('input[type="password"]').first().fill(config.api_key)
  await form.locator('input[type="url"]').fill(config.loginom_url)
  await form.locator('input[autocomplete="username"]').fill(config.workflow_profile.loginom_user)
  await form.locator('button[type="submit"]').click()
  await form.waitFor({ state: "hidden", timeout: 120000 })
  const backend = await page.evaluate(() => window.api.awaitInitialization())
  const call = async (path, body, method = "POST") => {
    const response = await fetch(`${backend.url}${path}?directory=${encodeURIComponent(workspace)}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${backend.username}:${backend.password}`).toString("base64")}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(240000),
    })
    assert.ok(response.ok, `BACKEND_${response.status}`)
    return response.json()
  }
  summary.version = await application.evaluate(({ app }) => app.getVersion())
  for (const label of ["A", "B"]) {
    const filename = `Продажи ${label === "A" ? "А" : "Б"}.csv`
    const csv = await readFile(new URL(`./fixtures/standalone-cli/${label}/sales.csv`, import.meta.url))
    const path = join(workspace, filename)
    await writeFile(path, csv, { mode: 0o600 })
    const bytes = await readFile(path)
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const session = await call("/session", {
      title: `Изолированный чат ${label}`,
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    })
    const answer = call(`/session/${session.id}/message`, {
      model: { providerID: "test", modelID: "test-model" },
      parts: [
        {
          type: "text",
          text: "Prepare a draft and upload only the attached original file. Do not edit or save nodes.",
        },
        { type: "file", filename, mime: "text/plain", url: `data:text/plain;base64,${bytes.toString("base64")}` },
      ],
    })
    void answer.catch(() => {})
    const prepared = await tool("dock_prepare", { intent: "new_draft", operation_id: `prepare-${randomUUID()}` })
    assert.ok(prepared.prepared && prepared.workspace.authenticated, "PREPARATION_FAILED")
    assert.equal(prepared.input_artifacts.length, 1, "INPUT_COUNT")
    const artifact = prepared.input_artifacts[0]
    assert.equal(artifact.sha256, sha256, "INPUT_HASH")
    assert.match(artifact.name, /^[a-f0-9]{64}-0-/, "INPUT_IDENTITY_PREFIX")
    assert.equal(artifact.name.slice(67), filename, "INPUT_NAME")
    assert.ok(artifact.upload.destination.endsWith("/" + artifact.name), "DESTINATION_NAME")
    const delivered = await tool("dock_artifact_deliver", {
      operation_id: `deliver-${randomUUID()}`,
      artifact_id: artifact.artifact_id,
      upload_grant_id: artifact.upload.grant_id,
      budget_ms: 90000,
    })
    assert.equal(delivered.status, "SUCCEEDED", "DELIVERY_STATUS")
    assert.ok(delivered.output.upload_completion_verified, "DELIVERY_UNVERIFIED")
    assert.equal(delivered.output.sha256, sha256, "DELIVERY_HASH")
    const observed = await tool("dock_workspace_observe", { scope: "roots" })
    assert.equal(observed.status, "SUCCEEDED", "INITIAL_OBSERVATION")
    assert.ok(observed.output.dom_epoch.document, "INITIAL_DOCUMENT_EPOCH")
    state.next.resolve({ finish: true })
    assert.ok(!(await answer).info?.error, "CHAT_FAILED")
    assert.equal(child.exitCode, null, "DESKTOP_EXITED")
    summary.chats.push({
      session: session.id,
      dockSession: prepared.sessionId,
      artifact: artifact.artifact_id,
      destination: artifact.upload.destination,
      filename,
      admittedName: artifact.name,
      observationDocument: observed.output.dom_epoch.document,
      observedWorkflow: observed.output.workflow_ref,
      localPath: path,
      sha256,
      document: prepared.workspace.document_id,
      workflow: prepared.workspace.workflow_ref,
    })
  }
  for (const key of [
    "session",
    "dockSession",
    "artifact",
    "destination",
    "sha256",
    "document",
    "observationDocument",
  ]) {
    assert.ok(summary.chats[0][key], `MISSING_${key}`)
    assert.notEqual(summary.chats[0][key], summary.chats[1][key], `COLLISION_${key}`)
  }
  const first = summary.chats[0]
  const answer = call(`/session/${first.session}/message`, {
    model: { providerID: "test", modelID: "test-model" },
    parts: [
      {
        type: "text",
        text: "Return to this first chat. Inspect its original input artifacts and existing workspace; do not prepare a new workspace or upload another file.",
      },
    ],
  })
  void answer.catch(() => {})
  const described = await tool("dock_action_describe", {})
  assert.equal(described.input_artifacts.length, 1, "RETURN_INPUT_COUNT")
  const original = described.input_artifacts[0]
  assert.equal(original.artifact_id, first.artifact, "RETURN_ARTIFACT")
  assert.equal(original.sha256, first.sha256, "RETURN_HASH")
  assert.equal(original.upload.destination, first.destination, "RETURN_DESTINATION")
  const observed = await tool("dock_workspace_observe", { scope: "roots" })
  assert.equal(observed.status, "SUCCEEDED", "RETURN_OBSERVATION")
  assert.equal(observed.output.dom_epoch.document, first.observationDocument, "RETURN_DOCUMENT_EPOCH")
  assert.equal(observed.output.workflow_ref.tab_tid, first.observedWorkflow.tab_tid, "RETURN_WORKFLOW_TAB")
  assert.equal(observed.output.workflow_ref.prefix, first.observedWorkflow.prefix, "RETURN_WORKFLOW_PREFIX")
  state.next.resolve({ finish: true })
  assert.ok(!(await answer).info?.error, "RETURN_CHAT_FAILED")
  const history = await call(`/session/${first.session}/message`, undefined, "GET")
  assert.equal(history.filter((message) => message.info.role === "user").length, 2, "RETURN_SESSION_HISTORY")
  const tracked = descendants(child.pid)
  summary.trackedPids = tracked.map((entry) => entry.pid)
  summary.multichatStatus = "PASS"
  summary.returnToFirst = {
    sameSession: true,
    sameArtifact: true,
    sameHash: true,
    sameDestination: true,
    sameWorkflow: true,
    userMessages: 2,
  }
  summary.lifecycle = { status: "NOT_RUN", actualCmdQTested: false }
  if (!args.lifecycle) return
  // Desktop embeds createLoginomHost in its main process; only CLI has node-host.mjs.
  const desktopHostPid = child.pid
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.close()))
  await new Promise((done) => setTimeout(done, 500))
  assert.equal(child.exitCode, null, "LAST_WINDOW_QUIT_APPLICATION")
  assert.equal(
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    0,
    "WINDOW_STILL_OPEN",
  )
  assert.equal(
    (await call(`/session/${first.session}/message`, undefined, "GET")).filter(
      (message) => message.info.role === "user",
    ).length,
    2,
    "BACKEND_LOST_AFTER_WINDOW_CLOSE",
  )
  process.kill(desktopHostPid, 0)
  const reopened = application.waitForEvent("window", { timeout: 30000 })
  await application.evaluate(({ app }) => app.emit("activate"))
  await reopened
  assert.equal(child.exitCode, null, "ACTIVATE_RESTARTED_PROCESS")
  summary.lifecycle = {
    lastWindowKeepsApp: true,
    backendResponsiveWithoutWindow: true,
    status: "PASS",
    desktopHostPidRetained: desktopHostPid,
    activateRestoresWindow: true,
    method: "Electron BrowserWindow.close and app.emit(activate); actual Cmd+Q not tested",
  }
}

async function tool(name, args) {
  assert.equal(state.pending, undefined, "CONCURRENT_ORACLE_CALL")
  const result = Promise.withResolvers()
  const id = `multichat_${++state.sequence}`
  state.pending = { id, ...result }
  state.next.resolve({ id, name: "loginom_" + name, args })
  let timeout
  try {
    const text = await Promise.race([
      result.promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error(`TOOL_TIMEOUT_${name}`)), 180000)
      }),
    ])
    assert.equal(typeof text, "string", "TOOL_RESULT_TYPE")
    if (text.includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
    await writeFile(join(directory, `tool-${state.sequence}-${name}.txt`), text, { mode: 0o600 })
    return JSON.parse(text.split("\n\n")[0])
  } finally {
    clearTimeout(timeout)
  }
}

function descendants(pid) {
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
      return match ? { pid: Number(match[1]), parent: Number(match[2]), command: match[3] } : undefined
    })
    .filter(Boolean)
  const owned = new Set([pid])
  for (let index = 0; index < rows.length; index++)
    rows.forEach((entry) => {
      if (owned.has(entry.parent)) owned.add(entry.pid)
    })
  return rows.filter((entry) => owned.has(entry.pid) && entry.pid !== pid)
}
