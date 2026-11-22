import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Flag } from "@opencode/core/flag"
import { Permission } from "@opencode/core/permission"
import { PluginPromise } from "@opencode/core/plugin/promise"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Plugin } from "@opencode/plugin"
import type { Info, ToolContext } from "@opencode/plugin/promise/tool"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { Global } from "@opencode/util/global"
import { Context, Effect, Fiber, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { localFiles } from "../../loginom-agent/src/local-file"
import { packageDocs, Parameters } from "../../loginom-agent/src/package-docs"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { productSkillsDirectory } from "../../product/src/skills"
import { createEmbeddedRoutes } from "../src/routes"
import { pluginsLoaded } from "./fixture/routes"

// The package documentation tool of the product plugin (B2.5c), ported from 0.4
// `a080f7725c:packages/opencode/test/tool/package-docs.test.ts` onto a real server. As in 0.4 the bundle under test is
// built here: product skills, the package-docs executor built by `loginom-host`, the pinned Node from
// LOGINOM_AI_AGENT_TEST_NODE and a resource manifest; the skill verifier needs the runtime client's `npm ci`. A harness
// plugin builds `package_docs_run` over its own `localFiles` and calls it with a synthetic tool call, as 0.4 called the
// tool with a test `Tool.Context`. Session rules, attachments and permission requests are real; a harness
// `permission.evaluate` hook records every permission the tool asks for (0.4 recorded `ctx.ask`) and can act at that
// moment. A user message carries its script for the scripted model as `SCRIPT<json>SCRIPT`, one entry per step.

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// Each test boots a server Location and runs the bundled Node executor; the server package's default 5 s is tight.
const timeout = 30_000
const check = "loginom.local-file.check"
const root = process.getuid?.() === 0
const description =
  "Extract a local Loginom package, create its documentation draft or publish the completed report in the session directory. No Loginom connection or browser is required."

const resources = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-docs-tool-resources-")))
const fixtures = path.join(import.meta.dir, "../../loginom-host/test/fixtures/package-docs")
const fixture = path.join(fixtures, "demo.lgp")

beforeAll(async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  await fs.cp(productSkillsDirectory, path.join(resources, "skills"), { recursive: true })
  await fs.mkdir(path.join(resources, "bin"))
  await fs.cp(node, path.join(resources, "bin/node"))
  const builder = Bun.spawn(
    [
      process.execPath,
      path.join(import.meta.dir, "../../loginom-host/script/build-package-docs.ts"),
      path.join(resources, "skills/package-docs/scripts"),
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const stdout = new Response(builder.stdout).text(),
    stderr = new Response(builder.stderr).text()
  expect(await builder.exited).toBe(0)
  expect(await stderr).toBe("")
  expect(JSON.parse(await stdout).script).toBe(path.join(resources, "skills/package-docs/scripts/package-docs.mjs"))
  await Bun.write(
    path.join(resources, "resource-manifest.json"),
    JSON.stringify({ protocol: 1, node: "bin/node", files: await resourceInventory(resources) }),
  )
})
afterAll(() => fs.rm(resources, { recursive: true, force: true }))

const boot = Effect.gen(function* () {
  const dir = (yield* tmpdirScoped("loginom-package-docs-")).path
  // Outside the Location directory: several cases list that directory exactly, and an emitted report goes there.
  const global = (yield* tmpdirScoped("loginom-package-docs-global-")).path
  const profiles = (yield* tmpdirScoped("loginom-package-docs-profiles-")).path
  const location = Location.Ref.make({ directory: AbsolutePath.make(dir) })
  const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
  yield* llm.serve(respond)
  const model = SessionRunnerModel.resolved(
    LanguageModel.make({ id: "loginom-package-docs-model", provider: "test", route: OpenAIChat.route }),
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
            home: path.join(global, "home"),
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
  const asked: { sessionID: string; action: string; resources: readonly string[] }[] = []
  const hooks: { ask?: (action: string) => Promise<void> } = {}
  const ready = Promise.withResolvers<{ plugin: Plugin.Context; tool: Info<typeof Parameters> }>()
  yield* Context.get(context, SdkPlugins.Service).register(
    PluginPromise.fromPromise(
      Plugin.define({
        id: "test.loginom-package-docs",
        setup: async (ctx) => {
          // Registered before the module's own hook, so a rules-only check still carries its metadata key here.
          await ctx.permission.hook("evaluate", async (event) => {
            if (event.metadata?.[check] !== undefined) return
            asked.push({ sessionID: event.sessionID, action: event.action, resources: event.resources })
            await hooks.ask?.(event.action)
          })
          const files = await localFiles(ctx, profiles)
          ready.resolve({ plugin: ctx, tool: packageDocs(files, ctx.location.directory, resources) })
        },
      }),
    ),
  )
  yield* pluginsLoaded(context, dir)
  const harness = yield* Effect.promise(() => ready.promise)
  const sessions = Context.get(context, Session.Service)
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  // 0.4's session had no rules of its own unless the case gave some; the agent's rules apply.
  const create = (permissions: Permission.Rule[] = []) =>
    Effect.gen(function* () {
      const session = yield* sessions.create({
        title: "package docs",
        agent: Agent.ID.make("build"),
        model: model.ref,
        location,
      })
      yield* sessions.setPermissions({ sessionID: session.id, permissions })
      return session.id
    })
  const prompt = (sessionID: Session.ID, text: string, files?: { uri: string }[]) =>
    sessions.prompt({ sessionID, text, files }).pipe(Effect.andThen(sessions.wait(sessionID)))
  // 0.4 `prepare`: a session with the case's rules and, optionally, the user's attachment in its history.
  const prepare = (options: { attachment?: string; permissions?: Permission.Rule[]; agent?: string } = {}) =>
    Effect.gen(function* () {
      const sessionID = yield* create(options.permissions)
      if (options.attachment) yield* prompt(sessionID, script({ text: "attached" }), [{ uri: options.attachment }])
      return {
        sessionID,
        agent: Agent.ID.make(options.agent ?? "build"),
        messageID: SessionMessage.ID.create(),
        id: Tool.CallID.make(`call_${randomUUID()}`),
        signal: new AbortController().signal,
        progress: async () => {},
      } satisfies ToolContext
    })
  // The wizard's RPC grants one prompt. Before a Location's first work its RPC routes are not registered yet.
  const wizard = (sessionID: Session.ID, profile: string, text: string) =>
    Effect.gen(function* () {
      const route = `/api/rpc/loginom.runner/start?location[directory]=${encodeURIComponent(dir)}`
      yield* until(() =>
        Effect.promise(async () => {
          const response = await handler(
            new Request(`http://opencode.local${route}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ input: { sessionID, profile, text } }),
            }),
          )
          const body = await response.text()
          if (response.status === 200) return body
          if (body.includes("rpc.unavailable")) return undefined
          throw new Error(`wizard: ${response.status} ${body}`)
        }),
      )
      yield* sessions.wait(sessionID)
    })
  const requests = (sessionID: Session.ID) =>
    llm
      .requests()
      .pipe(Effect.map((all) => all.filter((request) => header(request) === sessionID && request.tools.length > 0)))
  // Waits for the session's pending permission request and answers it.
  const reply = (sessionID: Session.ID, decision: "reject" | "always", message?: string) =>
    Effect.gen(function* () {
      const request = yield* until(() =>
        Effect.promise(() => harness.plugin.permission.list({ sessionID })).pipe(Effect.map((items) => items[0])),
      )
      yield* Effect.promise(() =>
        harness.plugin.permission.reply({ sessionID, requestID: request.id, decision, message }),
      )
      return request
    })
  return {
    dir,
    sessions,
    plugin: harness.plugin,
    tool: harness.tool,
    hooks,
    create,
    prompt,
    prepare,
    wizard,
    requests,
    reply,
    run: (input: typeof Parameters.Type, ctx: ToolContext) => rejected(() => harness.tool.execute(input, ctx)),
    execute: (input: typeof Parameters.Type, ctx: ToolContext) =>
      Effect.promise(() => harness.tool.execute(input, ctx)).pipe(
        Effect.map((result) => JSON.parse(String(result.content))),
      ),
    asked: (sessionID: string) => asked.filter((item) => item.sessionID === sessionID),
    listing: () => Effect.promise(async () => (await fs.readdir(dir)).toSorted()),
  }
})

// The rejection of a call that must fail, or `undefined` when it resolved.
const rejected = (run: () => Promise<unknown>) =>
  Effect.promise(() =>
    run().then(
      () => undefined,
      (error: unknown) => error,
    ),
  )
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
// 0.4 `PermissionV1.DeniedError`: on OpenCode 2 a deny rule fails `permission.assert` with this cause.
const blocked = (error: unknown) => error instanceof Tool.Error && error.error instanceof Permission.BlockedError
const actions = (items: { action: string }[]) => items.map((item) => item.action)
const exists = (file: string) =>
  Effect.promise(() =>
    fs.stat(file).then(
      () => true,
      () => false,
    ),
  )
const readJson = (file: string) => Effect.promise(async () => JSON.parse(await fs.readFile(file, "utf8")))
const fill = (report: string) =>
  Effect.promise(async () =>
    fs.writeFile(report, (await fs.readFile(report, "utf8")).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание сценария.")),
  )

// Replace the external Node program in this test's bundle, preserving its exact bytes and manifest afterwards.
// Runtime services and process spawning stay real.
const withScript = <A, E, R>(content: string | undefined, body: Effect.Effect<A, E, R>) => {
  const file = path.join(resources, "skills/package-docs/scripts/package-docs.mjs")
  const manifest = path.join(resources, "resource-manifest.json")
  return Effect.acquireUseRelease(
    Effect.promise(async () => ({
      script: await fs.readFile(file, "utf8"),
      manifest: await fs.readFile(manifest, "utf8"),
    })),
    () =>
      Effect.promise(async () => {
        if (content === undefined) await fs.rm(file)
        else await fs.writeFile(file, content)
        await fs.writeFile(
          manifest,
          JSON.stringify({ protocol: 1, node: "bin/node", files: await resourceInventory(resources) }),
        )
      }).pipe(Effect.andThen(body)),
    (original) =>
      Effect.promise(async () => {
        await fs.writeFile(file, original.script)
        await fs.writeFile(manifest, original.manifest)
      }),
  )
}

describe("package_docs_run (B2.5c)", () => {
  it.live(
    "extracts an original user attachment with bundled Node and requests only session writes",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const output = yield* test.execute({ operation: "extract", lgp: fixture }, ctx)
        expect(output.structure.startsWith(path.join(test.dir, ".work/package-docs/"))).toBe(true)
        expect(yield* readJson(output.structure)).toEqual(yield* readJson(path.join(fixtures, "structure.json")))
        const asked = test.asked(ctx.sessionID)
        expect(actions(asked)).toEqual(["edit"])
        expect(asked[0].resources.every((resource) => resource.startsWith(".work/package-docs/"))).toBe(true)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // 0.4 also cut the history at a revert of the attachment's part (`reverted`), and ignored an attachment in a message
  // that replays a compacted one which is no longer visible (`replayed`). OpenCode 2 reverts whole messages and has no
  // replay marker, so neither case exists there; `message-reverted` is below the loop.
  for (const state of ["query", "fragment", "other-file"] as const)
    it.live(
      `a ${state} attachment must request fresh read permission before extracting a package`,
      () =>
        Effect.gen(function* () {
          const test = yield* boot
          const ctx = yield* test.prepare({
            attachment:
              pathToFileURL(state === "other-file" ? path.join(resources, "resource-manifest.json") : fixture).href +
              (state === "query" ? "?start=1" : state === "fragment" ? "#range" : ""),
            permissions: [
              { action: "external_directory", resource: "*", effect: "allow" },
              { action: "read", resource: "*", effect: "ask" },
              { action: "edit", resource: "*", effect: "allow" },
            ],
          })
          const fiber = yield* test.run({ operation: "extract", lgp: fixture }, ctx).pipe(Effect.forkScoped)
          const request = yield* test.reply(ctx.sessionID, "reject")
          expect(request.action).toBe("read")
          // A plain rejection stays the decline that ends the step (0.4: `PermissionV1.RejectedError`).
          expect(yield* Fiber.join(fiber)).toBeInstanceOf(Permission.DeclinedError)
          expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
        }).pipe(Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )

  // OpenCode 2 runs no step while a revert is only staged: the next prompt or compaction commits it first. The
  // attachment's message is therefore reverted and committed here; a staged revert alone still authorizes (journal).
  it.live(
    "a message-reverted attachment must request fresh read permission before extracting a package",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href,
          permissions: [
            { action: "external_directory", resource: "*", effect: "allow" },
            { action: "read", resource: "*", effect: "ask" },
            { action: "edit", resource: "*", effect: "allow" },
          ],
        })
        const history = yield* test.sessions.messages({ sessionID: ctx.sessionID })
        const attached = history.find((item) => item.type === "user")
        if (!attached) throw Error("the attachment's message is missing")
        yield* test.sessions.revert.stage({ sessionID: ctx.sessionID, messageID: attached.id })
        yield* test.sessions.revert.commit(ctx.sessionID)
        const fiber = yield* test.run({ operation: "extract", lgp: fixture }, ctx).pipe(Effect.forkScoped)
        const request = yield* test.reply(ctx.sessionID, "reject")
        expect(request.action).toBe("read")
        expect(yield* Fiber.join(fiber)).toBeInstanceOf(Permission.DeclinedError)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a compaction preserves the visible original attachment's read authorization",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        yield* test.sessions.compact({ sessionID: ctx.sessionID })
        yield* test.sessions.wait(ctx.sessionID)
        const output = yield* test.execute({ operation: "extract", lgp: fixture }, ctx)
        expect(yield* exists(output.structure)).toBe(true)
        expect(actions(test.asked(ctx.sessionID))).toEqual(["edit"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "forked original attachments keep read authorization in the new session",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const fork = yield* test.sessions.fork({ sessionID: ctx.sessionID })
        yield* test.sessions.setPermissions({
          sessionID: fork.id,
          permissions: [{ action: "*", resource: "*", effect: "allow" }],
        })
        const output = yield* test.execute({ operation: "extract", lgp: fixture }, { ...ctx, sessionID: fork.id })
        expect(yield* exists(output.structure)).toBe(true)
        expect(actions(test.asked(fork.id))).toEqual(["edit"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // Under root `chmod 0` does not stop a read.
  ;(root ? it.live.skip : it.live)(
    "an OS read refusal names the file without suggesting an attachment",
    () =>
      Effect.gen(function* () {
        if (process.platform === "win32") return
        const test = yield* boot
        const file = path.join(test.dir, "unreadable.lgp")
        yield* Effect.promise(() => fs.copyFile(fixture, file))
        const ctx = yield* test.prepare()
        const error = yield* Effect.acquireUseRelease(
          Effect.promise(() => fs.chmod(file, 0)),
          () => test.run({ operation: "extract", lgp: file }, ctx),
          () => Effect.promise(() => fs.chmod(file, 0o600)),
        )
        expect(message(error)).toContain(file)
        expect(message(error)).toMatch(/EACCES|permission|доступ/i)
        expect(message(error)).toContain("LOGINOM_FILE_ACCESS_DENIED")
        expect(message(error)).not.toContain("--file")
        expect(test.asked(ctx.sessionID)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "local path filesystem errors include their reason and path without an attachment hint",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const directory = path.join(test.dir, "Каталог #1.lgp")
        yield* Effect.promise(() => fs.mkdir(directory))
        for (const [file, reason] of [
          [path.join(test.dir, "missing.lgp"), /not.?found|ENOENT|отсутствует/i],
          [directory, /directory|каталог/i],
        ] as const) {
          const ctx = yield* test.prepare()
          const error = yield* test.run({ operation: "extract", lgp: file }, ctx)
          expect(message(error)).toContain(file)
          expect(message(error)).toMatch(reason)
          expect(message(error)).toContain(file === directory ? "LOGINOM_FILE_NOT_REGULAR" : "LOGINOM_FILE_NOT_FOUND")
          expect(message(error)).not.toContain("--file")
          expect(test.asked(ctx.sessionID)).toEqual([])
        }
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "configured file deny beats an attachment and an earlier always approval",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        // An earlier "always" answer to a read question: OpenCode 2 saves it for the project.
        const earlier = yield* test.create([{ action: "read", resource: "*", effect: "ask" }])
        const approval = yield* rejected(() =>
          test.plugin.permission.assert({
            sessionID: earlier,
            action: "read",
            resources: ["previous.txt"],
            save: ["*"],
          }),
        ).pipe(Effect.forkScoped)
        yield* test.reply(earlier, "always")
        expect(yield* Fiber.join(approval)).toBeUndefined()
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href,
          permissions: [{ action: "read", resource: "*", effect: "deny" }],
        })
        const error = yield* test.run({ operation: "extract", lgp: fixture }, ctx)
        expect(blocked(error)).toBe(true)
        expect(message(error)).toContain(fixture)
        expect(message(error)).not.toContain("--file")
        // 0.4 reported it through `ctx.metadata`; OpenCode 2 carries it on the tool error.
        expect((error as Tool.Error).metadata).toEqual({ permissionDenied: true })
        expect(test.asked(ctx.sessionID)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "an original attachment does not override the user's explicit read deny",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href,
          permissions: [{ action: "read", resource: "*", effect: "deny" }],
        })
        expect(blocked(yield* test.run({ operation: "extract", lgp: fixture }, ctx))).toBe(true)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "plan cannot create an extracted structure even for an attached package",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href, agent: "plan" })
        expect(blocked(yield* test.run({ operation: "extract", lgp: fixture }, ctx))).toBe(true)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a model-supplied path must pass external_directory before reading or writing",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          permissions: [{ action: "external_directory", resource: "*", effect: "deny" }],
        })
        expect(blocked(yield* test.run({ operation: "extract", lgp: fixture }, ctx))).toBe(true)
        expect(test.asked(ctx.sessionID)).toEqual([])
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a range reference does not authorize the whole package",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href + "?start=1&end=10",
          permissions: [{ action: "external_directory", resource: "*", effect: "deny" }],
        })
        expect(blocked(yield* test.run({ operation: "extract", lgp: fixture }, ctx))).toBe(true)
        expect(test.asked(ctx.sessionID)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a tampered skill bundle is rejected before Node can launch it",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const file = path.join(resources, "skills/package-docs/scripts/package-docs.mjs")
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const error = yield* Effect.acquireUseRelease(
          Effect.promise(async () => {
            const original = await fs.readFile(file, "utf8")
            await fs.writeFile(
              file,
              original +
                '\nawait import("node:fs/promises").then(fs => fs.writeFile("unexpected-launch", "launched"));\n',
            )
            return original
          }),
          () => test.run({ operation: "extract", lgp: fixture }, ctx),
          (original) => Effect.promise(() => fs.writeFile(file, original)),
        )
        expect(message(error)).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
        expect(yield* exists(path.join(test.dir, "unexpected-launch"))).toBe(false)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // 0.4 named edit resources relative to the worktree, as its write tools did. OpenCode 2's write tools name a file
  // inside the Location relative to the Location's directory (`FileAccess.resolve`), and so does the tool: one rule
  // stops both.
  it.live(
    "edit denies use the same Location-relative paths as ordinary write tools",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const rules: Permission.Rule[] = [{ action: "edit", resource: ".work/*", effect: "deny" }]
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href, permissions: rules })
        expect(blocked(yield* test.run({ operation: "extract", lgp: fixture }, ctx))).toBe(true)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
        const write = yield* test.create(rules)
        yield* test.prompt(
          write,
          script({ tool: "write", input: { path: ".work/package-docs/note.md", content: "x" } }, { text: "end" }),
        )
        expect(JSON.stringify((yield* test.requests(write))[1]?.messages)).toContain("Permission denied: edit")
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "canonicalizing an attachment does not bypass a deny on its requested name",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const original = path.join(test.dir, "original.lgp"),
          alias = path.join(test.dir, "alias.lgp")
        yield* Effect.promise(async () => {
          await fs.copyFile(fixture, original)
          await fs.symlink(original, alias)
        })
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(alias).href,
          permissions: [{ action: "read", resource: "alias.lgp", effect: "deny" }],
        })
        expect(blocked(yield* test.run({ operation: "extract", lgp: alias }, ctx))).toBe(true)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "an original attachment preserves an explicit external_directory deny",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href,
          permissions: [{ action: "external_directory", resource: "*", effect: "deny" }],
        })
        expect(blocked(yield* test.run({ operation: "extract", lgp: fixture }, ctx))).toBe(true)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "creates a session skeleton with edit authorization for both generated files",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const before = yield* Effect.promise(() => fs.readFile(fixture))
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const result = yield* Effect.promise(() => test.tool.execute({ operation: "skeleton", lgp: fixture }, ctx))
        const output = JSON.parse(String(result.content))
        expect(output.narrativeInstructions).toBe(
          yield* Effect.promise(() =>
            fs.readFile(path.join(resources, "skills/package-docs/references/narrative-prompts.md"), "utf8"),
          ),
        )
        expect(output.report.startsWith(path.join(test.dir, ".work/package-docs/"))).toBe(true)
        expect(yield* Effect.promise(() => fs.readFile(output.report, "utf8"))).toContain(
          "PLACEHOLDER_PACKAGE_DESCRIPTION",
        )
        expect(yield* readJson(output.structure)).toEqual(yield* readJson(path.join(fixtures, "structure.json")))
        const asked = test.asked(ctx.sessionID)
        expect(actions(asked)).toEqual(["edit"])
        expect(asked[0].resources).toContain(output.report.slice(test.dir.length + 1))
        expect(asked[0].resources).toContain(output.structure.slice(test.dir.length + 1))
        expect(yield* Effect.promise(() => fs.readFile(fixture))).toEqual(before)
        // The largest result: the narrative instructions travel whole, far below OpenCode's 50 KiB cut, and a set
        // `truncated` skips the cut anyway.
        expect(result.metadata).toEqual({ truncated: false })
        expect(Buffer.byteLength(String(result.content))).toBeLessThan(16 * 1024)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a deny on the skeleton prevents all generated writes",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href,
          permissions: [{ action: "edit", resource: ".work/package-docs/*/report.md", effect: "deny" }],
        })
        expect(blocked(yield* test.run({ operation: "skeleton", lgp: fixture }, ctx))).toBe(true)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "repeating the skeleton operation preserves a filled draft",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const output = yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        yield* Effect.promise(() => fs.writeFile(output.report, "# Заполненный пользователем черновик\n"))
        const repeated = yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        expect(repeated.report).toBe(output.report)
        expect(yield* Effect.promise(() => fs.readFile(output.report, "utf8"))).toBe(
          "# Заполненный пользователем черновик\n",
        )
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "publishes a completed PDF only after authorizing its exact session filename",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const before = yield* Effect.promise(() => fs.readFile(fixture))
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const skeleton = yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        yield* fill(skeleton.report)
        const output = yield* test.execute({ operation: "emit", lgp: fixture }, ctx)
        expect(output.output).toBe(path.join(test.dir, "demo.lgp_report.pdf"))
        expect(
          Buffer.from(yield* Effect.promise(() => fs.readFile(output.output)))
            .subarray(0, 8)
            .toString(),
        ).toBe("%PDF-1.4")
        const asked = test.asked(ctx.sessionID)
        expect(asked.filter((item) => item.action === "edit").at(-1)?.resources).toContain("demo.lgp_report.pdf")
        expect(asked.filter((item) => item.action === "read").at(-1)?.resources).toContain(
          skeleton.report.slice(test.dir.length + 1),
        )
        expect(yield* Effect.promise(() => fs.readFile(fixture))).toEqual(before)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "chooses the next free name before permission and preserves existing reports",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const skeleton = yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        yield* fill(skeleton.report)
        const markdown = yield* Effect.promise(() => fs.readFile(skeleton.report, "utf8"))
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(test.dir, "demo.lgp_report.md"), "Существующий отчёт")
          await fs.symlink(path.join(test.dir, "absent.md"), path.join(test.dir, "demo.lgp_report-2.md"))
        })
        const output = yield* test.execute({ operation: "emit", lgp: fixture, format: "md" }, ctx)
        expect(output.output).toBe(path.join(test.dir, "demo.lgp_report-3.md"))
        expect(yield* Effect.promise(() => fs.readFile(path.join(test.dir, "demo.lgp_report-3.md"), "utf8"))).toBe(
          markdown,
        )
        expect(yield* Effect.promise(() => fs.readFile(path.join(test.dir, "demo.lgp_report.md"), "utf8"))).toBe(
          "Существующий отчёт",
        )
        expect(
          test
            .asked(ctx.sessionID)
            .filter((item) => item.action === "edit")
            .at(-1)?.resources,
        ).toContain("demo.lgp_report-3.md")
        const word = yield* test.execute({ operation: "emit", lgp: fixture, format: "docx" }, ctx)
        expect(word.output).toBe(path.join(test.dir, "demo.lgp_report.docx"))
        expect(
          Buffer.from(yield* Effect.promise(() => fs.readFile(word.output)))
            .subarray(0, 2)
            .toString(),
        ).toBe("PK")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "an explicit deny on the final filename prevents publication",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href,
          permissions: [{ action: "edit", resource: "demo.lgp_report.md", effect: "deny" }],
        })
        const skeleton = yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        yield* fill(skeleton.report)
        expect(blocked(yield* test.run({ operation: "emit", lgp: fixture, format: "md" }, ctx))).toBe(true)
        expect(yield* test.listing()).toEqual([".work"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a filename occupied during approval is rejected without moving the authorized output",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const skeleton = yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        yield* fill(skeleton.report)
        test.hooks.ask = async (action) => {
          if (action === "edit") await fs.writeFile(path.join(test.dir, "demo.lgp_report.md"), "Другой автор")
        }
        const error = yield* test.run({ operation: "emit", lgp: fixture, format: "md" }, ctx)
        test.hooks.ask = undefined
        expect(message(error)).toContain("PACKAGE_DOCS_OUTPUT_COLLISION")
        expect(yield* Effect.promise(() => fs.readFile(path.join(test.dir, "demo.lgp_report.md"), "utf8"))).toBe(
          "Другой автор",
        )
        expect(yield* test.listing()).toEqual([".work", "demo.lgp_report.md"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "emit preserves an explicit read deny on the filled draft",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({
          attachment: pathToFileURL(fixture).href,
          permissions: [{ action: "read", resource: ".work/package-docs/*/report.md", effect: "deny" }],
        })
        const skeleton = yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        yield* fill(skeleton.report)
        expect(blocked(yield* test.run({ operation: "emit", lgp: fixture }, ctx))).toBe(true)
        expect(yield* test.listing()).toEqual([".work"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "unfilled placeholders fail explicitly without a published report in any format",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        yield* test.execute({ operation: "skeleton", lgp: fixture }, ctx)
        for (const format of ["pdf", "docx", "md"] as const)
          expect(message(yield* test.run({ operation: "emit", lgp: fixture, format }, ctx))).toContain(
            "PACKAGE_DOCS_PLACEHOLDER",
          )
        expect(yield* test.listing()).toEqual([".work"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // 0.4 handed the other session's messages to the call as `ctx.messages`; OpenCode 2 reads the calling session's own
  // history, so the other session only holds the attachment.
  it.live(
    "attachments from another session do not authorize a path",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const ctx = yield* test.prepare({
          permissions: [{ action: "external_directory", resource: "*", effect: "deny" }],
        })
        expect(blocked(yield* test.run({ operation: "extract", lgp: fixture }, ctx))).toBe(true)
        expect(test.asked(ctx.sessionID)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a missing generated bundle is diagnosed as damaged resources",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const error = yield* withScript(undefined, test.run({ operation: "extract", lgp: fixture }, ctx))
        expect(message(error)).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a zero exit with malformed executor output is an error, not a completed operation",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const error = yield* withScript(
          "process.stdout.write('not-json')",
          test.run({ operation: "extract", lgp: fixture }, ctx),
        )
        expect(message(error)).toContain("PACKAGE_DOCS_OUTPUT_INVALID")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a successful executor cannot substitute a path outside the backend-selected workspace",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const error = yield* withScript(
          'process.stdout.write(JSON.stringify({structure: "/tmp/foreign.json"}))',
          test.run({ operation: "extract", lgp: fixture }, ctx),
        )
        expect(message(error)).toContain("PACKAGE_DOCS_OUTPUT_INVALID")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // New: in the case above the selected file is also missing, so only this one shows that the reported path itself is
  // checked.
  it.live(
    "a reported path other than the selected one fails even when the selected file exists",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const output = yield* test.execute({ operation: "extract", lgp: fixture }, ctx)
        const foreign = path.join(test.dir, "foreign.json")
        yield* Effect.promise(() => fs.copyFile(output.structure, foreign))
        const error = yield* withScript(
          `process.stdout.write(JSON.stringify({structure: ${JSON.stringify(foreign)}}))`,
          test.run({ operation: "extract", lgp: fixture }, ctx),
        )
        expect(message(error)).toContain("PACKAGE_DOCS_OUTPUT_INVALID")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "an executor cannot claim completion without creating its acknowledged file",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const initial = yield* Effect.promise(() => test.tool.execute({ operation: "extract", lgp: fixture }, ctx))
        yield* Effect.promise(() => fs.rm(JSON.parse(String(initial.content)).structure))
        const error = yield* withScript(
          "process.stdout.write(" + JSON.stringify(String(initial.content)) + ")",
          test.run({ operation: "extract", lgp: fixture }, ctx),
        )
        expect(message(error)).toContain("PACKAGE_DOCS_OUTPUT_INVALID")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a Node hash mismatch is rejected without falling back to a system interpreter",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const file = path.join(resources, "resource-manifest.json")
        const error = yield* Effect.acquireUseRelease(
          Effect.promise(() => fs.readFile(file, "utf8")),
          (original) =>
            Effect.promise(async () => {
              const manifest = JSON.parse(original)
              manifest.files.find((item: { path: string }) => item.path === "bin/node").sha256 = "0".repeat(64)
              await fs.writeFile(file, JSON.stringify(manifest))
            }).pipe(Effect.andThen(test.run({ operation: "extract", lgp: fixture }, ctx))),
          (original) => Effect.promise(() => fs.writeFile(file, original)),
        )
        expect(message(error)).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "even the correctly hashed pinned Node cannot be a symlink outside resources",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const file = path.join(resources, "bin/node"),
          backup = path.join(resources, "bin/node.original")
        const source = process.env.LOGINOM_AI_AGENT_TEST_NODE
        if (!source) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
        const error = yield* Effect.acquireUseRelease(
          Effect.promise(() => fs.rename(file, backup)),
          () =>
            Effect.promise(() => fs.symlink(source, file)).pipe(
              Effect.andThen(test.run({ operation: "extract", lgp: fixture }, ctx)),
            ),
          () =>
            Effect.promise(async () => {
              await fs.rm(file, { force: true })
              await fs.rename(backup, file)
            }),
        )
        expect(message(error)).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a request cancelled before execution performs no permission or file operations",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const error = yield* test.run({ operation: "extract", lgp: fixture }, { ...ctx, signal: AbortSignal.abort() })
        expect(error).toBeDefined()
        expect(test.asked(ctx.sessionID)).toEqual([])
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // The timeout case waits out 0.4's real 60 s executor timeout, as 0.4's test did.
  for (const cancelled of [true, false])
    it.live(
      cancelled
        ? "abort terminates the running Node executor before returning an error"
        : "timeout terminates the running Node executor before returning an error",
      () =>
        Effect.gen(function* () {
          const test = yield* boot
          const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
          const controller = new AbortController()
          yield* withScript(
            'import {writeFileSync} from "node:fs"; writeFileSync("executor.pid", String(process.pid)); setInterval(() => {}, 1000);',
            Effect.gen(function* () {
              const fiber = yield* test
                .run({ operation: "extract", lgp: fixture }, { ...ctx, signal: controller.signal })
                .pipe(Effect.forkScoped)
              const pid = yield* until(
                () =>
                  Effect.promise(() =>
                    fs.readFile(path.join(test.dir, "executor.pid"), "utf8").then(
                      (value) => (Number(value) > 0 ? Number(value) : undefined),
                      () => undefined,
                    ),
                  ),
                5_000,
              )
              if (cancelled) controller.abort()
              const error = yield* Fiber.join(fiber)
              expect(message(error)).toMatch(cancelled ? /abort/i : /Timed out/)
              expect(() => process.kill(pid, 0)).toThrow()
              expect(yield* test.listing()).toEqual(["executor.pid"])
            }),
          )
        }).pipe(Effect.provideService(Flag.Overrides, undefined)),
      cancelled ? timeout : 70_000,
    )

  it.live(
    "the executor receives fixed argv, the session cwd and a minimal environment",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.prepare({ attachment: pathToFileURL(fixture).href })
        const initial = yield* Effect.promise(() => test.tool.execute({ operation: "extract", lgp: fixture }, ctx))
        const structure = JSON.parse(String(initial.content)).structure
        const output = yield* withScript(
          'import {writeFileSync} from "node:fs"; writeFileSync(' +
            JSON.stringify(structure) +
            ", JSON.stringify({env: Object.keys(process.env).sort(), cwd: process.cwd(), argv: process.argv.slice(2), exe: process.execPath})); process.stdout.write(" +
            JSON.stringify(String(initial.content)) +
            ");",
          test.execute({ operation: "extract", lgp: fixture }, ctx),
        )
        expect(output.structure).toBe(structure)
        expect(yield* readJson(structure)).toEqual({
          env: ["LANG"],
          cwd: test.dir,
          argv: ["extract", "--lgp", yield* Effect.promise(() => fs.realpath(fixture)), "--directory", test.dir],
          exe: path.join(resources, "bin/node"),
        })
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // OpenCode 2 ends the step on a plain rejection only while the tool throws the decline itself, so the `--file` hint
  // of 0.4 comes with a rejection that carries feedback (B2.5a, `permissionFailure`).
  it.live(
    "rejected package access remains typed and tells CLI users to attach it with --file",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const rules: Permission.Rule[] = [{ action: "external_directory", resource: "*", effect: "ask" }]
        const corrected = yield* test.prepare({ permissions: rules })
        const first = yield* test.run({ operation: "extract", lgp: fixture }, corrected).pipe(Effect.forkScoped)
        yield* test.reply(corrected.sessionID, "reject", "attach it instead")
        const error = yield* Fiber.join(first)
        expect(error).toBeInstanceOf(Tool.Error)
        expect((error as Tool.Error).error).toBeInstanceOf(Permission.CorrectedError)
        expect(message(error)).toContain("--file")
        expect(message(error)).toContain("LOGINOM_FILE_ACCESS_DENIED")

        const declined = yield* test.prepare({ permissions: rules })
        const second = yield* test.run({ operation: "extract", lgp: fixture }, declined).pipe(Effect.forkScoped)
        yield* test.reply(declined.sessionID, "reject")
        expect(yield* Fiber.join(second)).toBeInstanceOf(Permission.DeclinedError)
        expect(yield* exists(path.join(test.dir, ".work"))).toBe(false)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the product's package_docs_run is offered and called only with the package-docs grant (G1 gate)",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        // The input fails inside the tool before anything is written.
        const call = script(
          { tool: "package_docs_run", input: { operation: "extract", lgp: "missing.lgp" } },
          { text: "end" },
        )
        // No grant, and loginom-automation: not offered, and a call is rejected by the gate before the tool runs.
        const plain = yield* test.create()
        yield* test.prompt(plain, call)
        const automation = yield* test.create()
        yield* test.wizard(automation, "loginom-automation", call)
        for (const sessionID of [plain, automation]) {
          const [first, second] = yield* test.requests(sessionID)
          expect(names(first)).not.toContain("package_docs_run")
          expect(JSON.stringify(second.messages)).toContain("LOGINOM_SCOPE_DENIED: tool package_docs_run")
          expect(JSON.stringify(second.messages)).not.toContain("LOGINOM_FILE_NOT_FOUND")
        }

        // package-docs: 0.4's name and description among only the profile's tools, and the call reaches the tool.
        const docs = yield* test.create()
        yield* test.wizard(docs, "package-docs", call)
        const [first, second] = yield* test.requests(docs)
        expect(names(first).toSorted()).toEqual([
          "edit",
          "glob",
          "grep",
          "package_docs_run",
          "question",
          "read",
          "skill",
          "todowrite",
          "write",
        ])
        // 0.4's input schema as OpenCode 2 converts it: the same three variants, with `additionalProperties: false` and
        // the optional `format` as nullable instead of 0.4's `$schema` and plain enum (journal, B2.5c).
        const variant = (operation: string, format?: object) => ({
          type: "object",
          properties: { operation: { type: "string", enum: [operation] }, lgp: { type: "string" }, ...format },
          required: ["operation", "lgp"],
          additionalProperties: false,
        })
        expect(first.tools.find((tool) => tool.name === "package_docs_run")).toEqual({
          type: "tool",
          name: "package_docs_run",
          description,
          inputSchema: {
            anyOf: [
              variant("extract"),
              variant("skeleton"),
              variant("emit", {
                format: { anyOf: [{ type: "string", enum: ["pdf", "docx", "md"] }, { type: "null" }] },
              }),
            ],
          },
        })
        expect(JSON.stringify(second.messages)).toContain("LOGINOM_FILE_NOT_FOUND")
        expect(JSON.stringify(second.messages)).not.toContain("LOGINOM_SCOPE_DENIED")
        for (const sessionID of [plain, automation, docs]) expect(test.asked(sessionID)).toEqual([])
        expect(yield* test.listing()).toEqual([])
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
  if ("text" in step) return TestLLM.text(step.text, `text_${randomUUID()}`)
  return TestLLM.toolCall(`call_${randomUUID()}`, step.tool, step.input ?? {})
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
