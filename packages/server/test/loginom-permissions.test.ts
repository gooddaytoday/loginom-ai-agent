import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { Database } from "@opencode/core/database/database"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Flag } from "@opencode/core/flag"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { Schedule } from "@opencode/core/schedule"
import { ScheduleTable } from "@opencode/core/schedule/sql"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { define } from "@opencode/plugin/effect/plugin"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Context, Effect, Fiber, Layer, Schema, type Scope } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import {
  declinedText,
  deniedKindsText,
  deniedText,
  scheduleRunDenied,
  table,
  type Kind,
} from "../../loginom-agent/src/permissions"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { createEmbeddedRoutes } from "../src/routes"
import { pluginsLoaded } from "./fixture/routes"

// Product permissions of the built-in plugin `loginom.product` (B2.6a) on a real server: the defaults of В-30 and В-31
// for each kind of ux-spec «Разрешения», «Разрешать в этом разговоре» through the plugin's RPC, «Разрешить один раз»,
// a kind the config denies, the terminal, subagents and schedules. A request goes through the permission API
// (`POST /api/session/:id/permission`), which evaluates the rules and the `permission.evaluate` hooks as a tool's
// request does; real tools run on a scripted model, whose user message carries its script as `SCRIPT<json>SCRIPT`.

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// Each case boots a server Location; the schedule case waits out the scheduler's real one-second wake.
const timeout = 30_000
const source = { type: "tool", messageID: "msg_probe", id: "call_probe" }

// One request per kind, as its tools and Dock operations make it; `read` asks only outside the project.
const asked: { kind: Kind; action: string; resources: string[] }[] = [
  { kind: "read", action: "external_directory", resources: ["/elsewhere/*"] },
  { kind: "write", action: "edit", resources: ["report.md"] },
  { kind: "save", action: "loginom_dock_action_run", resources: ["*"] },
  { kind: "save", action: "loginom_dock_prepare", resources: ["local_package"] },
  { kind: "save", action: "dashboard_publish", resources: ["*"] },
  { kind: "save", action: "dashboard_delete", resources: ["*"] },
  { kind: "export", action: "loginom_dock_node_apply", resources: ["exports.excel"] },
  { kind: "web", action: "webfetch", resources: ["https://example.com"] },
  { kind: "web", action: "websearch", resources: ["loginom"] },
]

type PluginContext = Parameters<Parameters<typeof define>[0]["effect"]>[0]

