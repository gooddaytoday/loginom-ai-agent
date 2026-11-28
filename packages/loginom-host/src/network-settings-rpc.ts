import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

export const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }))
export const ProxySource = Schema.Literals([
  "environment",
  "windows",
  "macos",
  "gnome",
  "kde",
  "chromium",
  "none",
  "disabled",
  "unavailable",
])
const ProxyStatus = Schema.Struct({ source: ProxySource, hosts: Schema.Array(Schema.String) })
export type ProxyStatus = typeof ProxyStatus.Type

const Status = Schema.Struct({
  proxy: ProxyStatus,
  port: Schema.optionalKey(
    Schema.Struct({
      current: Port,
      saved: Port,
      editable: Schema.Boolean,
      maximum: Port,
      fallback: Schema.optionalKey(Port),
    }),
  ),
})
export type Status = typeof Status.Type

const SaveResult = Schema.Literals(["saved", "invalid", "occupied", "unavailable"])
export type SaveResult = typeof SaveResult.Type

const result = Schema.toStandardSchemaV1
export const Definition = Rpc.define({
  id: "loginom.network",
  methods: {
    status: { input: result(Schema.Struct({})), output: result(Status) },
    savePort: { input: result(Schema.Struct({ port: Port })), output: result(SaveResult) },
  },
  events: {},
})
