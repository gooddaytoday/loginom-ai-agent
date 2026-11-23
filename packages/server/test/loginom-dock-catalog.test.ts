import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
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
import { Context, Deferred, Effect, Layer, Schema, type Scope } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServiceHost } from "../../loginom-agent/src/host"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { createEmbeddedRoutes } from "../src/routes"
import { dockTool, scriptedHost } from "./fixture/loginom-dock-host"

// The Dock catalog of the built-in product plugin `loginom.product` (B2.5d): 0.4 `toolContributor.contribute` and the
// task binding of 0.4 `session/tools.ts` on a real server with a scripted model. The Host is scripted
// (`fixture/loginom-dock-host.ts`) behind `ServiceHost.start({ connect })`, so the test sets the connection generation,
// the catalog and the call results; the plugin binds, leases and calls it as it would the Node host. The bundled product
// skills come from a verified resource catalog, as in B2.2. A user message carries its script as `SCRIPT<json>SCRIPT`:
// one entry per step (model call).

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// Each case boots a server Location and runs one or two scripted sessions, about 1 s locally.
const timeout = 30_000
const bundled = ["loginom-automation", "package-docs", "loginom-dashboard"]
const fileTools = ["loginom_file_admit", "loginom_file_profile", "loginom_file_sample", "loginom_file_scan"]

type PluginContext = Parameters<Parameters<typeof define>[0]["effect"]>[0]
type Host = ReturnType<typeof scriptedHost>

const boot = (host: Host, extra: (ctx: PluginContext) => Effect.Effect<void, never, Scope.Scope> = () => Effect.void) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-dock-")).path
    const data = path.join(dir, "data")
    const location = Location.Ref.make({ directory: AbsolutePath.make(dir) })
    const resources = path.join(dir, "resources")
    const global = path.join(dir, "global")
    yield* Effect.promise(async () => {
      for (const name of bundled) {
        await fs.mkdir(path.join(resources, "skills", name), { recursive: true })
        await fs.writeFile(
          path.join(resources, "skills", name, "SKILL.md"),
          `---\nname: ${name}\ndescription: Bundled ${name}.\n---\n\nBUNDLED ${name}\n`,
        )
      }
      await Bun.write(
        path.join(resources, "resource-manifest.json"),
        JSON.stringify({ protocol: 1, files: await resourceInventory(resources) }),
      )
    })
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const previous = process.env.LOGINOM_AI_AGENT_RESOURCES
        process.env.LOGINOM_AI_AGENT_RESOURCES = resources
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
      Effect.promise(() => ServiceHost.start({ data, connect: host.connect })),
      () => Effect.promise(() => ServiceHost.close()),
    )
    const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    yield* llm.serve(respond)
    const model = SessionRunnerModel.resolved(
      LanguageModel.make({ id: "loginom-dock-model", provider: "test", route: OpenAIChat.route }),
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
          config: { project: false, claude: false },
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
    const held = yield* Deferred.make<void>()
    const holding: string[] = []
    yield* Context.get(context, SdkPlugins.Service).register(
      define({
        id: "test.loginom-dock",
        effect: Effect.fnUntraced(function* (ctx) {
          yield* ctx.tool.transform((editor) => {
            editor.add({
              name: "hold",
              description: "Wait until the test releases the call",
              input: Schema.Struct({}),
              output: Schema.String,
              options: { codemode: false },
              execute: (_input, call) =>
                Effect.sync(() => holding.push(call.sessionID)).pipe(
                  Effect.andThen(Deferred.await(held)),
                  Effect.as({ output: "released", content: "released" }),
                ),
            })
          })
          yield* extra(ctx)
        }),
      }),
    )
    const sessions = Context.get(context, Session.Service)
    const handler = Context.get(context, HttpRouter.HttpRouter)
      .asHttpEffect()
      .pipe(HttpEffect.toWebHandlerWith(context))
    const create = (title: string) =>
      sessions.create({ title, agent: Agent.ID.make("build"), model: model.ref, location }).pipe(
        Effect.tap((session) =>
          sessions.setPermissions({
            sessionID: session.id,
            permissions: [{ action: "*", resource: "*", effect: "allow" }],
          }),
        ),
        Effect.map((session) => session.id),
      )
    const prompt = (sessionID: Session.ID, text: string, files?: { uri: string; name?: string }[]) =>
      sessions.prompt({ sessionID, text, files }).pipe(Effect.andThen(sessions.wait(sessionID)))
    // The wizard's RPC grants one prompt (B2.2). Before a Location's first work its RPC routes are not registered yet.
    const wizard = (sessionID: Session.ID, text: string, wait = true) =>
      until(() =>
        Effect.promise(() =>
          handler(
            new Request(
              `http://opencode.local/api/rpc/loginom.runner/start?location[directory]=${encodeURIComponent(dir)}`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ input: { sessionID, profile: "loginom-automation", text } }),
              },
            ),
          ),
        ).pipe(Effect.map((response) => (response.status === 200 ? true : undefined))),
      ).pipe(Effect.andThen(wait ? sessions.wait(sessionID) : Effect.void))
    const requests = (sessionID: Session.ID) =>
      llm
        .requests()
        .pipe(Effect.map((all) => all.filter((request) => header(request) === sessionID && request.tools.length > 0)))
    // The session's completed or failed tool calls in order (message IDs ascend with time), as its history keeps them.
    const calls = (sessionID: Session.ID) =>
      sessions
        .messages({ sessionID })
        .pipe(
          Effect.map((messages) =>
            messages
              .toSorted((a, b) => a.id.localeCompare(b.id))
              .flatMap((message) =>
                message.type === "assistant"
                  ? message.content.flatMap((part) =>
                      part.type === "tool" ? [{ ...part, messageID: message.id }] : [],
                    )
                  : [],
              ),
          ),
        )
    return {
      dir,
      sessions,
      create,
      prompt,
      wizard,
      requests,
      calls,
      holding,
      release: Deferred.succeed(held, undefined),
    }
  })

