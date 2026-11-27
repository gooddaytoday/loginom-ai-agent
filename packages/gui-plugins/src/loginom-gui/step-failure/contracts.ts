import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

const id = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/))

const stepRef = Schema.Struct({ operationId: id, label: Schema.String.check(Schema.isMaxLength(240)) })

const step = Schema.Struct({
  outcome: Schema.Literals(["completed", "not_applied", "check_required"]),
  retryAvailable: Schema.Boolean,
  reason: Schema.optional(Schema.Literals(["unknown_write", "graph_conflict", "partial_effect"])),
  persistence: Schema.Literals(["saved_through", "step_unsaved", "unknown"]),
  save: Schema.NullOr(Schema.Struct({ operationId: id, path: Schema.String, throughStep: stepRef })),
})

export const StepMetadata = Schema.Struct({
  v: Schema.Literal(1),
  operationId: id,
  state: Schema.Literal("settled"),
  step,
})

export type Step = typeof step.Type

const wire = Schema.toStandardSchemaV1

export const StepRpc = Rpc.define({
  id: "loginom.step",
  methods: {
    checkState: {
      input: wire(Schema.Struct({ sessionID: Schema.NonEmptyString, operationId: id })),
      output: wire(
        Schema.Union([
          Schema.Struct({ state: Schema.Literals(["unavailable", "busy"]), retryAvailable: Schema.Literal(false) }),
          Schema.Struct({
            state: Schema.Literal("observed"),
            retryAvailable: Schema.Boolean,
            step,
          }),
        ]),
      ),
    },
  },
  events: {},
})

export const WriteOutcomeRpc = Rpc.define({
  id: "loginom.write-outcome",
  methods: {
    check: {
      input: wire(Schema.Struct({ sessionID: Schema.NonEmptyString, writeID: Schema.optional(id) })),
      output: wire(
        Schema.Struct({
          status: Schema.Literals(["applied", "not_applied", "unknown"]),
          writeID: Schema.optional(id),
          readback: Schema.optional(Schema.Literals(["unchanged", "changed", "observed", "unavailable"])),
        }),
      ),
    },
  },
  events: {},
})

export const ConnectionRpc = Rpc.define({
  id: "loginom.connection",
  methods: {
    status: {
      input: wire(Schema.Struct({})),
      output: wire(
        Schema.Union([
          Schema.Struct({ ok: Schema.Literal(false) }),
          Schema.Struct({
            ok: Schema.Literal(true),
            value: Schema.Struct({
              state: Schema.Literals(["unconfigured", "ready", "pending", "starting", "recoverable-error"]),
              failed: Schema.Boolean,
            }),
          }),
        ]),
      ),
    },
  },
  events: {},
})
