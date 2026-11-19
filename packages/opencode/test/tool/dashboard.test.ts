import { afterEach, expect } from "bun:test"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { DashboardDraftTool, DashboardPublishTool } from "@/tool/dashboard"
import { Agent } from "@/agent/agent"
import { ToolJsonSchema } from "@/tool/json-schema"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import type { DashboardBinding } from "@loginom-ai-agent/loginom-host/dashboard"
import { createHash } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { lstat, mkdir, readdir, rm, symlink } from "node:fs/promises"
import { prepareDashboard, readDashboardBinding, readDashboardSnapshot, removeDashboard } from "@loginom-ai-agent/dashboard/agent/folder"
import { draftServer } from "@loginom-ai-agent/dashboard/draft/server"
import { dashboardDataRoot } from "@loginom-ai-agent/product/dashboard-root"
import { Config } from "@/config/config"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { MCP } from "@/mcp"
import { SessionTools } from "@/session/tools"
import { Provider } from "@/provider/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { ToolRegistry } from "@/tool/registry"
import { TestConfig } from "../fixture/config"
import { provideInstance, TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

type HostRequest = { method: string; input: { binding?: DashboardBinding; content?: string; expected?: unknown; generation?: number; scope?: unknown } }
const publicationName = "20261115T120000Z.json"

function publicationHost(options: { error?: string; latest?: { name: string; sourceHash: string }; changed?: boolean; respond?: (request: HostRequest) => unknown } = {}) {
  const requests: HostRequest[] = []
  let receive: ((event: { data: unknown }) => void) | undefined
  LoginomHost.connect({
    start() {},
    on(_event, listener) { receive = listener },
    postMessage(value) {
      const request = value as HostRequest & { id: string }
      requests.push(request)
      if (request.method === "dashboardPublish" && options.error)
        return receive?.({ data: { id: request.id, error: options.error } })
      const result = options.respond?.(request) ?? (request.method === "acquire" ? { generation: 1 }
        : request.method === "scope" ? request.input.scope
        : request.method === "dashboardRead" ? (options.latest ? { version: options.latest, content: "{}" } : null)
        : request.method === "dashboardPublish" && options.changed ? { status: "changed", latest: options.latest ?? null }
        : request.method === "dashboardPublish" ? { status: "written", version: { name: publicationName, sourceHash: createHash("sha256").update(request.input.content!).digest("hex") } }
        : true)
      receive?.({ data: { id: request.id, result } })
    },
  })
  return requests
}
afterEach(() => LoginomHost.disconnect())

const it = testEffect(Layer.mergeAll(
  LayerNode.compile(LayerNode.group([Agent.node, Session.node, SessionProjector.node, RuntimeFlags.node, Truncate.node, FSUtil.node, AppProcess.node, Permission.node, Plugin.node, MCP.node, ToolRegistry.node]), [
    [RuntimeFlags.node, RuntimeFlags.layer()],
    [Config.node, TestConfig.layer({ get: () => Effect.succeed({ permission: { "*": "allow" as const } }) })],
  ]),
  testInstanceStoreLayer,
))

it.instance("dashboard_draft reports missing installation resources", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const session = yield* sessions.create()
  const ctx: Tool.Context = {
    sessionID: session.id,
    messageID: MessageID.ascending(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.die("Draft does not request publication permission"),
  }
  const definition = yield* DashboardDraftTool
  const tool = yield* definition.init()
  const exit = yield* tool.execute({}, ctx).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(String(Cause.squash(exit.cause))).toContain("DASHBOARD_RESOURCES_MISSING")
}))

