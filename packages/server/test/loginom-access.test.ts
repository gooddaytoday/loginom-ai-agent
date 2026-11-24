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
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Schema, type Scope, Stream } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { Dashboard } from "../../loginom-agent/src/dashboard"
import { ServiceHost } from "../../loginom-agent/src/host"
import { temporaryData } from "../../loginom-agent/test/fixture/temporary-data"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { createEmbeddedRoutes } from "../src/routes"
import { scriptedHost } from "./fixture/loginom-dock-host"
import { pluginsLoaded } from "./fixture/routes"

// Loginom access grants and the tool gate of the built-in product plugin `loginom.product` (guarantee G1, stage B2.2),
// on a real server with a scripted model. The spike S1 paths: a direct call, a call from CodeMode `execute`, a subsession,
// a scheduled wake and the granted control. Loginom tools arrive in B2.5, so a harness plugin registers stand-ins with
// the same names and rules, plus a Hub skill. The bundled product skills come from a verified resource catalog, as in an
// installation (B2.4); its verifier needs `npm ci` in `packages/loginom-runtime/client`. A user message carries its
// script as `SCRIPT<json>SCRIPT`: one entry per step (model call).

// A `gated` tool call streams only after the test opens the gate; its step keeps the tools it was offered.
type Step = { tool: string; input?: unknown; gated?: boolean } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
const probe = "loginom_probe"
// Each test boots a server Location and runs several scripted sessions, and the schedule cases wait out the scheduler's
// real one-second wake: about 1–2 s each locally, too close to the server package's 5 s default on a loaded runner.
const timeout = 30_000
const denied = "LOGINOM_SCOPE_DENIED"
const bundled = ["loginom-automation", "package-docs", "loginom-dashboard"]

type PluginContext = Parameters<Parameters<typeof define>[0]["effect"]>[0]

// The bundled catalog under `LOGINOM_AI_AGENT_RESOURCES`: verified, damaged after its manifest was written, or not set.
type Catalog = "verified" | "damaged" | "missing"
// `sources` turns on OpenCode's project and `.claude` skill roots. `files`, relative to the project directory, are
// written before the server starts; the profile lives under `global/config` there and the home directory under `home`.
// `config` is the project config. `dashboard` puts the Location in a dashboard's work folder under the server's data
// root (B2.9b) instead of the project directory; `host` is a scripted Host the server starts first (B2.3).
type Options = {
  catalog?: Catalog
  sources?: boolean
  files?: Record<string, string>
  config?: Record<string, unknown>
  dashboard?: boolean
  host?: ReturnType<typeof scriptedHost>
}

