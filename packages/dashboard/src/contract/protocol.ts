import { Schema } from "effect"
import { Column, Scalar } from "./snapshot.ts"

export const DashboardTable = Schema.Struct({
  schema: Schema.Array(Column),
  rows: Schema.Array(Schema.Array(Scalar)),
  truncated: Schema.Boolean,
  totalRows: Schema.Number,
}).check(Schema.makeFilter((table) => table.rows.every((row) => row.length === table.schema.length)))

export const StateMessage = Schema.Struct({
  type: Schema.Literal("state"),
  parameters: Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.Union([Schema.Null, Schema.Number]) })),
  table: Schema.Union([Schema.Null, DashboardTable]),
  error: Schema.Union([Schema.Null, Schema.String]),
  busy: Schema.Boolean,
})
