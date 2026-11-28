import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { Agent } from "@opencode/core/agent"
import { Config } from "@opencode/core/config"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Context, Effect, Layer, Schema } from "effect"
import { LanguageModel, LLMClient } from "../../../ai/src/effect"
import { OpenAIChat } from "../../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../../ai/src/testing"
import { ServiceHost } from "../../../loginom-agent/src/host"
import { productSkills } from "../../../loginom-host/src/bundled-skills"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { reservedSkillNames } from "../../../product/src/skills"
import { scriptedHost } from "./loginom-dock-host"
import { gateGraph } from "./loginom-gate-graph"
import { gateRuntime } from "./loginom-gate-runtime"
import { gateScenarios, modelCalls, salesFile } from "./loginom-gate-scenarios"
import { serveRoutes } from "./routes"

const toolFailure = Schema.decodeUnknownSync(
  Schema.Struct({
    error: Schema.Struct({ message: Schema.String }),
  }),
)

const [scenario, root, appOrigin, modelRef] = Bun.argv.slice(2)
assert(scenario === "7" || scenario === "8" || scenario === "9" || scenario === "10")
assert(root && appOrigin && modelRef === "test/gate")
const browserOrigin = new URL(appOrigin).origin
assert.equal(browserOrigin, appOrigin)
assert.equal(new URL(browserOrigin).hostname, "127.0.0.1")

const modelName = scenario === "9" ? "Модель организации" : "Gate model"
const title = `Шлюз C · ${scenario}`
const turns = gateScenarios[scenario]
const graph = scenario === "10" ? gateGraph() : undefined
const resources = path.join(root, "resources")
const runtime = gateRuntime(resources, graph)
const expectedCalls = turns.flatMap((turn) => turn.calls)
const activeRead = Promise.withResolvers<void>()
let waitingRead = false
let received = 0
const host = scriptedHost({
  catalog: runtime.catalog,
  admit: runtime.admit,
  call: async (request) => {
    const expected = expectedCalls[received]
    try {
      assert(expected, `Unexpected Loginom call: ${request.name}`)
      assert.equal(request.name, expected.name)
      assert.deepEqual(request.args, expected.input)
      received++
      if (expected.hold) {
        waitingRead = true
        await activeRead.promise
        waitingRead = false
      }
      assert(typeof request.name === "string" && request.args && typeof request.args === "object")
      return await runtime.call(request.name, request.args as Record<string, unknown>)
    } catch (error) {
      console.error("Unexpected scripted Loginom request", error)
      throw error
    }
  },
})

const model = SessionRunnerModel.resolved(
  LanguageModel.make({ id: "gate", provider: "test", route: OpenAIChat.route }),
  {
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    cost: [],
    limit: { context: 200_000, output: 8_192 },
  },
)

const config = {
  model: modelRef,
  providers: {
    test: {
      name: modelName,
      package: "@opencode/ai/providers/openai-compatible",
      settings: { apiKey: "fixture", baseURL: "http://127.0.0.1:1" },
      models: { gate: { name: modelName } },
    },
    ...(scenario === "9"
      ? {
          public: {
            name: "Модель из интернета",
            package: "@opencode/ai/providers/openai-compatible",
            settings: { apiKey: "fixture", baseURL: "http://127.0.0.1:1" },
            models: { external: { name: "Модель из интернета" } },
          },
        }
      : {}),
  },
}
const system = path.join(root, "policy")
const configOptions = { project: false, claude: false, content: JSON.stringify(config), system }
const directory = path.join(root, "workspace")
await Promise.all([directory, system].map((dir) => fs.mkdir(dir, { recursive: true })))
if (scenario === "9") {
  await Bun.write(
    path.join(system, "loginom-ai-agent.json"),
    JSON.stringify({
      policies: [
        { action: "integration.use", resource: "*", effect: "deny" },
        { action: "integration.use", resource: "test", effect: "allow" },
      ],
    }),
  )
}
const automationSkill = "loginom-automation"
await fs.cp(
  new URL(`../../../product/skills/${automationSkill}/`, import.meta.url),
  path.join(resources, "skills", automationSkill),
  { recursive: true },
)
for (const skill of reservedSkillNames.filter((name) => name !== automationSkill)) {
  await Bun.write(
    path.join(resources, "skills", skill, "SKILL.md"),
    `---\nname: ${skill}\ndescription: Bundled ${skill}.\n---\n\nFixture for ${skill}.\n`,
  )
}
await Bun.write(
  path.join(resources, "resource-manifest.json"),
  JSON.stringify({ protocol: 1, files: await resourceInventory(resources) }),
)
await productSkills(resources)
process.env.LOGINOM_AI_AGENT_RESOURCES = resources

