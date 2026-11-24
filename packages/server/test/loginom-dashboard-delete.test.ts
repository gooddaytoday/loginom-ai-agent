// `dashboard_delete` on a real server with a scripted model and a scripted Host (B2.9g): 0.4's deletion cases whose
// question came through the session's rules — «dashboard deletion honors an explicit denial for the bound package»,
// «delete preserves publications and draft until explicit once» (×3 answers) and «approval from a deleted draft cannot
// mutate publications after recreation» of `v0.4.0:packages/opencode/test/tool/dashboard.test.ts`, and «successful
// dashboard deletion ends its turn» of `session/prompt.test.ts` — and the owner's rule for its question (В-102): a
// deletion asks every time, even when «Сохранять пакеты в Loginom» is «Разрешено» or allowed in this conversation, as
// the terminal does (В-31); «Запрещено» refuses without ending the turn (B2.6b), and the administrator's deny wins over
// all of them before the Host is reached (B2.6c). The cases of the tool itself, with the Host's answers between the
// questions: `loginom-agent/test/dashboard-tools.test.ts`. The folder is each case's own, under a temporary data root
// (`loginom-agent/test/fixture/dashboard-folder.ts`); the Host is the server process's (`ServiceHost`), scripted
// (`fixture/loginom-dock-host.ts`). A user message carries its script as `SCRIPT<json>SCRIPT`, one entry per step.
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
import { Cause, Context, Effect, Exit, Fiber, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { readDashboardBinding, removeDashboard, type ControlBinding } from "../../dashboard/src/agent/folder"
import { Dashboard } from "../../loginom-agent/src/dashboard"
import { ServiceHost } from "../../loginom-agent/src/host"
import { declinedText, deniedText, policyDeniedText, table } from "../../loginom-agent/src/permissions"
import { dashboardFolder } from "../../loginom-agent/test/fixture/dashboard-folder"
import { createEmbeddedRoutes } from "../src/routes"
import { publicationName, scriptedHost } from "./fixture/loginom-dock-host"
import { pluginsLoaded } from "./fixture/routes"

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
const timeout = 60_000
const remove = { tool: "dashboard_delete" } as const
// «Сохранять пакеты в Loginom» as the settings write it: every entry of the kind (B2.6b2).
const save = (effect: "allow" | "deny") =>
  table
    .filter((entry) => entry.kind === "save")
    .map((entry) => ({ action: entry.action, resource: entry.resource, effect }))
const version = { name: publicationName, sourceHash: "a".repeat(64) }
const deletedText = "Дашборд удалён. Опубликованных версий и локального черновика больше нет."

// `config` is the product config as the settings write it, made from the folder's binding; `policies` are the
// administrator's managed policy in the product's system config directory (B2.6c), here a directory of the case. The
// Host keeps the dashboard's published versions: a deletion of the whole current set empties it.
const boot = (
  input: {
    config?: (control: ControlBinding) => Record<string, unknown>
    policies?: readonly Record<string, unknown>[]
  } = {},
) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-dashboard-delete-")).path
    const store = { versions: [version] }
    const host = scriptedHost({
      dashboard: (method, request) => {
        if (method === "dashboardVersions") return { generation: 1, versions: store.versions }
        if (method !== "dashboardDelete") throw new Error("LOGINOM_HOST_REQUEST_FAILED")
        if (JSON.stringify(request.expected) !== JSON.stringify(store.versions))
          return { status: "changed", remaining: store.versions, confirmedRemoved: 0 }
        store.versions = []
        return { status: "empty" }
      },
    })
    const folder = yield* Effect.acquireRelease(
      Effect.promise(() => dashboardFolder()),
      (folder) => Effect.promise(() => folder[Symbol.asyncDispose]()),
    )
    const control = yield* Effect.promise(() => readDashboardBinding(folder.work, Dashboard.root()))
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
      LanguageModel.make({ id: "loginom-dashboard-delete-model", provider: "test", route: OpenAIChat.route }),
      {
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 8_192 },
      },
    )
    // The settings are not the work folder's: the model writes only in its `src`.
    const config = { project: false, claude: false, content: JSON.stringify(input.config?.(control) ?? {}) }
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
        .create({ title: "delete", agent: Agent.ID.make("build"), model: model.ref, location })
        .pipe(Effect.map((session) => session.id))
    type Request = {
      id: string
      action: string
      resources: string[]
      save?: string[]
      metadata?: Record<string, unknown>
    }
    const open = (sessionID: string) =>
      call(`/api/session/${sessionID}/permission?${query}`).pipe(
        Effect.map((response) => response.body.data as Request[]),
      )
    const reply = (sessionID: string, requestID: string, decision: "once" | "always" | "reject") =>
      call(`/api/session/${sessionID}/permission/${requestID}/reply?${query}`, { decision }).pipe(
        Effect.map((response) => response.status),
      )
    const conversation = (sessionID: string, requestID: string) =>
      call(`/api/rpc/loginom.permission/conversation?${query}`, { input: { sessionID, requestID } })
    // A question the client asks itself, as another tool's would come: its effect and, when it asks, its ID.
    const ask = (sessionID: string, request: { action: string; resources: string[]; save?: string[] }) =>
      call(`/api/session/${sessionID}/permission?${query}`, request).pipe(
        Effect.map((response) => response.body.data as { id: string; effect: string }),
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
    // A prompt with a text answer: `admitted` once its turn is over, or the text it failed with when not admitted.
    const admit = (sessionID: Session.ID) =>
      sessions.prompt({ sessionID, text: script({ text: "end" }) }).pipe(
        Effect.andThen(sessions.wait(sessionID)),
        Effect.exit,
        Effect.map((exit) => (Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "admitted")),
      )
    // The session's tool calls: what each answered (its text, or the error) with its refusal; the model's requests
    // and whether the turn went on to the script's final text after the calls.
    const outcome = (sessionID: Session.ID) =>
      Effect.gen(function* () {
        const messages = (yield* sessions.messages({ sessionID })).toSorted((a, b) => a.id.localeCompare(b.id))
        const calls = messages.flatMap((message) =>
          message.type === "assistant" ? message.content.flatMap((part) => (part.type === "tool" ? [part] : [])) : [],
        )
        const requests = (yield* llm.requests()).filter(
          (request) => request.headers?.["x-opencode-session-id"] === sessionID,
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
          metadata: calls.map((part) => (part.state.status === "completed" ? part.state.metadata : undefined)),
          offered: requests.at(0)?.tools.map((tool) => tool.name) ?? [],
          tools: requests.map((request) => request.tools.length),
          answered: messages.some(
            (message) =>
              message.type === "assistant" &&
              message.content.some((part) => part.type === "text" && part.text === "end"),
          ),
          texts: messages.flatMap((message) =>
            message.type === "assistant"
              ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
              : [],
          ),
        }
      })
    // The Host's operations, and whether the local draft is still there.
    const methods = () => host.log.map((request) => request.method)
    const source = Effect.promise(() => Bun.file(path.join(folder.work, "src/main.tsx")).exists())
    return {
      folder,
      host,
      store,
      control,
      create,
      open,
      reply,
      conversation,
      ask,
      answer,
      run,
      admit,
      outcome,
      methods,
      source,
      sessions,
      requests: llm.requests().pipe(Effect.map((items) => items.length)),
    }
  })

