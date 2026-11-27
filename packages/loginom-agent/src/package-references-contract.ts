import { ReferenceResult } from "@loginom-ai-agent/loginom-host/package-references-contract"
import { Rpc } from "@opencode/schema/rpc"
import { SessionID } from "@opencode/schema/session-id"
import { Schema } from "effect"

export const Definition = Rpc.define({
  id: "loginom.package",
  methods: {
    references: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: SessionID })),
      output: Schema.toStandardSchemaV1(ReferenceResult),
      errors: {},
    },
  },
  events: {},
})
