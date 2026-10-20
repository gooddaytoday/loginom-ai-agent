import { isRecord } from "@/util/record"
import { TaskScope } from "./task-scope"
import type { MessageID } from "./schema"

export function reminder(input: Parameters<typeof TaskScope.derive>[0]) {
  const task = TaskScope.derive(input)
  if (!task) return
  const visible = TaskScope.visible(input)
  const start = visible.findIndex((message) => message.info.id === task.taskMessageID)
  const users = new Set<MessageID>()
  const messages = visible.filter((message, index) => {
    if (message.info.role === "assistant") return !message.info.summary && users.has(message.info.parentID)
    const replay = TaskScope.replayOf(message)
    // derive already found the last genuine task; later users are continuations or replay.
    if (replay ? !users.has(replay) : index < start) return false
    users.add(message.info.id)
    return true
  })
  const latest = messages.findLast((message) => message.info.role === "assistant")
  if (latest?.info.role === "assistant" && latest.info.error) return
  const recovery = messages
    .flatMap((message) => message.parts)
    .flatMap((part) => {
      if (part.type !== "tool" || !part.tool.startsWith("loginom_")) return []
      if (part.state.status !== "completed" && part.state.status !== "error") return []
      const value = state(part.state.metadata?.loginomBrowserRecovery)
      return value ? [value] : []
    })
    .at(-1)
  if (recovery?.state !== "browser") return
  if (
    messages.some(
      (message) =>
        message.info.role === "user" &&
        message.parts.some(
          (part) =>
            part.type === "text" && part.synthetic && part.metadata?.browser_recovery_reminder === recovery.attempt_id,
        ),
    )
  )
    return
  return {
    attemptID: recovery.attempt_id,
    text: `Browser recovery attempt ${recovery.attempt_id} is still active. Continue the failed step with the allowed loginom_browser_* tools and call loginom_dock_browser_recovery with action "finish" when its result is reached. If no justified action remains, call it with action "stop", follow its next_step and report what was done in the browser, what the runtime verified, what only you attested and what remains unknown. Do not ask the user to fix the Loginom UI. Ending the turn again stops this attempt.`,
  }
}

export function state(value: unknown) {
  if (!isRecord(value)) return
  if (typeof value.attempt_id !== "string" || !value.attempt_id.length || value.attempt_id.length > 160) return
  switch (value.state) {
    case "dock":
    case "handoff":
    case "browser":
    case "verifying":
    case "stopped":
      return { attempt_id: value.attempt_id, state: value.state }
  }
}

export * as BrowserRecovery from "./browser-recovery"
