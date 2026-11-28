import { Contract, Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"
import type { NodeContext } from "./node-context"

/** Node actions supply the originating conversation and a node from a verified package snapshot. */
export const LoginomNodeDraft = Contract.define<{ attach(context: NodeContext): void }, "loginom-gui.node-draft">(
  "loginom-gui.node-draft",
)

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
