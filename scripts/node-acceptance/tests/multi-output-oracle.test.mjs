import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { compareMultiOutput, MULTI_OUTPUT_VERSION } from "../multi-output-oracle.mjs"

const cell = (type, value) => ({ type, is_null: value === null, value })
const schema = [
  { index: 0, name: "RowID", label: "Occurrence", type: "integer", data_kind: "discrete", null_semantics: "typed_null" },
  { index: 1, name: "Computed", label: "Computed", type: "real", data_kind: "continuous", null_semantics: "typed_null" },
  { index: 2, name: "Payload", label: "Payload", type: "string", data_kind: "discrete", null_semantics: "typed_null" },
]
const row = (id, number = 0, payload = null) => [cell("integer", id), cell("real", number), cell("string", payload)]
// Independently specified tiny fixtures; no runtime/product observation imports.
const expected = {
  version: MULTI_OUTPUT_VERSION,
  owner: { source_sha: "synthetic-source", package_path: "/lab-slot-a/synthetic.lgp", workflow_id: "graph", node_id: "node" },
  ports: [0, 1, 2].map(index => ({ index, role: `output-${index}`, guid: `owned-${index}`, schema,
    comparator: "sequence", rules: [{ kind: "exact" }, { kind: "computed_real" }, { kind: "exact" }],
    rows: index === 0 ? [row("2"), row("1"), row("2")] : index === 1 ? [row("9007199254740993", 1, "NULL")] : [],
  })),
  invariants: [],
}
function observed(want = expected) {
  return { version: MULTI_OUTPUT_VERSION, owner: structuredClone(want.owner),
    execution: { id: "fresh-run", status: "completed", fresh: true, owner_verified: true },
    ports: want.ports.map(port => ({ index: port.index, role: port.role, guid: port.guid, execution_id: "fresh-run",
      schema: structuredClone(port.schema), schema_source: "fresh_native", filter_enabled: false, complete: true,
      row_count: port.rows.length, rows: structuredClone(port.rows) })) }
}
const verdict = (want, actual, status) => assert.equal(compareMultiOutput(want, actual).status, status)

test("three owned ports, empty schema-bearing output, exact int64 and typed NULL", () => verdict(expected, observed(), "PASS"))
test("sequence differs while multiset preserves multiplicities", () => {
  const actual = observed()
  actual.ports[0].rows = [row("1"), row("2"), row("2")]
  verdict(expected, actual, "FAIL")
  const want = structuredClone(expected)
  want.ports[0].comparator = "multiset"
  verdict(want, actual, "PASS")
})
for (const [name, change] of [
  ["wrong value", actual => { actual.ports[0].rows[0][0].value = "3" }],
  ["rounded int64", actual => { actual.ports[1].rows[0][0].value = "9007199254740992" }],
  ["numeric int64", actual => { actual.ports[1].rows[0][0].value = 9007199254740992 }],
  ["wrong typed NULL", actual => { actual.ports[0].rows[0][2] = cell("string", "") }],
  ["foreign GUID", actual => { actual.ports[2].guid = "foreign" }],
  ["missing port", actual => { actual.ports.pop() }],
  ["duplicate port", actual => { actual.ports[2].index = 1 }],
  ["wrong schema label", actual => { actual.ports[2].schema[0].label = "Wrong" }],
  ["wrong schema data kind", actual => { actual.ports[2].schema[0].data_kind = "continuous" }],
  ["wrong schema order", actual => { actual.ports[2].schema.reverse() }],
  ["lost occurrence", actual => { actual.ports[0].rows.pop(); actual.ports[0].row_count-- }],
  ["extra occurrence", actual => { actual.ports[0].rows.push(row("2")); actual.ports[0].row_count++ }],
  ["stale port execution", actual => { actual.ports[2].execution_id = "old" }],
  ["stale execution", actual => { actual.execution.fresh = false }],
  ["active filter", actual => { actual.ports[2].filter_enabled = true }],
  ["partial page", actual => { actual.ports[0].complete = false }],
  ["cached schema", actual => { actual.ports[0].schema_source = "cached" }],
  ["unknown observation field", actual => { actual.ignore = true }],
  ["NaN", actual => { actual.ports[0].rows[0][1].value = NaN }],
  ["Infinity", actual => { actual.ports[0].rows[0][1].value = Infinity }],
]) test(name, () => { const actual = observed(); change(actual); verdict(expected, actual, "FAIL") })