const publicationFolder = Effect.fn(function* (origin = "http://127.0.0.1:0", binding?: DashboardBinding) {
  const instance = yield* TestInstance
  const root = join(instance.directory, "resources")
  const template = resolve(import.meta.dir, "../../../dashboard/template")
  yield* Effect.promise(async () => {
    for (const dir of ["bin", "dashboard", "browsers", "runtime/client/node_modules"]) await mkdir(join(root, dir), { recursive: true })
    await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(root, "bin/node"))
    await symlink(template, join(root, "dashboard/template"), "dir")
    await symlink(resolve(import.meta.dir, "../../../loginom-runtime/client/node_modules/playwright-core"), join(root, "runtime/client/node_modules/playwright-core"), "dir")
    await Bun.write(join(root, "resource-manifest.json"), JSON.stringify({ node: "bin/node", browser: "browsers/chrome" }))
    for (const name of ["dashboard/draft.js", "dashboard/selfcheck.mjs", "browsers/chrome"]) await Bun.write(join(root, name), "fixture")
  })
  const prepare = Effect.fn(function* (binding?: DashboardBinding) {
    const id = crypto.randomUUID()
    const folder = yield* Effect.promise(() => prepareDashboard({ readPublication: async () => null,
      // Port zero fails locally without depending on external routing or proxy timeouts.
      id, origin, dashboards: dashboardDataRoot(process.env), template,
      fetch: Object.assign(async () => Response.json({
        id, created: new Date().toISOString(), published: false, nodeName: "Заказы",
        binding: binding ?? { packagePath: "/fixture/orders-" + id + ".lgp", workflowGuid: crypto.randomUUID(), nodeGuid: crypto.randomUUID() },
        parameters: [], sample: { schema: [{ name: "total", type: "number" }], rows: [[7]] },
      }), { preconnect: () => undefined }),
    }))
    yield* Effect.addFinalizer(() => Effect.promise(() => rm(join(folder.directory, ".."), { recursive: true, force: true })))
    return { work: folder.directory }
  })
  const folder = yield* prepare(binding)
  return { ...folder, root, prepare }
})

it.instance("dashboard_draft limits the complete diagnostic output to whole UTF-8 code points", () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const flags = yield* RuntimeFlags.Service
  yield* Effect.promise(() => Bun.write(join(folder.work, "src/main.tsx"),
    Array.from({ length: 150 }, (_, index) => `const ошибка${index} = отсутствует𝒳${index};`).join("\n"),
  ))
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create()
    const definition = yield* DashboardDraftTool
    const tool = yield* definition.init()
    const result = yield* tool.execute({}, {
      sessionID: session.id, messageID: MessageID.ascending(), agent: "build", messages: [],
      abort: new AbortController().signal, metadata: () => Effect.void, ask: () => Effect.die("Draft must not ask permission"),
    })
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(8192)
    expect(Buffer.byteLength(result.output)).toBeGreaterThan(8188)
    expect(result.output).toStartWith("Сборка не удалась. Исправьте код и вызовите dashboard_draft снова.\n")
    expect(result.output).toContain("отсутствует𝒳")
    expect(result.output).not.toContain("�")
    expect(result.title).toBe("Черновик dashboard")
    expect(result.metadata).toEqual({ truncated: false })
  }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
}))

const dashboardTools = Effect.fn(function* (session: Session.Info, work: string) {
  const agents = yield* Agent.Service
  const agent = yield* agents.get("build")
  const providerID = ProviderV2.ID.make("test")
  const modelID = ModelV2.ID.make("test")
  return yield* SessionTools.resolve({
    agent, session, model: { providerID, api: { id: "test" } } as Provider.Model,
    processor: {
      message: {
        id: MessageID.ascending(), sessionID: session.id, role: "assistant", parentID: MessageID.ascending(),
        agent: agent.name, mode: agent.name, path: { cwd: work, root: work }, cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID, providerID, time: { created: 1 },
      },
      updateToolCall: () => Effect.succeed(undefined), completeToolCall: () => Effect.void,
    },
    messages: [], history: [], bypassAgentCheck: false, promptOps: {} as never,
  })
})

