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

export const Busy = Schema.Struct({
  version: Schema.Literal(1),
  windowId: Schema.String.check(Schema.isUUID()),
  operationId: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/)),
  active: Schema.Boolean,
})
export const decodeBusy = (value: unknown) => Option.getOrUndefined(Schema.decodeUnknownOption(Busy)(value))
export type DockProgress = { loginomStep: StepProgress } | { loginom: { busy: typeof Busy.Type } }
