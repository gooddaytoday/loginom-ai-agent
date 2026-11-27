import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

const Status = Schema.Struct({
  loginom: Schema.Literals(["ready", "failed", "unchecked"]),
  address: Schema.String,
  model: Schema.NullOr(Schema.String),
  help: Schema.Boolean,
  catalog: Schema.Boolean,
  policy: Schema.Literals(["absent", "present", "invalid"]),
  policyFile: Schema.String,
  network: Schema.NullOr(Schema.Literals(["online", "device"])),
})

export type DiagnosticsStatus = typeof Status.Type
export const DiagnosticsRpc = Rpc.define({
  id: "loginom.diagnostics",
  methods: {
    status: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ check: Schema.Boolean })),
      output: Schema.toStandardSchemaV1(Status),
    },
    report: {
      input: Schema.toStandardSchemaV1(Schema.Struct({})),
      output: Schema.toStandardSchemaV1(Schema.String),
    },
  },
  events: {},
})
