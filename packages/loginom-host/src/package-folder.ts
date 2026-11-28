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
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(1024))),
})
export type ReadFolder = typeof ReadFolder.Type

const decodeListings = Schema.decodeUnknownOption(Schema.Array(FolderListing), { onExcessProperty: "error" })
export function decodeFolderListings(value: unknown, { folder, query }: ReadFolder) {
  const result = decodeListings(value)
  if (Option.isNone(result) || result.value[0]?.folder !== folder || (query === undefined && result.value.length !== 1))
    throw Error("LOGINOM_REPLY_INVALID")
  const seen = new Set<string>()
  for (const page of result.value) {
    if (seen.has(page.folder) || (page.folder !== folder && !page.folder.startsWith(folder + "/")) ||
      page.entries.some((entry) => entry.name.includes("/") || entry.path !== page.folder + "/" + entry.name ||
        (query !== undefined && entry.kind !== "package"))) throw Error("LOGINOM_REPLY_INVALID")
    seen.add(page.folder)
  }
  return result.value
}
