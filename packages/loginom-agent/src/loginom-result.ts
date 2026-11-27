// The control state of a Dock reply (B2.5d), ported from 0.4 `packages/opencode/src/session/loginom-result.ts`. Effect 4.1
// spells 0.4's `Schema.UnknownFromJsonString` as `Schema.fromJsonString(Schema.Unknown)`.
import { Option, Schema } from "effect"

const receipt = Schema.Struct({
  operation_id: Schema.NonEmptyString,
  status: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  error: Schema.optional(Schema.Unknown),
  outcome: Schema.optional(Schema.NullOr(Schema.Struct({ status: Schema.optional(Schema.String) }))),
})
const fromJSON = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const decode = Schema.decodeUnknownOption(receipt)
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

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

const uploadProof = Schema.Struct({
  status: Schema.Literal("SUCCEEDED"),
  upload_operation_id: Schema.NonEmptyString,
  destination: Schema.NonEmptyString,
  upload_completion_verified: Schema.Literal(true),
  cleanup_complete: Schema.Literal(true),
  bytes_source: Schema.optional(Schema.String),
  reused: Schema.optional(Schema.Boolean),
})
const packageUpload = Schema.decodeUnknownOption(Schema.Struct({ local_package_upload: uploadProof }))
const artifactUpload = Schema.decodeUnknownOption(
  Schema.Struct({ state: Schema.Literal("settled"), status: Schema.Literal("SUCCEEDED"), output: uploadProof }),
)
const deliveryTools = new Set([
  "dock_artifact_deliver",
  "dock_artifact_delivery_status",
  "dock_artifact_delivery_resume",
  "dock_artifact_delivery_cancel",
])

export function verifiedUpload(
  tool: string,
  result: { structuredContent?: unknown; content: readonly Record<string, unknown>[] },
) {
  const first = result.content[0]
  const isPackage = tool === "dock_prepare"
  const proof = isPackage
    ? Option.getOrUndefined(packageUpload(Option.getOrUndefined(fromJSON(first?.text))))?.local_package_upload
    : deliveryTools.has(tool)
      ? Option.getOrUndefined(artifactUpload(result.structuredContent))?.output
      : undefined
  if (!proof || proof.reused) return
  const slash = proof.destination.lastIndexOf("/")
  if (!proof.destination.startsWith("/") || slash === proof.destination.length - 1) return
  const serverName = proof.destination.slice(slash + 1)
  // Byte admissions add the Host's opaque input identity to the server filename. Original references keep their name.
  const name = isPackage || proof.bytes_source !== "native_file_store"
    ? serverName.replace(/^[a-f0-9]{64}-\d+-/, "")
    : serverName
  return {
    v: 1,
    kind: "upload",
    state: "settled",
    status: "SUCCEEDED",
    operationId: proof.upload_operation_id,
    upload: { name, folder: proof.destination.slice(0, slash) || "/", destination: proof.destination },
  }
}
