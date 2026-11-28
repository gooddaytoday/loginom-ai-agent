import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

const ProxyStatus = Schema.Literals(["none", "timeout", "failed", "unreachable", "socks-only"])

const ProxySetting = Schema.Struct({ enabled: Schema.Boolean, status: ProxyStatus })

export type SystemProxySetting = typeof ProxySetting.Type

export const SystemProxy = Ipc.define({
  id: "loginom-gui.system-proxy",
  state: ProxySetting,
  methods: {
    get: { output: ProxySetting },
    set: { input: Schema.Boolean },
  },
})

export const DashboardTarget = Schema.Struct({
  id: Schema.String,
  directory: Schema.String,
  nodeName: Schema.String,
  action: Schema.Literals(["create", "edit"]),
  notice: Schema.optional(Schema.Struct({ kind: Schema.String })),
})

export const DashboardLink = Schema.Union([Schema.Struct({ id: Schema.String, code: Schema.String }), DashboardTarget])

export const DashboardPreview = Ipc.define({
  id: "loginom-gui.dashboard",
  methods: {
    open: {
      input: Schema.Struct({ url: Schema.String }),
      output: Schema.Struct({ id: Schema.String }),
    },
    close: {
      input: Schema.Struct({ id: Schema.String }),
      output: Schema.Void,
    },
  },
})
