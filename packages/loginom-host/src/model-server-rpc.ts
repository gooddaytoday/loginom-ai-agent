import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"
import { isModelServerID } from "./model-server-id"

export const ModelID = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(256),
  Schema.makeFilter(
    (id) =>
      !!id.trim() &&
      !/[\x00-\x1f\x7f#]|\{(?:env|file):/u.test(id) &&
      !Object.hasOwn(Object.prototype, id) &&
      id !== "prototype",
  ),
)
const Models = Schema.Array(ModelID).check(Schema.isMinLength(1), Schema.isMaxLength(4096))
const fields = {
  address: Schema.String.check(Schema.isMaxLength(2048)),
  key: Schema.optional(Schema.String.check(Schema.isMaxLength(4096))),
}
const input = <S extends Schema.ConstraintDecoder<unknown>>(schema: S) =>
  Schema.toStandardSchemaV1(schema, {
    leafHook: () => "Invalid model server fields",
    checkHook: () => "Invalid model server fields",
  })

export const Issue = Schema.Literals([
  "modelServerAddressInvalid",
  "modelServerDiscoveryFailed",
  "modelServerNoModels",
  "modelServerSaveFailed",
  "modelServerDenied",
  "modelServerAddressBlocked",
  "modelServerRemoveFailed",
  "modelServerRemoveProfileFailed",
])
const failure = Schema.Struct({ ok: Schema.Literal(false), issue: Issue })
const output = <S extends Schema.ConstraintDecoder<unknown>>(value: S) =>
  Schema.toStandardSchemaV1(Schema.Union([Schema.Struct({ ok: Schema.Literal(true), value }), failure]))

export const ModelServerRpc = Rpc.define({
  id: "loginom.model-server",
  methods: {
    catalogAvailable: { input: input(Schema.Struct({})), output: output(Schema.Boolean) },
    discover: { input: input(Schema.Struct(fields)), output: output(Models) },
    save: {
      input: input(Schema.Struct({ ...fields, models: Models })),
      output: output(Schema.Struct({ providerID: Schema.String })),
    },
    remove: {
      input: input(Schema.Struct({ providerID: Schema.String.check(Schema.makeFilter(isModelServerID)) })),
      output: output(Schema.Boolean),
    },
  },
  events: { catalogAvailabilityChanged: { schema: input(Schema.Struct({ available: Schema.Boolean })) } },
})
