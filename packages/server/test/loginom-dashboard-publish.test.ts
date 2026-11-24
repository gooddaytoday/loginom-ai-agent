// `dashboard_publish` on a real server with a scripted model and a scripted Host (B2.9f): 0.4's publication cases that ran
// the session's tools — «publishing with a global allow still asks once for the bound node and package» (×3 replies) and
// «a publication confirmation cannot send the old draft after recreation» of
// `v0.4.0:packages/opencode/test/tool/dashboard.test.ts` — and the owner's rule for its question (В-102): it comes by the
// kind «Сохранять пакеты в Loginom» (B2.6a). «Спрашивать» asks, «Разрешено» and «в этом разговоре» do not, «Запрещено»
// refuses without ending the turn (B2.6b), and the administrator's deny wins over all of them (B2.6c). 0.4 asked even
// under a global allow (`dashboard-session.test.ts` «dashboard publication requires confirmation after user rules are
// merged»); by В-102 «Разрешено» publishes without a question. The cases of the tool itself:
// `loginom-agent/test/dashboard-tools.test.ts`. The folder and the installation's resources are each case's own, under a
// temporary data root (`loginom-agent/test/fixture/dashboard-folder.ts`); the Host is the server process's
// (`ServiceHost`), scripted (`fixture/loginom-dock-host.ts`), and a local stand confirms a written publication. A user
// message carries its script as `SCRIPT<json>SCRIPT`, one entry per step.
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { Config } from "@opencode/core/config"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Flag } from "@opencode/core/flag"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Context, Effect, Fiber, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { readDashboardBinding, removeDashboard } from "../../dashboard/src/agent/folder"
import { Dashboard } from "../../loginom-agent/src/dashboard"
import { ServiceHost } from "../../loginom-agent/src/host"
import { declinedText, deniedText, policyDeniedText, table } from "../../loginom-agent/src/permissions"
import { dashboardFolder } from "../../loginom-agent/test/fixture/dashboard-folder"
import { createEmbeddedRoutes } from "../src/routes"
import { publicationName, publications, scriptedHost } from "./fixture/loginom-dock-host"
import { pluginsLoaded } from "./fixture/routes"

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// A publication builds the template's sources with its compiler and bundler as child processes, a few seconds each.
const timeout = 120_000
const publish = { tool: "dashboard_publish" } as const
// «Сохранять пакеты в Loginom» as the settings write it: every entry of the kind (B2.6b2).
const save = (effect: "allow" | "deny") =>
  table
    .filter((entry) => entry.kind === "save")
    .map((entry) => ({ action: entry.action, resource: entry.resource, effect }))
const published = /^published: Dashboard опубликован\./

