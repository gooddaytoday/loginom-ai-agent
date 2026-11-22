// Browser recovery at the end of a turn (guarantee G4, stage B2.3). Ported from 0.4
// `packages/opencode/src/session/browser-recovery.ts`; the session's context messages of OpenCode 2 replace 0.4's parts.
export * as BrowserRecovery from "./browser-recovery"

import type { SessionDomain } from "@opencode/plugin/promise/session"
import { Option, Schema } from "effect"

// What `session.context` returns: the session's messages since its latest compaction.
type Messages = Awaited<ReturnType<SessionDomain["context"]>>

const decode = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ phase: Schema.String, operation_id: Schema.optional(Schema.Unknown) })),
)
const activePhases = new Set(["handoff", "browser", "verify"])

// The runtime reports the lease phase in every dock_browser_recovery reply and in browser replies that end an attempt.
// The latest phase decides whether the same agent still owes this step a finish or stop (design 2026-10-19 §5). An
// attempt is the call that started it; its reminder is a synthetic message that names that call.
export function active(messages: Messages) {
  const state = messages.reduce<{ operationID?: string; phase?: string; attempt?: string; reminded: boolean }>(
    (current, message) => {
      if (message.type === "synthetic")
        return message.metadata?.browser_recovery_reminder === current.attempt && current.attempt !== undefined
          ? { ...current, reminded: true }
          : current
      if (message.type !== "assistant") return current
      return message.content.reduce((current, part) => {
        if (part.type !== "tool" || part.state.status !== "completed") return current
        if (part.name !== "loginom_dock_browser_recovery" && !part.name.startsWith("loginom_browser_")) return current
        const text = part.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n")
        const value = Option.getOrUndefined(decode(text))
        if (!value) return current
        const start = part.name === "loginom_dock_browser_recovery" && part.state.input.action === "start"
        return {
          operationID: typeof value.operation_id === "string" ? value.operation_id : current.operationID,
          phase: value.phase,
          attempt: start ? part.id : current.attempt,
          reminded: start ? false : current.reminded,
        }
      }, current)
    },
    { reminded: false },
  )
  if (!state.operationID || !state.attempt || !activePhases.has(state.phase ?? "")) return undefined
  return { operationID: state.operationID, attempt: state.attempt, reminded: state.reminded }
}

export function reminder(operationID: string) {
  return (
    `Browser recovery for operation ${operationID} is still active and holds the Loginom page. ` +
    "Continue this step with the browser tools and call dock_browser_recovery finish with what you did, " +
    "or call dock_browser_recovery stop if no justified next action remains. Ending the turn again stops the attempt."
  )
}
