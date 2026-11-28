import type { JsonValue, SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import type { SessionMessage } from "@opencode/schema/session-message"
import { Option, Predicate, Schema } from "effect"
import { RecoveryMetadata, OperationId, type Step } from "./contracts"

type Write = { kind: "write"; operationId?: string; step?: Step }

export type Failure = { id: string; tool: string; input: Record<string, JsonValue> } & ({ kind: "read" } | Write)

export type Retry = { id: string; status: "pending" | "completed" | "failed" }

const metadata = Schema.decodeUnknownOption(RecoveryMetadata)

const retrySource = Schema.decodeUnknownOption(Schema.NonEmptyString)

const operationId = Schema.decodeUnknownOption(OperationId)

function inputKey(input: Record<string, JsonValue>) {
  return JSON.stringify(input, (_key, value: JsonValue) =>
    Predicate.isObject(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  )
}

function facts(tool: SessionMessageAssistantTool) {
  if (tool.state.status === "streaming") return

  const value = Option.getOrUndefined(metadata(tool.state.metadata?.loginom))

  if (value?.state === "settled") return value
}

function isRead(tool: SessionMessageAssistantTool) {
  return (
    facts(tool)?.kind === "read" ||
    tool.name === "loginom_dock_workspace_observe" ||
    tool.name === "loginom_dock_action_describe"
  )
}

function toolsIn(messages: readonly SessionMessageInfo[]) {
  return messages.flatMap((message) =>
    message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : [],
  )
}

function failed(tool: SessionMessageAssistantTool, previous?: SessionMessageAssistantTool): Failure | undefined {
  if (!tool.name.startsWith("loginom_") || tool.state.status !== "error") return

  const value = facts(tool)
  const identity = { id: tool.id, tool: tool.name, input: tool.state.input }
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

  if (
    read &&
    previous?.name === tool.name &&
    previous.state.status === "error" &&
    inputKey(previous.state.input) === inputKey(tool.state.input)
  )
    return { ...identity, kind: "read" }
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
  const original = originalIndex < 0 ? undefined : failed(earlier[originalIndex], earlier[originalIndex - 1])

  if (!original) return failure ? { failure } : undefined

  if (failure?.kind === "write") return { failure }

  const originalInput = inputKey(original.input)

  const result = tools.findLast(
    (tool) =>
      tool.name === original.tool && tool.state.status !== "streaming" && inputKey(tool.state.input) === originalInput,
  )

  if (result?.state.status === "completed") {
    const value = facts(result)

    const completed = value?.step
      ? value.step.outcome === "completed"
      : value?.status
        ? value.status === "SUCCEEDED"
        : original.kind === "read"

    if (completed) return { failure: original, retry: { id: user.id, status: "completed" } }
  }

  const finished = turn.some(
    (message) =>
      message.type === "idle" ||
      (message.type === "assistant" && message.time.completed !== undefined && message.finish !== "tool-calls"),
  )

  return { failure: original, retry: { id: user.id, status: finished ? "failed" : "pending" } }
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
  | { type: "check" }
  | { type: "checked"; result: Check }
  | ({ type: "retry" } & Request)
  | ({ type: "retried"; ok: boolean } & Request)

export function transition(state: State, event: Event): State {
  switch (event.type) {
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
