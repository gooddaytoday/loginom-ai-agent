import { expect } from "bun:test"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { DashboardDraftTool, DashboardPublishTool } from "@/tool/dashboard"
import { Agent } from "@/agent/agent"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
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

const publicationFolder = Effect.fn(function* () {
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
  const id = crypto.randomUUID()
  const folder = yield* Effect.promise(() => prepareDashboard({
    id, origin: "http://192.0.2.1:32768", dashboards: dashboardDataRoot(process.env), template,
    fetch: Object.assign(async () => Response.json({
      id, created: new Date().toISOString(), published: false, nodeName: "Заказы",
      binding: { packagePath: "/fixture/orders-" + id + ".lgp", workflowGuid: crypto.randomUUID(), nodeGuid: crypto.randomUUID() },
      parameters: [], sample: { schema: [{ name: "total", type: "number" }], rows: [[7]] },
    }), { preconnect: () => undefined }),
  }))
  yield* Effect.addFinalizer(() => Effect.promise(() => rm(join(folder.directory, ".."), { recursive: true, force: true })))
  return { root, work: folder.directory }
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

for (const reply of ["reject", "abort", "once"] as const) {
  it.instance("publishing with a global allow still asks once for the bound node and package: " + reply, () => Effect.gen(function* () {
    const folder = yield* publicationFolder()
    const flags = yield* RuntimeFlags.Service
    yield* Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ permission: Permission.fromConfig({ "*": "allow" }) })
      const agents = yield* Agent.Service
      const agent = yield* agents.get("build")
      const permissions = yield* Permission.Service
      const providerID = ProviderV2.ID.make("test")
      const modelID = ModelV2.ID.make("test")
      const tools = yield* SessionTools.resolve({
        agent, session, model: { providerID, api: { id: "test" } } as Provider.Model,
        processor: {
          message: {
            id: MessageID.ascending(), sessionID: session.id, role: "assistant", parentID: MessageID.ascending(),
            agent: agent.name, mode: agent.name, path: { cwd: folder.work, root: folder.work }, cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID, providerID, time: { created: 1 },
          },
          updateToolCall: () => Effect.succeed(undefined), completeToolCall: () => Effect.void,
        },
        messages: [], history: [], bypassAgentCheck: false, promptOps: {} as never,
      })
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
      if (reply === "abort") controller.abort()
      else yield* permissions.reply({ requestID: request.id, reply })
      const exit = yield* Fiber.join(fiber)
      if (reply === "reject") expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.RejectedError)
      if (reply === "abort") expect(Exit.isFailure(exit)).toBe(true)
      if (reply === "once") expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
        title: "Публикация dashboard", output: "failed: Публикация на этот стенд появится в следующей версии",
      })
      expect((yield* permissions.list()).filter(item => item.sessionID === session.id)).toEqual([])
      expect(yield* Effect.promise(() => Bun.file(join(folder.work, "sample.json")).exists())).toBe(true)
      expect((yield* Effect.promise(() => readdir(join(folder.work, "../control")))).filter(item => item.startsWith(".publish-"))).toEqual([])
    }).pipe(provideInstance(folder.work), Effect.provideService(RuntimeFlags.Service, { ...flags, loginomResources: folder.root }))
  }))
}

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
    yield* pollWithTimeout(Effect.promise(async () =>
      (await readdir(draft).catch(() => [])).find(name => name.startsWith(".build-")),
    ), "publication never entered the filesystem build")
    yield* Fiber.interrupt(fiber)
    const hash = (yield* Effect.promise(() => Bun.file(join(draft, "current")).text())).trim()
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect((yield* Effect.promise(() => readdir(draft))).filter(name => name.startsWith(".build-"))).toEqual([])
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
