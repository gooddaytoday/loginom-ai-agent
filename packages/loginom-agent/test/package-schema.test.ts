import { expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { llmClient } from "../../core/src/effect/app-node-platform"
import { Session } from "../../core/src/session"
import { SessionRunnerModel } from "../../core/src/session/runner/model"
import { createEmbeddedRoutes } from "../../server/src/routes"
import { scriptedHost } from "../../server/test/fixture/loginom-dock-host"
import { pluginsLoaded } from "../../server/test/fixture/routes"
import { ServiceHost } from "../src/host"

const fixture = join(import.meta.dir, "../../../evals/tasks/filter-active-rows/reference.lgp")

test("loginom.package.schema reads the requested source and confines it to the conversation's location", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-schema-rpc-"))
  try {
    const project = join(root, "project")
    const other = join(root, "other")
    await Promise.all([mkdir(project), mkdir(other), mkdir(join(root, "config"))])
    const path = join(project, "attached.lgp")
    await copyFile(fixture, path)
    const host = scriptedHost()
    const requests: unknown[] = []
    const seen = {
      source: "window",
      observed_at: "2026-11-27T00:00:00.000Z",
      scope: "active_workflow",
      complete: false,
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
                expect(method).toBe("package.schema")
                requests.push(input)
                return seen
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
      yield* sessions.prompt({ sessionID: session.id, text: "Schema", files: [{ uri: pathToFileURL(path).href }] })
      yield* sessions.wait(session.id)
      expect((yield* llm.requests()).length).toBeGreaterThan(0)

      const handler = Context.get(context, HttpRouter.HttpRouter)
        .asHttpEffect()
        .pipe(HttpEffect.toWebHandlerWith(context))
      const call = (directory: string, source?: "window" | "saved") =>
        Effect.promise(async () => {
          const response = await handler(
            new Request(
              `http://opencode.local/api/rpc/loginom.package/schema?location[directory]=${encodeURIComponent(directory)}`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ input: { sessionID: session.id, source } }),
              },
            ),
          )
          return { status: response.status, body: await response.json() }
        })

      expect(yield* call(other, "window")).toEqual({ status: 200, body: { output: { snapshot: null } } })
      expect(requests).toEqual([])
      expect(yield* call(project)).toEqual({ status: 200, body: { output: { snapshot: seen } } })
      expect(requests).toEqual([{ sessionID: session.id }])
      expect(yield* call(project, "saved")).toMatchObject({
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
                  ]),
                },
              ],
            },
          },
        },
      })
      const original = yield* Effect.promise(() => readFile(path))
      yield* Effect.promise(() => writeFile(path, Buffer.concat([original, Buffer.of(0)])))
      expect(yield* call(project, "saved")).toEqual({ status: 200, body: { output: { snapshot: null } } })
      expect(requests).toEqual([{ sessionID: session.id }])
    })
    await Effect.runPromise(run.pipe(Effect.scoped))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
