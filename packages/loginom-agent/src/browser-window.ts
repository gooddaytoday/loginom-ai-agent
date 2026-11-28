import {
  BrowserPID,
  PlacementStatus,
  WindowBounds,
  WindowStatus,
} from "@loginom-ai-agent/loginom-host/browser-window"
import { Location, Rpc, type Plugin } from "@opencode/plugin/effect"
import { SessionID } from "@opencode/schema/session-id"
import { Effect, Schema } from "effect"
import { ServiceHost } from "./host"

const Target = Schema.Struct({ sessionID: SessionID.check(Schema.isMaxLength(256)), location: Location.Ref })
const Placement = Schema.Struct({ ...Target.fields, bounds: WindowBounds })
const errors = { invalid_session: Schema.Struct({}) }

const windowRpc = Rpc.define({
  id: "loginom.window",
  methods: {
    place: { input: Placement, output: PlacementStatus, errors },
    show: { input: Target, output: WindowStatus, errors },
  },
  events: {},
})

async function showWindow(sessionID: string): Promise<typeof WindowStatus.Type> {
  const result = await ServiceHost.windowRequest("window.show", { sessionID })
  if (process.platform === "win32" && Schema.is(BrowserPID)(result)) {
    const owned = await import("./foreground-windows")
      .then(({ foregroundChromium }) => foregroundChromium(result.pid))
      .catch(() => false)
    return owned ? "focused" : "taskbar"
  }
  if (process.platform === "win32" && result === "manual") return "taskbar"
  return Schema.is(WindowStatus)(result) ? result : "no-window"
}

export function registerWindowRpc(ctx: Pick<Plugin.Context, "location" | "session" | "rpc">) {
  const owns = Effect.fnUntraced(function* ({ sessionID, location }: typeof Target.Type) {
    if (ctx.location.directory !== location.directory) return false
    if (ctx.location.workspaceID !== undefined && ctx.location.workspaceID !== location.workspaceID) return false
    const session = yield* ctx.session.get({ sessionID }).pipe(Effect.orElseSucceed(() => undefined))
    return (
      Schema.is(Location.Ref)(session?.location) &&
      session.location.directory === location.directory &&
      session.location.workspaceID === location.workspaceID
    )
  })

  return ctx.rpc.register(windowRpc, {
    place: (input, call) =>
      Effect.gen(function* () {
        if (!(yield* owns(input)))
          return yield* Effect.fail(
            call.error("invalid_session", "The conversation is unavailable in this location", {}),
          )
        const result = yield* Effect.promise(() =>
          ServiceHost.windowRequest("window.place", { sessionID: input.sessionID, bounds: input.bounds }),
        )
        return Schema.is(PlacementStatus)(result) ? result : "no-window"
      }),
    show: (input, call) =>
      Effect.gen(function* () {
        if (!(yield* owns(input)))
          return yield* Effect.fail(
            call.error("invalid_session", "The conversation is unavailable in this location", {}),
          )
        return yield* Effect.promise(() => showWindow(input.sessionID))
      }),
  })
}
