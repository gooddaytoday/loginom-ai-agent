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
import { Context, Effect, Layer, Schema } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient, type LLMRequest } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { initGit } from "../../core/test/fixture/git"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { Dashboard } from "../../loginom-agent/src/dashboard"
import { deniedText, policyDeniedText } from "../../loginom-agent/src/permissions"
import { temporaryData } from "../../loginom-agent/test/fixture/temporary-data"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { createEmbeddedRoutes } from "../src/routes"
import { pluginsLoaded } from "./fixture/routes"

// Paths of a dashboard session (guarantee G1, B2.9c) on a real server with OpenCode's own file tools and a scripted
// model: 0.4 `v0.4.0:packages/opencode/test/tool/dashboard-guard.test.ts` without its LSP cases (OpenCode 2 has no LSP
// runtime in its file tools) and without the two cases of the draft binding (B2.9d). A session reads only its work
// folder and writes only in its `src`, by the real path, and is never asked: a client answers every question once, as
// `run --auto` does, and records what it was asked. A refused call tells the model why and the turn goes on (B2.6b).
// The dashboard's folder lies under the plugin's data root, the case's own temporary directory (`temporaryData`):
// `<data>/dashboards/files-*/{work/{src,sample.json,snapshot.json},control/binding.json}`. A user message carries its
// script as `SCRIPT<json>SCRIPT`: one entry per step.

type Step = { tool: string; input?: unknown } | { text: string }
const script = (...steps: Step[]) => `SCRIPT<${JSON.stringify(steps)}>SCRIPT`
// Each case boots one or more server Locations and runs up to 30 scripted steps.
const timeout = 30_000
const ok = "completed"
const no = Dashboard.deniedText

// `git` makes the dashboard's folder a git repository, so Core counts `control` and `..` as the project's own and asks
// no `external_directory` question: only the plugin's own check stands. `at` opens the Location in the work folder, at
// an alias outside that links to it, or in an ordinary project. `user` is the user's config, `work` a config file at the
// work folder's root (B2.9h writes one), `policies` the administrator's (B2.6c). `model` is the model's ID: OpenCode
// offers `patch` instead of `edit` and `write` to GPT models.
type Options = {
  git?: boolean
  at?: "work" | "alias" | "ordinary"
  user?: Record<string, unknown>
  work?: Record<string, unknown>
  policies?: readonly Record<string, unknown>[]
  model?: string
}

