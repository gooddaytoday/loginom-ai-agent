import assert from "node:assert/strict"
import test from "node:test"
import { Option, Schema } from "effect"
import { LookupResponse, PublicationStatus } from "../../src/contract/snapshot.ts"
import { lookupResponse, snapshotResponse } from "../../src/shell/response.ts"

test("compact browser decoders agree with service schemas for every consumed response field", () => {
  const fields = [undefined, null, false, true, 0, 17, "", "target", [], {}, ["value"]]
  const valid = {
    key: "k",
    exists: true,
    hash: "a".repeat(64),
    appOrigin: "http://dashboards.localhost:32769",
    mode: "normal",
    cliButton: false,
    latest: null,
  }
  const specials = {
    hash: ["A".repeat(64), "a".repeat(63), "g".repeat(64)],
    appOrigin: ["http://h:1/", "http://h:1/x", "ftp://h", "null", "http://h:80"],
    mode: ["strict", "Strict"],
    cliButton: [true, false, "true", 1],
  }
  const agree = (decode, schema, input) => {
    const expected = Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })(input)
    if (Option.isNone(expected)) {
      assert.throws(() => decode(input), undefined, JSON.stringify(input))
      return
    }
    assert.deepEqual(decode(input), expected.value, JSON.stringify(input))
  }
  const latest = { name: "20261115T120000Z.json", status: "failed", error: "synthetic" }
  const consumed = Schema.Struct({ key: LookupResponse.fields.key, exists: LookupResponse.fields.exists, hash: LookupResponse.fields.hash, appOrigin: LookupResponse.fields.appOrigin, mode: LookupResponse.fields.mode, cliButton: LookupResponse.fields.cliButton,
    latest: Schema.NullOr(Schema.Struct({ name: PublicationStatus.fields.name, status: PublicationStatus.fields.status, error: PublicationStatus.fields.error })),
  })
  for (const key of Object.keys(latest)) {
    for (const value of [...fields, "pending", "building", "ready", "failed"]) agree(lookupResponse, consumed, { ...valid, latest: { ...latest, [key]: value } })
  }
  assert.deepEqual(lookupResponse({ ...valid, latest: { ...latest, sourceHash: "a".repeat(64) } }), { ...valid, latest })
  agree(lookupResponse, consumed, valid)
  for (const key of Object.keys(valid)) {
    for (const value of fields) agree(lookupResponse, consumed, { ...valid, [key]: value })
    const missing = { ...valid }
    delete missing[key]
    agree(lookupResponse, consumed, missing)
  }
  for (const [key, values] of Object.entries(specials)) {
    for (const value of values) agree(lookupResponse, consumed, { ...valid, [key]: value })
  }

  assert.deepEqual(lookupResponse({ ...valid, currentVersion: null, latest: null, publication: null }), valid)

  const snapshot = Schema.Struct({ id: Schema.String.check(
    Schema.makeFilter(value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)),
  ) })
  const id = "12345678-1234-1234-1234-123456789abc"
  const corpus = [
    undefined,
    null,
    false,
    17,
    "value",
    [],
    {},
    { id }, { id: id.toUpperCase() }, { id, nodeName: "extra" }, { id, extra: true },
    ...fields.map(id => ({ id })),
  ]
  for (const input of corpus) agree(snapshotResponse, snapshot, input)
})