// `config` is the product config as the settings write it; `policies` are the administrator's managed policy in the
// product's system config directory (B2.6c), here a directory of the case.
const boot = (input: { config?: Record<string, unknown>; policies?: readonly Record<string, unknown>[] } = {}) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-dashboard-publish-")).path
    const host = scriptedHost({ dashboard: publications() })
    // The stand where `finishPublish` looks the written publication up until it is ready.
    const lookups: unknown[] = []
    const stand = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          async fetch(request) {
            const url = new URL(request.url)
            const content = host.requests("dashboardPublish").at(-1)?.content
            if (request.method !== "POST" || url.pathname !== "/dashboard/lookup" || typeof content !== "string")
              return new Response(null, { status: 404 })
            lookups.push(await request.json())
            const version = { name: publicationName, sourceHash: createHash("sha256").update(content).digest("hex") }
            const publication = { ...version, status: "ready", buildHash: "a".repeat(64) }
            return Response.json({
              key: "fixture",
              exists: true,
              hash: publication.buildHash,
              appOrigin: url.origin,
              mode: "normal",
              cliButton: false,
              currentVersion: version,
              latest: publication,
              publication,
            })
          },
        }),
      ),
      (server) => Effect.promise(() => server.stop(true)),
    )
    const folder = yield* Effect.acquireRelease(
      Effect.promise(() => dashboardFolder(stand.url.origin)),
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
    // As the server process: the Host starts before the routes and closes after them.
    yield* Effect.acquireRelease(
      Effect.promise(() => ServiceHost.start({ data: path.join(dir, "data"), connect: host.connect })),
      () => Effect.promise(() => ServiceHost.close()),
    )
    const global = path.join(dir, "global")
    const system = path.join(global, "system")
    yield* Effect.promise(async () => {
      await fs.mkdir(path.join(global, "config"), { recursive: true })
      if (input.policies)
        await Bun.write(path.join(system, "loginom-ai-agent.json"), JSON.stringify({ policies: input.policies }))
    })
    const location = Location.Ref.make({ directory: AbsolutePath.make(folder.work) })
    const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    yield* llm.serve(respond)
    const model = SessionRunnerModel.resolved(
      LanguageModel.make({ id: "loginom-dashboard-publish-model", provider: "test", route: OpenAIChat.route }),
      {
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 8_192 },
      },
    )
    // The settings are not the work folder's: the model writes only in its `src`.
    const config = { project: false, claude: false, content: JSON.stringify(input.config ?? {}) }
    const context = yield* Layer.build(
      createEmbeddedRoutes(
        {
          app: { channel: "dev", version: "test" },
          database: { path: ":memory:" },
          config,
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
          ...(input.policies ? [Config.node.replace(Config.configured({ ...config, system }))] : []),
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
        return { status: response.status, body: text ? JSON.parse(text) : undefined }
      })
    const query = `location[directory]=${encodeURIComponent(folder.work)}`
    yield* pluginsLoaded(context, folder.work)
    const create = () =>
      sessions
        .create({ title: "publish", agent: Agent.ID.make("build"), model: model.ref, location })
        .pipe(Effect.map((session) => session.id))
    type Request = { id: string; action: string; resources: string[]; metadata?: Record<string, unknown> }
    const open = (sessionID: string) =>
      call(`/api/session/${sessionID}/permission?${query}`).pipe(
        Effect.map((response) => response.body.data as Request[]),
      )
    const reply = (sessionID: string, requestID: string, decision: "once" | "reject") =>
      call(`/api/session/${sessionID}/permission/${requestID}/reply?${query}`, { decision }).pipe(
        Effect.map((response) => response.status),
      )
    const conversation = (sessionID: string, requestID: string) =>
      call(`/api/rpc/loginom.permission/conversation?${query}`, { input: { sessionID, requestID } })
    const ask = (sessionID: string, request: { action: string; resources: string[] }) =>
      call(`/api/session/${sessionID}/permission?${query}`, request).pipe(
        Effect.map((response) => (response.body.data as { effect: string }).effect),
      )
    // Answers every question of the session once, as `run --auto` does, and lists the actions it was asked.
    const answer = (sessionID: string) =>
      Effect.gen(function* () {
        const asked: string[] = []
        yield* open(sessionID).pipe(
          Effect.flatMap((items) =>
            Effect.forEach(items, (item) =>
              reply(sessionID, item.id, "once").pipe(Effect.tap(() => Effect.sync(() => asked.push(item.action)))),
            ),
          ),
          Effect.andThen(Effect.sleep("20 millis")),
          Effect.forever,
          Effect.forkScoped,
        )
        return asked
      })
    // Runs the steps with a final answer, in the background.
    const run = (sessionID: Session.ID, ...steps: Step[]) =>
      sessions
        .prompt({ sessionID, text: script(...steps, { text: "end" }) })
        .pipe(Effect.andThen(sessions.wait(sessionID)), Effect.forkScoped)
    // The session's tool calls: what each answered (its text, or the error) with its refusal, and the model's requests.
    const outcome = (sessionID: Session.ID) =>
      Effect.gen(function* () {
        const messages = (yield* sessions.messages({ sessionID })).toSorted((a, b) => a.id.localeCompare(b.id))
        const calls = messages.flatMap((message) =>
          message.type === "assistant" ? message.content.flatMap((part) => (part.type === "tool" ? [part] : [])) : [],
        )
        const requests = (yield* llm.requests()).filter(
          (request) => request.headers?.["x-opencode-session-id"] === sessionID && request.tools.length > 0,
        )
        return {
          results: calls.map((part) =>
            part.state.status === "completed"
              ? part.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n")
              : part.state.status === "error"
                ? part.state.error.message
                : part.state.status,
          ),
          refusals: calls.map((part) =>
            part.state.status === "error" ? part.state.metadata?.permissionRefusal : undefined,
          ),
          offered: requests.at(0)?.tools.map((tool) => tool.name) ?? [],
          // The turn went on after the call: the model answered the script's final text.
          answered: messages.some(
            (message) =>
              message.type === "assistant" &&
              message.content.some((part) => part.type === "text" && part.text === "end"),
          ),
        }
      })
    const control = yield* Effect.promise(() => readDashboardBinding(folder.work, Dashboard.root()))
    // The Host's operations and the dashboards' operation folders left behind.
    const methods = () => host.log.map((request) => request.method)
    const operations = Effect.promise(async () =>
      (await fs.readdir(Dashboard.root())).filter((name) => name.startsWith(".stage-") || name.startsWith(".publish-")),
    )
    const sample = Effect.promise(() => Bun.file(path.join(folder.work, "sample.json")).exists())
    return {
      folder,
      host,
      lookups,
      control,
      create,
      open,
      reply,
      conversation,
      ask,
      answer,
      run,
      outcome,
      methods,
      operations,
      sample,
      sessions,
    }
  })

