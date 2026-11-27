import { Option, Schema } from "effect"

const target = { sessionID: Schema.NonEmptyString }
const saved = Schema.Struct({ path: Schema.NonEmptyString, name: Schema.NonEmptyString })
const replaced = Schema.Struct({ path: Schema.NonEmptyString, backupPath: Schema.NonEmptyString })
const restored = Schema.Struct({ path: Schema.NonEmptyString })
const empty = Schema.Struct({})
const json = (schema: Schema.Constraint) =>
  Schema.toJsonSchemaDocument(schema, { referencePolicy: () => undefined }).schema

export const packageCopy = {
  id: "loginom.package-copy",
  methods: {
    "save-version": { input: json(Schema.Struct(target)), output: json(saved) },
    "undo-save": { input: json(Schema.Struct({ ...target, path: saved.fields.path })), output: json(empty) },
    "replace-original": {
      input: json(Schema.Struct({ ...target, confirmed: Schema.Literal(true) })),
      output: json(replaced),
    },
    "restore-previous": {
      input: json(Schema.Struct({ ...target, backupPath: replaced.fields.backupPath })),
      output: json(restored),
    },
    discard: { input: json(Schema.Struct(target)), output: json(empty) },
  },
  events: {},
}

export const decodeSaved = Schema.decodeUnknownSync(saved)
export const decodeReplaced = Schema.decodeUnknownSync(replaced)
export const decodeRestored = Schema.decodeUnknownSync(restored)
export const decodeEmpty = Schema.decodeUnknownSync(empty, { onExcessProperty: "error" })

const error = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.String,
    data: Schema.optionalKey(Schema.Struct({ code: Schema.String })),
  }),
)

export function rpcFailure(value: unknown) {
  const failure = Option.getOrUndefined(error(value))
  switch (failure?.data?.code ?? failure?.type) {
    case "PACKAGE_BUSY":
      return "busy"
    case "PATH_EXISTS":
      return "exists"
    case "FORBIDDEN":
      return "forbidden"
    case "COPY_NOT_FOUND":
      return "noCopy"
    default:
      return "unconfirmed"
  }
}
