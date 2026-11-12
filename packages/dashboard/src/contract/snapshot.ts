import { Schema } from "effect"

export const Binding = Schema.Struct({
  server: Schema.String,
  packagePath: Schema.String,
  workflowGuid: Schema.String,
  nodeGuid: Schema.String,
  port: Schema.Literal(0),
})

export const Scalar = Schema.Union([Schema.Null, Schema.String, Schema.Number, Schema.Boolean])
export const Column = Schema.Struct({ name: Schema.String, type: Schema.Union([Schema.String, Schema.Number]) })
export const Parameter = Schema.Struct({ name: Schema.String, value: Scalar })
export const TableSample = Schema.Struct({
  schema: Schema.Array(Column),
  rows: Schema.Array(Schema.Array(Scalar)),
}).check(Schema.makeFilter((table) => table.rows.every((row) => row.length === table.schema.length)))

// sample takes precedence, so legacy schema/rows are decoded only when sample is omitted.
export const SnapshotRequest = Schema.Struct({
  binding: Binding,
  nodeName: Schema.NonEmptyString,
  sample: Schema.optional(Schema.Unknown),
  schema: Schema.optional(Schema.Unknown),
  rows: Schema.optional(Schema.Unknown),
  parameters: Schema.Array(Parameter),
})

const Hash = Schema.String.check(Schema.makeFilter((value) => /^[a-f0-9]{64}$/.test(value)))
const HttpOrigin = Schema.String.check(
  Schema.makeFilter((value) => {
    const url = URL.parse(value)
    return url?.origin === value && (url.protocol === "http:" || url.protocol === "https:")
  }),
)
export const LookupResponse = Schema.Struct({
  key: Schema.String,
  exists: Schema.Boolean,
  hash: Schema.Union([Schema.Null, Hash]),
  appOrigin: HttpOrigin,
  mode: Schema.Literals(["normal", "strict"]),
})
export const ErrorResponse = Schema.Struct({ error: Schema.String })
export const Snapshot = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  sourceDir: Schema.String,
  binding: Binding,
  nodeName: Schema.String,
  schema: Schema.Array(Column),
  rows: Schema.Array(Schema.Array(Scalar)),
  tableSource: Schema.Literals(["live", "unavailable", "published-example"]),
  parameters: Schema.Array(Parameter),
  adapter: Schema.String,
  commands: Schema.Struct({
    init: Schema.String,
    typecheck: Schema.String,
    build: Schema.String,
    publish: Schema.String,
  }),
})
