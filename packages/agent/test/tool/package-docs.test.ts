import { afterAll, beforeAll, expect } from "bun:test"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { AppProcess } from "@loginom-ai-agent/core/process"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { PermissionV1 } from "@loginom-ai-agent/core/v1/permission"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { SessionProjector } from "@loginom-ai-agent/core/session/projector"
import { productSkillsDirectory } from "@loginom-ai-agent/product/skills"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { PackageDocsTool } from "@/tool/package-docs"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { TestInstance, provideInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const resources = await mkdtemp(join(tmpdir(), "loginom-docs-tool-resources-"))
const fixture = join(import.meta.dir, "../../../loginom-host/test/fixtures/package-docs/demo.lgp")

beforeAll(async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  await cp(productSkillsDirectory, join(resources, "skills"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await cp(node, join(resources, "bin/node"))
  const builder = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "../../../loginom-host/script/build-package-docs.ts"),
      join(resources, "skills/package-docs/scripts"),
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const stdout = new Response(builder.stdout).text(),
    stderr = new Response(builder.stderr).text()
  expect(await builder.exited).toBe(0)
  expect(await stderr).toBe("")
  expect(JSON.parse(await stdout).script).toBe(join(resources, "skills/package-docs/scripts/package-docs.mjs"))
  await Bun.write(
    join(resources, "resource-manifest.json"),
    JSON.stringify({ protocol: 1, node: "bin/node", files: await resourceInventory(resources) }),
  )
})
afterAll(() => rm(resources, { recursive: true, force: true }))

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([
        Agent.node,
        Session.node,
        SessionProjector.node,
        FSUtil.node,
        AppProcess.node,
        Truncate.node,
        RuntimeFlags.node,
        Permission.node,
      ]),
      [[RuntimeFlags.node, RuntimeFlags.layer({ loginomResources: resources })]],
    ),
    testInstanceStoreLayer,
  ),
)

const prepare = Effect.fn("PackageDocsTest.prepare")(function* (
  options: {
    attachment?: string
    permission?: PermissionV1.Ruleset
    agent?: string
  } = {},
) {
  const sessions = yield* Session.Service
  const permissions = yield* Permission.Service
  const agents = yield* Agent.Service
  const agent = yield* agents.get(options.agent ?? "build")
  const session = yield* sessions.create({ permission: options.permission })
  const messageID = MessageID.ascending()
  yield* sessions.updateMessage({
    id: messageID,
    sessionID: session.id,
    role: "user",
    agent: agent.name,
    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
    time: { created: Date.now() },
  })
  if (options.attachment)
    yield* sessions.updatePart({
      id: PartID.ascending(),
      sessionID: session.id,
      messageID,
      type: "file",
      mime: "application/x-loginom-package",
      filename: "demo.lgp",
      url: options.attachment,
    })
  const requests: Omit<PermissionV1.Request, "id" | "sessionID" | "tool">[] = []
  const ctx: Tool.Context = {
    sessionID: session.id,
    messageID,
    agent: agent.name,
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: (request) =>
      Effect.gen(function* () {
        requests.push(request)
        yield* permissions
          .ask({
            ...request,
            sessionID: session.id,
            ruleset: Permission.merge(agent.permission, session.permission ?? []),
          })
          .pipe(Effect.orDie)
      }),
  }
  const info = yield* PackageDocsTool
  const tool = yield* info.init()
  return { ctx, requests, tool }
})

// Replace the external Node program in this test's bundle, preserving its exact
// bytes and manifest afterwards. Runtime services and process spawning stay real.
const withScript = <A, E, R>(content: string | undefined, body: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const script = join(resources, "skills/package-docs/scripts/package-docs.mjs")
    const manifest = join(resources, "resource-manifest.json")
    return yield* Effect.acquireUseRelease(
      Effect.gen(function* () {
        return { script: yield* fs.readFileString(script), manifest: yield* fs.readFileString(manifest) }
      }),
      () =>
        Effect.gen(function* () {
          if (content === undefined) yield* fs.remove(script)
          else yield* fs.writeFileString(script, content)
          yield* fs.writeFileString(
            manifest,
            JSON.stringify({
              protocol: 1,
              node: "bin/node",
              files: yield* Effect.promise(() => resourceInventory(resources)),
            }),
          )
          return yield* body
        }),
      (original) =>
        Effect.all([fs.writeFileString(script, original.script), fs.writeFileString(manifest, original.manifest)]).pipe(
          Effect.orDie,
        ),
    )
  })

