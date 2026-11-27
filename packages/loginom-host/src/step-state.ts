import { Schema } from "effect"

export const StepOperationId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/))
const Label = Schema.String.check(Schema.isMaxLength(240))
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const StepRef = Schema.Struct({ operationId: StepOperationId, label: Label })
const Save = Schema.Struct({ operationId: StepOperationId, path: Schema.String, throughStep: StepRef })
export const Step = Schema.Struct({
  outcome: Schema.Literals(["completed", "not_applied", "check_required"]),
  retryAvailable: Schema.Boolean,
  reason: Schema.optional(Schema.Literals(["unknown_write", "graph_conflict", "partial_effect"])),
  persistence: Schema.Literals(["saved_through", "step_unsaved", "unknown"]),
  save: Schema.NullOr(Save),
})

export const StepMetadata = Schema.Struct({
  v: Schema.Literal(1),
  operationId: StepOperationId,
  state: Schema.Literal("settled"),
  step: Step,
})

export const StepCheckRequest = Schema.Struct({
  sessionID: Schema.NonEmptyString,
  operationId: StepOperationId,
})

export const StepCheckResult = Schema.Union([
  Schema.Struct({
    state: Schema.Literals(["unavailable", "busy"]),
    retryAvailable: Schema.Literal(false),
  }),
  Schema.Struct({
    state: Schema.Literal("observed"),
    retryAvailable: Schema.Boolean,
    window: Schema.Struct({
      path: Schema.NullOr(Schema.String),
      modified: Schema.NullOr(Schema.Boolean),
      nodeCount: Count,
      linkCount: Count,
    }),
    lastConfirmedStep: Schema.NullOr(StepRef),
    graphSinceLastConfirmedStep: Schema.Literals(["same", "changed", "unknown"]),
    step: Step,
  }),
])

export const unknownWriteStep = {
  outcome: "check_required",
  reason: "unknown_write",
  retryAvailable: false,
  persistence: "unknown",
  save: null,
} as const satisfies typeof Step.Type

export function uncertainStep(operationId: string) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Check the state of the original Loginom operation before another mutation: ${operationId}`,
      },
    ],
    _meta: {
      loginomStep: StepMetadata.make({
        v: 1,
        operationId,
        state: "settled",
        step: unknownWriteStep,
      }),
    },
  }
}
