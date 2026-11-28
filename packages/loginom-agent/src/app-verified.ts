import { Option, Schema } from "effect"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { defaultUserNodeReadPorts } from "../../loginom-runtime/client/lib/user-workflow.mjs"
import { decodeLoginomMetadata, LoginomEvidence, type LoginomMetadata } from "./loginom-metadata"

const request = Schema.Struct({ sessionID: Session.ID, promptID: SessionMessage.ID })
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
const call = Schema.Struct({ messageID: Schema.String, toolCallID: Schema.String })
const gap = Schema.Struct({
  reason,
  status: Schema.Literals(["notRequested", "unconfirmed"]),
  call: Schema.optional(call),
})
const report = Schema.Struct({ facts: Schema.Array(summaryFact), notVerified: Schema.Array(gap) })
const schema = (value: typeof request | typeof report) =>
  Schema.toJsonSchemaDocument(value, { referencePolicy: () => undefined }).schema

export const appVerifiedRpc = {
  id: "loginom.appVerified",
  methods: { summary: { input: schema(request), output: schema(report) } },
  events: {},
} as const

const decodeRequest = Schema.decodeUnknownSync(request)
const decodeReceipt = Schema.decodeUnknownOption(Schema.Struct({ generation: Schema.Int, loginom: Schema.Unknown }))
const decodeInput = Schema.decodeUnknownOption(
  Schema.Struct({
    finish: Schema.optional(Schema.String),
    target: Schema.optional(Schema.Struct({ type: Schema.String })),
    read: Schema.optional(Schema.Struct({ ports: Schema.optional(Schema.Array(Schema.Number)) })),
    kind: Schema.optional(Schema.String),
    execution: Schema.optional(Schema.String),
    action_key: Schema.optional(Schema.String),
  }),
)

const checks = {
  tableRead: "noTableReadReceipt",
  executed: "noExecutionReceipt",
  saved: "noSaveReceipt",
  reopenedGraphRead: "noReopenedGraphReadReceipt",
} as const
type Check = keyof typeof checks
type EvidenceKind = (typeof LoginomEvidence.Type)["kind"]

function requestedChecks(tool: string, value: unknown, admitted: LoginomMetadata["verificationRequest"]): Check[] {
  if (admitted?.kind === "node" && (tool === "loginom_dock_node_apply" || tool === "loginom_dock_node_read")) {
    const wanted: Check[] = []
    if (tool === "loginom_dock_node_apply" && admitted.execute) wanted.push("executed")
    if (admitted.tableRead) wanted.push("tableRead")
    if (tool === "loginom_dock_node_read" && admitted.execute) wanted.push("executed")
    return wanted
  }
  const input = Option.getOrUndefined(decodeInput(value))
  if (!input) return []
  const ports = input.read?.ports
  switch (tool) {
    case "loginom_dock_node_apply":
      return [
        ...(input.finish === "execute" ? ["executed" as const] : []),
        ...((ports ?? defaultUserNodeReadPorts(input.finish, input.target?.type)).length ? ["tableRead" as const] : []),
      ]
    case "loginom_dock_node_read":
      if (input.kind === "source" || input.kind === "context") return []
      return [
        ...(ports?.length ? ["tableRead" as const] : []),
        ...(input.execution === "execute" ? ["executed" as const] : []),
      ]
    case "loginom_dock_action_run":
      if (input.action_key === "package.save_as") return ["saved", "reopenedGraphRead"]
      if (input.action_key === "package.save_checkpoint") return ["saved"]
  }
  return []
}

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
  turnMessages(input: typeof request.Type): Promise<readonly Message[]>
}

const unavailable = (): typeof report.Type => ({
  facts: [],
  notVerified: [{ reason: "promptUnavailable", status: "unconfirmed" }],
})

const saveKey = (
  operationId: string,
  start: Pick<NonNullable<LoginomMetadata["receiptWindow"]>, "runtimeId" | "documentId" | "startSequence">,
) => JSON.stringify([operationId, start.runtimeId, start.documentId, start.startSequence])

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
    return appVerifiedSummary(await sessions.turnMessages({ sessionID, promptID }), promptID)
  }
}

