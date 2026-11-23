import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Flag } from "@opencode/core/flag"
import { Permission } from "@opencode/core/permission"
import { PluginPromise } from "@opencode/core/plugin/promise"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Plugin } from "@opencode/plugin"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { Global } from "@opencode/util/global"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { fileReferences } from "../../loginom-host/src/file-reference"
import { fileTools } from "../../loginom-agent/src/file-profile"
import { profileFile, sampleFile } from "../../loginom-agent/src/file-profile-core"
import { ServiceHost } from "../../loginom-agent/src/host"
import { localFiles, type Lease } from "../../loginom-agent/src/local-file"
import { createEmbeddedRoutes } from "../src/routes"
import { dockTool, scriptedHost } from "./fixture/loginom-dock-host"
import { pluginsLoaded } from "./fixture/routes"

// Local file admission of the product plugin (B2.5a), ported from 0.4
// `a080f7725c:packages/opencode/test/tool/loginom-local-file.test.ts` onto a real server. A harness plugin builds its own
// `localFiles` and calls it with a synthetic tool call, as 0.4 called the module with a test `Tool.Context`. Session
// rules and history are real. 0.4 stubbed `ask`; here the session allows everything (as 0.4's test session did), and a
// harness `permission.evaluate` hook records each permission the module asks for and can act at that moment. Loginom
// tools need the `loginom-automation` grant, which the wizard RPC gives. A user message carries its script for the
// scripted model as `SCRIPT<json>SCRIPT`, one entry per step.

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// Each test boots a server Location; the server package's default 5 s is tight on a loaded runner.
const timeout = 30_000
const limit = 16 * 1024 * 1024
const check = "loginom.local-file.check"
const root = process.getuid?.() === 0
const admitDescription =
  "Register one local data file by its literal path (relative to the session directory or absolute), including files of several GiB. Files over 16 MiB use a private streaming snapshot, without sending bytes through IPC. Returns an input artifact for dock_artifact_deliver; does not upload it. Register each source separately, including equal filenames in different folders. For a local .lgp use loginom_dock_prepare with local_package_path."

const boot = Effect.gen(function* () {
  const dir = (yield* tmpdirScoped("loginom-local-file-")).path
  // `file-profiles` of the file tools lives outside the project, as under the data directory in an installation.
  const profiles = (yield* tmpdirScoped("loginom-file-profiles-")).path
  const global = path.join(dir, ".global")
  const location = Location.Ref.make({ directory: AbsolutePath.make(dir) })
  const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
  yield* llm.serve(respond)
  const model = SessionRunnerModel.resolved(
    LanguageModel.make({ id: "loginom-local-file-model", provider: "test", route: OpenAIChat.route }),
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
  const asked: { sessionID: string; action: string }[] = []
  const hooks: { ask?: (action: string) => Promise<void> } = {}
  const ready = Promise.withResolvers<{ plugin: Plugin.Context; files: Awaited<ReturnType<typeof localFiles>> }>()
  yield* Context.get(context, SdkPlugins.Service).register(
    PluginPromise.fromPromise(
      Plugin.define({
        id: "test.loginom-local-file",
        setup: async (ctx) => {
          // Registered before the module's own hook, so a rules-only check still carries its metadata key here.
          await ctx.permission.hook("evaluate", async (event) => {
            if (event.metadata?.[check] !== undefined) return
            asked.push({ sessionID: event.sessionID, action: event.action })
            await hooks.ask?.(event.action)
          })
          // Probe of the result size contract below: one line over 50 KiB, with or without `truncated` set.
          await ctx.tool.transform((editor) =>
            editor.add({
              name: "probe_output",
              description: "Probe output",
              input: { type: "object", properties: { truncated: { type: "boolean" } } },
              options: { codemode: false },
              execute: async (input) => ({
                content: "x".repeat(60 * 1024),
                ...((input as { truncated?: boolean }).truncated ? { metadata: { truncated: false } } : {}),
              }),
            }),
          )
          ready.resolve({ plugin: ctx, files: await localFiles(ctx, profiles) })
        },
      }),
    ),
  )
  yield* pluginsLoaded(context, dir)
  const harness = yield* Effect.promise(() => ready.promise)
  const sessions = Context.get(context, Session.Service)
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  const create = (permissions: Permission.Rule[] = [{ action: "*", resource: "*", effect: "allow" }]) =>
    Effect.gen(function* () {
      const session = yield* sessions.create({
        title: "local file",
        agent: Agent.ID.make("build"),
        model: model.ref,
        location,
      })
      yield* sessions.setPermissions({ sessionID: session.id, permissions })
      return session.id
    })
  // A tool call of a fresh session that allows everything, like 0.4's test context.
  const call = (sessionID?: Session.ID) =>
    Effect.gen(function* () {
      return {
        sessionID: sessionID ?? (yield* create()),
        agent: Agent.ID.make("build"),
        messageID: SessionMessage.ID.create(),
        id: Tool.CallID.make(`call_${randomUUID()}`),
        signal: new AbortController().signal,
        progress: async () => {},
      } satisfies ToolContext
    })
  const prompt = (sessionID: Session.ID, text: string, files?: { uri: string }[]) =>
    sessions.prompt({ sessionID, text, files }).pipe(Effect.andThen(sessions.wait(sessionID)))
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
  // Imports session `sessionID` (rules: allow everything) whose history holds one completed `loginom_file_sample` call
  // with `content`, as 0.4's tests wrote that tool part. The product's own `loginom_file_sample` (last in `post`) keeps
  // its profiles under the machine's data directory, outside the test's `profiles`.
  const sampled = (sessionID: Session.ID, content: string) =>
    Effect.gen(function* () {
      const template = yield* create()
      yield* Effect.promise(async () => {
        const info = await (await handler(new Request(`http://opencode.local/api/session/${template}`))).json()
        const response = await handler(
          new Request("http://opencode.local/api/experimental/session/import", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              info: { ...info.data, id: sessionID },
              location: { directory: dir },
              messages: [
                {
                  id: "msg_sample",
                  type: "assistant",
                  agent: "build",
                  model: model.ref,
                  content: [
                    {
                      type: "tool",
                      id: "call_sample",
                      name: "loginom_file_sample",
                      executed: true,
                      state: { status: "completed", input: {}, content: [{ type: "text", text: content }] },
                      time: { created: 1, ran: 1, completed: 2 },
                    },
                  ],
                  time: { created: 1, completed: 2 },
                },
              ],
            }),
          }),
        )
        if (response.status !== 200) throw new Error(`import: ${response.status} ${await response.text()}`)
      })
    })
  return {
    dir,
    profiles,
    files: harness.files,
    plugin: harness.plugin,
    sessions,
    create,
    call,
    prompt,
    wizard,
    requests,
    sampled,
    hooks,
    asked: (sessionID: string) => asked.filter((item) => item.sessionID === sessionID).map((item) => item.action),
  }
})

