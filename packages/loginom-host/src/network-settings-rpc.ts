import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

export const Mode = Schema.Literals(["online", "device"])
export type Mode = typeof Mode.Type
export const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }))

const Status = Schema.Struct({
  mode: Mode,
  activeMode: Mode,
  port: Schema.optionalKey(Schema.Struct({ current: Port, saved: Port, editable: Schema.Boolean })),
})
export type Status = typeof Status.Type

const result = Schema.toStandardSchemaV1
export const Definition = Rpc.define({
  id: "loginom.network",
  methods: {
    status: { input: result(Schema.Struct({})), output: result(Status) },
    setMode: { input: result(Schema.Struct({ mode: Mode })), output: result(Status) },
    savePort: {
      input: result(Schema.Struct({ port: Port })),
      output: result(Schema.Literals(["saved", "occupied", "unavailable"])),
    },
  },
  events: {},
})
