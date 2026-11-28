import { Option, Schema } from "effect"

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const cell = Schema.Struct({
  type: Schema.String,
  cell_type: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number])),
  is_null: Schema.optionalKey(Schema.Boolean),
  value: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean]))),
  decimal: Schema.optionalKey(Schema.String),
  display_text: Schema.optionalKey(Schema.String),
  non_finite: Schema.optionalKey(Schema.String),
})

const rows = Schema.Array(Schema.Array(cell))

const columns = Schema.Array(
  Schema.Struct({
    index: count,
    name: Schema.String,
    label: Schema.optionalKey(Schema.String),
    type: Schema.String,
  }),
)

const port = Schema.Struct({
  index: count,
  guid: Schema.NonEmptyString,
  rowCount: count,
  columnCount: count,
  preview: Schema.optionalKey(
    Schema.Struct({ schema: columns, sample: rows.check(Schema.isMaxLength(10)), sampleComplete: Schema.Boolean }),
  ),
  details: Schema.optionalKey(
    Schema.Struct({
      delivered: Schema.Union([
        Schema.Struct({ kind: Schema.Literal("preview") }),
        Schema.Struct({ kind: Schema.Literal("rows"), rows }),
        Schema.Struct({
          kind: Schema.Literal("unavailable"),
          reason: Schema.Literals(["projection_limit", "rows_redacted"]),
        }),
      ]),
      columns: Schema.optionalKey(columns),
    }),
  ),
})

const tableRead = Schema.Struct({
  kind: Schema.Literal("tableRead"),
  port: count,
  portGuid: Schema.NonEmptyString,
  rowsRead: count,
  rowCount: count,
}).check(Schema.makeFilter((fact) => fact.rowsRead <= fact.rowCount))

const receipt = Schema.Struct({
  v: Schema.Literal(1),
  operationId: Schema.NonEmptyString,
  state: Schema.Literal("settled"),
  status: Schema.Literal("SUCCEEDED"),
  node: Schema.optionalKey(Schema.Struct({ guid: Schema.NonEmptyString, label: Schema.String, type: Schema.String })),
  ports: Schema.optionalKey(Schema.Array(Schema.Json)),
  evidence: Schema.optionalKey(Schema.Array(Schema.Json)),
  outputConfiguration: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ kind: Schema.Literal("confirmed"), readback: Schema.Json }),
      Schema.Struct({
        kind: Schema.Literal("unavailable"),
        reason: Schema.Literals(["configuration_not_confirmed", "projection_limit"]),
      }),
    ]),
  ),
})

const decodeReceipt = Schema.decodeUnknownOption(receipt)

const decodePort = Schema.decodeUnknownOption(port)

const decodeTableRead = Schema.decodeUnknownOption(tableRead)

export function decodeNodeOutput(value: Parameters<typeof decodeReceipt>[0]) {
  const output = Option.getOrUndefined(decodeReceipt(value))

  if (!output) return

  return {
    node: output.node,
    configuration: output.outputConfiguration?.kind === "confirmed" ? output.outputConfiguration.readback : undefined,
    ports: (output.ports ?? []).flatMap((value) => Option.toArray(decodePort(value))),
    reads: (output.evidence ?? []).flatMap((value) => Option.toArray(decodeTableRead(value))),
  }
}

export function deliveredRows(port: OutputPort, rowsRead: number | undefined) {
  const detail = port.details?.delivered
  const preview = port.preview

  if (detail?.kind === "rows") return detail.rows

  if (detail?.kind !== "preview" || !preview) return

  // The common producer can reduce preview after C3.11 marks it as the delivered rows.
  if (preview.sample.length === rowsRead || (preview.sampleComplete && preview.sample.length === port.rowCount))
    return preview.sample
}

const outputSample = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("available"),
    rows: rows.check(Schema.isMaxLength(100)),
    limitation: Schema.optionalKey(Schema.Literal("preview_limit")),
  }),
  Schema.Struct({ kind: Schema.Literal("unavailable"), reason: Schema.Literal("historical_only") }),
])

export const decodeOutputSample = Schema.decodeUnknownOption(outputSample)

export type NodeOutput = NonNullable<ReturnType<typeof decodeNodeOutput>>

export type OutputPort = typeof port.Type

export type OutputRows = typeof rows.Type

export type OutputSample = typeof outputSample.Type
