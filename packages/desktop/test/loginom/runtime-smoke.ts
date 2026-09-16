import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { inputStore } from "@loginom-ai-agent/loginom-host/inputs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { createRequire } from "node:module"

// Explicit opt-in: this creates a new unsaved Loginom draft through the real managed tools.
const path = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
if (!path) throw new Error("LOGINOM_AI_AGENT_TEST_CONFIG is required")
const config = await Bun.file(path).json()
if (config.workflow_profile?.passwordless_login !== true) throw new Error("TEST_PASSWORD_UNAVAILABLE")
const resources = resolve(
  process.env.LOGINOM_AI_AGENT_TEST_RESOURCES ?? join(import.meta.dir, "../../resources/loginom"),
)
const manifest = await Bun.file(join(resources, "resource-manifest.json")).json()
const chat = `acceptance-${randomUUID()}`
const directory = await mkdtemp(join(tmpdir(), "loginom-managed-acceptance-"))
try {
  const child = await supervise({
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
  })
  try {
    const bytes = Buffer.from("Category;Value\nAlpha;10\nAlpha;25\nBeta;20\n")
    const files = await inputStore(join(directory, "inputs")).admit(
      chat,
      "original-user-message",
      [{ name: "sales.csv", data: bytes.toString("base64") }],
      `/${config.workflow_profile.loginom_user}`,
    )
    await child.request("admit", { userMessage: "original-user-message", files })
    const envelope = await child.request("call", {
      name: "dock_prepare",
      arguments: { intent: "new_draft", operation_id: "desktop-authenticated-prepare" },
    })
    if (JSON.stringify(envelope).includes(config.api_key)) throw new Error("SECRET_IN_TOOL_RESULT")
    if (!envelope || typeof envelope !== "object" || !("result" in envelope)) throw new Error("PREPARE_INVALID")
    const require = createRequire(join(resources, "runtime/client/package.json"))
    const { CallToolResultSchema } = require("@modelcontextprotocol/sdk/types.js")
    const result = CallToolResultSchema.parse(envelope.result)
    const text = result.content.find((item: { type: string; text?: string }) => item.type === "text")
    if (!text || text.type !== "text") throw new Error("PREPARE_INVALID")
    const prepared = JSON.parse(text.text)
    if (
      !prepared.prepared ||
      prepared.workspace?.authenticated !== true ||
      prepared.workspace.loginom_account !== config.workflow_profile.loginom_user
    )
      throw new Error("MANAGED_BROWSER_AUTH_NOT_PRESERVED")
    if (
      prepared.input_artifacts.length !== 1 ||
      prepared.input_artifacts[0].sha256 !== createHash("sha256").update(bytes).digest("hex")
    )
      throw new Error("TRUSTED_ATTACHMENT_NOT_ADMITTED")
    if (process.env.LOGINOM_AI_AGENT_TEST_SEMANTIC === "1") {
      const artifact = prepared.input_artifacts[0]
      const delivery = await child.request("call", {
        name: "dock_artifact_deliver",
        arguments: {
          operation_id: "deliver-a",
          artifact_id: artifact.artifact_id,
          upload_grant_id: artifact.upload.grant_id,
          budget_ms: 120000,
        },
      })
      if (JSON.stringify(delivery).includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
      await Bun.write("/tmp/loginom-delivery-evidence.json", JSON.stringify({ artifact, delivery }, null, 2))
      const outcome = JSON.parse(CallToolResultSchema.parse((delivery as { result: unknown }).result).content[0].text)
      if (outcome.status !== "SUCCEEDED") {
        const inspection = await child.request("call", {
          name: "dock_operation_inspect",
          arguments: { operation_id: "deliver-a:upload" },
        })
        if (JSON.stringify(inspection).includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
        await Bun.write("/tmp/loginom-delivery-inspection.json", JSON.stringify(inspection, null, 2))
        throw Error("DELIVERY_NOT_VERIFIED")
      }
      const imported = await child.request("call", {
        name: "dock_node_apply",
        arguments: {
          operation_id: "import-a",
          contract_revision: "1.0.0",
          document_id: prepared.workspace.document_id,
          workflow_ref: { workflow_id: prepared.workspace.workflow_ref.workflow_id },
          target: { kind: "new", type: "imports.text", label: "Linux acceptance CSV", position: { x: 240, y: 160 } },
          inputs: [],
          mode: "delimited",
          parameters: {
            source: { artifact_id: artifact.artifact_id, upload_operation_id: outcome.output.upload_operation_id },
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
          mappings: [],
          finish: "execute",
          read: { ports: [0], sample_rows: 10, require_exact_numbers: true, coverage: "sample" },
          budgets: { configure_ms: 120000, execute_ms: 60000, total_ms: 180000 },
        },
      })
      if (JSON.stringify(imported).includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
      await Bun.write("/tmp/loginom-import-evidence.json", JSON.stringify(imported, null, 2))
      const completion = await child.request("call", {
        name: "dock_node_wait",
        arguments: { operation_id: "import-a", timeout_ms: 60000 },
      })
      if (JSON.stringify(completion).includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
      await Bun.write("/tmp/loginom-import-completion.json", JSON.stringify(completion, null, 2))
      const importedResult = CallToolResultSchema.parse((completion as { result: unknown }).result)
      const importedBody = importedResult.structuredContent ?? JSON.parse(importedResult.content[0].text)
      if (importedBody.status !== "SUCCEEDED" || importedBody.state !== "settled" || importedResult.isError)
        throw Error("IMPORT_NOT_VERIFIED")
      const grouped = await child.request("call", {
        name: "dock_node_apply",
        arguments: {
          operation_id: "group-a",
          contract_revision: "1.0.0",
          document_id: prepared.workspace.document_id,
          workflow_ref: { workflow_id: prepared.workspace.workflow_ref.workflow_id },
          target: {
            kind: "new",
            type: "transform.group_data",
            label: "Linux acceptance groups",
            position: { x: 520, y: 160 },
          },
          inputs: [{ source: importedBody.node, output: 0, input: 0 }],
          mode: "aggregate",
          parameters: {
            group_by: [{ kind: "input_field", name: "Category" }],
            measures: [
              { field: { kind: "input_field", name: "Value" }, function: "sum", name: "Total", label: "Total" },
            ],
          },
          mappings: [],
          finish: "execute",
          read: { ports: [0], sample_rows: 10, require_exact_numbers: true, coverage: "sample" },
          budgets: { configure_ms: 120000, execute_ms: 60000, total_ms: 180000 },
        },
      })
      if (JSON.stringify(grouped).includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
      const groups = await child.request("call", {
        name: "dock_node_wait",
        arguments: { operation_id: "group-a", timeout_ms: 60000 },
      })
      if (JSON.stringify(groups).includes(config.api_key)) throw Error("SECRET_IN_TOOL_RESULT")
      await Bun.write("/tmp/loginom-group-completion.json", JSON.stringify(groups, null, 2))
      const groupResult = CallToolResultSchema.parse((groups as { result: unknown }).result)
      const groupBody = groupResult.structuredContent ?? JSON.parse(groupResult.content[0].text)
      if (groupBody.status !== "SUCCEEDED" || groupBody.state !== "settled" || groupResult.isError)
        throw Error("GROUP_NOT_VERIFIED")
      const port = groupBody.output.ports[0]
      const values = Object.fromEntries(
        port.sample.map((row: { value: string }[]) => [row[0].value, Number(row[1].value)]),
      )
      if (
        port.row_count !== 2 ||
        !port.sample_complete ||
        !port.precision.numbers_verified ||
        values.Alpha !== 35 ||
        values.Beta !== 20
      )
        throw Error("GROUP_VALUES_INVALID")
      console.log(
        JSON.stringify({
          status: "PASS",
          scope: "real_csv_import_and_group",
          groups: values,
          total: Number(values.Alpha) + Number(values.Beta),
        }),
      )
    }
    console.log(
      JSON.stringify({
        status: "PASS",
        scope: "managed_private_login_and_prepare",
        authenticated: true,
        trustedAttachment: true,
        createdDraft: prepared.workspace.created_draft,
        catalogSha256: manifest.actionManifestSha256,
        resourceManifest: child.ready.manifestHash,
        headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
      }),
    )
  } finally {
    await child.close()
  }
} finally {
  if (process.env.LOGINOM_AI_AGENT_KEEP_TEST_STATE === "1") console.log(`Private test diagnostics: ${directory}`)
  else await rm(directory, { recursive: true, force: true })
}
