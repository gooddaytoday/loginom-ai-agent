import { Rpc } from "@opencode/schema/rpc"
import { Schema, Struct } from "effect"
import { Loginom } from "./loginom"

export const Status = Loginom.View.mapFields((fields) => ({
  ...Struct.pick(fields, ["revision", "generation", "url", "username", "folder", "hasPassword", "state", "application"]),
  failed: Schema.Boolean,
}))
export const Address = Schema.String.check(
  Schema.makeFilter((value) => {
    if (!URL.canParse(value)) return "Invalid Loginom address"
    const url = new URL(value)
    return (
      (["http:", "https:"].includes(url.protocol) && url.href === settingsAddress(value)) || "Invalid Loginom address"
    )
  }),
)
export function settingsAddress(value: string) {
  const url = new URL(value)
  url.username = ""
  url.password = ""
  url.search = ""
  url.hash = ""
  return url.href
}

const Candidate = Loginom.Candidate.mapFields((fields) => Struct.omit(fields, ["apiKey"]))
const Validation = Loginom.Validation.mapFields((fields) => Struct.pick(fields, ["validationId", "expiresAt"]))
const applicationEvent = { schema: Schema.toStandardSchemaV1(Loginom.ConnectionApplication) }
export type Status = typeof Status.Type
export type Candidate = typeof Candidate.Type
export type Validation = typeof Validation.Type

export const Issue = Schema.Literals([
  "unavailable",
  "invalidAddress",
  "invalidUsername",
  "passwordRequired",
  "knowledgeAuthFailed",
  "credentialsRejected",
  "loginUnavailable",
  "logoutUnconfirmed",
  "checkFailed",
  "changed",
  "expired",
  "saveFailed",
])
export type Issue = typeof Issue.Type

const failure = Schema.Struct({ ok: Schema.Literal(false), issue: Issue })
const result = <S extends Schema.ConstraintDecoder<unknown>>(value: S) =>
  Schema.toStandardSchemaV1(Schema.Union([Schema.Struct({ ok: Schema.Literal(true), value }), failure]))
const safeInput = {
  "~standard": Schema.toStandardSchemaV1(Candidate, {
    leafHook: () => "Invalid Loginom connection fields",
    checkHook: () => "Invalid Loginom connection fields",
  })["~standard"],
}

export const ConnectionSettingsRpc = Rpc.define({
  id: "loginom.connection",
  methods: {
    status: { input: Schema.toStandardSchemaV1(Schema.Struct({})), output: result(Status) },
    check: { input: safeInput, output: result(Validation) },
    save: { input: Schema.toStandardSchemaV1(Loginom.Save), output: result(Status) },
  },
  events: { applied: applicationEvent, failed: applicationEvent },
})

export type StatusResult = typeof ConnectionSettingsRpc.methods.status.output.Type
export type CheckResult = typeof ConnectionSettingsRpc.methods.check.output.Type

const instructions = Schema.toStandardSchemaV1(Schema.Struct({ text: Schema.String }))
export const instructionsMaxBytes = 16 * 1024
export const instructionsBytes = (text: string) => new TextEncoder().encode(text).byteLength
const saveInstructions = Schema.toStandardSchemaV1(
  Schema.Struct({
    text: Schema.String.check(
      Schema.makeFilter(
        (text) => instructionsBytes(text) <= instructionsMaxBytes || "Instructions must not exceed 16 KiB (UTF-8)",
      ),
    ),
  }),
)

export const InstructionsDefinition = Rpc.define({
  id: "loginom.instructions",
  methods: {
    read: { input: Schema.toStandardSchemaV1(Schema.Struct({})), output: instructions },
    save: { input: saveInstructions, output: instructions },
  },
  events: {},
})
