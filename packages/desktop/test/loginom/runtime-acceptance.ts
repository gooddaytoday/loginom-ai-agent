import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { inputStore } from "@loginom-ai-agent/loginom-host/inputs"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { createHash, randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { mkdtemp, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import fixtures from "./fixtures/standalone-cli/manifest.json"

type Child = Pick<Awaited<ReturnType<typeof supervise>>, "request" | "close">
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
if (!configPath) throw Error("LOGINOM_AI_AGENT_TEST_CONFIG is required")
const config = await Bun.file(configPath).json()
const credentialProfile = process.env.LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE
if (credentialProfile) {
  const connection = await Bun.file(join(credentialProfile, "loginom/connection/connection.json")).json()
  const secrets = await cliCredentials("win32").decode(connection.secrets)
  config.api_key = secrets.apiKey
  config.loginom_url = connection.url
  config.workflow_profile = { passwordless_login: secrets.password === "", loginom_user: connection.username }
}
const mcpConfig = process.env.LOGINOM_AI_AGENT_TEST_MCP_CONFIG
if (mcpConfig) {
  const active = await Bun.file(mcpConfig).json()
  config.api_key = active.api_key
  config.loginom_url = active.loginom_url
  config.workflow_profile = { passwordless_login: true, loginom_user: active.user }
}
if (process.env.LOGINOM_AI_AGENT_TEST_API_KEY) config.api_key = process.env.LOGINOM_AI_AGENT_TEST_API_KEY
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const resources = resolve(
  process.env.LOGINOM_AI_AGENT_TEST_RESOURCES ?? join(import.meta.dir, "../../resources/loginom"),
)
const manifest = await Bun.file(join(resources, "resource-manifest.json")).json()
const require = createRequire(join(resources, "runtime/client/package.json"))
const { CallToolResultSchema } = require("@modelcontextprotocol/sdk/types.js")
const directory = await mkdtemp(join(tmpdir(), "loginom-linux-oracle-"))
const run = randomUUID()
const receipts = { sequence: 0 }
const valueField = "amount"
const policy = {
  mappings: [],
  finish: "execute",
  read: { ports: [0], sample_rows: 10, require_exact_numbers: true, coverage: "sample" },
  budgets: { configure_ms: 120000, execute_ms: 60000, total_ms: 180000 },
}
// The user-v1 profile publishes no UI gesture tool, so the package is closed by the
// runtime's own shutdown cleanup. Only the direct runtime transport can request it.
const transport = process.env.LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE
  ? "desktop"
  : process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE
    ? "cli"
    : "runtime"
console.log(`Private acceptance evidence: ${directory}`)

async function launch(chat: string, csv: string, cleanupPackage: string): Promise<Child> {
  if (process.env.LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE) {
    const { desktopOracleTransport } = await import("../../../loginom-host/script/desktop-oracle-transport")
    return desktopOracleTransport({
      executable: process.env.LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE,
      node: join(resources, "bin/node"),
      directory: join(directory, "desktop", chat),
      csv,
      connection: {
        apiKey: config.api_key,
        password: "",
        url: config.loginom_url,
        username: config.workflow_profile.loginom_user,
      },
    })
  }
  if (process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE) {
    const { cliOracleTransport } = await import("../../../loginom-host/script/cli-oracle-transport")
    return cliOracleTransport({
      executable: process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE,
      mode: process.env.LOGINOM_AI_AGENT_TEST_CLI_INTERFACE === "tui" ? "tui" : "run",
      headed: process.env.LOGINOM_AI_AGENT_TEST_CLI_HEADED === "1",
      profile: process.env.LOGINOM_AI_AGENT_TEST_CLI_PROFILE,
      directory: join(directory, "cli", chat),
      csv,
      connection: {
        apiKey: config.api_key,
        password: "",
        url: config.loginom_url,
        username: config.workflow_profile.loginom_user,
      },
    })
  }
  return supervise({
    node: join(resources, "bin/node"),
    entry: join(resources, "runtime/src/managed-entry.mjs"),
    resources,
    stateDir: directory,
    generation: 1,
    chat,
    headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
    connection: {
      generation: 1,
      revision: 1,
      url: config.loginom_url,
      username: config.workflow_profile.loginom_user,
      apiKey: config.api_key,
      password: "",
    },
    endpoint: manifest.endpoint,
    actionManifestUri: manifest.actionManifestUri,
    actionManifestSha256: manifest.actionManifestSha256,
    acceptanceCleanupPackage: cleanupPackage,
  })
}
type ToolResult = { isError?: boolean; structuredContent?: unknown; content: { type: string; text?: string }[] }
async function invoke(child: Child, name: string, args: Record<string, unknown>) {
  const envelope = await child.request("call", { name, arguments: args })
  if (!envelope || typeof envelope !== "object" || !("result" in envelope)) throw Error("REPLY_INVALID")
  const result: ToolResult = CallToolResultSchema.parse(envelope.result)
  const text = JSON.stringify(result)
  if (text.includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
  await Bun.write(join(directory, `${++receipts.sequence}-${name}.json`), text)
  const body = result.structuredContent ?? JSON.parse(result.content.find((item) => item.type === "text")!.text!)
  if (result.isError) throw Error(`TOOL_FAILED_${name}`)
  return { result, body }
}
async function call(child: Child, name: string, args: Record<string, unknown>) {
  return (await invoke(child, name, args)).body
}
// The bridge appends a read-only dirty-state advice block after a confirmed save.
// Desktop/CLI oracle transports forward only the first block, so it may be absent.
function savedPackageState(result: ToolResult, path: string) {
  return result.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => JSON.parse(block.text!))
    .find((value) => value?.kind === "dock_saved_package_state" && value.package_path === path)
}
async function save(child: Child, label: string, path: string) {
  // RC9 user route: checkpoint the open scenario; save_as would reopen the package.
  const saved = await invoke(child, "dock_action_run", {
    action_key: "package.save_checkpoint",
    operation_id: `save-${label}`,
    parameters: { path, conflict_policy: "fail" },
  })
  if (
    saved.body.status !== "SUCCEEDED" ||
    saved.body.output?.package_ref?.path !== path ||
    saved.body.output.save_completed !== true ||
    saved.body.output.workflow_preserved !== true
  )
    throw Error("PACKAGE_NOT_SAVED")
  const state = savedPackageState(saved.result, path)
  if (state?.modified !== true) return `save-${label}`
  // Follow the runtime's own next_step with a new ID; never discard or repeat save_as.
  const next = state.next_step
  if (next?.tool !== "dock_action_run" || next.arguments?.action_key !== "package.save_checkpoint")
    throw Error("PACKAGE_DIRTY_NEXT_STEP_UNEXPECTED")
  const checkpoint = await invoke(child, "dock_action_run", { ...next.arguments, operation_id: `checkpoint-${label}` })
  if (checkpoint.body.status !== "SUCCEEDED" || checkpoint.body.output?.package_ref?.path !== path)
    throw Error("PACKAGE_CHECKPOINT_FAILED")
  if (savedPackageState(checkpoint.result, path)?.modified !== false) throw Error("PACKAGE_DIRTY_STATE_UNVERIFIED")
  return `checkpoint-${label}`
}
// Shutdown cleanup runs inside the managed runtime after its last tool call. Its bound
// receipt is the only evidence that this session closed the package and logged out.
async function packageCleanup(chat: string, path: string, saveOperation: string) {
  if (transport !== "runtime") return { status: "UNVERIFIED", reason: `${transport}_transport_has_no_cleanup_route` }
  const attempts = join(directory, "generations/1/chats", chat, "attempts")
  const names = await readdir(attempts)
  if (names.length !== 1) throw Error("ATTEMPT_DIRECTORY_AMBIGUOUS")
  const file = Bun.file(join(attempts, names[0], "package-cleanup.json"))
  if (!(await file.exists())) throw Error("PACKAGE_CLEANUP_RECEIPT_MISSING")
  const receipt = await file.json()
  if (
    receipt.status !== "SUCCEEDED" ||
    receipt.package_closed !== true ||
    receipt.logged_out !== true ||
    receipt.unsaved_changes_discarded !== false ||
    receipt.package_path !== path ||
    receipt.save_operation_id !== saveOperation
  )
    throw Error(`PACKAGE_NOT_CLOSED_${receipt.status ?? "UNKNOWN"}_${receipt.reason ?? ""}`)
  return receipt
}
async function waitNode(child: Child, operation: string) {
  const deadline = Date.now() + 240_000
  while (Date.now() < deadline) {
    const body = await call(child, "dock_node_wait", { operation_id: operation, timeout_ms: 60_000 })
    if (body.state !== "settled") continue
    return body
  }
  throw Error("NODE_DEADLINE_EXCEEDED")
}
async function applyNode(child: Child, request: Record<string, unknown> & { operation_id: string }) {
  let body = await call(child, "dock_node_apply", request)
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (body.state !== "settled") body = await waitNode(child, request.operation_id)
    if (body.status === "SUCCEEDED" && body.cleanup_complete === true) return body
    if (body.status !== "AMBIGUOUS") break
    // The settled dock_node_wait result is already the required inspection.
    // During an unresolved mutation the dynamic tool gate advertises resume,
    // while an additional status call is intentionally unavailable.
    body = await call(child, "dock_node_resume", request)
  }
  throw Error(`NODE_FAILED_${request.operation_id}`)
}

function verify(
  body: {
    output: {
      ports: Array<{
        row_count: number
        sample_complete: boolean
        precision: { numbers_verified: boolean }
        sample: Array<Array<{ value: string | number }>>
      }>
    }
  },
  expected: { Alpha: number; Beta: number },
) {
  const port = body.output.ports[0]
  const values = Object.fromEntries(port.sample.map((row) => [String(row[0].value), Number(row[1].value)]))
  if (
    port.row_count !== 2 ||
    !port.sample_complete ||
    !port.precision.numbers_verified ||
    values.Alpha !== expected.Alpha ||
    values.Beta !== expected.Beta
  )
    throw Error("SEMANTIC_VALUES_MISMATCH")
  return { groups: values, total: expected.Alpha + expected.Beta }
}
async function dataset(label: "A" | "B") {
  const csv = await Bun.file(join(import.meta.dir, "fixtures/standalone-cli", label, "sales.csv")).text()
  const inputSha256 = createHash("sha256").update(csv).digest("hex")
  if (inputSha256 !== fixtures[label].sha256) throw Error(`FIXTURE_HASH_MISMATCH_${label}`)
  const expected = fixtures[label].expected
  const chat = `${run}-${label}`
  const path = `/${config.workflow_profile.loginom_user}/loginom-ai-agent-acceptance-${chat}.lgp`
  const child = await launch(chat, csv, path)
  const outcome = await (async () => {
    const bytes = Buffer.from(csv)
    const files = await inputStore(join(directory, "inputs")).admit(
      chat,
      "original-user-message",
      [{ name: "sales.csv", data: bytes.toString("base64") }],
      `/${config.workflow_profile.loginom_user}`,
    )
    await child.request("admit", { userMessage: "original-user-message", files })
    const prepared = await call(child, "dock_prepare", { intent: "new_draft", operation_id: `prepare-${label}` })
    if (!prepared.prepared || !prepared.workspace.authenticated || prepared.input_artifacts.length !== 1)
      throw Error("PREPARATION_FAILED")
    const artifact = prepared.input_artifacts[0]
    if (artifact.sha256 !== createHash("sha256").update(bytes).digest("hex"))
      throw Error("ATTACHMENT_IDENTITY_MISMATCH")
    const deliveryOperation = `deliver-${label}`
    let delivery = await call(child, "dock_artifact_deliver", {
      operation_id: deliveryOperation,
      artifact_id: artifact.artifact_id,
      upload_grant_id: artifact.upload.grant_id,
      budget_ms: 90000,
    })
    // A visible Windows browser can lose the immediate upload response after
    // Loginom has accepted it. Inspect and resume the same retained operation;
    // never authorize a replacement upload with a new operation ID.
    for (let attempt = 1; delivery.status === "AMBIGUOUS" && attempt <= 3; attempt++) {
      // The settled delivery result itself is the retained status inspection.
      if (!delivery.output?.inspection_required) break
      delivery = await call(child, "dock_artifact_delivery_resume", {
        operation_id: deliveryOperation,
        resume_id: `${deliveryOperation}-resume-${attempt}`,
        budget_ms: 120000,
      })
    }
    if (
      delivery.status !== "SUCCEEDED" ||
      !delivery.output.upload_completion_verified ||
      delivery.output.sha256 !== artifact.sha256
    )
      throw Error("DELIVERY_NOT_VERIFIED")
    const identity = {
      contract_revision: "1.0.0",
      document_id: prepared.workspace.document_id,
      workflow_ref: { workflow_id: prepared.workspace.workflow_ref.workflow_id },
    }
    const importRequest = {
      ...identity,
      ...policy,
      operation_id: `import-${label}`,
      target: { kind: "new", type: "imports.text", label: `CSV ${label}`, position: { x: 240, y: 160 } },
      inputs: [],
      mode: "delimited",
      parameters: {
        source: { artifact_id: artifact.artifact_id, upload_operation_id: delivery.output.upload_operation_id },
        settings: {
          source: {
            source_path: artifact.upload.destination,
            encoding: "UTF-8",
            rows_to_skip: 0,
            first_line_as_title: true,
          },
          format: { delimiter: ";", decimal_separator: ".", null_marker: "", text_qualifier: '"' },
          columns: [
            { name: "Category", label: "Category", type: "string", data_kind: "Дискретный", used: true },
            { name: valueField, label: valueField, type: "integer", data_kind: "Непрерывный", used: true },
          ],
        },
      },
    }
    const imported = await applyNode(child, importRequest)
    const groupRequest = {
      ...identity,
      ...policy,
      operation_id: `group-${label}`,
      target: { kind: "new", type: "transform.group_data", label: `Groups ${label}`, position: { x: 520, y: 160 } },
      inputs: [{ source: imported.node, output: 0, input: 0 }],
      mode: "aggregate",
      parameters: {
        group_by: [{ kind: "input_field", name: "Category" }],
        measures: [
          { field: { kind: "input_field", name: valueField }, function: "sum", name: "Total", label: "Total" },
        ],
      },
    }
    const grouped = await applyNode(child, groupRequest)
    const values = verify(grouped, expected)
    const saveOperation = await save(child, label, path)
    return { values, saveOperation, node: grouped.node.node_id, source: artifact.upload.destination }
  })().finally(() => child.close())
  const cleanup = await packageCleanup(chat, path, outcome.saveOperation)
  console.log(
    JSON.stringify({
      status: "PASS",
      phase: "import_group_save_close",
      dataset: label,
      ...outcome.values,
      package_close: cleanup.status,
    }),
  )
  return { label, path, node: outcome.node, expected, source: outcome.source, inputSha256, packageClose: cleanup }
}
async function reopen(saved: Awaited<ReturnType<typeof dataset>>) {
  const path = join(directory, `saved-${saved.label}.json`)
  await Bun.write(path, JSON.stringify(saved))
  // The independent reader only needs the Loginom endpoint and passwordless test
  // identity.  Give it an explicit secret-free config instead of persisting the
  // transient API key recovered from DPAPI for the parent acceptance process.
  const coldConfigPath = join(directory, "cold-readback-config.json")
  await Bun.write(
    coldConfigPath,
    JSON.stringify({
      api_key: "acceptance-secret-not-required",
      loginom_url: config.loginom_url,
      workflow_profile: config.workflow_profile,
    }),
  )
  const child = Bun.spawn(
    [
      join(resources, "bin/node"),
      join(import.meta.dir, "cold-readback.mjs"),
      "--config",
      coldConfigPath,
      "--resources",
      resources,
      "--saved",
      path,
      "--output",
      join(directory, `cold-${saved.label}`),
    ],
    { stdout: "inherit", stderr: "inherit" },
  )
  if ((await child.exited) !== 0) throw Error(`INDEPENDENT_READBACK_FAILED_${saved.label}`)
}

const first = await dataset("A")
await reopen(first)
const second = await dataset("B")
if (first.source === second.source) throw Error("SAME_NAME_INPUT_COLLISION")
await reopen(second)
await Bun.write(join(directory, "summary.json"), JSON.stringify({ status: "PASS", first, second }, null, 2))
console.log(
  "PASS: distinct chat inputs named sales.csv; totals 55/101; saved packages independently reopened and verified",
)