await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.promise(() => ServiceHost.start({ data: path.join(root, "data"), connect: host.connect })),
        () => Effect.promise(() => ServiceHost.close()),
      )
      const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
      yield* llm.serve((request) => {
        assert.equal(request.model.provider + "/" + request.model.id, modelRef)
        const user = request.messages.findLastIndex((message) => message.role === "user")
        const prompt = request.messages[user]?.content
          .flatMap((item) => (item.type === "text" ? [item.text] : []))
          .join("\n")
        const turn = turns.find((item) => prompt?.includes(item.prompt))
        if (!turn && request.tools.length === 0) return TestLLM.text(title, "title")
        assert(turn, `Unexpected model input for scenario ${scenario}: ${prompt}`)
        const answer = request.messages.slice(user + 1)
        const uploadedPath = /Attached file: `([^`]+)`/.exec(prompt ?? "")?.[1]
        if (turn.admitUpload) {
          assert(uploadedPath && path.basename(uploadedPath) === salesFile)
          const relative = path.relative(path.join(root, "tmp", "uploads"), uploadedPath)
          assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative))
        }
        const calls = modelCalls(turn, uploadedPath)
        const step = calls[answer.filter((message) => message.role === "assistant").length]
        if (step) {
          assert(
            request.tools.some((tool) => tool.name === step.tool),
            `Model did not receive tool ${step.tool}`,
          )
          return TestLLM.toolCall(crypto.randomUUID(), step.tool, step.input)
        }
        const results = answer.flatMap((message) =>
          message.role === "tool" ? message.content.filter((part) => part.name.startsWith("loginom_dock_")) : [],
        )
        if (turn.automaticReadRetry) {
          // The model never sends a second read. The browser test checks how many times the real app reached the Host.
          assert.equal(results.length, 1)
          assert.equal(results[0]?.result.type, "error")
          return TestLLM.text(turn.reply, crypto.randomUUID())
        }
        const repeatStop = turn.repeatStop ?? false
        assert.equal(results.length, turn.calls.length + Number(repeatStop))
        for (const [index, call] of turn.calls.entries()) {
          const name = `loginom_${call.name}`
          const part = results[index]
          assert(part?.name === name, `Missing result for ${name}`)
          const result = part.result
          const failed = call.expected.status === "FAILED" || call.expected.status === "AMBIGUOUS"
          assert.equal(result.type, failed ? "error" : "text", JSON.stringify(result))
          const receipt = result.type === "error" ? toolFailure(result.value).error.message : result.value
          assert(typeof receipt === "string", JSON.stringify(result))
          assert.partialDeepStrictEqual(JSON.parse(receipt.split("\n\n")[0]), call.expected)
        }
        if (repeatStop) {
          const stopped = results.at(-1)?.result
          assert(stopped?.type === "error")
          assert(JSON.stringify(stopped.value).includes("Пользователь остановил повторный вызов."))
        }
        return TestLLM.text(turn.reply, crypto.randomUUID())
      })

      const routes = yield* serveRoutes(
        {
          app: { channel: "dev", version: "test" },
          database: { path: ":memory:" },
          models: { fetch: false, snapshot: false },
          fs: { filewatcher: false, fff: false },
          pluginPackages: false,
          fetch: () => Promise.reject(new Error("Outbound HTTP disabled in gate fixture")),
        },
        [
          Config.node.replace(Config.configured(configOptions)),
          Global.node.replace(
            Global.layerWith({
              home: path.join(root, "home"),
              config: path.join(root, "config"),
              data: path.join(root, "data"),
              cache: path.join(root, "cache"),
              state: path.join(root, "state"),
              tmp: path.join(root, "tmp"),
              bin: path.join(root, "bin"),
              log: path.join(root, "log"),
              repos: path.join(root, "repos"),
            }),
          ),
          llmClient.replace(Layer.succeed(LLMClient.Service, llm)),
          SessionRunnerModel.node.replace(
            Layer.succeed(SessionRunnerModel.Service, {
              resolve: (session) => {
                assert.equal(session.model?.providerID + "/" + session.model?.id, modelRef)
                return Effect.succeed(model)
              },
            }),
          ),
        ],
      )
      yield* routes.pluginsLoaded(directory)
      const sessions = Context.get(routes.context, Session.Service)
      const session = yield* sessions.create({
        title,
        agent: Agent.ID.make("build"),
        model: model.ref,
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      yield* sessions.setPermissions({
        sessionID: session.id,
        permissions: [{ action: "*", resource: "*", effect: "allow" }],
      })

      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        idleTimeout: 0,
        async fetch(request) {
          const url = new URL(request.url)
          if (url.pathname === "/__gate" && request.method === "GET")
            return Response.json({
              waitingRead,
              calls: host.requests("call").map((call) => call.name),
              graph: graph?.snapshot(),
            })
          if (url.pathname === "/__gate/release" && request.method === "POST") {
            activeRead.resolve()
            return new Response(null, { status: 204 })
          }
          const headers = {
            "access-control-allow-origin": browserOrigin,
            "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
            "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? "content-type",
            "access-control-expose-headers": "x-opencode-request-id",
          }
          if (request.headers.has("origin") && request.headers.get("origin") !== browserOrigin)
            return new Response(null, { status: 403 })
          if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
          const result = await routes.handler(request)
          const response = new Response(result.body, result)
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
          return response
        },
      })
      yield* Effect.addFinalizer(() => Effect.promise(() => server.stop(true)))
      process.stdout.write(
        `GATE_READY ${JSON.stringify({ origin: server.url.origin, session: session.id, title, modelName })}\n`,
      )
      yield* Effect.never
    }),
  ),
)