for (const reply of ["reject", "abort", "once"] as const) {
  it.instance("publishing with a global allow still asks once for the bound node and package: " + reply, () => Effect.gen(function* () {
    const requests = publicationHost()
    const lookups: unknown[] = []
    const server = reply === "once" ? yield* Effect.acquireRelease(
      Effect.sync(() => Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
          const url = new URL(request.url)
          const content = requests.find(item => item.method === "dashboardPublish")?.input.content
          if (request.method !== "POST" || url.pathname !== "/dashboard/lookup" || !content)
            return new Response(null, { status: 404 })
          lookups.push(await request.json())
          const version = { name: publicationName, sourceHash: createHash("sha256").update(content).digest("hex") }
          const publication = { ...version, status: "ready", buildHash: "a".repeat(64) }
          return Response.json({
            key: "fixture", exists: true, hash: publication.buildHash, appOrigin: url.origin, mode: "normal",
            cliButton: false, currentVersion: version, latest: publication, publication,
          })
        },
      })),
      server => Effect.promise(() => server.stop(true)),
    ) : undefined
    const folder = yield* publicationFolder(server?.url.origin)
    const flags = yield* RuntimeFlags.Service
    yield* Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ permission: Permission.fromConfig({ "*": "allow" }) })
      const permissions = yield* Permission.Service
      const tools = yield* dashboardTools(session, folder.work)
      const execute = tools.dashboard_publish?.execute
      if (!execute) throw Error("dashboard_publish unavailable")
      const controller = new AbortController()
      const fiber = yield* Effect.promise(() => execute({}, {
        toolCallId: "publish", abortSignal: controller.signal, messages: [],
      })).pipe(Effect.exit, Effect.forkScoped)
      const request = yield* pollWithTimeout(
        permissions.list().pipe(Effect.map(items => items.find(item => item.sessionID === session.id))),
        "missing one-time publication request", "15 seconds",
      )
      const binding = yield* Effect.promise(() => Bun.file(join(folder.work, "../control/binding.json")).json())
      expect(request.permission).toBe("dashboard_publish")
      expect(request.patterns).toEqual([binding.nodeName, binding.binding.packagePath])
      expect(request.always).toEqual([])
      expect(requests.map(item => item.method)).toEqual(["acquire", "scope", "dashboardRead", "release"])
      if (reply === "abort") controller.abort()
      else yield* permissions.reply({ requestID: request.id, reply })
      const exit = yield* Fiber.join(fiber)
      if (reply === "reject") expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
      if (reply === "abort") expect(Exit.isFailure(exit)).toBe(true)
      if (reply === "once") expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
        title: "Публикация dashboard", output: expect.stringMatching(/^published: Dashboard опубликован\./),
      })
      expect(requests.filter(item => item.method === "dashboardPublish")).toHaveLength(reply === "once" ? 1 : 0)
      expect(lookups).toEqual(reply === "once" ? [{ ...binding.binding, publication: publicationName }] : [])
      expect((yield* permissions.list()).filter(item => item.sessionID === session.id)).toEqual([])
      expect(yield* Effect.promise(() => Bun.file(join(folder.work, "sample.json")).exists())).toBe(reply !== "once")
      expect((yield* Effect.promise(() => readdir(join(folder.work, "../..")))).filter(item => item.startsWith(".publish-"))).toEqual([])
    }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
  }), 20_000)
}

const deletionSession = Effect.fn(function* (work: string) {
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ permission: Permission.fromConfig({ "*": "allow" }) })
  const permissions = yield* Permission.Service
  const execute = (yield* dashboardTools(session, work)).dashboard_delete?.execute
  if (!execute) throw Error("dashboard_delete unavailable")
  const nextRequest = (after?: PermissionV1.ID) => pollWithTimeout(
    permissions.list().pipe(Effect.map(items => items.find(item =>
      item.sessionID === session.id && item.permission === "dashboard_delete" && item.id !== after,
    ))),
    "missing one-time deletion request",
    "3 seconds",
  )
  const start = (signal = new AbortController().signal) => Effect.promise(() => execute({}, {
    toolCallId: "delete", abortSignal: signal, messages: [],
  })).pipe(Effect.exit, Effect.forkScoped)
  return { session, permissions, nextRequest, start }
})

it.instance("an approved edit cannot recreate a dashboard deleted while it awaited permission", () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const root = dashboardDataRoot(process.env)
  const captured = yield* Effect.promise(() => readDashboardBinding(folder.work, root))
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const permissions = yield* Permission.Service
    const session = yield* sessions.create({ permission: Permission.fromConfig({ "*": "allow", edit: "ask" }) })
    const execute = (yield* dashboardTools(session, folder.work)).write?.execute
    if (!execute) throw Error("write unavailable")
    const writing = yield* Effect.promise(() => execute({ filePath: "src/new/draft.ts", content: "export {}" }, {
      toolCallId: "write", abortSignal: new AbortController().signal, messages: [],
    })).pipe(Effect.exit, Effect.forkScoped)
    const request = yield* pollWithTimeout(
      permissions.list().pipe(Effect.map(items => items.find(item => item.sessionID === session.id && item.permission === "edit"))),
      "missing edit permission",
    )
    removeDashboard(folder.work, root, captured)
    yield* permissions.reply({ requestID: request.id, reply: "once" })
    const exit = yield* Fiber.join(writing)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(String(Cause.squash(exit.cause))).toContain("LOGINOM_SCOPE_DENIED")
    expect(yield* Effect.promise(() => lstat(dirname(folder.work)).catch(error => error.code))).toBe("ENOENT")
  }).pipe(provideInstance(folder.work))
}))

