import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

const Status = Schema.Literals(["none", "timeout", "failed", "unreachable", "socks-only"])

const Setting = Schema.Struct({ enabled: Schema.Boolean, status: Status })

export type SystemProxySetting = typeof Setting.Type

export const loginomId = "loginom"

export const SystemProxy = Ipc.define({
  id: "loginom.system-proxy",
  state: Setting,
  methods: {
    get: { output: Setting },
    set: { input: Schema.Boolean },
  },
})
