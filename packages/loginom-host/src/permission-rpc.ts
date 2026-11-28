import { Permission } from "@opencode/schema/permission"

// «Разрешать в этом разговоре» (B2.6a): the answer to one open request that also allows its kind for the rest of the
// session. Used by the permission dock.
export const PermissionConversation = {
  id: "loginom.permission",
  methods: {
    conversation: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          requestID: { type: "string" },
          notice: { type: "string", maxLength: Permission.NoticeMaxLength },
          onceNotice: { type: "string", maxLength: Permission.NoticeMaxLength },
        },
        required: ["sessionID", "requestID"],
        additionalProperties: false,
      },
      // `saved: false` means the action was allowed once, but saving the conversation grant failed.
      output: { type: "object", properties: { kind: { type: "string" }, saved: { const: false } }, required: ["kind"] },
      // The terminal (В-31) and a request the product does not ask by default are answered one at a time.
      errors: {
        not_grantable: { type: "object", properties: { action: { type: "string" } }, required: ["action"] },
      },
    },
  },
  events: {},
} as const
