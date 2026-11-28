import { Option, Schema } from "effect"
import { packageFolderPath, packageStoragePath } from "../../loginom-runtime/src/package-folder-path.mjs"

export const StoragePath = Schema.String.check(Schema.isMaxLength(1024), Schema.isPattern(packageStoragePath))
export const Folder = StoragePath.check(Schema.isPattern(packageFolderPath))
const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024))
const Bytes = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const StoragePackagePath = StoragePath.check(Schema.isPattern(/\.lgp$/i))
const directory = { kind: Schema.Literal("folder"), name: Name }
const pkg = {
  kind: Schema.Literal("package"),
  name: Name,
  modifiedAt: Schema.String,
  sizeBytes: Bytes,
}
export const Package = Schema.Struct({ ...pkg, path: Folder.check(Schema.isPattern(/\.lgp$/i)) })
export const FolderListing = Schema.Struct({
  folder: Folder,
  entries: Schema.Array(Schema.Union([Schema.Struct({ ...directory, path: Folder }), Package])),
  slow: Schema.Boolean,
})
export type FolderListing = typeof FolderListing.Type
const StorageListing = Schema.Struct({
  folder: StoragePath,
  entries: Schema.Array(Schema.Union([
    Schema.Struct({ ...directory, path: StoragePath }),
    Schema.Struct({ ...pkg, path: StoragePackagePath }),
  ])),
  slow: Schema.Boolean,
})

export const ReadFolder = Schema.Struct({
  folder: Folder,
  generation: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type ReadFolder = typeof ReadFolder.Type

export function decodeFolderListing(value: unknown, folder: string, scan = false): FolderListing {
  const result = Schema.decodeUnknownOption(scan ? StorageListing : FolderListing, { onExcessProperty: "error" })(value)
  if (
    Option.isNone(result) ||
    result.value.folder !== folder ||
    result.value.entries.some((entry) => entry.name.includes("/") || entry.path !== folder + "/" + entry.name)
  )
    throw Error("LOGINOM_REPLY_INVALID")
  return result.value
}
