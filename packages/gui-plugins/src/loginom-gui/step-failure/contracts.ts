import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

export const OperationId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/))

const stepRef = Schema.Struct({ operationId: OperationId, label: Schema.String.check(Schema.isMaxLength(240)) })

const step = Schema.Struct({
  outcome: Schema.Literals(["completed", "not_applied", "check_required"]),
  retryAvailable: Schema.Boolean,
  reason: Schema.optional(Schema.Literals(["unknown_write", "graph_conflict", "partial_effect"])),
  persistence: Schema.Literals(["saved_through", "step_unsaved", "unknown"]),
  save: Schema.NullOr(Schema.Struct({ operationId: OperationId, path: Schema.String, throughStep: stepRef })),
})

export const RecoveryMetadata = Schema.Struct({
  v: Schema.Literal(1),
  operationId: Schema.NonEmptyString,
  state: Schema.Literals(["running", "settled"]),
  kind: Schema.optional(Schema.Literals(["add", "configure", "execute", "export", "read"])),
  status: Schema.optional(Schema.Literals(["SUCCEEDED", "FAILED", "NOT_APPLIED", "AMBIGUOUS"])),
  step: Schema.optional(step),
})

export type Step = typeof step.Type

const wire = Schema.toStandardSchemaV1

export const WriteOutcomeRpc = Rpc.define({
  id: "loginom.write-outcome",
  methods: {
    check: {
      input: wire(Schema.Struct({ sessionID: Schema.NonEmptyString, operationId: OperationId })),
      output: wire(
        Schema.Struct({
          status: Schema.Literals(["applied", "not_applied", "unknown"]),
          operationId: Schema.optional(OperationId),
          step: Schema.optional(step),
          readback: Schema.optional(Schema.Literals(["unchanged", "changed", "observed", "unavailable"])),
        }),
      ),
    },
  },
  events: {},
})
