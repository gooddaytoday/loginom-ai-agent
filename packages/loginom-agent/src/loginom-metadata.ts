import { Schema } from "effect"
import { Busy } from "@loginom-ai-agent/loginom-host/step-progress"

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const maxBytes = 16 * 1024
const utf8 = new TextEncoder()
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

const savedPackageGraph = Schema.Union([
  Schema.Struct({ status: Schema.Literal("unavailable"), packagePath: Schema.NonEmptyString }),
  Schema.Struct({
    status: Schema.Literal("compared"),
    packagePath: Schema.NonEmptyString,
    scope: Schema.Literal("active_workflow"),
    renameAttribution: Schema.Literals(["observed_during_save", "unconfirmed"]),
    changes: Schema.Array(
      Schema.Union([
        Schema.Struct({
          kind: Schema.Literal("node_renamed"),
          nodeId: Schema.NonEmptyString,
          before: Schema.String,
          saved: Schema.String,
          observedBeforeSave: Schema.String,
          repair: Schema.Struct({ label: Schema.Literal("Попросить исправить"), prompt: Schema.String }),
        }),
        Schema.Struct({ kind: Schema.Literal("node_missing"), nodeId: Schema.NonEmptyString, before: Schema.String }),
        Schema.Struct({
          kind: Schema.Literals(["sorting_key_order", "sorting_field_order"]),
          nodeId: Schema.NonEmptyString,
          label: Schema.String,
          before: Schema.Array(Schema.String),
          saved: Schema.Array(Schema.String),
        }),
        Schema.Struct({
          kind: Schema.Literals(["link_removed", "link_added"]),
          endpoints: Schema.Tuple([Schema.String, Schema.String, Schema.String, Schema.String]),
        }),
      ]),
    ).check(Schema.isMaxLength(16)),
    savedLabels: Schema.Array(Schema.Struct({ nodeId: Schema.NonEmptyString, label: Schema.String })).check(
      Schema.isMaxLength(32),
    ),
    uncheckedSorting: count,
    truncated: Schema.Boolean,
  }),
]).check(
  Schema.makeFilter((graph) => utf8.encode(JSON.stringify(graph)).byteLength <= 8 * 1024, {
    expected: "Saved package graph of at most 8 KiB in UTF-8 JSON",
  }),
)

export const LoginomMetadata = Schema.Struct({
  v: Schema.Literal(1),
  operationId: Schema.NonEmptyString,
  attempt: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  kind: Schema.optional(Schema.Literals(["add", "configure", "execute", "export", "read"])),
  state: Schema.Literals(["running", "settled"]),
  busy: Schema.optional(Busy),
  savedPackageGraph: Schema.optional(savedPackageGraph),
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
}).check(
  Schema.makeFilter((metadata) => utf8.encode(JSON.stringify(metadata)).byteLength <= maxBytes, {
    expected: "Loginom metadata of at most 16 KiB in UTF-8 JSON",
  }),
)
export type LoginomMetadata = typeof LoginomMetadata.Type
