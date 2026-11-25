import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Option, Schema } from "effect"
import { isRecord } from "@/util/record"
import { TaskScope } from "./task-scope"

type History = Schema.Schema.Type<typeof SessionV1.WithParts>

const decodeJSON = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const activePhases = new Set(["handoff", "browser", "verify"])

export function metadata(value: unknown) {
  if (!isRecord(value)) return
  const { attempt_id, operation_id, phase } = value
  if (typeof attempt_id !== "string" || !attempt_id || typeof operation_id !== "string" || !operation_id) return
  if (typeof phase !== "string" || !["handoff", "browser", "verify", "stopping", "stopped", "dock"].includes(phase))
    return
  return { attempt_id, operation_id, phase }
}

// The runtime reports the lease phase in every dock_browser_recovery reply and in
// browser replies that end an attempt. The latest phase decides whether the same
// agent still owes this step a finish or stop (design 2026-10-19 §5).
export function active(messages: readonly History[]) {
  const state = messages
    .toSorted(
      (left, right) => left.info.time.created - right.info.time.created || left.info.id.localeCompare(right.info.id),
    )
    .flatMap((message) => message.parts)
    .reduce<{ operationID?: string; phase?: string; attempt?: string; reminded: boolean }>(
      (current, part) => {
        if (
          part.type === "text" &&
          part.synthetic === true &&
          part.metadata?.browser_recovery_reminder === current.attempt
        )
          return { ...current, reminded: true }
        if (part.type !== "tool" || (part.state.status !== "completed" && part.state.status !== "error")) return current
        if (
          part.tool.startsWith("loginom_") &&
          part.state.status === "error" &&
          part.state.metadata?.isError !== true &&
          part.state.error === "LOGINOM_CALL_UNCERTAIN"
        )
          return { reminded: false }
        if (part.tool !== "loginom_dock_browser_recovery" && !part.tool.startsWith("loginom_browser_")) return current
        const recovery = metadata(part.state.metadata?.browserRecovery)
        if (recovery) {
          const newStart =
            part.tool === "loginom_dock_browser_recovery" &&
            part.state.input.action === "start" &&
            part.state.input.operation_id === recovery.operation_id &&
            part.state.status === "completed"
          if (!newStart && (current.attempt !== recovery.attempt_id || current.operationID !== recovery.operation_id))
            return current
          return {
            operationID: recovery.operation_id,
            phase: recovery.phase,
            attempt: recovery.attempt_id,
            reminded: recovery.attempt_id === current.attempt && current.reminded,
          }
        }
        // Stored sessions from earlier versions have only the public phase report.
        if (part.state.status !== "completed") return current
        const value = Option.getOrUndefined(decodeJSON(part.state.output))
        if (!isRecord(value) || typeof value.phase !== "string") return current
        const start = part.tool === "loginom_dock_browser_recovery" && part.state.input.action === "start"
        if (!start && value.operation_id && value.operation_id !== current.operationID) return current
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

export function context(input: TaskScope.Input) {
  const current = TaskScope.currentTask(input)
  const profile = current.scope?.profile
  const recovery = profile === "default" || profile === "loginom-automation" ? active(current.messages) : undefined
  return { task: current.scope, recovery, messages: current.messages }
}

function isReminder(part: History["parts"][number]): part is SessionV1.TextPart {
  return part.type === "text" && part.synthetic === true && typeof part.metadata?.browser_recovery_reminder === "string"
}

// Keep the durable transcript intact. A summary must not turn a temporary instruction into ordinary text.
export function project(
  messages: SessionV1.WithParts[],
  input?: Omit<TaskScope.Input, "messages"> & { messages: SessionV1.WithParts[] },
) {
  if (!(input?.messages ?? messages).some((message) => message.parts.some(isReminder))) return messages
  const current = input && context(input)
  const allowed = current?.recovery?.reminded
    ? current.messages
        .flatMap((message) => message.parts)
        .findLast((part) => isReminder(part) && part.metadata?.browser_recovery_reminder === current.recovery?.attempt)
    : undefined
  const projected = messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => !isReminder(part) || part.id === allowed?.id),
  }))
  if (!allowed || projected.some((message) => message.parts.some((part) => part.id === allowed.id))) return projected
  // Compaction with no retained tail can exclude the active task's persisted reminder.
  const original = input?.messages.find((message) => message.info.id === allowed.messageID)
  if (original) projected.push({ info: original.info, parts: original.parts.filter((part) => part.id === allowed.id) })
  return projected
}

export function reminder(operationID: string) {
  return (
    `Browser recovery for operation ${operationID} is still active and holds the Loginom page. ` +
    "Continue this step with the browser tools and call dock_browser_recovery finish with what you did, " +
    "or call dock_browser_recovery stop if no justified next action remains. Ending the turn again stops the attempt."
  )
}

export * as BrowserRecovery from "./browser-recovery"
