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
  return { type: "tool_use", part: { id, tool, state: { status: "completed", input, output: JSON.stringify(output) } } }
}
function proof() {
  return [...stage("sum", "sum", "execution-1", 15), ...stage("avg", "avg", "execution-2", 7.5)]
}
function check(events: ReturnType<typeof proof>) {
  return checkNodeSequence(readNodeEvents(events.map(e => JSON.stringify(e)).join("\n")), "crosstable-reconfigure", "cross", csv, initial)
}
test("reconfigure требует sum/read → same-node avg/read с новым execution_id, без фиктивных повторных доставок", () => {
  expect(check(proof()).failures).toEqual([])
  expect(check([...proof(), proof()[1]!]).failures).toEqual([])
  expect(check(proof().slice(2)).failures.join(" ")).toContain("initial")
  expect(check([...proof().slice(2), ...proof().slice(0, 2)]).failures.length).toBeGreaterThan(0)
  const replaced = proof(); const receipt = JSON.parse(replaced[3]!.part.state.output); receipt.node.node_id = "replacement"
  replaced[3]!.part.state.output = JSON.stringify(receipt)
  expect(check(replaced).failures.length).toBeGreaterThan(0)
  const stale = proof(); stale[3]!.part.state.output = stale[3]!.part.state.output.replaceAll("execution-2", "execution-1")
  expect(check(stale).failures.length).toBeGreaterThan(0)
  const partial = proof(); partial[1]!.part.state.output = partial[1]!.part.state.output.replace('"sample_complete":true', '"sample_complete":false')
  expect(check(partial).failures.length).toBeGreaterThan(0)
  const conflict = proof(); const duplicate = structuredClone(conflict[1]!); duplicate.part.state.output = duplicate.part.state.output.replace('"value":15', '"value":9')
  expect(check([...conflict, duplicate]).failures.length).toBeGreaterThan(0)
  const foreign = proof(); (foreign[2]!.part.state.input as any).target.ref = { ...node, document_id: "foreign" }
  expect(check(foreign).failures.length).toBeGreaterThan(0)
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
