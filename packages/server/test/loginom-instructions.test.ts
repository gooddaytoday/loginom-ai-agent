import { expect } from "bun:test"
import path from "node:path"
import { Agent } from "@opencode/core/agent"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Location } from "@opencode/schema/location"
import { Provider } from "@opencode/schema/provider"
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
  "snapshots profile instructions for new sessions and sends them to Claude Code across request kinds",
  () =>
    Effect.gen(function* () {
      const profile = (yield* tmpdirScoped("loginom-instructions-profile-")).path
      const project = (yield* tmpdirScoped("loginom-instructions-project-")).path
      const projectText = "Project instructions: use test data."
      const profileText = "Profile instructions: answer in Russian."
      const provider = Provider.ID.claudeAgent
      yield* Effect.promise(() => Bun.write(path.join(project, "AGENTS.md"), projectText))
      const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
      yield* llm.always(TestLLM.text("Done", "reply"))
      const model = SessionRunnerModel.resolved(
        LanguageModel.make({ id: "test-model", provider, route: OpenAIChat.route }),
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
      const rpc = (directory: string, method: "read" | "save", input: { text?: string } = {}, status = 200) =>
        Effect.promise(async () => {
          const response = await server.fetch(
            `http://test.local/api/rpc/loginom.instructions/${method}?location[directory]=${encodeURIComponent(directory)}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) },
          )
          expect(response.status).toBe(status)
          return response.json()
        })
      const sessions = Context.get(server.context, Session.Service)
      const create = (title: string) =>
        sessions.create({
          title,
          agent: Agent.ID.make("build"),
          model: model.ref,
          location: Location.Ref.make({ directory: AbsolutePath.make(project) }),
        })
      const entries = (sessionID: string) =>
        Effect.promise(async () => {
          const response = await server.fetch(`http://test.local/api/experimental/session/${sessionID}/instructions/entries`)
          expect(response.status).toBe(200)
          return response.json()
        })
      const checkRequest = (sessionID: string, kind: string, expected?: string) =>
        Effect.gen(function* () {
          const requests = yield* llm.requests()
          const request = requests.findLast(
            (item) =>
              item.headers?.["x-opencode-session-id"] === sessionID &&
              item.headers?.["x-opencode-claude-agent-kind"] === kind,
          )
          expect(request?.model.provider).toBe(model.model.provider)
          const system = request?.system.map((part) => part.text).join("\n")
          const instructions = request?.providerOptions?.claudeCodeInstructions
          expect(typeof instructions).toBe("string")
          expect(system).toContain(projectText)
          expect(instructions).toContain(projectText)
          if (expected) {
            expect(system?.includes(expected), `${kind}: profile text in the model system prompt`).toBe(true)
            expect(
              typeof instructions === "string" && instructions.includes(expected),
              `${kind}: profile text in Claude Code instructions`,
            ).toBe(true)
          } else {
            expect(system).not.toContain(profileText)
            expect(instructions).not.toContain(profileText)
          }
        })
      expect(yield* rpc(profile, "read")).toEqual({ output: { text: "" } })
      const boundary = "я".repeat(8192)
      expect(yield* rpc(profile, "save", { text: boundary })).toEqual({ output: { text: boundary } })
      expect(yield* rpc(profile, "save", { text: boundary + "a" }, 400)).toMatchObject({
        type: "rpc.invalid_input",
        message: expect.stringContaining("16 KiB"),
      })
      expect(yield* rpc(project, "read")).toEqual({ output: { text: boundary } })

      expect(yield* rpc(profile, "save", { text: profileText })).toEqual({ output: { text: profileText } })
      expect(yield* rpc(project, "read")).toEqual({ output: { text: profileText } })
      const original = yield* create("Saved instructions")
      yield* sessions.prompt({ sessionID: original.id, text: "Test conversation" })
      yield* sessions.wait(original.id)
      yield* checkRequest(original.id, "primary", profileText)
      expect(yield* entries(original.id)).toEqual({ data: [{ key: "loginom-profile", value: profileText }] })

      const unprompted = yield* create("Generate before any prompt")
      yield* sessions.generate({ sessionID: unprompted.id, prompt: "First request" })
      yield* checkRequest(unprompted.id, "generate", profileText)

      yield* rpc(profile, "save", { text: "New defaults" })
      const newer = yield* create("New instructions")
      expect(yield* entries(newer.id)).toEqual({ data: [{ key: "loginom-profile", value: "New defaults" }] })
      const child = yield* sessions.create({ parentID: original.id })
      expect(yield* entries(child.id)).toEqual(yield* entries(original.id))
      const forked = yield* sessions.fork({ sessionID: original.id })
      expect(yield* entries(forked.id)).toEqual({ data: [{ key: "loginom-profile", value: profileText }] })

      yield* sessions.prompt({ sessionID: original.id, text: "Follow up" })
      yield* sessions.wait(original.id)
      yield* checkRequest(original.id, "primary", profileText)
      yield* sessions.generate({ sessionID: original.id, prompt: "Side question" })
      yield* checkRequest(original.id, "generate", profileText)
      yield* sessions.compact({ sessionID: original.id })
      yield* sessions.wait(original.id)
      yield* checkRequest(original.id, "compaction", profileText)

      for (const text of ["", " \n "]) {
        expect(yield* rpc(profile, "save", { text })).toEqual({ output: { text } })
        const session = yield* create("Empty instructions")
        expect(yield* entries(session.id)).toEqual({ data: [] })
        yield* sessions.generate({ sessionID: session.id, prompt: "Side question" })
        yield* checkRequest(session.id, "generate")
      }
    }).pipe(Effect.scoped),
  30_000,
)
