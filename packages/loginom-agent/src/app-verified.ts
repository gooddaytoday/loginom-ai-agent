import { Option, Schema } from "effect"
import { LoginomEvidence, LoginomMetadata } from "./loginom-metadata"

const request = Schema.Struct({ sessionID: Schema.NonEmptyString, promptID: Schema.NonEmptyString })
const source = Schema.Struct({
  operationId: Schema.NonEmptyString,
  attempt: Schema.optional(Schema.Int),
  messageID: Schema.String,
  toolCallID: Schema.String,
  nodeGuid: Schema.optional(Schema.String),
})
const summaryFact = Schema.Struct({
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
const gap = Schema.Struct({ reason, status: Schema.Literals(["notRequested", "unconfirmed"]) })
const report = Schema.Struct({ facts: Schema.Array(summaryFact), notVerified: Schema.Array(gap) })
const schema = (value: typeof request | typeof report) =>
  Schema.toJsonSchemaDocument(value, { referencePolicy: () => undefined }).schema

export const appVerifiedRpc = {
  id: "loginom.appVerified",
  methods: { summary: { input: schema(request), output: schema(report) } },
  events: {},
} as const

const decodeRequest = Schema.decodeUnknownSync(request)
const decodeReceipt = Schema.decodeUnknownOption(Schema.Struct({ generation: Schema.Int, loginom: LoginomMetadata }))

type Message = {
  type: string
  id: string
  content?: readonly (
    | {
        type: "tool"
        id: string
        name: string
        state: { status: string; input?: unknown; metadata?: unknown }
      }
    | { type: "text" | "reasoning" }
  )[]
}

type Location = { directory: string; workspaceID?: string }
type SummarySessions = {
  get(input: { sessionID: string }): Promise<{ id: string; location: Location }>
  context(input: { sessionID: string }): Promise<readonly Message[]>
}

const unavailable = (): typeof report.Type => ({
  facts: [],
  notVerified: [{ reason: "promptUnavailable", status: "unconfirmed" }],
})

export function appVerifiedHandler(sessions: SummarySessions, location: Location) {
  return async (value: unknown) => {
    const { sessionID, promptID } = decodeRequest(value)
    const session = await sessions.get({ sessionID })
    if (
      session.id !== sessionID ||
      session.location.directory !== location.directory ||
      session.location.workspaceID !== location.workspaceID
    )
      return unavailable()
    return appVerifiedSummary(await sessions.context({ sessionID }), promptID)
  }
}

export function appVerifiedSummary(messages: readonly Message[], promptID: string): typeof report.Type {
  const start = messages.findIndex((message) => message.type === "user" && message.id === promptID)
  if (start === -1) return unavailable()

  const requested = new Set<typeof reason.Type>()
  const facts = new Map<
    string,
    {
      fact: typeof summaryFact.Type
      order?: LoginomMetadata["receiptOrder"]
    }
  >()
  for (const message of messages.slice(start + 1)) {
    if (message.type === "user") break
    if (message.type !== "assistant") continue
    for (const part of message.content ?? []) {
      if (part.type !== "tool" || !part.name.startsWith("loginom_dock_") || part.state.status === "streaming") continue
      const input = part.state.input
      if (typeof input === "object" && input !== null) {
        if (part.name === "loginom_dock_node_apply") {
          if ("finish" in input && input.finish === "execute") requested.add("noExecutionReceipt")
          if (
            "read" in input &&
            typeof input.read === "object" &&
            input.read !== null &&
            "ports" in input.read &&
            Array.isArray(input.read.ports) &&
            input.read.ports.length
          )
            requested.add("noTableReadReceipt")
        } else if (part.name === "loginom_dock_node_read") {
          if (!("kind" in input) || (input.kind !== "source" && input.kind !== "context"))
            requested.add("noTableReadReceipt")
          if ("execution" in input && input.execution === "execute") requested.add("noExecutionReceipt")
        } else if (part.name === "loginom_dock_action_run" && "action_key" in input) {
          if (input.action_key === "package.save_as" || input.action_key === "package.save_checkpoint")
            requested.add("noSaveReceipt")
          if (input.action_key === "package.save_as") requested.add("noReopenedGraphReadReceipt")
        }
      }
      if (part.state.status !== "completed" && part.state.status !== "error") continue
      const receipt = Option.getOrUndefined(decodeReceipt(part.state.metadata))
      if (receipt?.loginom.state !== "settled") continue
      const { operationId, attempt, node, status } = receipt.loginom
      for (const evidence of receipt.loginom.evidence ?? []) {
        if (evidence.kind !== "executed" && status !== "SUCCEEDED") continue
        const key = JSON.stringify([
          receipt.loginom.receiptOrder?.runtimeId ?? receipt.generation,
          evidence.kind,
          ...(evidence.kind === "executed"
            ? [evidence.executionId]
            : [operationId, attempt, evidence.kind === "tableRead" ? evidence.portGuid : null]),
        ])
        if (!facts.has(key))
          facts.set(key, {
            order: receipt.loginom.receiptOrder,
            fact: {
              evidence,
              source: { operationId, attempt, messageID: message.id, toolCallID: part.id, nodeGuid: node?.guid },
            },
          })
      }
    }
  }

  const entries = [...facts.values()]
  const saves = entries
    .filter(({ fact, order }) => fact.evidence.kind === "saved" && order !== undefined)
    .sort((left, right) => (right.order?.confirmed ?? 0) - (left.order?.confirmed ?? 0))
  const linked = entries.map((entry): typeof summaryFact.Type => {
    const { fact, order } = entry
    if (fact.evidence.kind !== "executed" || !order) return fact
    for (const save of saves) {
      if (save.order?.runtimeId !== order.runtimeId || save.order.documentId !== order.documentId) continue
      const timing =
        order.confirmed < save.order.started ? "before" : order.started > save.order.confirmed ? "after" : undefined
      if (timing) return { ...fact, relativeToSave: { timing, source: save.fact.source } }
    }
    return fact
  })
  const observed = new Set(linked.map(({ evidence }) => evidence.kind))
  const notVerified: (typeof gap.Type)[] = []
  const missing = (reason: typeof gap.Type.reason) =>
    notVerified.push({ reason, status: requested.has(reason) ? "unconfirmed" : "notRequested" })
  if (!observed.has("tableRead")) missing("noTableReadReceipt")
  if (linked.some(({ evidence }) => evidence.kind === "tableRead" && evidence.rowsRead < evidence.rowCount))
    notVerified.push({ reason: "unreadTableRows", status: "unconfirmed" })
  if (!observed.has("executed")) missing("noExecutionReceipt")
  if (!observed.has("saved")) missing("noSaveReceipt")
  if (!observed.has("reopenedGraphRead")) missing("noReopenedGraphReadReceipt")
  missing("noSavedVersionExecutionReceipt")
  return { facts: linked, notVerified }
}
