import { expect } from "bun:test"
import path from "node:path"
import { Agent } from "@opencode/core/agent"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Context, Effect, Layer } from "effect"
import { LanguageModel, LLMClient } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { serveRoutes } from "./fixture/routes"

it.live(
  "applies saved profile instructions alongside project instructions, omitting empty profile text",
  () =>
    Effect.gen(function* () {
      const profile = (yield* tmpdirScoped("loginom-instructions-profile-")).path
      const project = (yield* tmpdirScoped("loginom-instructions-project-")).path
      const projectText = "Project instructions: use test data."
      const profileText = "Profile instructions: answer in Russian."
      yield* Effect.promise(() => Bun.write(path.join(project, "AGENTS.md"), projectText))
      const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    yield* llm.always(TestLLM.text("Done", "reply"))
      const model = SessionRunnerModel.resolved(
        LanguageModel.make({ id: "test-model", provider: "test", route: OpenAIChat.route }),
        {
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          cost: [],
          limit: { context: 100_000, output: 1_024 },
        },
      )
      const server = yield* serveRoutes(
        {
          app: { channel: "dev", version: "test" },
          database: { path: path.join(profile, "test.db") },
          config: { claude: false },
          models: { fetch: false, snapshot: false },
          fs: { filewatcher: false, fff: false },
        },
        [
          Global.node.replace(
            Global.layerWith({
              home: profile,
              config: path.join(profile, "config"),
              data: path.join(profile, "data"),
              state: path.join(profile, "state"),
              cache: path.join(profile, "cache"),
              log: path.join(profile, "log"),
              tmp: path.join(profile, "tmp"),
              bin: path.join(profile, "bin"),
              repos: path.join(profile, "repos"),
            }),
          ),
          llmClient.replace(Layer.succeed(LLMClient.Service, llm)),
          SessionRunnerModel.node.replace(
            Layer.succeed(SessionRunnerModel.Service, { resolve: () => Effect.succeed(model) }),
          ),
        ],
      )
      yield* server.pluginsLoaded(profile)
      yield* server.pluginsLoaded(project)
      const rpc = (directory: string, method: "read" | "save", input: { text?: string } = {}) =>
        Effect.promise(async () => {
          const response = await server.fetch(
            `http://test.local/api/rpc/loginom.instructions/${method}?location[directory]=${encodeURIComponent(directory)}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) },
          )
          expect(response.status).toBe(200)
          return response.json()
        })
      const sessions = Context.get(server.context, Session.Service)
      const context = (title: string) =>
        Effect.gen(function* () {
          const session = yield* sessions.create({
            title,
            agent: Agent.ID.make("build"),
            model: model.ref,
            location: Location.Ref.make({ directory: AbsolutePath.make(project) }),
          })
          const start = (yield* llm.requests()).length
          yield* sessions.prompt({ sessionID: session.id, text: "Test conversation" })
          yield* sessions.wait(session.id)
          const request = (yield* llm.requests()).slice(start).find((request) => request.tools.length > 0)
      expect(request?.model.provider).toBe(model.model.provider)
          return request?.system.map((part) => part.text).join("\n")
        })
      expect(yield* rpc(profile, "read")).toEqual({ output: { text: "" } })
      expect(yield* rpc(profile, "save", { text: profileText })).toEqual({ output: { text: profileText } })
      expect(yield* rpc(project, "read")).toEqual({ output: { text: profileText } })
      const withProfile = yield* context("Saved instructions")
      expect(withProfile).toContain(profileText)
      expect(withProfile).toContain(projectText)

      for (const text of ["", " \n "]) {
        expect(yield* rpc(profile, "save", { text })).toEqual({ output: { text } })
        const withoutProfile = yield* context("Empty instructions")
        expect(withoutProfile).not.toContain("User instructions for this Loginom profile")
        expect(withoutProfile).toContain(projectText)
      }
    }).pipe(Effect.scoped),
  30_000,
)
