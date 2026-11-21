export * as SessionV1 from "./session-v1"

import { Schema } from "effect"
import { statics } from "@opencode/schema/schema"
import { ascending } from "@opencode/schema/identifier"

// Only MessageID of the fork's `@opencode-ai/schema/v1/session` (a080f7725c) is used by this package; carried verbatim.
export const MessageID = Schema.String.check(Schema.isStartingWith("msg")).pipe(
  Schema.brand("MessageID"),
  statics((schema) => ({ ascending: (id?: string) => schema.make(id ?? "msg_" + ascending()) })),
)
export type MessageID = typeof MessageID.Type