const deletionVersion = { name: publicationName, sourceHash: "a".repeat(64) }

for (const reply of ["reject", "abort", "always"] as const) {
  it.instance("delete preserves publications and draft until explicit once: " + reply, () => Effect.gen(function* () {
    const folder = yield* publicationFolder()
    const versions = [deletionVersion]
    const requests = publicationHost({ respond: request => {
      if (request.method === "dashboardVersions") return { generation: 1, versions }
      if (request.method === "dashboardDelete") {
        versions.length = 0
        return { status: "empty" }
      }
    } })
    yield* Effect.gen(function* () {
      const deletion = yield* deletionSession(folder.work)
      const controller = new AbortController()
      const fiber = yield* deletion.start(controller.signal)
      const request = yield* deletion.nextRequest()
      expect(request.always).toEqual([])
      expect(request.metadata.publicationCount).toBe(1)

      if (reply === "always") {
        // An Always answer for another pending permission may establish a global allow.
        const general = yield* deletion.permissions.ask({
          sessionID: deletion.session.id, permission: "*", patterns: ["*"], always: ["*"], metadata: {}, ruleset: [],
        }).pipe(Effect.forkScoped)
        const pending = yield* pollWithTimeout(
          deletion.permissions.list().pipe(Effect.map(items => items.find(item => item.permission === "*"))),
          "missing general permission request",
        )
        yield* deletion.permissions.reply({ requestID: pending.id, reply: "always" })
        yield* Fiber.join(general)
        expect((yield* deletion.permissions.list()).map(item => item.id)).toEqual([request.id])
      }
      if (reply === "abort") controller.abort()
      else yield* deletion.permissions.reply({ requestID: request.id, reply })
      const exit = yield* Fiber.join(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (reply !== "abort" && Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
      expect(yield* deletion.permissions.list()).toEqual([])
      expect(requests.map(item => item.method)).toEqual(["acquire", "scope", "dashboardVersions", "release"])
      expect(versions).toEqual([deletionVersion])
      expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).exists())).toBe(true)
      if (reply !== "always") return

      const retry = yield* deletion.start()
      const next = yield* deletion.nextRequest(request.id)
      expect(next.metadata.publicationCount).toBe(1)
      expect(requests.filter(item => item.method === "dashboardDelete")).toEqual([])
      yield* deletion.permissions.reply({ requestID: next.id, reply: "reject" })
      expect(Exit.isFailure(yield* Fiber.join(retry))).toBe(true)
      expect(yield* deletion.permissions.list()).toEqual([])
    }).pipe(provideInstance(folder.work))
  }))
}

it.instance("delete asks for the updated publication set after the first approval", () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const updated = [
    { name: "20261115T110000Z.json", sourceHash: "b".repeat(64) },
    { ...deletionVersion, sourceHash: "c".repeat(64) },
  ]
  let versions = [deletionVersion]
  const requests = publicationHost({ respond: request => {
    if (request.method === "dashboardVersions") return { generation: 1, versions }
    if (request.method === "dashboardDelete") {
      expect(request.input.expected).toEqual([deletionVersion])
      return { status: "changed", remaining: versions, confirmedRemoved: 0 }
    }
  } })
  yield* Effect.gen(function* () {
    const deletion = yield* deletionSession(folder.work)
    const fiber = yield* deletion.start()
    const first = yield* deletion.nextRequest()
    expect(first.metadata).toEqual({ publicationCount: 1 })
    versions = updated
    yield* deletion.permissions.reply({ requestID: first.id, reply: "once" })
    const second = yield* deletion.nextRequest(first.id)
    expect(second.metadata).toEqual({ publicationCount: 2 })
    expect(requests.map(item => item.method)).toEqual([
      "acquire", "scope", "dashboardVersions", "release", "acquire", "scope", "dashboardDelete", "release",
    ])
    yield* deletion.permissions.reply({ requestID: second.id, reply: "reject" })
    const exit = yield* Fiber.join(fiber)
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
    expect(requests.filter(item => item.method === "dashboardDelete")).toHaveLength(1)
    expect(versions).toEqual(updated)
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).exists())).toBe(true)
  }).pipe(provideInstance(folder.work))
}))

