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
  Schema.Union([Schema.Struct({ ok: Schema.Literal(true), value }), failure])
const statusResult = result(Status)
const hostStarting = Schema.Struct({ ok: Schema.Literal(true), state: Schema.Literal("starting") })
const hostUnavailable = Schema.Struct({ ok: Schema.Literal(false), issue: Schema.Literal("unavailable"), reason: Schema.String })
const safeInput = {
  "~standard": Schema.toStandardSchemaV1(Candidate, {
    leafHook: () => "Invalid Loginom connection fields",
    checkHook: () => "Invalid Loginom connection fields",
  })["~standard"],
}

export const ConnectionSettingsRpc = Rpc.define({
  id: "loginom.connection",
  methods: {
    status: {
      input: Schema.toStandardSchemaV1(Schema.Struct({})),
      output: Schema.toStandardSchemaV1(Schema.Union([hostUnavailable, statusResult, hostStarting])),
    },
    check: { input: safeInput, output: Schema.toStandardSchemaV1(result(Validation)) },
    save: { input: Schema.toStandardSchemaV1(Loginom.Save), output: Schema.toStandardSchemaV1(statusResult) },
  },
  events: { applied: applicationEvent, failed: applicationEvent },
})

export type StatusResult = typeof ConnectionSettingsRpc.methods.status.output.Type
export type CheckResult = typeof ConnectionSettingsRpc.methods.check.output.Type
