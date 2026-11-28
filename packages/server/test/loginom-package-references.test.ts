import { expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Plugin } from "@opencode/core/plugin"
import { Rpc } from "@opencode/core/rpc"
import { Session } from "@opencode/core/session"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { WorkspaceID } from "@opencode/schema/workspace-id"
import { Context, Effect } from "effect"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServiceHost } from "../../loginom-agent/src/host"
import { Definition } from "../../loginom-agent/src/package-references-contract"
import { referenceChecksExcluded } from "../../loginom-host/src/package-references-contract"
import { scriptedHost } from "./fixture/loginom-dock-host"
import { serveRoutes } from "./fixture/routes"

it.live("only reads package references for a conversation in the caller's Location", () =>
  Effect.gen(function* () {
    const directory = AbsolutePath.make((yield* tmpdirScoped()).path)
    const foreignDirectory = AbsolutePath.make((yield* tmpdirScoped()).path)
    const data = (yield* tmpdirScoped()).path
    const calls: { method: string; input: unknown }[] = []
    const result = {
      status: "scanned",
      complete: true,
      timedOut: false,
      packages: [{ path: "/common/Consumer.lgp", name: "Consumer", references: [] }],
      packagesScanned: 1,
      foldersWithoutAccess: 0,
      notChecked: referenceChecksExcluded,
    }
    const host = scriptedHost()
    yield* Effect.acquireRelease(
      Effect.promise(() =>
        ServiceHost.start({
          data,
          connect: async () => ({
            ...(await host.connect()),
            request: async (method, input) => {
              calls.push({ method, input })
              if (method === "connection.status") return { url: "http://127.0.0.1/app/", generation: 17, state: "ready" }
              if (method === "packages.references") return result
              throw Error(`Unexpected Host request: ${method}`)
            },
          }),
        }),
      ),
      () => Effect.promise(() => ServiceHost.close()),
    )
    const { context } = yield* serveRoutes({
      app: { channel: "dev", version: "test" },
      database: { path: ":memory:" },
      config: { claude: false },
      models: { fetch: false, snapshot: false },
      fs: { filewatcher: false, fff: false },
    })
    const sessions = Context.get(context, Session.Service)
    const locations = Context.get(context, LocationServiceMap.Service)
    const workspace = Location.Ref.make({ directory, workspaceID: WorkspaceID.create() })
    const create = (location: Location.Ref) => sessions.create({ agent: Agent.ID.make("build"), location })
    const own = yield* create(workspace)
    const local = yield* create({ directory })
    const foreign = yield* create({ ...workspace, directory: foreignDirectory })
    const otherWorkspace = yield* create({ directory, workspaceID: WorkspaceID.create() })

    yield* Effect.gen(function* () {
      yield* Plugin.awaitActivation
      const rpc = yield* Rpc.Service
      const read = (sessionID: string) => rpc.call(Definition.id, "references", { sessionID })
      expect(yield* read(own.id)).toEqual(result)
      for (const session of [local, foreign, otherWorkspace]) {
        expect(yield* read(session.id)).toMatchObject({ status: "not_checked", reason: "no_copy", packages: [] })
      }
    }).pipe(Effect.provide(locations.get(workspace)))

    expect(calls).toEqual([
      { method: "connection.status", input: {} },
      { method: "packages.references", input: { sessionID: own.id, generation: 17, requestId: expect.any(String) } },
    ])
    expect(Definition.id).toBe("loginom.package-references")
  }),
)