const boot = (
  config: Record<string, unknown> = {},
  extra: (ctx: PluginContext) => Effect.Effect<void, never, Scope.Scope> = () => Effect.void,
) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-permissions-")).path
    const global = path.join(dir, "global")
    const location = Location.Ref.make({ directory: AbsolutePath.make(dir) })
    yield* Effect.promise(async () => {
      await fs.mkdir(path.join(global, "config"), { recursive: true })
      await Bun.write(path.join(dir, "loginom-ai-agent.json"), JSON.stringify(config))
      await Bun.write(path.join(dir, "inside.txt"), "inside\n")
    })
    const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    yield* llm.serve(respond)
    const model = SessionRunnerModel.resolved(
      LanguageModel.make({ id: "loginom-permissions-model", provider: "test", route: OpenAIChat.route }),
      {
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 8_192 },
      },
    )
    const context = yield* Layer.build(
      createEmbeddedRoutes(
        {
          // Schedules are on by default in the dev channel; the project's own config file is read.
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
    yield* Context.get(context, SdkPlugins.Service).register(
      define({
        id: "test.loginom-permissions",
        effect: Effect.fnUntraced(function* (ctx) {
          yield* extra(ctx)
        }),
      }),
    )
    yield* Effect.forkScoped(Context.get(context, Schedule.Service).run)
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
    const at = `location[directory]=${encodeURIComponent(dir)}`
    // The rules, the product's defaults among them, exist once the Location's plugins have loaded.
    yield* pluginsLoaded(context, dir)
    const create = (title: string) =>
      sessions
        .create({ title, agent: Agent.ID.make("build"), model: model.ref, location })
        .pipe(Effect.map((s) => s.id))
    const ask = (
      sessionID: string,
      request: { action: string; resources: string[]; agent?: string; source?: unknown },
    ) =>
      call(`/api/session/${sessionID}/permission?${at}`, request).pipe(
        Effect.map((response) => response.body.data as { id: string; effect: string }),
      )
    const open = (sessionID: string) =>
      call(`/api/session/${sessionID}/permission?${at}`).pipe(
        Effect.map((response) => response.body.data as { id: string; action: string; resources: string[] }[]),
      )
    const reply = (sessionID: string, requestID: string, decision: "once" | "always" | "reject") =>
      call(`/api/session/${sessionID}/permission/${requestID}/reply?${at}`, { decision }).pipe(
        Effect.map((response) => response.status),
      )
    const conversation = (sessionID: string, requestID: string) =>
      call(`/api/rpc/loginom.permission/conversation?${at}`, { input: { sessionID, requestID } })
    const saved = call(`/api/permission/saved?${at}`).pipe(Effect.map((response) => response.body.data as unknown[]))
    const prompt = (sessionID: Session.ID, text: string) =>
      sessions.prompt({ sessionID, text }).pipe(Effect.andThen(sessions.wait(sessionID)))
    const requests = (sessionID: Session.ID) =>
      llm
        .requests()
        .pipe(Effect.map((all) => all.filter((request) => header(request) === sessionID && request.tools.length > 0)))
    const tools = (sessionID: Session.ID) =>
      sessions
        .messages({ sessionID })
        .pipe(
          Effect.map((messages) =>
            messages
              .toSorted((a, b) => a.id.localeCompare(b.id))
              .flatMap((message) =>
                message.type === "assistant"
                  ? message.content.flatMap((part) => (part.type === "tool" ? [part] : []))
                  : [],
              ),
          ),
        )
    // A schedule with a `run` check as one created before B2.6a2 lies in the database, already due; the case runs the
    // scheduler's tick itself, since a row written past the service does not wake its loop.
    const database = Context.get(context, Database.Service)
    const schedules = Context.get(context, Schedule.Service)
    const stored = (sessionID: Session.ID, run: string) =>
      Effect.gen(function* () {
        const id = Schedule.ID.create()
        const now = Date.now()
        yield* database.db
          .insert(ScheduleTable)
          .values({
            id,
            session_id: sessionID,
            action: { type: "prompt", prompt: "never" },
            check: { mode: "if", condition: { type: "shell", run } },
            when: { type: "in", in: "1 second" },
            tz: "UTC",
            next_due_at: now,
            time_created: now,
            time_updated: now,
          })
          .run()
          .pipe(Effect.orDie)
        return id
      })
    const outcome = (scheduleID: string) =>
      until(() =>
        schedules.tick.pipe(
          Effect.andThen(call(`/api/experimental/schedule/${scheduleID}`)),
          Effect.map((response) => response.body.data.lastOutcome as string | undefined),
        ),
      )
    return {
      dir,
      sessions,
      create,
      ask,
      open,
      reply,
      conversation,
      saved,
      call,
      prompt,
      requests,
      tools,
      stored,
      outcome,
    }
  })

describe("loginom.product permissions (B2.6a)", () => {
  it.live(
    "defaults: project files without a question, the other kinds ask, reading outside the project asks, the terminal is off",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create("defaults")
        for (const action of ["read", "glob", "grep", "loginom_file_profile"])
          expect((yield* test.ask(id, { action, resources: ["inside.txt"] })).effect).toBe("allow")
        for (const request of asked)
          expect([request.kind, (yield* test.ask(id, request)).effect]).toEqual([request.kind, "ask"])
        expect((yield* test.ask(id, { action: "shell", resources: ["ls"], source })).effect).toBe("deny")
        expect((yield* test.ask(id, { action: "shell", resources: ["ls"] })).effect).toBe("deny")
        // Outside the kinds the product changes nothing: a server package, a node that is not an export.
        expect((yield* test.ask(id, { action: "loginom_dock_prepare", resources: ["*"] })).effect).toBe("allow")
        expect((yield* test.ask(id, { action: "loginom_dock_node_apply", resources: ["transform.sort"] })).effect).toBe(
          "allow",
        )
        expect((yield* test.ask(id, { action: "question", resources: ["*"] })).effect).toBe("allow")

        // The real tools: `read` inside the project asks nothing; outside it asks `external_directory` first.
        const outside = path.join(path.dirname(test.dir), `${path.basename(test.dir)}-outside.txt`)
        yield* Effect.promise(() => Bun.write(outside, "outside\n"))
        yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(outside, { force: true })))
        const reader = yield* test.create("read")
        yield* test.prompt(reader, script({ tool: "read", input: { path: "inside.txt" } }, { text: "end" }))
        expect((yield* test.tools(reader)).map((part) => part.state.status)).toEqual(["completed"])
        const running = yield* test
          .prompt(reader, script({ tool: "read", input: { path: outside } }, { text: "end" }))
          .pipe(Effect.forkScoped)
        const pending = yield* until(() => test.open(reader).pipe(Effect.map((items) => items[0])))
        expect(pending).toMatchObject({ action: "external_directory" })
        expect(yield* test.reply(reader, pending.id, "once")).toBe(204)
        yield* Fiber.join(running)
        expect((yield* test.tools(reader)).map((part) => part.state.status)).toEqual(["completed", "completed"])

        // The model is not offered the terminal, and a call to it runs nothing.
        const marker = path.join(test.dir, "terminal-ran")
        const shell = yield* test.create("terminal off")
        yield* test.prompt(shell, script({ tool: "shell", input: { command: `touch ${marker}` } }, { text: "end" }))
        expect(names((yield* test.requests(shell))[0])).not.toContain("shell")
        expect(names((yield* test.requests(shell))[0])).toEqual(expect.arrayContaining(["read", "edit", "webfetch"]))
        expect(yield* Effect.promise(() => Bun.file(marker).exists())).toBe(false)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "«Разрешать в этом разговоре» answers the request and allows its kind in this session only, saving nothing",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        for (const request of asked) {
          const id = yield* test.create(`conversation ${request.action}`)
          const first = yield* test.ask(id, request)
          expect(first.effect).toBe("ask")
          const granted = yield* test.conversation(id, first.id)
          expect([request.action, granted.status, granted.body]).toEqual([
            request.action,
            200,
            { output: { kind: request.kind } },
          ])
          expect(yield* test.open(id)).toEqual([])
          expect((yield* test.ask(id, request)).effect).toBe("allow")
          // Every other kind still asks, and the terminal stays off.
          for (const other of asked.filter((item) => item.kind !== request.kind))
            expect([other.action, (yield* test.ask(id, other)).effect]).toEqual([other.action, "ask"])
          expect((yield* test.ask(id, { action: "shell", resources: ["ls"], source })).effect).toBe("deny")
          // Another conversation of the same project asks again: unlike OpenCode's `always`, nothing is project-wide.
          const other = yield* test.create(`other ${request.action}`)
          expect((yield* test.ask(other, request)).effect).toBe("ask")
        }
        expect(yield* test.saved).toEqual([])

        // A grant answers the session's other open questions it now covers, and only those.
        const id = yield* test.create("parallel")
        const first = yield* test.ask(id, { action: "edit", resources: ["a.md"] })
        const second = yield* test.ask(id, { action: "edit", resources: ["b.md"] })
        const web = yield* test.ask(id, { action: "webfetch", resources: ["https://example.com"] })
        expect((yield* test.conversation(id, first.id)).status).toBe(200)
        expect((yield* test.open(id)).map((item) => item.id)).toEqual([web.id])
        expect(second.effect).toBe("ask")
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "«Разрешить один раз» answers one request of each kind; the next one asks again",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create("once")
        for (const request of asked) {
          const first = yield* test.ask(id, request)
          expect(yield* test.reply(id, first.id, "once")).toBe(204)
          expect(yield* test.open(id)).toEqual([])
          const again = yield* test.ask(id, request)
          expect([request.action, again.effect]).toEqual([request.action, "ask"])
          expect(yield* test.reply(id, again.id, "reject")).toBe(204)
        }
        expect(yield* test.saved).toEqual([])
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a kind the config denies is denied, its question never comes, and the conversation grant has nothing to answer",
    () =>
      Effect.gen(function* () {
        // The settings mechanism of ux-spec: config `permissions`. «Запрещено» for every kind but the terminal.
        const test = yield* boot({
          permissions: table
            .filter((entry) => entry.kind !== "terminal")
            .map((entry) => ({ action: entry.action, resource: entry.resource, effect: "deny" })),
        })
        const id = yield* test.create("denied")
        for (const request of [...asked, { kind: "read", action: "read", resources: ["inside.txt"] }])
          expect([request.action, (yield* test.ask(id, request)).effect]).toEqual([request.action, "deny"])
        expect(yield* test.open(id)).toEqual([])
        const missing = yield* test.conversation(id, "per_missing")
        expect(missing.status).not.toBe(200)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the terminal on asks for every agent command, never for the conversation, whatever rule allows it (В-31)",
    () =>
      Effect.gen(function* () {
        // The user turns the terminal on; even a config `allow` leaves every command of the agent asking.
        const test = yield* boot({ permissions: [{ action: "shell", resource: "*", effect: "allow" }] })
        const marker = path.join(test.dir, "terminal-ran")
        const id = yield* test.create("terminal on")
        const running = yield* test
          .prompt(
            id,
            script(
              { tool: "shell", input: { command: `touch ${marker}` } },
              { tool: "shell", input: { command: `touch ${marker}` } },
              { text: "end" },
            ),
          )
          .pipe(Effect.forkScoped)
        const first = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
        expect(first.action).toBe("shell")
        expect(names((yield* test.requests(id))[0])).toContain("shell")
        const refused = yield* test.conversation(id, first.id)
        expect(refused.status).not.toBe(200)
        expect(refused.body).toMatchObject({ type: "not_grantable", data: { action: "shell" } })
        expect((yield* test.open(id)).map((item) => item.id)).toEqual([first.id])
        // `always` saves a rule for the project, yet the next command asks again.
        expect(yield* test.reply(id, first.id, "always")).toBe(204)
        const second = yield* until(() =>
          test.open(id).pipe(Effect.map((items) => items.find((item) => item.id !== first.id))),
        )
        expect(second.action).toBe("shell")
        expect(yield* Effect.promise(() => Bun.file(marker).exists())).toBe(true)
        expect(yield* test.reply(id, second.id, "once")).toBe(204)
        yield* Fiber.join(running)
        expect((yield* test.tools(id)).map((part) => part.state.status)).toEqual(["completed", "completed"])
        expect((yield* test.saved).length).toBe(1)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the terminal on asks for a command that names no program too, and without an answer it does not run (B2.6a3)",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ permissions: [{ action: "shell", resource: "*", effect: "ask" }] })
        const file = (name: string) => path.join(test.dir, name)
        // `ShellParse` finds no program in the last four: before B2.6a3 they ran without a question.
        const commands = [
          `> ${JSON.stringify(file("redirected"))}`,
          `cd . > ${JSON.stringify(file("cd-redirected"))}`,
          "[[ -e inside.txt ]]",
          "X=1",
          "export X=1",
        ]
        for (const command of commands) {
          const id = yield* test.create(command)
          const running = yield* test
            .prompt(id, script({ tool: "shell", input: { command } }, { text: "end" }))
            .pipe(Effect.forkScoped)
          const pending = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
          expect([command, pending.action, pending.resources]).toEqual([command, "shell", [command]])
          expect(yield* test.reply(id, pending.id, "reject")).toBe(204)
          yield* Fiber.join(running).pipe(Effect.ignore)
          expect((yield* test.tools(id)).map((part) => part.state.status)).toEqual(["error"])
        }
        for (const name of ["redirected", "cd-redirected"])
          expect([name, yield* Effect.promise(() => Bun.file(file(name)).exists())]).toEqual([name, false])

        // A command with a program asks as before, and runs once answered.
        const ordinary = yield* test.create("ordinary")
        const touch = `touch ${JSON.stringify(file("touched"))}`
        const running = yield* test
          .prompt(ordinary, script({ tool: "shell", input: { command: touch } }, { text: "end" }))
          .pipe(Effect.forkScoped)
        const pending = yield* until(() => test.open(ordinary).pipe(Effect.map((items) => items[0])))
        expect([pending.action, pending.resources]).toEqual(["shell", [touch]])
        expect(yield* test.reply(ordinary, pending.id, "once")).toBe(204)
        yield* Fiber.join(running)
        expect(yield* Effect.promise(() => Bun.file(file("touched")).exists())).toBe(true)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a subagent's own rules loosen nothing: explore asks for sites and outside reads and runs no command",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ permissions: [{ action: "shell", resource: "*", effect: "ask" }] })
        const id = yield* test.create("explore")
        // `explore` allows these itself; `build` with the terminal on asks.
        for (const request of [
          { action: "webfetch", resources: ["https://example.com"] },
          { action: "websearch", resources: ["loginom"] },
          { action: "external_directory", resources: ["/elsewhere/*"] },
        ])
          expect([request.action, (yield* test.ask(id, { ...request, agent: "explore" })).effect]).toEqual([
            request.action,
            "ask",
          ])
        expect((yield* test.ask(id, { action: "read", resources: ["inside.txt"], agent: "explore" })).effect).toBe(
          "allow",
        )
        expect((yield* test.ask(id, { action: "shell", resources: ["ls"], agent: "explore", source })).effect).toBe(
          "deny",
        )
        expect((yield* test.ask(id, { action: "shell", resources: ["ls"], source })).effect).toBe("ask")
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "schedule: a `run` check is neither created nor executed, with the terminal off or on (B2.6a2)",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const allow = [{ action: "shell", resource: "*", effect: "allow" as const }]
        const off = yield* test.create("terminal off")
        const on = yield* test.create("terminal on")
        yield* test.sessions.setPermissions({ sessionID: on, permissions: allow })
        const marker = (name: string) => path.join(test.dir, name)
        // A program, and a check that names none (`cd . > file` creates the file, and the parser finds no command).
        const runs = {
          program: (name: string) => `printf x >> ${JSON.stringify(marker(name))} && false`,
          builtin: (name: string) => `cd . > ${JSON.stringify(marker(name))}`,
        }
        const states = { off, on }
        // Off: the product's `shell * deny` rule refuses it before any hook. On: the product's hook refuses it.
        const reasons = { off: "Permission denied: shell", on: scheduleRunDenied }
        const names: string[] = []
        for (const [state, sessionID] of Object.entries(states) as ["off" | "on", Session.ID][])
          for (const [kind, run] of Object.entries(runs)) {
            const name = `created-${state}-${kind}`
            names.push(name)
            const refused = yield* test.call("/api/experimental/schedule", {
              sessionID,
              when: { in: "1 second" },
              if: { run: run(name) },
              prompt: "never",
            })
            expect([name, refused.status, refused.body.message]).toEqual([name, 403, reasons[state]])
          }
        for (const sessionID of [off, on])
          expect((yield* test.call(`/api/experimental/schedule?sessionID=${sessionID}`)).body).toEqual({ data: [] })

        // Checks stored before: at their tick none runs. A check that ran would end `checked` or `fired`; `failed` is its
        // refused permission. On the session that allows `shell`, only the hook refuses it, although nobody is present
        // to answer (`Permission.Unattended`): a hook's deny holds there too.
        for (const [state, sessionID] of Object.entries(states) as ["off" | "on", Session.ID][])
          for (const [kind, run] of Object.entries(runs)) {
            const name = `stored-${state}-${kind}`
            names.push(name)
            expect([name, yield* test.outcome(yield* test.stored(sessionID, run(name)))]).toEqual([name, "failed"])
          }
        for (const name of names)
          expect([name, yield* Effect.promise(() => Bun.file(marker(name)).exists())]).toEqual([name, false])
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the product's own directories outside the project are read without a question; a neighbour and a write still ask (B2.6a2)",
    () =>
      Effect.gen(function* () {
        // Bundled skills and the home of the `plan` agent's plans, outside the project, as in an installation.
        const outside = (yield* tmpdirScoped("loginom-permissions-outside-")).path
        const resources = path.join(outside, "resources")
        const home = path.join(outside, "home")
        yield* environment("LOGINOM_AI_AGENT_RESOURCES", resources)
        yield* environment("LOGINOM_AI_AGENT_TEST_HOME", home)
        const guide = path.join(resources, "skills", "loginom-automation", "references", "guide.md")
        const plan = path.join(home, ".loginom-ai-agent", "plan", "plan.md")
        const neighbour = path.join(outside, "neighbour", "notes.md")
        // The machine's data directory keeps a large tool result, as OpenCode and `dock.ts` do; the case removes it.
        const result = path.join(Global.Path.data, "tool-output", `b26a2-${crypto.randomUUID()}.txt`)
        yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(result, { force: true })))
        // The verified bundled catalog of B2.4, so the `skill` tool lists the reference file itself.
        const skills = ["loginom-automation", "package-docs", "loginom-dashboard"].map((name) =>
          path.join(resources, "skills", name, "SKILL.md"),
        )
        yield* Effect.promise(async () => {
          await Promise.all(
            [guide, plan, neighbour, result, ...skills].map((file) =>
              fs
                .mkdir(path.dirname(file), { recursive: true })
                .then(() =>
                  Bun.write(
                    file,
                    path.basename(file) === "SKILL.md"
                      ? `---\nname: ${path.basename(path.dirname(file))}\ndescription: Bundled.\n---\n\nBUNDLED\n`
                      : `${path.basename(file)}\n`,
                  ),
                ),
            ),
          )
          await Bun.write(
            path.join(resources, "resource-manifest.json"),
            JSON.stringify({ protocol: 1, files: await resourceInventory(resources) }),
          )
        })
        const test = yield* boot()

        const reader = yield* test.create("own")
        yield* test.prompt(
          reader,
          script(
            // The reference file as the loaded skill lists it to the model.
            { tool: "skill", input: { id: "loginom-automation" } },
            { tool: "read", input: { path: "@listed" } },
            { tool: "read", input: { path: plan } },
            { tool: "read", input: { path: result } },
            { text: "end" },
          ),
        )
        const parts = yield* test.tools(reader)
        expect(parts.map((part) => part.state.status)).toEqual(Array(4).fill("completed"))
        expect(JSON.stringify(parts[0].state.status === "completed" ? parts[0].state.content : "")).toContain(guide)
        expect(JSON.stringify(parts[1].state.status === "completed" ? parts[1].state.content : "")).toContain(
          "guide.md",
        )

        // A neighbouring directory asks; so does writing into the plans.
        for (const step of [
          { tool: "read", input: { path: neighbour } },
          { tool: "write", input: { path: path.join(path.dirname(plan), "new.md"), content: "new" } },
        ]) {
          const id = yield* test.create(step.tool)
          const running = yield* test.prompt(id, script(step, { text: "end" })).pipe(Effect.forkScoped)
          const pending = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
          expect([step.tool, pending.action]).toEqual([step.tool, "external_directory"])
          expect(yield* test.reply(id, pending.id, "reject")).toBe(204)
          yield* Fiber.join(running).pipe(Effect.ignore)
        }
        expect(yield* Effect.promise(() => Bun.file(path.join(path.dirname(plan), "new.md")).exists())).toBe(false)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

describe("loginom.product refusals of built-in tools (B2.6b, В-75)", () => {
  it.live(
    "«Отклонить» on a write and «Запрещено» for files, a site and a hidden tool: nothing is done, the model is told why, the turn goes on",
    () =>
      Effect.gen(function* () {
        // Rules for some files and one site leave `write`, `edit`, `read` and `webfetch` offered.
        const test = yield* boot({
          permissions: [
            { action: "edit", resource: "denied.md", effect: "deny" },
            { action: "edit", resource: "inside.txt", effect: "deny" },
            { action: "external_directory", resource: "*", effect: "deny" },
            { action: "webfetch", resource: "https://denied.example/*", effect: "deny" },
          ],
        })
        const outside = path.join(path.dirname(test.dir), `${path.basename(test.dir)}-outside.txt`)
        yield* Effect.promise(() => Bun.write(outside, "outside\n"))
        yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(outside, { force: true })))
        const id = yield* test.create("built-in refusals")
        const running = yield* test
          .prompt(
            id,
            script(
              { tool: "write", input: { path: "declined.md", content: "declined" } },
              { tool: "write", input: { path: "denied.md", content: "denied" } },
              { tool: "edit", input: { path: "inside.txt", oldString: "inside", newString: "changed" } },
              { tool: "read", input: { path: outside } },
              { tool: "webfetch", input: { url: "https://denied.example/page" } },
              { text: "end" },
            ),
          )
          .pipe(Effect.forkScoped)
        // The user's «Отклонить»: a decline that OpenCode raises past the tool, so it would end the step.
        const pending = yield* until(() => test.open(id).pipe(Effect.map((items) => items[0])))
        expect([pending.action, pending.resources]).toEqual(["edit", ["declined.md"]])
        expect(yield* test.reply(id, pending.id, "reject")).toBe(204)
        yield* Fiber.join(running)
        const said = [
          declinedText,
          deniedText({ action: "edit", kind: "write" }),
          deniedText({ action: "edit", kind: "write" }),
          deniedText({ action: "external_directory", kind: "read" }),
          deniedText({ action: "webfetch", kind: "web" }),
        ]
        expect(
          (yield* test.tools(id)).map((part) => (part.state.status === "error" ? part.state.error.message : "ran")),
        ).toEqual(said)
        expect(told((yield* test.requests(id)).at(-1))).toEqual(said)
        // B2.6b2: each refused call says for clients whether the user declined it or a rule denied it; rules for some
        // files and one site deny no kind as a whole, so no request names one.
        expect(
          (yield* test.tools(id)).map((part) =>
            part.state.status === "error"
              ? [part.state.metadata?.permissionDenied, part.state.metadata?.permissionRefusal]
              : [],
          ),
        ).toEqual([[true, "declined"], ...Array(4).fill([true, "denied"])])
        for (const request of yield* test.requests(id))
          expect(request.system.map((part) => part.text).join("\n")).not.toContain("LOGINOM_PERMISSIONS_DENIED")
        for (const name of ["declined.md", "denied.md"])
          expect([name, yield* Effect.promise(() => Bun.file(path.join(test.dir, name)).exists())]).toEqual([
            name,
            false,
          ])
        const answers = (yield* test.sessions.messages({ sessionID: id })).filter((item) => item.type === "assistant")
        expect(answers.map((item) => (item.type === "assistant" ? [item.finish, item.error] : []))).toEqual([
          ["stop", undefined],
          ...Array(5).fill(["tool-calls", undefined]),
        ])
        expect(yield* Effect.promise(() => Bun.file(path.join(test.dir, "inside.txt")).text())).toBe("inside\n")

        // A rule that denies the whole action hides its tools; `write`, called by name anyway, asks the action `edit`.
        const hidden = yield* test.create("hidden write")
        yield* test.sessions.setPermissions({
          sessionID: hidden,
          permissions: [{ action: "edit", resource: "*", effect: "deny" }],
        })
        yield* test.prompt(
          hidden,
          script({ tool: "write", input: { path: "hidden.md", content: "x" } }, { text: "end" }),
        )
        expect(names((yield* test.requests(hidden))[0])).not.toContain("write")
        expect(told((yield* test.requests(hidden)).at(-1))).toEqual([deniedText({ action: "edit", kind: "write" })])
        // B2.6b2: the session's rule denies the kind as a whole, and every request names it.
        for (const request of yield* test.requests(hidden))
          expect(request.system.map((part) => part.text).join("\n")).toContain(deniedKindsText(["write"]))
        expect(
          (yield* test.tools(hidden)).map((part) =>
            part.state.status === "error" ? part.state.metadata?.permissionRefusal : undefined,
          ),
        ).toEqual(["denied"])
        expect(yield* Effect.promise(() => Bun.file(path.join(test.dir, "hidden.md")).exists())).toBe(false)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

describe("permission.evaluate contract (B2.6a)", () => {
  // A probe plugin without the product's rules: the effects the product relies on beyond B2.5a's `ask` → `allow`.
  it.live(
    "a hook turns `allow` into a question, and `deny` with a message fails the call with it",
    () =>
      Effect.gen(function* () {
        const failures: string[] = []
        const test = yield* boot({}, (ctx) =>
          Effect.gen(function* () {
            yield* ctx.permission.hook("evaluate", (event) =>
              Effect.sync(() => {
                if (event.resources.includes("to-ask")) event.effect = "ask"
                if (event.resources.includes("to-deny")) {
                  event.effect = "deny"
                  event.message = "probe says no"
                }
              }),
            )
            yield* ctx.tool.transform((editor) =>
              editor.add({
                name: "probe",
                description: "Ask a permission",
                input: Schema.Struct({ resource: Schema.String }),
                output: Schema.String,
                options: { codemode: false },
                execute: (input, call) =>
                  ctx.permission
                    .assert({
                      sessionID: call.sessionID,
                      action: "contract_probe",
                      resources: [input.resource],
                      source: { type: "tool", messageID: call.messageID, id: call.id },
                    })
                    .pipe(
                      Effect.catch((error) => Effect.sync(() => failures.push(String(error.message)))),
                      Effect.as({ output: "done", content: "done" }),
                    ),
              }),
            )
          }),
        )
        const id = yield* test.create("contract")
        yield* test.sessions.setPermissions({
          sessionID: id,
          permissions: [{ action: "*", resource: "*", effect: "allow" }],
        })
        expect((yield* test.ask(id, { action: "contract_probe", resources: ["to-ask"] })).effect).toBe("ask")
        expect((yield* test.ask(id, { action: "contract_probe", resources: ["plain"] })).effect).toBe("allow")
        yield* test.prompt(id, script({ tool: "probe", input: { resource: "to-deny" } }, { text: "end" }))
        expect(failures).toEqual(["probe says no"])
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

// Sets an environment variable for the rest of the case; the product plugin reads these when the Location activates.
function environment(name: string, value: string) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const previous = process.env[name]
      process.env[name] = value
      return previous
    }),
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env[name]
        else process.env[name] = previous
      }),
  )
}

function respond(request: LLMRequest) {
  const user = request.messages.findLastIndex((message) => message.role === "user" && text(message).includes("SCRIPT<"))
  if (user < 0 || request.tools.length === 0) return TestLLM.text("ok", "text_ok")
  const body = text(request.messages[user])
  const steps: Step[] = JSON.parse(body.slice(body.indexOf("SCRIPT<") + 7, body.lastIndexOf(">SCRIPT")))
  const step = steps[request.messages.slice(user + 1).filter((message) => message.role === "assistant").length]
  if (!step) return TestLLM.text("done", "text_done")
  if ("text" in step) return TestLLM.text(step.text, `text_${crypto.randomUUID()}`)
  // `@listed` stands for the first file a loaded skill listed to the model.
  const listed = JSON.stringify(request.messages).match(/<file>(.+?)<\/file>/)?.[1]
  const input = JSON.parse(JSON.stringify(step.input ?? {}).replaceAll('"@listed"', JSON.stringify(listed ?? "")))
  return TestLLM.toolCall(`call_${crypto.randomUUID()}`, step.tool, input)
}

// The failed calls' results, as the model read them in a request (`toSessionError`).
function told(request: LLMRequest | undefined) {
  return (request?.messages ?? [])
    .flatMap((message) => (message.role === "tool" ? message.content : []))
    .flatMap((part) =>
      part.type === "tool-result" && part.result.type === "error" ? [failure(part.result.value).error.message] : [],
    )
}

const failure = Schema.decodeUnknownSync(Schema.Struct({ error: Schema.Struct({ message: Schema.String }) }))

function text(message: LLMRequest["messages"][number]) {
  return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
}

function header(request: LLMRequest) {
  return request.headers?.["x-opencode-session-id"]
}

function names(request: LLMRequest | undefined) {
  return (request?.tools ?? []).map((tool) => tool.name)
}

function until<A, E, R>(read: () => Effect.Effect<A | undefined, E, R>, timeout = 20_000) {
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