it.instance("delete reports confirmed partial progress and submits only the newly approved set", () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const remaining = [{ ...deletionVersion, sourceHash: "b".repeat(64) }]
  let attempts = 0
  const requests = publicationHost({ respond: request => {
    if (request.method === "dashboardVersions") return { generation: 7, versions: [deletionVersion] }
    if (request.method === "dashboardDelete") {
      attempts++
      if (attempts === 1) return { status: "changed", confirmedRemoved: 1, remaining }
      if (attempts === 2) return { status: "changed", confirmedRemoved: 0, remaining: [] }
      return { status: "empty" }
    }
  } })
  yield* Effect.gen(function* () {
    const deletion = yield* deletionSession(folder.work)
    const fiber = yield* deletion.start()
    const first = yield* deletion.nextRequest()
    yield* deletion.permissions.reply({ requestID: first.id, reply: "once" })
    const second = yield* deletion.nextRequest(first.id)
    expect(second.metadata).toEqual({ publicationCount: 1, confirmedRemoved: 1 })
    expect(attempts).toBe(1)
    yield* deletion.permissions.reply({ requestID: second.id, reply: "once" })
    const third = yield* deletion.nextRequest(second.id)
    expect(third.metadata).toEqual({ publicationCount: 0, confirmedRemoved: 1 })
    expect(attempts).toBe(2)
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).exists())).toBe(true)
    yield* deletion.permissions.reply({ requestID: third.id, reply: "once" })
    const exit = yield* Fiber.join(fiber)
    expect(Exit.isSuccess(exit) && exit.value).toHaveProperty("output", expect.stringContaining("Дашборд удалён"))
    expect(requests.filter(item => item.method === "dashboardVersions")).toHaveLength(1)
    expect(requests.filter(item => item.method === "dashboardDelete").map(item => [item.input.generation, item.input.expected])).toEqual([
      [7, [deletionVersion]], [7, remaining], [7, []],
    ])
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).exists())).toBe(false)
  }).pipe(provideInstance(folder.work))
}))

for (const outcome of ["unknown", "denied", "invalid", "invalid count"] as const) {
  it.instance("delete keeps sources and live preview after " + outcome, () => Effect.gen(function* () {
    const folder = yield* publicationFolder()
    const preview = yield* Effect.acquireRelease(
      Effect.promise(() => draftServer(join(folder.root, "dashboard/draft.js"))),
      server => Effect.promise(() => server.close()),
    )
    const saved = readDashboardSnapshot(folder.work)!
    const url = preview.publish({
      key: saved.control.key, builds: join(folder.work, "../control/draft"), hash: "c".repeat(64),
      data: {
        created: saved.snapshot.created, sample: saved.sample, parameters: [],
        nodeName: saved.control.nodeName, packagePath: saved.control.binding.packagePath,
      },
    }).replace("localhost", "127.0.0.1")
    const before = yield* Effect.promise(() => fetch(url + "data").then(response => response.json()))
    const source = join(folder.work, "src/main.tsx")
    const original = yield* Effect.promise(() => Bun.file(source).text())
    const remaining = { name: "20261115T120001Z.json", sourceHash: "b".repeat(64) }
    let versions = [deletionVersion, remaining]
    let attempts = 0
    const requests = publicationHost({ respond: request => {
      if (request.method === "dashboardVersions") return { generation: 1, versions }
      if (request.method !== "dashboardDelete") return
      if (++attempts === 2) {
        expect(request.input.expected).toEqual([remaining])
        versions = []
        return { status: "empty" }
      }
      if (outcome === "invalid") return { status: "empty", remaining: versions }
      if (outcome === "invalid count") return { status: "changed", remaining: [remaining], confirmedRemoved: 3 }
      versions = [remaining]
      return outcome === "unknown"
        ? { status: "failed", reason: "DASHBOARD_DELETE_UNKNOWN", confirmedRemoved: 1 }
        : { status: "failed", reason: "DASHBOARD_ACCESS_DENIED", confirmedRemoved: 1, remaining: versions }
    } })
    yield* Effect.gen(function* () {
      const deletion = yield* deletionSession(folder.work)
      const fiber = yield* deletion.start()
      const request = yield* deletion.nextRequest()
      yield* deletion.permissions.reply({ requestID: request.id, reply: "once" })
      const exit = yield* Effect.raceFirst(
        Fiber.join(fiber),
        deletion.nextRequest(request.id).pipe(Effect.flatMap(() => Effect.die("Unexpected deletion reconfirmation"))),
      )
      const result = Exit.isSuccess(exit) && exit.value
      expect(result).toHaveProperty("output", expect.stringContaining(
        outcome === "denied" ? "Недостаточно прав" : "Не удалось подтвердить результат",
      ))
      if (outcome === "invalid" || outcome === "invalid count") expect(result).not.toHaveProperty("output", expect.stringContaining("Подтверждено удаление версий"))
      else expect(result).toHaveProperty("output", expect.stringContaining("Подтверждено удаление версий: 1"))
      expect(yield* deletion.permissions.list()).toEqual([])
      expect(attempts).toBe(1)
      expect(yield* Effect.promise(() => Bun.file(source).text())).toBe(original)
      expect(yield* Effect.promise(() => fetch(url + "data").then(response => response.json()))).toEqual(before)
      if (outcome !== "unknown") return

      const retry = yield* deletion.start()
      const next = yield* deletion.nextRequest()
      expect(next.metadata).toEqual({ publicationCount: 1 })
      expect(requests.filter(item => item.method === "dashboardVersions")).toHaveLength(2)
      expect(attempts).toBe(1)
      yield* deletion.permissions.reply({ requestID: next.id, reply: "once" })
      expect(Exit.isSuccess(yield* Fiber.join(retry))).toBe(true)
      expect(yield* Effect.promise(() => Bun.file(source).exists())).toBe(false)
    }).pipe(provideInstance(folder.work))
  }))
}

