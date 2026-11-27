import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import type { Plugin } from "@opencode/plugin"
import { Session } from "@opencode/schema/session"
import { Schema } from "effect"
import { LoginomMetadata } from "./loginom-metadata"

const Request = Schema.Struct({
  sessionID: Session.ID,
  messageID: Schema.NonEmptyString,
  toolCallID: Schema.NonEmptyString,
  port: Schema.Int,
})

export const nodeOutputRpc = {
  id: "loginom.node-output",
  methods: {
    sample: {
      input: {
        type: "object",
        required: ["sessionID", "messageID", "toolCallID", "port"],
        additionalProperties: false,
        properties: {
          sessionID: { type: "string" },
          messageID: { type: "string" },
          toolCallID: { type: "string" },
          port: { type: "integer", minimum: 0 },
        },
      },
      output: {
        anyOf: [
          {
            type: "object",
            required: ["kind", "rows"],
            additionalProperties: false,
            properties: {
              kind: { const: "available" },
              rows: { type: "array", maxItems: 100, items: { type: "array" } },
              limitation: { const: "preview_limit" },
            },
          },
          {
            type: "object",
            required: ["kind", "reason"],
            additionalProperties: false,
            properties: { kind: { const: "unavailable" }, reason: { const: "historical_only" } },
          },
        ],
      },
    },
  },
  events: {},
} as const

function isNodeOutputTool(name: string) {
  return /^loginom_dock_node_(apply|wait|status|read|resume|cancel|stop)$/.test(name)
}

export async function readNodeOutput(
  context: Plugin.Context["session"]["context"],
  value: unknown,
  read = LoginomHost.readNodeOutput,
) {
  const unavailable = { kind: "unavailable", reason: "historical_only" }
  if (!Schema.is(Request)(value)) return unavailable
  const messages = await context({ sessionID: value.sessionID }).catch(() => [])
  const message = messages.find((item) => item.type === "assistant" && item.id === value.messageID)
  if (message?.type !== "assistant") return unavailable
  const call = message.content.find((part) => part.type === "tool" && part.id === value.toolCallID)
  if (call?.type !== "tool" || !isNodeOutputTool(call.name) || call.state.status === "streaming" || call.state.status === "running")
    return unavailable
  const metadata = call.state.metadata
  const view = metadata?.loginom
  const generation = metadata?.generation
  if (
    typeof generation !== "number" ||
    !Schema.is(LoginomMetadata)(view) ||
    view.state !== "settled" ||
    view.status !== "SUCCEEDED" ||
    view.cleanupComplete !== true ||
    view.executionStatus !== "completed" ||
    !view.executionId
  )
    return unavailable
  const port = view.ports?.find((item) => item.index === value.port)
  if (!port) return unavailable
  const sample = await read(value.sessionID, {
    generation,
    operationId: view.operationId,
    executionId: view.executionId,
    portGuid: port.guid,
  }).catch(() => null)
  return sample ? { kind: "available", ...sample } : unavailable
}