// The Host's requests: the versions listed on a run of their own, then each approved set deleted on another.
const listed = ["acquire", "scope", "dashboardVersions", "release"]
const deleted = [...listed, "acquire", "scope", "dashboardDelete", "release"]

describe("loginom.product dashboard_delete (B2.9g, В-102)", () => {
  for (const answer of ["reject", "stop", "always"] as const)
    it.live(
      "delete preserves publications and draft until explicit once: " + answer,
      () =>
        Effect.gen(function* () {
          const test = yield* boot()
          const id = yield* test.create()
          const running = yield* test.run(id, remove)
          const request = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
          expect(request.action).toBe("dashboard_delete")
          expect(request.resources).toEqual([test.control.nodeName, test.control.binding.packagePath])
          expect(request.metadata).toEqual({ publicationCount: 1 })
          // Nothing to save: no answer makes the deletion stop asking (0.4 `always: []`).
          expect(request.save).toBeUndefined()
          expect(test.methods()).toEqual(listed)
          if (answer === "always") {
            // Another question's «always» saves a rule that allows every deletion; the open one still waits.
            const general = yield* test.ask(id, { action: "dashboard_delete", resources: ["*"], save: ["*"] })
            expect(general.effect).toBe("ask")
            expect(yield* test.reply(id, general.id, "always")).toBe(204)
            expect((yield* test.open(id)).map((item) => item.id)).toEqual([request.id])
          }
          if (answer === "stop") yield* test.sessions.interrupt(id)
          if (answer !== "stop") expect(yield* test.reply(id, request.id, "reject")).toBe(204)
          yield* Fiber.join(running).pipe(Effect.ignore)
          yield* until(() => test.open(id).pipe(Effect.map((items) => (items.length === 0 ? true : undefined))), 5_000)
          const result = yield* test.outcome(id)
          expect(result.results).toHaveLength(1)
          if (answer !== "stop") {
            expect(result.results).toEqual([declinedText])
            expect(result.refusals).toEqual(["declined"])
          }
          expect(result.answered).toBe(answer !== "stop")
          expect(test.methods()).toEqual(listed)
          expect(test.store.versions).toEqual([version])
          expect(yield* test.source).toBe(true)
          if (answer !== "always") return

          // The next deletion asks again, whatever was saved.
          const retry = yield* test.run(id, remove)
          const next = yield* until(() =>
            test.open(id).pipe(Effect.map((items) => items.find((item) => item.id !== request.id))),
          )
          expect(next.metadata).toEqual({ publicationCount: 1 })
          expect(yield* test.reply(id, next.id, "reject")).toBe(204)
          yield* Fiber.join(retry)
          expect(test.host.requests("dashboardDelete")).toEqual([])
          expect(yield* test.source).toBe(true)
        }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )

  it.live(
    "«Разрешено» still asks; «один раз» deletes the versions and the folder, and the turn ends with one answer",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ config: () => ({ permissions: save("allow") }) })
        const id = yield* test.create()
        const other = yield* test.create()
        expect(yield* test.admit(other)).toBe("admitted")
        const before = yield* test.requests
        const running = yield* test.run(id, remove)
        const request = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
        expect(request.action).toBe("dashboard_delete")
        expect(yield* test.reply(id, request.id, "once")).toBe(204)
        yield* Fiber.join(running)
        const result = yield* test.outcome(id)
        expect(result.results).toEqual([deletedText])
        expect(result.metadata).toEqual([expect.objectContaining({ dashboardDeleted: true })])
        expect(test.methods()).toEqual(deleted)
        expect(test.host.requests("dashboardDelete").map((item) => item.expected)).toEqual([[version]])
        expect(test.store.versions).toEqual([])
        expect(
          yield* Effect.promise(() =>
            fs.stat(path.dirname(test.folder.work)).then(
              () => true,
              () => false,
            ),
          ),
        ).toBe(false)
        // The turn ends: the request after the deletion offers no tools, and the model's one answer is the last.
        expect(result.tools).toEqual([expect.any(Number), 0])
        expect(result.tools[0]).toBeGreaterThan(0)
        expect(result.answered).toBe(false)
        expect(result.texts).toEqual(["ok"])
        expect((yield* test.requests) - before).toBe(2)
        // Neither this chat nor another one of the deleted folder runs again, before or after it is prepared anew.
        expect(yield* test.admit(id)).toContain(Dashboard.unbound)
        expect(yield* test.admit(other)).toContain(Dashboard.unbound)
        expect(yield* Effect.promise(() => test.folder.prepare(test.control.binding))).toBe(test.folder.work)
        expect(yield* test.admit(id)).toContain(Dashboard.unbound)
        expect(yield* test.admit(other)).toContain(Dashboard.unbound)
        expect((yield* test.requests) - before).toBe(2)
        expect(yield* test.admit(yield* test.create())).toBe("admitted")
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "«в этом разговоре» does not cover the deletion: it is not granted on its question, nor answered or lifted by a grant",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create()
        const running = yield* test.run(id, remove)
        const request = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
        const refused = yield* test.conversation(id, request.id)
        expect(refused.status).not.toBe(200)
        expect(refused.body).toMatchObject({ type: "not_grantable", data: { action: "dashboard_delete" } })
        expect((yield* test.open(id)).map((item) => item.id)).toEqual([request.id])
        // A grant of the kind on a publication's question answers that one, not the open deletion.
        const publication = yield* test.ask(id, {
          action: "dashboard_publish",
          resources: [test.control.nodeName, test.control.binding.packagePath],
        })
        expect(publication.effect).toBe("ask")
        expect(yield* test.conversation(id, publication.id)).toEqual({
          status: 200,
          body: { output: { kind: "save" } },
        })
        expect((yield* test.open(id)).map((item) => item.id)).toEqual([request.id])
        expect(yield* test.reply(id, request.id, "reject")).toBe(204)
        yield* Fiber.join(running)
        // With the grant in place, the next deletion asks again.
        const retry = yield* test.run(id, remove)
        const next = yield* until(() =>
          test.open(id).pipe(Effect.map((items) => items.find((item) => item.id !== request.id))),
        )
        expect(next.action).toBe("dashboard_delete")
        expect(yield* test.reply(id, next.id, "reject")).toBe(204)
        yield* Fiber.join(retry)
        expect((yield* test.outcome(id)).results).toEqual([declinedText, declinedText])
        expect(test.host.requests("dashboardDelete")).toEqual([])
        expect(yield* test.source).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "«Запрещено» refuses without a question, reaches nothing, and the turn goes on",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ config: () => ({ permissions: save("deny") }) })
        const id = yield* test.create()
        const asked = yield* test.answer(id)
        yield* Fiber.join(yield* test.run(id, remove))
        const result = yield* test.outcome(id)
        expect(asked).toEqual([])
        // The tool is not offered; called by name anyway, it is refused before it runs (B2.6b).
        expect(result.offered).not.toContain("dashboard_delete")
        expect(result.offered).toContain("dashboard_draft")
        expect(result.results).toEqual([deniedText({ action: "dashboard_delete", kind: "save" })])
        expect(result.refusals).toEqual(["denied"])
        expect(test.methods()).toEqual([])
        expect(yield* test.source).toBe(true)
        expect(result.answered).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "dashboard deletion honors an explicit denial for the bound package",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({
          config: (control) => ({
            permissions: [{ action: "dashboard_delete", resource: control.binding.packagePath, effect: "deny" }],
          }),
        })
        const id = yield* test.create()
        const asked = yield* test.answer(id)
        yield* Fiber.join(yield* test.run(id, remove))
        const result = yield* test.outcome(id)
        expect(asked).toEqual([])
        expect(result.results).toEqual([deniedText({ action: "dashboard_delete", kind: "save" })])
        expect(result.refusals).toEqual(["denied"])
        expect(test.methods()).toEqual(listed)
        expect(yield* test.source).toBe(true)
        expect(result.answered).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the administrator's deny wins over «Разрешено»: refused before the Host, without a question, the turn goes on",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({
          config: () => ({ permissions: save("allow") }),
          policies: [{ action: "tool.use", resource: "dashboard_delete:*", effect: "deny" }],
        })
        const id = yield* test.create()
        const asked = yield* test.answer(id)
        yield* Fiber.join(yield* test.run(id, remove))
        const result = yield* test.outcome(id)
        expect(asked).toEqual([])
        // The policy is a hook, not a rule: the tool is offered, and its call is refused before it lists anything.
        expect(result.offered).toContain("dashboard_delete")
        expect(result.results).toEqual([policyDeniedText({ action: "dashboard_delete", kind: "save" })])
        expect(result.refusals).toEqual(["policy"])
        expect(test.methods()).toEqual([])
        expect(yield* test.source).toBe(true)
        expect(result.answered).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "approval from a deleted draft cannot mutate publications after recreation",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create()
        const running = yield* test.run(id, remove)
        const request = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
        // The folder is deleted and prepared again for the same node while the user answers.
        removeDashboard(test.folder.work, Dashboard.root(), test.control)
        expect(yield* Effect.promise(() => test.folder.prepare(test.control.binding))).toBe(test.folder.work)
        expect(yield* test.reply(id, request.id, "once")).toBe(204)
        yield* Fiber.join(running).pipe(Effect.ignore)
        const result = yield* test.outcome(id)
        expect(result.results).toEqual([Dashboard.unbound])
        expect(test.methods()).toEqual(listed)
        expect(test.store.versions).toEqual([version])
        expect(yield* test.source).toBe(true)
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

function until<A, E, R>(read: () => Effect.Effect<A | undefined, E, R>, timeout = 30_000) {
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
