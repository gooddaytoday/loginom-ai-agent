import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

export const LoginomWindow = Ipc.define({
  id: "loginom-window",
  methods: {
    track: { input: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160))) },
  },
})
