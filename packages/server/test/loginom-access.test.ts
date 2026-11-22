import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Flag } from "@opencode/core/flag"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { Schedule } from "@opencode/core/schedule"
import { Session } from "@opencode/core/session"
import { Tool } from "@opencode/core/tool"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { define } from "@opencode/plugin/effect/plugin"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Skill } from "@opencode/schema/skill"
import { Global } from "@opencode/util/global"
import { Context, Deferred, Effect, Fiber, Layer, Schema, type Scope, Stream } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tempGlobalLayer } from "../../core/test/fixture/global"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { createEmbeddedRoutes } from "../src/routes"

// Loginom access grants and the tool gate of the built-in product plugin `loginom.product` (guarantee G1, stage B2.2),
// on a real server with a scripted model. The spike S1 paths: a direct call, a call from CodeMode `execute`, a subsession,
// a scheduled wake and the granted control. Loginom tools arrive in B2.5, so a harness plugin registers stand-ins with
// the same names and rules, plus the bundled product skills (B2.4) and a Hub skill. A user message carries its script
// as `SCRIPT<json>SCRIPT`: one entry per step (model call).

// A `gated` tool call streams only after the test opens the gate; its step keeps the tools it was offered.
type Step = { tool: string; input?: unknown; gated?: boolean } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
const probe = "loginom_probe"
// Each test boots a server Location and runs several scripted sessions, and the schedule cases wait out the scheduler's
// real one-second wake: about 1–2 s each locally, too close to the server package's 5 s default on a loaded runner.
const timeout = 30_000
const denied = "LOGINOM_SCOPE_DENIED"

type PluginContext = Parameters<Parameters<typeof define>[0]["effect"]>[0]