it.instance("delete preserves a newly prepared snapshot and retries from a fresh empty listing", () => Effect.gen(function* () {
  const binding = { packagePath: "/fixture/orders.lgp", workflowGuid: crypto.randomUUID(), nodeGuid: crypto.randomUUID() }
  const folder = yield* publicationFolder(undefined, binding)
  const captured = readDashboardSnapshot(folder.work)!.control.snapshotId
  let versions = [deletionVersion]
  const requests = publicationHost({ respond: request => {
    if (request.method === "dashboardVersions") return { generation: 1, versions }
    if (request.method === "dashboardDelete") {
      expect(request.input).toMatchObject({ binding, expected: versions })
      versions = []
      return { status: "empty" }
    }
  } })
  yield* Effect.gen(function* () {
    const deletion = yield* deletionSession(folder.work)
    const fiber = yield* deletion.start()
    const original = yield* deletion.nextRequest()
    expect(original.metadata.publicationCount).toBe(1)
    expect((yield* folder.prepare(binding)).work).toBe(folder.work)
    const refreshed = readDashboardSnapshot(folder.work)!.control
    expect(refreshed.snapshotId).not.toBe(captured)

    yield* deletion.permissions.reply({ requestID: original.id, reply: "once" })
    const result = yield* Fiber.join(fiber)
    expect(Exit.isSuccess(result) && result.value).toHaveProperty("output",
      expect.stringMatching(/подтверждено отсутствие опубликованных версий.*папку черновика удалить не удалось/))
    expect(readDashboardSnapshot(folder.work)!.control).toEqual(refreshed)
    const workSource = join(folder.work, "src/main.tsx")
    expect(yield* Effect.promise(() => Bun.file(workSource).exists())).toBe(true)
    expect(versions).toEqual([])

    const retry = yield* deletion.start()
    const next = yield* deletion.nextRequest()
    expect(next.metadata).toEqual({ publicationCount: 0 })
    expect(requests.filter(item => item.method === "dashboardVersions")).toHaveLength(2)
    expect(requests.filter(item => item.method === "dashboardDelete")).toHaveLength(1)
    expect(yield* Effect.promise(() => Bun.file(workSource).exists())).toBe(true)
    yield* deletion.permissions.reply({ requestID: next.id, reply: "once" })
    const completed = yield* Fiber.join(retry)
    expect(Exit.isSuccess(completed) && completed.value).toHaveProperty("output", expect.stringContaining("Дашборд удалён"))
    expect(requests.filter(item => item.method === "dashboardDelete")).toHaveLength(2)
    expect(yield* deletion.permissions.list()).toEqual([])
    expect(yield* Effect.promise(() => Bun.file(workSource).exists())).toBe(false)

    const sessions = yield* Session.Service
    expect((yield* sessions.get(deletion.session.id)).id).toBe(deletion.session.id)
    const denied = yield* sessions.getForExecution(deletion.session.id).pipe(Effect.exit)
    expect(Exit.isFailure(denied) && String(Cause.squash(denied.cause))).toContain("LOGINOM_SCOPE_DENIED")
  }).pipe(provideInstance(folder.work))
}))

