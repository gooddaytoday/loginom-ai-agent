import { readdirSync, readFileSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Flag } from "@opencode/core/flag"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Plugin } from "@opencode/core/plugin"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { define } from "@opencode/plugin/effect/plugin"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Context, Effect, Exit, Fiber, Layer, Queue, Schema, Stream } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { AIError, InvalidRequestError, LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { BrowserRecovery } from "../../loginom-agent/src/browser-recovery"
import { ServiceHost } from "../../loginom-agent/src/host"
import { launchNodeHost } from "../../loginom-host/src/node-client"
import { createEmbeddedRoutes } from "../src/routes"

// Host lease of the built-in product plugin `loginom.product` (guarantee G3, stage B2.3), the cases of spike S2 on a real
// server with a scripted model and the real private Node host. The Host starts as the server process starts it
// (`cli/src/server-process.ts`), from resources with the pinned Node (`LOGINOM_AI_AGENT_TEST_NODE`) and the Host entry
// that `loginom-host/script/build-node-host.ts` builds; without a runtime its connection is unconfigured, which is all a
// lease needs. Every Host lease is recorded under `<data>/loginom/leases` until it is released, so the records show
// which sessions hold one. A user message carries its script as `SCRIPT<json>SCRIPT`: one entry per step (model call).

type Step = { tool: string; input?: unknown } | { text: string } | { fail: true } | { hang: true }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// Each case boots a server Location and the Node host, about 1–2 s locally.
const timeout = 30_000

const fixture = { directory: "", resources: "" }
beforeAll(async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  fixture.directory = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-host-lease-"))
  fixture.resources = path.join(fixture.directory, "resources")
  await fs.mkdir(path.join(fixture.resources, "bin"), { recursive: true })
  if (process.platform === "win32") await fs.copyFile(node, path.join(fixture.resources, "bin", "node.exe"))
  else await fs.symlink(node, path.join(fixture.resources, "bin", "node"))
  // Built in its own process, like `loginom-host/test/node-host.test.ts`, so Bun's build cache stays out of this runner.
  const builder = Bun.spawn(
    [
      process.execPath,
      path.join(import.meta.dir, "../../loginom-host/script/build-node-host.ts"),
      path.join(fixture.resources, "host"),
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  expect(await builder.exited).toBe(0)
}, 60_000)
afterAll(() => fs.rm(fixture.directory, { recursive: true, force: true }))

// Sessions whose execution holds a Host lease now. A record released between listing and reading is gone.
const leased = (data: string) =>
  Effect.promise(async () => {
    const directory = path.join(data, "loginom", "leases")
    const names = (await fs.readdir(directory).catch(() => [])).filter((name) => name.endsWith(".json"))
    const sessions = await Promise.all(
      names.map((name) =>
        Bun.file(path.join(directory, name))
          .json()
          .then(
            (record: { session: string }) => [record.session],
            () => [],
          ),
      ),
    )
    return sessions.flat()
  })

// `sent`, when given, collects what the plugin sends the Host: the same Node host, launched by the test.
const boot = (sent?: unknown[]) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-host-lease-")).path
    const data = path.join(dir, "data")
    const connect = async () => {
      const host = await launchNodeHost({
        node: path.join(fixture.resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
        entry: path.join(fixture.resources, "host", "node-host.mjs"),
        root: path.join(data, "loginom"),
        resources: fixture.resources,
        headless: true,
      })
      const port = {
        ...host.port,
        postMessage: (value: unknown) => {
          sent?.push(value)
          host.port.postMessage(value)
        },
      }
      return { port, close: host.close }
    }
    // As the server process: the Host starts before the routes and closes after them.
    yield* Effect.acquireRelease(
      Effect.promise(() => ServiceHost.start({ data, resources: fixture.resources, connect: sent && connect })),
      () => Effect.promise(() => ServiceHost.close()),
    )
    const location = Location.Ref.make({ directory: AbsolutePath.make(dir) })
    const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    // A `fail` step waits for the test before the provider rejects the request.
    const gate = yield* Queue.unbounded<void>()
    yield* llm.serve((request) => respond(request, gate))
    const model = SessionRunnerModel.resolved(
      LanguageModel.make({ id: "loginom-lease-model", provider: "test", route: OpenAIChat.route }),
      {
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 8_192 },
      },
    )
    const global = path.join(dir, "global")
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
    // `hold` waits until the test releases it; `executions` lists each session's execution events in order.
    const held = yield* Queue.unbounded<void>()
    const holding: string[] = []
    const executions: string[] = []
    yield* Context.get(context, SdkPlugins.Service).register(
      define({
        id: "test.loginom-host-lease",
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
                  Effect.andThen(Queue.take(held)),
                  Effect.as({ output: "released", content: "released" }),
                ),
            })
            // Stand-in for the Dock tool of B2.5d: `start` holds the page (phase `browser`), as the runtime reports it.
            editor.add({
              name: "loginom_dock_browser_recovery",
              description: "Stand-in browser recovery",
              input: Schema.Struct({ action: Schema.String, operation_id: Schema.String }),
              output: Schema.String,
              options: { codemode: false },
              execute: (input) =>
                Effect.succeed(
                  JSON.stringify({
                    phase: input.action === "start" ? "browser" : "dock",
                    operation_id: input.operation_id,
                  }),
                ).pipe(Effect.map((text) => ({ output: text, content: text }))),
            })
          })
          yield* ctx.event
            .subscribe({
              types: [
                "session.execution.started",
                "session.execution.succeeded",
                "session.execution.failed",
                "session.execution.interrupted",
              ],
            })
            .pipe(
              Stream.runForEach((event) => Effect.sync(() => executions.push(`${event.data.sessionID} ${event.type}`))),
              Effect.forkScoped,
            )
        }),
      }),
    )
    const sessions = Context.get(context, Session.Service)
    const handler = Context.get(context, HttpRouter.HttpRouter)
      .asHttpEffect()
      .pipe(HttpEffect.toWebHandlerWith(context))
    const create = (title: string) =>
      sessions
        .create({ title, agent: Agent.ID.make("build"), model: model.ref, location })
        .pipe(Effect.map((session) => session.id))
    // The prompt runs in the background; join it to wait for the session to go idle.
    const prompt = (sessionID: Session.ID, text: string) =>
      sessions
        .prompt({ sessionID, text })
        .pipe(Effect.andThen(sessions.wait(sessionID)), Effect.forkChild({ startImmediately: true }))
    // The wizard's RPC grants `loginom-automation` to one prompt (B2.2). It needs the Location's plugins loaded.
    const wizard = (sessionID: Session.ID, text: string) =>
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
      ).pipe(Effect.andThen(sessions.wait(sessionID)))
    const history = (sessionID: Session.ID) => executions.filter((entry) => entry.startsWith(`${sessionID} `)).map(type)
    const ended = (sessionID: Session.ID) => history(sessionID).filter((event) => event !== "started")
    // Closes every plugin of the Location, as unloading it does.
    const unload = Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      yield* plugins.close(Exit.void)
    }).pipe(Effect.provide(Context.get(context, LocationServiceMap.Service).get(location)))
    const requests = (sessionID: Session.ID) =>
      llm
        .requests()
        .pipe(Effect.map((all) => all.filter((request) => request.headers?.["x-opencode-session-id"] === sessionID)))
    return {
      dir,
      data,
      sessions,
      create,
      prompt,
      wizard,
      history,
      ended,
      unload,
      requests,
      holding,
      release: Queue.offer(held, undefined),
      open: Queue.offer(gate, undefined),
      leased: leased(data),
    }
  })

