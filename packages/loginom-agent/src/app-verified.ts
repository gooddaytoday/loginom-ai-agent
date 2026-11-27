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
  "noSavedGraphReadReceipt",
  "noSavedVersionExecutionReceipt",
])
const report = Schema.Struct({ facts: Schema.Array(summaryFact), notVerified: Schema.Array(reason) })
const schema = (value: typeof request | typeof report) =>
  Schema.toJsonSchemaDocument(value, { referencePolicy: () => undefined }).schema

export const appVerifiedRpc = {
  id: "loginom.appVerified",
  methods: { summary: { input: schema(request), output: schema(report) } },
  events: {},
} as const

export const decodeAppVerifiedRequest = Schema.decodeUnknownSync(request)
const decodeReceipt = Schema.decodeUnknownOption(Schema.Struct({ generation: Schema.Int, loginom: LoginomMetadata }))

type Message = {
  type: string
  id: string
  content?: readonly (
    | { type: "tool"; id: string; name: string; state: { status: string; metadata?: unknown } }
    | { type: "text" | "reasoning" }
  )[]
}

export function appVerifiedSummary(messages: readonly Message[], promptID: string): typeof report.Type {
  const start = messages.findIndex((message) => message.type === "user" && message.id === promptID)
  if (start === -1) return { facts: [], notVerified: ["promptUnavailable"] }

  const facts = new Map<
    string,
    {
      fact: typeof summaryFact.Type
      generation: number
      window?: LoginomMetadata["receiptWindow"]
    }
  >()
  for (const message of messages.slice(start + 1)) {
    if (message.type === "user") break
    if (message.type !== "assistant") continue
    for (const part of message.content ?? []) {
      if (
        part.type !== "tool" ||
        !part.name.startsWith("loginom_dock_") ||
        (part.state.status !== "completed" && part.state.status !== "error")
      )
        continue
      const receipt = Option.getOrUndefined(decodeReceipt(part.state.metadata))
      if (receipt?.loginom.state !== "settled") continue
      const { operationId, attempt, node, status } = receipt.loginom
      for (const evidence of receipt.loginom.evidence ?? []) {
        if (evidence.kind !== "executed" && status !== "SUCCEEDED") continue
        const key = JSON.stringify([
          receipt.generation,
          evidence.kind,
          ...(evidence.kind === "executed"
            ? [evidence.executionId]
            : [operationId, attempt, evidence.kind === "tableRead" ? evidence.portGuid : null]),
        ])
        if (!facts.has(key))
          facts.set(key, {
            generation: receipt.generation,
            window: receipt.loginom.receiptWindow,
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
    .filter(({ fact, window }) => fact.evidence.kind === "saved" && window !== undefined)
    .sort((left, right) => (right.window?.confirmedAt ?? 0) - (left.window?.confirmedAt ?? 0))
  const linked = entries.map((entry): typeof summaryFact.Type => {
    const { fact, generation, window } = entry
    if (fact.evidence.kind !== "executed" || !window) return fact
    for (const save of saves) {
      if (save.generation !== generation || save.window?.documentId !== window.documentId) continue
      const timing =
        window.confirmedAt < save.window.startedAt
          ? "before"
          : window.startedAt > save.window.confirmedAt
            ? "after"
            : undefined
      if (timing) return { ...fact, relativeToSave: { timing, source: save.fact.source } }
    }
    return fact
  })
  const observed = new Set(linked.map(({ evidence }) => evidence.kind))
  const notVerified: (typeof reason.Type)[] = []
  if (!observed.has("tableRead")) notVerified.push("noTableReadReceipt")
  if (linked.some(({ evidence }) => evidence.kind === "tableRead" && evidence.rowsRead < evidence.rowCount))
    notVerified.push("unreadTableRows")
  if (!observed.has("executed")) notVerified.push("noExecutionReceipt")
  if (!observed.has("saved")) notVerified.push("noSaveReceipt")
  if (!observed.has("savedGraphRead")) notVerified.push("noSavedGraphReadReceipt")
  notVerified.push("noSavedVersionExecutionReceipt")
  return { facts: linked, notVerified }
}
