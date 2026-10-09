import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { validateNodeAttempt } from "../src/node-evals"
import { collectTextImportEvidence } from "../src/text-import"

async function rejectionFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "text-import-refusal-"))
  const task = path.join(root, "txt-ambiguous-headers"), attempt = path.join(root, "attempt")
  await cp(path.join(evalsRoot, "drafts/text-import/txt-ambiguous-headers"), task, { recursive: true })
  const spec = await Bun.file(path.join(task, "SPEC.json")).json()
  const file = spec.inputs[0], destination = "/eval/ambiguous_headers.txt"
  const workspace = { status: "READY", ownership_verified: true, loginom_account: "eval",
    document_id: "doc", workflow_ref: { workflow_id: "flow" } }
  const artifact = { artifact_id: "file", name: path.basename(file.path), bytes: file.bytes, sha256: file.sha256,
    upload: { grant_id: "grant", destination } }
  const calls = [
    { tool: "loginom_dock_prepare", input: {}, output: { workspace, input_artifacts: [artifact] } },
    { tool: "loginom_dock_artifact_deliver", input: { artifact_id: "file", upload_grant_id: "grant" },
      output: { status: "SUCCEEDED", cleanup_complete: true, output: { artifact_id: "file", destination,
        bytes: file.bytes, sha256: file.sha256, upload_operation_id: "upload", upload_completion_verified: true, cleanup_complete: true } } },
    { tool: "loginom_dock_node_apply", input: { operation_id: "reject", document_id: "doc", workflow_ref: { workflow_id: "flow" },
      target: { kind: "new", type: "imports.text" }, mode: "delimited", finish: "execute", inputs: [],
      parameters: { source: { artifact_id: "file", upload_operation_id: "upload" },
        settings: { ...spec.settings, source: { ...spec.settings.source, source_path: destination }, columns: spec.columns } } },
      output: { operation_id: "reject", state: "settled", status: "NOT_APPLIED", action_key: "request.validate",
        phase: "request_rejected", request_rejected: true, effect_possible: false, cleanup_complete: true,
        error: { code: "REQUEST_REJECTED", message: "Duplicate source column names" } } },
  ]
  async function write() {
    await Bun.write(path.join(attempt, "events.jsonl"), calls.map((call, i) => JSON.stringify({ type: "tool_use",
      part: { id: `call-${i}`, tool: call.tool, state: { status: "completed", input: call.input,
        output: JSON.stringify(call.output), time: { start: i * 10, end: i * 10 + 1 } } } })).join("\n") + "\n")
  }
  await write()
  return { root, task, attempt, calls, write }
}