it.instance(
  "extracts an original user attachment with bundled Node and requests only session writes",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const result = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx)
      const output = JSON.parse(result.output)
      expect(output.structure.startsWith(join(instance.directory, ".work/package-docs/"))).toBe(true)
      expect(yield* fs.readJson(output.structure)).toEqual(
        yield* fs.readJson(join(import.meta.dir, "../../../loginom-host/test/fixtures/package-docs/structure.json")),
      )
      expect(input.requests.map((request) => request.permission)).toEqual(["edit"])
      expect(input.requests[0].patterns.every((path) => path.startsWith(".work/package-docs/"))).toBe(true)
    }),
  { git: true },
  20_000,
)

it.instance(
  "an original attachment does not override the user's explicit read deny",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({
        attachment: pathToFileURL(fixture).href,
        permission: [{ permission: "read", pattern: "*", action: "deny" }],
      })
      const result = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  { git: true },
  20_000,
)

it.instance(
  "plan cannot create an extracted structure even for an attached package",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href, agent: "plan" })
      const result = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  20_000,
)

it.instance(
  "a model-supplied path must pass external_directory before reading or writing",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ permission: [{ permission: "external_directory", pattern: "*", action: "deny" }] })
      const result = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(input.requests.map((request) => request.permission)).toEqual(["external_directory"])
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  20_000,
)

it.instance(
  "a range reference does not authorize the whole package",
  () =>
    Effect.gen(function* () {
      const input = yield* prepare({
        attachment: pathToFileURL(fixture).href + "?start=1&end=10",
        permission: [{ permission: "external_directory", pattern: "*", action: "deny" }],
      })
      const result = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(input.requests.map((request) => request.permission)).toEqual(["external_directory"])
    }),
  20_000,
)

it.instance(
  "a tampered skill bundle is rejected before Node can launch it",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const script = join(resources, "skills/package-docs/scripts/package-docs.mjs")
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const result = yield* Effect.acquireUseRelease(
        fs
          .readFileString(script)
          .pipe(
            Effect.tap((original) =>
              fs.writeFileString(
                script,
                original +
                  '\nawait import("node:fs/promises").then(fs => fs.writeFile("unexpected-launch", "launched"));\n',
              ),
            ),
          ),
        () => input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit),
        (original) => fs.writeFileString(script, original).pipe(Effect.orDie),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
      expect(yield* fs.exists(join(instance.directory, "unexpected-launch"))).toBe(false)
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  20_000,
)

it.instance(
  "edit denies use the same project-relative paths as ordinary write tools",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const directory = join(instance.directory, "child")
      yield* fs.makeDirectory(directory)
      const input = yield* provideInstance(directory)(
        prepare({
          attachment: pathToFileURL(fixture).href,
          permission: [{ permission: "edit", pattern: "child/*", action: "deny" }],
        }),
      )
      const result = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* fs.exists(join(directory, ".work"))).toBe(false)
    }),
  { git: true },
  20_000,
)

it.instance(
  "canonicalizing an attachment does not bypass a deny on its requested name",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const original = join(instance.directory, "original.lgp"),
        alias = join(instance.directory, "alias.lgp")
      yield* fs.copyFile(fixture, original)
      yield* fs.symlink(original, alias)
      const input = yield* prepare({
        attachment: pathToFileURL(alias).href,
        permission: [{ permission: "read", pattern: "alias.lgp", action: "deny" }],
      })
      const result = yield* input.tool.execute({ operation: "extract", lgp: alias }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  { git: true },
  20_000,
)

it.instance(
  "an original attachment preserves an explicit external_directory deny",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({
        attachment: pathToFileURL(fixture).href,
        permission: [{ permission: "external_directory", pattern: "*", action: "deny" }],
      })
      const result = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  20_000,
)

it.instance(
  "creates a session skeleton with edit authorization for both generated files",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const before = yield* fs.readFile(fixture)
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const result = yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)
      const output = JSON.parse(result.output)
      expect(output.report.startsWith(join(instance.directory, ".work/package-docs/"))).toBe(true)
      expect(yield* fs.readFileString(output.report)).toContain("PLACEHOLDER_PACKAGE_DESCRIPTION")
      expect(yield* fs.readJson(output.structure)).toEqual(
        yield* fs.readJson(join(import.meta.dir, "../../../loginom-host/test/fixtures/package-docs/structure.json")),
      )
      expect(input.requests.map((request) => request.permission)).toEqual(["edit"])
      expect(input.requests[0].patterns).toContain(output.report.slice(instance.directory.length + 1))
      expect(input.requests[0].patterns).toContain(output.structure.slice(instance.directory.length + 1))
      expect(yield* fs.readFile(fixture)).toEqual(before)
    }),
  { git: true },
  20_000,
)

it.instance(
  "a deny on the skeleton prevents all generated writes",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({
        attachment: pathToFileURL(fixture).href,
        permission: [{ permission: "edit", pattern: ".work/package-docs/*/report.md", action: "deny" }],
      })
      const result = yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  { git: true },
  20_000,
)