const boot = (extra: (ctx: PluginContext) => Effect.Effect<void, never, Scope.Scope> = () => Effect.void) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-access-")).path
    const location = Location.Ref.make({ directory: AbsolutePath.make(dir) })
    const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    // Text answers the scripted model gave, as `<session> <text>`.
    const answered: string[] = []
    const gate = yield* Deferred.make<void>()
    yield* llm.serve((request) => respond(request, answered, gate))
    const model = SessionRunnerModel.resolved(
      LanguageModel.make({ id: "loginom-access-model", provider: "test", route: OpenAIChat.route }),
      {
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 8_192 },
      },
    )
    const context = yield* Layer.build(
      createEmbeddedRoutes(
        {
          // Schedules are on by default in the dev channel.
          app: { channel: "dev", version: "test" },
          database: { path: ":memory:" },
          config: { project: false, claude: false },
          models: { fetch: false, snapshot: false },
          fs: { filewatcher: false, fff: false },
        },
        [
          Global.node.replace(tempGlobalLayer),
          llmClient.replace(Layer.succeed(LLMClient.Service, llm)),
          SessionRunnerModel.node.replace(
            Layer.succeed(SessionRunnerModel.Service, { resolve: () => Effect.succeed(model) }),
          ),
        ],
      ).pipe(Layer.provide(HttpServer.layerServices)),
    )
    const skills = path.join(dir, ".skills")
    yield* Effect.promise(() =>
      Promise.all(
        ["loginom-automation", "package-docs", "hub-loginom-automation"].map(async (name) => {
          await fs.mkdir(path.join(skills, name), { recursive: true })
          await fs.writeFile(
            path.join(skills, name, "SKILL.md"),
            `---\nname: ${name}\ndescription: ${name}\n---\n${name}\n`,
          )
        }),
      ),
    )
    const calls: string[] = []
    const prompts: { sessionID: string; skills: string[]; metadata?: Record<string, unknown> }[] = []
    const held = yield* Deferred.make<void>()
    yield* Context.get(context, SdkPlugins.Service).register(
      define({
        id: "test.loginom-access",
        effect: Effect.fnUntraced(function* (ctx) {
          yield* ctx.tool.transform((editor) => {
            // Same rule as the Loginom tools of B2.5; the second keeps CodeMode's default to show the product removes it.
            for (const name of [probe, "loginom_probe_codemode"])
              editor.add({
                name,
                description: `Stand-in Loginom tool ${name}`,
                input: Schema.Struct({}),
                output: Schema.String,
                ...(name === probe ? { options: { codemode: false } } : {}),
                execute: (_input, call) =>
                  Effect.sync(() => {
                    calls.push(`${call.sessionID} ${name}`)
                    return { output: "ran", content: "ran" }
                  }),
              })
            editor.add({
              name: "hold",
              description: "Wait until the test releases the call",
              input: Schema.Struct({}),
              output: Schema.String,
              options: { codemode: false },
              execute: () => Deferred.await(held).pipe(Effect.as({ output: "released", content: "released" })),
            })
          })
          // The bundled product skills of B2.4 and a Hub skill that reuses a product name under its own ID.
          yield* ctx.skill.transform((editor) => {
            for (const [id, name, folder] of [
              ["loginom-automation", "loginom-automation", "loginom-automation"],
              ["package-docs", "package-docs", "package-docs"],
              ["hub.loginom-automation", "loginom-automation", "hub-loginom-automation"],
            ])
              editor.add(
                Skill.Info.make({
                  id: Skill.ID.make(id),
                  name: Skill.Name.make(name),
                  description: name,
                  path: AbsolutePath.make(path.join(skills, folder, "SKILL.md")),
                  content: name,
                }),
              )
          })
          // Runs before the product's hook, so it sees each admitted prompt as the client sent it.
          yield* ctx.session.hook("prompt", (event) =>
            Effect.sync(() => {
              prompts.push({
                sessionID: event.sessionID,
                skills: (event.prompt.skills ?? []).map((skill) => skill.id),
                metadata: event.metadata,
              })
            }),
          )
          yield* extra(ctx)
        }),
      }),
    )
    // The server process runs the scheduler (`process.ts`); the embedded routes do not.
    yield* Effect.forkScoped(Context.get(context, Schedule.Service).run)
    const sessions = Context.get(context, Session.Service)
    const handler = Context.get(context, HttpRouter.HttpRouter)
      .asHttpEffect()
      .pipe(HttpEffect.toWebHandlerWith(context))
    const post = (route: string, body: unknown) =>
      Effect.promise(() =>
        handler(
          new Request(`http://opencode.local${route}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        ),
      )
    const create = (title: string) =>
      sessions
        .create({ title, agent: Agent.ID.make("build"), model: model.ref, location })
        .pipe(Effect.map((s) => s.id))
    const prompt = (sessionID: Session.ID, text: string, skills?: string[]) =>
      sessions
        .prompt({ sessionID, text, skills: skills?.map((id) => ({ id: Skill.ID.make(id) })) })
        .pipe(Effect.andThen(sessions.wait(sessionID)))
    // The wizard's RPC. Before a Location's first work its RPC routes are not registered yet (spike S7).
    const wizard = (sessionID: Session.ID, profile: string, text: string) =>
      Effect.gen(function* () {
        const route = `/api/rpc/loginom.runner/start?location[directory]=${encodeURIComponent(dir)}`
        const output = yield* until(() =>
          post(route, { input: { sessionID, profile, text } }).pipe(
            Effect.flatMap((response) =>
              Effect.promise(() => response.text()).pipe(
                Effect.map((body) =>
                  response.status === 200
                    ? JSON.parse(body)
                    : body.includes("rpc.unavailable")
                      ? undefined
                      : { status: response.status, body },
                ),
              ),
            ),
          ),
        )
        yield* sessions.wait(sessionID)
        return output
      })
    const requests = (sessionID: Session.ID) =>
      llm
        .requests()
        .pipe(Effect.map((all) => all.filter((request) => header(request) === sessionID && request.tools.length > 0)))
    const ran = (sessionID: Session.ID) => calls.filter((call) => call.startsWith(`${sessionID} `)).length
    return { sessions, create, prompt, wizard, post, requests, ran, answered, prompts, held, gate }
  })

describe("loginom.product access and tool gate (G1)", () => {
  it.live(
    "S1: without a grant a Loginom tool is hidden and rejected, directly, from CodeMode and with permissive session rules",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const direct = yield* test.create("direct")
        yield* test.prompt(direct, script({ tool: probe }, { text: "end" }))
        const [first, second] = yield* test.requests(direct)
        expect(names(first)).not.toContain(probe)
        expect(names(first)).not.toContain("loginom_probe_codemode")
        expect(names(first)).toEqual(expect.arrayContaining(["read", "shell", "subagent", "skill"]))
        // The CodeMode catalog in the instructions never names a tool that needs a grant (spike S1 finding).
        expect(system(first)).not.toContain("loginom_probe")
        expect(JSON.stringify(second.messages)).toContain(denied)
        expect(test.ran(direct)).toBe(0)

        const codemode = yield* test.create("codemode")
        yield* test.prompt(
          codemode,
          script(
            { tool: "execute", input: { code: "return await tools.loginom_probe_codemode({})" } },
            { text: "end" },
          ),
        )
        expect(names((yield* test.requests(codemode))[0])).toContain("execute")
        expect(test.ran(codemode)).toBe(0)

        // A client may set any session rules; they neither show nor run a tool that needs a grant. Denying `execute`
        // turns CodeMode tools into direct ones.
        for (const permissions of [
          [{ action: "*", resource: "*", effect: "allow" as const }],
          [
            { action: "*", resource: "*", effect: "allow" as const },
            { action: "execute", resource: "*", effect: "deny" as const },
          ],
        ]) {
          const ruled = yield* test.create("rules")
          yield* test.sessions.setPermissions({ sessionID: ruled, permissions })
          yield* test.prompt(ruled, script({ tool: probe }, { tool: "loginom_probe_codemode" }, { text: "end" }))
          const seen = yield* test.requests(ruled)
          for (const request of seen) {
            expect(names(request)).not.toContain(probe)
            expect(names(request)).not.toContain("loginom_probe_codemode")
          }
          expect(JSON.stringify(seen.at(-1)?.messages)).toContain(denied)
          expect(test.ran(ruled)).toBe(0)
        }
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the wizard, a user command and the agent itself grant access; Hub skills and package-docs do not",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        // Wizard: the RPC grants one prompt.
        const wizard = yield* test.create("wizard")
        expect(yield* test.wizard(wizard, "loginom-automation", script({ tool: probe }, { text: "end" }))).toEqual({
          output: { granted: true },
        })
        expect(names((yield* test.requests(wizard))[0])).toContain(probe)
        expect(test.ran(wizard)).toBe(1)
        // The next prompt is a new task without a grant.
        yield* test.prompt(wizard, script({ tool: probe }, { text: "end" }))
        expect(test.ran(wizard)).toBe(1)

        // User command: the bundled skill attached to the prompt.
        const command = yield* test.create("command")
        yield* test.prompt(command, script({ tool: probe }, { text: "end" }), ["loginom-automation"])
        expect(test.ran(command)).toBe(1)

        // The agent loads the bundled skill in an ordinary conversation (decision 11); the tool appears in the next step.
        const agent = yield* test.create("agent")
        yield* test.prompt(
          agent,
          script({ tool: "skill", input: { id: "loginom-automation" } }, { tool: probe }, { text: "end" }),
        )
        const [before, after] = yield* test.requests(agent)
        expect(names(before)).not.toContain(probe)
        expect(names(after)).toContain(probe)
        expect(test.ran(agent)).toBe(1)

        // A Hub skill with the product name grants nothing, attached by the user or loaded by the agent.
        const hub = yield* test.create("hub")
        yield* test.prompt(hub, script({ tool: probe }, { text: "end" }), ["hub.loginom-automation"])
        yield* test.prompt(
          hub,
          script({ tool: "skill", input: { id: "hub.loginom-automation" } }, { tool: probe }, { text: "end" }),
        )
        expect(test.ran(hub)).toBe(0)

        // package-docs shows its own tools only, and its task cannot widen to automation.
        const docs = yield* test.create("docs")
        yield* test.prompt(
          docs,
          script(
            { tool: "shell", input: { command: "true" } },
            { tool: "skill", input: { id: "loginom-automation" } },
            { tool: probe },
            { text: "end" },
          ),
          ["package-docs"],
        )
        const docsRequests = yield* test.requests(docs)
        for (const request of docsRequests)
          expect(
            names(request).every((name) =>
              ["read", "glob", "grep", "edit", "write", "patch", "todowrite", "question", "skill"].includes(name),
            ),
          ).toBe(true)
        expect(JSON.stringify(docsRequests[1]?.messages)).toContain(denied)
        expect(test.ran(docs)).toBe(0)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "S1: a subsession and a fork do not inherit a grant",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        // Automation cannot start subagents at all.
        const granted = yield* test.create("granted parent")
        yield* test.wizard(
          granted,
          "loginom-automation",
          script(
            { tool: "subagent", input: { agent: "general", description: "child", prompt: script({ text: "x" }) } },
            { text: "end" },
          ),
        )
        expect(names((yield* test.requests(granted))[0])).not.toContain("subagent")
        expect(JSON.stringify((yield* test.requests(granted))[1]?.messages)).toContain(denied)

        // A child started before the parent's grant runs without it.
        const parent = yield* test.create("parent")
        yield* test.prompt(
          parent,
          script(
            {
              tool: "subagent",
              input: { agent: "general", description: "child", prompt: script({ text: "child ready" }) },
            },
            { text: "end" },
          ),
        )
        const children = (yield* test.sessions.list({ parentID: parent })).data
        expect(children).toHaveLength(1)
        const child = children[0].id
        yield* test.wizard(parent, "loginom-automation", script({ tool: probe }, { text: "end" }))
        expect(test.ran(parent)).toBe(1)
        yield* test.prompt(child, script({ tool: probe }, { text: "end" }))
        expect(test.ran(child)).toBe(0)

        // A fork of a granted session runs without the grant. A synthetic message wakes it without a prompt, and the
        // same kind of message keeps the parent's grant: it is not a new task.
        const original = yield* test.create("original")
        yield* test.wizard(original, "loginom-automation", script({ tool: probe }, { text: "end" }))
        const fork = yield* test.sessions.fork({ sessionID: original })
        yield* test.sessions.synthetic({ sessionID: fork.id, text: script({ tool: probe }, { text: "end" }) })
        yield* until(() => Effect.succeed(test.answered.includes(`${fork.id} end`) ? true : undefined))
        yield* test.sessions.wait(fork.id)
        expect(test.ran(fork.id)).toBe(0)
        yield* test.sessions.synthetic({
          sessionID: original,
          text: script({ tool: probe }, { text: "synthetic end" }),
        })
        yield* until(() => Effect.succeed(test.answered.includes(`${original} synthetic end`) ? true : undefined))
        yield* test.sessions.wait(original)
        expect(test.ran(original)).toBe(2)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "S1: a scheduled wake runs without the grant, after the granted execution and while it still runs",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const schedule = (sessionID: Session.ID, text: string) =>
          test
            .post("/api/experimental/schedule", { sessionID, when: { in: "1 second" }, prompt: text })
            .pipe(Effect.tap((response) => Effect.sync(() => expect(response.status).toBe(200))))
        const woke = (sessionID: Session.ID) =>
          until(() => Effect.succeed(test.answered.includes(`${sessionID} wake end`) ? true : undefined))
        // After: the granted execution has ended when the wake arrives.
        const after = yield* test.create("after")
        yield* test.wizard(after, "loginom-automation", script({ tool: probe }, { text: "end" }))
        expect(test.ran(after)).toBe(1)
        yield* schedule(after, script({ tool: probe }, { text: "wake end" }))
        yield* woke(after)
        yield* test.sessions.wait(after)
        expect(test.ran(after)).toBe(1)

        // During: the wake joins the granted execution as a steer prompt.
        const during = yield* test.create("during")
        const run = yield* test
          .wizard(during, "loginom-automation", script({ tool: probe }, { tool: "hold" }, { text: "granted end" }))
          .pipe(Effect.forkScoped)
        yield* until(() => test.requests(during).pipe(Effect.map((all) => (all.length >= 2 ? true : undefined))))
        expect(test.ran(during)).toBe(1)
        yield* schedule(during, script({ tool: probe }, { text: "wake end" }))
        // The wake is admitted while `hold` still runs; it is delivered at the next step boundary of the same execution.
        yield* until(() =>
          Effect.succeed(
            test.prompts.some((item) => item.sessionID === during && item.metadata?.schedule) ? true : undefined,
          ),
        )
        yield* Deferred.succeed(test.held, undefined)
        yield* woke(during)
        yield* test.sessions.wait(during)
        yield* Fiber.join(run)
        expect(test.ran(during)).toBe(1)
        // The wake took the next step of the same execution: the granted script never reached its last entry.
        expect(test.answered).not.toContain(`${during} granted end`)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
  it.live(
    "a prompt admitted during a granted step revokes the grant for the calls that step still makes",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const session = yield* test.create("in flight")
        const run = yield* test
          .wizard(session, "loginom-automation", script({ tool: probe, gated: true }, { text: "granted end" }))
          .pipe(Effect.forkScoped)
        const [first] = yield* until(() =>
          test.requests(session).pipe(Effect.map((all) => (all.length > 0 ? all : undefined))),
        )
        // The step's tools were chosen with the grant; only `execute.before` stands between the call and the tool.
        expect(names(first)).toContain(probe)
        yield* test.sessions.prompt({ sessionID: session, text: script({ text: "steer end" }) })
        yield* Deferred.succeed(test.gate, undefined)
        yield* Fiber.join(run)
        yield* until(() => Effect.succeed(test.answered.includes(`${session} steer end`) ? true : undefined))
        yield* test.sessions.wait(session)
        expect(test.ran(session)).toBe(0)
        expect(JSON.stringify((yield* test.requests(session))[1]?.messages)).toContain(denied)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

// The hooks the gate relies on, checked without the product's policy: `context` over `tools` (experimental per plan B,
// section B2), `execute.before` on a call nested in CodeMode, `prompt`, `fork` and `execute.after` of `skill`. A probe
// plugin registers them; the product plugin stays loaded but permits these tool names.
describe("OpenCode hooks the product gate relies on (contract)", () => {
  it.live(
    "context removes a tool from the request and its call; execute.before rejects a nested CodeMode call",
    () =>
      Effect.gen(function* () {
        const ran: string[] = []
        const before: string[] = []
        const test = yield* boot((ctx) =>
          Effect.gen(function* () {
            yield* ctx.tool.transform((editor) => {
              for (const [name, codemode] of [
                ["contract_hidden", false],
                ["contract_rejected", true],
                ["contract_allowed", true],
              ] as const)
                editor.add({
                  name,
                  description: name,
                  input: Schema.Struct({}),
                  output: Schema.String,
                  ...(codemode ? {} : { options: { codemode: false } }),
                  execute: () => Effect.sync(() => (ran.push(name), { output: name, content: name })),
                })
            })
            yield* ctx.session.hook("context", (event) => Effect.sync(() => void delete event.tools.contract_hidden))
            yield* ctx.tool.hook("execute.before", (event) =>
              Effect.suspend(() => {
                before.push(event.tool)
                if (event.tool !== "contract_rejected") return Effect.void
                return Effect.fail(new Tool.Error({ message: "contract rejection" }))
              }),
            )
          }),
        )
        const hidden = yield* test.create("hidden")
        yield* test.prompt(hidden, script({ tool: "contract_hidden" }, { text: "end" }))
        const [first, second] = yield* test.requests(hidden)
        expect(names(first)).not.toContain("contract_hidden")
        expect(JSON.stringify(second.messages)).toContain("Tool is not available for this request: contract_hidden")

        const nested = yield* test.create("nested")
        yield* test.prompt(
          nested,
          script(
            {
              tool: "execute",
              input: { code: "await tools.contract_allowed({}); return await tools.contract_rejected({})" },
            },
            { text: "end" },
          ),
        )
        expect(before).toEqual(expect.arrayContaining(["execute", "contract_allowed", "contract_rejected"]))
        expect(JSON.stringify((yield* test.requests(nested)).at(-1)?.messages)).toContain("contract rejection")
        expect(ran).toEqual(["contract_allowed"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "prompt sees user prompts and scheduled wakes but no synthetic message; fork names the new session; skill reports its ID",
    () =>
      Effect.gen(function* () {
        const forks: string[] = []
        const skills: { input: unknown; status: string }[] = []
        const test = yield* boot((ctx) =>
          Effect.gen(function* () {
            yield* ctx.session.hook("fork", (event) => Effect.sync(() => void forks.push(event.sessionID)))
            yield* ctx.tool.hook("execute.after", (event) =>
              Effect.sync(() => {
                if (event.tool === "skill") skills.push({ input: event.input, status: event.status })
              }),
            )
          }),
        )
        const session = yield* test.create("contract")
        yield* test.prompt(session, script({ tool: "skill", input: { id: "package-docs" } }, { text: "end" }), [
          "loginom-automation",
        ])
        expect(test.prompts.filter((item) => item.sessionID === session).map((item) => item.skills)).toEqual([
          ["loginom-automation"],
        ])
        expect(skills).toEqual([{ input: { id: "package-docs" }, status: "completed" }])

        yield* test.sessions.synthetic({ sessionID: session, text: script({ text: "synthetic end" }) })
        yield* until(() => Effect.succeed(test.answered.includes(`${session} synthetic end`) ? true : undefined))
        expect(test.prompts.filter((item) => item.sessionID === session)).toHaveLength(1)

        const response = yield* test.post("/api/experimental/schedule", {
          sessionID: session,
          when: { in: "1 second" },
          prompt: script({ text: "wake end" }),
        })
        expect(response.status).toBe(200)
        yield* until(() => Effect.succeed(test.answered.includes(`${session} wake end`) ? true : undefined))
        expect(test.prompts.filter((item) => item.sessionID === session).at(-1)?.metadata?.schedule).toBeDefined()

        const fork = yield* test.sessions.fork({ sessionID: session })
        expect(forks).toEqual([fork.id])
        expect(fork.id).not.toBe(session)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

function respond(request: LLMRequest, answered: string[], gate: Deferred.Deferred<void>) {
  // Titles and other tool-less requests get plain text.
  const user = request.messages.findLastIndex((message) => message.role === "user" && text(message).includes("SCRIPT<"))
  if (user < 0 || request.tools.length === 0) return TestLLM.text("ok", "text_ok")
  const body = text(request.messages[user])
  const steps: Step[] = JSON.parse(body.slice(body.indexOf("SCRIPT<") + 7, body.lastIndexOf(">SCRIPT")))
  const step = steps[request.messages.slice(user + 1).filter((message) => message.role === "assistant").length]
  if (!step) return TestLLM.text("done", "text_done")
  if ("text" in step) {
    answered.push(`${header(request)} ${step.text}`)
    return TestLLM.text(step.text, `text_${crypto.randomUUID()}`)
  }
  const call = TestLLM.toolCall(`call_${crypto.randomUUID()}`, step.tool, step.input ?? {})
  if (!step.gated) return call
  return Stream.fromEffect(Deferred.await(gate)).pipe(Stream.flatMap(() => Stream.fromIterable(call)))
}

function text(message: LLMRequest["messages"][number]) {
  return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
}

function header(request: LLMRequest) {
  return request.headers?.["x-opencode-session-id"]
}

function names(request: LLMRequest | undefined) {
  return (request?.tools ?? []).map((tool) => tool.name)
}

function system(request: LLMRequest) {
  return request.system.map((part) => part.text).join("\n")
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