test("text import request validation can PASS without a fictitious package and detects changed source/refusal", async () => {
  const f = await rejectionFixture()
  try {
    expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    f.calls[1]!.output.output!.sha256 = "0".repeat(64)
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("source")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

async function positiveFixture(id = "txt-comma-utf8") {
  const root = await mkdtemp(path.join(os.tmpdir(), "text-import-table-"))
  const task = path.join(root, id), attempt = path.join(root, "attempt")
  await cp(path.join(evalsRoot, "drafts/text-import", id), task, { recursive: true })
  const spec = await Bun.file(path.join(task, "SPEC.json")).json()
  const expected = spec.oracle_recipe.length ? await Bun.file(path.join(task, spec.oracle_recipe[0].expected)).json()
    : { schema: spec.columns, row_count: 0, rows: [] }
  const file = spec.inputs[0], destination = `/eval/${path.basename(file.path)}`
  const node = { document_id: "doc", workflow_id: "flow", node_id: "node" }
  const workspace = { status: "READY", ownership_verified: true, loginom_account: "eval",
    document_id: "doc", workflow_ref: { workflow_id: "flow" } }
  const settings = { ...spec.settings, source: { ...spec.settings.source, source_path: destination }, columns: spec.columns }
  const port = { port: 0, port_guid: "port", fresh: true, execution_id: "execution", schema: expected.schema,
    row_count: expected.row_count, sample_rows: expected.row_count, sample_complete: true,
    precision: { numbers_verified: true, limitations: [] },
    sample: expected.rows.map((row: { type: string; value: string | null }[]) => row.map(cell =>
      ({ ...cell, is_null: cell.value === null, ...(cell.type === "real" && cell.value !== null ? { decimal: cell.value } : {}) }))) }
  const output = { operation_id: "import", state: "settled", status: "SUCCEEDED", cleanup_complete: true,
    node, execution: { status: "completed", execution_id: "execution" },
    configuration: { status: "applied", readback: { kind: "text_import", values_are: "observed_ui_values", node,
      ...settings, output_mapping: { fields: spec.columns.map((c: { name: string }) => ({ ...c, source_name: c.name })) } } },
    output: { status: "complete", execution_id: "execution", ports: [port] } }
  const apply = { tool: "loginom_dock_node_apply", input: { operation_id: "import", document_id: "doc", workflow_ref: { workflow_id: "flow" },
    target: { kind: "new", type: "imports.text" }, mode: "delimited", finish: "execute", inputs: [],
    parameters: { source: { artifact_id: "file", upload_operation_id: "upload" }, settings } }, output }
  const calls = [
    { tool: "loginom_dock_prepare", input: {}, output: { workspace, input_artifacts: [
      { artifact_id: "file", name: path.basename(file.path), bytes: file.bytes, sha256: file.sha256, upload: { grant_id: "grant", destination } }] } },
    { tool: "loginom_dock_artifact_deliver", input: { artifact_id: "file", upload_grant_id: "grant" }, output: { status: "SUCCEEDED", cleanup_complete: true,
      output: { artifact_id: "file", bytes: file.bytes, sha256: file.sha256, destination, upload_operation_id: "upload", upload_completion_verified: true, cleanup_complete: true } } },
    apply,
    { tool: "loginom_dock_action_run", input: { action_key: "package.save_checkpoint", parameters: { path: "/eval/result.lgp" } },
      output: { status: "SUCCEEDED", cleanup_complete: true, output: { save_completed: true, workflow_preserved: true,
        package_ref: { path: "/eval/result.lgp", active_identity: "/eval/result.lgp" } } } },
  ]
  const graph = { complete: true, nodes: [{ ref: node, type: "imports.text", inputs: [], outputs: [0] }], links: [] }
  const fields = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { status: "observed", value: v }]))
  const events = [
    { operation_id: "import", phase: "node_target_checkpoint", target_state: { completed: true, result: { created: true }, final_graph: graph } },
    { operation_id: "import", phase: "node_phase_completed", receipt: { phase: "configure", status: "verified", receipt_id: "import:configure",
      value: { verified: true, cleanup_complete: true, source: { fields: fields(settings.source) }, format: { fields: fields(settings.format) },
        columns: spec.columns.map((c: Record<string, unknown>, i: number) => ({ ...c, index: i, status: "observed" })) } } },
    { operation_id: "import", phase: "node_checkpoint", result: output },
  ]
  const profile = path.join(root, "profile"), archive = profile + ".history/run/1"
  const journal = path.join(archive, "loginom/runtime/generations/1/chats/c/attempts/a/execution-events.jsonl")
  await Bun.write(path.join(attempt, "cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, stages: [
    { stage: "profile_history", status: "confirmed", path: archive }] }))
  async function write() {
    await Bun.write(path.join(attempt, "events.jsonl"), calls.map((call, i) => JSON.stringify({ type: "tool_use", part: { id: `call-${i}`, tool: call.tool,
      state: { status: "completed", input: call.input, output: JSON.stringify(call.output), time: { start: i * 10, end: i * 10 + 1 } } } })).join("\n") + "\n")
    await Bun.write(journal, events.map(event => JSON.stringify(event)).join("\n") + "\n")
    await collectTextImportEvidence(attempt, profile)
  }
  await write()
  const pack = Bun.spawn(["python3", "-c", `import pathlib,zipfile,sys
p=pathlib.Path(sys.argv[1]);data=b'<Root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><WorkFlow><Nodes><Item Guid="node"><Component><Engine xsi:type="TBGImportTextFile" FileName="${destination}" /></Component><InputPorts/><OutputPorts><Item Guid="port" Name="DataSource"/></OutputPorts></Item></Nodes><Links/></WorkFlow></Root>'
(p/'unpacked/Unit_1').mkdir(parents=True);(p/'unpacked/Unit_1/Unit.xml').write_bytes(data)
with zipfile.ZipFile(p/'package.lgp','w') as z:z.writestr('Unit_1/Unit.xml',data)`, path.join(attempt, "artifact")], { stdout: "pipe", stderr: "pipe" })
  expect(await pack.exited).toBe(0)
  return { root, task, attempt, calls, apply, output, port, events, write }
}

