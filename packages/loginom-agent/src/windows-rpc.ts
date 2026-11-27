import { WindowList } from "@loginom-ai-agent/loginom-host/windows"
import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

const empty = { type: "object", additionalProperties: false } as const

// A profile-wide snapshot of headed conversation runtimes. Use sessionID with
// the existing window actions and read a fresh snapshot on every invalidation.
export const windowsRpc = Rpc.define({
  id: "loginom.windows",
  methods: {
    list: { input: empty, output: Schema.toStandardSchemaV1(WindowList) },
  },
  events: {
    // Invalidate the snapshot in every Location without broadcasting paths.
    changed: { schema: empty },
  },
})