describe("loginom.product Dock catalog (B2.5d, 0.4 toolContributor)", () => {
  it.live(
    "the default profile receives only the read-only local tools; automation the whole catalog without the host token",
    () =>
      Effect.gen(function* () {
        const host = scriptedHost({
          catalog: () => ["find", "dock_prepare", "dock_run", "browser_take_screenshot"].map((name) => dockTool(name)),
        })
        const test = yield* boot(host)
        const ordinary = yield* test.create("default")
        yield* test.prompt(ordinary, script({ text: "end" }))
        const [plain] = yield* test.requests(ordinary)
        expect(loginom(plain)).toEqual(["loginom_find"])
        expect(system(plain)).toContain("Loginom is available through the bundled loginom_* tools.")

        const automation = yield* test.create("automation")
        yield* test.wizard(automation, script({ text: "end" }))
        const [granted] = yield* test.requests(automation)
        // A text-only model is not offered the screenshot (0.4), and no file tool without Dock actions.
        expect(loginom(granted)).toEqual(["loginom_dock_prepare", "loginom_dock_run", "loginom_find"])
        for (const tool of granted.tools.filter((item) => item.name.startsWith("loginom_"))) {
          const schema = ("inputSchema" in tool ? tool.inputSchema : {}) as { properties: object; required?: string[] }
          expect(Object.keys(schema.properties)).toEqual(
            tool.name === "loginom_dock_prepare" ? ["path", "local_package_path"] : ["path"],
          )
          expect(schema.required).toEqual(["path"])
        }
        // Each run was bound once, to its own task and profile, before its catalog was read.
        const users = yield* Effect.forEach([ordinary, automation], (id) =>
          test.sessions
            .messages({ sessionID: id })
            .pipe(Effect.map((all) => all.find((item) => item.type === "user")?.id)),
        )
        const scopes = host.requests("scope").map((input) => ({ mode: input.mode, scope: input.scope }))
        expect(scopes).toContainEqual({ mode: "bind", scope: { taskMessageID: users[0], profile: "default" } })
        expect(scopes).toContainEqual({
          mode: "bind",
          scope: { taskMessageID: users[1], profile: "loginom-automation" },
        })
        expect(scopes.every((item) => item.mode === "bind")).toBe(true)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a local file can be registered only by automation, and only when the catalog describes dock actions",
    () =>
      Effect.gen(function* () {
        const host = scriptedHost({
          catalog: () => ["find", "dock_action_describe"].map((name) => dockTool(name)),
        })
        const test = yield* boot(host)
        const automation = yield* test.create("automation")
        yield* test.wizard(automation, script({ text: "end" }))
        const [granted] = yield* test.requests(automation)
        expect(loginom(granted)).toEqual(["loginom_dock_action_describe", ...fileTools, "loginom_find"].toSorted())
        const ordinary = yield* test.create("default")
        yield* test.prompt(ordinary, script({ text: "end" }))
        const [plain] = yield* test.requests(ordinary)
        expect(loginom(plain)).toEqual(["loginom_find"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a new connection generation replaces the Dock tools, between executions and within one",
    () =>
      Effect.gen(function* () {
        const catalogs: Record<number, ReturnType<typeof dockTool>[]> = {
          1: [dockTool("find"), dockTool("dock_prepare"), dockTool("dock_run")],
          2: [dockTool("find"), dockTool("dock_prepare", "dock_prepare of generation 2"), dockTool("dock_inspect")],
          3: [dockTool("find"), dockTool("dock_prepare"), dockTool("dock_node_wait")],
        }
        const host = scriptedHost({
          catalog: (generation) => catalogs[generation],
          // The connection changes while the first call of the execution runs.
          call: (input) => {
            if (input.name === "dock_inspect") host.state.generation = 3
            return { content: [{ type: "text", text: "ok" }] }
          },
        })
        const test = yield* boot(host)
        const id = yield* test.create("generations")
        yield* test.wizard(id, script({ text: "end" }))
        const [first] = yield* test.requests(id)
        expect(loginom(first)).toEqual(["loginom_dock_prepare", "loginom_dock_run", "loginom_find"])

        host.state.generation = 2
        yield* test.wizard(id, script({ tool: "loginom_dock_inspect", input: { path: "x" } }, { text: "end" }))
        const [, second, third] = yield* test.requests(id)
        // The first step of the next execution already has generation 2; the old tool is gone, the changed one changed.
        expect(loginom(second)).toEqual(["loginom_dock_inspect", "loginom_dock_prepare", "loginom_find"])
        expect(second.tools.find((tool) => tool.name === "loginom_dock_prepare")?.description).toBe(
          "dock_prepare of generation 2",
        )
        // Generation 3 arrived during the call; the next step of the same execution offers it.
        expect(loginom(third)).toEqual(["loginom_dock_node_wait", "loginom_dock_prepare", "loginom_find"])
        expect(host.requests("call").map((input) => input.name)).toEqual(["dock_inspect"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a failed catalog request adds nothing and tells the model the failure; a refused lease too",
    () =>
      Effect.gen(function* () {
        const failure = { tools: undefined as string | undefined, acquire: undefined as string | undefined }
        const host = scriptedHost({
          catalog: () => [dockTool("find"), dockTool("dock_prepare")],
          tools: () => failure.tools,
          acquire: () => failure.acquire,
        })
        const test = yield* boot(host)
        // Another session's run already brought these tools into the Location's registry.
        const other = yield* test.create("registered")
        yield* test.wizard(other, script({ text: "end" }))
        expect(loginom((yield* test.requests(other))[0])).toEqual(["loginom_dock_prepare", "loginom_find"])

        failure.tools = "LOGINOM_KNOWLEDGE_UNAVAILABLE"
        const id = yield* test.create("failed catalog")
        yield* test.wizard(id, script({ text: "end" }))
        const [failed] = yield* test.requests(id)
        expect(loginom(failed)).toEqual([])
        expect(system(failed)).toContain(
          "Loginom tools are currently unavailable (catalog: LOGINOM_KNOWLEDGE_UNAVAILABLE)",
        )

        failure.tools = undefined
        failure.acquire = "LOGINOM_RECOVERY_REQUIRED"
        const refused = yield* test.create("refused lease")
        yield* test.wizard(refused, script({ text: "end" }))
        const [none] = yield* test.requests(refused)
        expect(loginom(none)).toEqual([])
        expect(system(none)).toContain("Loginom tools are currently unavailable (acquire: LOGINOM_RECOVERY_REQUIRED)")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a task that grants itself automation requests and applies it on the same run; a later task binds as default first",
    () =>
      Effect.gen(function* () {
        const host = scriptedHost({ catalog: () => [dockTool("find"), dockTool("dock_prepare")] })
        const test = yield* boot(host)
        const id = yield* test.create("self grant")
        yield* test.prompt(id, script({ tool: "skill", input: { id: "loginom-automation" } }, { text: "end" }))
        const [before, after] = yield* test.requests(id)
        expect(loginom(before)).toEqual(["loginom_find"])
        expect(loginom(after)).toEqual(["loginom_dock_prepare", "loginom_find"])
        const task = (yield* test.sessions.messages({ sessionID: id })).find((item) => item.type === "user")?.id
        expect(host.requests("scope").map((input) => [input.mode, input.scope])).toEqual([
          ["bind", { taskMessageID: task, profile: "default" }],
          ["request", { taskMessageID: task, profile: "loginom-automation" }],
          ["apply", { taskMessageID: task, profile: "loginom-automation" }],
        ])

        // The wizard's prompt steers into a running execution: the run serves the earlier task until the next step.
        const running = yield* test.create("steer")
        yield* test.prompt(running, script({ tool: "hold" }, { text: "end" })).pipe(Effect.forkScoped)
        yield* until(() => Effect.succeed(test.holding.includes(running) || undefined))
        const scoped = host.log.length
        yield* test.wizard(running, script({ text: "granted" }), false)
        yield* test.release
        yield* test.sessions.wait(running)
        // Message IDs ascend with time: the wizard's prompt is the latest.
        const wizard = (yield* test.sessions.messages({ sessionID: running }))
          .flatMap((item) => (item.type === "user" ? [item.id] : []))
          .toSorted()
          .at(-1)
        const rebound = host.log
          .slice(scoped)
          .flatMap((request) => (request.method === "scope" ? [[request.input.mode, request.input.scope]] : []))
        expect(rebound).toEqual([
          ["bind", { taskMessageID: wizard, profile: "default" }],
          ["request", { taskMessageID: wizard, profile: "loginom-automation" }],
          ["apply", { taskMessageID: wizard, profile: "loginom-automation" }],
        ])
        const last = (yield* test.requests(running)).at(-1)
        expect(loginom(last)).toEqual(["loginom_dock_prepare", "loginom_find"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

describe("loginom.product Dock calls (B2.5d, 0.4 toolContributor execute)", () => {
  it.live(
    "host outputFiles are private metadata while model-facing output stays byte-identical",
    () =>
      Effect.gen(function* () {
        const text =
          ' {"state":"settled","status":"SUCCEEDED","output":{"file_artifacts":[{"artifact_id":"csv-1","destination":"/server/result.csv"}]}}\n'
        const files = [{ artifact_id: "csv-1", path: "/runtime/result.csv", name: "result.csv" }]
        const host = scriptedHost({
          catalog: () => [dockTool("dock_node_wait")],
          call: (input) => ({
            content: [{ type: "text", text }],
            ...((input.args as { meta?: boolean }).meta ? { _meta: { outputFiles: files } } : {}),
          }),
        })
        const test = yield* boot(host)
        const id = yield* test.create("output files")
        yield* test.wizard(
          id,
          script(
            { tool: "loginom_dock_node_wait", input: { path: "a" } },
            { tool: "loginom_dock_node_wait", input: { path: "b", meta: true } },
            { text: "end" },
          ),
        )
        const [base, result] = yield* test.calls(id)
        if (base.state.status !== "completed" || result.state.status !== "completed") throw Error("calls failed")
        expect(base.state.metadata?.outputFiles).toBeUndefined()
        expect(result.state.metadata?.outputFiles).toEqual(files)
        expect(result.state.metadata?.generation).toBe(1)
        expect(result.state.content).toEqual([{ type: "text", text }])
        expect(JSON.stringify(result.state.content)).toBe(JSON.stringify(base.state.content))
        expect(JSON.stringify(result.state.content)).not.toContain("/runtime/")
        // The Host got the call with the token stripped from the schema, the task it is bound to and no attachments.
        const [call] = host.requests("call")
        const task = (yield* test.sessions.messages({ sessionID: id })).find((item) => item.type === "user")?.id
        expect(call).toMatchObject({ name: "dock_node_wait", args: { path: "a" }, userMessage: task, admissions: [] })
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a local package prepare snapshots bytes into its private input and strips the OS path; invalid combinations stop before the Host",
    () =>
      Effect.gen(function* () {
        const prepare = {
          name: "dock_prepare",
          description: "Prepare Dock",
          inputSchema: {
            type: "object",
            properties: {
              host_context_token: { type: "string" },
              intent: { type: "string" },
              package_path: { type: "string" },
              operation_id: { type: "string" },
            },
            required: ["host_context_token", "intent"],
          },
        }
        const host = scriptedHost({ catalog: () => [prepare] })
        const test = yield* boot(host)
        const bytes = Buffer.from("LGP package bytes")
        yield* Effect.promise(() => fs.writeFile(path.join(test.dir, "Демо.lgp"), bytes))
        yield* Effect.promise(() => fs.writeFile(path.join(test.dir, "data.csv"), "a\n1\n"))
        const id = yield* test.create("local package")
        yield* test.wizard(
          id,
          script(
            { tool: "loginom_dock_prepare", input: { intent: "open_package", local_package_path: "Демо.lgp" } },
            {
              tool: "loginom_dock_prepare",
              input: { intent: "open_package", local_package_path: "Демо.lgp", package_path: "/srv/x.lgp" },
            },
            { tool: "loginom_dock_prepare", input: { intent: "open_package", local_package_path: "data.csv" } },
            { text: "end" },
          ),
        )
        const [prepared, combined, other] = yield* test.calls(id)
        expect(prepared.state.status).toBe("completed")
        const calls = host.requests("call")
        expect(calls).toHaveLength(1)
        const args = calls[0].args as Record<string, unknown>
        const packageInput = calls[0].packageInput as { admissionID: string; file: unknown }
        expect(args.local_package_path).toBeUndefined()
        expect(args.intent).toBe("open_package")
        expect(typeof args.operation_id).toBe("string")
        expect(packageInput.file).toEqual({ name: "Демо.lgp", data: bytes.toString("base64") })
        expect(JSON.parse(packageInput.admissionID)).toEqual(["local-file", prepared.messageID, prepared.id])
        expect(JSON.stringify(calls[0])).not.toContain(test.dir)
        if (combined.state.status !== "error" || other.state.status !== "error") throw Error("expected failures")
        expect(combined.state.error.message).toContain("local_package_path requires open_package without package_path")
        expect(other.state.error.message).toContain("local_package_path requires a .lgp file")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a failed Dock receipt fails the call; an oversized one keeps its control summary; inline attachments are admitted",
    () =>
      Effect.gen(function* () {
        const large = {
          operation_id: "large-table",
          status: "SUCCEEDED",
          state: "settled",
          execution: { status: "completed", execution_id: "original-execution" },
          output: { rows: [["Данные".repeat(12000)]] },
        }
        const host = scriptedHost({
          catalog: () => [dockTool("find"), dockTool("dock_run"), dockTool("dock_table")],
          call: (input) =>
            input.name === "dock_run"
              ? { content: [{ type: "text", text: JSON.stringify({ operation_id: "op", status: "FAILED" }) }] }
              : input.name === "dock_table"
                ? { content: [{ type: "text", text: JSON.stringify(large) }] }
                : { content: [{ type: "text", text: "help" }] },
        })
        const test = yield* boot(host)
        const id = yield* test.create("replies")
        const inline = `data:text/csv;base64,${Buffer.from("a;b\n1;2\n").toString("base64")}`
        const file = path.join(test.dir, "disk.csv")
        yield* Effect.promise(() => fs.writeFile(file, "c\n3\n"))
        yield* test.prompt(id, script({ text: "attached" }), [
          { uri: inline, name: "pasted.csv" },
          { uri: pathToFileURL(file).href },
        ])
        yield* test.wizard(
          id,
          script(
            { tool: "loginom_dock_run", input: { path: "a" } },
            { tool: "loginom_dock_table", input: { path: "b" } },
            { tool: "loginom_find", input: { path: "c" } },
            { text: "end" },
          ),
        )
        const [failed, table] = yield* test.calls(id)
        if (failed.state.status !== "error") throw Error("expected a failed call")
        expect(failed.state.error.message).toContain('"status":"FAILED"')
        if (table.state.status !== "completed") throw Error("expected a completed call")
        const content = JSON.stringify(table.state.content)
        expect(content).toContain("omitted_by_backend_size_limit")
        expect(content).toContain("original-execution")
        expect(content).not.toContain("Данные")
        const retained = table.state.metadata?.outputPath
        if (typeof retained !== "string") throw Error("expected the retained output")
        expect(yield* Effect.promise(() => fs.readFile(retained, "utf8"))).toBe(JSON.stringify(large))
        expect(table.state.metadata?.truncated).toBe(true)
        // The pasted file reaches Dock calls as an admission of its message; the file on disk and help calls do not.
        const attached = (yield* test.sessions.messages({ sessionID: id })).find(
          (item) => item.type === "user" && item.files?.length,
        )?.id
        const [run, , help] = host.requests("call")
        expect(run.admissions).toEqual([
          {
            userMessage: attached,
            files: [{ name: "pasted.csv", data: Buffer.from("a;b\n1;2\n").toString("base64") }],
          },
        ])
        expect(help.admissions).toBeUndefined()
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

describe("OpenCode hooks the Dock catalog relies on (contract)", () => {
  it.live(
    "a tool registry reload in the prompt hook reaches the first step; in execute.after the next step; in context only the next",
    () =>
      Effect.gen(function* () {
        const names: string[] = []
        const test = yield* boot(scriptedHost(), (ctx) =>
          Effect.gen(function* () {
            yield* ctx.tool.transform((editor) =>
              names.forEach((name) =>
                editor.add({
                  name,
                  description: name,
                  input: Schema.Struct({}),
                  output: Schema.String,
                  options: { codemode: false },
                  execute: () => Effect.succeed({ output: "ok", content: "ok" }),
                }),
              ),
            )
            const add = (name: string) =>
              Effect.suspend(() => {
                if (names.includes(name)) return Effect.void
                names.push(name)
                return ctx.tool.reload()
              })
            yield* ctx.session.hook("prompt", () => add("probe_prompt"))
            yield* ctx.session.hook("context", (event) =>
              add("probe_context").pipe(
                Effect.andThen(Effect.sync(() => event.system.push({ type: "text", text: "PROBE SYSTEM" }))),
              ),
            )
            yield* ctx.tool.hook("execute.after", (event) =>
              event.tool === "probe_prompt" ? add("probe_after") : Effect.void,
            )
          }),
        )
        const id = yield* test.create("reload")
        yield* test.prompt(id, script({ tool: "probe_prompt" }, { text: "end" }))
        const [first, second] = yield* test.requests(id)
        const probes = (request: LLMRequest) =>
          request.tools
            .map((tool) => tool.name)
            .filter((name) => name.startsWith("probe_"))
            .toSorted()
        expect(probes(first)).toEqual(["probe_prompt"])
        expect(probes(second)).toEqual(["probe_after", "probe_context", "probe_prompt"])
        expect(system(first)).toContain("PROBE SYSTEM")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

function respond(request: LLMRequest) {
  // Titles and other tool-less requests get plain text.
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

function header(request: LLMRequest) {
  return request.headers?.["x-opencode-session-id"]
}

// The Loginom tools the request offers, sorted.
function loginom(request: LLMRequest | undefined) {
  return (request?.tools ?? [])
    .map((tool) => tool.name)
    .filter((name) => name.startsWith("loginom_"))
    .toSorted()
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
