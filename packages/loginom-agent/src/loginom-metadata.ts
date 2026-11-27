import { Schema } from "effect"

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const cell = Schema.Struct({
  type: Schema.String,
  is_null: Schema.optional(Schema.Boolean),
  value: Schema.optional(Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null])),
  decimal: Schema.optional(Schema.String),
  representation: Schema.optional(Schema.String),
  display_text: Schema.optional(Schema.String),
  precision: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
  cell_type: Schema.optional(Schema.Union([Schema.String, Schema.Number])),
  non_finite: Schema.optional(Schema.String),
})

export const LoginomMetadata = Schema.Struct({
  v: Schema.Literal(1),
  operationId: Schema.NonEmptyString,
  attempt: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  kind: Schema.optional(Schema.Literals(["add", "configure", "execute", "export", "read"])),
  state: Schema.Literals(["running", "settled"]),
  status: Schema.optional(Schema.Literals(["SUCCEEDED", "FAILED", "NOT_APPLIED", "AMBIGUOUS"])),
  phase: Schema.optional(Schema.String),
  node: Schema.optional(
    Schema.Struct({ guid: Schema.NonEmptyString, label: Schema.String, type: Schema.NonEmptyString }),
  ),
  executionId: Schema.optional(Schema.String),
  executionStatus: Schema.optional(
    Schema.Literals(["not_requested", "pending", "completed", "cancelled", "unknown", "failed"]),
  ),
  effectPossible: Schema.optional(Schema.Boolean),
  cleanupComplete: Schema.optional(Schema.Boolean),
  limitations: Schema.optional(Schema.Array(Schema.String)),
  nextStep: Schema.optional(Schema.Struct({ tool: Schema.optional(Schema.String), instruction: Schema.String })),
  ports: Schema.optional(
    Schema.Array(
      Schema.Struct({
        index: count,
        guid: Schema.NonEmptyString,
        rowCount: count,
        columnCount: count,
        preview: Schema.optional(
          Schema.Struct({
            schema: Schema.Array(
              Schema.Struct({
                index: count,
                name: Schema.String,
                label: Schema.optional(Schema.String),
                type: Schema.String,
                data_kind: Schema.optional(Schema.String),
              }),
            ),
            sample: Schema.Array(Schema.Array(cell)).check(Schema.isMaxLength(10)),
            sampleComplete: Schema.Boolean,
          }),
        ),
      }),
    ),
  ),
  error: Schema.optional(
    Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      source: Schema.Literals(["loginom", "runtime", "host"]),
      attribution: Schema.optional(Schema.Literals(["verified_node", "after_launch"])),
    }),
  ),
  files: Schema.optional(
    Schema.Array(Schema.Struct({ artifactId: Schema.NonEmptyString, name: Schema.String, bytes: count })),
  ),
})
export type LoginomMetadata = typeof LoginomMetadata.Type
