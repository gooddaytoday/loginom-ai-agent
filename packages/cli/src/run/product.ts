// Loginom AI Agent (B2.7a4): `run` of the product CLI, as 0.4 ran it with `LOGINOM_AI_AGENT_CLI_ROOT`
// (`a080f7725c:packages/opencode/src/cli/{cmd/run,run-outcome,standalone-run}.ts`). The JSON stream keeps what `evals`
// (`evals/src/cli.ts`) and `scripts/node-acceptance/run-check.py` read from 0.4: `session.status` busy, retry and idle,
// and errors with 0.4's `name` and `data` next to OpenCode 2's `type` and `message`. The exit code follows the final
// state of the run (design §10): 1 for a failed session, a declined permission or a tool failure the run did not
// correct, 2 for a missing Loginom connection, 4 for a Loginom operation left to recovery, 130 for a cancelled run.
export * as RunProduct from "./product"

import { randomBytes } from "node:crypto"
import { EOL } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { dashboardPrompt } from "@loginom-ai-agent/dashboard/contract/prompt"
import {
  isRpcError,
  type JsonValue,
  type LocationRef,
  type OpenCodeClient,
  type PermissionRequest,
} from "@opencode/client/promise"
import { Option, Schema } from "effect"

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

/** The skill of `run --command <skill>`, attached to the prompt the way OpenCode 2 attaches a skill the user picks. */
export function skills() {
  const id = process.env.LOGINOM_AI_AGENT_RUN_COMMAND
  return id === undefined ? undefined : [{ id }]
}

/**
 * The checks 0.4 made before the model (`v0.4.0:packages/opencode/src/cli/standalone-run.ts`), which the server's Host
 * answers through the product plugin (`loginom.preflight`, B2.7a4b): with strict recovery
 * (`LOGINOM_AI_AGENT_STRICT_RECOVERY=1`) an operation the journal keeps refuses any run, exit code 4;
 * `run --command loginom-automation` needs a saved connection (2) and ready Help (1). Only those runs ask, so an ordinary
 * one never waits for the Host. A refusal is written as 0.4 wrote it, the error event and the code on stderr. Returns
 * whether the run goes on.
 */
export async function preflight(input: {
  client: OpenCodeClient
  location: LocationRef
  sessionID: string
  format: "default" | "json"
  signal: AbortSignal
}) {
  const automation = process.env.LOGINOM_AI_AGENT_RUN_COMMAND === "loginom-automation"
  if (!automation && process.env.LOGINOM_AI_AGENT_STRICT_RECOVERY !== "1") return true
  const refused = await ask(input, "loginom.preflight", "check", { automation }).then(
    (output) => Option.getOrElse(decodePreflight(output), () => ({ code: "LOGINOM_REPLY_INVALID" })).code,
    () => (input.signal.aborted ? "CLI_CANCELLED" : "CLI_RUN_FAILED"),
  )
  if (refused === undefined) return true
  refuse(input, refused)
  return false
}

/**
 * `run --dashboard <id>` (B2.9i): the server's product plugin prepares the dashboard's folder from its Studio snapshot
 * before the session (`loginom.dashboard`, B2.9h), and the run takes place there, with the task 0.4 added to the prompt
 * (`v0.4.0:packages/opencode/src/cli/standalone-run.ts`). The CLI always checks the latest publication, as 0.4's did.
 * Strict recovery refuses before the one-time snapshot is spent, as 0.4 checked its journal first. 0.4's notices go to
 * stderr; a refusal is written as 0.4 wrote it, with `LOGINOM_CONFIG_REQUIRED` exiting 2 and the others 1. Returns the
 * directory of the run and the task, the run's own directory without a dashboard, or nothing when refused.
 */
export async function dashboard(input: {
  client: OpenCodeClient
  location: LocationRef
  format: "default" | "json"
  signal: AbortSignal
}) {
  const id = process.env.LOGINOM_AI_AGENT_RUN_DASHBOARD
  if (id === undefined) return { directory: input.location.directory }
  if (!(await preflight({ ...input, sessionID: "" }))) return undefined
  const reply = await ask(input, "loginom.dashboard", "prepare", { id, defer: false }).then(
    (output) => Option.getOrElse(decodeDashboard(output), () => ({ code: "LOGINOM_REPLY_INVALID" })),
    () => ({ code: input.signal.aborted ? "CLI_CANCELLED" : "CLI_RUN_FAILED" }),
  )
  if ("code" in reply) {
    refuse({ ...input, sessionID: "" }, reply.code, "message" in reply ? reply.message : reply.code)
    return undefined
  }
  const notice = reply.notice
  if (notice)
    process.stderr.write(
      (notice.kind === "newer-publication"
        ? `На стенде новая версия ${notice.latest}. Локальные исходники сохранены; перед заменой потребуется подтверждение.`
        : notice.kind === "publication-check-unavailable"
          ? "Не удалось проверить публикацию в Studio. Открыт сохранённый локальный черновик."
          : `Сборка версии ${notice.latest} не удалась. Текущая версия: ${notice.current ?? "нет"}. ${notice.error ?? ""}`) +
        "\n",
    )
  return { directory: reply.directory, prompt: dashboardPrompt(reply.action) }
}

/** Whether this is `run --dashboard <id>`, whose `--file` is read in the dashboard's folder once it is prepared (B2.9j). */
export function dashboarding() {
  return enabled() && process.env.LOGINOM_AI_AGENT_RUN_DASHBOARD !== undefined
}

/** 0.4's text for a publication `run` declines without `--auto` (B2.9j); other requests keep OpenCode 2's. */
export function refusal(request: Pick<PermissionRequest, "action" | "resources">) {
  if (request.action !== "dashboard_publish") return undefined
  return (
    `Публикация отклонена: dashboard_publish (${request.resources.join(", ")}) требует явного согласия. ` +
    "Для подтверждения в CLI укажите --auto."
  )
}

