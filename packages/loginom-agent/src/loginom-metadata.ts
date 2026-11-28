import { Schema } from "effect"
import {
  LOGINOM_METADATA_FIELD_MAX_BYTES,
  LOGINOM_METADATA_MAX_BYTES,
  loginomMetadataBytes,
} from "../../loginom-runtime/client/lib/loginom-feed-metadata.mjs"

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const id = Schema.NonEmptyString
const stepId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/))
const busy = Schema.Struct({
  version: Schema.Literal(1),
  windowId: Schema.String.check(Schema.isUUID()),
  operationId: stepId,
  active: Schema.Boolean,
})
const step = Schema.Struct({
  outcome: Schema.Literals(["completed", "not_applied", "check_required"]),
  retryAvailable: Schema.Boolean,
  reason: Schema.optional(Schema.Literals(["unknown_write", "graph_conflict", "partial_effect"])),
  persistence: Schema.Literals(["saved_through", "step_unsaved", "unknown"]),
  save: Schema.NullOr(
    Schema.Struct({
      operationId: stepId,
      path: Schema.String,
      throughStep: Schema.Struct({ operationId: stepId, label: Schema.String.check(Schema.isMaxLength(240)) }),
    }),
  ),
})

const position = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const graphNode = Schema.Struct({ guid: id, label: Schema.String, type: id, position })
const graphLink = Schema.Struct({ source: id, output: id, target: id, input: id })
const manualEdits = Schema.Array(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literals(["node_added", "node_removed"]), node: graphNode }),
    Schema.Struct({ kind: Schema.Literal("node_renamed"), guid: id, from: Schema.String, to: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("node_moved"), guid: id, label: Schema.String, from: position, to: position }),
    Schema.Struct({
      kind: Schema.Literals(["link_added", "link_removed"]),
      link: graphLink,
      sourceLabel: Schema.String,
      targetLabel: Schema.String,
    }),
  ]),
)

const savedPackageIdentity = { saveOperationId: id, packagePath: Schema.String }
const savedChange = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("node_missing"), nodeId: id, before: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("node_renamed"),
    nodeId: id,
    before: Schema.String,
    saved: Schema.String,
    observedBeforeSave: Schema.String,
    repair: Schema.Struct({ label: Schema.String, prompt: Schema.String }),
  }),
  Schema.Struct({
    kind: Schema.Literals(["sorting_key_order", "sorting_field_order"]),
    nodeId: id,
    label: Schema.String,
    before: Schema.Array(Schema.String),
    saved: Schema.Array(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literals(["link_added", "link_removed"]), endpoints: Schema.Tuple([id, id, id, id]) }),
])
const savedPackageGraph = Schema.Union([
  Schema.Struct({ ...savedPackageIdentity, status: Schema.Literal("unavailable") }),
  Schema.Struct({
    ...savedPackageIdentity,
    status: Schema.Literal("compared"),
    scope: Schema.Literal("active_workflow"),
    savedLabels: Schema.Array(Schema.Struct({ nodeId: id, label: Schema.String })).check(Schema.isMaxLength(32)),
    changes: Schema.Array(savedChange).check(Schema.isMaxLength(16)),
    uncheckedSorting: Schema.Array(id).check(Schema.isMaxLength(32)),
    truncated: Schema.optional(Schema.Boolean),
    renameAttribution: Schema.Literals(["unconfirmed", "observed_during_save"]),
  }),
])

type Field = keyof typeof LOGINOM_METADATA_FIELD_MAX_BYTES
const fieldBudget = (field: Field) =>
  Schema.makeFilter((value) => loginomMetadataBytes(value) <= LOGINOM_METADATA_FIELD_MAX_BYTES[field], {
    expected: `${field} within its UTF-8 JSON byte budget`,
  })

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
  busy: Schema.optional(busy.check(fieldBudget("busy"))),
  step: Schema.optional(step.check(fieldBudget("step"))),
  manualEdits: Schema.optional(manualEdits.check(fieldBudget("manualEdits"))),
  verificationStale: Schema.optional(Schema.Boolean.check(fieldBudget("verificationStale"))),
  savedPackageGraph: Schema.optional(savedPackageGraph.check(fieldBudget("savedPackageGraph"))),
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
  Schema.makeFilter((metadata) => loginomMetadataBytes(metadata) <= LOGINOM_METADATA_MAX_BYTES, {
    expected: "Loginom metadata of at most 16 KiB in UTF-8 JSON",
  }),
)
export type LoginomMetadata = typeof LoginomMetadata.Type
