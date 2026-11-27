import { Option, Schema } from "effect"
import { packageFolderPath } from "../../loginom-runtime/src/package-folder-path.mjs"

export const Folder = Schema.String.check(Schema.isMaxLength(1024), Schema.isPattern(packageFolderPath))
const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024))
const Bytes = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const Directory = Schema.Struct({ kind: Schema.Literal("folder"), name: Name, path: Folder })
export const Package = Schema.Struct({
  kind: Schema.Literal("package"),
  name: Name,
  path: Folder.check(Schema.isPattern(/\.lgp$/i)),
  modifiedAt: Schema.String,
  sizeBytes: Bytes,
})
export const FolderListing = Schema.Struct({
  folder: Folder,
  entries: Schema.Array(Schema.Union([Directory, Package])),
  slow: Schema.Boolean,
})
export type FolderListing = typeof FolderListing.Type

export const ReadFolder = Schema.Struct({
  folder: Folder,
  generation: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type ReadFolder = typeof ReadFolder.Type

const decodeListing = Schema.decodeUnknownOption(FolderListing, { onExcessProperty: "error" })
export function decodeFolderListing(value: unknown, folder: string): FolderListing {
  const result = decodeListing(value)
  if (
    Option.isNone(result) ||
    result.value.folder !== folder ||
    result.value.entries.some((entry) => entry.name.includes("/") || entry.path !== folder + "/" + entry.name)
  )
    throw Error("LOGINOM_REPLY_INVALID")
  return result.value
}
