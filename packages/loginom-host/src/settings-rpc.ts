import { Rpc } from "@opencode/schema/rpc"
import { Schema, Struct } from "effect"
import { Loginom } from "./loginom"

export const Status = Loginom.View.mapFields((fields) => ({
  ...Struct.pick(fields, ["revision", "generation", "url", "username", "folder", "hasPassword", "state"]),
  failed: Schema.Boolean,
  deviceOnly: Schema.Boolean,
}))
export const Address = Schema.String.check(
  Schema.makeFilter((value) => {
    if (!URL.canParse(value)) return "Invalid Loginom address"
    const url = new URL(value)
    return (
      (["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) ||
      "Invalid Loginom address"
    )
  }),
)
const Candidate = Loginom.Candidate.mapFields((fields) => Struct.omit(fields, ["apiKey"]))
const Validation = Loginom.Validation.mapFields((fields) => Struct.pick(fields, ["validationId", "expiresAt"]))
export type Status = typeof Status.Type
export type Candidate = typeof Candidate.Type
export type Validation = typeof Validation.Type

export const Issue = Schema.Literals([
  "unavailable",
  "invalidAddress",
  "deviceAddress",
  "invalidUsername",
  "passwordRequired",
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

export const Definition = Rpc.define({
  id: "loginom.connection",
  methods: {
    status: { input: Schema.toStandardSchemaV1(Schema.Struct({})), output: result(Status) },
    check: { input: safeInput, output: result(Validation) },
    save: { input: Schema.toStandardSchemaV1(Loginom.Save), output: result(Status) },
  },
  events: {},
})

export type StatusResult = typeof Definition.methods.status.output.Type
export type CheckResult = typeof Definition.methods.check.output.Type

const instructions = Schema.toStandardSchemaV1(Schema.Struct({ text: Schema.String }))

export const InstructionsDefinition = Rpc.define({
  id: "loginom.instructions",
  methods: {
    read: { input: Schema.toStandardSchemaV1(Schema.Struct({})), output: instructions },
    save: { input: instructions, output: instructions },
  },
  events: {},
})
