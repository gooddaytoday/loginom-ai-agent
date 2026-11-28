import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

const Session = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))

export const Focus = Schema.Literals(["focused", "no-window", "starting", "taskbar", "manual"])

export const WindowFeedback = Schema.Struct({
  focus: Focus,
  layout: Schema.optional(Schema.Literals(["layout-unavailable", "split-incomplete"])),
})

export const LoginomWindow = Ipc.define({
  id: "loginom-gui.window",
  methods: {
    track: { input: Schema.Union([Session, Schema.Literal(false), Schema.Null]) },
    show: { input: Session, output: WindowFeedback },
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
