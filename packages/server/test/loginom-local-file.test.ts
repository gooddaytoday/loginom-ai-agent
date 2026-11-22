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
import { localFiles, type Lease } from "../../loginom-agent/src/local-file"
import { createEmbeddedRoutes } from "../src/routes"
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
          // Stand-in for B2.5b's sample tool: its completed result is the receipt the module reads from history.
          await ctx.tool.transform((editor) =>
            editor.add({
              name: "loginom_file_sample",
              description: "Stand-in sample tool",
              input: { type: "object", properties: { receipt: { type: "string" } }, required: ["receipt"] },
              options: { codemode: false },
              execute: async (input) => ({ content: (input as { receipt: string }).receipt }),
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
    hooks,
    asked: (sessionID: string) => asked.filter((item) => item.sessionID === sessionID).map((item) => item.action),
  }
})

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

  // 0.4 bound an attachment to a receipt (`stable` re-verified it after authorization, `changed` failed on it). OpenCode
  // 2 keeps the attached file's URI as its source and has no field for a receipt: those two checks wait for B2.5d. The
  // file the user attached authorizes without asking; a missing file and a deny rule still fail. `other` and `env` are
  // new: the attachment authorizes only its own file, and the rules-only check of a file the build agent would ask
  // about (`*.env`) asks nothing either.
  for (const mode of ["stable", "deleted", "deny", "other", "env"] as const)
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
          if (mode === "deleted") yield* Effect.promise(() => fs.rm(file))
          if (mode === "deny")
            yield* test.sessions.setPermissions({
              sessionID: ctx.sessionID,
              permissions: [{ action: "read", resource: "*", effect: "deny" }],
            })
          const error = yield* rejected(() => test.files.authorize(mode === "other" ? other : file, ctx))
          // Attached input never asks again; another file does.
          expect(test.asked(ctx.sessionID)).toEqual(mode === "other" ? ["read"] : [])
          if (mode === "stable" || mode === "other" || mode === "env") {
            expect(error).toBeUndefined()
            return
          }
          expect(error).toBeDefined()
          expect(message(error)).toContain(
            { deleted: "LOGINOM_FILE_NOT_FOUND", deny: "LOGINOM_FILE_ACCESS_DENIED" }[mode],
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
          const ctx = yield* test.call()
          const other = yield* test.call()
          const owner = mode === "other-session" ? other : ctx
          const dir = path.join(test.profiles, owner.sessionID)
          const outside = dir + "-outside"
          const external = path.join(outside, "input.csv")
          // 0.4 made the sample with B2.5b's `profileFile` and `sampleFile`; until then the receipt is written here: a
          // sample file in the session's `file-profiles` and its SHA-256.
          const sample = yield* Effect.promise(async () => {
            await fs.mkdir(outside, { recursive: true })
            await fs.writeFile(external, "outside")
            await fs.writeFile(path.join(test.dir, "input.csv"), "region;amount\nNorth;25\nSouth;50\n")
            await fs.mkdir(dir, { recursive: true })
            const file = path.join(dir, `${randomUUID()}.sample.csv`)
            const bytes = "region;amount\nNorth;25\n"
            await fs.writeFile(file, bytes)
            return { path: file, manifest: { sha256: createHash("sha256").update(bytes).digest("hex") } }
          })
          yield* test.wizard(
            owner.sessionID,
            "loginom-automation",
            script(
              {
                tool: "loginom_file_sample",
                input: { receipt: mode === "malformed" ? "invalid JSON" : JSON.stringify(sample) },
              },
              { text: "sampled" },
            ),
          )
          const file =
            mode === "parent"
              ? path.join(dir, "..", path.basename(sample.path))
              : mode === "unissued"
                ? path.join(dir, "unissued.csv")
                : mode === "traversal"
                  ? dir + "/../" + owner.sessionID + "/" + path.basename(sample.path)
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
    "the product's loginom_file_admit is hidden and rejected without the loginom-automation grant (G1 gate)",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
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

        // loginom-automation: offered with 0.4's name, description and input, and the call reaches the tool. There is no
        // Host lease before B2.3, so the tool answers LOGINOM_HOST_NOT_READY.
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
        expect(JSON.stringify(grantedRequests[1].messages)).toContain("LOGINOM_HOST_NOT_READY")
        expect(JSON.stringify(grantedRequests[1].messages)).not.toContain("LOGINOM_SCOPE_DENIED")
        for (const sessionID of [plain, docs, granted]) expect(test.asked(sessionID)).toEqual([])
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
