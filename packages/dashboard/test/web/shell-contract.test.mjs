import assert from "node:assert/strict"
import test from "node:test"
import { Option, Schema } from "effect"
import { LookupResponse, Snapshot } from "../../src/contract/snapshot.ts"
import { lookupResponse, snapshotResponse } from "../../src/shell/response.ts"

test("compact browser decoders agree with service schemas for every consumed response field", () => {
  const fields = [undefined, null, false, true, 0, 17, "", "target", [], {}, ["value"]]
  const snapshot = Schema.Struct({ id: Snapshot.fields.id, nodeName: Snapshot.fields.nodeName })
  for (const [decode, schema, keys] of [
    [lookupResponse, LookupResponse, ["key", "exists"]],
    [snapshotResponse, snapshot, ["id", "nodeName"]],
  ]) {
    const corpus = [
      undefined,
      null,
      false,
      17,
      "value",
      [],
      {},
      ...fields.flatMap((first) => fields.map((second) => ({ [keys[0]]: first, [keys[1]]: second }))),
    ]
    for (const input of corpus) {
      const expected = Schema.decodeUnknownOption(schema)(input)
      if (Option.isNone(expected)) assert.throws(() => decode(input), undefined, JSON.stringify(input))
      else assert.deepEqual(decode(input), expected.value)
    }
  }
})
