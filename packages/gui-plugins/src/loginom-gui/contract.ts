import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

const Session = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
export const Status = Schema.Literals(["focused", "no-window", "starting", "taskbar", "manual", "layout-unavailable"])
export const LoginomWindow = Ipc.define({
  id: "loginom-gui.window",
  methods: {
    track: { input: Schema.Union([Session, Schema.Literal(false), Schema.Null]) },
    show: { input: Session, output: Status },
  },
})