// 0.4 offered the product's file tools only beside a prepared Dock, whose catalog describes Dock actions (B2.5d): a
// scripted Host with such a catalog, whose runs already have a browser runtime.
const preparedDock = tmpdirScoped("loginom-local-file-host-").pipe(
  Effect.flatMap((dir) =>
    Effect.acquireRelease(
      Effect.promise(() =>
        ServiceHost.start({
          data: dir.path,
          connect: scriptedHost({ catalog: () => [dockTool("dock_action_describe")], prepared: true }).connect,
        }),
      ),
      () => Effect.promise(() => ServiceHost.close()),
    ),
  ),
)

const truncate = (file: string, size: number) =>
  Effect.promise(async () => {
    const handle = await fs.open(file, "w")
    try {
      await handle.truncate(size)
    } finally {
      await handle.close()
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

describe("loginom local file admission (B2.5a)", () => {
  for (const size of [limit, limit + 1])
    it.live(
      `public local admission selects the byte/reference boundary at ${size}`,
      () =>
        Effect.gen(function* () {
          const test = yield* boot
          const ctx = yield* test.call()
          const source = test.dir + "/source.csv"
          yield* truncate(source, size)
          const references = fileReferences(test.dir + "/references")
          const owner = { chat: ctx.sessionID, userMessage: "msg_original", generation: 1, run: "run" }
          const ipc: unknown[] = []
          const host = {
            reserveReference: (userMessage: string, name: string, snapshot: Parameters<typeof references.reserve>[2]) =>
              references.reserve({ ...owner, userMessage }, name, snapshot),
            discardReference: (grant: string) => references.discard(owner, grant),
            admitReference: async (reference: Parameters<typeof references.commit>[1]) => {
              ipc.push(reference)
              await references.commit(owner, reference)
              return { artifact_id: "reference", bytes: reference.snapshot.size }
            },
            admit: async (_message: string, files: { name: string; data: string }[]) => {
              expect(Buffer.from(files[0].data, "base64").length).toBe(size)
              ipc.push("byte-admission")
              return [{ artifact_id: "bytes", bytes: size }]
            },
          }
          const result = yield* Effect.promise(() => test.files.admit(source, ctx, host, owner.userMessage))
          expect(result.artifact).toMatchObject({ artifact_id: size > limit ? "reference" : "bytes", bytes: size })
          if (size > limit) {
            expect(JSON.stringify(ipc)).not.toMatch(/"(?:data|base64|buffer)":/)
            expect(yield* Effect.promise(() => test.files.admit(source, ctx, host, owner.userMessage))).toEqual(result)
            expect(ipc.length).toBe(1)
          } else expect(ipc).toEqual(["byte-admission"])
          yield* Effect.promise(() => references.close())
        }).pipe(Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )

  it.live(
    "private reference admission authorizes before reserving, references the original over the byte limit and sends only a descriptor",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.call()
        const source = test.dir + "/large.csv"
        yield* truncate(source, limit + 1)
        const references = fileReferences(test.dir + "/references")
        const owner = { chat: ctx.sessionID, userMessage: "msg_original", generation: 1, run: "run" }
        const captured: unknown[] = []
        const result = yield* Effect.promise(() =>
          test.files.admitReference(
            source,
            ctx,
            {
              reserveReference: (userMessage, name, snapshot) =>
                references.reserve({ ...owner, userMessage }, name, snapshot),
              discardReference: (grant) => references.discard(owner, grant),
              admitReference: (reference) => {
                captured.push(JSON.parse(JSON.stringify(reference)))
                return references
                  .commit(owner, reference)
                  .then((value) => ({ bytes: value.snapshot.size, sha256: value.snapshot.sha256 }))
              },
            },
            owner.userMessage,
          ),
        )
        expect(result.artifact).toMatchObject({ bytes: limit + 1 })
        expect(captured[0]).toMatchObject({ snapshot: { canonical_path: source, sha256: null } })
        expect(JSON.stringify(captured)).not.toMatch(/"(?:data|base64|buffer)":/)
        yield* Effect.promise(() => references.close())
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "denied local paths never obtain a private reference reservation",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const ctx = yield* test.call()
        yield* test.sessions.setPermissions({
          sessionID: ctx.sessionID,
          permissions: [{ action: "read", resource: "*", effect: "deny" }],
        })
        const error = yield* rejected(() =>
          test.files.admitReference(
            test.dir + "/private.csv",
            ctx,
            {
              reserveReference: async () => {
                throw Error("Must not reserve before authorization")
              },
              admitReference: async () => {
                throw Error("Must not admit a denied path")
              },
              discardReference: async () => {
                throw Error("Must not discard a denied path")
              },
            },
            "msg_original",
          ),
        )
        expect(error).toBeDefined()
        expect(message(error)).toContain("LOGINOM_FILE_ACCESS_DENIED")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "snapshots the authorized realpath when a symlink changes during a permission request",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const first = test.dir + "/first.csv",
          second = test.dir + "/second.csv",
          alias = test.dir + "/alias.csv"
        yield* Effect.promise(async () => {
          await fs.writeFile(first, Uint8Array.from([0, 255, 1]))
          await fs.writeFile(second, Uint8Array.from([0, 255, 2]))
          await fs.symlink(first, alias)
        })
        const ctx = yield* test.call()
        test.hooks.ask = async (action) => {
          if (action !== "read") return
          await fs.rm(alias)
          await fs.symlink(second, alias)
        }
        const result = yield* Effect.promise(() => test.files.snapshot(alias, ctx))
        expect(test.asked(ctx.sessionID)).toEqual(["read"])
        expect(result.sourcePath).toBe(alias)
        expect(result.file).toEqual({ name: "first.csv", data: Buffer.from([0, 255, 1]).toString("base64") })
        expect(new Uint8Array(yield* Effect.promise(() => fs.readFile(alias)))).toEqual(Uint8Array.from([0, 255, 2]))
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "oversize registration errors include the typed cause, exact limit and next step",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const file = test.dir + "/large.csv"
        yield* truncate(file, limit + 1)
        const ctx = yield* test.call()
        const error = yield* rejected(() => test.files.snapshot(file, ctx))
        expect(error).toBeDefined()
        expect(message(error)).toContain("LOGINOM_FILE_TOO_LARGE")
        expect(message(error)).toContain(file)
        expect(message(error)).toContain('"actual":16777217,"limit":16777216')
        expect(message(error)).toContain("профиль и выборка")
        expect(message(error)).not.toContain("--file")
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // Under root `chmod 0` does not stop a read; at the 0.4 cut point this case failed under root too (B1.1).
  for (const mode of ["missing", "directory", "denied"] as const)
    (mode === "denied" && root ? it.live.skip : it.live)(
      `local file registration reports ${mode} without reading or admitting bytes`,
      () =>
        Effect.gen(function* () {
          const test = yield* boot
          const file = test.dir + "/refused.csv"
          if (mode === "directory") yield* Effect.promise(() => fs.mkdir(file))
          if (mode === "denied")
            yield* Effect.promise(async () => {
              await fs.writeFile(file, "private bytes")
              await fs.chmod(file, 0)
            })
          const ctx = yield* test.call()
          const error = yield* rejected(() => test.files.snapshot(file, ctx))
          if (mode === "denied") yield* Effect.promise(() => fs.chmod(file, 0o600))
          expect(error).toBeDefined()
          expect(message(error)).toContain(
            {
              missing: "LOGINOM_FILE_NOT_FOUND",
              directory: "LOGINOM_FILE_NOT_REGULAR",
              denied: "LOGINOM_FILE_ACCESS_DENIED",
            }[mode],
          )
          expect(message(error)).not.toContain("private bytes")
        }).pipe(Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )

  it.live(
    "configured deny is reported before an OS-inaccessible requested path is resolved",
    () =>
      Effect.gen(function* () {
        if (process.platform === "win32") return
        const test = yield* boot
        const directory = test.dir + "/locked",
          file = directory + "/input.csv"
        yield* Effect.promise(async () => {
          await fs.mkdir(directory)
          await fs.writeFile(file, "private")
        })
        const ctx = yield* test.call()
        yield* test.sessions.setPermissions({
          sessionID: ctx.sessionID,
          permissions: [{ action: "read", resource: "locked/*", effect: "deny" }],
        })
        const error = yield* Effect.acquireUseRelease(
          Effect.promise(() => fs.chmod(directory, 0)),
          () => rejected(() => test.files.snapshot(file, ctx)),
          () => Effect.promise(() => fs.chmod(directory, 0o700)),
        )
        expect(error).toBeInstanceOf(Tool.Error)
        expect((error as Tool.Error).error).toBeInstanceOf(Permission.BlockedError)
        expect(message(error)).toContain("LOGINOM_FILE_ACCESS_DENIED")
        expect(message(error)).not.toMatch(/EACCES|--file/)
        expect((error as Tool.Error).metadata).toEqual({ permissionDenied: true })
        // A configured deny never asks.
        expect(test.asked(ctx.sessionID)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  // 0.4 bound an attachment to a receipt: `stable` re-verified it after authorization, `changed` failed on it. On
  // OpenCode 2 the module takes the receipt itself when the prompt is admitted (B2.5d). The file the user attached
  // authorizes without asking; a changed or missing file and a deny rule fail. `other` and `env` are new: the
  // attachment authorizes only its own file, and the rules-only check of a file the build agent would ask about
  // (`*.env`) asks nothing either.
  for (const mode of ["stable", "changed", "deleted", "deny", "other", "env"] as const)
    it.live(
      `attachment authorization: ${mode}`,
      () =>
        Effect.gen(function* () {
          const test = yield* boot
          const file = test.dir + (mode === "env" ? "/settings.env" : "/данные %#.csv")
          const other = test.dir + "/other.csv"
          yield* Effect.promise(async () => {
            await fs.writeFile(file, "amount\n10\n")
            await fs.writeFile(other, "amount\n20\n")
          })
          // `env` keeps only the build agent's rules, so a `*.env` read would ask.
          const ctx = yield* test.call(mode === "env" ? yield* test.create([]) : undefined)
          yield* test.prompt(ctx.sessionID, script({ text: "attached" }), [{ uri: pathToFileURL(file).href }])
          if (mode === "changed") yield* Effect.promise(() => fs.writeFile(file, "amount\n999\n"))
          if (mode === "deleted") yield* Effect.promise(() => fs.rm(file))
          if (mode === "deny")
            yield* test.sessions.setPermissions({
              sessionID: ctx.sessionID,
              permissions: [{ action: "read", resource: "*", effect: "deny" }],
            })
          const authorized = yield* Effect.promise(() =>
            test.files.authorize(mode === "other" ? other : file, ctx).then(
              (value) => ({ value, error: undefined }),
              (error: unknown) => ({ value: undefined, error }),
            ),
          )
          // Attached input never asks again; another file does.
          expect(test.asked(ctx.sessionID)).toEqual(mode === "other" ? ["read"] : [])
          if (mode === "stable") {
            if (!authorized.value) throw authorized.error
            // The receipt is checked again before admission: a change after authorization fails it.
            const verify = authorized.value.verifyAttachment
            expect(yield* rejected(verify)).toBeUndefined()
            yield* Effect.promise(() => fs.writeFile(file, "after authorization"))
            expect(message(yield* rejected(verify))).toContain("LOGINOM_FILE_CHANGED")
            return
          }
          if (mode === "other" || mode === "env") {
            expect(authorized.error).toBeUndefined()
            return
          }
          expect(authorized.error).toBeDefined()
          expect(message(authorized.error)).toContain(
            {
              changed: "LOGINOM_FILE_CHANGED",
              deleted: "LOGINOM_FILE_NOT_FOUND",
              deny: "LOGINOM_FILE_ACCESS_DENIED",
            }[mode],
          )
        }).pipe(Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )

  for (const mode of [
    "own",
    "other-session",
    "parent",
    "unissued",
    "traversal",
    "symlink",
    "directory-symlink",
    "changed",
    "malformed",
    "deny",
    "case",
  ] as const)
    it.live(
      `sample authorization: ${mode}`,
      () =>
        Effect.gen(function* () {
          if (mode === "case" && process.platform !== "win32") return
          const test = yield* boot
          // The session whose history holds the sample's receipt.
          const owner = Session.ID.create()
          const dir = path.join(test.profiles, owner)
          const outside = dir + "-outside"
          const external = path.join(outside, "input.csv")
          // As in 0.4: the sample comes from `profileFile` and `sampleFile`, and its receipt is their result.
          const sample = yield* Effect.promise(async () => {
            await fs.mkdir(outside, { recursive: true })
            await fs.writeFile(external, "outside")
            const source = path.join(test.dir, "input.csv")
            await fs.writeFile(source, "region;amount\nNorth;25\nSouth;50\n")
            const profile = await profileFile(source, dir)
            return sampleFile(profile.profile_id, dir, { max_records: 1 })
          })
          yield* test.sampled(owner, mode === "malformed" ? "invalid JSON" : JSON.stringify(sample))
          const ctx = yield* test.call(mode === "other-session" ? undefined : owner)
          const file =
            mode === "parent"
              ? path.join(dir, "..", path.basename(sample.path))
              : mode === "unissued"
                ? path.join(dir, "unissued.csv")
                : mode === "traversal"
                  ? dir + "/../" + owner + "/" + path.basename(sample.path)
                  : mode === "case"
                    ? sample.path.toUpperCase()
                    : sample.path
          if (mode === "parent" || mode === "unissued")
            yield* Effect.promise(() => fs.writeFile(file, "region;amount\nNorth;25\n"))
          if (mode === "symlink")
            yield* Effect.promise(async () => {
              await fs.rm(sample.path)
              await fs.symlink(external, sample.path)
            })
          if (mode === "directory-symlink")
            yield* Effect.promise(async () => {
              const moved = path.join(outside, "moved")
              await fs.rename(dir, moved)
              await fs.symlink(moved, dir, process.platform === "win32" ? "junction" : "dir")
            })
          if (mode === "changed") yield* Effect.promise(() => fs.writeFile(sample.path, "changed"))
          if (mode === "deny")
            yield* test.sessions.setPermissions({
              sessionID: ctx.sessionID,
              permissions: [{ action: "external_directory", resource: "*", effect: "deny" }],
            })
          const error = yield* rejected(() =>
            test.files.admit(
              file,
              ctx,
              {
                admit: async () => [{ artifact_id: "sample" }],
                reserveReference: async () => {
                  throw Error("Small sample must use byte admission")
                },
                admitReference: async () => {
                  throw Error("Small sample must use byte admission")
                },
                discardReference: async () => {},
              },
              "sample-message",
            ),
          )
          const asks = test.asked(ctx.sessionID)
          if (mode === "deny") {
            expect(error).toBeDefined()
            expect(asks).toEqual([])
            return
          }
          expect(error).toBeUndefined()
          expect(asks.includes("external_directory")).toBe(mode !== "own" && mode !== "case")
        }).pipe(Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )

  it.live(
    "loginom_file_admit asks for itself, then admits the file into the task's Host run; without a lease it does neither",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const file = test.dir + "/input.csv"
        yield* Effect.promise(() => fs.writeFile(file, "amount\n10\n"))
        const admitted: { userMessage: string; name: string }[] = []
        const lease: Lease = {
          userMessage: "msg_task",
          host: {
            generation: 7,
            admit: async (userMessage, files) => {
              admitted.push({ userMessage, name: files[0].name })
              return [{ artifact_id: "bytes" }]
            },
            reserveReference: async () => {
              throw Error("Small file must use byte admission")
            },
            admitReference: async () => {
              throw Error("Small file must use byte admission")
            },
            discardReference: async () => {},
          },
        }
        const ctx = yield* test.call()
        const result = yield* Effect.promise(() =>
          test.files.admitTool(() => lease).execute({ path: "input.csv" }, ctx),
        )
        expect(test.asked(ctx.sessionID)).toEqual(["loginom_file_admit", "read"])
        expect(JSON.parse(String(result.content))).toEqual({ source_path: file, artifact: { artifact_id: "bytes" } })
        expect(result.metadata).toEqual({ generation: 7, truncated: false })
        expect(admitted).toEqual([
          { userMessage: JSON.stringify(["local-file", ctx.messageID, ctx.id]), name: "input.csv" },
        ])

        const idle = yield* test.call()
        const error = yield* rejected(() => test.files.admitTool(() => undefined).execute({ path: "input.csv" }, idle))
        expect(message(error)).toContain("LOGINOM_HOST_NOT_READY")
        expect(test.asked(idle.sessionID)).toEqual([])

        // A deny rule on the tool fails with the file's path and reads nothing.
        const denied = yield* test.call()
        yield* test.sessions.setPermissions({
          sessionID: denied.sessionID,
          permissions: [{ action: "loginom_file_admit", resource: "*", effect: "deny" }],
        })
        const refused = yield* rejected(() => test.files.admitTool(() => lease).execute({ path: "input.csv" }, denied))
        expect(message(refused)).toContain("LOGINOM_FILE_ACCESS_DENIED")
        expect(message(refused)).toContain(file)
        expect(admitted).toHaveLength(1)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a rejection with feedback fails with the file and the next step; a plain rejection stays OpenCode's decline",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        // The build agent asks before reading `*.env`; without session rules the read waits for the user.
        const file = test.dir + "/secret.env"
        yield* Effect.promise(() => fs.writeFile(file, "TOKEN=x\n"))
        const answer = (message?: string) =>
          Effect.gen(function* () {
            const ctx = yield* test.call(yield* test.create([]))
            const pending = test.files.authorize(file, ctx).then(
              () => undefined,
              (error: unknown) => error,
            )
            const request = yield* until(() =>
              Effect.promise(() => test.plugin.permission.list({ sessionID: ctx.sessionID })).pipe(
                Effect.map((requests) => requests[0]),
              ),
            )
            expect(request.action).toBe("read")
            yield* Effect.promise(() =>
              test.plugin.permission.reply({
                sessionID: ctx.sessionID,
                requestID: request.id,
                decision: "reject",
                message,
              }),
            )
            return yield* Effect.promise(() => pending)
          })
        const corrected = yield* answer("use the attached copy")
        expect(corrected).toBeInstanceOf(Tool.Error)
        expect((corrected as Tool.Error).error).toBeInstanceOf(Permission.CorrectedError)
        expect(message(corrected)).toContain("LOGINOM_FILE_ACCESS_DENIED")
        expect(message(corrected)).toContain("use the attached copy")
        expect(message(corrected)).toContain(file)
        expect(message(corrected)).toContain("через --file")
        expect((corrected as Tool.Error).metadata).toEqual({ permissionDenied: true })
        expect(yield* answer()).toBeInstanceOf(Permission.DeclinedError)
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a stopped call admits nothing: before authorization, before reserving and after reserving a reference",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const source = test.dir + "/large.csv"
        yield* truncate(source, limit + 1)
        const stopped = new AbortController()
        stopped.abort()
        const idle = yield* test.call()
        const before = yield* rejected(() => test.files.authorize(source, { ...idle, signal: stopped.signal }))
        expect(before).toBeInstanceOf(DOMException)
        expect(test.asked(idle.sessionID)).toEqual([])

        // A stop while the user answers the read request: authorization completes, nothing is reserved.
        const asking = new AbortController()
        const reserving = new AbortController()
        const reserved: string[] = []
        const discarded: string[] = []
        const host = {
          reserveReference: async () => {
            reserved.push("reserve")
            reserving.abort()
            return { grant: "grant" } as never
          },
          discardReference: async (grant: string) => {
            discarded.push(grant)
          },
          admitReference: async () => {
            throw Error("Must not admit a stopped call")
          },
        }
        test.hooks.ask = async () => asking.abort()
        const early = yield* test.call()
        const first = yield* rejected(() =>
          test.files.admitReference(source, { ...early, signal: asking.signal }, host, "msg_original"),
        )
        expect(message(first)).toContain("LOGINOM_UPLOAD_CANCELLED")
        expect(reserved).toEqual([])

        // A stop while the Host reserves: the grant is discarded.
        test.hooks.ask = undefined
        const late = yield* test.call()
        const second = yield* rejected(() =>
          test.files.admitReference(source, { ...late, signal: reserving.signal }, host, "msg_original"),
        )
        expect(message(second)).toContain("LOGINOM_UPLOAD_CANCELLED")
        expect(reserved).toEqual(["reserve"])
        expect(discarded).toEqual(["grant"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the product's loginom_file_admit is hidden and rejected without the loginom-automation grant (G1 gate)",
    () =>
      Effect.gen(function* () {
        yield* preparedDock
        const test = yield* boot
        yield* Effect.promise(() => fs.writeFile(path.join(test.dir, "input.csv"), "amount\n10\n"))
        const call = script({ tool: "loginom_file_admit", input: { path: "input.csv" } }, { text: "end" })
        // No grant: not offered, and a call is rejected by the gate before the tool runs.
        const plain = yield* test.create()
        yield* test.prompt(plain, call)
        const [first, second] = yield* test.requests(plain)
        expect(names(first)).not.toContain("loginom_file_admit")
        expect(JSON.stringify(second.messages)).toContain("LOGINOM_SCOPE_DENIED")
        expect(JSON.stringify(second.messages)).not.toContain("LOGINOM_HOST_NOT_READY")

        // package-docs: the same.
        const docs = yield* test.create()
        yield* test.wizard(docs, "package-docs", call)
        const docsRequests = yield* test.requests(docs)
        expect(names(docsRequests[0])).not.toContain("loginom_file_admit")
        expect(JSON.stringify(docsRequests[1].messages)).toContain("LOGINOM_SCOPE_DENIED")

        // loginom-automation: offered with 0.4's name, description and input beside the prepared Dock, and the call goes
        // through the tool to the Host, which admits the file into the task's run.
        const granted = yield* test.create()
        yield* test.wizard(granted, "loginom-automation", call)
        const grantedRequests = yield* test.requests(granted)
        expect(grantedRequests[0].tools.find((tool) => tool.name === "loginom_file_admit")).toMatchObject({
          description: admitDescription,
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
          },
        })
        expect(JSON.stringify(grantedRequests[1].messages)).toContain("artifact-1")
        expect(JSON.stringify(grantedRequests[1].messages)).not.toContain("LOGINOM_SCOPE_DENIED")
        for (const sessionID of [plain, docs]) expect(test.asked(sessionID)).toEqual([])
        expect(test.asked(granted)).toEqual(["loginom_file_admit", "read"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

// The file profile tools of the product plugin (B2.5b1), ported from 0.4
// `a080f7725c:packages/opencode/src/tool/loginom-file-profile.ts`; the profile core has its own test in
// `packages/loginom-agent`. The harness builds the tools over its own `localFiles` and calls them with a synthetic tool
// call, as the cases above call `admitTool`. The re-authorization cases come from 0.4 `test/session/profile-tools.test.ts`.
describe("loginom file profile tools (B2.5b1)", () => {
  const tools = (files: Parameters<typeof fileTools>[0], profiles: string) =>
    Object.fromEntries(fileTools(files, profiles).map((tool) => [tool.name, tool]))
  const content = (result: { content?: unknown }) => JSON.parse(String(result.content))

  it.live(
    "each tool asks for itself and re-authorizes the original; the sample's result admits the sample without a question",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const file = test.dir + "/input.csv"
        yield* Effect.promise(() => fs.writeFile(file, "region;amount\nNorth;25\nSouth;50\n"))
        const ctx = yield* test.call()
        const tool = tools(test.files, test.profiles)
        // A relative path resolves against the Location directory, not the service's working directory.
        const profile = yield* Effect.promise(() => tool.loginom_file_profile.execute({ path: "input.csv" }, ctx))
        expect(profile.metadata).toEqual({ truncated: false })
        const profiled = content(profile)
        expect(profiled).toMatchObject({ format: "csv", identity: { canonical_path: file }, settings_complete: true })
        const scan = content(
          yield* Effect.promise(() => tool.loginom_file_scan.execute({ profile_id: profiled.profile_id }, ctx)),
        )
        expect(scan).toMatchObject({ profile_id: profiled.profile_id, status: "exact", records: 2 })
        expect(scan.index).toBeUndefined()
        const result = yield* Effect.promise(() =>
          tool.loginom_file_sample.execute({ profile_id: profiled.profile_id, max_records: 1 }, ctx),
        )
        const sample = content(result)
        expect(path.dirname(sample.path)).toBe(path.join(test.profiles, ctx.sessionID))
        expect(sample).toMatchObject({ manifest_path: sample.path + ".manifest.json", offset_count: 2 })
        expect(sample.manifest.offsets).toBeUndefined()
        expect(sample.manifest.sha256).toBe(
          createHash("sha256")
            .update(yield* Effect.promise(() => fs.readFile(sample.path)))
            .digest("hex"),
        )
        expect(test.asked(ctx.sessionID)).toEqual([
          "loginom_file_profile",
          "read",
          "loginom_file_scan",
          "read",
          "loginom_file_sample",
          "read",
        ])
        // The receipt stays far below the 50 KiB at which OpenCode cuts a result; a set `truncated` skips the cut.
        expect(result.metadata).toEqual({ truncated: false })
        expect(Buffer.byteLength(String(result.content))).toBeLessThan(8 * 1024)

        // The same session with the call in its history: the result is the receipt that admits the sample.
        yield* test.sessions.remove(ctx.sessionID)
        yield* test.sampled(ctx.sessionID, String(result.content))
        const admitted = yield* Effect.promise(() => test.files.authorize(sample.path, ctx))
        expect(admitted.canonicalPath).toBe(sample.path)
        expect(test.asked(ctx.sessionID).slice(6)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "an XLSX workbook goes through the same tools, and its sample's result admits the XLSX sample (B2.5b2)",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        // 16 columns, one header row and two records; 0.4's C1 case for native Excel import.
        yield* Effect.promise(() =>
          fs.copyFile(
            new URL(
              "../../../docs/node-development/nodes/imports-excel/acceptance/capabilities/fixtures/wide16.xlsx",
              import.meta.url,
            ),
            test.dir + "/wide16.xlsx",
          ),
        )
        const ctx = yield* test.call()
        const tool = tools(test.files, test.profiles)
        const profile = yield* Effect.promise(() => tool.loginom_file_profile.execute({ path: "wide16.xlsx" }, ctx))
        const profiled = content(profile)
        expect(profiled).toMatchObject({ format: "xlsx", columns_total: 16, settings_complete: true })
        expect(profile.metadata).toEqual({ truncated: false })
        const scan = content(
          yield* Effect.promise(() => tool.loginom_file_scan.execute({ profile_id: profiled.profile_id }, ctx)),
        )
        expect(scan).toMatchObject({ profile_id: profiled.profile_id, status: "exact", records: 2 })
        const result = yield* Effect.promise(() =>
          tool.loginom_file_sample.execute({ profile_id: profiled.profile_id }, ctx),
        )
        const sample = content(result)
        expect(sample.path.endsWith(".xlsx")).toBe(true)
        expect(path.dirname(sample.path)).toBe(path.join(test.profiles, ctx.sessionID))
        expect(sample).toMatchObject({ offset_count: 2, manifest: { format: "xlsx", records: 2 } })
        expect(sample.manifest.offsets).toBeUndefined()
        expect(sample.manifest.sha256).toBe(
          createHash("sha256")
            .update(yield* Effect.promise(() => fs.readFile(sample.path)))
            .digest("hex"),
        )
        expect(test.asked(ctx.sessionID)).toEqual([
          "loginom_file_profile",
          "read",
          "loginom_file_scan",
          "read",
          "loginom_file_sample",
          "read",
        ])
        expect(result.metadata).toEqual({ truncated: false })
        expect(Buffer.byteLength(String(profile.content))).toBeLessThan(8 * 1024)
        expect(Buffer.byteLength(String(result.content))).toBeLessThan(8 * 1024)

        yield* test.sessions.remove(ctx.sessionID)
        yield* test.sampled(ctx.sessionID, String(result.content))
        expect((yield* Effect.promise(() => test.files.authorize(sample.path, ctx))).canonicalPath).toBe(sample.path)
        expect(test.asked(ctx.sessionID).slice(6)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  for (const change of ["disappears", "changes", "is replaced", "symlink is redirected"] as const) {
    const code = change === "disappears" ? "LOGINOM_FILE_NOT_FOUND" : "LOGINOM_FILE_CHANGED"
    it.live(
      `profile tools preserve ${code} when the original file ${change} before reauthorization`,
      () =>
        Effect.gen(function* () {
          const test = yield* boot
          const file = test.dir + "/profile-source.csv"
          yield* Effect.promise(async () => {
            if (change !== "symlink is redirected") return fs.writeFile(file, "region;amount\nNorth;1,25\n")
            await fs.writeFile(file + ".target", "region;amount\nNorth;1,25\n")
            await fs.symlink(file + ".target", file)
          })
          const ctx = yield* test.call()
          const tool = tools(test.files, test.profiles)
          const id = content(yield* Effect.promise(() => tool.loginom_file_profile.execute({ path: file }, ctx)))
            .profile_id
          yield* Effect.promise(async () => {
            if (change === "disappears") await fs.rm(file)
            if (change === "changes") await fs.writeFile(file, "region;amount\nNorth;1,25\nSouth;2,5\n")
            if (change === "is replaced") {
              await fs.rename(file, file + ".old")
              await fs.writeFile(file, "region;amount\nNorth;1,25\n")
            }
            if (change === "symlink is redirected") {
              await fs.writeFile(file + ".new", "region;amount\nNorth;1,25\n")
              await fs.rm(file)
              await fs.symlink(file + ".new", file)
            }
          })
          for (const name of ["loginom_file_scan", "loginom_file_sample"])
            expect(message(yield* rejected(() => tool[name].execute({ profile_id: id }, ctx)))).toContain(code)
        }).pipe(Effect.provideService(Flag.Overrides, undefined)),
      timeout,
    )
  }

  it.live(
    "a symlink redirected during the read question fails the profile, and the other file is not profiled",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const first = test.dir + "/first.csv",
          second = test.dir + "/second.csv",
          alias = test.dir + "/alias.csv"
        yield* Effect.promise(async () => {
          await fs.writeFile(first, "region;amount\nNorth;25\n")
          await fs.writeFile(second, "private;value\nhidden;1\n")
          await fs.symlink(first, alias)
        })
        const ctx = yield* test.call()
        test.hooks.ask = async (action) => {
          if (action !== "read") return
          await fs.rm(alias)
          await fs.symlink(second, alias)
        }
        const error = yield* rejected(() =>
          tools(test.files, test.profiles).loginom_file_profile.execute({ path: "alias.csv" }, ctx),
        )
        test.hooks.ask = undefined
        expect(message(error)).toContain("LOGINOM_FILE_CHANGED")
        expect(message(error)).not.toContain("hidden")
        const stored = yield* Effect.promise(() =>
          fs.readdir(path.join(test.profiles, ctx.sessionID)).catch(() => [] as string[]),
        )
        expect(stored).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a scan stopped during its question stays partial; a profile of another session is unknown there",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        yield* Effect.promise(() => fs.writeFile(test.dir + "/input.csv", "region;amount\nNorth;25\nSouth;50\n"))
        const ctx = yield* test.call()
        const tool = tools(test.files, test.profiles)
        const id = content(yield* Effect.promise(() => tool.loginom_file_profile.execute({ path: "input.csv" }, ctx)))
          .profile_id
        const stop = new AbortController()
        test.hooks.ask = async (action) => {
          if (action === "read") stop.abort()
        }
        const scan = content(
          yield* Effect.promise(() =>
            tool.loginom_file_scan.execute({ profile_id: id }, { ...ctx, signal: stop.signal }),
          ),
        )
        test.hooks.ask = undefined
        expect(scan).toMatchObject({ profile_id: id, status: "partial", records_observed: 0 })
        expect(scan.records).toBeUndefined()

        const other = yield* test.call()
        expect(yield* rejected(() => tool.loginom_file_scan.execute({ profile_id: id }, other))).toBeDefined()
        expect(test.asked(other.sessionID)).toEqual([])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the product's file profile tools are hidden and rejected without the loginom-automation grant (G1 gate)",
    () =>
      Effect.gen(function* () {
        yield* preparedDock
        const test = yield* boot
        const profileTools = ["loginom_file_profile", "loginom_file_scan", "loginom_file_sample"]
        // Each input fails inside its tool before a profile is written: the product's own tools keep profiles under
        // the machine's data directory.
        const calls = script(
          { tool: "loginom_file_profile", input: { path: "missing.csv" } },
          { tool: "loginom_file_scan", input: { profile_id: "unknown" } },
          { tool: "loginom_file_sample", input: { profile_id: "unknown" } },
          { text: "end" },
        )
        const refused = (requests: LLMRequest[]) => {
          for (const name of profileTools) expect(names(requests[0])).not.toContain(name)
          const answers = JSON.stringify(requests[3].messages)
          for (const name of profileTools) expect(answers).toContain(`LOGINOM_SCOPE_DENIED: tool ${name}`)
          expect(answers).not.toMatch(/LOGINOM_FILE_(?:NOT_FOUND|FORMAT_AMBIGUOUS)/)
        }
        // No grant, and package-docs: not offered, and every call is rejected by the gate before the tool runs.
        const plain = yield* test.create()
        yield* test.prompt(plain, calls)
        refused(yield* test.requests(plain))
        const docs = yield* test.create()
        yield* test.wizard(docs, "package-docs", calls)
        refused(yield* test.requests(docs))

        // loginom-automation: 0.4's file tools, offered with the product's definitions beside the prepared Dock, and each
        // call reaches its tool.
        const granted = yield* test.create()
        yield* test.wizard(granted, "loginom-automation", calls)
        const grantedRequests = yield* test.requests(granted)
        expect(
          names(grantedRequests[0])
            .filter((name) => name.startsWith("loginom_file_"))
            .sort(),
        ).toEqual(["loginom_file_admit", "loginom_file_profile", "loginom_file_sample", "loginom_file_scan"])
        for (const tool of fileTools(test.files, test.profiles))
          expect(grantedRequests[0].tools.find((item) => item.name === tool.name)).toMatchObject({
            description: tool.description,
            inputSchema: tool.input,
          })
        const answers = JSON.stringify(grantedRequests[3].messages)
        expect(answers).toContain("LOGINOM_FILE_NOT_FOUND")
        expect(answers.split("unknown profile_id in this session")).toHaveLength(3)
        expect(answers).not.toContain("LOGINOM_SCOPE_DENIED")
        expect(test.asked(plain)).toEqual([])
        expect(test.asked(docs)).toEqual([])
        expect(test.asked(granted)).toEqual(["loginom_file_profile"])
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

// A sample's result is its receipt, read back from the session's history (`local-file.ts`). The file tools set
// `truncated`, as in 0.4, and rest on OpenCode leaving such a result whole.
describe("tool result size contract (B2.5b1)", () => {
  it.live(
    "a result with `truncated` set reaches the history whole; without it OpenCode cuts it at 50 KiB",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const sessionID = yield* test.create()
        yield* test.prompt(
          sessionID,
          script({ tool: "probe_output", input: { truncated: true } }, { tool: "probe_output", input: {} }, { text: "end" }),
        )
        const history = yield* Effect.promise(() => test.plugin.session.context({ sessionID }))
        const results = history.flatMap((message) =>
          message.type !== "assistant"
            ? []
            : message.content.flatMap((part) =>
                part.type === "tool" && part.name === "probe_output" && part.state.status === "completed"
                  ? [part.state]
                  : [],
              ),
        )
        const texts = results.map((state) =>
          state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n"),
        )
        expect(texts).toHaveLength(2)
        expect(texts[0]).toBe("x".repeat(60 * 1024))
        expect(results[0].metadata).toEqual({ truncated: false })
        expect(Buffer.byteLength(texts[1])).toBeLessThan(60 * 1024)
        expect(texts[1]).toContain("full output saved to")
        expect(results[1].metadata).toMatchObject({ truncated: true })
      }).pipe(Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})

// The rules-only check of local file admission (0.4 `checkDeny`) rests on this order in `Permission.assert`.
describe("permission.evaluate contract (B2.5a)", () => {
  it.live(
    "a configured deny is settled before plugin hooks; a hook's allow answers an ask without a prompt",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const probe = randomUUID()
        yield* Effect.promise(() =>
          test.plugin.permission.hook("evaluate", (event) => {
            if (event.metadata?.probe === probe) event.effect = "allow"
          }),
        )
        const assert = (sessionID: Session.ID) =>
          rejected(() =>
            test.plugin.permission.assert({ sessionID, action: "read", resources: ["data.env"], metadata: { probe } }),
          )
        // No session rules: the build agent asks before reading `*.env`; the hook allows it and nothing is pending.
        const open = yield* test.create([])
        expect(yield* assert(open)).toBeUndefined()
        expect(yield* Effect.promise(() => test.plugin.permission.list({ sessionID: open }))).toEqual([])
        // A deny rule wins over the hook.
        const denied = yield* test.create([{ action: "read", resource: "*", effect: "deny" }])
        const error = yield* assert(denied)
        expect(error).toBeInstanceOf(Tool.Error)
        expect((error as Tool.Error).error).toBeInstanceOf(Permission.BlockedError)
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
