import { Folder, FolderListing, Package } from "@loginom-ai-agent/loginom-host/package-folder"
import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

const errors = {
  session_limit: Schema.toStandardSchemaV1(Schema.Undefined),
  not_connected: Schema.toStandardSchemaV1(Schema.Undefined),
  recovering: Schema.toStandardSchemaV1(Schema.Undefined),
  connecting: Schema.toStandardSchemaV1(Schema.Undefined),
  connection_failed: Schema.toStandardSchemaV1(Schema.Undefined),
  cancelled: Schema.toStandardSchemaV1(Schema.Undefined),
  unavailable: Schema.toStandardSchemaV1(Schema.Undefined),
}

export const Search = Schema.Struct({
  folder: Folder,
  text: Schema.String.check(Schema.isMaxLength(1024)),
  recursive: Schema.Boolean,
  cursor: Schema.optional(Schema.String.check(Schema.isUUID())),
})
export type Search = typeof Search.Type

export const Definition = Rpc.define({
  id: "loginom.packages",
  methods: {
    list: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ folder: Folder })),
      output: Schema.toStandardSchemaV1(FolderListing),
      errors,
    },
    search: {
      input: Schema.toStandardSchemaV1(Search),
      // A page corresponds to one folder, even when it contains zero matches.
      output: Schema.toStandardSchemaV1(
        Schema.Struct({
          folder: Folder,
          entries: Schema.Array(Package),
          slow: Schema.Boolean,
          // Every page marks an incomplete traversal and names unreadable folders it attempted.
          truncated: Schema.optional(Schema.Literal(true)),
          skippedFolders: Schema.optional(Schema.Array(Folder)),
          cursor: Schema.optional(Schema.String),
        }),
      ),
      errors: { ...errors, search_expired: Schema.toStandardSchemaV1(Schema.Undefined) },
    },
  },
  events: {},
})
