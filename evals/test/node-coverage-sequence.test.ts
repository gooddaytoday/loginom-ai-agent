import { expect, test } from "bun:test"
import { checkNodeSequence, readNodeEvents, type NodeEvents } from "../src/node-events"

// Synthetic protocol projections for sensitivity tests, never delivered as native evidence.
const cases = [
  { id: "crosstable-string-counts-null", dimensions: ["Category"], facts: [{ name: "Text", type: "string", order: 0, functions: ["count", "unique_count", "null_count"] }],
    names: ["Region", "A_count", "A_unique", "A_null", "B_count", "B_unique", "B_null"], types: ["string", "integer", "integer", "integer", "integer", "integer", "integer"],
    fields: [["A", "Text", "count"], ["A", "Text", "unique_count"], ["A", "Text", "null_count"], ["B", "Text", "count"], ["B", "Text", "unique_count"], ["B", "Text", "null_count"]],
    rows: [["N", 3, 1, 1, 1, 1, 0], ["S", 1, 0, 1, 2, 2, 0]], csv: "Region,A_count,A_unique,A_null,B_count,B_unique,B_null\nN,3,1,1,1,1,0\nS,1,0,1,2,2,0\n" },
  { id: "crosstable-column-cartesian", dimensions: ["Category", "Channel"], facts: [{ name: "Amount", type: "real", order: 0, functions: ["sum"] }],
    names: ["Region", "A_web", "A_shop", "B_web", "B_shop"], types: ["string", "real", "real", "real", "real"], fields: [["A|web", "Amount", "sum"], ["A|shop", "Amount", "sum"], ["B|web", "Amount", "sum"], ["B|shop", "Amount", "sum"]],
    rows: [["N", 15, null, null, 7], ["S", 3, null, null, 2]], csv: "Region,A_web,A_shop,B_web,B_shop\nN,15,,,7\nS,3,,,2\n" },
  { id: "crosstable-multi-facts", dimensions: ["Category"], facts: [{ name: "Amount", type: "real", order: 0, functions: ["sum"] }, { name: "Units", type: "integer", order: 1, functions: ["max"] }],
    names: ["Region", "A_amount_sum", "A_units_max", "B_amount_sum", "B_units_max"], types: ["string", "real", "integer", "real", "integer"], fields: [["A", "Amount", "sum"], ["A", "Units", "max"], ["B", "Amount", "sum"], ["B", "Units", "max"]],
    rows: [["N", 15, 4, 7, 2], ["S", 3, 3, 2, 5]], csv: "Region,A_amount_sum,A_units_max,B_amount_sum,B_units_max\nN,15,4,7,2\nS,3,3,2,5\n" },
]
const protocol = await Bun.file(new URL("fixtures/node-evals/min-max-protocol.json", import.meta.url)).json()
function fixture(c: typeof cases[number]) {
  const events = readNodeEvents(protocol.map((p: unknown) => JSON.stringify(p)).join("\n"))
  for (const call of events.calls) {
    if (call.input.target?.type === "transform.cross_table" && call.input.target.kind === "new") call.input.parameters = {
      row_keys: [{ kind: "input_field", name: "Region" }], columns: c.dimensions.map(name => ({ kind: "input_field", name })),
      facts: c.facts.map(f => ({ field: { kind: "input_field", name: f.name }, functions: f.functions })), category_mode: "fixed", include_null: false, include_other: false,
    }
    const rb = call.output.configuration?.readback
    if (rb?.kind !== "crosstable") continue
    rb.facts = structuredClone(c.facts); rb.columns = c.dimensions.map((name, order) => ({ name, label: name, type: "string", order })); rb.column = rb.columns[0]
    rb.output_mapping = undefined
    const p = call.output.output.ports[0]
    p.schema = c.names.map((name, index) => ({ name, index, label: name, type: c.types[index] }))
    p.category_fields = c.fields.map(([category, fact, fn], index) => ({ category, fact, function: fn, field: c.names[index + 1], label: c.names[index + 1], type: c.types[index + 1], category_kind: "value",
      ...(c.dimensions.length === 2 ? { categories: category!.split("|").map((value, i) => ({ dimension: c.dimensions[i], caption: value, value, kind: "value" })) } : {}) }))
    p.read_coverage.columns_read = c.names.length; p.read_coverage.cells_read = c.names.length * 2
    p.exact_table.rows = c.rows.map(row => row.map((value, i) => {
      const type = c.types[i]
      if (value === null) return { type, value: null, is_null: true, precision: "exact_native", native: { tag: 1, encoding: "null" } }
      const bytes = Buffer.alloc(8)
      if (type === "real") bytes.writeDoubleLE(Number(value))
      if (type === "integer") bytes.writeBigInt64LE(BigInt(value))
      return { type, value: String(value), is_null: false, precision: "exact_native", native: type === "string" ? { tag: 8, encoding: "utf8", utf8_hex: Buffer.from(String(value)).toString("hex") } : { tag: type === "integer" ? 20 : 5, encoding: type === "integer" ? "signed-int64-le" : "ieee754-binary64-le", bits: 64, bytes_le: bytes.toString("hex") } }
    }))
    p.sample = structuredClone(p.exact_table.rows)
  }
  return events
}
for (const c of cases) test(`${c.id}: full native typed/null table and configuration sensitivity`, () => {
  const check = (events: NodeEvents) => checkNodeSequence(events, c.id, events.calls.find(x => x.output.configuration?.readback?.kind === "crosstable")!.output.node.node_id, c.csv).failures
  expect(check(fixture(c))).toEqual([])
  const mutations = [
    (e: NodeEvents) => { e.calls.filter(x => x.output.configuration?.readback?.kind === "crosstable").forEach(x => { x.output.configuration.readback.facts[0].functions = ["min"] }) },
    (e: NodeEvents) => { e.calls.filter(x => x.output.configuration?.readback?.kind === "crosstable").forEach(x => { x.output.output.ports[0].exact_table.rows.pop() }) },
    (e: NodeEvents) => { e.calls.filter(x => x.output.configuration?.readback?.kind === "crosstable").forEach(x => { x.output.output.ports[0].category_fields[0].fact = "other" }) },
    (e: NodeEvents) => { e.calls.filter(x => x.output.configuration?.readback?.kind === "crosstable").forEach(x => { x.output.output.ports[0].schema[1].type = "string" }) },
    (e: NodeEvents) => { e.calls.filter(x => x.output.configuration?.readback?.kind === "crosstable").forEach(x => { x.output.output.ports[0].exact_table.rows[0][1].type = "string" }) },
    (e: NodeEvents) => { e.calls.filter(x => x.output.configuration?.readback?.kind === "crosstable").forEach(x => { x.output.output.ports[0].exact_table.rows[0][1].native.tag = 8 }) },
    (e: NodeEvents) => { e.calls.filter(x => x.input.target?.type === "transform.cross_table").forEach(x => { x.input.target.kind = "existing" }) },
    (e: NodeEvents) => { e.calls.find(x => x.input.target?.kind === "new" && x.input.target?.type === "transform.cross_table")!.input.parameters = {} },
  ]
  if (c.dimensions.length === 2) mutations.push(e => { e.calls.filter(x => x.output.configuration?.readback?.kind === "crosstable").forEach(x => { x.output.output.ports[0].category_fields[0].categories.reverse() }) })
  for (const mutate of mutations) { const events = fixture(c); mutate(events); expect(check(events).length).toBeGreaterThan(0) }
})
