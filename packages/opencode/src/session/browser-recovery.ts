import type { SessionV1 } from "@loginom-ai-agent/core/v1/session"
import { Option, Schema } from "effect"
import { isRecord } from "@/util/record"

type History = Schema.Schema.Type<typeof SessionV1.WithParts>

const decodeJSON = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const activePhases = new Set(["handoff", "browser", "verify"])

// The runtime reports the lease phase in every dock_browser_recovery reply and in
// browser replies that end an attempt. The latest phase decides whether the same
// agent still owes this step a finish or stop (design 2026-10-19 §5).
export function active(messages: readonly History[]) {
  const state = messages
    .toSorted((left, right) => left.info.time.created - right.info.time.created || left.info.id.localeCompare(right.info.id))
    .flatMap((message) => message.parts)
    .reduce<{ operationID?: string; phase?: string; attempt?: string; reminded: boolean }>(
      (current, part) => {
        if (part.type === "text" && part.synthetic === true && part.metadata?.browser_recovery_reminder === current.attempt)
          return { ...current, reminded: true }
        if (part.type !== "tool" || part.state.status !== "completed") return current
        if (part.tool !== "loginom_dock_browser_recovery" && !part.tool.startsWith("loginom_browser_")) return current
        const value = Option.getOrUndefined(decodeJSON(part.state.output))
        if (!isRecord(value) || typeof value.phase !== "string") return current
        const start = part.tool === "loginom_dock_browser_recovery" && part.state.input.action === "start"
        return {
          operationID: typeof value.operation_id === "string" ? value.operation_id : current.operationID,
          phase: value.phase,
          attempt: start ? part.callID : current.attempt,
          reminded: start ? false : current.reminded,
        }
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

export * as BrowserRecovery from "./browser-recovery"
