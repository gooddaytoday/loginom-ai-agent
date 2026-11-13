export * as Loginom from "./loginom"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "./schema"

export const SecretEdit = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("preserve") }),
  Schema.Struct({ operation: Schema.Literal("empty") }),
  Schema.Struct({ operation: Schema.Literal("replace"), value: Schema.NonEmptyString }),
])
export const PasswordEdit = SecretEdit
export const Mode = Schema.Literals(["cloud", "custom"])
export type Mode = typeof Mode.Type
export const HelpState = Schema.Literals(["connection-required", "starting", "ready", "recoverable-error"])
export type HelpState = typeof HelpState.Type
export const CloudStatus = Schema.Struct({
  connected: Schema.Boolean,
  email: Schema.optionalKey(Schema.String),
  pending: Schema.optionalKey(
    Schema.Struct({ userCode: Schema.String, verificationUrl: Schema.String, expiresAt: Schema.Number }),
  ),
  failure: Schema.optionalKey(Schema.String),
})
export type CloudStatus = typeof CloudStatus.Type
export const Candidate = Schema.Struct({
  mode: Schema.optionalKey(Mode),
  endpoint: Schema.optionalKey(Schema.String),
  revision: NonNegativeInt,
  url: Schema.String,
  username: Schema.String,
  apiKey: Schema.optionalKey(SecretEdit),
  password: PasswordEdit,
})
export type Candidate = typeof Candidate.Type

export const Check = Schema.Struct({ ...Candidate.fields, verifyBrowser: Schema.optionalKey(Schema.Boolean) })
export type Check = typeof Check.Type

export const State = Schema.Literals([
  "unconfigured",
  "connection-required",
  "ready",
  "pending",
  "starting",
  "recoverable-error",
])
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
  mode: Mode,
  endpoint: Schema.optionalKey(Schema.String),
  hasApiKey: Schema.Boolean,
  server: Schema.Literals(["primary", "reserve", "custom"]),
  help: Schema.Struct({ state: HelpState }),
  cloud: CloudStatus,
  revision: NonNegativeInt,
  generation: NonNegativeInt,
  url: Schema.String,
  username: Schema.String,
  folder: Schema.String,
  hasPassword: Schema.Boolean,
  state: State,
  browser: optional(BrowserStatus),
  failure: Schema.optionalKey(Schema.String),
  recoveries: Schema.optionalKey(Schema.Array(Schema.String)),
})
export type View = typeof View.Type
export const Validation = Schema.Struct({
  help: Schema.Struct({ state: HelpState }),
  validationId: Schema.String,
  expiresAt: Schema.Number,
  browser: optional(BrowserStatus),
})
export const Save = Schema.Struct({ validationId: Schema.String, revision: NonNegativeInt })
export const Cancel = Schema.Struct({ revision: NonNegativeInt })
export const AcknowledgeRecovery = Schema.Struct({ revision: NonNegativeInt, ids: Schema.Array(Schema.String) })

export type API = {
  cloudStart(): Promise<View>
  cloudCancel(): Promise<View>
  cloudDisconnect(): Promise<View>
  read(): Promise<View>
  status(): Promise<View>
  check(candidate: Check): Promise<typeof Validation.Type>
  save(input: typeof Save.Type): Promise<View>
  cancelPending(input: typeof Cancel.Type): Promise<View>
  acknowledgeRecovery(input: typeof AcknowledgeRecovery.Type): Promise<View>
}
