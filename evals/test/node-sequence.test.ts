import { expect, test } from "bun:test"
import { checkNodeSequence, readNodeEvents } from "../src/node-events"

const node = { document_id: "document", workflow_id: "workflow", node_id: "cross" }
const csv = "Region,A,B\nN,7.5,7\nS,3,2\n"
const initial = "Region,A,B\nN,15,7\nS,3,2\n"
function stage(op: string, aggregate: string, execution: string, value: number) {
  const input = { operation_id: op, document_id: node.document_id, workflow_ref: { workflow_id: node.workflow_id },
    target: { type: "transform.cross_table", kind: op === "sum" ? "new" : "existing", ref: node },
    parameters: { category_mode: "fixed", facts: [{ field: { name: "Amount" }, functions: [aggregate] }] } }
  const output = { operation_id: op, status: "SUCCEEDED", state: "settled", cleanup_complete: true, node,
    execution: { status: "completed", execution_id: execution },
    configuration: { status: "applied", readback: { kind: "crosstable", node, category_mode: "fixed",
      row_keys: [{ name: "Region" }], column: { name: "Category" }, facts: [{ name: "Amount", functions: [aggregate] }],
      options: { include_null: false, include_other: false, variable_bindings: {} }, execution_id: execution } },
    output: { status: "complete", execution_id: execution, ports: [{ port: 0, fresh: true, execution_id: execution,
      schema: [{ name: "Region" }, { name: "A" }, { name: "B" }], row_count: 2, sample_rows: 2, sample_complete: true,
      precision: { numbers_verified: true, limitations: [] }, sample: [["N", value, 7], ["S", 3, 2]].map(row => row.map(value => ({ value, is_null: false }))) }] } }
  return [event(op + "-start", "loginom_dock_node_apply", input, { operation_id: op, state: "running" }),
    event(op + "-end", "loginom_dock_node_wait", { operation_id: op }, output)]
}
function event(id: string, tool: string, input: unknown, output: unknown) {
  const start = ++clock * 10
  return { type: "tool_use", part: { id, tool, state: { status: "completed", input, output: JSON.stringify(output), time: { start, end: start + 1 } } } }
}
let clock = 0
function proof() {
  return [...stage("sum", "sum", "execution-1", 15), ...stage("avg", "avg", "execution-2", 7.5)]
}
function check(events: ReturnType<typeof proof>) {
  return checkNodeSequence(readNodeEvents(events.map(e => JSON.stringify(e)).join("\n")), "crosstable-reconfigure", "cross", csv, initial)
}
test("reconfigure требует sum/read → same-node avg/read с новым execution_id, без фиктивных повторных доставок", () => {
  expect(check(proof()).failures).toEqual([])
  const duplicate = proof()
  expect(check([...duplicate, duplicate[1]!]).failures).toEqual([])
  expect(check(proof().slice(2)).failures.join(" ")).toContain("initial")
  expect(check([...proof().slice(2), ...proof().slice(0, 2)]).failures.length).toBeGreaterThan(0)
  const replaced = proof(); const receipt = JSON.parse(replaced[3]!.part.state.output); receipt.node.node_id = "replacement"
  replaced[3]!.part.state.output = JSON.stringify(receipt)
  expect(check(replaced).failures.length).toBeGreaterThan(0)
  const stale = proof(); stale[3]!.part.state.output = stale[3]!.part.state.output.replaceAll("execution-2", "execution-1")
  expect(check(stale).failures.length).toBeGreaterThan(0)
  const partial = proof(); partial[1]!.part.state.output = partial[1]!.part.state.output.replace('"sample_complete":true', '"sample_complete":false')
  expect(check(partial).failures.length).toBeGreaterThan(0)
  const conflict = proof(); const changed = structuredClone(conflict[1]!); changed.part.state.output = changed.part.state.output.replace('"value":15', '"value":9')
  expect(check([...conflict, changed]).failures.length).toBeGreaterThan(0)
  const foreign = proof(); (foreign[2]!.part.state.input as any).target.ref = { ...node, document_id: "foreign" }
  expect(check(foreign).failures.length).toBeGreaterThan(0)
})

