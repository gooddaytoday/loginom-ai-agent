import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"
import { Package, ReadFolder } from "./package-folder"

export const MAX_PACKAGE_BYTES = 16 * 1024 * 1024
export const PackageName = Schema.String.check(
  Schema.isPattern(/^(?!(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$))[^./\\:*?"<>|\x00-\x1f\x7f][^/\\:*?"<>|\x00-\x1f\x7f]{0,169}\.lgp$(?![\s\S])/iu),
)
export const UploadInput = Schema.Struct({
  generation: ReadFolder.fields.generation,
  name: PackageName,
  content: Schema.String.check(Schema.isMaxLength(4 * Math.ceil(MAX_PACKAGE_BYTES / 3))),
})
export type UploadInput = typeof UploadInput.Type

export function validUpload(input: UploadInput) {
  if (/[\ud800-\udfff]/u.test(input.name)) return false
  const bytes = Buffer.from(input.content, "base64")
  return bytes.length > 0 && bytes.length <= MAX_PACKAGE_BYTES && bytes.toString("base64") === input.content
}

export const UploadRpc = Rpc.define({
  id: "loginom.package-upload",
  methods: {
    upload: {
      input: Schema.toStandardSchemaV1(UploadInput, {
        leafHook: () => "Invalid package upload",
        checkHook: () => "Invalid package upload",
      }),
      output: Schema.toStandardSchemaV1(Package),
      errors: {
        name_taken: Schema.toStandardSchemaV1(Schema.Undefined),
        session_limit: Schema.toStandardSchemaV1(Schema.Undefined),
        unavailable: Schema.toStandardSchemaV1(Schema.Undefined),
      },
    },
  },
  events: {},
})
