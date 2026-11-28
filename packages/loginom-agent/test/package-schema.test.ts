import { expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { WorkspaceID } from "@opencode/schema/workspace-id"
import { Global } from "@opencode/util/global"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { llmClient } from "../../core/src/effect/app-node-platform"
import { LocationServiceMap } from "../../core/src/location-service-map"
import { Plugin } from "../../core/src/plugin"
import { Rpc } from "../../core/src/rpc"
import { Session } from "../../core/src/session"
import { SessionRunnerModel } from "../../core/src/session/runner/model"
import { createEmbeddedRoutes } from "../../server/src/routes"
import { scriptedHost } from "../../server/test/fixture/loginom-dock-host"
import { pluginsLoaded } from "../../server/test/fixture/routes"
import { ServiceHost } from "../src/host"

const fixture = join(import.meta.dir, "../../../evals/tasks/filter-active-rows/reference.lgp")

test("package RPCs confine window, path and saved snapshots to the full Location", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-schema-rpc-"))
  try {
    const project = join(root, "project")
    const other = join(root, "other")
    await Promise.all([mkdir(project), mkdir(other), mkdir(join(root, "config"))])
    const path = join(project, "attached.lgp")
    await copyFile(fixture, path)
    const host = scriptedHost()
    const requests: unknown[] = []
    const state = { open: true, path: "/user/result.lgp", modified: false, modifiedDetectedAt: null, lastSave: null }
    let schemaReply: unknown
    const seen = {
      source: "window",
      observed_at: "2026-11-27T00:00:00.000Z",
      scope: "active_workflow",
      complete: false,
      limitations: ["active_workflow_only", "no_submodels", "no_node_settings"],
      generation: 2,
      package: { name: "Draft" },
      workflow: { document_id: "doc", workflow_id: "workflow", navigation_path: [], nodes: [], links: [] },
    }
    const run = Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.promise(() =>
          ServiceHost.start({
            data: root,
            connect: async () => ({
              ...(await host.connect()),
              request: async (method, input) => {
                if (method === "connection.settings.turn") return true
                requests.push({ method, input })

                if (method === "package.state") return state
                expect(method).toBe("package.schema")

                return schemaReply ?? seen
              },
            }),
          }),
        ),
        () => Effect.promise(() => ServiceHost.close()),
      )
      const llm = yield* TestLLM.Test.pipe(
        Effect.provide(
          TestLLM.testLayer({
            fallback: TestLLM.text("Fixture reply", "reply"),
          }),
        ),
      )
      const model = SessionRunnerModel.resolved(
        LanguageModel.make({ id: "schema-fixture", provider: "test", route: OpenAIChat.route }),
        {
          capabilities: { tools: false, input: ["text"], output: ["text"] },
          cost: [],
          limit: { context: 32_000, output: 2_000 },
        },
      )
      const context = yield* Layer.build(
        createEmbeddedRoutes(
          {
            app: { channel: "dev", version: "test" },
            database: { path: ":memory:" },
            config: { project: false, claude: false },
            models: { fetch: false, snapshot: false },
            fs: { filewatcher: false, fff: false },
          },
          [
            llmClient.replace(Layer.succeed(LLMClient.Service, llm)),
            SessionRunnerModel.node.replace(
              Layer.succeed(SessionRunnerModel.Service, { resolve: () => Effect.succeed(model) }),
            ),
            Global.node.replace(
              Global.layerWith({
                home: root,
                config: join(root, "config"),
                data: root,
                cache: join(root, "cache"),
                state: join(root, "state"),
                tmp: join(root, "tmp"),
                bin: join(root, "bin"),
                log: join(root, "log"),
                repos: join(root, "repos"),
              }),
            ),
          ],
        ).pipe(Layer.provide(HttpServer.layerServices)),
      )
      yield* pluginsLoaded(context, project)
      yield* pluginsLoaded(context, other)
      const sessions = Context.get(context, Session.Service)
      const session = yield* sessions.create({
        location: Location.Ref.make({ directory: AbsolutePath.make(project) }),
        model: model.ref,
      })
      const directory = AbsolutePath.make(project)
      const workspace = Location.Ref.make({ directory, workspaceID: WorkspaceID.create() })
      const otherWorkspace = Location.Ref.make({ directory, workspaceID: WorkspaceID.create() })
      const ownWorkspaceChat = yield* sessions.create({ location: workspace, model: model.ref })
      const otherWorkspaceChat = yield* sessions.create({ location: otherWorkspace, model: model.ref })
      yield* sessions.prompt({ sessionID: session.id, text: "Schema", files: [{ uri: pathToFileURL(path).href }] })
      yield* sessions.wait(session.id)
      expect((yield* llm.requests()).length).toBeGreaterThan(0)

      const handler = Context.get(context, HttpRouter.HttpRouter)
        .asHttpEffect()
        .pipe(HttpEffect.toWebHandlerWith(context))
      const call = (directory: string, rpc: string, input: { sessionID: string; source?: "window" | "saved" }) =>
        Effect.promise(async () => {
          const response = await handler(
            new Request(
              `http://opencode.local/api/rpc/${rpc}?location[directory]=${encodeURIComponent(directory)}`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ input }),
              },
            ),
          )
          return { status: response.status, body: await response.json() }
        })

      const schema = "loginom.package/schema"
      const packageState = "loginom.package-state/snapshot"
      const own = { sessionID: session.id }
      const foreign = { sessionID: otherWorkspaceChat.id }
      const empty = { status: 200, body: { output: { snapshot: null } } }
      expect(yield* call(other, schema, { ...own, source: "window" })).toEqual(empty)
      expect(yield* call(project, schema, foreign)).toEqual(empty)
      expect((yield* call(project, packageState, foreign)).body).toMatchObject({ type: "invalid_session" })
      expect(requests).toEqual([])

      const locations = Context.get(context, LocationServiceMap.Service)
      yield* Effect.gen(function* () {
        yield* Plugin.awaitActivation
        const rpc = yield* Rpc.Service
        const workspaceOwn = { sessionID: ownWorkspaceChat.id }

        for (const chat of [foreign, own]) {
          expect(yield* rpc.call("loginom.package", "schema", chat)).toEqual({ snapshot: null })
          expect(yield* rpc.call("loginom.package-state", "snapshot", chat).pipe(Effect.flip)).toMatchObject({
            type: "invalid_session",
          })
        }
        expect(yield* rpc.call("loginom.package", "schema", workspaceOwn)).toEqual({ snapshot: seen })
        expect(yield* rpc.call("loginom.package-state", "snapshot", workspaceOwn)).toEqual(state)
      }).pipe(Effect.provide(locations.get(workspace)))

      expect(yield* call(project, schema, own)).toEqual({ status: 200, body: { output: { snapshot: seen } } })
      expect(yield* call(project, packageState, own)).toEqual({ status: 200, body: { output: state } })
      expect(requests).toEqual([
        { method: "package.schema", input: { sessionID: ownWorkspaceChat.id } },
        { method: "package.state", input: { sessionID: ownWorkspaceChat.id } },
        { method: "package.schema", input: own },
        { method: "package.state", input: own },
      ])
      const count = requests.length
      expect(yield* call(project, schema, { ...own, source: "saved" })).toMatchObject({
        status: 200,
        body: {
          output: {
            snapshot: {
              source: "saved",
              scope: "package",
              complete: true,
              workflows: [
                {
                  nodes: expect.arrayContaining([
                    expect.objectContaining({ label: "Filter", position: { x: 480, y: 224 } }),
                    expect.objectContaining({
                      type: "TBGImportTextFile",
                    }),
                  ]),
                },
              ],
            },
          },
        },
      })
      const original = yield* Effect.promise(() => readFile(path))
      yield* Effect.promise(() => writeFile(path, Buffer.concat([original, Buffer.of(0)])))
      expect(yield* call(project, schema, { ...own, source: "saved" })).toEqual({ status: 200, body: { output: { snapshot: null } } })
      expect(requests).toHaveLength(count)
      schemaReply = { source: "save_required" }
      expect(yield* call(project, schema, own)).toEqual({
        status: 200, body: { output: { snapshot: null, reason: "saveRequired" } },
      })
    })
    await Effect.runPromise(run.pipe(Effect.scoped))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
