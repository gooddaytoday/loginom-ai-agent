import { Schema } from "effect"

const Guid = Schema.String.check(
  Schema.makeFilter((value) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)),
)
export const Binding = Schema.Struct({
  packagePath: Schema.String.check(Schema.makeFilter((value) => value.startsWith("/") && !value.includes("\0"))),
  workflowGuid: Guid,
  nodeGuid: Guid,
})

export const Scalar = Schema.Union([Schema.Null, Schema.String, Schema.Number, Schema.Boolean])
export const Column = Schema.Struct({ name: Schema.String, type: Schema.Union([Schema.String, Schema.Number]) })
export const Parameter = Schema.Struct({ name: Schema.String, value: Scalar })
export const TableSample = Schema.Struct({
  schema: Schema.Array(Column),
  rows: Schema.Array(Schema.Array(Scalar)),
}).check(Schema.makeFilter((table) => table.rows.every((row) => row.length === table.schema.length)))

export const SnapshotRequest = Schema.Struct({
  binding: Binding,
  nodeName: Schema.NonEmptyString,
  sample: TableSample.check(Schema.makeFilter((table) => table.rows.length <= 100)),
  parameters: Schema.Array(Parameter),
  published: Schema.Boolean,
})

export async function bindingKey(binding: typeof Binding.Type) {
  const text = JSON.stringify([binding.packagePath, binding.workflowGuid.toLowerCase(), binding.nodeGuid.toLowerCase()])
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

const Hash = Schema.String.check(Schema.makeFilter((value) => /^[a-f0-9]{64}$/.test(value)))
const HttpOrigin = Schema.String.check(
  Schema.makeFilter((value) => {
    const url = URL.parse(value)
    return url?.origin === value && (url.protocol === "http:" || url.protocol === "https:")
  }),
)
export const PublicationVersion = Schema.Struct({
  name: Schema.String.check(Schema.makeFilter(value => /^\d{8}T\d{6}Z\.json$/.test(value))),
  sourceHash: Schema.String.check(Schema.makeFilter(value => /^[a-f0-9]{64}$/.test(value))),
})
export type PublicationVersion = typeof PublicationVersion.Type
export const PublicationStatus = Schema.Struct({
  name: PublicationVersion.fields.name,
  sourceHash: Schema.NullOr(Hash),
  status: Schema.Literals(["pending", "building", "ready", "failed"]),
  buildHash: Schema.optional(Hash),
  error: Schema.optional(Schema.String),
})
export const LookupRequest = Schema.Struct({ ...Binding.fields, publication: Schema.optional(PublicationVersion.fields.name) })
export const LookupResponse = Schema.Struct({
  key: Schema.String,
  exists: Schema.Boolean,
  hash: Schema.Union([Schema.Null, Hash]),
  appOrigin: HttpOrigin,
  mode: Schema.Literals(["normal", "strict"]),
  cliButton: Schema.Boolean,
  currentVersion: Schema.NullOr(PublicationVersion),
  latest: Schema.NullOr(PublicationStatus),
  publication: Schema.NullOr(PublicationStatus),
})
export const ErrorResponse = Schema.Struct({ error: Schema.String })
export const Snapshot = Schema.Struct({ id: Schema.String, created: Schema.String, ...SnapshotRequest.fields })