const boot = (options: Options = {}) =>
  Effect.gen(function* () {
    const dir = (yield* tmpdirScoped("loginom-dashboard-files-")).path
    yield* Effect.acquireRelease(
      Effect.promise(() => temporaryData()),
      (data) => Effect.promise(() => data[Symbol.asyncDispose]()),
    )
    const global = path.join(dir, "global")
    const system = path.join(global, "system")
    // The bundled skill catalog, verified as in an installation (B2.4; its verifier needs `npm ci` in
    // `packages/loginom-runtime/client`), which holds all three product skills, the dashboard's own among them.
    const resources = path.join(dir, "resources")
    yield* Effect.promise(async () => {
      for (const name of ["loginom-automation", "package-docs", "loginom-dashboard"])
        await Bun.write(
          path.join(resources, "skills", name, "SKILL.md"),
          `---\nname: ${name}\ndescription: Bundled ${name}.\n---\n\nBUNDLED ${name}\n`,
        )
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
    const folder = yield* Effect.promise(async () => {
      await fs.mkdir(Dashboard.root(), { recursive: true })
      const root = await fs.mkdtemp(path.join(Dashboard.root(), "files-"))
      const work = path.join(root, "work")
      const control = path.join(root, "control")
      const files = {
        [path.join(control, "binding.json")]: "control synthetic\n",
        [path.join(work, "sample.json")]: "sample synthetic\n",
        [path.join(work, "snapshot.json")]: "snapshot synthetic\n",
        [path.join(work, "src", "main.tsx")]: "main synthetic\n",
        [path.join(dir, "project", "sample.json")]: "ordinary synthetic\n",
        [path.join(dir, "outside.txt")]: "outside synthetic\n",
        ...(options.user
          ? { [path.join(global, "config", "loginom-ai-agent.json")]: JSON.stringify(options.user) }
          : {}),
        ...(options.work ? { [path.join(work, "loginom-ai-agent.json")]: JSON.stringify(options.work) } : {}),
        ...(options.policies
          ? { [path.join(system, "loginom-ai-agent.json")]: JSON.stringify({ policies: options.policies }) }
          : {}),
      }
      for (const [file, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(file), { recursive: true })
        await Bun.write(file, text)
      }
      await fs.mkdir(path.join(global, "config"), { recursive: true })
      if (options.git) await initGit(root)
      if (options.at === "alias") await fs.symlink(work, path.join(dir, "alias"), "dir")
      return { root, work, control }
    })
    const directory =
      options.at === "alias"
        ? path.join(dir, "alias")
        : options.at === "ordinary"
          ? path.join(dir, "project")
          : folder.work
    const location = Location.Ref.make({ directory: AbsolutePath.make(directory) })
    const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
    yield* llm.serve(respond)
    const model = SessionRunnerModel.resolved(
      LanguageModel.make({
        id: options.model ?? "loginom-dashboard-files-model",
        provider: "test",
        route: OpenAIChat.route,
      }),
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
          config: { claude: false },
          models: { fetch: false, snapshot: false },
          fs: { filewatcher: false, fff: false },
        },
        [
          // Home and profile live in the case's directory; the user's config is `global/config`.
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
          ...(options.policies ? [Config.node.replace(Config.configured({ claude: false, system }))] : []),
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
    const at = `location[directory]=${encodeURIComponent(directory)}`
    // The rules, the product's defaults among them, exist once the Location's plugins have loaded.
    yield* pluginsLoaded(context, directory)
    // A session whose every question is answered once, as `run --auto` answers (`cli/src/run/noninteractive.ts`,
    // `replyPermission`); `asked` lists the actions it was asked.
    const create = (title: string) =>
      Effect.gen(function* () {
        const id = yield* sessions
          .create({ title, agent: Agent.ID.make("build"), model: model.ref, location })
          .pipe(Effect.map((s) => s.id))
        const asked: string[] = []
        yield* call(`/api/session/${id}/permission?${at}`).pipe(
          Effect.map((response) => response.body.data as { id: string; action: string }[]),
          Effect.flatMap((items) =>
            Effect.forEach(items, (item) =>
              call(`/api/session/${id}/permission/${item.id}/reply?${at}`, { decision: "once" }).pipe(
                Effect.tap(() => Effect.sync(() => asked.push(item.action))),
              ),
            ),
          ),
          Effect.andThen(Effect.sleep("20 millis")),
          Effect.forever,
          Effect.forkScoped,
        )
        return { id, asked }
      })
    // Runs the calls with a final answer; each call's outcome is `completed` or the error the model read.
    const run = (sessionID: Session.ID, calls: readonly (readonly [Step, string])[]) =>
      Effect.gen(function* () {
        yield* sessions.prompt({ sessionID, text: script(...calls.map(([step]) => step), { text: "end" }) })
        yield* sessions.wait(sessionID)
        const parts = (yield* sessions.messages({ sessionID }))
          .toSorted((a, b) => a.id.localeCompare(b.id))
          .flatMap((message) =>
            message.type === "assistant" ? message.content.flatMap((part) => (part.type === "tool" ? [part] : [])) : [],
          )
        const requests = (yield* llm.requests()).filter(
          (request) => header(request) === sessionID && request.tools.length > 0,
        )
        const answers = (yield* sessions.messages({ sessionID })).flatMap((item) =>
          item.type === "assistant" ? [[item.finish, item.error ?? undefined]] : [],
        )
        return {
          outcomes: parts.map((part) => (part.state.status === "error" ? part.state.error.message : part.state.status)),
          // Whether each failed call is a denied permission for a client, as `cli/src/run/product.ts` (`denied`) reads it.
          denied: parts.flatMap((part) =>
            part.state.status === "error"
              ? [part.state.error.type === "permission.rejected" || part.state.metadata?.permissionDenied === true]
              : [],
          ),
          told: told(requests.at(-1)),
          // Every call result the model read.
          results: JSON.stringify(
            requests.flatMap((request) => request.messages.filter((message) => message.role === "tool")),
          ),
          tools: requests.at(0)?.tools.map((tool) => tool.name) ?? [],
          answers,
        }
      })
    const text = (file: string) => Effect.promise(() => Bun.file(file).text())
    const exists = (file: string) => Effect.promise(() => Bun.file(file).exists())
    return { dir, directory, folder, create, run, text, exists }
  })

// Expects every call's outcome, the refusals the model read, a turn that went on to its final answer, no question.
function settled(
  result: Effect.Success<ReturnType<Effect.Success<ReturnType<typeof boot>>["run"]>>,
  calls: readonly (readonly [Step, string])[],
  asked: readonly string[],
) {
  expect(result.outcomes.map((outcome, index) => [calls[index]?.[0], outcome])).toEqual(
    calls.map(([step, outcome]) => [step, outcome]),
  )
  expect(result.told).toEqual(calls.flatMap(([, outcome]) => (outcome === ok ? [] : [outcome])))
  expect(result.denied).toEqual(calls.flatMap(([, outcome]) => (outcome === ok ? [] : [true])))
  expect(result.answers).toEqual([["stop", undefined], ...Array(calls.length).fill(["tool-calls", undefined])])
  expect(asked).toEqual([])
}

describe("loginom.product dashboard paths (G1, B2.9c)", () => {
  it.live(
    "inside a git repository: reads stay in work, writes in src without a question; control, workspace data, file links and dangling links are refused with an explanation",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ git: true })
        const work = test.folder.work
        yield* Effect.promise(async () => {
          await fs.symlink(test.folder.control, path.join(work, "src", "link"), "dir")
          await fs.symlink("main.tsx", path.join(work, "src", "file.ts"))
          await fs.symlink("../../control/new.json", path.join(work, "src", "dangling.ts"))
        })
        const session = yield* test.create("paths")
        const calls = [
          [{ tool: "write", input: { path: "src/main.tsx", content: "written" } }, ok],
          [{ tool: "write", input: { path: "src/a/b.ts", content: "nested" } }, ok],
          [{ tool: "edit", input: { path: "src/main.tsx", oldString: "written", newString: "edited" } }, ok],
          [{ tool: "read", input: { path: "sample.json" } }, ok],
          [{ tool: "read", input: { path: "." } }, ok],
          [{ tool: "glob", input: { pattern: "**/*" } }, ok],
          [{ tool: "grep", input: { pattern: "synthetic" } }, ok],
          // The dashboard's skill loads: `external_directory` is refused, but a skill asks only `skill`.
          [{ tool: "skill", input: { id: "loginom-dashboard" } }, ok],
          [{ tool: "read", input: { path: "../control/binding.json" } }, no(Dashboard.outside)],
          [{ tool: "read", input: { path: "src/link/binding.json" } }, no(Dashboard.outside)],
          [{ tool: "read", input: { path: "src/dangling.ts" } }, no(Dashboard.dangling)],
          [{ tool: "write", input: { path: "../control/new.json", content: "x" } }, no(Dashboard.srcOnly)],
          [{ tool: "write", input: { path: "sample.json", content: "x" } }, no(Dashboard.srcOnly)],
          [{ tool: "write", input: { path: "loginom-ai-agent.json", content: "{}" } }, no(Dashboard.srcOnly)],
          [{ tool: "write", input: { path: "src/../vite.config.ts", content: "x" } }, no(Dashboard.srcOnly)],
          [{ tool: "write", input: { path: "src/link/x.json", content: "x" } }, no(Dashboard.srcOnly)],
          [{ tool: "write", input: { path: "src/file.ts", content: "x" } }, no(Dashboard.fileLink)],
          [{ tool: "write", input: { path: "src/dangling.ts", content: "x" } }, no(Dashboard.fileLink)],
          [
            { tool: "edit", input: { path: "sample.json", oldString: "sample synthetic", newString: "x" } },
            no(Dashboard.srcOnly),
          ],
          [
            { tool: "edit", input: { path: "src/link/binding.json", oldString: "control synthetic", newString: "x" } },
            no(Dashboard.srcOnly),
          ],
          // `edit` reads its target before it asks: a refusal only at the question would tell a missing file apart.
          [
            { tool: "edit", input: { path: "../control/binding.json", oldString: "wrong guess", newString: "x" } },
            no(Dashboard.srcOnly),
          ],
          [
            { tool: "edit", input: { path: "../control/missing.json", oldString: "x", newString: "y" } },
            no(Dashboard.srcOnly),
          ],
          // A path under a file outside: the same refusal, not the file system's `ENOTDIR`.
          [{ tool: "write", input: { path: "../control/binding.json/x", content: "x" } }, no(Dashboard.srcOnly)],
          [{ tool: "glob", input: { pattern: "*", path: ".." } }, no(Dashboard.outside)],
          [{ tool: "glob", input: { pattern: "../control/*" } }, no(Dashboard.outside)],
          [{ tool: "glob", input: { pattern: "*", path: "src/link" } }, no(Dashboard.outside)],
          [{ tool: "grep", input: { pattern: "synthetic", path: ".." } }, no(Dashboard.outside)],
          [{ tool: "grep", input: { pattern: "synthetic", path: "src/link/binding.json" } }, no(Dashboard.outside)],
          [{ tool: "grep", input: { pattern: "synthetic", include: "../control/*" } }, no(Dashboard.outside)],
        ] as const
        const result = yield* test.run(session.id, calls)
        settled(result, calls, session.asked)
        // Nothing of `control` reached the model, though `write` and `edit` read their target before they ask.
        expect(result.results).not.toContain("control synthetic")
        expect(result.results).toContain("sample synthetic")
        for (const [file, content] of [
          [path.join(work, "src", "main.tsx"), "edited"],
          [path.join(work, "src", "a", "b.ts"), "nested"],
          [path.join(work, "sample.json"), "sample synthetic\n"],
          [path.join(test.folder.control, "binding.json"), "control synthetic\n"],
        ] as const)
          expect([file, yield* test.text(file)]).toEqual([file, content])
        for (const file of [
          path.join(test.folder.control, "new.json"),
          path.join(test.folder.control, "x.json"),
          path.join(work, "loginom-ai-agent.json"),
          path.join(work, "vite.config.ts"),
        ])
          expect([file, yield* test.exists(file)]).toEqual([file, false])
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "patches inside a git repository: one target outside src refuses the whole patch before any change, a delete and a move too",
    () =>
      Effect.gen(function* () {
        // OpenCode offers GPT models `patch` instead of `edit` and `write`.
        const test = yield* boot({ git: true, model: "gpt-5-dashboard-files" })
        const work = test.folder.work
        yield* Effect.promise(() => fs.symlink(test.folder.control, path.join(work, "src", "link"), "dir"))
        const patch = (body: string) => ({
          tool: "patch",
          input: { patchText: `*** Begin Patch\n${body}\n*** End Patch` },
        })
        const session = yield* test.create("patches")
        const calls = [
          [patch("*** Add File: src/c.tsx\n+export const c = 1"), ok],
          [patch("*** Delete File: snapshot.json"), no(Dashboard.srcOnly)],
          [
            patch("*** Update File: src/main.tsx\n*** Move to: sample.json\n@@\n-main synthetic\n+moved"),
            no(Dashboard.srcOnly),
          ],
          [patch("*** Add File: src/d.tsx\n+d\n*** Add File: ../control/new.json\n+x"), no(Dashboard.srcOnly)],
          [patch("*** Update File: src/link/binding.json\n@@\n-control synthetic\n+x"), no(Dashboard.srcOnly)],
          // `patch` reads what it updates or deletes before it asks: a wrong line and a missing file are refused alike.
          [patch("*** Update File: ../control/binding.json\n@@\n-wrong guess\n+x"), no(Dashboard.srcOnly)],
          [patch("*** Delete File: ../control/missing.json"), no(Dashboard.srcOnly)],
        ] as const
        const result = yield* test.run(session.id, calls)
        expect(result.tools).toContain("patch")
        expect(result.tools).not.toContain("write")
        settled(result, calls, session.asked)
        // `patch` reads what it updates before it asks; the refusal carries none of it.
        expect(result.results).not.toContain("control synthetic")
        for (const [file, content] of [
          [path.join(work, "src", "c.tsx"), "export const c = 1\n"],
          [path.join(work, "src", "main.tsx"), "main synthetic\n"],
          [path.join(work, "sample.json"), "sample synthetic\n"],
          [path.join(work, "snapshot.json"), "snapshot synthetic\n"],
          [path.join(test.folder.control, "binding.json"), "control synthetic\n"],
        ] as const)
          expect([file, yield* test.text(file)]).toEqual([file, content])
        for (const file of [path.join(work, "src", "d.tsx"), path.join(test.folder.control, "new.json")])
          expect([file, yield* test.exists(file)]).toEqual([file, false])
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "without git, a read outside is refused at `external_directory` without a question, the product's own directories too; a write outside before the call",
    () =>
      Effect.gen(function* () {
        const test = yield* boot()
        // A large tool result the product reads outside the project without a question elsewhere (B2.6a2).
        const result = path.join(Global.Path.data, "tool-output", "b29c.txt")
        yield* Effect.promise(() =>
          fs.mkdir(path.dirname(result), { recursive: true }).then(() => Bun.write(result, "x\n")),
        )
        const session = yield* test.create("outside")
        const calls = [
          [{ tool: "read", input: { path: path.join(test.dir, "outside.txt") } }, no(Dashboard.outside)],
          [{ tool: "read", input: { path: "../control/binding.json" } }, no(Dashboard.outside)],
          [{ tool: "read", input: { path: result } }, no(Dashboard.outside)],
          [{ tool: "write", input: { path: path.join(test.dir, "new.txt"), content: "x" } }, no(Dashboard.srcOnly)],
          [
            { tool: "edit", input: { path: path.join(test.dir, "outside.txt"), oldString: "outside", newString: "x" } },
            no(Dashboard.srcOnly),
          ],
        ] as const
        const outcome = yield* test.run(session.id, calls)
        settled(outcome, calls, session.asked)
        expect(outcome.results).not.toContain("outside synthetic")
        expect(yield* test.text(path.join(test.dir, "outside.txt"))).toBe("outside synthetic\n")
        expect(yield* test.exists(path.join(test.dir, "new.txt"))).toBe(false)
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a Location opened through an outside alias reads and writes its work folder by either path, and control stays refused inside a git repository",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ git: true, at: "alias" })
        const session = yield* test.create("alias")
        const calls = [
          [{ tool: "read", input: { path: "sample.json" } }, ok],
          [{ tool: "read", input: { path: path.join(test.folder.work, "src", "..", "src", "main.tsx") } }, ok],
          [{ tool: "read", input: { path: test.directory + "/src/../src/main.tsx" } }, ok],
          [{ tool: "write", input: { path: test.directory + "/src/../src/main.tsx", content: "alias synthetic" } }, ok],
          [{ tool: "read", input: { path: path.join(test.folder.control, "binding.json") } }, no(Dashboard.outside)],
          [{ tool: "write", input: { path: "sample.json", content: "x" } }, no(Dashboard.srcOnly)],
        ] as const
        const result = yield* test.run(session.id, calls)
        settled(result, calls, session.asked)
        expect(result.results).toContain("main synthetic")
        expect(result.results).not.toContain("control synthetic")
        expect(yield* test.text(path.join(test.folder.work, "src", "main.tsx"))).toBe("alias synthetic")
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "contract: Core resolves `..` after a link lexically and opens that path, so the file outside is neither read nor written",
    () =>
      Effect.gen(function* () {
        // 0.4 refused these paths: its tools opened them as written, through the link. Core v2 resolves the path first
        // (`FileAccess.resolve`), checks and opens the result, `src/secret.txt` here.
        const test = yield* boot()
        const work = test.folder.work
        yield* Effect.promise(async () => {
          await fs.mkdir(path.join(test.folder.control, "child", "child"), { recursive: true })
          await Bun.write(path.join(test.folder.control, "secret.txt"), "outside secret\n")
          await Bun.write(path.join(work, "src", "secret.txt"), "inside secret\n")
          await fs.symlink(path.join(test.folder.control, "child"), path.join(work, "src", "link"), "dir")
        })
        const link = path.join(work, "src", "link")
        const session = yield* test.create("lexical")
        const calls = [
          [{ tool: "read", input: { path: link + "/../secret.txt" } }, ok],
          [{ tool: "read", input: { path: link + "/child/../../secret.txt" } }, ok],
          [{ tool: "write", input: { path: link + "/../secret.txt", content: "new secret" } }, ok],
        ] as const
        const result = yield* test.run(session.id, calls)
        settled(result, calls, session.asked)
        expect(result.results).toContain("inside secret")
        expect(result.results).not.toContain("outside secret")
        expect(yield* test.text(path.join(test.folder.control, "secret.txt"))).toBe("outside secret\n")
        expect(yield* test.text(path.join(work, "src", "secret.txt"))).toBe("new secret")
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "the administrator's deny and the user's settings stay stronger than a write in src",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({
          policies: [{ action: "tool.use", resource: "edit:src/locked.tsx", effect: "deny" }],
          user: { permissions: [{ action: "edit", resource: "src/settings.tsx", effect: "deny" }] },
        })
        const session = yield* test.create("stronger")
        const calls = [
          [
            { tool: "write", input: { path: "src/locked.tsx", content: "x" } },
            policyDeniedText({ action: "edit", kind: "write" }),
          ],
          [
            { tool: "write", input: { path: "src/settings.tsx", content: "x" } },
            deniedText({ action: "edit", kind: "write" }),
          ],
          [{ tool: "write", input: { path: "src/main.tsx", content: "allowed" } }, ok],
        ] as const
        settled(yield* test.run(session.id, calls), calls, session.asked)
        for (const name of ["locked.tsx", "settings.tsx"])
          expect([name, yield* test.exists(path.join(test.folder.work, "src", name))]).toEqual([name, false])
        expect(yield* test.text(path.join(test.folder.work, "src", "main.tsx"))).toBe("allowed")
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "control: an ordinary Location keeps OpenCode's questions for a write and for everything outside the project",
    () =>
      Effect.gen(function* () {
        const test = yield* boot({ at: "ordinary" })
        const session = yield* test.create("ordinary")
        const outside = path.join(test.dir, "outside.txt")
        const calls = [
          [{ tool: "write", input: { path: "sample.json", content: "ordinary" } }, ok],
          [{ tool: "read", input: { path: outside } }, ok],
          [{ tool: "glob", input: { pattern: "*", path: ".." } }, ok],
          [{ tool: "grep", input: { pattern: "outside", path: ".." } }, ok],
        ] as const
        const result = yield* test.run(session.id, calls)
        expect(result.outcomes).toEqual(calls.map(([, outcome]) => outcome))
        expect(session.asked).toEqual(["edit", "external_directory", "external_directory", "external_directory"])
        expect(result.results).toContain("outside synthetic")
        expect(yield* test.text(path.join(test.directory, "sample.json"))).toBe("ordinary")
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a formatter config the model writes in src never runs once the folder's config turns formatters off (B2.9h writes it); without it, the user's formatter would",
    () =>
      Effect.gen(function* () {
        // 0.4's four Prettier cases: `edit` cannot create a file in OpenCode 2, so three. The user's formatter runs
        // Prettier, which loads `src/.prettierrc.cjs`; that config would leave a marker outside the work folder.
        const prettier = Bun.fileURLToPath(import.meta.resolve("prettier/bin/prettier.cjs"))
        const user = {
          formatter: { prettier: { command: [process.execPath, prettier, "--write", "$FILE"], extensions: [".tsx"] } },
        }
        const config = (marker: string) =>
          `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "synthetic-boundary-proof"); module.exports = {};`
        for (const [label, work, model] of [
          ["off", { formatter: false }, undefined],
          ["off, patch", { formatter: false }, "gpt-5-dashboard-files"],
          ["control", undefined, undefined],
        ] as const) {
          const test = yield* boot({ user, work, model })
          const marker = path.join(test.dir, "formatter-marker")
          const session = yield* test.create(label)
          const calls =
            model === undefined
              ? ([
                  [{ tool: "write", input: { path: "src/.prettierrc.cjs", content: config(marker) } }, ok],
                  [{ tool: "write", input: { path: "src/main.tsx", content: "export const value=1" } }, ok],
                  [{ tool: "edit", input: { path: "src/main.tsx", oldString: "value", newString: "amount" } }, ok],
                ] as const)
              : ([
                  [
                    {
                      tool: "patch",
                      input: {
                        patchText: `*** Begin Patch\n*** Add File: src/.prettierrc.cjs\n+${config(marker)}\n*** Add File: src/main.tsx\n+export const value=1\n*** End Patch`,
                      },
                    },
                    ok,
                  ],
                ] as const)
          settled(yield* test.run(session.id, calls), calls, session.asked)
          expect([label, yield* test.exists(marker)]).toEqual([label, work === undefined])
          if (work)
            expect([label, yield* test.text(path.join(test.folder.work, "src", "main.tsx"))]).toEqual([
              label,
              model === undefined ? "export const amount=1" : "export const value=1\n",
            ])
        }
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    // Three server Locations, and Prettier runs as a child process in the control.
    60_000,
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