it.instance(
  "repeating the skeleton operation preserves a filled draft",
  () =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const first = yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)
      const output = JSON.parse(first.output)
      yield* fs.writeFileString(output.report, "# Заполненный пользователем черновик\n")
      const repeated = yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)
      expect(JSON.parse(repeated.output).report).toBe(output.report)
      expect(yield* fs.readFileString(output.report)).toBe("# Заполненный пользователем черновик\n")
    }),
  20_000,
)

it.instance(
  "publishes a completed PDF only after authorizing its exact session filename",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const before = yield* fs.readFile(fixture)
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const skeleton = JSON.parse(
        (yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)).output,
      )
      yield* fs.writeFileString(
        skeleton.report,
        (yield* fs.readFileString(skeleton.report)).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание сценария."),
      )
      const result = yield* input.tool.execute({ operation: "emit", lgp: fixture }, input.ctx)
      const output = JSON.parse(result.output)
      expect(output.output).toBe(join(instance.directory, "demo.lgp_report.pdf"))
      expect(
        Buffer.from(yield* fs.readFile(output.output))
          .subarray(0, 8)
          .toString(),
      ).toBe("%PDF-1.4")
      expect(input.requests.filter((request) => request.permission === "edit").at(-1)?.patterns).toContain(
        "demo.lgp_report.pdf",
      )
      expect(input.requests.filter((request) => request.permission === "read").at(-1)?.patterns).toContain(
        skeleton.report.slice(instance.directory.length + 1),
      )
      expect(yield* fs.readFile(fixture)).toEqual(before)
    }),
  { git: true },
  20_000,
)

it.instance(
  "chooses the next free name before permission and preserves existing reports",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const skeleton = JSON.parse(
        (yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)).output,
      )
      const markdown = (yield* fs.readFileString(skeleton.report)).replace(
        /PLACEHOLDER_[A-Z_0-9]+/g,
        "Описание сценария.",
      )
      yield* fs.writeFileString(skeleton.report, markdown)
      yield* fs.writeFileString(join(instance.directory, "demo.lgp_report.md"), "Существующий отчёт")
      yield* fs.symlink(join(instance.directory, "absent.md"), join(instance.directory, "demo.lgp_report-2.md"))
      const result = yield* input.tool.execute({ operation: "emit", lgp: fixture, format: "md" }, input.ctx)
      expect(JSON.parse(result.output).output).toBe(join(instance.directory, "demo.lgp_report-3.md"))
      expect(yield* fs.readFileString(join(instance.directory, "demo.lgp_report-3.md"))).toBe(markdown)
      expect(yield* fs.readFileString(join(instance.directory, "demo.lgp_report.md"))).toBe("Существующий отчёт")
      expect(input.requests.filter((request) => request.permission === "edit").at(-1)?.patterns).toContain(
        "demo.lgp_report-3.md",
      )
      const word = yield* input.tool.execute({ operation: "emit", lgp: fixture, format: "docx" }, input.ctx)
      expect(JSON.parse(word.output).output).toBe(join(instance.directory, "demo.lgp_report.docx"))
      expect(
        Buffer.from(yield* fs.readFile(JSON.parse(word.output).output))
          .subarray(0, 2)
          .toString(),
      ).toBe("PK")
    }),
  { git: true },
  20_000,
)

it.instance(
  "an explicit deny on the final filename prevents publication",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({
        attachment: pathToFileURL(fixture).href,
        permission: [{ permission: "edit", pattern: "demo.lgp_report.md", action: "deny" }],
      })
      const skeleton = JSON.parse(
        (yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)).output,
      )
      yield* fs.writeFileString(
        skeleton.report,
        (yield* fs.readFileString(skeleton.report)).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание сценария."),
      )
      const result = yield* input.tool
        .execute({ operation: "emit", lgp: fixture, format: "md" }, input.ctx)
        .pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect((yield* fs.readDirectory(instance.directory)).toSorted()).toEqual([".git", ".work"])
    }),
  { git: true },
  20_000,
)

it.instance(
  "a filename occupied during approval is rejected without moving the authorized output",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const skeleton = JSON.parse(
        (yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)).output,
      )
      yield* fs.writeFileString(
        skeleton.report,
        (yield* fs.readFileString(skeleton.report)).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание сценария."),
      )
      const ctx: Tool.Context = {
        ...input.ctx,
        ask: (request) =>
          input.ctx.ask(request).pipe(
            Effect.tap(() =>
              request.permission === "edit"
                ? fs.writeFileString(join(instance.directory, "demo.lgp_report.md"), "Другой автор")
                : Effect.void,
            ),
            Effect.orDie,
          ),
      }
      const result = yield* input.tool.execute({ operation: "emit", lgp: fixture, format: "md" }, ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_OUTPUT_COLLISION")
      expect(yield* fs.readFileString(join(instance.directory, "demo.lgp_report.md"))).toBe("Другой автор")
      expect((yield* fs.readDirectory(instance.directory)).toSorted()).toEqual([".git", ".work", "demo.lgp_report.md"])
    }),
  { git: true },
  20_000,
)

