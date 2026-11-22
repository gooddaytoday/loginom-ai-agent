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
import { ServiceHost } from "../../loginom-agent/src/host"
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

// Sessions whose execution holds a Host lease now.
const leased = (data: string) =>
  Effect.promise(async () => {
    const directory = path.join(data, "loginom", "leases")
    const names = (await fs.readdir(directory).catch(() => [])).filter((name) => name.endsWith(".json"))
    return Promise.all(
      names.map(async (name) => (await Bun.file(path.join(directory, name)).json()).session as string),
    )
  })

const boot = Effect.gen(function* () {
  const dir = (yield* tmpdirScoped("loginom-host-lease-")).path
  const data = path.join(dir, "data")
  // As the server process: the Host starts before the routes and closes after them.
  yield* Effect.acquireRelease(
    Effect.promise(() => ServiceHost.start({ data, resources: fixture.resources })),
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
          new Request(`http://opencode.local/api/rpc/loginom.runner/start?location[directory]=${encodeURIComponent(dir)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ input: { sessionID, profile: "loginom-automation", text } }),
          }),
        ),
      ).pipe(Effect.map((response) => (response.status === 200 ? true : undefined))),
    ).pipe(Effect.andThen(sessions.wait(sessionID)))
  const ended = (sessionID: Session.ID) =>
    executions.filter((entry) => entry.startsWith(`${sessionID} `) && !entry.endsWith(".started")).map(type)
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
        const test = yield* boot
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
        const test = yield* boot
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
        const test = yield* boot
        const model = yield* test.create("interrupted model")
        const answering = yield* test.prompt(model, script({ hang: true }))
        yield* until(() => test.leased.pipe(Effect.map((sessions) => sessions.length === 1 || undefined)))
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
        const test = yield* boot
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

  it.live(
    "loginom_file_admit reaches the Host through the execution's lease instead of answering LOGINOM_HOST_NOT_READY",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        yield* Effect.promise(() => fs.writeFile(path.join(test.dir, "input.csv"), "amount\n10\n"))
        const id = yield* test.create("admit")
        yield* test.sessions.setPermissions({
          sessionID: id,
          permissions: [{ action: "*", resource: "*", effect: "allow" }],
        })
        yield* test.wizard(id, script({ tool: "loginom_file_admit", input: { path: "input.csv" } }, { text: "end" }))
        const [, answer] = yield* test.requests(id)
        const result = JSON.stringify(answer.messages)
        // The Host admits a file only into a task scope it applied (B2.5d), so its own refusal is the answer.
        expect(result).toContain("LOGINOM_SCOPE_DENIED")
        expect(result).not.toContain("is not available in this task")
        expect(result).not.toContain("LOGINOM_HOST_NOT_READY")
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
          [process.execPath, path.join(import.meta.dir, "fixture/loginom-host-owner.ts"), data, fixture.resources, "ses_killed"],
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

        // The next server: the server process starts the Host first, with no Location and no plugin yet.
        const started = yield* Effect.acquireRelease(
          Effect.promise(() => ServiceHost.start({ data, resources: fixture.resources })),
          () => Effect.promise(() => ServiceHost.close()),
        )
        expect(started.recovered).toEqual(["ses_killed"])
        expect(yield* leased(data)).toEqual([])
        // Recovered: the session leases the new Host again, and its journal holds nothing to replay.
        const lease = yield* Effect.promise(() => ServiceHost.acquire("ses_killed"))
        expect(lease?.generation).toBe(0)
        expect(yield* leased(data)).toEqual(["ses_killed"])
        const journal = yield* Effect.promise(() => fs.readdir(path.join(data, "loginom", "recovery")))
        expect(journal.filter((name) => name.endsWith(".json"))).toEqual([])
        if (lease) yield* Effect.promise(() => ServiceHost.release(lease))
        expect(yield* leased(data)).toEqual([])
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
        TestLLM.failAfter(new AIError({ reason: new InvalidRequestError({ message: "provider rejected the request" }) })),
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