it.instance("delete removes two versions and the local draft, and leaves the neighbour available", () => Effect.gen(function* () {
  const origin = "http://127.0.0.1:0"
  const binding = { packagePath: "/fixture/orders.lgp", workflowGuid: crypto.randomUUID(), nodeGuid: crypto.randomUUID() }
  const neighbourBinding = { ...binding, nodeGuid: crypto.randomUUID() }
  const folder = yield* publicationFolder(origin, binding)
  const neighbour = yield* folder.prepare(neighbourBinding)
  const neighbourVersion = { name: publicationName, sourceHash: "c".repeat(64) }
  const key = (item: DashboardBinding) => JSON.stringify([item.packagePath, item.workflowGuid, item.nodeGuid])
  const versions = new Map([
    [key(binding), [
      { name: "20261115T110000Z.json", sourceHash: "a".repeat(64) },
      { name: publicationName, sourceHash: "b".repeat(64) },
    ]],
    [key(neighbourBinding), [neighbourVersion]],
  ])
  const respond = (request: HostRequest) => {
    if (request.method !== "dashboardVersions" && request.method !== "dashboardDelete") return
    if (!request.input.binding) throw Error("Dashboard binding required")
    const nodeKey = key(request.input.binding)
    const remaining = versions.get(nodeKey) ?? []
    if (request.method === "dashboardVersions") return { generation: 1, versions: remaining }
    if (request.input.generation !== 1) throw Error("Captured generation required")
    if (JSON.stringify(request.input.expected) !== JSON.stringify(remaining))
      return { status: "changed", remaining, confirmedRemoved: 0 }
    versions.delete(nodeKey)
    return { status: "empty" }
  }
  publicationHost({ respond })
  yield* Effect.gen(function* () {
    const deletion = yield* deletionSession(folder.work)
    const fiber = yield* deletion.start()
    const request = yield* deletion.nextRequest()
    expect(request.always).toEqual([])
    expect(request.metadata.publicationCount).toBe(2)
    yield* deletion.permissions.reply({ requestID: request.id, reply: "once" })
    const exit = yield* Fiber.join(fiber)
    expect(Exit.isSuccess(exit) && exit.value).toHaveProperty("output", expect.stringContaining("Дашборд удалён"))
    expect(respond({ method: "dashboardVersions", input: { binding } })).toEqual({ generation: 1, versions: [] })
    expect(respond({ method: "dashboardVersions", input: { binding: neighbourBinding } })).toEqual({ generation: 1, versions: [neighbourVersion] })
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).exists())).toBe(false)
    expect(yield* Effect.promise(() => Bun.file(join(neighbour.work, "src/main.tsx")).exists())).toBe(true)
  }).pipe(provideInstance(folder.work))
}), 20_000)

it.instance("interruption joins an active publication build before removing its operation", () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const flags = yield* RuntimeFlags.Service
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create()
    const definition = yield* DashboardPublishTool
    const tool = yield* definition.init()
    const fiber = yield* tool.execute({}, {
      sessionID: session.id, messageID: MessageID.ascending(), agent: "build", messages: [],
      abort: new AbortController().signal, metadata: () => Effect.void, ask: () => Effect.never,
    }).pipe(Effect.forkScoped)
    const root = join(folder.work, "../..")
    const draft = join(folder.work, "../control/draft")
    const operation = yield* pollWithTimeout(Effect.promise(async () => {
      for (const name of (await readdir(root)).filter(name => name.startsWith(".publish-"))) {
        const path = join(root, name)
        const pending = (await readdir(path).catch(() => [])).find(name => name.startsWith(".pending-"))
        if (pending && (await readdir(join(path, pending)).catch(() => [])).some(name => name.startsWith(".build-")))
          return path
      }
    }), "publication never entered the filesystem build")
    yield* Fiber.interrupt(fiber)
    const hash = (yield* Effect.promise(() => Bun.file(join(draft, "current")).text())).trim()
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(yield* Effect.promise(() => readdir(operation).then(() => true, () => false))).toBe(false)
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "sample.json")).exists())).toBe(true)
  }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
}))

