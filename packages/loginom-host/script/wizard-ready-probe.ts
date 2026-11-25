import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { LoginomHost } from "../src/adapter"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { SessionV1 } from "../src/session-v1"

// B6.1-A probe, no model: the model-free front of parallel-calls-live.ts, reduced to timing the first imports.text
// dock_node_apply (open the wizard, wait for "prepared import source wizard initialized") against the live stand.
// PROBE_HEADLESS=0 launches a visible browser (run under xvfb-run). Prints one PROBE_RESULT JSON line.
const headless = process.env.PROBE_HEADLESS !== "0"
const probeStart = performance.now()
const marks: Record<string, number> = {}
const mark = (name: string) => (marks[name] = Math.round(performance.now() - probeStart))

const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
const resourcePath = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
if (!configPath || !resourcePath) throw Error("TEST_CONFIG_AND_RESOURCES_REQUIRED")
const config = await Bun.file(configPath).json()
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const resources = resolve(resourcePath)
const directory = await mkdtemp(join(tmpdir(), "loginom-wizard-probe-"))
const session = randomUUID()
const chat = createHash("sha256").update(session).digest("hex")
const root = join(directory, "profile")
const connection = {
  generation: 1,
  revision: 1,
  url: config.loginom_url as string,
  username: config.workflow_profile.loginom_user as string,
  apiKey: "",
  password: "",
}
const store = connectionStore(join(root, "connection"), credentials("linux"))
await store.stage(connection)
await store.activate(1)
const host = await createLoginomHost({ root, resources, codec: credentials("linux"), headless })
const requests = new EventEmitter()
const replies = new EventEmitter()
const port = loginomHostPort(
  {
    postMessage: (value) => replies.emit("message", { data: value }),
    on: requests.on.bind(requests),
    start() {},
  },
  host,
)
LoginomHost.connect({
  postMessage: (value) => requests.emit("message", { data: value }),
  on: replies.on.bind(replies),
  start() {},
})
try {
  // marks are printed on failure too
  await host.settled()
  mark("host_settled")
  const run = await LoginomHost.acquire(session)
  mark("acquired")
  await host.runtime(1, chat)
  // Scope bind and tool catalog are required before admit/call (the older parallel-calls-live.ts predates them).
  await run.scope("bind", { taskMessageID: SessionV1.MessageID.make("msg_original"), profile: "loginom-automation" })
  await run.tools()
  mark("scoped")
  assert.ok(run)
  const bytes = Buffer.from("product,revenue\nA,80\nB,15\nC,5\n")
  mark("pre_admit")
  await run.admit("original", [{ name: "probe.csv", data: bytes.toString("base64") }])
  const invoke = async (name: string, args: unknown) => {
    const result = (await run.call(name, args, "original")) as { content: { type: string; text?: string }[] }
    const text = result.content.find((block) => block.type === "text")?.text
    assert.ok(text)
    return JSON.parse(text) as Record<string, any>
  }
  const prepared = await invoke("dock_prepare", { intent: "new_draft", operation_id: "prepare-probe" })
  mark("prepared")
  await run.tools()
  const artifact = prepared.input_artifacts[0]
  const delivered = await invoke("dock_artifact_deliver", {
    operation_id: "deliver-probe",
    artifact_id: artifact.artifact_id,
    upload_grant_id: artifact.upload.grant_id,
    budget_ms: 90000,
  })
  mark("delivered")
  await invoke("dock_action_describe", { node_types: ["imports.text"], modes: ["delimited"] })
  mark("described")
  let node = await invoke("dock_node_apply", {
    operation_id: "import-probe",
    contract_revision: "1.0.0",
    document_id: prepared.workspace.document_id,
    workflow_ref: { workflow_id: prepared.workspace.workflow_ref.workflow_id },
    target: { kind: "new", type: "imports.text", label: "Probe CSV" },
    inputs: [],
    mode: "delimited",
    // The same call shape the model sent in B6.1-A r1/r2 (verified_delivery source, delimited settings).
    parameters: {
      source: {
        kind: "verified_delivery",
        artifact_id: artifact.artifact_id,
        upload_operation_id: delivered.output?.upload_operation_id,
        bytes: delivered.output?.bytes,
        sha256: delivered.output?.sha256,
      },
      settings: {
        source: { source_path: delivered.output?.destination, encoding: "UTF-8", rows_to_skip: 0, first_line_as_title: true },
        format: {
          delimiter: ",",
          decimal_separator: ".",
          null_marker: "",
          text_qualifier: '"',
          auto_detect_columns: "new",
        },
      },
    },
    finish: "execute",
    read: { ports: [0], sample_rows: 100, require_exact_numbers: true },
  })
  mark("apply_returned")
  for (let attempt = 0; node.state !== "settled" && attempt < 4; attempt++)
    node = await invoke("dock_node_wait", { operation_id: "import-probe", timeout_ms: 60000 })
  mark("apply_settled")
  console.log(
    "PROBE_RESULT " +
      JSON.stringify({ headless, marks, status: node.status, error: JSON.stringify(node.error ?? null).slice(0, 300) }),
  )
  await run.release()
} catch (error) {
  console.log("PROBE_FAIL " + JSON.stringify({ headless, marks, error: String(error).slice(0, 200) }))
  process.exitCode = 1
} finally {
  LoginomHost.disconnect()
  await port.close()

  await host.close()
}
