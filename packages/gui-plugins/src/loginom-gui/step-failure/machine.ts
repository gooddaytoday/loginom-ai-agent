import type { JsonValue, SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import type { SessionMessage } from "@opencode/schema/session-message"
import { Option, Predicate, Schema } from "effect"
import { RecoveryMetadata, OperationId, type Step } from "./contracts"

type Write = { kind: "write"; operationId?: string; step?: Step }

export type Failure = { id: string; tool: string } & ({ kind: "read" } | Write)

export type Retry = { id: string; status: "pending" | "completed" | "failed" }

const metadata = Schema.decodeUnknownOption(RecoveryMetadata)

const retrySource = Schema.decodeUnknownOption(Schema.NonEmptyString)

const operationId = Schema.decodeUnknownOption(OperationId)

function facts(tool: SessionMessageAssistantTool) {
  if (tool.state.status === "streaming") return

  return Option.getOrUndefined(metadata(tool.state.metadata?.loginom))
}

function isRead(tool: SessionMessageAssistantTool) {
  return (
    facts(tool)?.kind === "read" ||
    tool.name === "loginom_dock_workspace_observe" ||
    tool.name === "loginom_dock_action_describe" ||
    tool.name === "loginom_dock_node_read"
  )
}

function stepInput(input: Record<string, JsonValue>, tool: string, nodeKnown: boolean) {
  const target = Predicate.isObject(input.target) ? input.target : undefined
  const ref = Predicate.isObject(target?.ref) ? target.ref : undefined
  const workflow = Predicate.isObject(input.workflow_ref) ? input.workflow_ref : undefined
  const parameters = Predicate.isObject(input.parameters) ? input.parameters : undefined
  const read = Predicate.isObject(input.read) ? input.read : undefined

  return JSON.stringify([
    input.document_id ?? ref?.document_id,
    input.workflow_id ?? workflow?.workflow_id ?? ref?.workflow_id,
    input.node_id ?? ref?.node_id ?? target?.label,
    target?.kind,
    target?.type,
    input.finish ?? input.execution ?? input.phase,
    input.action_key ?? input.kind,
    input.mode,
    nodeKnown ? undefined : input.source_operation_id,
    input.package_path ?? parameters?.path,
    read?.ports,
    read?.variable_ports,
    tool === "loginom_dock_workspace_observe" ? (input.scope ?? "all") : undefined,
    input.root_ref,
    input.cursor,
    input.storage_name,
    input.action_keys,
    input.node_types,
    input.modes,
  ])
}

function sameStep(original: SessionMessageAssistantTool, candidate: SessionMessageAssistantTool) {
  if (
    original.name !== candidate.name ||
    original.state.status === "streaming" ||
    candidate.state.status === "streaming"
  )
    return false

  const before = facts(original)
  const after = facts(candidate)
  const input = original.state.input
  const requestedPhase = input.finish ?? input.execution ?? input.phase

  if (before?.node && after?.node && before.node.guid !== after.node.guid) return false

  if (before?.kind && after?.kind && before.kind !== after.kind) return false

  if (requestedPhase === undefined && before?.phase && after?.phase && before.phase !== after.phase) return false

  const nodeKnown = !!(before?.node && after?.node)

  return stepInput(input, original.name, nodeKnown) === stepInput(candidate.state.input, candidate.name, nodeKnown)
}

function retryResult(tools: SessionMessageAssistantTool[], original: SessionMessageAssistantTool) {
  const attempt = tools.findLast((tool) => sameStep(original, tool))

  if (!attempt) return

  const attemptFacts = facts(attempt)
  const operation = attemptFacts?.operationId

  if (!operation || attemptFacts.state !== "running") return attempt

  return (
    tools.slice(tools.lastIndexOf(attempt) + 1).findLast((tool) => {
      if (
        tool.name !== "loginom_dock_node_wait" &&
        tool.name !== "loginom_dock_node_status" &&
        tool.name !== "loginom_dock_operation_inspect"
      )
        return false

      const value = facts(tool)

      return (
        value?.operationId === operation &&
        (!attemptFacts.node || !value.node || attemptFacts.node.guid === value.node.guid)
      )
    }) ?? attempt
  )
}

function toolsIn(messages: readonly SessionMessageInfo[]) {
  return messages.flatMap((message) =>
    message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : [],
  )
}

function failed(tool: SessionMessageAssistantTool, previous?: SessionMessageAssistantTool): Failure | undefined {
  if (!tool.name.startsWith("loginom_") || tool.state.status !== "error") return

  const decoded = facts(tool)
  const value = decoded?.state === "settled" ? decoded : undefined
  const identity = { id: tool.id, tool: tool.name }
  const read = isRead(tool)

  if (
    !read &&
    (value?.step?.outcome === "check_required" ||
      value?.step?.outcome === "not_applied" ||
      value?.status === "AMBIGUOUS" ||
      tool.state.error.message.includes("LOGINOM_CALL_UNCERTAIN"))
  ) {
    return {
      ...identity,
      kind: "write",
      operationId: Option.getOrUndefined(operationId(value?.operationId)),
      step: value?.step,
    }
  }

  if (read && previous?.state.status === "error" && sameStep(previous, tool)) return { ...identity, kind: "read" }
}

export function recovery(messages: readonly SessionMessageInfo[]): { failure: Failure; retry?: Retry } | undefined {
  const userIndex = messages.findLastIndex((message) => message.type === "user")
  const user = messages[userIndex]
  const turn = messages.slice(userIndex + 1)
  const tools = toolsIn(turn)
  const latest = tools.findLastIndex((tool) => tool.name.startsWith("loginom_"))
  const failure = latest < 0 ? undefined : failed(tools[latest], tools[latest - 1])

  if (user?.type !== "user") return failure ? { failure } : undefined

  const source = Option.getOrUndefined(retrySource(user.metadata?.loginomRetry))

  if (!source) return failure ? { failure } : undefined

  const earlier = toolsIn(messages.slice(0, userIndex))
  const originalIndex = earlier.findIndex((tool) => tool.id === source)
  const originalTool = earlier[originalIndex]
  const original = originalTool && failed(originalTool, earlier[originalIndex - 1])

  if (!originalTool || !original) return failure ? { failure } : undefined

  if (failure?.kind === "write") return { failure }

  const result = retryResult(tools, originalTool)
  const value = result && facts(result)

  const pendingReceipt =
    value?.state === "running" ||
    (result?.state.status === "completed" && result.state.metadata?.loginomPending === true)

  if (
    result?.state.status === "completed" &&
    !pendingReceipt &&
    value?.state === "settled" &&
    (value.status === undefined || value.status === "SUCCEEDED") &&
    (value.step ? value.step.outcome === "completed" : value.status === "SUCCEEDED")
  )
    return { failure: original, retry: { id: user.id, status: "completed" } }

  const finished = turn.some(
    (message) =>
      message.type === "idle" ||
      (message.type === "assistant" && message.time.completed !== undefined && message.finish !== "tool-calls"),
  )

  return { failure: original, retry: { id: user.id, status: finished && !pendingReceipt ? "failed" : "pending" } }
}

export type Check = { operationId: string } & (
  | { kind: "applied" | "unknown"; step?: Step }
  | { kind: "not_applied"; retryAvailable: boolean; step?: Step }
)

type Request = { requestID: SessionMessage.ID }

export type State = (
  | { kind: "idle" | "checking" }
  | ({ kind: "retrying" | "retry-send-failed" | "submitted" } & Request)
) & { check?: Check }

export type Event =
  | { type: "check" | "detach" }
  | { type: "checked"; result: Check }
  | ({ type: "retry" } & Request)
  | ({ type: "retried"; ok: boolean } & Request)

export function transition(state: State, event: Event): State {
  switch (event.type) {
    case "detach":
      if (state.kind === "checking") return { kind: "idle", check: state.check }

      if (state.kind === "retrying")
        return { kind: "retry-send-failed", requestID: state.requestID, check: state.check }

      return state
    case "check":
      return state.kind === "checking" || state.kind === "retrying" ? state : { kind: "checking", check: state.check }
    case "checked":
      return state.kind === "checking" ? { kind: "idle", check: event.result } : state
    case "retry":
      return state.kind === "checking" || state.kind === "retrying"
        ? state
        : { kind: "retrying", requestID: event.requestID, check: state.check }
    case "retried":
      if (state.kind !== "retrying" || state.requestID !== event.requestID) return state

      return event.ok
        ? { kind: "submitted", requestID: event.requestID, check: state.check }
        : { kind: "retry-send-failed", requestID: event.requestID, check: state.check }
  }
}

export function pending(state: State, retry?: Retry) {
  return (
    state.kind === "retrying" ||
    retry?.status === "pending" ||
    (state.kind === "submitted" && retry?.id !== state.requestID)
  )
}

export function checkedOperation(failure: Failure, state: State) {
  if (failure.kind === "write" && state.check?.operationId === failure.operationId) return state.check
}

export function canRetry(failure: Failure, state: State, retry?: Retry) {
  if (state.kind === "checking" || pending(state, retry) || retry?.status === "completed") return false

  if (failure.kind === "read") return true

  if (retry?.status === "failed" || !failure.operationId) return false

  const check = checkedOperation(failure, state)

  if (check) return check.kind === "not_applied" && check.retryAvailable

  return failure.step?.outcome === "not_applied" && failure.step.retryAvailable
}

export function needsCheck(failure: Failure, state: State, retry?: Retry) {
  return failure.kind === "write" && retry?.status !== "failed" && !canRetry(failure, state, retry)
}
