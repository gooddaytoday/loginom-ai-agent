import { expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { Session } from "@opencode/core/session"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Context, Effect } from "effect"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServiceHost } from "../../loginom-agent/src/host"
import { scriptedHost } from "./fixture/loginom-dock-host"
import { serveRoutes } from "./fixture/routes"

it.live("serves package state only for a conversation in the requested Location", () =>
  Effect.gen(function* () {
    const project = (yield* tmpdirScoped("package-state-project-")).path
    const otherProject = (yield* tmpdirScoped("package-state-other-")).path
    const data = (yield* tmpdirScoped("package-state-host-")).path
    const snapshot = {
      open: true,
      path: "/user/result.lgp",
      modified: true,
      modifiedDetectedAt: 200,
      lastSave: { path: "/user/result.lgp", confirmedAt: 100 },
      staleForSeconds: 3,
    }
    const calls: unknown[] = []
    const host = scriptedHost()
    yield* Effect.acquireRelease(
      Effect.promise(() => ServiceHost.start({
        data,
        connect: async () => ({
          ...await host.connect(),
          request: async (method, input) => {
            calls.push({ method, input })
            return snapshot
          },
        }),
      })),
      () => Effect.promise(() => ServiceHost.close()),
    )
    const routes = yield* serveRoutes({
      app: { channel: "dev", version: "test" },
      database: { path: ":memory:" },
      config: { claude: false },
      models: { fetch: false, snapshot: false },
      fs: { filewatcher: false, fff: false },
    })
    yield* routes.pluginsLoaded(project)
    const sessions = Context.get(routes.context, Session.Service)
    const create = (directory: string) => sessions.create({
      agent: Agent.ID.make("build"),
      location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
    })
    const own = yield* create(project)
    const foreign = yield* create(otherProject)
    const call = (sessionID: string) => Effect.promise(async () => {
      const response = await routes.fetch(
        `http://opencode.local/api/rpc/loginom.package-state/snapshot?location[directory]=${encodeURIComponent(project)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: { sessionID } }),
        },
      )
      return { status: response.status, body: await response.json() }
    })
    expect(yield* call(own.id)).toEqual({ status: 200, body: { output: snapshot } })
    expect((yield* call(foreign.id)).body).toMatchObject({ type: "invalid_session" })
    expect((yield* call("ses_missing")).body).toMatchObject({ type: "invalid_session" })
    expect(calls).toEqual([{ method: "package.state", input: { sessionID: own.id } }])
  }),
)