it.instance("publication limits the complete model output to whole UTF-8 code points", () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const flags = yield* RuntimeFlags.Service
  const value = "🟢".repeat(8192)
  yield* Effect.promise(async () => {
    const sample = Bun.file(join(folder.work, "sample.json"))
    await Bun.write(sample, JSON.stringify({ ...await sample.json(), rows: [[value]] }))
    await Bun.write(join(folder.work, "src/main.tsx"), "document.body.textContent = " + JSON.stringify(value))
  })
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create()
    const definition = yield* DashboardPublishTool
    const tool = yield* definition.init()
    const result = yield* tool.execute({}, {
      sessionID: session.id, messageID: MessageID.ascending(), agent: "build", messages: [],
      abort: new AbortController().signal, metadata: () => Effect.void, ask: () => Effect.die("Embedded values must block publication"),
    })
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(8192)
    expect(result.output).toMatch(/^failed: Сборка не удалась\.\n.*публичной\./)
    expect(result.output.endsWith("🟢")).toBe(true)
    expect(Buffer.byteLength(result.output + "🟢")).toBeGreaterThan(8192)
    expect(result.output).not.toContain("�")
  }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
}))

for (const code of ["DASHBOARD_ACCESS_DENIED", "DASHBOARD_VERSION_EXISTS", "DASHBOARD_WRITE_UNKNOWN", "LOGINOM_RUNTIME_CLEANUP_FAILED"]) {
it.instance("host failure preserves the draft and its specific reason without retry: " + code, () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const requests = publicationHost({ error: code })
  const flags = yield* RuntimeFlags.Service
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create()
    const definition = yield* DashboardPublishTool
    const tool = yield* definition.init()
    const result = yield* tool.execute({}, {
      sessionID: session.id, messageID: MessageID.ascending(), agent: "build", messages: [],
      abort: new AbortController().signal, metadata: () => Effect.void, ask: () => Effect.void,
    })
    expect(result.output).toContain(code)
    if (code === "DASHBOARD_ACCESS_DENIED") expect(result.output).toContain("Недостаточно прав")
    if (code === "DASHBOARD_WRITE_UNKNOWN") expect(result.output).toContain("автоматически не выполняется")
    expect(requests.filter(item => item.method === "dashboardPublish")).toHaveLength(1)
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "sample.json")).exists())).toBe(true)
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).exists())).toBe(true)
  }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
}))

}

it.instance("a changed server version requires new confirmation and preserves edited sources", () => Effect.gen(function* () {
  const folder = yield* publicationFolder()
  const latest = { name: "20261115T110000Z.json", sourceHash: "a".repeat(64) }
  const server = { latest, changed: false }
  const requests = publicationHost(server)
  const flags = yield* RuntimeFlags.Service
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create()
    const definition = yield* DashboardPublishTool
    const tool = yield* definition.init()
    expect(ToolJsonSchema.fromSchema(tool.parameters)).toMatchObject({ properties: {} })
    const before = yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).text())
    let approvedHash = ""
    const result = yield* tool.execute({}, {
      sessionID: session.id, messageID: MessageID.ascending(), agent: "build", messages: [],
      abort: new AbortController().signal, metadata: () => Effect.void,
      ask: request => Effect.promise(async () => {
        expect(request.metadata).toMatchObject({ dashboardConflict: { base: null, latest } })
        if (typeof request.metadata.sourceHash !== "string") throw Error("Missing approved source hash")
        approvedHash = request.metadata.sourceHash
        await Bun.write(join(folder.work, "src/main.tsx"), "document.body.textContent = 'new local draft'")
        server.latest = { name: "20261115T120000Z.json", sourceHash: "b".repeat(64) }
        server.changed = true
      }),
    })
    expect(result.output).toStartWith("needs-confirmation:")
    const writes = requests.filter(item => item.method === "dashboardPublish")
    expect(writes).toHaveLength(1)
    expect(writes[0].input.expected).toEqual(latest)
    expect(writes.some(write => JSON.stringify(write.input.expected) === JSON.stringify(server.latest))).toBe(false)
    const content = writes[0].input.content!
    expect(createHash("sha256").update(content).digest("hex")).toBe(approvedHash)
    expect(JSON.parse(content).files.find((file: { path: string }) => file.path === "src/main.tsx").content).toBe(before)
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).text())).toContain("new local draft")
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "sample.json")).exists())).toBe(true)
  }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
}))
