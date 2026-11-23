// Loginom AI Agent (B2.7a4): `run` of the product CLI, as 0.4 ran it with `LOGINOM_AI_AGENT_CLI_ROOT`
// (`a080f7725c:packages/opencode/src/cli/{cmd/run,run-outcome,standalone-run}.ts`). The JSON stream keeps what `evals`
// (`evals/src/cli.ts`) and `scripts/node-acceptance/run-check.py` read from 0.4: `session.status` busy, retry and idle,
// and errors with 0.4's `name` and `data` next to OpenCode 2's `type` and `message`. The exit code follows the final
// state of the run (design §10): 1 for a failed session, a declined permission or a tool failure the run did not
// correct, 2 for a missing Loginom connection, 4 for a Loginom operation left to recovery, 130 for a cancelled run.
export * as RunProduct from "./product"

import path from "node:path"

type RunError = { type: string; message: string; status?: number }

type Part = {
  id: string
  sessionID: string
  tool: string
  state:
    | { status: "completed"; input: Record<string, unknown>; metadata?: Record<string, unknown> }
    | {
        status: "error"
        input: Record<string, unknown>
        error: string
        /** OpenCode 2's error type, such as `permission.rejected`. */
        type?: string
        metadata?: Record<string, unknown>
      }
    | { status: "pending" | "running"; input: Record<string, unknown> }
}

/** Whether this process is the product CLI: its entry applied a CLI profile (`profile.ts`). */
export function enabled() {
  return process.env.LOGINOM_AI_AGENT_CLI_ROOT !== undefined
}

/** An error of the product, as 0.4 reported it: the code is its name and its message. */
export function code(name: string): RunError {
  return { type: name, message: name }
}

/** An error event's error with 0.4's `name`, `data.message` and `data.statusCode` (what `evals` classifies by). */
export function error(input: RunError) {
  return {
    ...input,
    name: legacyName(input.type),
    data: { message: input.message, ...(input.status === undefined ? {} : { statusCode: input.status }) },
  }
}

/** The `session.status` of 0.4: busy from the prompt's delivery, a retry, idle when the run ends. */
export function status(
  value: { type: "busy" | "idle" } | { type: "retry"; attempt: number; at: number; error: RunError },
) {
  if (value.type !== "retry") return { status: { type: value.type } }
  return { status: { type: "retry", attempt: value.attempt, message: value.error.message, next: value.at } }
}

const connection = new Set([
  "LOGINOM_CONNECTION_NOT_READY",
  "LOGINOM_LOGIN_REJECTED",
  "LOGINOM_ACCOUNT_MISMATCH",
  "LOGINOM_LOGIN_UNAVAILABLE",
  "LOGINOM_BROWSER_START_FAILED",
])

// A Dock call left in doubt, or refused because one is: the profile keeps a recovery record until `loginom recover`.
// 0.4 asked its own Host after the run; on OpenCode 2 the Host belongs to the server, and the stream is what the CLI sees.
const recovery = /^LOGINOM_(CALL_UNCERTAIN|RECOVERY_REQUIRED)\b/

/** Follows the tool calls of a run. Correlation is explicit: a different successful call does not repair a failure. */
export function outcome() {
  const unresolved = new Map<string, Part>()
  const connectionFailures = new Map<string, "LOGINOM_CONFIG_REQUIRED" | "LOGINOM_CONNECTION_NOT_READY">()
  const state = { rejected: false, recovery: false }
  const failed = () => unresolved.size > 0
  const connectionFailure = () => [...connectionFailures.values()].at(-1)
  return {
    observe(part: Part) {
      if (part.state.status !== "completed" && part.state.status !== "error") return
      if (part.state.status === "error" && denied(part)) state.rejected = true
      if (part.tool.startsWith("loginom_") && part.state.status === "error" && recovery.test(part.state.error))
        state.recovery = true
      if (part.tool === "loginom_dock_prepare") {
        const key = JSON.stringify(canonical(part.state.input))
        if (part.state.status === "error") {
          if (part.state.error === "LOGINOM_CONFIG_REQUIRED") connectionFailures.set(key, part.state.error)
          // Browser admission happens lazily, when the scenario is prepared; it keeps the former preflight's exit.
          if (connection.has(part.state.error)) connectionFailures.set(key, "LOGINOM_CONNECTION_NOT_READY")
        }
        if (part.state.status === "completed" && !part.state.metadata?.isError && !part.state.metadata?.loginomPending)
          connectionFailures.delete(key)
        return
      }
      // A failed Loginom scenario does not fail the whole run; denials and invalid calls keep their own tool names.
      if (part.tool.startsWith("loginom_")) return
      // The run cancels every question it cannot ask, and the model goes on without an answer; 0.4 left the tool out.
      if (part.tool === "question") return
      const key =
        part.tool === "invalid" ? `invalid:${part.id}` : JSON.stringify([part.tool, canonical(part.state.input)])
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
    /** The run declined a permission request it cannot ask the user about. */
    reject() {
      state.rejected = true
    },
    /** Whether a call failed and nothing corrected it. */
    failed,
    connectionFailure,
    /** The errors the run ends with, in 0.4's order, and their exit code; `failure` is the session's own. */
    verdict(failure: RunError | undefined) {
      const reported = [...(state.rejected ? [code("CLI_PERMISSION_REJECTED")] : []), ...(failure ? [failure] : [])]
      const connected = connectionFailure()
      const errors = [
        ...reported,
        ...(reported.length === 0 && connected ? [code(connected)] : []),
        ...(reported.length === 0 && !connected && failed() ? [code("CLI_TOOL_FAILED")] : []),
        ...(state.recovery ? [code("LOGINOM_RECOVERY_REQUIRED")] : []),
      ]
      const exit = state.recovery ? 4 : errors[0]?.type === "LOGINOM_CONFIG_REQUIRED" ? 2 : errors.length > 0 ? 1 : 0
      return { errors, exit }
    },
    /** The errors a cancelled run ends with; its exit code is 130. */
    cancelled() {
      return [...(state.recovery ? [code("LOGINOM_RECOVERY_REQUIRED")] : []), code("CLI_CANCELLED")]
    },
  }
}

// OpenCode 2's provider errors under the names 0.4 gave them; a product code is its own name.
function legacyName(type: string) {
  if (type === "provider.auth") return "ProviderAuthError"
  if (type === "provider.no-route") return "ProviderModelNotFoundError"
  if (type.startsWith("provider.")) return "APIError"
  return type
}

function denied(part: Part) {
  return (
    part.state.status === "error" &&
    (part.state.type === "permission.rejected" || part.state.metadata?.permissionDenied === true)
  )
}

// A later successful read repairs only the latest missing-file error in the same directory, with the same extension and
// otherwise the same arguments; filename similarity is irrelevant. OpenCode 2's `read` takes `path` and returns an empty
// page past the end of a file, so 0.4's repaired offset error has no counterpart.
function correctedRead(failure: Part, success: Part) {
  if (failure.tool !== "read" || success.tool !== "read" || failure.state.status !== "error") return false
  if (failure.sessionID !== success.sessionID) return false
  if (denied(failure)) return false
  const before = failure.state.input.path
  const after = success.state.input.path
  if (typeof before !== "string" || typeof after !== "string") return false
  if (!failure.state.error.startsWith(`File not found: ${before}`)) return false
  if (path.dirname(before) !== path.dirname(after) || path.extname(before) !== path.extname(after)) return false
  return (
    JSON.stringify(canonical({ ...failure.state.input, path: undefined })) ===
    JSON.stringify(canonical({ ...success.state.input, path: undefined }))
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
