import { WindowChat, WindowPlacement, WindowStatus } from "@loginom-ai-agent/loginom-host/browser-window"
import { Schema } from "effect"
import { ServiceHost } from "./host"

const sessionID = { type: "string", minLength: 1, maxLength: 256 } as const

export const windowRpc = {
  id: "loginom.window",
  methods: {
    place: {
      input: {
        type: "object",
        properties: {
          sessionID,
          bounds: {
            type: "object",
            properties: {
              x: { type: "integer" },
              y: { type: "integer" },
              width: { type: "integer", minimum: 1 },
              height: { type: "integer", minimum: 1 },
            },
            required: ["x", "y", "width", "height"],
            additionalProperties: false,
          },
        },
        required: ["sessionID", "bounds"],
        additionalProperties: false,
      },
      output: { type: "boolean" },
    },
    show: {
      input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
      output: { type: "string", enum: ["focused", "focus-unconfirmed", "no-window"] },
    },
  },
  events: {},
} as const

export const windowHandlers = {
  async place(value: unknown) {
    const input = Schema.decodeUnknownSync(WindowPlacement)(value)
    return (await ServiceHost.windowRequest("window.place", input)) === true
  },
  async show(value: unknown) {
    const input = Schema.decodeUnknownSync(WindowChat)(value)
    const result = await ServiceHost.windowRequest("window.show", input)
    return Schema.is(WindowStatus)(result) ? result : "no-window"
  },
}
