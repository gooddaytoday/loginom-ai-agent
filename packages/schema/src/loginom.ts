export * as Loginom from "./loginom"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "./schema"

export const SecretEdit = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("preserve") }),
  Schema.Struct({ operation: Schema.Literal("replace"), value: Schema.NonEmptyString }),
])
export const PasswordEdit = Schema.Union([SecretEdit, Schema.Struct({ operation: Schema.Literal("empty") })])
export const Candidate = Schema.Struct({
  revision: NonNegativeInt,
  url: Schema.String,
  username: Schema.String,
  apiKey: SecretEdit,
  password: PasswordEdit,
})
export type Candidate = typeof Candidate.Type

export const State = Schema.Literals(["unconfigured", "ready", "pending", "starting", "recoverable-error"])
export const BrowserFailure = Schema.Literals([
  "LOGINOM_LOGIN_REJECTED",
  "LOGINOM_ACCOUNT_MISMATCH",
  "LOGINOM_LOGIN_UNAVAILABLE",
  "LOGINOM_BROWSER_START_FAILED",
])
export const BrowserStatus = Schema.Union([
  Schema.Struct({ state: Schema.Literals(["unknown", "verified"]) }),
  Schema.Struct({ state: Schema.Literal("failed"), failure: BrowserFailure }),
]).annotate({ identifier: "Loginom.BrowserStatus" })
export type BrowserStatus = typeof BrowserStatus.Type
export const View = Schema.Struct({
  revision: NonNegativeInt,
  generation: NonNegativeInt,
  url: Schema.String,
  username: Schema.String,
  folder: Schema.String,
  hasApiKey: Schema.Boolean,
  hasPassword: Schema.Boolean,
  state: State,
  browser: optional(BrowserStatus),
  failure: Schema.optionalKey(Schema.String),
  recoveries: Schema.optionalKey(Schema.Array(Schema.String)),
})
export type View = typeof View.Type
export const Validation = Schema.Struct({
  validationId: Schema.String,
  expiresAt: Schema.Number,
  browser: optional(BrowserStatus),
})
export const Save = Schema.Struct({ validationId: Schema.String, revision: NonNegativeInt })
export const Cancel = Schema.Struct({ revision: NonNegativeInt })
export const AcknowledgeRecovery = Schema.Struct({ revision: NonNegativeInt, ids: Schema.Array(Schema.String) })

export type API = {
  read(): Promise<View>
  status(): Promise<View>
  check(candidate: Candidate): Promise<typeof Validation.Type>
  save(input: typeof Save.Type): Promise<View>
  cancelPending(input: typeof Cancel.Type): Promise<View>
  acknowledgeRecovery(input: typeof AcknowledgeRecovery.Type): Promise<View>
}
