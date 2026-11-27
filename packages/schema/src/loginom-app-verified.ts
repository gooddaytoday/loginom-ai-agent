import { Schema } from "effect"
import { Rpc } from "./rpc.js"

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const LoginomEvidence = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("tableRead"),
    port: count,
    portGuid: Schema.NonEmptyString,
    rowsRead: count,
    rowCount: count,
    executionId: Schema.optional(Schema.NonEmptyString),
  }).check(Schema.makeFilter((read) => read.rowsRead <= read.rowCount)),
  Schema.Struct({
    kind: Schema.Literal("executed"),
    executionId: Schema.NonEmptyString,
    scope: Schema.Literal("workspace"),
  }),
  Schema.Struct({ kind: Schema.Literal("saved"), path: Schema.NonEmptyString }),
  Schema.Struct({
    kind: Schema.Literal("savedGraphRead"),
    nodeCount: count,
    scope: Schema.Literal("activeWorkflow"),
  }),
])

export const Request = Schema.Struct({ sessionID: Schema.NonEmptyString, promptID: Schema.NonEmptyString })
const source = Schema.Struct({
  operationId: Schema.NonEmptyString,
  attempt: Schema.optional(Schema.Int),
  messageID: Schema.String,
  toolCallID: Schema.String,
  nodeGuid: Schema.optional(Schema.String),
})
export const Fact = Schema.Struct({
  evidence: LoginomEvidence,
  source,
  relativeToSave: Schema.optional(
    Schema.Struct({
      timing: Schema.Literals(["before", "after"]),
      source,
    }),
  ),
})
export const Reason = Schema.Literals([
  "promptUnavailable",
  "noTableReadReceipt",
  "unreadTableRows",
  "noExecutionReceipt",
  "noSaveReceipt",
  "noSavedGraphReadReceipt",
  "noSavedVersionExecutionReceipt",
])
export const Report = Schema.Struct({ facts: Schema.Array(Fact), notVerified: Schema.Array(Reason) })
export type Fact = typeof Fact.Type
export type Reason = typeof Reason.Type

export const Definition = Rpc.define({
  id: "loginom.appVerified",
  methods: {
    summary: {
      input: Schema.toStandardSchemaV1(Request),
      output: Schema.toStandardSchemaV1(Report),
    },
  },
  events: {},
})