describe("loginom.product Host lease (G3, spike S2)", () => {
  it.live(
    "S2 success: an execution holds one Host lease until it succeeds, and the session's next execution leases again",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create("success")
        const first = yield* test.prompt(id, script({ tool: "hold" }, { text: "end" }))
        yield* until(() => Effect.succeed(test.holding.length === 1 || undefined))
        expect(yield* test.leased).toEqual([id])
        yield* test.release
        yield* Fiber.join(first)
        yield* until(() => test.leased.pipe(Effect.map((sessions) => sessions.length === 0 || undefined)))
        expect(test.ended(id)).toEqual(["succeeded"])
        // A Host run left behind would make the Host refuse this one (LOGINOM_CALL_BUSY), and nothing would be leased.
        const second = yield* test.prompt(id, script({ tool: "hold" }, { text: "end" }))
        yield* until(() => Effect.succeed(test.holding.length === 2 || undefined))
        expect(yield* test.leased).toEqual([id])
        yield* test.release
        yield* Fiber.join(second)
        yield* until(() => test.leased.pipe(Effect.map((sessions) => sessions.length === 0 || undefined)))
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "S2 provider error: the lease taken for the execution is released when it fails",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create("provider error")
        const run = yield* test.prompt(id, script({ fail: true }))
        yield* until(() => test.leased.pipe(Effect.map((sessions) => sessions.length === 1 || undefined)))
        expect(yield* test.leased).toEqual([id])
        yield* test.open
        yield* Fiber.join(run)
        yield* until(() => test.leased.pipe(Effect.map((sessions) => sessions.length === 0 || undefined)))
        expect(test.ended(id)).toEqual(["failed"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "S2 interruption during the model's answer and during a tool releases the lease",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const model = yield* test.create("interrupted model")
        const answering = yield* test.prompt(model, script({ hang: true }))
        // The lease is taken when the prompt is admitted (B2.5d), before the execution starts: wait for the model's call.
        yield* until(() => test.requests(model).pipe(Effect.map((requests) => requests.length > 0 || undefined)))
        expect(yield* test.leased).toEqual([model])
        yield* test.sessions.interrupt(model)
        yield* Fiber.join(answering)
        yield* until(() => test.leased.pipe(Effect.map((sessions) => sessions.length === 0 || undefined)))
        expect(test.ended(model)).toEqual(["interrupted"])

        const tool = yield* test.create("interrupted tool")
        const calling = yield* test.prompt(tool, script({ tool: "hold" }, { text: "end" }))
        yield* until(() => Effect.succeed(test.holding.length === 1 || undefined))
        expect(yield* test.leased).toEqual([tool])
        yield* test.sessions.interrupt(tool)
        yield* Fiber.join(calling)
        yield* until(() => test.leased.pipe(Effect.map((sessions) => sessions.length === 0 || undefined)))
        expect(test.ended(tool)).toEqual(["interrupted"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "S2 dispose: a plugin that unloads mid-execution releases the lease it holds",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const id = yield* test.create("dispose")
        const run = yield* test.prompt(id, script({ tool: "hold" }, { text: "end" }))
        yield* until(() => Effect.succeed(test.holding.length === 1 || undefined))
        expect(yield* test.leased).toEqual([id])
        yield* test.unload
        // Released by the product's cleanup alone: the tool still waits and the execution has not ended.
        expect(yield* test.leased).toEqual([])
        expect(test.ended(id)).toEqual([])
        yield* test.sessions.interrupt(id)
        yield* Fiber.join(run)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // B2.5d binds the run to the task before reading its catalog (0.4 `session/tools.ts`). The real Host offers
  // `dock_prepare` only to a run bound to `loginom-automation`, and refuses a browser call of an unbound run with
  // LOGINOM_SCOPE_DENIED; this Host has no connection, so a bound call stops at connection preparation instead. Without
  // a browser runtime its catalog describes no Dock actions, so `loginom_file_admit` is not offered (0.4).
  it.live(
    "the execution's Host run is bound to the task: the real Host offers loginom_dock_prepare under the grant and its call reaches connection preparation",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        const plain = yield* test.create("default")
        const grant = (id: Session.ID) =>
          test.sessions.setPermissions({
            sessionID: id,
            permissions: [{ action: "*", resource: "*", effect: "allow" }],
          })
        yield* grant(plain)
        yield* Fiber.join(yield* test.prompt(plain, script({ text: "end" })))
        const [ordinary] = yield* test.requests(plain)
        const loginom = (request: LLMRequest) =>
          request.tools
            .map((tool) => tool.name)
            .filter((name) => name.startsWith("loginom_") && name !== "loginom_dock_browser_recovery")
            .toSorted()
        expect(loginom(ordinary)).toEqual(["loginom_dock_diagnostics"])

        const id = yield* test.create("bound")
        yield* grant(id)
        yield* test.wizard(
          id,
          script({ tool: "loginom_dock_prepare", input: { intent: "new_draft" } }, { text: "end" }),
        )
        const [first, answer] = yield* test.requests(id)
        expect(loginom(first)).toEqual(["loginom_dock_diagnostics", "loginom_dock_prepare"])
        const result = JSON.stringify(answer.messages)
        expect(result).toContain("LOGINOM_CONFIG_REQUIRED")
        expect(result).not.toContain("LOGINOM_SCOPE_DENIED")
        expect(result).not.toContain("LOGINOM_HOST_NOT_READY")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "G4: one reminder per browser recovery attempt continues the same execution with its grant; the second end stops it",
    () =>
      Effect.gen(function* () {
        const sent: unknown[] = []
        const test = yield* boot(sent)
        const id = yield* test.create("browser recovery")
        yield* test.wizard(
          id,
          script(
            { tool: "loginom_dock_browser_recovery", input: { action: "start", operation_id: "op-1" } },
            { text: "end" },
            { text: "end again" },
          ),
        )
        const requests = yield* test.requests(id)
        const reminder = BrowserRecovery.reminder("op-1")
        // The hook (`experimental.idle`) ran before the session went idle; its synthetic message continued the same
        // execution, and the task kept its grant: the Loginom tool is still offered after the reminder.
        expect(requests).toHaveLength(3)
        expect(JSON.stringify(requests[1].messages)).not.toContain(reminder)
        expect(JSON.stringify(requests[2].messages).split(reminder)).toHaveLength(2)
        expect(requests[2].tools.map((tool) => tool.name)).toContain("loginom_dock_browser_recovery")
        expect(test.history(id)).toEqual(["started", "succeeded"])
        // The second end of turn asked the Host to stop the attempt.
        const stop = sent.find(
          (message) =>
            typeof message === "object" &&
            message !== null &&
            "method" in message &&
            message.method === "call" &&
            JSON.stringify(message).includes("dock_browser_recovery"),
        )
        expect(stop).toMatchObject({
          input: { name: "dock_browser_recovery", args: { action: "stop", operation_id: "op-1" } },
        })
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "S2 kill -9: the next server finds the killed server's lease at start, before any Location, and recovers it",
    () =>
      Effect.gen(function* () {
        const dir = (yield* tmpdirScoped("loginom-host-killed-")).path
        const data = path.join(dir, "data")
        const owner = Bun.spawn(
          [
            process.execPath,
            path.join(import.meta.dir, "fixture/loginom-host-owner.ts"),
            data,
            fixture.resources,
            "ses_killed",
          ],
          { stdout: "pipe", stderr: "pipe" },
        )
        const report = yield* Effect.promise(() => firstLine(owner.stdout))
        expect(JSON.parse(report)).toEqual({ leased: "ses_killed", generation: 0 })
        const host = nodeHostOf(owner.pid)
        if (process.platform === "linux") expect(host).toBeNumber()
        owner.kill("SIGKILL")
        yield* Effect.promise(() => owner.exited)
        // Nothing was disposed: the record of the lease outlives the process.
        expect(yield* leased(data)).toEqual(["ses_killed"])
        // Its Node host stops by itself once its owner is gone (`node-entry.ts`, IPC disconnect).
        if (host !== undefined) yield* until(() => Effect.succeed(alive(host) ? undefined : true))
        // A kill can also cut a record short; and a record of a process that still lives (a parallel server on the same
        // profile) is not stale.
        const leases = path.join(data, "loginom", "leases")
        yield* Effect.promise(() =>
          Promise.all([
            fs.writeFile(path.join(leases, "cut.json.tmp"), ""),
            fs.writeFile(path.join(leases, "cut.json"), "{"),
            fs.writeFile(path.join(leases, "live.json"), JSON.stringify({ session: "ses_live", pid: process.ppid })),
          ]),
        )

        // The next server: the server process starts the Host first, with no Location and no plugin yet.
        const started = yield* Effect.acquireRelease(
          Effect.promise(() => ServiceHost.start({ data, resources: fixture.resources })),
          () => Effect.promise(() => ServiceHost.close()),
        )
        expect(started.recovered).toEqual(["ses_killed"])
        expect((yield* Effect.promise(() => fs.readdir(leases))).sort()).toEqual(["live.json"])
        // Recovered: the session leases the new Host again, and its journal holds nothing to replay.
        const lease = yield* Effect.promise(() => ServiceHost.acquire("ses_killed"))
        expect(lease?.generation).toBe(0)
        expect((yield* leased(data)).sort()).toEqual(["ses_killed", "ses_live"])
        const journal = yield* Effect.promise(() => fs.readdir(path.join(data, "loginom", "recovery")))
        expect(journal.filter((name) => name.endsWith(".json"))).toEqual([])
        if (lease) yield* Effect.promise(() => ServiceHost.release(lease))
        expect(yield* leased(data)).toEqual(["ses_live"])
      }),
    timeout,
  )
})

function respond(request: LLMRequest, gate: Queue.Queue<void>) {
  // Titles and other tool-less requests get plain text.
  const user = request.messages.findLastIndex((message) => message.role === "user" && text(message).includes("SCRIPT<"))
  if (user < 0 || request.tools.length === 0) return TestLLM.text("ok", "text_ok")
  const body = text(request.messages[user])
  const steps: Step[] = JSON.parse(body.slice(body.indexOf("SCRIPT<") + 7, body.lastIndexOf(">SCRIPT")))
  const step = steps[request.messages.slice(user + 1).filter((message) => message.role === "assistant").length]
  if (!step) return TestLLM.text("done", "text_done")
  if ("text" in step) return TestLLM.text(step.text, `text_${crypto.randomUUID()}`)
  if ("hang" in step) return TestLLM.hangAfter()
  if ("fail" in step)
    return Stream.fromEffect(Queue.take(gate)).pipe(
      Stream.flatMap(() =>
        TestLLM.failAfter(
          new AIError({ reason: new InvalidRequestError({ message: "provider rejected the request" }) }),
        ),
      ),
    )
  return TestLLM.toolCall(`call_${crypto.randomUUID()}`, step.tool, step.input ?? {})
}

function text(message: LLMRequest["messages"][number]) {
  return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
}

function type(entry: string) {
  return entry.slice(entry.lastIndexOf(".") + 1)
}

async function firstLine(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const read = async (buffer: string): Promise<string> => {
    if (buffer.includes("\n")) return buffer.slice(0, buffer.indexOf("\n"))
    const chunk = await reader.read()
    if (chunk.done) throw Error("Owner exited before reporting: " + buffer)
    return read(buffer + decoder.decode(chunk.value, { stream: true }))
  }
  return read("")
}

// The owner's Node host on Linux (`/proc`), found by its parent and the Host entry in its command line.
function nodeHostOf(parent: number) {
  if (process.platform !== "linux") return undefined
  const read = (file: string) => {
    try {
      return readFileSync(file, "utf8")
    } catch {
      return ""
    }
  }
  return readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .find(
      (pid) =>
        read(`/proc/${pid}/status`).includes(`\nPPid:\t${parent}\n`) &&
        read(`/proc/${pid}/cmdline`).includes("node-host.mjs"),
    )
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
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