it.instance(
  "emit preserves an explicit read deny on the filled draft",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({
        attachment: pathToFileURL(fixture).href,
        permission: [{ permission: "read", pattern: ".work/package-docs/*/report.md", action: "deny" }],
      })
      const skeleton = JSON.parse(
        (yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)).output,
      )
      yield* fs.writeFileString(
        skeleton.report,
        (yield* fs.readFileString(skeleton.report)).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание сценария."),
      )
      const result = yield* input.tool.execute({ operation: "emit", lgp: fixture }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect((yield* fs.readDirectory(instance.directory)).toSorted()).toEqual([".git", ".work"])
    }),
  { git: true },
  20_000,
)

it.instance(
  "unfilled placeholders fail explicitly without a published report in any format",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      yield* input.tool.execute({ operation: "skeleton", lgp: fixture }, input.ctx)
      for (const format of ["pdf", "docx", "md"] as const) {
        const result = yield* input.tool
          .execute({ operation: "emit", lgp: fixture, format }, input.ctx)
          .pipe(Effect.exit)
        expect(Exit.isFailure(result)).toBe(true)
        if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_PLACEHOLDER")
      }
      expect((yield* fs.readDirectory(instance.directory)).toSorted()).toEqual([".git", ".work"])
    }),
  { git: true },
  20_000,
)

it.instance(
  "attachments from another session in the model context do not authorize a path",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const other = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const input = yield* prepare({ permission: [{ permission: "external_directory", pattern: "*", action: "deny" }] })
      const result = yield* input.tool
        .execute(
          { operation: "extract", lgp: fixture },
          { ...input.ctx, messages: yield* sessions.messages({ sessionID: other.ctx.sessionID }) },
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(input.requests.map((request) => request.permission)).toEqual(["external_directory"])
    }),
  20_000,
)

it.instance(
  "a missing generated bundle is diagnosed as damaged resources",
  () =>
    Effect.gen(function* () {
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const result = yield* withScript(
        undefined,
        input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
    }),
  20_000,
)

it.instance(
  "a zero exit with malformed executor output is an error, not a completed operation",
  () =>
    Effect.gen(function* () {
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const result = yield* withScript(
        "process.stdout.write('not-json')",
        input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_OUTPUT_INVALID")
    }),
  20_000,
)

it.instance(
  "a successful executor cannot substitute a path outside the backend-selected workspace",
  () =>
    Effect.gen(function* () {
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const result = yield* withScript(
        'process.stdout.write(JSON.stringify({structure: "/tmp/foreign.json"}))',
        input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_OUTPUT_INVALID")
    }),
  20_000,
)

it.instance(
  "an executor cannot claim completion without creating its acknowledged file",
  () =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const initial = yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx)
      yield* fs.remove(JSON.parse(initial.output).structure)
      const result = yield* withScript(
        "process.stdout.write(" + JSON.stringify(initial.output) + ")",
        input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_OUTPUT_INVALID")
    }),
  20_000,
)

it.instance(
  "a Node hash mismatch is rejected without falling back to a system interpreter",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const path = join(resources, "resource-manifest.json")
      const result = yield* Effect.acquireUseRelease(
        fs.readFileString(path),
        (original) =>
          Effect.gen(function* () {
            const manifest = JSON.parse(original)
            manifest.files.find((file: { path: string }) => file.path === "bin/node").sha256 = "0".repeat(64)
            yield* fs.writeFileString(path, JSON.stringify(manifest))
            return yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
          }),
        (original) => fs.writeFileString(path, original).pipe(Effect.orDie),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  20_000,
)

it.instance(
  "even the correctly hashed pinned Node cannot be a symlink outside resources",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare({ attachment: pathToFileURL(fixture).href })
      const path = join(resources, "bin/node"),
        backup = join(resources, "bin/node.original")
      const source = process.env.LOGINOM_AI_AGENT_TEST_NODE
      if (!source) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
      const result = yield* Effect.acquireUseRelease(
        fs.rename(path, backup),
        () =>
          Effect.gen(function* () {
            yield* fs.symlink(source, path)
            return yield* input.tool.execute({ operation: "extract", lgp: fixture }, input.ctx).pipe(Effect.exit)
          }),
        () => fs.remove(path, { force: true }).pipe(Effect.andThen(fs.rename(backup, path)), Effect.orDie),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("PACKAGE_DOCS_RESOURCES_INVALID")
      expect(yield* fs.exists(join(instance.directory, ".work"))).toBe(false)
    }),
  20_000,
)
