import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { Option, Schema } from "effect"
import { StateMessage } from "../../src/contract/protocol.ts"
import { isState } from "../../src/sdk/loginom.ts"

const valid = {
  type: "state",
  parameters: [{ name: "Budget", value: 10 }],
  table: { schema: [{ name: "count", type: 1 }], rows: [[42]], truncated: false, totalRows: 1 },
  error: null,
  busy: false,
}
const fields = [undefined, null, false, true, 0, NaN, 17, "", "x", [], {}, [1]]
const at = (input, path) => path.reduce((value, key) => value[key], input)

test("SDK state validation agrees with the protocol schema for every nested field", () => {
  const agree = input => assert.equal(
    isState(input),
    Option.isSome(Schema.decodeUnknownOption(StateMessage, { onExcessProperty: "error" })(input)),
    JSON.stringify(input),
  )
  agree(valid)
  for (const input of fields) agree(input)
  for (const path of [[], ["parameters", 0], ["table"], ["table", "schema", 0]]) {
    for (const key of Object.keys(at(valid, path))) {
      for (const value of fields) {
        const input = structuredClone(valid)
        at(input, path)[key] = value
        agree(input)
      }
      const input = structuredClone(valid)
      delete at(input, path)[key]
      agree(input)
    }
    const input = structuredClone(valid)
    at(input, path).extra = true
    agree(input)
  }
  for (const value of fields) {
    agree({ ...valid, parameters: [value] })
    agree({ ...valid, table: { ...valid.table, schema: [value] } })
    agree({ ...valid, table: { ...valid.table, rows: [value] } })
    agree({ ...valid, table: { ...valid.table, rows: [[value]] } })
  }
  const short = { ...valid, table: { ...valid.table, rows: [[]] } }
  assert.equal(isState(short), false)
  assert.equal(Option.isSome(Schema.decodeUnknownOption(StateMessage)(short)), false)
})

test("the template SDK is byte-for-byte identical to the canonical SDK", async () => {
  assert.deepEqual(
    await readFile(new URL("../../template/src/loginom.ts", import.meta.url)),
    await readFile(new URL("../../src/sdk/loginom.ts", import.meta.url)),
  )
})

test("all three examples carry the canonical SDK byte-for-byte", async () => {
  const sdk = await readFile(new URL("../../src/sdk/loginom.ts", import.meta.url))
  for (const key of [
    "roi",
    "campaign-summary",
    "channel-summary",
  ]) assert.equal(Buffer.compare(await readFile(new URL(`../../examples/${key}/src/loginom.ts`, import.meta.url)), sdk), 0, key)
})

test("SDK rejects sparse arrays just as the protocol schema does", () => {
  for (const input of [
    { ...valid, parameters: Array(1) },
    { ...valid, table: { ...valid.table, schema: Array(1) } },
    { ...valid, table: { ...valid.table, rows: Array(1) } },
    { ...valid, table: { ...valid.table, rows: [Array(1)] } },
  ]) {
    assert.equal(Option.isSome(Schema.decodeUnknownOption(StateMessage)(input)), false)
    assert.equal(isState(input), false)
  }
})
