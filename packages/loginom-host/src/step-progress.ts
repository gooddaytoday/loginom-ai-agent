import { Option, Schema } from "effect"

const Progress = Schema.Struct({
  version: Schema.Literal(1),
  phase: Schema.Literals(["waiting", "configuring", "executing", "reading"]),
  nodeType: Schema.NullOr(Schema.String),
  substep: Schema.NullOr(
    Schema.Struct({ kind: Schema.Literal("fields"), index: Schema.Int, total: Schema.Int }),
  ),
  startedAt: Schema.Int,
  lastReplyAt: Schema.NullOr(Schema.Int),
  stalledSince: Schema.NullOr(Schema.Int),
})

export type StepProgress = typeof Progress.Type
export const decodeStepProgress = (value: unknown) => Option.getOrUndefined(Schema.decodeUnknownOption(Progress)(value))