/**
 * Asks about a dashboard's deletion as 0.4's `run` did (B2.9j; `v0.4.0:packages/opencode/src/cli/cmd/run.ts`,
 * `run/runtime.stdin.ts`): every time, `--auto` or not (В-102), in the controlling terminal even when stdin is a pipe.
 * The user types a random phrase, so neither input typed ahead nor an earlier phrase approves it; «Отмена» or any other
 * line, end of input or no terminal declines it. Ctrl+C cancels the run, and a cancelled run gives no answer
 * (`undefined`): its cancellation stops the call, which withdraws the question, so the model is not asked again.
 */
export async function confirm(request: Pick<PermissionRequest, "resources" | "metadata">, signal: AbortSignal) {
  if (signal.aborted) return undefined
  const { resolveInteractiveStdin } = await import("../mini-host")
  const terminal = await Promise.try(resolveInteractiveStdin).catch(() => undefined)
  if (!terminal) {
    process.stderr.write("Удаление отклонено: требуется управляющий терминал.\n")
    return false
  }
  const phrase = "Удалить " + randomBytes(4).toString("hex")
  const answer = Promise.withResolvers<boolean | undefined>()
  const decline = () => answer.resolve(false)
  const cancel = () => answer.resolve(undefined)
  // Raw input turns Ctrl+C into a key; the run cancels on the signal, as it would without the question.
  const interrupt = () => {
    cancel()
    process.kill(process.pid, "SIGINT")
  }
  // End of input can emit readline's buffered text as a line without an Enter.
  const eof = (chunk: Buffer | string) => {
    if (chunk.toString().includes("\x04")) decline()
  }
  const reader = createInterface({
    input: terminal.stdin,
    output: process.stderr.isTTY ? process.stderr : undefined,
    terminal: true,
  })
  terminal.stdin.prependListener("end", decline)
  terminal.stdin.prependListener("data", eof)
  process.stderr.write(
    [...deletion(request), `Введите «${phrase}» для подтверждения или «Отмена» для отказа.`, ""].join(EOL),
  )
  try {
    reader.once("line", (line) => answer.resolve(line === phrase))
    reader.once("close", decline).once("error", decline).once("SIGINT", interrupt)
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted) return undefined
    if (terminal.stdin.readableEnded || terminal.stdin.destroyed) return false
    const approved = await answer.promise
    return signal.aborted ? undefined : approved
  } finally {
    signal.removeEventListener("abort", cancel)
    reader.close()
    terminal.stdin.off("end", decline).off("data", eof)
    terminal.cleanup()
  }
}

// What a deletion removes, as 0.4 showed it; names from the dashboard's snapshot are quoted with control characters escaped.
function deletion(request: Pick<PermissionRequest, "resources" | "metadata">) {
  const literal = (value: string | undefined) =>
    JSON.stringify(value ?? "").replace(
      /[\p{Cc}\p{Cf}\u2028\u2029]/gu,
      (char) => `\\u{${char.codePointAt(0)!.toString(16)}}`,
    )
  const count = request.metadata?.publicationCount
  const confirmed = request.metadata?.confirmedRemoved
  return [
    `Узел: ${literal(request.resources[0])}`,
    `Пакет: ${literal(request.resources[1])}`,
    ...(Number.isSafeInteger(count) ? [`Опубликованных версий к удалению: ${count}`] : []),
    ...(typeof confirmed === "number" && Number.isSafeInteger(confirmed) && confirmed > 0
      ? [`Уже подтверждено удаление версий: ${confirmed}`]
      : []),
    "Локальный черновик и неопубликованные правки будут удалены.",
  ]
}

const exits: Record<string, number> = { LOGINOM_CONFIG_REQUIRED: 2, LOGINOM_RECOVERY_REQUIRED: 4, CLI_CANCELLED: 130 }
const decodePreflight = Schema.decodeUnknownOption(Schema.Struct({ code: Schema.optional(Schema.String) }))
const decodeDashboard = Schema.decodeUnknownOption(
  Schema.Union([
    Schema.Struct({ code: Schema.String, message: Schema.String }),
    Schema.Struct({
      directory: Schema.String,
      action: Schema.Literals(["create", "edit"]),
      notice: Schema.optional(
        Schema.Struct({
          kind: Schema.String,
          latest: Schema.optional(Schema.String),
          current: Schema.optional(Schema.String),
          error: Schema.optional(Schema.String),
        }),
      ),
    }),
  ]),
)

// The plugin registers its RPCs once the Location's plugins have loaded, and the server does not wait for them.
async function ask(
  input: { client: OpenCodeClient; location: LocationRef; signal: AbortSignal },
  rpcID: string,
  method: string,
  request: JsonValue,
) {
  const deadline = Date.now() + 60_000
  while (true) {
    const reply = await input.client.rpc
      .call(
        { rpcID, method, input: request, location: { directory: input.location.directory } },
        { signal: input.signal },
      )
      .catch((failure: unknown) => {
        if (isRpcError(failure) && failure.type === "rpc.unavailable" && Date.now() < deadline) return undefined
        throw failure
      })
    if (reply) return reply.output
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

// A refusal before the model, as 0.4's `failure()`: the error event with JSON output, and the reason on stderr.
function refuse(input: { format: "default" | "json"; sessionID: string }, name: string, message = name) {
  process.exitCode = exits[name] ?? 1
  if (input.format === "json")
    process.stdout.write(
      JSON.stringify({
        type: "error",
        timestamp: Date.now(),
        sessionID: input.sessionID,
        error: error({ type: name, message }),
      }) + "\n",
    )
  process.stderr.write(message + "\n")
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
