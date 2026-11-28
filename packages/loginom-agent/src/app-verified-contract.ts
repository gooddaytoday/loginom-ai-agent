import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"
import { LoginomEvidence } from "./loginom-metadata"

export const request = Schema.Struct({ sessionID: Schema.NonEmptyString, promptID: Schema.NonEmptyString })
const source = Schema.Struct({
  operationId: Schema.NonEmptyString,
  attempt: Schema.optional(Schema.Int),
  messageID: Schema.String,
  toolCallID: Schema.String,
  nodeGuid: Schema.optional(Schema.String),
})
export const summaryFact = Schema.Struct({
  evidence: LoginomEvidence,
  source,
  relativeToSave: Schema.optional(
    Schema.Struct({
      timing: Schema.Literals(["before", "after"]),
      source,
    }),
  ),
})
const reason = Schema.Literals([
  "promptUnavailable",
  "noTableReadReceipt",
  "unreadTableRows",
  "noExecutionReceipt",
  "noSaveReceipt",
  "noReopenedGraphReadReceipt",
  "noSavedVersionExecutionReceipt",
])
export const gap = Schema.Struct({ reason, status: Schema.Literals(["notRequested", "unconfirmed"]) })
export const Report = Schema.Struct({ facts: Schema.Array(summaryFact), notVerified: Schema.Array(gap) })
export const Definition = Rpc.define({
  id: "loginom.appVerified",
  methods: {
    summary: {
      input: Schema.toStandardSchemaV1(request),
      output: Schema.toStandardSchemaV1(Report),
    },
  },
  events: {},
})