// The Host's requests: the latest version read on a run of its own, then the publication on another.
const read = ["acquire", "scope", "dashboardRead", "release"]
const sent = [...read, "acquire", "scope", "dashboardPublish", "release"]

describe("loginom.product dashboard_publish (B2.9f, В-102)", () => {
  for (const answer of ["reject", "stop", "once", "conversation"] as const)
    it.live(
      "«Спрашивать» asks once for the bound node and package before anything is sent: " + answer,
      () =>
        Effect.gen(function* () {
          const test = yield* boot()
          const id = yield* test.create()
          const running = yield* test.run(id, publish)
          const request = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
          expect(request.action).toBe("dashboard_publish")
          expect(request.resources).toEqual([test.control.nodeName, test.control.binding.packagePath])
          expect(request.metadata?.sourceHash).toMatch(/^[a-f0-9]{64}$/)
          // Nothing is published yet: the Host only read the latest version, on a run released before the question.
          expect(request.metadata).not.toHaveProperty("dashboardConflict")
          expect(test.methods()).toEqual(read)
          expect(yield* test.operations).toEqual([])
          if (answer === "stop") yield* test.sessions.interrupt(id)
          if (answer === "reject" || answer === "once") expect(yield* test.reply(id, request.id, answer)).toBe(204)
          if (answer === "conversation")
            expect(yield* test.conversation(id, request.id)).toEqual({
              status: 200,
              body: { output: { kind: "save" } },
            })
          yield* Fiber.join(running).pipe(Effect.ignore)
          const result = yield* test.outcome(id)
          // No question is left open, not even by a stopped call.
          yield* until(() => test.open(id).pipe(Effect.map((items) => (items.length === 0 ? true : undefined))), 5_000)
          if (answer === "reject") {
            expect(result.results).toEqual([declinedText])
            expect(result.refusals).toEqual(["declined"])
          }
          if (answer === "stop") expect(result.results).toHaveLength(1)
          if (answer === "stop" || answer === "reject") {
            expect(result.results[0]).not.toMatch(published)
            expect(test.methods()).toEqual(read)
            expect(test.lookups).toEqual([])
            expect(yield* test.sample).toBe(true)
          }
          if (answer === "once" || answer === "conversation") {
            expect(result.results).toEqual([expect.stringMatching(published)])
            expect(test.methods()).toEqual(sent)
            expect(test.lookups).toEqual([{ ...test.control.binding, publication: publicationName }])
            // The published sample leaves the local draft.
            expect(yield* test.sample).toBe(false)
          }
          // The conversation's grant covers the rest of the session.
          if (answer === "conversation")
            expect(
              yield* test.ask(id, {
                action: "dashboard_publish",
                resources: [test.control.nodeName, test.control.binding.packagePath],
              }),
            ).toBe("allow")
          expect(result.answered).toBe(answer !== "stop")
        }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )

  it.live(
    "«Разрешено» publishes without a question",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ config: { permissions: save("allow") } })
        const id = yield* test.create()
        const asked = yield* test.answer(id)
        yield* Fiber.join(yield* test.run(id, publish))
        const result = yield* test.outcome(id)
        expect(asked).toEqual([])
        expect(result.results).toEqual([expect.stringMatching(published)])
        expect(test.methods()).toEqual(sent)
        expect(result.answered).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "«Запрещено» refuses without a question, builds and sends nothing, and the turn goes on",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ config: { permissions: save("deny") } })
        const id = yield* test.create()
        const asked = yield* test.answer(id)
        yield* Fiber.join(yield* test.run(id, publish))
        const result = yield* test.outcome(id)
        expect(asked).toEqual([])
        // The tool is not offered; called by name anyway, it is refused before it runs (B2.6b).
        expect(result.offered).not.toContain("dashboard_publish")
        expect(result.offered).toContain("dashboard_draft")
        expect(result.results).toEqual([deniedText({ action: "dashboard_publish", kind: "save" })])
        expect(result.refusals).toEqual(["denied"])
        expect(test.methods()).toEqual([])
        expect(yield* test.sample).toBe(true)
        expect(result.answered).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the administrator's deny wins over «Разрешено»: refused without a question, nothing is sent, the turn goes on",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({
          config: { permissions: save("allow") },
          policies: [{ action: "tool.use", resource: "dashboard_publish:*", effect: "deny" }],
        })
        const id = yield* test.create()
        const asked = yield* test.answer(id)
        yield* Fiber.join(yield* test.run(id, publish))
        const result = yield* test.outcome(id)
        expect(asked).toEqual([])
        expect(result.results).toEqual([policyDeniedText({ action: "dashboard_publish", kind: "save" })])
        expect(result.refusals).toEqual(["policy"])
        // The policy is a hook, not a rule: the tool is offered, and its question is denied once the build is ready.
        expect(result.offered).toContain("dashboard_publish")
        expect(test.methods()).toEqual(read)
        expect(yield* test.sample).toBe(true)
        expect(result.answered).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a publication confirmation cannot send the old draft after recreation",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create()
        const running = yield* test.run(id, publish)
        const request = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
        // The folder is deleted and prepared again for the same node while the user answers.
        removeDashboard(test.folder.work, Dashboard.root(), test.control)
        expect(yield* Effect.promise(() => test.folder.prepare(test.control.binding))).toBe(test.folder.work)
        expect(yield* test.reply(id, request.id, "once")).toBe(204)
        yield* Fiber.join(running).pipe(Effect.ignore)
        const result = yield* test.outcome(id)
        expect(result.results).toEqual([Dashboard.unbound])
        expect(test.methods()).toEqual(read)
        expect(test.lookups).toEqual([])
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

function until<A, E, R>(read: () => Effect.Effect<A | undefined, E, R>, timeout = 60_000) {
  const deadline = Date.now() + timeout
  const loop: Effect.Effect<A, E | Error, R> = Effect.suspend(read).pipe(
    Effect.flatMap((value) => {
      if (value !== undefined) return Effect.succeed(value)
      if (Date.now() >= deadline) return Effect.fail(new Error("Timed out waiting for condition"))
      return Effect.sleep("50 millis").pipe(Effect.andThen(Effect.suspend(() => loop)))
    }),
  )
  return loop
}