export function appVerifiedSummary(messages: readonly Message[], promptID: string): typeof report.Type {
  const start = messages.findIndex((message) => message.type === "user" && message.id === promptID)
  if (start === -1) return unavailable()

  const attempts: { checks: Check[]; call: typeof call.Type; observed: Set<EvidenceKind> }[] = []
  const pending = new Map<string, (typeof attempts)[number]["observed"]>()
  const pendingSaves = new Map<string, (typeof attempts)[number]["observed"]>()
  const facts = new Map<
    string,
    {
      fact: typeof summaryFact.Type
      order?: LoginomMetadata["receiptWindow"]
    }
  >()
  for (const message of messages.slice(start + 1)) {
    if (message.type === "user") break
    if (message.type !== "assistant") continue
    for (const part of message.content ?? []) {
      if (part.type !== "tool" || !part.name.startsWith("loginom_dock_") || part.state.status === "streaming") continue
      const receipt = Option.getOrUndefined(decodeReceipt(part.state.metadata))
      const loginom = decodeLoginomMetadata(receipt?.loginom)
      const operation = loginom && receipt && JSON.stringify([receipt.generation, loginom.operationId, loginom.attempt])
      const admitted = loginom?.verificationRequest
      const wanted = requestedChecks(part.name, part.state.input, admitted)
      const reference = { messageID: message.id, toolCallID: part.id }
      const observed = new Set<EvidenceKind>()
      if (wanted.length) {
        attempts.push({ checks: wanted, call: reference, observed })
        if (operation && loginom?.state === "running") pending.set(operation, observed)
        if (wanted.includes("saved") && admitted?.kind === "save" && loginom?.status === "AMBIGUOUS")
          pendingSaves.set(saveKey(loginom.operationId, admitted), observed)
      }
      if (
        !loginom ||
        loginom.state !== "settled" ||
        (part.state.status !== "completed" && part.state.status !== "error")
      )
        continue
      const { operationId, attempt, node, status, receiptWindow } = loginom
      const originalSave = receiptWindow && pendingSaves.get(saveKey(operationId, receiptWindow))
      for (const evidence of loginom.evidence ?? []) {
        if (evidence.kind !== "executed" && status !== "SUCCEEDED") continue
        if (evidence.kind === "saved" || evidence.kind === "reopenedGraphRead") {
          if (part.name === "loginom_dock_operation_inspect" && !originalSave) continue
          originalSave?.add(evidence.kind)
        }
        observed.add(evidence.kind)
        if (operation && !wanted.length) pending.get(operation)?.add(evidence.kind)
        const key = JSON.stringify([
          receiptWindow?.runtimeId ?? receipt?.generation,
          evidence.kind,
          ...(evidence.kind === "executed"
            ? [evidence.executionId]
            : [operationId, attempt, evidence.kind === "tableRead" ? evidence.portGuid : null]),
        ])
        if (!facts.has(key))
          facts.set(key, {
            order: receiptWindow,
            fact: {
              evidence,
              source: { operationId, attempt, ...reference, nodeGuid: node?.guid },
            },
          })
      }
    }
  }

  const entries = [...facts.values()]
  const saves = entries
    .filter(({ fact, order }) => fact.evidence.kind === "saved" && order !== undefined)
    .sort((left, right) => (right.order?.confirmedSequence ?? 0) - (left.order?.confirmedSequence ?? 0))
  const linked = entries.map((entry): typeof summaryFact.Type => {
    const { fact, order } = entry
    if (fact.evidence.kind !== "executed" || !order) return fact
    for (const save of saves) {
      if (save.order?.runtimeId !== order.runtimeId || save.order.documentId !== order.documentId) continue
      const timing =
        order.confirmedSequence < save.order.startSequence
          ? "before"
          : order.startSequence > save.order.confirmedSequence
            ? "after"
            : undefined
      if (timing) return { ...fact, relativeToSave: { timing, source: save.fact.source } }
    }
    return fact
  })
  const notVerified: (typeof gap.Type)[] = []
  for (const attempt of attempts)
    for (const check of attempt.checks)
      if (!attempt.observed.has(check))
        notVerified.push({ reason: checks[check], status: "unconfirmed", call: attempt.call })
  for (const { evidence, source } of linked) {
    if (evidence.kind === "tableRead" && evidence.rowsRead < evidence.rowCount)
      notVerified.push({
        reason: "unreadTableRows",
        status: "unconfirmed",
        call: { messageID: source.messageID, toolCallID: source.toolCallID },
      })
  }
  for (const [check, reason] of Object.entries(checks)) {
    if (linked.some(({ evidence }) => evidence.kind === check)) continue
    if (attempts.some((attempt) => attempt.checks.some((wanted) => wanted === check))) continue
    notVerified.push({ reason, status: "notRequested" })
  }
  notVerified.push({ reason: "noSavedVersionExecutionReceipt", status: "notRequested" })
  return { facts: linked, notVerified }
}
