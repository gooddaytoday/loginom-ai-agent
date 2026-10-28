import { Option, Schema } from "effect"
import { isRecord } from "@/util/record"

const receipt = Schema.Struct({
  operation_id: Schema.NonEmptyString,
  status: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  error: Schema.optional(Schema.Unknown),
  outcome: Schema.optional(Schema.NullOr(Schema.Struct({ status: Schema.optional(Schema.String) }))),
})
const fromJSON = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decode = Schema.decodeUnknownOption(receipt)

// Preserve control information even when a single JSON line containing table
// data exceeds the backend limit. The complete original stays in local output.
export function loginomResultSummary(result: {
  structuredContent?: unknown
  content: readonly { type: string; text?: string }[]
}) {
  const first = result.content[0]
  const parsed = first?.type === "text" ? fromJSON(first.text) : Option.none()
  const value = [result.structuredContent, Option.getOrUndefined(parsed)].find(
    (value) => isRecord(value) && Option.isSome(decode(value)),
  )
  if (!isRecord(value)) return undefined
  return JSON.stringify({
    ...Object.fromEntries(
      [
        "result_version",
        "operation_id",
        "state",
        "status",
        "action_key",
        "phase",
        "effect_possible",
        "cleanup_complete",
        "request_rejected",
        "node",
        "execution",
        "package_saved",
        "error",
        "next_step",
      ]
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    ),
    response_summary: true,
    data_delivery: "omitted_by_backend_size_limit",
  })
}

// Dock's receipt is the first text block (or structuredContent for node jobs).
// Do not inspect arbitrary nested output: a table may itself contain status columns.
export function loginomResultState(result: {
  isError?: boolean
  structuredContent?: unknown
  content: readonly { type: string; text?: string }[]
}) {
  if (result.isError === true) return "failed"
  const first = result.content[0]
  const parsed = first?.type === "text" ? fromJSON(first.text) : Option.none()
  const states = [result.structuredContent, Option.getOrUndefined(parsed)].map((value) => {
    const decoded = decode(value)
    if (Option.isNone(decoded)) return "completed"
    const item = decoded.value
    if (
      item.state === "failed" ||
      (item.state === "settled" && item.error != null) ||
      [item.status, item.outcome?.status].some(
        (status) => status === "FAILED" || status === "AMBIGUOUS" || status === "NOT_APPLIED",
      )
    )
      return "failed"
    return item.state === "running" ? "pending" : "completed"
  })
  return states.includes("failed") ? "failed" : states.includes("pending") ? "pending" : "completed"
}
