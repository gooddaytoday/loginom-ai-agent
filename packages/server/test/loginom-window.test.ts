import { expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { Session } from "@opencode/core/session"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { WorkspaceID } from "@opencode/schema/workspace-id"
import { Context, Effect } from "effect"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServiceHost } from "../../loginom-agent/src/host"
import { scriptedHost } from "./fixture/loginom-dock-host"
import { serveRoutes } from "./fixture/routes"

it.live("shows and places only conversations in the requested Location", () =>
  Effect.gen(function* () {
    const directory = AbsolutePath.make((yield* tmpdirScoped("window-project-")).path)
    const foreignDirectory = AbsolutePath.make((yield* tmpdirScoped("window-other-")).path)
    const data = (yield* tmpdirScoped("window-host-")).path
    const location = Location.Ref.make({ directory })
    const workspace = Location.Ref.make({ directory, workspaceID: WorkspaceID.make("wrk_window") })
    const otherWorkspace = Location.Ref.make({ directory, workspaceID: WorkspaceID.make("wrk_other") })
    const foreign = Location.Ref.make({ directory: foreignDirectory })
    const bounds = { x: 1280, y: -100, width: 720, height: 900 }
    const calls: unknown[] = []
    const host = scriptedHost()
    yield* Effect.acquireRelease(
      Effect.promise(() =>
        ServiceHost.start({
          data,
          connect: async () => ({
            ...(await host.connect()),
            async request(method, input) {
              calls.push({ method, input })
              return method === "window.place" ? "moved" : "starting"
            },
          }),
        }),
      ),
      () => Effect.promise(() => ServiceHost.close()),
    )
    const routes = yield* serveRoutes({
      app: { channel: "dev", version: "test" },
      database: { path: ":memory:" },
      config: { claude: false },
      models: { fetch: false, snapshot: false },
      fs: { filewatcher: false, fff: false },
    })
    yield* routes.pluginsLoaded(directory)
    const sessions = Context.get(routes.context, Session.Service)
    const create = (location: Location.Ref) => sessions.create({ agent: Agent.ID.make("build"), location })
    const own = yield* create(location)
    const scoped = yield* create(workspace)
    const outside = yield* create(foreign)
    const call = (method: "show" | "place", sessionID: string, target?: Location.Ref) =>
      Effect.promise(async () => {
        const url = new URL(`/api/rpc/loginom.window/${method}`, "http://opencode.local")
        url.searchParams.set("location[directory]", directory)
        const response = await routes.fetch(url.toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: { sessionID, location: target, ...(method === "place" ? { bounds } : {}) } }),
        })
        return { status: response.status, body: await response.json() }
      })

    for (const method of ["place", "show"] as const) {
      expect((yield* call(method, own.id)).body).toMatchObject({ type: "rpc.invalid_input" })
      expect((yield* call(method, "ses_missing", location)).body).toMatchObject({ type: "invalid_session" })
      expect((yield* call(method, outside.id, location)).body).toMatchObject({ type: "invalid_session" })
      expect((yield* call(method, outside.id, foreign)).body).toMatchObject({ type: "invalid_session" })
      expect((yield* call(method, scoped.id, location)).body).toMatchObject({ type: "invalid_session" })
      expect((yield* call(method, scoped.id, otherWorkspace)).body).toMatchObject({ type: "invalid_session" })
    }
    expect(calls).toEqual([])
    expect(yield* call("place", own.id, location)).toEqual({ status: 200, body: { output: "moved" } })
    expect(yield* call("show", scoped.id, workspace)).toEqual({ status: 200, body: { output: "starting" } })
    expect(yield* call("place", scoped.id, workspace)).toEqual({ status: 200, body: { output: "moved" } })
    expect(calls).toEqual([
      { method: "window.place", input: { sessionID: own.id, bounds } },
      { method: "window.show", input: { sessionID: scoped.id } },
      { method: "window.place", input: { sessionID: scoped.id, bounds } },
    ])
    yield* Effect.promise(() => ServiceHost.close())
    expect(yield* call("show", own.id, location)).toEqual({ status: 200, body: { output: "no-window" } })
  }),
)
