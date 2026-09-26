export * as Loginom from "./loginom"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"

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
export const View = Schema.Struct({
  revision: NonNegativeInt,
  generation: NonNegativeInt,
  url: Schema.String,
  username: Schema.String,
  folder: Schema.String,
  hasApiKey: Schema.Boolean,
  hasPassword: Schema.Boolean,
  state: State,
  failure: Schema.optionalKey(Schema.String),
  recoveries: Schema.optionalKey(Schema.Array(Schema.String)),
  sessionCompletion: Schema.optionalKey(Schema.Literals(["open", "pending", "completed"])),
  recoveryMode: Schema.optionalKey(Schema.Literals(["strict", "advisory"])),
})
export type View = typeof View.Type
export const Validation = Schema.Struct({ validationId: Schema.String, expiresAt: Schema.Number })
export const Save = Schema.Struct({ validationId: Schema.String, revision: NonNegativeInt })
export const Cancel = Schema.Struct({ revision: NonNegativeInt })
export const AcknowledgeRecovery = Schema.Struct({ revision: NonNegativeInt, ids: Schema.Array(Schema.String) })

// Private controller/desktop IPC only. These are never model tool parameters.
export const SessionCompletionTarget = Schema.Struct({ generation: NonNegativeInt, chat: Schema.NonEmptyString })
export const SessionCompletionBinding = Schema.Struct({
  attemptId: Schema.NonEmptyString,
  generation: NonNegativeInt,
  chat: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
  documentId: Schema.NonEmptyString,
  account: Schema.NonEmptyString,
  packagePath: Schema.NonEmptyString,
  saveOperationId: Schema.NonEmptyString,
  mutationRevision: NonNegativeInt,
})
export type SessionCompletionBinding = typeof SessionCompletionBinding.Type
export const FinishOwnSession = Schema.Struct({
  completionId: Schema.NonEmptyString,
  binding: SessionCompletionBinding,
})
export const SessionCompletionReceipt = Schema.Struct({
  version: Schema.Literal(1),
  completionId: Schema.NonEmptyString,
  binding: SessionCompletionBinding,
  status: Schema.Literals(["SUCCEEDED", "BLOCKED", "UNKNOWN"]),
  packageClosed: Schema.Boolean,
  loggedOut: Schema.Boolean,
  reason: Schema.NullOr(Schema.String),
})
export type SessionCompletionReceipt = typeof SessionCompletionReceipt.Type
export type SessionAPI = {
  sessionCompletionOptions(input: typeof SessionCompletionTarget.Type): Promise<SessionCompletionBinding>
  finishOwnSession(input: typeof FinishOwnSession.Type): Promise<SessionCompletionReceipt>
}

export type API = {
  read(): Promise<View>
  status(): Promise<View>
  check(candidate: Candidate): Promise<typeof Validation.Type>
  save(input: typeof Save.Type): Promise<View>
  cancelPending(input: typeof Cancel.Type): Promise<View>
  acknowledgeRecovery(input: typeof AcknowledgeRecovery.Type): Promise<View>
}
