import type { ToolPart } from "@opencode-ai/sdk/v2"
import path from "node:path"

// Correlation is deliberately explicit: a different successful operation does not repair a failure.
export function runToolOutcome() {
  const unresolved = new Map<string, ToolPart>()
  const connectionFailures = new Map<string, "LOGINOM_CONFIG_REQUIRED" | "LOGINOM_CONNECTION_NOT_READY">()
  return {
    observe(part: ToolPart) {
      if (part.state.status !== "completed" && part.state.status !== "error") return
      if (part.tool === "loginom_dock_prepare") {
        const key = JSON.stringify(canonical(part.state.input))
        if (part.state.status === "error") {
          if (part.state.error === "LOGINOM_CONFIG_REQUIRED") connectionFailures.set(key, part.state.error)
          // Browser admission now happens lazily; retain the former connection preflight exit contract.
          if (
            [
              "LOGINOM_CONNECTION_NOT_READY",
              "LOGINOM_LOGIN_REJECTED",
              "LOGINOM_ACCOUNT_MISMATCH",
              "LOGINOM_LOGIN_UNAVAILABLE",
              "LOGINOM_BROWSER_START_FAILED",
            ].includes(part.state.error)
          )
            connectionFailures.set(key, "LOGINOM_CONNECTION_NOT_READY")
        }
        if (part.state.status === "completed" && !part.state.metadata?.isError && !part.state.metadata?.loginomPending)
          connectionFailures.delete(key)
        return
      }
      // A failed Loginom scenario must not fail the whole run. Permission denials
      // and invalid calls stay on their own tool names.
      if (part.tool.startsWith("loginom_")) return
      const input = part.state.input
      const identity =
        part.tool.startsWith("loginom_") && typeof input.operation_id === "string" && input.operation_id
          ? ["operation", input.operation_id]
          : ["arguments", input]
      const key = part.tool === "invalid" ? `invalid:${part.id}` : JSON.stringify([part.tool, canonical(identity)])
      if (part.state.status === "error" || part.tool === "invalid" || part.state.metadata?.isError === true) {
        unresolved.delete(key)
        unresolved.set(key, part)
        return
      }
      if (unresolved.delete(key)) return
      for (const [key, failure] of [...unresolved].reverse()) {
        if (!correctedRead(failure, part)) continue
        unresolved.delete(key)
        break
      }
    },
    failed: () => unresolved.size > 0,
    connectionFailure: () => [...connectionFailures.values()].at(-1),
  }
}

function correctedRead(failure: ToolPart, success: ToolPart) {
  if (failure.tool !== "read" || success.tool !== "read" || failure.state.status !== "error") return false
  if (failure.sessionID !== success.sessionID) return false
  const before = failure.state.input.filePath
  const after = success.state.input.filePath
  if (typeof before !== "string" || typeof after !== "string") return false
  if (!failure.state.error.startsWith(`File not found: ${before}`) || failure.state.metadata?.permissionDenied) return false
  if (path.dirname(before) !== path.dirname(after) || path.extname(before) !== path.extname(after)) return false
  // A later successful read repairs only the latest missing-file error in this directory and
  // extension only when all other arguments match; filename similarity is irrelevant.
  return (
    JSON.stringify(canonical({ ...failure.state.input, filePath: undefined })) ===
    JSON.stringify(canonical({ ...success.state.input, filePath: undefined }))
  )
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  )
}
