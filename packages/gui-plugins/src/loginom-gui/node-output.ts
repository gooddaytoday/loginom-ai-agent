import { Schema } from "effect"

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const sampleCount = count.check(Schema.isLessThanOrEqualTo(100))

const cell = Schema.Struct({
  type: Schema.String,
  cell_type: Schema.optionalKey(Schema.String),
  is_null: Schema.Boolean,
  value: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean]))),
  decimal: Schema.optionalKey(Schema.String),
  display_text: Schema.optionalKey(Schema.String),
  non_finite: Schema.optionalKey(Schema.String),
})

const rows = Schema.Array(Schema.Array(cell))

const port = Schema.Struct({
  port: count,
  portGuid: Schema.NonEmptyString,
  summary: Schema.Struct({ rowCount: count }),
  detail: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("delivered"),
      sample: rows,
      exactRows: Schema.optionalKey(rows),
    }),
    Schema.Struct({ kind: Schema.Literal("unavailable"), reason: Schema.Literal("rows_not_delivered") }),
  ]),
  expanded: Schema.Struct({
    columns: Schema.NullOr(
      Schema.Array(
        Schema.Struct({ name: Schema.String, label: Schema.optionalKey(Schema.String), type: Schema.String }),
      ),
    ),
    sample: Schema.Struct({
      targetRows: sampleCount,
      availableRows: count,
      limitation: Schema.optionalKey(Schema.Literal("more_rows_not_delivered")),
    }),
  }),
})

const receipt = Schema.Struct({
  version: Schema.Literal(1),
  operationId: Schema.NonEmptyString,
  executionId: Schema.NonEmptyString,
  node: Schema.Struct({ node_id: Schema.NonEmptyString }),
  ports: Schema.Array(port),
  how: Schema.Struct({ configuration: Schema.Json }),
})

const counters = Schema.Struct({
  v: Schema.Literal(1),
  state: Schema.Literal("settled"),
  status: Schema.Literal("SUCCEEDED"),
  evidence: Schema.Array(
    Schema.Union([
      Schema.Struct({
        kind: Schema.Literal("tableRead"),
        port: count,
        portGuid: Schema.NonEmptyString,
        rowsRead: count,
        rowCount: count,
      }).check(Schema.makeFilter((fact) => fact.rowsRead <= fact.rowCount)),
      Schema.Struct({ kind: Schema.Literals(["executed", "saved", "savedGraphRead"]) }),
    ]),
  ),
  ports: Schema.optionalKey(Schema.Array(Schema.Struct({ guid: Schema.NonEmptyString, columnCount: count }))),
})

export const decodeNodeOutput = Schema.decodeUnknownOption(receipt)

export const decodeOutputCounters = Schema.decodeUnknownOption(counters)

const outputSample = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("available"),
    rows: rows.check(Schema.isMaxLength(100)),
    targetRows: sampleCount,
    limitation: Schema.optionalKey(Schema.Literal("preview_limit")),
  }),
  Schema.Struct({ kind: Schema.Literal("unavailable"), reason: Schema.Literal("historical_only") }),
])

export const decodeOutputSample = Schema.decodeUnknownOption(outputSample)

export type NodeOutput = typeof receipt.Type

export type OutputPort = typeof port.Type

export type OutputRows = typeof rows.Type

export type OutputSample = typeof outputSample.Type