test("text import checks full typed warm data and raw native settings", async () => {
  const f = await positiveFixture()
  try {
    expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
    f.port.sample[0][0].value = "1"
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).failures.join(" ")).toContain("VALUES")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("text import preserves a known first refusal and corrects the same GUID exactly once", async () => {
  const f = await positiveFixture("csv-delimiter-correction")
  try {
    const original = JSON.parse(JSON.stringify(f.calls[2]))
    original.input.operation_id = "refused"
    original.input.parameters.settings.format.delimiter = ","
    original.output = { operation_id: "refused", state: "settled", status: "FAILED", cleanup_complete: true,
      node: f.output.node, execution: { status: "not_requested", execution_id: null },
      error: { code: "NODE_APPLY_STOPPED", message: "Requested column count 5 differs from observed 1" } }
    f.calls.splice(2, 0, original)
    const corrected = f.apply
    Object.assign(corrected.input, { target: { kind: "existing", type: "imports.text", ref: f.output.node } })
    f.events[0]!.operation_id = "refused"
    f.events.push(JSON.parse(JSON.stringify({ operation_id: "refused", phase: "node_phase_refused",
      receipt: { phase: "configure", status: "FAILED", verification: "text_import_binding_draft_discarded",
        effect_possible: true, cleanup_complete: true, settings_unchanged: true,
        proof: { closed: { verified: true, cleanup_complete: true, draft_discarded: true, settings_applied: false,
          execution_started: false, node_context: { ...f.output.node, verified: true, surface: "graph", locked: false } } } } })))
    await f.write()
    expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
    Object.assign(corrected.input.target, { ref: { ...f.output.node, node_id: "other" } })
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).failures.join(" ")).toContain("same")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("incomplete initial settings pass only with a native discarded draft and no Execute", async () => {
  const f = await positiveFixture("initial-incomplete-settings")
  try {
    delete f.apply.input.parameters.settings.columns
    Object.assign(f.output, { status: "FAILED", configuration: {}, execution: { status: "not_requested", execution_id: null },
      error: { code: "NODE_APPLY_STOPPED", message: "Initial settings require columns" } })
    f.events.splice(1)
    f.events.push(JSON.parse(JSON.stringify({ operation_id: "import", phase: "node_phase_refused", receipt: {
      phase: "configure", status: "FAILED", verification: "text_import_initial_settings_draft_discarded",
      cleanup_complete: true, settings_unchanged: true, proof: { closed: { verified: true, cleanup_complete: true,
        draft_discarded: true, settings_applied: false, execution_started: false,
        node_context: { ...f.output.node, verified: true, surface: "graph", locked: false } } } } })))
    await rm(path.join(f.attempt, "artifact"), { recursive: true })
    await f.write()
    expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    f.events.push(JSON.parse(JSON.stringify({ operation_id: "import", phase: "node_step_prepared", action: { verb: "execute_wizard" } })))
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("Execute")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("damaged Unicode may be diagnosed after a full read without inventing a native warning", async () => {
  const f = await positiveFixture("txt-wrong-encoding")
  try {
    const spec = await Bun.file(path.join(f.task, "SPEC.json")).json()
    f.port.schema = spec.columns
    f.port.row_count = 1; f.port.sample_rows = 1
    f.port.sample = [[{ type: "string", value: "1", is_null: false }, { type: "string", value: "������", is_null: false }]]
    await f.write()
    const file = path.join(f.attempt, "events.jsonl")
    const original = await Bun.file(file).text()
    await Bun.write(file, original + JSON.stringify({ type: "text", part: { text: "Обнаружена утрата Unicode; импорт повреждён и не проверен как корректный." } }) + "\n")
    expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    await Bun.write(file, original + JSON.stringify({ type: "text", part: { text: "Импорт корректен." } }) + "\n")
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("diagnosed")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
