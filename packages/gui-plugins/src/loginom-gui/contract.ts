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
