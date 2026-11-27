import { Schema } from "effect"

export const NodeOutputReceipt = Schema.Struct({
  generation: Schema.Int,
  operationId: Schema.NonEmptyString,
  executionId: Schema.NonEmptyString,
  portGuid: Schema.NonEmptyString,
})
export type NodeOutputReceipt = typeof NodeOutputReceipt.Type

export const NodeOutputSample = Schema.Struct({
  rows: Schema.Array(Schema.Array(Schema.Json)),
  targetRows: Schema.Int,
  limitation: Schema.optional(Schema.Literal("preview_limit")),
})
