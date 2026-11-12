import assert from "node:assert/strict"
import test from "node:test"
import { Option, Schema } from "effect"
import { LookupResponse, Snapshot } from "../../src/contract/snapshot.ts"
import { lookupResponse, snapshotResponse } from "../../src/shell/response.ts"

test("compact browser decoders agree with service schemas for every consumed response field", () => {
  const fields = [undefined, null, false, true, 0, 17, "", "target", [], {}, ["value"]]
  const valid = {
    key: "k",
    exists: true,
    hash: "a".repeat(64),
    appOrigin: "http://dashboards.localhost:32769",
    mode: "normal",
  }
  const specials = {
    hash: ["A".repeat(64), "a".repeat(63), "g".repeat(64)],
    appOrigin: ["http://h:1/", "http://h:1/x", "ftp://h", "null", "http://h:80"],
    mode: ["strict", "Strict"],
  }
  const agree = (decode, schema, input) => {
    const expected = Schema.decodeUnknownOption(schema)(input)
    if (Option.isNone(expected)) {
      assert.throws(() => decode(input), undefined, JSON.stringify(input))
      return
    }
    assert.deepEqual(decode(input), expected.value, JSON.stringify(input))
  }
  agree(lookupResponse, LookupResponse, valid)
  for (const key of Object.keys(valid)) {
    for (const value of fields) agree(lookupResponse, LookupResponse, { ...valid, [key]: value })
    const missing = { ...valid }
    delete missing[key]
    agree(lookupResponse, LookupResponse, missing)
  }
  for (const [key, values] of Object.entries(specials)) {
    for (const value of values) agree(lookupResponse, LookupResponse, { ...valid, [key]: value })
  }

  const snapshot = Schema.Struct({ id: Snapshot.fields.id, nodeName: Snapshot.fields.nodeName })
  const corpus = [
    undefined,
    null,
    false,
    17,
    "value",
    [],
    {},
    ...fields.flatMap((first) => fields.map((second) => ({ id: first, nodeName: second }))),
  ]
  for (const input of corpus) agree(snapshotResponse, snapshot, input)
})
