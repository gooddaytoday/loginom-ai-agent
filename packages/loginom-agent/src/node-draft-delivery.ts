import { Effect, Option, Schema } from "effect"

const readComments = Schema.decodeUnknownOption(Schema.Struct({ comments: Schema.Array(Schema.Unknown) }))
const readNote = Schema.decodeUnknownOption(
  Schema.Struct({ type: Schema.Literal("note"), origin: Schema.Literal("loginom-gui"), data: Schema.Unknown }),
)
const readContext = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      source: Schema.Struct({ sessionID: Schema.NonEmptyString }),
      node: Schema.Struct({ path: Schema.NonEmptyString }),
    }),
  ),
)
const readBinding = Schema.decodeUnknownOption(
  Schema.Struct({ open: Schema.Literal(true), path: Schema.NonEmptyString, staleForSeconds: Schema.Null }),
)

const packageChanged = "loginom.package-changed"

export const checkNodeDraftDelivery = (sessionID: string, metadata: unknown, snapshot: () => Effect.Effect<unknown>) =>
  Effect.gen(function* () {
    const comments = Option.getOrUndefined(readComments(metadata))?.comments
    if (!comments) return
    const paths = new Set<string>()
    for (const comment of comments) {
      const note = Option.getOrUndefined(readNote(comment))
      if (note?.data === undefined) continue
      const context = Option.getOrUndefined(readContext(note.data))
      if (context?.source.sessionID !== sessionID) return packageChanged
      paths.add(context.node.path)
    }
    if (!paths.size) return
    const binding = Option.getOrUndefined(readBinding(yield* snapshot()))
    if (!binding || paths.size !== 1 || !paths.has(binding.path)) return packageChanged
  })
