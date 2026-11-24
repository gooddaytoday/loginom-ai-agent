// `dashboard_draft` on a real server with a scripted model (B2.9e): the tool exists only in a dashboard's Location,
// outside the CodeMode catalog; it builds and serves the draft without a question; and the product plugin's unload stops
// its Location's draft server. The plugin unloads when its Location's plugins activate again — a plugin registered later
// activates every plugin after it again (`SdkPlugins.register`) — and when the server closes. The tool itself, with 0.4's
// two cases: `loginom-agent/test/dashboard-tools.test.ts`; the folder and the installation's resources, each case's own
// under a temporary data root: `loginom-agent/test/fixture/dashboard-folder.ts`. A user message carries its script as
// `SCRIPT<json>SCRIPT`, one entry per step, as in `loginom-dashboard-files.test.ts`.
import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Flag } from "@opencode/core/flag"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { define } from "@opencode/plugin/effect/plugin"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { dashboardFolder, link, served } from "../../loginom-agent/test/fixture/dashboard-folder"
import { createEmbeddedRoutes } from "../src/routes"
import { pluginsLoaded } from "./fixture/routes"

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// A draft builds the template's sources with its compiler and bundler as child processes, a few seconds each.
const timeout = 120_000

// `at` opens the Location in the dashboard's work folder or in an ordinary project of the same installation.
const boot = (at: "work" | "ordinary") =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-dashboard-draft-")).path
    const folder = yield* Effect.acquireRelease(
      Effect.promise(() => dashboardFolder()),
      (folder) => Effect.promise(() => folder[Symbol.asyncDispose]()),
    )
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const previous = process.env.LOGINOM_AI_AGENT_RESOURCES
        process.env.LOGINOM_AI_AGENT_RESOURCES = folder.resources
        return previous
      }),
      (previous) =>
        Effect.sync(() => {
          if (previous === undefined) delete process.env.LOGINOM_AI_AGENT_RESOURCES
          else process.env.LOGINOM_AI_AGENT_RESOURCES = previous
        }),
    )
    const global = path.join(dir, "global")
    const project = path.join(dir, "project")
    yield* Effect.promise(() =>
      Promise.all([fs.mkdir(path.join(global, "config"), { recursive: true }), fs.mkdir(project)]),
    )
    const directory = at === "work" ? folder.work : project
    const location = Location.Ref.make({ directory: AbsolutePath.make(directory) })
    const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    yield* llm.serve(respond)
    const model = SessionRunnerModel.resolved(
      LanguageModel.make({ id: "loginom-dashboard-draft-model", provider: "test", route: OpenAIChat.route }),
      {
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 8_192 },
      },
    )
    const context = yield* Layer.build(
      createEmbeddedRoutes(
        {
          app: { channel: "dev", version: "test" },
          database: { path: ":memory:" },
          config: { claude: false },
          models: { fetch: false, snapshot: false },
          fs: { filewatcher: false, fff: false },
        },
        [
          Global.node.replace(
            Global.layerWith({
              home: path.join(dir, "home"),
              config: path.join(global, "config"),
              data: path.join(global, "data"),
              cache: path.join(global, "cache"),
              state: path.join(global, "state"),
              tmp: path.join(global, "tmp"),
              bin: path.join(global, "bin"),
              log: path.join(global, "log"),
              repos: path.join(global, "repos"),
            }),
          ),
          llmClient.replace(Layer.succeed(LLMClient.Service, llm)),
          SessionRunnerModel.node.replace(
            Layer.succeed(SessionRunnerModel.Service, { resolve: () => Effect.succeed(model) }),
          ),
        ],
      ).pipe(Layer.provide(HttpServer.layerServices)),
    )
    const sessions = Context.get(context, Session.Service)
    const handler = Context.get(context, HttpRouter.HttpRouter)
      .asHttpEffect()
      .pipe(HttpEffect.toWebHandlerWith(context))
    const call = (route: string, body?: unknown) =>
      Effect.promise(async () => {
        const response = await handler(
          new Request(`http://opencode.local${route}`, {
            method: body === undefined ? "GET" : "POST",
            headers: { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        )
        const text = await response.text()
        return text ? JSON.parse(text) : undefined
      })
    const query = `location[directory]=${encodeURIComponent(directory)}`
    yield* pluginsLoaded(context, directory)
    // A session whose every question is answered once, as `run --auto` answers; `asked` lists the actions it was asked.
    const create = () =>
      Effect.gen(function* () {
        const session = yield* sessions.create({
          title: "draft",
          agent: Agent.ID.make("build"),
          model: model.ref,
          location,
        })
        const asked: string[] = []
        yield* call(`/api/session/${session.id}/permission?${query}`).pipe(
          Effect.map((body) => body.data as { id: string; action: string }[]),
          Effect.flatMap((items) =>
            Effect.forEach(items, (item) =>
              call(`/api/session/${session.id}/permission/${item.id}/reply?${query}`, { decision: "once" }).pipe(
                Effect.tap(() => Effect.sync(() => asked.push(item.action))),
              ),
            ),
          ),
          Effect.andThen(Effect.sleep("20 millis")),
          Effect.forever,
          Effect.forkScoped,
        )
        return { id: session.id, asked }
      })
    // Runs the steps with a final answer: what each call answered (its text, or the error), and the tools the run's
    // first request offered the model.
    const run = (sessionID: Session.ID, steps: readonly Step[]) =>
      Effect.gen(function* () {
        const before = (yield* llm.requests()).length
        yield* sessions.prompt({ sessionID, text: script(...steps, { text: "end" }) })
        yield* sessions.wait(sessionID)
        const parts = (yield* sessions.messages({ sessionID }))
          .toSorted((a, b) => a.id.localeCompare(b.id))
          .flatMap((message) =>
            message.type === "assistant" ? message.content.flatMap((part) => (part.type === "tool" ? [part] : [])) : [],
          )
          .slice(-steps.length)
        const requests = (yield* llm.requests())
          .slice(before)
          .filter((request) => request.headers?.["x-opencode-session-id"] === sessionID && request.tools.length > 0)
        return {
          outcomes: parts.map((part) =>
            part.state.status === "completed"
              ? part.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n")
              : part.state.status === "error"
                ? part.state.error.message
                : part.state.status,
          ),
          tools: requests.at(0)?.tools.map((tool) => tool.name) ?? [],
        }
      })
    // The Location's registered tools, read by a plugin of the case. Registering it activates the Location's plugins
    // after it again: the product plugin unloads and loads anew.
    const registry = Effect.gen(function* () {
      const captured: { list?: PluginContext["tool"]["list"] } = {}
      yield* Context.get(context, SdkPlugins.Service).register(
        define({
          id: "test.loginom-dashboard-draft",
          effect: (ctx) =>
            Effect.sync(() => {
              captured.list = ctx.tool.list
            }),
        }),
      )
      yield* pluginsLoaded(context, directory)
      if (!captured.list) throw new Error("the case's plugin did not activate")
      return yield* captured.list()
    })
    return { create, run, registry }
  })

type PluginContext = Parameters<Parameters<typeof define>[0]["effect"]>[0]

const draft = { tool: "dashboard_draft" } as const
const status = (url: string) => Effect.promise(() => served(url))
// What a draft that built and passed its page check reports below its link.
const built = ["Проверка типов и сборка: успешно.", "Самопроверка страницы: успешно"]

describe("loginom.product dashboard_draft (B2.9e)", () => {
  it.live(
    "a dashboard Location drafts without a question; its draft server stops when the plugin unloads, and the next draft serves again",
    () =>
      Effect.gen(function* () {
        const again = yield* Effect.gen(function* () {
          const test = yield* boot("work")
          const session = yield* test.create()
          const first = yield* test.run(session.id, [draft])
          expect(first.tools).toContain("dashboard_draft")
          expect(first.outcomes.map((outcome) => outcome.split("\n").slice(1))).toEqual([built])
          const url = link(first.outcomes[0]) ?? ""
          expect(url).toStartWith("http://localhost:")
          expect(yield* status(url)).toBe(200)
          // The product plugin unloads and loads anew; the tool is registered outside the CodeMode catalog.
          const tools = yield* test.registry
          expect(yield* status(url)).toBe("refused")
          expect(tools.find((tool) => tool.id === "dashboard_draft")?.options).toEqual({ codemode: false })
          const second = yield* test.run(session.id, [draft])
          expect(second.outcomes.map((outcome) => outcome.split("\n").slice(1))).toEqual([built])
          const next = link(second.outcomes[0]) ?? ""
          expect(next).toStartWith("http://localhost:")
          expect(yield* status(next)).toBe(200)
          expect(session.asked).toEqual([])
          return next
        }).pipe(Effect.scoped)
        // The server closed, and with it its Locations' plugins.
        expect(yield* status(again)).toBe("refused")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "control: an ordinary Location of the same installation registers no dashboard_draft, and a call by its name is refused",
    () =>
      Effect.gen(function* () {
        const test = yield* boot("ordinary")
        const ids = (yield* test.registry).map((tool) => tool.id)
        // The product's other tools are there: this is the product's registry.
        expect(ids).toContain("package_docs_run")
        expect(ids).not.toContain("dashboard_draft")
        const session = yield* test.create()
        const result = yield* test.run(session.id, [draft])
        expect(result.tools).not.toContain("dashboard_draft")
        // The product's hook refuses a tool the task may not use, registered or not (B2.2).
        expect(result.outcomes).toEqual(["LOGINOM_SCOPE_DENIED: tool dashboard_draft is not available in this task"])
        expect(session.asked).toEqual([])
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

function respond(request: LLMRequest) {
  const user = request.messages.findLastIndex((message) => message.role === "user" && text(message).includes("SCRIPT<"))
  if (user < 0 || request.tools.length === 0) return TestLLM.text("ok", "text_ok")
  const body = text(request.messages[user])
  const steps: Step[] = JSON.parse(body.slice(body.indexOf("SCRIPT<") + 7, body.lastIndexOf(">SCRIPT")))
  const step = steps[request.messages.slice(user + 1).filter((message) => message.role === "assistant").length]
  if (!step) return TestLLM.text("done", "text_done")
  if ("text" in step) return TestLLM.text(step.text, `text_${crypto.randomUUID()}`)
  return TestLLM.toolCall(`call_${crypto.randomUUID()}`, step.tool, step.input ?? {})
}

function text(message: LLMRequest["messages"][number]) {
  return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
}
