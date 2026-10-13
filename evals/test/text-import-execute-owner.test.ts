import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { validateNodeAttempt, validateNodeRun } from "../src/node-evals"
import { collectTextImportEvidence } from "../src/text-import"

// Exact author regression bodies; fixture input location differs in this isolated support.
async function positiveFixture(id = "txt-comma-utf8") {
  const root = await mkdtemp(path.join(os.tmpdir(), "text-import-table-"))
  const task = path.join(root, id), attempt = path.join(root, "attempt")
  await cp(path.join(evalsRoot, "test/fixtures/text-import-native", id), task, { recursive: true })
  const spec = await Bun.file(path.join(task, "SPEC.json")).json()
  const expected = spec.oracle_recipe.length ? await Bun.file(path.join(task, spec.oracle_recipe[0].expected)).json()
    : { schema: spec.columns, row_count: 0, rows: [] }
  const file = spec.inputs[0], destination = `/eval/${path.basename(file.path)}`
  const node = { document_id: "doc", workflow_id: "flow", node_id: "node" }
  const workspace = { status: "READY", ownership_verified: true, loginom_account: "eval",
    document_id: "doc", workflow_ref: { workflow_id: "flow" } }
  const settings = { ...spec.settings, source: { ...spec.settings.source, source_path: destination }, columns: spec.columns }
  const executionId = "doc:145:1"
  const port = { port: 0, port_guid: "port", fresh: true, execution_id: executionId, schema: expected.schema,
    row_count: expected.row_count, sample_rows: expected.row_count, sample_complete: true,
    precision: { numbers_verified: true, limitations: [] },
    sample: expected.rows.map((row: { type: string; value: string | null }[]) => row.map(cell =>
      ({ ...cell, is_null: cell.value === null, ...(cell.type === "real" && cell.value !== null ? { decimal: cell.value } : {}) }))) }
  const output = { operation_id: "import", state: "settled", status: "SUCCEEDED", cleanup_complete: true,
    node, execution: { status: "completed", execution_id: executionId },
    configuration: { status: "applied", readback: { kind: "text_import", values_are: "observed_ui_values", node,
      ...settings, output_mapping: { fields: spec.columns.map((c: { name: string }) => ({ ...c, source_name: c.name })) } } },
    output: { status: "complete", execution_id: executionId, ports: [port] } }
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
    { operation_id: "import", phase: "node_target_checkpoint", target_state: { completed: true, targetId: node.node_id,
      result: { status: "SUCCEEDED", created: true, node: { ref: node, type: "imports.text" } }, final_graph: graph } },
    { operation_id: "import", phase: "node_phase_completed", receipt: { phase: "target", status: "verified", receipt_id: "import:target",
      value: { verified: true, cleanup_complete: true, node } } },
    { operation_id: "import", phase: "node_phase_completed", receipt: { phase: "configure", status: "verified", receipt_id: "import:configure",
      value: { verified: true, cleanup_complete: true, source: { fields: fields(settings.source) }, format: { fields: fields(settings.format) },
        columns: spec.columns.map((c: Record<string, unknown>, i: number) => ({ ...c, index: i, status: "observed" })) } } },
    { operation_id: "import", phase: "node_phase_completed", receipt: { phase: "finish", status: "verified", receipt_id: "import:finish",
      value: { verified: true, cleanup_complete: true, mode: "execute", execution_started: true, execution_id: executionId,
        execution_group: { node, root_id: "145", group_id: "1", group_record_id: "322", execution_id: executionId } } } },
    { operation_id: "import", phase: "node_phase_completed", receipt: { phase: "execute", status: "verified", receipt_id: "import:execute",
      value: { verified: true, cleanup_complete: true, status: "completed", owner_verified: true,
        execution_id: executionId, group_id: "1", process_id: "1.1", process_record_id: "323" } } },
    { operation_id: "import", phase: "node_checkpoint", result: output },
  ]
  const profile = path.join(root, "profile"), archive = profile + ".history/run/1"
  const journal = path.join(archive, "loginom/runtime/generations/1/chats/c/attempts/a/execution-events.jsonl")
  await Bun.write(path.join(attempt, "cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, stages: [
    { stage: "profile_history", status: "confirmed", path: archive }] }))
  async function write() {
    await Bun.write(path.join(attempt, "events.jsonl"), calls.map((call, i) => JSON.stringify({ type: "tool_use", part: { id: `call-${i}`, tool: call.tool,
      state: { status: "completed", input: call.input, output: JSON.stringify(call.output), time: { start: i * 10, end: i * 10 + 1 } } } })).join("\n") + "\n")
    await Bun.write(journal, events.map(event => JSON.stringify({ session_id: "fixture-session", runtime_revision: "fixture-runtime",
      manifest_sha256: "a".repeat(64), ...event })).join("\n") + "\n")
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

// Behavior fixtures reproduce Ben's mutations; none is a live run/completion proof.
for (const id of ["txt-comma-utf8", "csv-comma-utf8", "txt-semicolon-cp1251-decimal", "csv-pipe-multiline", "tsv-utf8", "tsv-utf16le"]) {
  for (const mutation of ["owner-false", "missing-execute"]) {
    test(`${id} rejects native ${mutation} in warm and full-run gates`, async () => {
      const f = await positiveFixture(id)
      try {
        expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
        if (mutation === "owner-false") f.events[4]!.receipt!.value.owner_verified = false
        if (mutation === "missing-execute") f.events.splice(4, 1)
        await f.write()
        const warm = await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")
        expect(warm.errors).toEqual([])
        expect(warm.failures.join(" ")).toContain("native: execute")
        const run = path.join(f.root, "offline-run"), target = path.join(run, id, "1")
        await cp(f.attempt, target, { recursive: true })
        const cleanup = await Bun.file(path.join(target, "cleanup.json")).json()
        cleanup.processes = { status: "confirmed" }
        cleanup.stages.push(...["processes", "diagnostics", "writer", "ready"].map(stage => ({ stage, status: "confirmed" })))
        await Bun.write(path.join(target, "cleanup.json"), JSON.stringify(cleanup))
        await Bun.write(path.join(run, "summary.json"), JSON.stringify({ config: { repeat: 1 }, storage_leftovers: [],
          tasks: [{ id, attempts: [{ attempt: 1, status: "completed", package_path: "/eval/result.lgp", environment_cleanup: { status: "confirmed" } }] }] }))
        expect(await validateNodeRun(run, [id], f.root)).toMatchObject({ verdict: "FAIL", code: 1, errors: [] })
      } finally { await rm(f.root, { recursive: true, force: true }) }
    })
  }
}

test("native execute owner binds unique target and finish execution lineage", async () => {
  const f = await positiveFixture()
  try {
    const original = structuredClone(f.events)
    for (const mutation of [
      () => { f.events[4]!.receipt!.value.owner_verified = undefined },
      () => { f.events[4]!.receipt!.value.verified = false },
      () => { f.events[4]!.receipt!.value.cleanup_complete = false },
      () => { f.events[4]!.receipt!.value.execution_id = "doc:145:9" },
      () => { f.events[4]!.receipt!.value.group_id = "9" },
      () => { f.events[4]!.receipt!.value.process_id = "9.1" },
      () => { f.events[4]!.receipt!.value.process_record_id = "" },
      () => { f.events[4]!.receipt!.receipt_id = "foreign:execute" },
      () => { f.events[4]!.operation_id = "foreign" },
      () => { f.events.push(structuredClone(f.events[4]!)) },
      () => { f.events[3]!.receipt!.value.execution_id = "doc:145:9" },
      () => { f.events[3]!.receipt!.value.execution_group!.node.node_id = "other" },
      () => { f.events[3]!.receipt!.value.execution_group!.root_id = "999" },
      () => { f.events[3]!.receipt!.value.execution_group!.group_record_id = "" },
      () => { f.events[1]!.receipt!.value.node!.document_id = "foreign" },
      () => { f.events[1]!.receipt!.value.node!.workflow_id = "foreign" },
      () => { f.events[1]!.receipt!.value.node!.node_id = "foreign" },
      () => { f.events[1]!.receipt!.status = "unverified" },
      () => { f.events.push(structuredClone(f.events[1]!)) },
      () => { f.events.push(structuredClone(f.events[3]!)) },
    ]) {
      f.events.splice(0, f.events.length, ...structuredClone(original))
      mutation(); await f.write()
      const result = await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")
      expect(result.errors).toEqual([])
      expect(result.failures.join(" ")).toContain("native:")
    }
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

