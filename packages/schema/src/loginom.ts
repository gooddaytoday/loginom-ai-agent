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
})
export type View = typeof View.Type
export const Validation = Schema.Struct({ validationId: Schema.String, expiresAt: Schema.Number })
export const Save = Schema.Struct({ validationId: Schema.String, revision: NonNegativeInt })
export const Cancel = Schema.Struct({ revision: NonNegativeInt })

export type API = {
  read(): Promise<View>
  status(): Promise<View>
  check(candidate: Candidate): Promise<typeof Validation.Type>
  save(input: typeof Save.Type): Promise<View>
  cancelPending(input: typeof Cancel.Type): Promise<View>
}