for (const [value, port, status] of [[5e-13, 0, "PASS"], [2e-12, 0, "FAIL"], [1 + 3e-12, 1, "FAIL"]]) {
  test(`computed tolerance ${value}: ${status}`, () => {
    const actual = observed()
    actual.ports[port].rows[0][1].value = value
    verdict(expected, actual, status)
  })
}
test("payload real remains exact", () => {
  const want = structuredClone(expected)
  want.ports[0].rules[1] = { kind: "exact" }
  const actual = observed(want)
  actual.ports[0].rows[0][1].value = 5e-13
  verdict(want, actual, "FAIL")
})
for (const [name, change] of [
  ["version", want => { want.version = undefined }],
  ["unknown comparator", want => { want.ports[0].comparator = "sort" }],
  ["unknown rule", want => { want.ports[0].rules[0].kind = "approximately" }],
  ["integer tolerance", want => { want.ports[0].rules[0].kind = "computed_real" }],
  ["unknown field", want => { want.ports[0].rules[0].ignore = true }],
  ["unknown invariant", want => { want.invariants.push({ kind: "anything" }) }],
]) test(`fail closed: ${name}`, () => { const want = structuredClone(expected); change(want); verdict(want, observed(), "FAIL") })

test("independent partition sizes, provenance, exact payload, occurrence coverage", () => {
  const want = structuredClone(expected)
  want.ports.forEach(port => { port.comparator = "invariants"; port.rows = [] })
  want.invariants = [{ kind: "partition", ports: [0, 1, 2], sizes: [1, 1, 0],
    source_rows: [row("1", 3, "A"), row("2", 4, "B")], provenance_field: "RowID", replacement: false }]
  const actual = observed(want)
  actual.ports[0].rows = [row("2", 4, "B")]; actual.ports[0].row_count = 1
  actual.ports[1].rows = [row("1", 3, "A")]; actual.ports[1].row_count = 1
  verdict(want, actual, "PASS")
  for (const corrupt of [
    bad => { bad.ports[1].rows = [row("2", 4, "B")] },
    bad => { bad.ports[0].rows = [row("2", 4, "Wrong")] },
    bad => { bad.ports[0].rows = [row("3", 4, "B")] },
    bad => { bad.ports[1].rows = []; bad.ports[1].row_count = 0 },
  ]) { const bad = structuredClone(actual); corrupt(bad); verdict(want, bad, "FAIL") }
  want.invariants[0].replacement = true
  actual.ports[1].rows = [row("2", 4, "B")]
  verdict(want, actual, "PASS")
})

test("executable emits comparator FAIL and nonzero exit, not shell success", async () => {
  const directory = await mkdtemp(join(process.env.TMPDIR, "oracle-control-"))
  try {
    const expectedPath = join(directory, "expected.json")
    const observationPath = join(directory, "observation.json")
    const outputPath = join(directory, "result.json")
    await writeFile(expectedPath, JSON.stringify(expected))
    for (const status of ["PASS", "FAIL"]) {
      const actual = observed()
      if (status === "FAIL") actual.ports[2].complete = false
      await writeFile(observationPath, JSON.stringify(actual))
      const command = spawnSync(process.execPath, [new URL("../compare-output.mjs", import.meta.url).pathname,
        "--expected", expectedPath, "--observation", observationPath, "--output", outputPath], { encoding: "utf8" })
      assert.equal(command.status, status === "PASS" ? 0 : 1)
      assert.equal(JSON.parse(await readFile(outputPath, "utf8")).status, status)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
