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
import { join, resolve } from "node:path"
import { mkdir, readdir, rm, symlink } from "node:fs/promises"
import { prepareDashboard } from "@loginom-ai-agent/dashboard/agent/folder"
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
      expect((yield* Effect.promise(() => readdir(join(folder.work, "../control")))).filter(item => item.startsWith(".publish-"))).toEqual([])
    }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
  }), 20_000)
}

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
  const flags = yield* RuntimeFlags.Service
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create({ permission: Permission.fromConfig({ "*": "allow" }) })
    const permissions = yield* Permission.Service
    const tools = yield* dashboardTools(session, folder.work)
    const execute = tools.dashboard_delete?.execute
    if (!execute) throw Error("dashboard_delete unavailable")
    const fiber = yield* Effect.promise(() => execute({}, {
      toolCallId: "delete", abortSignal: new AbortController().signal, messages: [],
    })).pipe(Effect.forkScoped)
    const request = yield* pollWithTimeout(
      permissions.list().pipe(Effect.map(items => items.find(item => item.sessionID === session.id))),
      "missing one-time deletion request", "15 seconds",
    )
    expect(request.permission).toBe("dashboard_delete")
    expect(request.always).toEqual([])
    expect(request.metadata.publicationCount).toBe(2)
    yield* permissions.reply({ requestID: request.id, reply: "once" })
    const result = yield* Fiber.join(fiber)
    expect(result).toHaveProperty("output", expect.stringContaining("Дашборд удалён"))
    expect(respond({ method: "dashboardVersions", input: { binding } })).toEqual({ generation: 1, versions: [] })
    expect(respond({ method: "dashboardVersions", input: { binding: neighbourBinding } })).toEqual({ generation: 1, versions: [neighbourVersion] })
    expect(yield* Effect.promise(() => Bun.file(join(folder.work, "src/main.tsx")).exists())).toBe(false)
    expect(yield* Effect.promise(() => Bun.file(join(neighbour.work, "src/main.tsx")).exists())).toBe(true)
  }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
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
    const control = join(folder.work, "../control")
    const draft = join(control, "draft")
    yield* pollWithTimeout(Effect.promise(async () => {
      const pending = (await readdir(draft).catch(() => [])).find(name => name.startsWith(".pending-"))
      if (pending) return (await readdir(join(draft, pending)).catch(() => [])).find(name => name.startsWith(".build-"))
    }), "publication never entered the filesystem build")
    yield* Fiber.interrupt(fiber)
    const hash = (yield* Effect.promise(() => Bun.file(join(draft, "current")).text())).trim()
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect((yield* Effect.promise(() => readdir(draft))).filter(name => /^\.(pending|build)-/.test(name))).toEqual([])
    expect((yield* Effect.promise(() => readdir(control))).filter(name => name.startsWith(".publish-"))).toEqual([])
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
