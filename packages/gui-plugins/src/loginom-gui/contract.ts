import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

export const reportName = "loginom-agent-diagnostics.json"

export const ReportSave = Ipc.define({
  id: "loginom-gui.diagnostics.save",
  methods: {
    write: {
      input: Schema.Struct({ title: Schema.String, content: Schema.String }),
      output: Schema.NullOr(Schema.String),
    },
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
