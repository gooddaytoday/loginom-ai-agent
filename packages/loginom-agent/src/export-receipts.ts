import type { SessionDomain } from "@opencode/plugin/promise/session"
import { NonNegativeInt } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Option, Schema } from "effect"

const node = Schema.Struct({
  document_id: Schema.NonEmptyString,
  workflow_id: Schema.NonEmptyString,
  node_id: Schema.NonEmptyString,
})
const file = Schema.Struct({
  artifact_id: Schema.NonEmptyString,
  destination: Schema.String.check(Schema.isPattern(/^\/.+\.(csv|tsv|txt|xls|xlsx|lgd)$/iu)),
  bytes: NonNegativeInt,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  verification_id: Schema.NonEmptyString,
})
const exportRecord = Schema.Struct({ ...file.fields, name: Schema.NonEmptyString, node })
const metadata = Schema.Struct({ export: exportRecord })
const decodeMetadata = Schema.decodeUnknownOption(metadata)
const decodeResult = Schema.decodeUnknownOption(
  Schema.Struct({
    result_version: Schema.Literal("user-v1"),
    operation_id: Schema.NonEmptyString,
    state: Schema.Literal("settled"),
    status: Schema.Literal("SUCCEEDED"),
    action_key: Schema.Literal("node.apply"),
    cleanup_complete: Schema.Literal(true),
    error: Schema.Null,
    node,
    execution: Schema.Struct({ status: Schema.Literal("completed"), execution_id: Schema.NonEmptyString }),
    output: Schema.Struct({
      status: Schema.Literal("complete"),
      file_artifacts: Schema.Tuple([
        Schema.Struct({
          ...file.fields,
          execution_id: Schema.NonEmptyString,
          freshness_basis: Schema.Literals([
            "explicit_replace_and_completed_native_execution",
            "native_absence_check_and_completed_execution",
          ]),
        }),
      ]),
    }),
  }),
)

const dockTools = new Set(["dock_node_apply", "dock_node_wait", "dock_node_status"])

export function exportMetadata(tool: string, structuredContent: unknown): typeof metadata.Type | undefined {
  if (!dockTools.has(tool)) return undefined
  const result = decodeResult(structuredContent)
  if (Option.isNone(result)) return undefined
  const receipt = result.value
  const [artifact] = receipt.output.file_artifacts
  if (artifact.execution_id !== receipt.execution.execution_id) return undefined
  return {
    export: {
      artifact_id: artifact.artifact_id,
      destination: artifact.destination,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      verification_id: artifact.verification_id,
      name: artifact.destination.slice(artifact.destination.lastIndexOf("/") + 1),
      node: receipt.node,
    },
  }
}

const turnInput = Schema.Struct({ sessionID: Session.ID, messageID: SessionMessage.ID })

export const exportReceiptsRpc = {
  id: "loginom.exports",
  methods: {
    turn: {
      input: Schema.toStandardSchemaV1(turnInput),
      output: Schema.toStandardSchemaV1(Schema.Struct({ files: Schema.Array(exportRecord) })),
      errors: { not_found: Schema.toStandardSchemaV1(Schema.Undefined) },
    },
  },
  events: {},
}

export async function turnExports(
  history: SessionDomain["history"],
  { sessionID, messageID }: typeof turnInput.Type,
  signal: AbortSignal,
) {
  const previous = { id: messageID, direction: "previous" as const }
  const [idle] = await history({ sessionID, type: "idle", limit: 1, cursor: previous })
  const modern = idle !== undefined || (await history({ sessionID, type: "idle", limit: 1 })).length > 0
  const [start] = modern ? [idle] : await history({ sessionID, type: "user", limit: 1, cursor: previous })
  const files = new Map<string, typeof exportRecord.Type>()
  let after = start?.id
  let found = false
  while (true) {
    signal.throwIfAborted()
    const page = await history({ sessionID, ...(after && { cursor: { id: after, direction: "next" } }) })
    const last = page.at(-1)
    if (!last) return found ? { files: [...files.values()] } : undefined
    for (const message of page) {
      if (message.type === "idle" || (!modern && found && message.type === "user"))
        return found ? { files: [...files.values()] } : undefined
      if (message.type === "user" && message.id === messageID) found = true
      if (message.type !== "assistant" || (!modern && !found)) continue
      for (const part of message.content) {
        if (part.type !== "tool" || part.state.status !== "completed" || !part.name.startsWith("loginom_")) continue
        if (!dockTools.has(part.name.slice("loginom_".length))) continue
        const decoded = decodeMetadata(part.state.metadata?.loginom)
        if (Option.isNone(decoded)) continue
        const receipt = decoded.value.export
        const key = JSON.stringify([receipt.verification_id, receipt.artifact_id])
        if (!files.has(key)) files.set(key, receipt)
      }
    }
    after = last.id
  }
}