test("параллельный avg start до окончания initial read запрещён даже при правильном порядке строк JSONL", () => {
  const events = proof()
  events[2]!.part.state.time.start = events[1]!.part.state.time.start
  expect(check(events).failures.length).toBeGreaterThan(0)
})

test("отдельный node_read разрешён после completed apply и сам выполняется с новым fresh execution", () => {
  const events = [] as ReturnType<typeof proof>
  for (const [op, aggregate, execution, value] of [["sum", "sum", "1", 15], ["avg", "avg", "2", 7.5]] as const) {
    const pair = stage(op, aggregate, execution, value)
    const output = JSON.parse(pair[1]!.part.state.output)
    const readOutput = structuredClone(output)
    delete readOutput.configuration
    readOutput.operation_id = op + "-read"
    readOutput.execution.execution_id = execution + "-read"
    readOutput.output.execution_id = execution + "-read"
    readOutput.output.ports[0].execution_id = execution + "-read"
    output.output.ports = []
    pair[1]!.part.state.output = JSON.stringify(output)
    events.push(...pair, event(op + "-read", "loginom_dock_node_read", { operation_id: op + "-read", source_operation_id: op }, readOutput))
  }
  expect(check(events).failures).toEqual([])
})

test("native full допускает документированные snapshot ограничения при точных ячейках и binding, противоречия отвергаются", () => {
  const events = proof()
  for (const index of [1, 3]) {
    const output = JSON.parse(events[index]!.part.state.output), port = output.output.ports[0]
    port.precision.limitations = ["no_server_snapshot", "unobserved_aba_risk"]
    port.port_guid = "data-output"
    port.exact_table = { complete: true, rows: port.sample.map((row: any[]) => row.map(cell => {
      const native = typeof cell.value === "string" ? { encoding: "utf8", utf8_hex: Buffer.from(cell.value).toString("hex") } :
        { encoding: "ieee754-binary64-le", bytes_le: (() => { const bytes = Buffer.alloc(8); bytes.writeDoubleLE(cell.value); return bytes.toString("hex") })(), bits: 64 }
      return { ...cell, value: String(cell.value), precision: "exact_native", native }
    })) }
    port.read_coverage = { table_complete: true, rows_read: 2, columns_read: 3, cells_read: 6 }
    port.read_consistency = { changed: false, exclusive_operation: true, stability_basis: "owned_static_completed_fixture" }
    port.binding = { ...node, port_guid: port.port_guid, execution: output.execution }
    events[index]!.part.state.output = JSON.stringify(output)
  }
  expect(check(events).failures).toEqual([])
  const corrupt = structuredClone(events), output = JSON.parse(corrupt[3]!.part.state.output)
  output.output.ports[0].exact_table.rows[0][1].native.bytes_le = "0000000000000000"
  corrupt[3]!.part.state.output = JSON.stringify(output)
  expect(check(corrupt).failures.length).toBeGreaterThan(0)
  const foreign = structuredClone(events), wrong = JSON.parse(foreign[3]!.part.state.output)
  wrong.output.ports[0].binding.node_id = "foreign"
  foreign[3]!.part.state.output = JSON.stringify(wrong)
  expect(check(foreign).failures.length).toBeGreaterThan(0)
  const mistyped = structuredClone(events), typed = JSON.parse(mistyped[3]!.part.state.output)
  typed.output.ports[0].exact_table.rows[0][1].native = { encoding: "utf8", utf8_hex: Buffer.from("7.5").toString("hex") }
  mistyped[3]!.part.state.output = JSON.stringify(typed)
  expect(check(mistyped).failures.length).toBeGreaterThan(0)
})
