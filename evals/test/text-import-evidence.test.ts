import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { validateNodeAttempt, validateNodeRun } from "../src/node-evals"
import { collectTextImportEvidence } from "../src/text-import"
import { prepareTextImportCold, validateTextImportCold } from "../src/text-import-cold"
import { finalizeTextImportCase } from "../src/text-import-finalize"
import importCases from "../src/text-import-cases.json"
import cliPins from "../script/text-import-cold/cli-pins.json"

async function rejectionFixture(id = "txt-ambiguous-headers") {
  const root = await mkdtemp(path.join(os.tmpdir(), "text-import-refusal-"))
  const task = path.join(root, id), attempt = path.join(root, "attempt")
  await cp(path.join(evalsRoot, "drafts/text-import", id), task, { recursive: true })
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
  async function write(report = "Запрос отклонён: Duplicate source column names.") {
    await Bun.write(path.join(attempt, "events.jsonl"), calls.map((call, i) => JSON.stringify({ type: "tool_use",
      part: { id: `call-${i}`, tool: call.tool, state: { status: "completed", input: call.input,
        output: JSON.stringify(call.output), time: { start: i * 10, end: i * 10 + 1 } } } })).join("\n") + "\n" +
        JSON.stringify({ type: "text", part: { text: report } }) + "\n")
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

test("finalization admits a checked diagnostic without a reference and never overwrites a collection case", async () => {
  const f = await rejectionFixture()
  try {
    const collection = path.join(f.root, "final")
    await finalizeTextImportCase(f.task, f.attempt, collection)
    expect(await Bun.file(path.join(collection, "txt-ambiguous-headers/reference.lgp")).exists()).toBe(false)
    expect(await Bun.file(path.join(collection, "txt-ambiguous-headers/provenance.json")).json()).toMatchObject({ case_id: "txt-ambiguous-headers", outcome: "diagnostic", warm: "PASS", cold: "NOT_APPLICABLE" })
    await expect(finalizeTextImportCase(f.task, f.attempt, collection)).rejects.toThrow()
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
    const receipt: { status: string; error?: { message: string } } = output
    if (receipt.status === "FAILED" && receipt.error) {
      const file = path.join(attempt, "events.jsonl")
      await Bun.write(file, await Bun.file(file).text() + JSON.stringify({ type: "text", part: {
        text: `Импорт отклонён: ${receipt.error.message}` } }) + "\n")
    }
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

test("text import checks full typed warm data and raw native settings", async () => {
  const f = await positiveFixture()
  try {
    expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
    f.port.sample[0][0].value = "1"
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).failures.join(" ")).toContain("VALUES")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

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

// The port/socket structure is copied from the original LAB-57 reference XML.
// These synthetic mutations test the checker; they are not live evidence.
async function structuralImportPackage(f: Awaited<ReturnType<typeof positiveFixture>>, mutation = "") {
  const pack = Bun.spawn(["python3", "-c", `import pathlib,zipfile,sys,xml.etree.ElementTree as E
p=pathlib.Path(sys.argv[1]);mutation=sys.argv[2];destination=sys.argv[3]
root=E.fromstring('<Root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><WorkFlow><Nodes><Item Guid="node"><Component><Engine xsi:type="TBGImportTextFile"/><InputSockets><Item Guid="connection" Name="Connection"><Socket xsi:type="TBGConnectionInputSocket" Virgin="true"><Constraints/></Socket></Item><Item Guid="control" Name="ControlVariables"><Socket xsi:type="TBGTuneVariablesSocket" Virgin="true"><Constraints/><Variables SyncThroughVariables="true"><Elements/></Variables></Socket></Item></InputSockets></Component><InputPorts><Item Guid="connection" Name="Connection"/><Item Guid="control" Name="ControlVariables"/></InputPorts><ServiceInputPorts><Item Guid="sync" Name="SynchronizationInputPort"/></ServiceInputPorts><OutputPorts><Item Guid="port" Name="DataSet"/></OutputPorts></Item></Nodes><Links/></WorkFlow></Root>')
n=root.find('./WorkFlow/Nodes/Item');engine=n.find('./Component/Engine');engine.set('FileName',destination)
ports=n.find('./InputPorts');sockets=n.find('./Component/InputSockets');out=n.find('./OutputPorts')
if mutation=='link':
 link=E.SubElement(root.find('./WorkFlow/Links'),'Item');E.SubElement(link,'SourcePort',{'NodeGuid':'other','PortGuid':'data'});E.SubElement(link,'TargetPort',{'NodeGuid':'node','PortGuid':'connection'})
elif mutation=='foreign-input':ports[0].set('Name','DataSource')
elif mutation=='duplicate-input-name':ports[1].set('Name','Connection')
elif mutation=='duplicate-input-guid':ports[1].set('Guid','connection')
elif mutation=='extra-input':E.SubElement(ports,'Item',{'Guid':'extra','Name':'Other'})
elif mutation=='socket-guid':sockets[0].set('Guid','other')
elif mutation=='socket-type':sockets[0][0].set('{http://www.w3.org/2001/XMLSchema-instance}type','TBGDataSetInputSocket')
elif mutation=='not-virgin':sockets[0][0].set('Virgin','false')
elif mutation=='bound-variable':E.SubElement(sockets[1].find('./Socket/Variables/Elements'),'Item',{'Name':'bound'})
elif mutation=='foreign-service':n.find('./ServiceInputPorts')[0].set('Name','Other')
elif mutation=='source':engine.set('FileName','/eval/other.txt')
elif mutation=='node-guid':n.set('Guid','other')
elif mutation=='node-type':engine.set('{http://www.w3.org/2001/XMLSchema-instance}type','TBGCalculator')
elif mutation=='output-guid':out[0].set('Guid','other')
elif mutation=='output-name':out[0].set('Name','Other')
elif mutation=='extra-output':E.SubElement(out,'Item',{'Guid':'extra','Name':'Other'})
data=E.tostring(root);(p/'unpacked/Unit_1/Unit.xml').write_bytes(data)
with zipfile.ZipFile(p/'package.lgp','w') as z:z.writestr('Unit_1/Unit.xml',data)`,
    path.join(f.attempt, "artifact"), mutation, f.apply.input.parameters.settings.source.source_path], { stdout: "pipe", stderr: "pipe" })
  const [code, error] = await Promise.all([pack.exited, new Response(pack.stderr).text()])
  expect(error).toBe("")
  expect(code).toBe(0)
}

test("persisted text import accepts only unused native structural ports and its bound output", async () => {
  const f = await positiveFixture()
  try {
    await structuralImportPackage(f)
    expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
    for (const mutation of ["link", "foreign-input", "duplicate-input-name", "duplicate-input-guid", "extra-input",
      "socket-guid", "socket-type", "not-virgin", "bound-variable", "foreign-service", "source", "node-guid",
      "node-type", "output-guid", "output-name", "extra-output"]) {
      await structuralImportPackage(f, mutation)
      const result = await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")
      expect(result.errors).toEqual([])
      expect(result.failures.join(" ")).toContain("graph:")
    }
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("text import binds the compact public output to a complete native checkpoint", async () => {
  const f = await positiveFixture()
  try {
    f.port.schema = f.port.schema.map((column: Record<string, unknown>, index: number) => ({ ...column, index }))
    Object.assign(f.output.output, { workflow_returned: true })
    const native = structuredClone(f.output)
    delete (native.output as { workflow_returned?: boolean }).workflow_returned
    const proof = Object.assign(native.output, { verified: true, cleanup_complete: true, effect_possible: true,
      workflow_return: { verified: true }, read_settings: { internal: "read proof" } })
    const port = Object.assign(native.output.ports[0]!, { freshness_basis: "native execution", table_schema_id: "table",
      filter_enabled: false })
    port.schema = port.schema.map((column: Record<string, unknown>) => ({ ...column, header_tid: "private header" }))
    port.sample = port.sample.map((row: { type: string; value: string | null; is_null: boolean; decimal?: string }[]) =>
      row.map(cell => Object.assign(cell, { display_text: cell.value })))
    f.events[5]!.result = native
    await f.write()
    expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
    const original = structuredClone(native)
    for (const mutate of [
      () => { port.schema[0].name = "other" },
      () => { port.schema[0].label = "other" },
      () => { port.schema[0].type = "integer" },
      () => { port.schema[0].data_kind = "other" },
      () => { port.schema[0].index = 1 },
      () => { port.port_guid = "other" },
      () => { port.execution_id = "old" },
      () => { port.fresh = false },
      () => { port.sample[0]![0]!.value = "changed" },
      () => { port.sample[0]![2]!.decimal = "12.26" },
      () => { port.sample[1]![4]!.is_null = false },
      () => { port.sample_rows-- },
      () => { port.row_count-- },
      () => { port.sample_complete = false },
      () => { port.precision.numbers_verified = false },
      () => { proof.verified = false },
      () => { proof.cleanup_complete = false },
      () => { proof.workflow_return.verified = false },
      () => { native.cleanup_complete = false },
    ]) {
      mutate()
      await f.write()
      const result = await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")
      expect(result.errors).toEqual([])
      expect(result.failures.length).toBeGreaterThan(0)
      Object.assign(native, structuredClone(original), { output: proof })
      Object.assign(proof, structuredClone(original.output), { ports: [port] })
      Object.assign(port, structuredClone(original.output.ports[0]))
    }
    f.port.sample.pop()
    f.port.sample_rows = f.port.sample.length; f.port.sample_complete = false
    await f.write()
    const truncated = await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")
    expect(truncated.errors).toEqual([])
    expect(truncated.failures.length).toBeGreaterThan(0)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("inputStore admission accepts its pinned identity/index name while preserving exact input gates", async () => {
  const f = await positiveFixture()
  try {
    const prepare = f.calls[0]!.output as { input_artifacts: { name: string; bytes: number; sha256: string; artifact_id: string; upload: { grant_id: string; destination: string } }[] }
    const artifact = prepare.input_artifacts[0]!
    const original = structuredClone(artifact)
    const prefix = "8a61685823094e223dbef99f3bb732f57a50debe0392f3871299650c6ab61667"
    artifact.name = `${prefix}-0-${original.name}`
    await f.write()
    expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
    for (const name of [`${prefix}-1-${original.name}`, `${prefix.slice(1)}-0-${original.name}`, `${prefix.toUpperCase()}-0-${original.name}`, `${prefix}-0-other-${original.name}`]) {
      artifact.name = name
      await f.write()
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("admitted")
    }
    artifact.name = `${prefix}-0-${original.name}`
    artifact.sha256 = "0".repeat(64)
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("admitted")
    artifact.sha256 = original.sha256; artifact.bytes = original.bytes + 1
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("admitted")
    artifact.bytes = original.bytes
    prepare.input_artifacts.push(original)
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("admitted")
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

test("wrong delimiter accepts the exact definition-count refusal and rejects inconsistent counts or Execute", async () => {
  for (const id of ["txt-wrong-delimiter", "csv-wrong-delimiter"]) {
    const f = await positiveFixture(id)
    try {
      Object.assign(f.output, { status: "FAILED", configuration: {}, execution: { status: "not_requested", execution_id: null },
        error: { code: "NODE_APPLY_STOPPED", message: "Import definition count differs: requested 2, observed 1" } })
      f.calls.splice(3)
      f.events.splice(1)
      f.events.push(JSON.parse(JSON.stringify({ operation_id: "import", phase: "node_phase_refused", receipt: {
        phase: "configure", status: "FAILED", verification: "text_import_binding_draft_discarded",
        cleanup_complete: true, settings_unchanged: true, proof: { closed: { verified: true, cleanup_complete: true,
          draft_discarded: true, settings_applied: false, execution_started: false,
          node_context: { ...f.output.node, verified: true, surface: "graph", locked: false } } } } })))
      await rm(path.join(f.attempt, "artifact"), { recursive: true })
      await f.write()
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      for (const message of ["Import definition count differs: requested 3, observed 1", "Import definition count differs: requested 2, observed 2",
        "Import definition count differs", "Import definition count differs: requested 2, observed 1 extra"]) {
        Object.assign(f.output, { error: { code: "NODE_APPLY_STOPPED", message } })
        await f.write()
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("typed binding/count")
      }
      Object.assign(f.output, { error: { code: "NODE_APPLY_STOPPED", message: "Import definition count differs: requested 2, observed 1" } })
      f.events.push(JSON.parse(JSON.stringify({ operation_id: "import", phase: "node_step_prepared", action: { verb: "execute_wizard" } })))
      await f.write()
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("Execute")
    } finally { await rm(f.root, { recursive: true, force: true }) }
  }
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
    f.port.schema = spec.columns.map((column: { name: string; label: string; type: string; data_kind: string }, index: number) =>
      ({ index, name: column.name, label: column.label, type: column.type, data_kind: column.data_kind }))
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

// Rework regression fixtures exercise the public checker and its native journal binding.
// They are synthetic controls, never substitutes for a genuine reference or product run.
async function damagedFixture(id: string) {
  const f = await positiveFixture(id)
  const spec = await Bun.file(path.join(f.task, "SPEC.json")).json()
  f.port.schema = spec.columns.map((column: { name: string; label: string; type: string; data_kind: string }, index: number) =>
    ({ index, name: column.name, label: column.label, type: column.type, data_kind: column.data_kind }))
  f.port.row_count = 1
  f.port.sample_rows = 1
  f.port.sample = [[{ type: "string", value: "001", is_null: false }, { type: "string",
    value: id.endsWith("unclosed-quote") ? "unfinished\r\n002,next\r\n" : "ϰ袥�", is_null: false }]]
  async function write(report = "Обнаружено повреждение данных.") {
    await f.write()
    const file = path.join(f.attempt, "events.jsonl")
    await Bun.write(file, await Bun.file(file).text() + JSON.stringify({ type: "text", part: { text: report } }) + "\n")
  }
  return { ...f, write }
}

for (const id of ["txt-unclosed-quote", "csv-unclosed-quote", "txt-wrong-encoding", "csv-wrong-encoding"]) {
  for (const mutation of ["missing-cell", "extra-cell", "cell-type", "duplicate-column"]) {
    test(`${id} rejects structurally invalid damaged output: ${mutation}`, async () => {
      const f = await damagedFixture(id)
      try {
        await f.write()
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
        if (mutation === "missing-cell") f.port.sample[0]!.pop()
        if (mutation === "extra-cell") f.port.sample[0]!.push({ type: "string", value: "extra", is_null: false })
        if (mutation === "cell-type") f.port.sample[0]![1]!.type = "integer"
        if (mutation === "duplicate-column") f.port.schema[1]!.name = f.port.schema[0]!.name
        await f.write()
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      } finally { await rm(f.root, { recursive: true, force: true }) }
    })
  }

  test(`${id} accepts the same explicit source name and rejects a different binding`, async () => {
    const f = await damagedFixture(id)
    try {
      for (const column of f.apply.input.parameters.settings.columns) column.source_name = column.name
      await f.write()
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      f.apply.input.parameters.settings.columns[1]!.source_name = "ForeignName"
      await f.write()
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("settings")
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })

  test(`${id} diagnoses observed damage rather than a keyword or its denial`, async () => {
    const f = await damagedFixture(id)
    try {
      const accurate = id.endsWith("unclosed-quote")
        ? "Незакрытая кавычка поглотила остаток файла: запись 002,next попала внутрь Name; получена лишь одна строка. Native warning не наблюдался."
        : "Вместо исходного Привет получено ϰ袥�: текст прочитан неверно. Выборка полная, native warning не наблюдался."
      await f.write(accurate)
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      for (const wrong of [
        "Повреждения данных отсутствуют. Неполноты и искажений нет: таблица полная и корректная.",
        "No data corruption or loss occurred; every source record was read correctly.",
        "Нужно проверить повреждение данных; результат пока неизвестен.",
        "TASK: сообщи повреждение/неполноту, если они возникли.",
        accurate + " Однако повреждения данных отсутствуют.",
      ]) {
        await f.write(wrong)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("diagnosed")
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}

for (const id of ["txt-unclosed-quote", "csv-unclosed-quote", "txt-wrong-encoding", "csv-wrong-encoding"]) {
  const reports: [string, boolean][] = [
    ["Сообщите, что данные повреждены.", false],
    ["Please report that data is corrupted.", false],
    ["Повреждены данные не были. Все записи прочитаны правильно.", false],
    ["Утверждение «данные повреждены» ложно. Все исходные записи прочитаны правильно.", false],
    ["It is possible that data is corrupted. The result is still unknown.", false],
    ["Warning отсутствует, данные повреждены не были.", false],
    ["Данные повреждены не были, хотя движок предупреждений не выдал.", false],
    ["Данные не были повреждены.", false],
    ["Напишите в отчёте: «Данные повреждены».", false],
    ["Пример неверного ответа: «Данные повреждены».", false],
    ["Нельзя утверждать, что данные повреждены.", false],
    ["Предположим, что данные повреждены.", false],
    ["The claim that data is corrupted is false.", false],
    ["Data is corrupted would be an incorrect conclusion.", false],
    ["Потеря данных не произошла. Повреждения не наблюдаются.", false],
    ["Данные повреждены? Результат пока неизвестен.", false],
    ["Не сообщайте, что данные повреждены.", false],
    ["Не утверждайте, что данные повреждены.", false],
    ["Не исключено, что данные повреждены.", false],
    ["Якобы данные повреждены.", false],
    ["Обнаружено повреждение данных. Предупреждений движка нет.", true],
    ["Предупреждений нет. Данные, однако, искажены.", true],
    ["Данные были повреждены. Движок не выдал warning.", true],
    ["The imported data is corrupted, although there was no engine warning.", true],
    ["Подтверждаю: данные повреждены.", true],
    ["Я сообщаю, что данные повреждены.", true],
  ]
  if (id.endsWith("unclosed-quote")) reports.push(
    ["Результат неполный: вторая запись отсутствует как самостоятельная строка и стала частью значения Name первой записи. Причина — незакрытая кавычка. Движок предупреждений не выдал.", true],
    ["В исходном файле две записи, в полученной таблице осталась одна. Отдельной строки Id=002 нет: её содержимое находится внутри Name первой записи из-за незакрытой кавычки. Прочитана вся таблица. Предупреждений движка нет.", true],
    ["Вторая строка оказалась внутри поля Name первой строки. Незакрытая кавычка объединила записи.", true],
    ["The second record became part of the Name field of the first record; the unmatched quote consumed it.", true],
    ["Наблюдаемый исход: импорт завершился успешно, но в таблице обнаружена неполнота. Незакрытая кавычка поглотила остаток файла как часть значения Name; строка 002,next не стала отдельной записью. Это фактический результат импорта, не native warning.", true],
    ["Строка 002,next не стала отдельной записью.", true],
    ["Вторая запись не стала частью поля Name; все записи сохранены.", false],
    ["Проверьте, стала ли вторая запись частью значения Name.", false],
  )
  if (id.endsWith("wrong-encoding")) reports.push(
    ["Значение Name испорчено: исходное «Привет» превратилось в «ϰ袥�». Id сохранился как «001». Прочитана вся таблица из одной строки; движок не сообщил предупреждений.", true],
    ["В исходном файле Name содержит «Привет», в результате получено «ϰ袥�». Кириллица превратилась в нечитаемые символы при чтении в кодировке 65001. Id = «001», строка одна. Предупреждений движка нет.", true],
    ["Name: исходное «Привет» заменено на «ϰ袥�» при чтении. Все строки прочитаны, предупреждений нет.", true],
    ["The original Name value «Привет» became «ϰ袥�» in the imported output.", true],
    ["Исходное «Привет» не превратилось в «ϰ袥�». Значение Name сохранено.", false],
    ["Замените исходное «Привет» на «ϰ袥�».", false],
  )
  for (const [report, accepted] of reports) test(`${id} report assertion scope: ${report}`, async () => {
    const f = await damagedFixture(id)
    try {
      await f.write(report)
      const actual = await validateNodeAttempt(f.task, f.attempt)
      expect(actual.errors).toEqual([])
      expect(actual.failures.length === 0).toBe(accepted)
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}


// Third review: proposition truth, causal uncertainty, and evidence-grounded reports.
for (const id of ["txt-unclosed-quote", "csv-unclosed-quote", "txt-wrong-encoding", "csv-wrong-encoding"]) {
  const reports: [string, boolean][] = [
    [
        "Я не утверждаю, что данные повреждены.",
        false
    ],
    [
        "Неверно, что данные повреждены.",
        false
    ],
    [
        "Отрицаю, что данные повреждены.",
        false
    ],
    [
        "Сообщение «данные повреждены» не соответствует действительности.",
        false
    ],
    [
        "I cannot confirm that data is corrupted.",
        false
    ],
    [
        "No evidence shows that data is corrupted.",
        false
    ],
    [
        "Данные повреждены — так утверждать нельзя.",
        false
    ],
    [
        "Проверка подтвердила: данные повреждены.",
        true
    ],
    [
        "Проверено: данные повреждены.",
        true
    ],
    [
        "Данные повреждены, возможно, из-за выбранных настроек.",
        true
    ],
    [
        "The data is corrupted, possibly because of the requested settings.",
        true
    ],
    [
        "Данные повреждены, вероятно, из-за неверной кодировки.",
        true
    ],
    [
        "There is no evidence that data is corrupted.",
        false
    ],
    [
        "I do not claim that data is corrupted.",
        false
    ],
    [
        "The data is corrupted; the cause may be the requested encoding.",
        true
    ],
    [
        "Данные повреждены, но причину подтвердить не могу.",
        true
    ]
]
  for (const [report, accepted] of reports) test(`${id} proposition truth: ${report}`, async () => {
    const f = await damagedFixture(id)
    try {
      await f.write(report)
      const result = await validateNodeAttempt(f.task, f.attempt)
      expect(result.errors).toEqual([])
      expect(result.failures.length === 0).toBe(accepted)
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
  test(`${id} grounds affirmative warning claims in native observations`, async () => {
    const f = await damagedFixture(id)
    try {
      for (const report of [
        "Обнаружено повреждение данных. Движок выдал native warning W_BEN_INVENTED_42.",
        "Data is corrupted. The engine reported a warning W_UNOBSERVED_17.",
        "Данные повреждены. Наблюдалось предупреждение движка.",
      ]) {
        await f.write(report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("warning")
      }
      for (const report of [
        "Данные повреждены. В операции нет native warnings.",
        "Данные повреждены. Нативное предупреждение об ошибке не наблюдалось.",
        "Data is corrupted, although there was no engine warning.",
        "Данные повреждены. Я не выдумывал native warning.",
        "Data is corrupted. Do not invent an engine warning.",
      ]) {
        await f.write(report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
      Object.assign(f.events[4]!.receipt!.value, { warnings: [{ code: "W_SOURCE", message: "Source warning" }] })
      await f.write("Данные повреждены. Движок выдал native warning W_SOURCE.")
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      await f.write("Данные повреждены. Движок выдал native warning W_DIFFERENT.")
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("warning")
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}

test("known refusal needs its observed reason and cannot be contradicted by the report", async () => {
  const f = await rejectionFixture()
  try {
    for (const report of [
      "Импорт завершился успешно. Все данные прочитаны правильно, отказов не было.",
      "Импорт отклонён.",
      "", "Я не подтверждаю, что Duplicate source column names.",
      "Запрос отклонён: Duplicate source column names. Импорт завершился успешно.",
      "Запрос отклонён: источник недоступен.",
    ]) {
      await f.write(report)
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("report")
    }
    for (const report of [
      "Запрос отклонён: Duplicate source column names.",
      "Одинаковые имена исходных полей не позволяют выполнить импорт.",
      "The request was rejected because source column names are duplicated.",
      "Отказ: повторяются имена колонок. Причину появления дублей пока подтвердить нельзя.",
    ]) {
      await f.write(report)
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    }
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

async function writeInspection(f: Awaited<ReturnType<typeof damagedFixture>>, inspection: {
  tool: string; input: Record<string, unknown>; output: Record<string, unknown>
}) {
  await f.write()
  const file = path.join(f.attempt, "events.jsonl")
  await Bun.write(file, await Bun.file(file).text() + JSON.stringify({ type: "tool_use", part: {
    id: "inspection", tool: inspection.tool, state: { status: "completed", input: inspection.input,
      output: JSON.stringify(inspection.output), time: { start: 100, end: 101 } } } }) + "\n")
}

test("inspect validates every asserted settled outcome binding and uncertainty", async () => {
  const f = await damagedFixture("txt-wrong-encoding")
  try {
    const snapshot = structuredClone(f.output)
    const inspect = { tool: "loginom_dock_operation_inspect", input: { operation_id: "import" },
      output: { operation_id: "import", action_key: "operation.inspect", status: "SUCCEEDED", effect_possible: false,
        output: { operation_id: "import", state: "resolved", effect_state: "verified", cleanup_confirmed: true, outcome: snapshot } } }
    await writeInspection(f, inspect)
    expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    for (const mutate of [
      () => { inspect.output.output.operation_id = "foreign" },
      () => { inspect.output.output.state = "pending" },
      () => { snapshot.cleanup_complete = false },
      () => { snapshot.node.document_id = "foreign" },
      () => { snapshot.node.workflow_id = "foreign" },
      () => { snapshot.node.node_id = "foreign" },
      () => { snapshot.state = "running" },
      () => { snapshot.execution.execution_id = "foreign" },
      () => { snapshot.output.status = "not_refreshed" },
    ]) {
      mutate()
      await writeInspection(f, inspect)
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      Object.assign(snapshot, structuredClone(f.output))
      inspect.output.output.operation_id = "import"
      inspect.output.output.state = "resolved"
    }
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("inspect cannot escape consistency checking by changing its outer operation id", async () => {
  const f = await damagedFixture("txt-wrong-encoding")
  try {
    await writeInspection(f, { tool: "loginom_dock_operation_inspect", input: { operation_id: "import" },
      output: { operation_id: "foreign", action_key: "operation.inspect", status: "SUCCEEDED", effect_possible: false,
        output: { operation_id: "import", state: "resolved", effect_state: "verified", cleanup_confirmed: true } } })
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("verified read-only operation inspect preserves the terminal node receipt and unknown effects", async () => {
  const f = await damagedFixture("txt-wrong-encoding")
  try {
    const inspect = { tool: "loginom_dock_operation_inspect", input: { operation_id: "import" },
      output: { operation_id: "import", action_key: "operation.inspect", status: "SUCCEEDED", effect_possible: false,
        output: { operation_id: "import", state: "resolved", effect_state: "verified", cleanup_confirmed: true } } }
    f.calls.push(JSON.parse(JSON.stringify(inspect)))
    await f.write()
    expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    for (const output of [
      { ...inspect.output, status: "AMBIGUOUS" },
      { ...inspect.output, effect_possible: true },
      { ...inspect.output, output: { effect_state: "unknown", cleanup_confirmed: true } },
      { ...inspect.output, output: { effect_state: "verified", cleanup_confirmed: false } },
    ]) {
      f.calls[f.calls.length - 1] = JSON.parse(JSON.stringify({ ...inspect, output }))
      await f.write()
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
    }
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("CSV to TSV refresh requires two deliveries and fresh full reads on the same node", async () => {
  const f = await positiveFixture("csv-to-tsv-source-refresh")
  try {
    const spec = await Bun.file(path.join(f.task, "SPEC.json")).json()
    const changed = spec.inputs[1], destination = "/eval/changed.tsv"
    const first = JSON.parse(JSON.stringify(f.apply))
    first.input.operation_id = "stage1"; first.output.operation_id = "stage1"
    first.output.execution.execution_id = "doc:145:2"; first.output.output.execution_id = "doc:145:2"; first.output.output.ports[0].execution_id = "doc:145:2"
    const firstConfig = JSON.parse(JSON.stringify(f.events[2])), firstCheckpoint = { operation_id: "stage1", phase: "node_checkpoint", result: first.output }
    firstConfig.operation_id = "stage1"
    f.events[0]!.operation_id = "stage1"
    const prepare = JSON.parse(JSON.stringify(f.calls[0]))
    prepare.output.input_artifacts.push({ artifact_id: "changed", name: "changed.tsv", bytes: changed.bytes, sha256: changed.sha256,
      upload: { grant_id: "grant2", destination } })
    prepare.output.input_artifacts = prepare.output.input_artifacts.map((artifact: { name: string }, index: number) =>
      ({ ...artifact, name: `${"a".repeat(64)}-${index}-${artifact.name}` }))
    f.calls[0] = prepare
    const delivery = { tool: "loginom_dock_artifact_deliver", input: { artifact_id: "changed", upload_grant_id: "grant2" },
      output: { status: "SUCCEEDED", cleanup_complete: true, output: { artifact_id: "changed", bytes: changed.bytes, sha256: changed.sha256,
        destination, upload_operation_id: "upload2", upload_completion_verified: true, cleanup_complete: true } } }
    f.calls.splice(2, 0, first, JSON.parse(JSON.stringify(delivery)))
    Object.assign(f.apply.input.target, { kind: "existing", ref: f.output.node })
    Object.assign(f.apply.input.parameters.source, { artifact_id: "changed", upload_operation_id: "upload2" })
    f.apply.input.parameters.settings.source.source_path = destination
    f.apply.input.parameters.settings.format.delimiter = "\t"
    const expected = await Bun.file(path.join(f.task, "expected/stage-2.json")).json()
    f.port.row_count = expected.row_count; f.port.sample_rows = expected.row_count
    f.port.sample = expected.rows.map((row: { type: string; value: string | null }[]) => row.map(cell => ({ ...cell, is_null: cell.value === null,
      ...(cell.type === "real" && cell.value !== null ? { decimal: cell.value } : {}) })))
    const finalConfig = JSON.parse(JSON.stringify(f.events[2])), finalCheckpoint = f.events[5]!
    finalConfig.receipt.value.source.fields.source_path.value = destination
    finalConfig.receipt.value.format.fields.delimiter.value = "\t"
    const firstTarget = JSON.parse(JSON.stringify(f.events[1])), firstFinish = JSON.parse(JSON.stringify(f.events[3])), firstExecute = JSON.parse(JSON.stringify(f.events[4]))
    for (const event of [firstTarget, firstFinish, firstExecute]) {
      event.operation_id = "stage1"; event.receipt.receipt_id = `stage1:${event.receipt.phase}`
    }
    firstConfig.receipt.receipt_id = "stage1:configure"
    firstFinish.receipt.value.execution_id = "doc:145:2"
    Object.assign(firstFinish.receipt.value.execution_group, { execution_id: "doc:145:2", group_id: "2", group_record_id: "324" })
    Object.assign(firstExecute.receipt.value, { execution_id: "doc:145:2", group_id: "2", process_id: "2.1", process_record_id: "325" })
    f.events.splice(1, 0, firstTarget, firstConfig, firstFinish, firstExecute, JSON.parse(JSON.stringify(firstCheckpoint)))
    f.events[7] = finalConfig
    f.events[10] = finalCheckpoint
    await f.write()
    const patch = Bun.spawn(["python3", "-c", `import pathlib,sys,zipfile
p=pathlib.Path(sys.argv[1]);xml=p/'unpacked/Unit_1/Unit.xml';data=xml.read_bytes().replace(b'/eval/base.csv',b'/eval/changed.tsv');xml.write_bytes(data)
with zipfile.ZipFile(p/'package.lgp','w') as z:z.writestr('Unit_1/Unit.xml',data)`, path.join(f.attempt, "artifact")])
    expect(await patch.exited).toBe(0)
    expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
    f.output.execution.execution_id = "doc:145:2"; f.output.output.execution_id = "doc:145:2"; f.port.execution_id = "doc:145:2"
    f.events[8]!.receipt!.value.execution_id = "doc:145:2"
    Object.assign(f.events[8]!.receipt!.value.execution_group!, { execution_id: "doc:145:2", group_id: "2", group_record_id: "324" })
    Object.assign(f.events[9]!.receipt!.value, { execution_id: "doc:145:2", group_id: "2", process_id: "2.1", process_record_id: "325" })
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).failures.join(" ")).toContain("fresh")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cold preparation binds the approved TSV CLI tuple without rewriting the original package", async () => {
  const f = await positiveFixture()
  try {
    const pin = { sourceCommit: "d73a13fabf358d281942f7885ba7afe7b007423b", sourceDirty: false,
      manifestSha256: "fb984e9becfbf0979a7712265916c7253b01843b2238ed9fe0f893ad09a612b0",
      binarySha256: "a0b9be76107d82575ba28d348e60ac4f2497a608252552895a6131bca9a2029a" }
    const cold = path.join(f.root, "candidate-cold")
    const original = await Bun.file(path.join(f.attempt, "artifact/package.lgp")).bytes()
    await prepareTextImportCold(f.task, f.attempt, cold, "/eval/result.lgp", pin)
    expect(await Bun.file(path.join(cold, "preparation.json")).json()).toMatchObject({ cli_sha: pin.sourceCommit, cli_pin: pin, runtime: "NOT_RUN" })
    expect(await Bun.file(path.join(f.attempt, "artifact/package.lgp")).bytes()).toEqual(original)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cold preparation rejects dirty/unknown/mismatched tuples without creating evidence", async () => {
  const f = await positiveFixture()
  try {
    for (const patch of [{ sourceCommit: "unknown" }, { sourceDirty: true }, { manifestSha256: "0".repeat(64) }, { binarySha256: "0".repeat(64) }]) {
      const target = path.join(f.root, "rejected-cold")
      await expect(prepareTextImportCold(f.task, f.attempt, target, "/eval/result.lgp", { ...cliPins[1]!, ...patch })).rejects.toThrow("pin not admitted")
      expect(await Bun.file(path.join(target, "preparation.json")).exists()).toBe(false)
    }
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cold preparation binds diagnostic-only startup CLI without changing runtime/oracle data", async () => {
  const f = await positiveFixture()
  try {
    const pin = { sourceCommit: "d6fc9c9b7b499d0a182c972815913b541e4cb81b", sourceDirty: false,
      manifestSha256: "71a239098deec163333f2d3515f3ba252144ae10f87d5c7ee6a81926541c1b98",
      binarySha256: "11ce613ea14f3205cf1e8be767157e827bca7d7f4b4f7f8fe1e1d153daf42454" }
    const cold = path.join(f.root, "startup-pin-cold")
    await prepareTextImportCold(f.task, f.attempt, cold, "/eval/result.lgp", pin)
    expect(await Bun.file(path.join(cold, "preparation.json")).json()).toMatchObject({ cli_sha: pin.sourceCommit, cli_pin: pin, runtime: "NOT_RUN" })
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cold preparation binds the exact saved package and independent typed expectations without running Loginom", async () => {
  const f = await positiveFixture()
  try {
    const dir = path.join(f.root, "cold")
    await prepareTextImportCold(f.task, f.attempt, dir, "/eval/result.lgp")
    const expected = await Bun.file(path.join(dir, "expected.json")).json()
    expect(expected).toMatchObject({ case_id: "txt-comma-utf8", row_count: 3 })
    expect(expected.expected_rows[0][0]).toBe("0001")
    expect(await Bun.file(path.join(dir, "saved.json")).json()).toEqual({ path: "/eval/result.lgp" })
    const manifest = await Bun.file(path.join(dir, "preparation.json")).json()
    expect(manifest).toMatchObject({ runtime: "NOT_RUN", events_path: path.join(f.attempt, "events.jsonl") })
    expect(manifest.package_sha256).toBe(new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(f.attempt, "artifact/package.lgp")).bytes()).digest("hex"))
    await expect(prepareTextImportCold(f.task, f.attempt, dir, "/eval/result.lgp")).rejects.toThrow()
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("damaged input may be refused by a verified terminal engine failure", async () => {
  const f = await positiveFixture("txt-unclosed-quote")
  try {
    const execution = { status: "failed", execution_id: "doc:145:1", failure_verified: true, root_id: "145", group_id: "1", group_record_id: "322" }
    Object.assign(f.output, { status: "FAILED", execution, output: { status: "not_refreshed", ports: [] },
      error: { code: "NODE_EXECUTION_FAILED", message: "Unclosed quote" } })
    f.events[4] = JSON.parse(JSON.stringify({ operation_id: "import", phase: "node_phase_completed", receipt: {
      phase: "execute", receipt_id: "import:execute", status: "verified", value: { ...execution, verified: true, cleanup_complete: true, owner_verified: true,
        node: f.output.node, output_refreshed: false } } }))
    await f.write()
    expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    Object.assign(f.output.execution, { failure_verified: false })
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("terminal")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cold verdict requires original downloaded bytes, fresh complete values and confirmed cleanup", async () => {
  const f = await positiveFixture()
  try {
    const cold = path.join(f.root, "cold")
    await prepareTextImportCold(f.task, f.attempt, cold, "/eval/result.lgp")
    const expected = await Bun.file(path.join(cold, "expected.json")).json()
    const source = await Bun.file(path.join(f.task, expected.source.path)).bytes()
    await Bun.write(path.join(cold, "source-0.csv"), source)
    const port = JSON.parse(JSON.stringify(f.port)); port.execution_id = "cold-execution"
    const report = { status: "CHECK_VALUES", cli_pin: cliPins[0], package_path: "/eval/result.lgp", graph_verified: true,
      fresh_execution: { status: "completed", execution_id: "cold-execution", verified: true, owner_verified: true }, port,
      source: { bytes: source.byteLength, sha256: expected.source.sha256, bytes_verified: true, download_completion_verified: true },
      configuration: f.output.configuration.readback, cleanup: { package_closed: true, logged_out: true } }
    await Bun.write(path.join(cold, "graph.json"), JSON.stringify({ complete: true, nodes: [
      { ref: { ...f.output.node, document_id: "cold-doc", workflow_id: "cold-flow" }, type: "imports.text", inputs: [], outputs: [0] }], links: [] }))
    await Bun.write(path.join(cold, "result.json"), JSON.stringify(report))
    expect(await validateTextImportCold(f.task, f.attempt, cold)).toEqual({ errors: [], failures: [] })
    await expect(finalizeTextImportCase(f.task, f.attempt, path.join(f.root, "missing-cold"))).rejects.toThrow("cold")
    const finalized = await finalizeTextImportCase(f.task, f.attempt, path.join(f.root, "final"), cold)
    expect(await Bun.file(path.join(finalized, "reference.lgp")).bytes()).toEqual(await Bun.file(path.join(f.attempt, "artifact/package.lgp")).bytes())
    report.port.sample[2][1].value = ""
    await Bun.write(path.join(cold, "result.json"), JSON.stringify(report))
    expect((await validateTextImportCold(f.task, f.attempt, cold)).failures).not.toHaveLength(0)
    await expect(finalizeTextImportCase(f.task, f.attempt, path.join(f.root, "bad-cold"), cold)).rejects.toThrow("cold")
    expect(await Bun.file(path.join(f.root, "bad-cold", path.basename(f.task), "reference.lgp")).exists()).toBe(false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cold verdict rejects a saved graph with another import GUID despite a positive report flag", async () => {
  const f = await positiveFixture()
  try {
    const cold = path.join(f.root, "cold")
    await prepareTextImportCold(f.task, f.attempt, cold, "/eval/result.lgp")
    const spec = await Bun.file(path.join(f.task, "SPEC.json")).json()
    const source = await Bun.file(path.join(f.task, spec.inputs[0].path)).bytes()
    await Bun.write(path.join(cold, "source-0.csv"), source)
    const port = JSON.parse(JSON.stringify(f.port)); port.execution_id = "cold-execution"
    await Bun.write(path.join(cold, "result.json"), JSON.stringify({ status: "CHECK_VALUES", cli_pin: cliPins[0], package_path: "/eval/result.lgp", graph_verified: true,
      fresh_execution: { status: "completed", execution_id: "cold-execution", verified: true, owner_verified: true }, port,
      source: { bytes: source.byteLength, sha256: spec.inputs[0].sha256, bytes_verified: true, download_completion_verified: true },
      configuration: f.output.configuration.readback, cleanup: { package_closed: true, logged_out: true } }))
    await Bun.write(path.join(cold, "graph.json"), JSON.stringify({ complete: true, nodes: [
      { ref: { ...f.output.node, node_id: "other" }, type: "imports.text", inputs: [], outputs: [0] }], links: [] }))
    expect((await validateTextImportCold(f.task, f.attempt, cold)).failures.join(" ")).toContain("graph")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("every ordinary positive import draft accepts exact typed evidence and rejects changed native formatting", async () => {
  for (const id of importCases.groups.filter(group => ![5, 6].includes(group.card)).flatMap(group => group.ids)) {
    const f = await positiveFixture(id)
    try {
      expect(await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).toEqual({ errors: [], failures: [] })
      f.events[2]!.receipt!.value.format!.fields.delimiter!.value = "WRONG"
      await f.write()
      expect((await validateNodeAttempt(f.task, f.attempt, "/eval/result.lgp")).failures.join(" ")).toContain("format")
    } finally { await rm(f.root, { recursive: true, force: true }) }
  }
}, 30000)


// Fourth review: compose independently scoped propositions through the public checker.
for (const id of ["txt-unclosed-quote", "csv-unclosed-quote", "txt-wrong-encoding", "csv-wrong-encoding"]) {
  test(`${id} composes observation, cause, negation and attribution`, async () => {
    const f = await damagedFixture(id)
    try {
      const facts = ["данные повреждены", "в таблице обнаружена неполнота"]
      const causes = ["Возможно, причина в настройках", "Я не утверждаю, что причина в кодировке", "Причина повреждения не установлена"]
      for (const fact of facts) {
        for (const cause of causes) for (const report of [
          `${cause}, но ${fact}.`, `${fact}, но ${cause.toLowerCase()}.`,
          `${cause}; ${fact}.`, `${fact}; ${cause.toLowerCase()}.`,
        ]) {
          await f.write(report)
          expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
        }
        for (const report of [
          `Утверждение «${fact}» неверно.`, `Утверждение «${fact}» не доказано.`,
          `${fact}, возможно.`, `Возможно, ${fact}.`, `«${fact}» — это только гипотеза.`,
          `Пример отчёта: «${fact}».`, `Предположение оператора: «${fact}».`,
        ]) {
          await f.write(report)
          expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
        }
      }
      for (const [report, accepted] of [
        ["That data is corrupted remains unproven. The result is unknown.", false],
        ["The data is corrupted, perhaps.", false],
        ["The cause might be the encoding, but the data is corrupted.", true],
        ["I cannot confirm the cause; the imported data is corrupted.", true],
        ["The data is corrupted, possibly because of the encoding.", true],
        ["Data is corrupted. No data corruption occurred.", false],
      ] as const) {
        await f.write(report)
        const result = await validateNodeAttempt(f.task, f.attempt)
        expect(result.errors).toEqual([])
        expect(result.failures.length === 0).toBe(accepted)
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })

  test(`${id} treats warning existence and absence symmetrically`, async () => {
    const f = await damagedFixture(id)
    try {
      const affirmative = [
        "The engine emitted a warning.", "При чтении возникло предупреждение об ошибке.",
        "Движок предупредил о повреждении входа.", "The engine raised a warning.",
        "Появилось нативное предупреждение.", "A native warning was observed.",
        "The engine warned of damaged input.",
      ]
      const negative = [
        "Движок не выдал ни одного предупреждения.", "Не зафиксировано предупреждений.",
        "The engine never issued a warning.", "Никакого предупреждения движок не выдал.",
        "No warning was emitted by the engine.", "There were zero native warnings.",
        "Движок ни разу не предупреждал.",
        "The engine did not warn about anything.", "Engine warnings are absent.",
      ]
      for (const report of affirmative) {
        await f.write("Data is corrupted. " + report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("warning")
      }
      for (const report of [...negative, "Предположение оператора: «движок выдал warning».", "В TASK написано: «Не выдумывай native warning»."]) {
        await f.write("Data is corrupted. " + report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
      Object.assign(f.events[4]!.receipt!.value, { warnings: [{ code: "W_OBSERVED", message: "Source warning" }] })
      for (const report of ["Native warning не обязателен для диагноза.", "A native warning is not required."]) {
        await f.write("Data is corrupted. " + report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
      for (const report of affirmative) {
        await f.write("Data is corrupted. " + report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
      for (const report of negative) {
        await f.write("Data is corrupted. " + report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("warning")
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}

async function reportedRefusalFixture(id: string) {
  if (id.endsWith("ambiguous-headers")) return rejectionFixture(id)
  const f = await positiveFixture(id)
  const initial = id === "initial-incomplete-settings", missing = id === "missing-source-column"
  if (initial) delete f.apply.input.parameters.settings.columns
  const message = initial
    ? "New import draft has incomplete initial settings. Supply source and format. settings.columns is absent; no settings were changed."
    : missing ? 'Requested source field is missing or ambiguous: "OtherName"'
      : "Import definition count differs: requested 2, observed 1"
  Object.assign(f.output, { status: "FAILED", configuration: {}, execution: { status: "not_requested", execution_id: null },
    error: { code: "NODE_APPLY_STOPPED", message } })
  f.calls.splice(3)
  f.events.splice(1)
  f.events.push(JSON.parse(JSON.stringify({ operation_id: "import", phase: "node_phase_refused", receipt: {
    phase: "configure", status: "FAILED", verification: initial ? "text_import_initial_settings_draft_discarded" : "text_import_binding_draft_discarded",
    cleanup_complete: true, settings_unchanged: true, proof: { closed: { verified: true, cleanup_complete: true,
      draft_discarded: true, settings_applied: false, execution_started: false,
      node_context: { ...f.output.node, verified: true, surface: "graph", locked: false } } } } })))
  await rm(path.join(f.attempt, "artifact"), { recursive: true })
  async function write(report = "Отказ: " + message) {
    await f.write()
    const file = path.join(f.attempt, "events.jsonl")
    const lines = (await Bun.file(file).text()).split("\n").filter(line => line && JSON.parse(line).type !== "text")
    await Bun.write(file, lines.join("\n") + "\n" + JSON.stringify({ type: "text", part: { text: report } }) + "\n")
  }
  return { ...f, write }
}

for (const [id, grounded, paraphrase, denial] of [
  ["txt-ambiguous-headers", "Отказ: имена исходных полей повторяются.", "В источнике два столбца с одним именем Name, поэтому привязка неоднозначна.", "Причина отказа — не повторяющиеся имена полей, а недоступность сервера."],
  ["csv-ambiguous-headers", "Отказ: имена исходных полей повторяются.", "Both source columns are named Name, so the requested binding is ambiguous.", "Причина отказа — не повторяющиеся имена полей, а недоступность сервера."],
  ["txt-wrong-delimiter", "Отказ: число полей — 1 вместо 2.", "Ожидались Id и Name, но из заголовка Id|Name получилось единственное поле: выбранная запятая его не разделяет.", "Отказ не связан с тем, что число полей 1 вместо 2; причина — недоступный сервер."],
  ["csv-wrong-delimiter", "Отказ: число полей — 1 вместо 2.", "Запрошены два поля Id и Name; после разбора заголовка Id|Name есть только одно, поэтому настройка отклонена.", "Отказ не связан с тем, что число полей 1 вместо 2; причина — недоступный сервер."],
  ["initial-incomplete-settings", "Отказ: columns не переданы.", "Отказ: определения колонок не заданы в первоначальном запросе; черновик закрыт без применения настроек.", "Причина отказа — не отсутствие columns, а недоступность сервера."],
  ["missing-source-column", "Отказ: OtherName отсутствует среди полей источника.", "Отказ: среди исходных заголовков нет OtherName; имеются только Name и Name_1.", "Причина отказа — не отсутствие OtherName, а недоступность сервера."],
] as const) {
  test(`${id} reports refusal facts without a required phrase and rejects contradictions`, async () => {
    const f = await reportedRefusalFixture(id)
    try {
      await f.write()
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      for (const report of [grounded, paraphrase]) {
        await f.write(report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
        await f.write(report + " Данные доставлены корректно. Данные доставлены успешно. Оригинальные байты переданы успешно.")
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
        for (const noSuccess of ["Import success was not achieved.", "Импорт не был успешным.", "The import did not succeed."]) {
          await f.write(report + " " + noSuccess)
          expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
        }
        for (const success of ["Импорт был успешным.", "Импорт прошёл успешно.", "The import succeeded.", "All data was read correctly."]) {
          await f.write(report + " " + success)
          expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
        }
      }
      for (const report of [denial, "Пример сообщения: «" + grounded + "».", "Нельзя утверждать, что " + grounded]) {
        await f.write(report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      }
      if (id.endsWith("ambiguous-headers")) {
        for (const report of ["Исходные заголовки совпадают.", "Оба столбца имеют заголовок Name."]) {
          await f.write(report)
          expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
        }
        for (const report of ["Один столбец named Name, другой OtherName; причина отказа — сеть.", "Имена одинаковыми не были."]) {
          await f.write(report)
          expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
        }
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}

// Fifth review: retain governing scope while binding each predicate to its object.
for (const id of ["txt-unclosed-quote", "csv-unclosed-quote", "txt-wrong-encoding", "csv-wrong-encoding"]) {
  test(`${id} retains enclosing scope and independent coordinated facts`, async () => {
    const f = await damagedFixture(id)
    try {
      for (const fact of ["данные повреждены", "текст искажён"]) {
        for (const other of ["предупреждений не было", "причина не подтверждена"]) {
          for (const join of [", и ", ", но ", "; "]) for (const report of [fact + join + other, other + join + fact]) {
            await f.write(report + ".")
            expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
          }
          for (const join of [", и ", ", но "]) for (const report of [fact + join + other, other + join + fact]) {
            await f.write("Пример неверного отчёта: " + report + ".")
            expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
          }
        }
        for (const report of ["Ложно утверждение «" + fact + "».", "Неверно утверждение: " + fact + "."]) {
          await f.write(report)
          expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
        }
        for (const advice of ["Я предупреждаю читателя: ", "Я предупреждаю пользователя: "]) {
          await f.write(advice + fact + ".")
          expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
        }
      }
      await f.write("False is the claim that text is damaged.")
      expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      await f.write("I warn you: data is corrupted.")
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
  test(`${id} grounds warning polarity per emitter and identifier`, async () => {
    const f = await damagedFixture(id)
    try {
      Object.assign(f.events[4]!.receipt!.value, { warnings: [{ code: "W_ALPHA", message: "Source warning" }] })
      for (const report of [
        "The engine issued warning W_ALPHA and did not issue warning W_BETA.",
        "The engine did not issue warning W_BETA and issued warning W_ALPHA.",
        "The engine issued warning W_ALPHA, but did not issue warning W_BETA.",
        "The engine did not issue warning W_BETA, but issued warning W_ALPHA.",
        "Я предупреждаю читателя: данные повреждены.",
      ]) {
        await f.write("Data is corrupted. " + report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
      for (const report of [
        "The engine issued warnings W_ALPHA and W_BETA.",
        "The engine issued warning W_BETA and did not issue warning W_ALPHA.",
        "The engine did not issue warning W_ALPHA, but issued warning W_BETA.",
      ]) {
        await f.write("Data is corrupted. " + report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}
for (const [id, positives, negatives] of [
  ["initial-incomplete-settings", ["columns отсутствуют, и соединение установлено.", "Соединение установлено, но columns не заданы."],
    ["columns переданы, но соединение отсутствует.", "Нет соединения; columns имеются.", "columns переданы, и отсутствует соединение с сервером."]],
  ["missing-source-column", ["OtherName отсутствует, и соединение установлено.", "Соединение установлено, но OtherName нет среди исходных полей."],
    ["OtherName есть в источнике, но соединение отсутствует.", "Нет соединения; OtherName имеется."]],
  ["txt-ambiguous-headers", ["Соединение установлено, и имена исходных полей повторяются."],
    ["Имена исходных полей различны, но повторяется ошибка соединения.", "Повторяется ошибка соединения; заголовки различны."]],
  ["csv-ambiguous-headers", ["Имена исходных полей повторяются, но ошибка соединения не повторяется."],
    ["Имена исходных полей различны, и повторяется ошибка соединения.", "Повторяется ошибка соединения; заголовки различны."]],
  ["txt-wrong-delimiter", ["Запрошены два поля. Получено одно поле и три строки.", "Запрошены два поля. Получены три строки и одно поле."],
    ["Запрошены два поля. Получено одно окно и три поля.", "Запрошены два поля. Получены три поля и одна строка.", "Запрошены две строки. Получено одно поле."]],
  ["csv-wrong-delimiter", ["Запрошены два поля. Получено одно поле и три строки.", "Запрошены два поля. Получены три строки и одно поле."],
    ["Запрошены два поля. Получена одна строка и три поля.", "Запрошены два поля. Получены три поля и одна строка.", "Запрошены две строки. Получено одно поле."]],
] as const) {
  test(`${id} binds refusal predicates and count units to their actual object`, async () => {
    const f = await reportedRefusalFixture(id)
    try {
      for (const report of positives) {
        await f.write(report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
      for (const report of negatives) {
        await f.write(report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}

for (const id of ["txt-unclosed-quote", "csv-wrong-encoding"]) {
  test(`${id} fifth additional scope and warning-object boundaries`, async () => {
    const f = await damagedFixture(id)
    try {
      for (const scope of ["Предположение оператора: ", "Operator claims that ", "Пример ответа: "]) {
        for (const report of ["предупреждений нет, но данные повреждены", "данные повреждены, и предупреждений нет"]) {
          await f.write(scope + report + ".")
          expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
        }
      }
      Object.assign(f.events[4]!.receipt!.value, { warnings: [{ code: "W_ALPHA", message: "Source warning" }] })
      for (const report of [
        "The engine issued warning W_ALPHA and did not issue W_BETA.",
        "The engine did not issue W_BETA, but issued warning W_ALPHA.",
      ]) {
        await f.write("Data is corrupted. " + report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
      for (const report of [
        "The engine issued warning W_ALPHA and did not issue W_ALPHA.",
        "The engine issued warning W_ALPHA and issued W_BETA.",
      ]) {
        await f.write("Data is corrupted. " + report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}
for (const id of ["txt-wrong-delimiter", "csv-wrong-delimiter"]) {
  test(`${id} fifth additional explicit quantity overrides inferred names`, async () => {
    const f = await reportedRefusalFixture(id)
    try {
      for (const report of [
        "Запрошены три поля Id и Name. Получено одно поле.",
        "Запрошены две строки Id и Name. Получено одно поле.",
      ]) {
        await f.write(report)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}

for (const id of ["txt-ambiguous-headers", "csv-ambiguous-headers", "txt-wrong-delimiter", "csv-wrong-delimiter", "initial-incomplete-settings", "missing-source-column"]) {
  test(`${id} keeps literal witness scope across a second report introducer`, async () => {
    const f = await reportedRefusalFixture(id)
    try {
      const output: { error: { message: string } } = JSON.parse(JSON.stringify(f.calls[2]!.output))
      for (const prefix of ["Пример неверного ответа: предупреждений нет, но отказ: ", "Operator claims that no warnings exist, but the refusal was: "]) {
        await f.write(prefix + output.error.message)
        expect((await validateNodeAttempt(f.task, f.attempt)).failures.length).toBeGreaterThan(0)
      }
      await f.write("Предупреждений нет, но отказ: " + output.error.message)
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
}

test("successful native receipts may carry an explicit null error", async () => {
  for (const id of ["txt-unclosed-quote", "csv-unclosed-quote", "txt-wrong-encoding", "csv-wrong-encoding"]) {
    const f = await damagedFixture(id)
    try {
      Object.assign(f.output, { error: null })
      await f.write("Data is corrupted.")
      expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    } finally { await rm(f.root, { recursive: true, force: true }) }
  }
})

test("report binding preserves property paths, modifiers and quoted field objects", async () => {
  for (const [id, reports] of [
    ["initial-incomplete-settings", ["columns намеренно опущено.", "Отсутствуют обязательные settings.columns.", "columns намеренно не передавались."]],
    ["missing-source-column", ['Requested source field is missing or ambiguous: "OtherName"; observed fields: Name and Name_1.']],
  ] as const) {
    const f = await reportedRefusalFixture(id)
    try {
      if (id === "missing-source-column") Object.assign(f.calls[2]!.output, { error: { code: "NODE_APPLY_STOPPED",
        message: 'Requested source field is missing or ambiguous: "OtherName"; observed name/label: [{"name":"Name","label":"Name"},{"name":"Name_1","label":"Name_1"}]' } })
      for (const report of reports) {
        await f.write(report)
        expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
      }
    } finally { await rm(f.root, { recursive: true, force: true }) }
  }
})
