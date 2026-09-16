import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { inputStore } from "@loginom-ai-agent/loginom-host/inputs"
import { createHash, randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

type Child = Awaited<ReturnType<typeof supervise>>
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
if (!configPath) throw Error("LOGINOM_AI_AGENT_TEST_CONFIG is required")
const config = await Bun.file(configPath).json()
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
const policy = {
  mappings: [],
  finish: "execute",
  read: { ports: [0], sample_rows: 10, require_exact_numbers: true, coverage: "sample" },
  budgets: { configure_ms: 120000, execute_ms: 60000, total_ms: 180000 },
}
console.log(`Private acceptance evidence: ${directory}`)

async function launch(chat: string) {
  return supervise({
    node: join(resources, "bin/node"),
    entry: join(resources, "runtime/src/managed-entry.mjs"),
    resources,
    stateDir: directory,
    generation: 1,
    chat,
    headless: true,
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
  })
}
async function call(child: Child, name: string, args: Record<string, unknown>) {
  const envelope = await child.request("call", { name, arguments: args })
  if (!envelope || typeof envelope !== "object" || !("result" in envelope)) throw Error("REPLY_INVALID")
  const result = CallToolResultSchema.parse(envelope.result)
  const text = JSON.stringify(result)
  if (text.includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
  await Bun.write(join(directory, `${++receipts.sequence}-${name}.json`), text)
  const body =
    result.structuredContent ?? JSON.parse(result.content.find((item: { type: string }) => item.type === "text").text)
  if (result.isError) throw Error(`TOOL_FAILED_${name}`)
  return body
}
async function waitNode(child: Child, operation: string) {
  const deadline = Date.now() + 240_000
  while (Date.now() < deadline) {
    const body = await call(child, "dock_node_wait", { operation_id: operation, timeout_ms: 60_000 })
    if (body.state !== "settled") continue
    if (body.status !== "SUCCEEDED" || body.cleanup_complete !== true) throw Error(`NODE_FAILED_${operation}`)
    return body
  }
  throw Error("NODE_DEADLINE_EXCEEDED")
}
async function clickObserved(child: Child, tid: string, operation: string) {
  const roots = []
  let observation = await call(child, "dock_workspace_observe", { scope: "all" })
  for (let page = 0; page < 40; page++) {
    if (observation.status !== "SUCCEEDED") {
      observation = await call(child, "dock_workspace_observe", { scope: "all" })
      continue
    }
    const output = observation.output
    const element = output.ui.elements.find(
      (item: { tid?: string; allowed_actions?: string[] }) =>
        item.tid === tid && item.allowed_actions?.includes("click"),
    )
    if (element) {
      const clicked = await call(child, "dock_ui_action", {
        observation_id: output.observation_id,
        operation_id: operation,
        action: { verb: "click", ref: element.ref },
      })
      if (clicked.status !== "SUCCEEDED") throw Error("PACKAGE_CLOSE_GESTURE_FAILED")
      await Bun.sleep(600)
      return
    }
    for (const element of output.ui.elements) {
      if (output.observation_kind === "roots" && element.tid && tid.startsWith(element.tid + ";"))
        roots.push({ root_ref: element.ref, observation_id: output.observation_id })
    }
    const ancestor = roots.shift()
    if (ancestor) {
      observation = await call(child, "dock_workspace_observe", ancestor)
      continue
    }
    if (output.page.next_cursor) {
      observation = await call(child, "dock_workspace_observe", { cursor: output.page.next_cursor })
      continue
    }
    const root = roots.shift()
    if (!root) break
    observation = await call(child, "dock_workspace_observe", root)
  }
  throw Error(`PACKAGE_CONTROL_NOT_OBSERVED_${tid}`)
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
async function dataset(label: string, csv: string, expected: { Alpha: number; Beta: number }) {
  const chat = `${run}-${label}`
  const child = await launch(chat)
  try {
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
    const delivery = await call(child, "dock_artifact_deliver", {
      operation_id: `deliver-${label}`,
      artifact_id: artifact.artifact_id,
      upload_grant_id: artifact.upload.grant_id,
      budget_ms: 90000,
    })
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
    await call(child, "dock_node_apply", {
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
            { name: "Value", label: "Value", type: "integer", data_kind: "Непрерывный", used: true },
          ],
        },
      },
    })
    const imported = await waitNode(child, `import-${label}`)
    await call(child, "dock_node_apply", {
      ...identity,
      ...policy,
      operation_id: `group-${label}`,
      target: { kind: "new", type: "transform.group_data", label: `Groups ${label}`, position: { x: 520, y: 160 } },
      inputs: [{ source: imported.node, output: 0, input: 0 }],
      mode: "aggregate",
      parameters: {
        group_by: [{ kind: "input_field", name: "Category" }],
        measures: [{ field: { kind: "input_field", name: "Value" }, function: "sum", name: "Total", label: "Total" }],
      },
    })
    const grouped = await waitNode(child, `group-${label}`)
    const values = verify(grouped, expected)
    const path = `/${config.workflow_profile.loginom_user}/loginom-ai-agent-acceptance-${chat}.lgp`
    const saved = await call(child, "dock_action_run", {
      action_key: "package.save_as",
      operation_id: `save-${label}`,
      parameters: { path, conflict_policy: "fail" },
    })
    if (saved.status !== "SUCCEEDED") throw Error("PACKAGE_NOT_SAVED")
    await clickObserved(child, "MF;cntMain;tlbMainToolbar;btnPackagesMenu", `menu-${label}`)
    await clickObserved(child, "MF;MainMenuForm;btnClosePackage", `close-${label}`)
    const closed = await call(child, "dock_workspace_observe", { scope: "roots" })
    if (closed.output.package_identity?.path === path) throw Error("PACKAGE_STILL_OPEN")
    console.log(JSON.stringify({ status: "PASS", phase: "import_group_save", dataset: label, ...values }))
    return { label, path, node: grouped.node.node_id, expected, source: artifact.upload.destination }
  } finally {
    await child.close()
  }
}
async function reopen(saved: Awaited<ReturnType<typeof dataset>>) {
  const path = join(directory, `saved-${saved.label}.json`)
  await Bun.write(path, JSON.stringify(saved))
  const child = Bun.spawn(
    [
      join(resources, "bin/node"),
      join(import.meta.dir, "cold-readback.mjs"),
      "--config",
      configPath!,
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

const first = await dataset("A", "Category;Value\nAlpha;10\nAlpha;25\nBeta;20\n", { Alpha: 35, Beta: 20 })
await reopen(first)
const second = await dataset("B", "Category;Value\nAlpha;100\nBeta;1\n", { Alpha: 100, Beta: 1 })
if (first.source === second.source) throw Error("SAME_NAME_INPUT_COLLISION")
await reopen(second)
await Bun.write(join(directory, "summary.json"), JSON.stringify({ status: "PASS", first, second }, null, 2))
console.log(
  "PASS: distinct chat inputs named sales.csv; totals 55/101; saved packages independently reopened and verified",
)
