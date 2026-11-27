import type { SessionMessageInfo } from "@opencode/client/promise"
import { Option, Schema } from "effect"
import { StepMetadata, type Step } from "./contracts"

type Write = { kind: "write"; operationId?: string; writeID?: string; step?: Step }

export type Failure = { id: string; tool: string } & ({ kind: "read" } | Write)

const metadata = Schema.decodeUnknownOption(StepMetadata)

const writeID = Schema.decodeUnknownOption(Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/)))

function isRead(tool: string) {
  return tool === "loginom_dock_workspace_observe" || tool === "loginom_dock_action_describe"
}

export function failedStep(messages: readonly SessionMessageInfo[]): Failure | undefined {
  const tools = messages
    .slice(messages.findLastIndex((message) => message.type === "user") + 1)
    .flatMap((message) => (message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : []))

  const latest = tools.findLast((part) => part.name.startsWith("loginom_"))

  if (latest?.state.status !== "error") return

  const facts = Option.getOrUndefined(metadata(latest.state.metadata?.loginom))
  const journalID = Option.getOrUndefined(writeID(latest.state.metadata?.writeID))
  const identity = { id: latest.id, tool: latest.name }

  if (
    facts?.step.outcome === "check_required" ||
    facts?.step.outcome === "not_applied" ||
    journalID ||
    (!isRead(latest.name) && latest.state.error.message.includes("LOGINOM_CALL_UNCERTAIN"))
  ) {
    return { ...identity, kind: "write", operationId: facts?.operationId, step: facts?.step, writeID: journalID }
  }

  if (!isRead(latest.name)) return
  const previous = tools[tools.indexOf(latest) - 1]

  if (
    previous?.name === latest.name &&
    previous.state.status === "error" &&
    JSON.stringify(previous.state.input) === JSON.stringify(latest.state.input)
  )
    return { ...identity, kind: "read" }
}

export type Check =
  | { kind: "applied" | "unknown"; step?: Step }
  | { kind: "not_applied"; retryAvailable: boolean; step?: Step }

export type State =
  | { kind: "idle"; check?: Check }
  | { kind: "checking"; check?: Check }
  | { kind: "retrying"; check?: Check }
  | { kind: "submitted"; check?: Check }
  | { kind: "retry-failed"; check?: Check }

export type Event =
  | { type: "check" }
  | { type: "checked"; result: Check }
  | { type: "retry" }
  | { type: "retried"; ok: boolean }

export function transition(state: State, event: Event): State {
  switch (event.type) {
    case "check":
      return available(state) ? { ...state, kind: "checking" } : state
    case "checked":
      return state.kind === "checking" ? { kind: "idle", check: event.result } : state
    case "retry":
      return available(state) ? { ...state, kind: "retrying" } : state
    case "retried":
      return state.kind === "retrying" ? { ...state, kind: event.ok ? "submitted" : "retry-failed" } : state
  }
}

export function available(state: State) {
  return state.kind === "idle" || state.kind === "retry-failed"
}

export function canRetry(failure: Failure, state: State) {
  if (!available(state)) return false

  if (failure.kind === "read") return true

  if (state.check) return state.check.kind === "not_applied" && state.check.retryAvailable

  return failure.step?.outcome === "not_applied" && failure.step.retryAvailable
}

export function needsCheck(failure: Failure, state: State) {
  if (failure.kind !== "write") return false

  if (state.check)
    return state.check.kind === "unknown" || (state.check.kind === "not_applied" && !state.check.retryAvailable)

  return failure.step?.outcome !== "not_applied" || !failure.step.retryAvailable
}
