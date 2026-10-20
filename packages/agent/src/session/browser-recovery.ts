import { isRecord } from "@/util/record"

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
