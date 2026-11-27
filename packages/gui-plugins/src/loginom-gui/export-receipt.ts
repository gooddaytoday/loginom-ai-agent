import type { SessionMessageAssistantTool } from "@opencode/client/promise"
import type { ToolRendererProps } from "@opencode/plugin/gui/builtin"
import { NonNegativeInt } from "@opencode/schema/schema"
import { getFilename } from "@opencode/util/path"
import { Option, Schema } from "effect"

const text = Schema.NonEmptyString

const receipt = Schema.Struct({
  artifact_id: text,
  destination: Schema.String.check(Schema.isPattern(/^\/.+\.(csv|tsv|txt|xls|xlsx|lgd)$/iu)),
  bytes: NonNegativeInt,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  verification_id: text,
  name: text,
  node: Schema.Struct({ document_id: text, workflow_id: text, node_id: text }),
})

const decodeReceipt = Schema.decodeUnknownOption(Schema.Struct({ export: receipt }))

const decodeOutputFiles = Schema.decodeUnknownOption(
  Schema.Array(
    Schema.Struct({
      artifact_id: text,
      path: Schema.String.check(Schema.isPattern(/^(?:\/(?!\/)|[A-Za-z]:[/\\])/u)),
      name: text,
    }),
  ),
)

const decodeExportRequest = Schema.decodeUnknownOption(
  Schema.Struct({
    finish: Schema.Literal("execute"),
    target: Schema.Struct({ type: Schema.Literals(["exports.text", "exports.excel", "exports.lgd"]) }),
  }),
)

export type ExportReceipt = typeof receipt.Type

type ToolMetadata = ToolRendererProps["metadata"]

export function confirmedExport(tool: string, status: string | undefined, metadata?: ToolMetadata) {
  if (status !== "completed" || metadata?.isError === true || metadata?.loginomPending === true) return

  if (tool !== "loginom_dock_node_apply" && tool !== "loginom_dock_node_wait" && tool !== "loginom_dock_node_status")
    return

  return Option.getOrUndefined(decodeReceipt(metadata?.loginom))?.export
}

export function localExportPath(receipt: ExportReceipt, metadata: ToolMetadata) {
  const files = Option.getOrUndefined(decodeOutputFiles(metadata.outputFiles))

  // The runtime has already looked up these private paths in this session's output store.
  return files?.find(
    (file) =>
      file.artifact_id === receipt.artifact_id && file.name === receipt.name && getFilename(file.path) === file.name,
  )?.path
}

export function turnExportNames(calls: readonly SessionMessageAssistantTool[]) {
  const files = new Map<string, ExportReceipt>()
  let requested = false

  for (const call of calls) {
    if (
      (call.name === "loginom_dock_node_apply" || call.name === "loginom_dock_node_resume") &&
      Option.isSome(decodeExportRequest(call.state.input))
    ) {
      requested = true
    }

    if (call.state.status !== "completed") continue

    const file = confirmedExport(call.name, call.state.status, call.state.metadata)

    if (file) files.set(JSON.stringify([file.verification_id, file.artifact_id]), file)
  }

  return files.size || requested ? [...files.values()].map((file) => file.name) : undefined
}