const boot = (
  extra: (ctx: PluginContext) => Effect.Effect<void, never, Scope.Scope> = () => Effect.void,
  options: Options = {},
) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-access-")).path
    // The product plugin's own data directory (dashboards, file profiles) is the case's, not the runner's.
    yield* Effect.acquireRelease(
      Effect.promise(() => temporaryData()),
      (data) => Effect.promise(() => data[Symbol.asyncDispose]()),
    )
    const directory = options.dashboard ? yield* dashboardWork : dir
    const location = Location.Ref.make({ directory: AbsolutePath.make(directory) })
    const resources = path.join(dir, "resources")
    const global = path.join(dir, "global")
    yield* Effect.promise(async () => {
      const files = {
        ...Object.fromEntries(
          bundled.map((name) => [
            `resources/skills/${name}/SKILL.md`,
            `---\nname: ${name}\ndescription: Bundled ${name}.\n---\n\nBUNDLED ${name}\n`,
          ]),
        ),
        // The Hub stand-in the harness plugin registers below.
        "hub/loginom-automation/SKILL.md": "---\nname: Loginom automation from Hub\ndescription: Hub\n---\n\nHub\n",
        ...options.files,
      }
      for (const [file, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true })
        await fs.writeFile(path.join(dir, file), text)
      }
      await Bun.write(
        path.join(resources, "resource-manifest.json"),
        JSON.stringify({ protocol: 1, files: await resourceInventory(resources) }),
      )
      if (options.catalog === "damaged")
        await fs.appendFile(path.join(resources, "skills/loginom-automation/SKILL.md"), "\nTAMPERED\n")
    })
    // The product plugin reads the catalog root when the Location activates, as the service does in an installation.
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const previous = process.env.LOGINOM_AI_AGENT_RESOURCES
        if (options.catalog === "missing") delete process.env.LOGINOM_AI_AGENT_RESOURCES
        else process.env.LOGINOM_AI_AGENT_RESOURCES = resources
        return previous
      }),
      (previous) =>
        Effect.sync(() => {
          if (previous === undefined) delete process.env.LOGINOM_AI_AGENT_RESOURCES
          else process.env.LOGINOM_AI_AGENT_RESOURCES = previous
        }),
    )
    const host = options.host
    if (host)
      yield* Effect.acquireRelease(
        Effect.promise(() => ServiceHost.start({ data: path.join(dir, "data"), connect: host.connect })),
        () => Effect.promise(() => ServiceHost.close()),
      )
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
          config: {
            ...(options.sources ? {} : { project: false, claude: false }),
            ...(options.config ? { content: JSON.stringify(options.config) } : {}),
          },
          models: { fetch: false, snapshot: false },
          fs: { filewatcher: false, fff: false },
        },
        [
          // Home and profile live in the test directory, so the machine's own `~/.agents` and `~/.claude` stay out.
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
          // A Hub skill under its own ID; a product name itself belongs to the bundled catalog (G6).
          yield* ctx.skill.transform((editor) => {
            editor.add(
              Skill.Info.make({
                id: Skill.ID.make("hub.loginom-automation"),
                name: Skill.Name.make("Loginom automation from Hub"),
                description: "Loginom automation from Hub",
                path: AbsolutePath.make(path.join(dir, "hub/loginom-automation/SKILL.md")),
                content: "Hub",
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
        const route = `/api/rpc/loginom.runner/start?location[directory]=${encodeURIComponent(directory)}`
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
    // The skill catalog over HTTP, once the Location's plugins have loaded (the server does not wait for them).
    const skills = pluginsLoaded(context, directory).pipe(
      Effect.andThen(
        Effect.promise(() =>
          handler(new Request(`http://opencode.local/api/skill?location[directory]=${encodeURIComponent(directory)}`)),
        ),
      ),
      Effect.flatMap((response) => Effect.promise(() => response.json())),
      Effect.map((body) => Schema.decodeUnknownSync(Schema.Struct({ data: Schema.Array(Skill.Info) }))(body).data),
    )
    return { sessions, create, prompt, wizard, post, skills, requests, ran, answered, prompts, held, gate, resources }
  })

// A dashboard's folder with its `work` folder, under the root the product plugin reads: the case's temporary data
// directory (`boot`). Removed after the case.
const dashboardWork = Effect.acquireRelease(
  Effect.promise(async () => {
    await fs.mkdir(Dashboard.root(), { recursive: true })
    const folder = await fs.mkdtemp(path.join(Dashboard.root(), "access-"))
    await fs.mkdir(path.join(folder, "work"))
    return folder
  }),
  (folder) => Effect.promise(() => fs.rm(folder, { recursive: true, force: true })),
).pipe(Effect.map((folder) => path.join(folder, "work")))

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
        // The terminal is off by default (B2.6a), so `shell` is not offered.
        expect(names(first)).toEqual(expect.arrayContaining(["read", "subagent", "skill"]))
        // The CodeMode catalog in the instructions never names a tool that needs a grant (spike S1 finding).
        expect(system(first)).not.toContain("loginom_probe")
        expect(JSON.stringify(second.messages)).toContain(denied)
        expect(test.ran(direct)).toBe(0)
        // A side question (`session.generate`, `/btw`) offers the session's tools too; the same filter applies.
        yield* test.sessions.generate({ sessionID: direct, prompt: "summary" })
        const asked = yield* test.requests(direct)
        expect(asked).toHaveLength(3)
        expect(names(asked[2])).not.toContain(probe)
        // So does a manual compaction.
        yield* test.sessions.compact({ sessionID: direct })
        yield* test.sessions.wait(direct)
        const compacted = (yield* test.requests(direct)).slice(3)
        expect(compacted.length).toBeGreaterThan(0)
        for (const request of compacted) expect(names(request)).not.toContain(probe)

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

        // A Hub skill grants nothing, attached by the user or loaded by the agent.
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
              [
                "read",
                "glob",
                "grep",
                "edit",
                "write",
                "patch",
                "todowrite",
                "question",
                "skill",
                "package_docs_run",
              ].includes(name),
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

// The dashboard profile (G1, B2.9b): 0.4 `turn-lifecycle.test.ts` «a dashboard run never acquires a connected Loginom
// Host…», the two dashboard cases of `session/profile-tools.test.ts`, «the first dashboard prompt advertises only dashboard
// builtins» and «a dashboard directory rejects a persisted subtask…» of `session/prompt.test.ts`
// (`v0.4.0:packages/opencode/test`). The Location's folder is a dashboard's `work` folder; the dashboard tools themselves
// arrive in B2.9e…g. The project config turns the terminal on and names an MCP server with instructions, so that what the
// session does not get is there to get: an ordinary Location of the same config is the control.
const dashboardTools = ["read", "glob", "grep", "edit", "write", "patch", "skill"]
const guide = "Use lookup before mutate."
const dashboardOptions = (dashboard: boolean, host?: ReturnType<typeof scriptedHost>): Options => ({
  dashboard,
  host,
  config: {
    permissions: [{ action: "shell", resource: "*", effect: "allow" }],
    mcp: {
      servers: {
        guide: { type: "local", command: [process.execPath, path.join(import.meta.dir, "fixture", "mcp-guide.cjs")] },
      },
    },
  },
})

describe("loginom.product dashboard profile (G1, B2.9b)", () => {
  it.live(
    "a dashboard Location offers only its tools before any grant, leases no Host, sees no MCP server; skills, attachments and the wizard keep its base",
    () =>
      Effect.gen(function* () {
        const host = scriptedHost()
        const test = yield* boot(undefined, dashboardOptions(true, host))
        const plain = yield* test.create("dashboard")
        yield* test.prompt(
          plain,
          script(
            { tool: "subagent", input: { agent: "general", description: "child", prompt: script({ text: "x" }) } },
            { tool: probe },
            { tool: "skill", input: { id: "loginom-automation" } },
            { tool: probe },
            { text: "end" },
          ),
        )
        const seen = yield* test.requests(plain)
        expect(seen).toHaveLength(5)
        for (const request of seen) {
          expect(names(request).every((name) => dashboardTools.includes(name))).toBe(true)
          // OpenCode offers `patch` instead of `edit` and `write` to some models only, as 0.4 `apply_patch`.
          expect(names(request)).toEqual(expect.arrayContaining(["read", "glob", "grep", "skill", "edit", "write"]))
          // No Loginom hint and no MCP instructions either.
          expect(system(request)).not.toContain("Loginom is available")
          expect(JSON.stringify(request)).not.toContain(guide)
        }
        // The calls the model makes anyway are refused: a subagent, a Loginom tool before and after the skill that grants
        // it elsewhere. The terminal is not called: even on, it asks before every command (B2.6a), and nobody answers.
        expect(JSON.stringify(seen.at(-1)?.messages).split(denied).length - 1).toBe(3)
        expect((yield* test.sessions.list({ parentID: plain })).data).toEqual([])

        // The user attaches the skill; the wizard grants its profile.
        const attached = yield* test.create("attached")
        yield* test.prompt(attached, script({ tool: probe }, { text: "end" }), ["loginom-automation"])
        const wizard = yield* test.create("wizard")
        expect(yield* test.wizard(wizard, "loginom-automation", script({ tool: probe }, { text: "end" }))).toEqual({
          output: { granted: true },
        })
        for (const session of [attached, wizard])
          for (const request of yield* test.requests(session))
            expect(names(request).every((name) => dashboardTools.includes(name))).toBe(true)
        for (const session of [plain, attached, wizard]) expect(test.ran(session)).toBe(0)
        // Not one request reached the Host.
        expect(host.log).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "control: an ordinary Location of the same config leases the Host and offers the terminal, subagents and the MCP server",
    () =>
      Effect.gen(function* () {
        const host = scriptedHost()
        const test = yield* boot(undefined, dashboardOptions(false, host))
        const session = yield* test.create("ordinary")
        yield* test.prompt(session, script({ text: "end" }))
        const [first] = yield* test.requests(session)
        expect(names(first)).toEqual(expect.arrayContaining(["shell", "subagent", "read"]))
        expect(system(first)).toContain("Loginom is available")
        expect(JSON.stringify(first)).toContain(guide)
        expect(host.requests("acquire")).toHaveLength(1)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a dashboard Location refuses an attached agent before the model; its subsessions and forks keep the profile",
    () =>
      Effect.gen(function* () {
        const test = yield* boot(undefined, dashboardOptions(true))
        const parent = yield* test.create("parent")
        const exit = yield* test.sessions
          .prompt({ sessionID: parent, text: script({ text: "end" }), agents: [{ name: "general" }] })
          .pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(String(Cause.squash(exit.cause))).toContain(denied)
        expect(yield* test.sessions.messages({ sessionID: parent })).toEqual([])
        expect(yield* test.requests(parent)).toEqual([])
        expect((yield* test.sessions.list({ parentID: parent })).data).toEqual([])

        // A subsession (a subagent command creates one without the `subagent` tool) and a fork live in the same
        // Location, so its profile holds there too.
        yield* test.prompt(parent, script({ text: "parent end" }))
        const child = yield* test.sessions.create({ parentID: parent, title: "child" })
        const fork = yield* test.sessions.fork({ sessionID: parent })
        for (const session of [child.id, fork.id]) {
          yield* test.prompt(session, script({ tool: probe }, { text: "end" }))
          const seen = yield* test.requests(session)
          expect(seen).toHaveLength(2)
          for (const request of seen) expect(names(request).every((name) => dashboardTools.includes(name))).toBe(true)
          expect(JSON.stringify(seen.at(-1)?.messages)).toContain(denied)
          expect(test.ran(session)).toBe(0)
        }
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

// Skill sources of `loginom.product` (guarantee G6, stage B2.4) and seam U3, the spike S3 cases. As in 0.4, every
// OpenCode source keeps its ordinary skills; a product ID or name comes only from the bundled catalog. Each root holds an
// impostor of every product name (and the obsolete `package_docs`), a lookalike that only takes the name, and one
// ordinary skill.
const roots = {
  "home/.agents/skills": "home-agents",
  "home/.claude/skills": "home-claude",
  ".agents/skills": "project-agents",
  ".claude/skills": "project-claude",
  // The project config directory, named after the product in the fork.
  ".loginom-ai-agent/skills": "project-config",
  // The user's own skills in the profile.
  "global/config/skills": "profile",
  // `skills[]` of the project config.
  configured: "configured",
}
const impostors = [...bundled, "package_docs"]
const skillFile = (name: string, text: string) => `---\nname: ${name}\ndescription: ${text}\n---\n\n${text}\n`
const sources = Object.fromEntries([
  ...Object.entries(roots).flatMap(([root, tag]) => [
    ...impostors.map((name) => [`${root}/${name}/SKILL.md`, skillFile(name, `IMPOSTOR ${tag}`)]),
    [`${root}/${tag}-lookalike/SKILL.md`, skillFile("loginom-automation", `IMPOSTOR ${tag}`)],
    [`${root}/${tag}-skill/SKILL.md`, skillFile(`${tag}-skill`, `Ordinary ${tag}`)],
  ]),
  ["loginom-ai-agent.json", JSON.stringify({ skills: ["configured"] })],
])
const product = (skill: Skill.Info) => impostors.includes(skill.id) || impostors.includes(skill.name)

describe("loginom.product skill sources (G6) and direct skill activation (U3)", () => {
  it.live(
    "S3: only the bundled catalog supplies product skills, in the list, the system prompt and the grant; ordinary skills stay",
    () =>
      Effect.gen(function* () {
        const test = yield* boot(undefined, { sources: true, files: sources })
        const listed = yield* test.skills
        expect(listed.filter(product).map((skill) => [skill.id, skill.name, skill.path])).toEqual(
          expect.arrayContaining(
            bundled.map((name) => [name, name, path.join(test.resources, "skills", name, "SKILL.md")]),
          ),
        )
        expect(listed.filter(product)).toHaveLength(bundled.length)
        expect(JSON.stringify(listed)).not.toContain("IMPOSTOR")
        expect(listed.map((skill) => skill.id).filter((id) => id.endsWith("-skill"))).toEqual(
          expect.arrayContaining(Object.values(roots).map((tag) => `${tag}-skill`)),
        )

        // The model sees the same catalog, and the agent's load of the bundled skill grants access (decision 11).
        const session = yield* test.create("sources")
        yield* test.prompt(
          session,
          script({ tool: "skill", input: { id: "loginom-automation" } }, { tool: probe }, { text: "end" }),
        )
        const [first, second] = yield* test.requests(session)
        for (const id of [...bundled, ...Object.values(roots).map((tag) => `${tag}-skill`)])
          expect(system(first)).toContain(`<id>${id}</id>`)
        expect(system(first)).not.toContain("IMPOSTOR")
        expect(JSON.stringify(second.messages)).toContain("BUNDLED loginom-automation")
        expect(JSON.stringify(second.messages)).not.toContain("IMPOSTOR")
        expect(names(second)).toContain(probe)
        expect(test.ran(session)).toBe(1)

        // U3: while the grant holds, a direct activation through the API obeys the session's `skill` rules. A denied
        // skill is 403, a skill the product dropped is 404, an allowed ordinary skill still activates (В-41).
        yield* test.sessions.setPermissions({
          sessionID: session,
          permissions: [{ action: "skill", resource: "home-agents-skill", effect: "deny" }],
        })
        const activate = (id: string) =>
          test
            .post(`/api/experimental/session/${session}/skill`, { id, resume: false })
            .pipe(
              Effect.flatMap((response) =>
                Effect.promise(() => response.text()).pipe(Effect.map((body) => ({ status: response.status, body }))),
              ),
            )
        const forbidden = yield* activate("home-agents-skill")
        expect(forbidden.status).toBe(403)
        expect(JSON.parse(forbidden.body)).toMatchObject({ _tag: "ForbiddenError" })
        for (const id of ["package_docs", "home-agents-lookalike"]) {
          const missing = yield* activate(id)
          expect(missing.status).toBe(404)
          expect(JSON.parse(missing.body)).toMatchObject({ _tag: "SkillNotFoundError", skill: id })
        }
        expect((yield* activate("project-agents-skill")).status).toBe(204)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "an impostor loginom-automation grants nothing when the bundled catalog is damaged or missing",
    () =>
      Effect.gen(function* () {
        for (const catalog of ["damaged", "missing"] as const) {
          const test = yield* boot(undefined, { catalog, sources: true, files: sources })
          const listed = yield* test.skills
          expect(listed.filter(product)).toEqual([])
          expect(listed.map((skill) => skill.id)).toContain(Skill.ID.make("home-agents-skill"))
          // The agent cannot load it, the user cannot attach it, and the API cannot activate it.
          const agent = yield* test.create("agent")
          yield* test.prompt(
            agent,
            script({ tool: "skill", input: { id: "loginom-automation" } }, { tool: probe }, { text: "end" }),
          )
          const [, second] = yield* test.requests(agent)
          expect(names(second)).not.toContain(probe)
          expect(JSON.stringify(second.messages)).not.toContain("IMPOSTOR")
          expect(test.ran(agent)).toBe(0)
          expect(
            yield* test
              .prompt(agent, script({ tool: probe }, { text: "end" }), ["loginom-automation"])
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "Session.SkillNotFoundError" })
          expect(
            (yield* test.post(`/api/experimental/session/${agent}/skill`, { id: "loginom-automation", resume: false }))
              .status,
          ).toBe(404)
        }
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
