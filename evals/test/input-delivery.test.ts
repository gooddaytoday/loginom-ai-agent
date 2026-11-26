import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseEvents } from "../src/cli"
import { evalsRoot } from "../src/config"
import { prepareJudgeDir } from "../src/judge"
import { loadTasks } from "../src/task"

const age = "age-pressure-correlation"
const cohort = "observed-purchase-cohort-retention-business"
const node = { document_id: "12345678-abcd-4321-8910-123456789012", workflow_id: "12345678-abcd-4321-8910-123456789012-1", node_id: "abcdef01-2345-4678-8910-abcdef012345" }
const artifact_id = "12345678-abcd-4321-8910-123456789013"
const grant_id = "12345678-abcd-4321-8910-123456789014"
const execution_id = `${node.document_id}:141:1`
const success = { result_version: "user-v1", state: "settled", status: "SUCCEEDED", cleanup_complete: true, error: null }

async function judgeEvidence(id: string, change = (calls: Fixture) => {}) {
  const [task] = await loadTasks(path.join(evalsRoot, "tasks", id === cohort ? "analytic-business" : "analytic"), [id])
  const input = id === cohort ? "purchase_lines.csv" : "dataset.csv"
  const file = await Bun.file(path.join(task!.dir, "data", input)).bytes()
  const bytes = file.length
  const sha256 = new Bun.CryptoHasher("sha256").update(file).digest("hex")
  const name = `${"a".repeat(64)}-0-${input}`
  const destination = `/eval-user/${name}`
  const calls: Fixture = {
    prepare: { prepared: true, result_version: "user-v1", input_artifacts: [{ artifact_id, name, bytes, sha256, upload: { grant_id, destination } }] },
    deliver: { ...success, operation_id: "delivery", output: { status: "SUCCEEDED", cleanup_complete: true, upload_operation_id: "delivery:upload", destination, bytes, sha256, upload_completion_verified: true, private_field: "secret-test-value" } },
    readback: { kind: "text_import", node: { ...node }, source: { source_path: destination } },
    execution: { execution_id, status: "completed" },
    output: {
      status: id === cohort ? "complete" : "partial", execution_id,
      ports: [{
        port: 0, fresh: true, execution_id, freshness_basis: "completed_execution_port_source",
        schema: [{ name: "invoice_id", type: "string" }, { name: "customer_id", type: "string" }],
        sample: [[{ type: "string", value: "I08", is_null: false, precision: "source_text" },
          { type: "string", value: null, is_null: true, precision: "exact_null" }]],
      }],
    },
    wait: { ...success, operation_id: "import" },
    extra: "",
    laterReceipts: 0,
  }
  change(calls)
  const tool = (seq: number, tool: string, input: object, output: object) => JSON.stringify({
    type: "tool_use", sessionID: "synthetic-session", part: { type: "tool", id: String(seq), tool: `loginom_dock_${tool}`, state: {
      status: "completed", input, output: JSON.stringify(output), time: { start: seq * 10, end: seq * 10 + 1 },
    } },
  })
  const events = [
    tool(1, "prepare", {}, calls.prepare),
    tool(2, "artifact_deliver", { operation_id: "delivery", artifact_id, upload_grant_id: grant_id }, calls.deliver),
    tool(3, "node_apply", {
      operation_id: "import", document_id: node.document_id, workflow_ref: { workflow_id: node.workflow_id }, target: { kind: "new", type: "imports.text" },
      parameters: { source: { kind: "verified_delivery", artifact_id, upload_operation_id: "delivery:upload" } },
    }, { operation_id: "import", state: "running" }),
    tool(4, "node_wait", { operation_id: "import" }, {
      ...calls.wait, node, configuration: { status: "applied", readback: calls.readback }, execution: calls.execution, output: calls.output,
    }),
    ...Array.from({ length: calls.laterReceipts }, (_, index) =>
      tool(5 + index, "node_wait", { operation_id: "unrelated" }, { detail: "a".repeat(10_000) })),
    JSON.stringify({ type: "tool_use", sessionID: "synthetic-session", part: { type: "tool", tool: "loginom_search",
      state: { status: "completed", output: "Example with {unparseable}" } } }),
    calls.extra,
  ].join("\n")
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-input-delivery-"))
  const artifactDir = path.join(dir, "artifact")
  const judgeDir = path.join(dir, "judge")
  try {
    await mkdir(artifactDir)
    await Bun.write(path.join(dir, "events.jsonl"), events)
    await prepareJudgeDir({ task: task!, artifactDir, prompt: "", dir: judgeDir, run: parseEvents(events), checklist: task!.checklist })
    const evidence = Bun.file(path.join(judgeDir, "input-delivery.json"))
    return { proof: await evidence.exists() ? await evidence.json() : undefined, expected: { input, bytes, sha256, destination, node, execution_id },
      readbacks: await Bun.file(path.join(judgeDir, "node-readbacks.md")).text() }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

type Fixture = {
  prepare: object
  deliver: typeof success & { operation_id: string; output: { status: string; cleanup_complete: boolean; upload_operation_id: string; bytes: number; sha256: string; destination: string; upload_completion_verified: boolean; private_field: string } }
  readback: { kind: string; node: typeof node; source: { source_path: string } }
  execution: { execution_id: string; status: string }
  output: { status: string; execution_id: string; ports: { port: number; fresh: boolean; execution_id: string; freshness_basis: string; schema: { name: string; type: string }[]; sample: { type: string; value: string | null; is_null: boolean; precision: string }[][] }[] }
  wait: { operation_id: string; status: string }
  laterReceipts: number
  extra: string
}

test("judge receives only the corpus-verified delivery bound to the executed age import", async () => {
  const { proof, expected } = await judgeEvidence(age)
  expect(proof).toEqual(expected)
})

test("judge rejects unverified delivery, wrong corpus bytes and foreign import bindings", async () => {
  const wrongDestination = (destination: string) => destination.replace("/eval-user/", "/another-user/")
  for (const change of [
    (calls: Fixture) => { calls.deliver.output.sha256 = "b".repeat(64) },
    (calls: Fixture) => { calls.deliver.output.upload_completion_verified = false },
    (calls: Fixture) => { calls.deliver.output.destination = wrongDestination(calls.deliver.output.destination) },
    (calls: Fixture) => {
      calls.deliver.output.destination = wrongDestination(calls.deliver.output.destination)
      calls.readback.source.source_path = calls.deliver.output.destination
    },
    (calls: Fixture) => { calls.readback.node.node_id = "abcdef01-2345-4678-8910-abcdef012346" },
    (calls: Fixture) => { calls.execution.status = "failed" },
    (calls: Fixture) => { calls.extra = "{malformed json" },
  ]) {
    const { proof } = await judgeEvidence(age, change)
    expect(proof).toBeUndefined()
  }
})

test("judge receives the typed I08 null from the same fresh import even if its general receipt was dropped", async () => {
  const { proof, expected, readbacks } = await judgeEvidence(cohort, calls => { calls.laterReceipts = 10 })
  expect(readbacks).toContain("Отброшено старших квитанций")
  expect(readbacks).not.toContain("I08")
  expect(proof).toEqual({
    ...expected,
    cohort_sample: {
      invoice_id: { type: "string", value: "I08", is_null: false },
      customer_id: { type: "string", value: null, is_null: true, precision: "exact_null" },
    },
  })
})

test("a completed age import can prove execution without reading its output", async () => {
  const { proof, expected } = await judgeEvidence(age, calls => { calls.output.ports = [] })
  expect(proof).toEqual(expected)
})

test("an empty string, failed read, stale output or foreign node cannot prove the cohort null", async () => {
  const empty = (calls: Fixture) => {
    const cell = calls.output.ports[0]!.sample[0]![1]!
    cell.value = ""
    cell.is_null = false
    cell.precision = "source_text"
  }
  for (const change of [
    empty,
    (calls: Fixture) => { calls.output.status = "failed" },
    (calls: Fixture) => { calls.output.ports[0]!.fresh = false },
    (calls: Fixture) => { calls.readback.node.node_id = "abcdef01-2345-4678-8910-abcdef012346" },
  ]) {
    const { proof } = await judgeEvidence(cohort, change)
    expect(proof?.cohort_sample).toBeUndefined()
  }
})
