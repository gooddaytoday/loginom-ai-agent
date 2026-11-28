import { BrowserPID, PlacementStatus, WindowChat, WindowPlacement, WindowStatus } from "@loginom-ai-agent/loginom-host/browser-window"
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
      output: { type: "string", enum: PlacementStatus.literals },
    },
    show: {
      input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
      output: { type: "string", enum: WindowStatus.literals },
    },
  },
  events: {},
} as const

export const windowHandlers = {
  async place(value: unknown) {
    const input = Schema.decodeUnknownSync(WindowPlacement)(value)
    const result = await ServiceHost.windowRequest("window.place", input)
    return Schema.is(PlacementStatus)(result) ? result : "no-window"
  },
  async show(value: unknown) {
    const input = Schema.decodeUnknownSync(WindowChat)(value)
    const result = await ServiceHost.windowRequest("window.show", input)
    if (process.platform === "win32" && Schema.is(BrowserPID)(result)) {
      const owned = await import("./foreground-windows").then(({ foregroundChromium }) => foregroundChromium(result.pid)).catch(() => false)
      return owned ? "focused" : "taskbar"
    }
    if (process.platform === "win32" && result === "manual") return "taskbar"
    return Schema.is(WindowStatus)(result) ? result : "no-window"
  },
}
