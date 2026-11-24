// `loginom.dashboard` on a real server (B2.9h): the product plugin prepares a dashboard's folder before its chat with the
// server's Host and answers the folder or a code, as 0.4's Desktop and CLI did with a Host of their own. The 9 cases of
// 0.4's `dashboard-target.test.ts` run on the preparation itself: `loginom-agent/test/dashboard-target.test.ts`. Here a
// Studio of the case serves one-time snapshots on 127.0.0.1, the Host answers by the case's script and logs its requests,
// the folders go under a data root of the case's own (`temporaryData`), and the template is the installation's resources.
import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect } from "bun:test"
import { Flag } from "@opencode/core/flag"
import { Global } from "@opencode/util/global"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { hostException } from "../../loginom-host/src/errors"
import { Dashboard } from "../../loginom-agent/src/dashboard"
import { ServiceHost } from "../../loginom-agent/src/host"
import { temporaryData } from "../../loginom-agent/test/fixture/temporary-data"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { createEmbeddedRoutes } from "../src/routes"
import { scriptedHost } from "./fixture/loginom-dock-host"
import { pluginsLoaded } from "./fixture/routes"

const template = path.resolve(import.meta.dir, "../../dashboard/template")
// Each case boots a server Location, about 1–2 s locally.
const timeout = 30_000

const snapshot = (published: boolean) => ({
  id: crypto.randomUUID(),
  created: "2026-11-24T00:00:00.000Z",
  binding: {
    packagePath: `/user/fixture/orders-${crypto.randomUUID()}.lgp`,
    workflowGuid: crypto.randomUUID(),
    nodeGuid: crypto.randomUUID(),
  },
  nodeName: "Заказы",
  sample: { schema: [{ name: "total", type: 1 }], rows: [[7]] },
  parameters: [],
  published,
})

const boot = Effect.gen(function* () {
  const dir = (yield* tmpdirScoped("loginom-dashboard-target-")).path
  // The plugin's dashboards root is `Global.Path.data`, which the routes' own data directory does not move.
  yield* Effect.acquireRelease(
    Effect.promise(() => temporaryData()),
    (data) => Effect.promise(() => data[Symbol.asyncDispose]()),
  )
  const resources = path.join(dir, "resources")
  yield* Effect.promise(async () => {
    await fs.mkdir(path.join(resources, "dashboard"), { recursive: true })
    await fs.symlink(template, path.join(resources, "dashboard", "template"), "dir")
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

  // Studio gives each snapshot once, as Studio does, and answers a publication's lookup with `lookup.body` when there is
  // one; `seen` lists the paths it was asked.
  const snapshots = new Map<string, ReturnType<typeof snapshot>>()
  const seen: string[] = []
  const lookup = { body: undefined as unknown }
  const studio = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: (request) => {
          const url = new URL(request.url)
          seen.push(url.pathname)
          if (url.pathname === "/dashboard/lookup" && lookup.body) return Response.json(lookup.body)
          const id = url.pathname.match(/^\/dashboard\/snapshots\/(.+)$/)?.[1]
          const found = id ? snapshots.get(id) : undefined
          if (!id || !found) return new Response(null, { status: 404 })
          snapshots.delete(id)
          return Response.json(found)
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const origin = studio.url.origin

  // The Host of the server process, by the case's script.
  const script = {
    generation: 2,
    ready: undefined as string | undefined,
    // Holds `connection.ready` until the case lets it answer.
    hold: undefined as Promise<void> | undefined,
    read: (_input: unknown): unknown => null,
    log: [] as { method: string; input: unknown }[],
  }
  const scripted = scriptedHost()
  const request = async (method: string, input: unknown) => {
    script.log.push({ method, input })
    if (method === "connection.status")
      return { url: origin + "/app/?x=1", generation: script.generation, state: "ready" }
    if (method === "connection.ready") {
      await script.hold
      if (script.ready) throw hostException(script.ready)
      return { url: origin + "/app/?x=1", generation: script.generation, state: "ready" }
    }
    if (method === "dashboard.read") return script.read(input)
    throw hostException("LOGINOM_METHOD_INVALID")
  }
  yield* Effect.acquireRelease(
    Effect.promise(() =>
      ServiceHost.start({
        data: path.join(dir, "data"),
        connect: async () => ({ ...(await scripted.connect()), request }),
      }),
    ),
    () => Effect.promise(() => ServiceHost.close()),
  )

  const global = path.join(dir, "global")
  const project = path.join(dir, "project")
  yield* Effect.promise(() =>
    Promise.all([fs.mkdir(path.join(global, "config"), { recursive: true }), fs.mkdir(project)]),
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
      ],
    ).pipe(Layer.provide(HttpServer.layerServices)),
  )
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  // The RPC on an ordinary project's Location, as the CLI asks on the Location of its working directory.
  yield* pluginsLoaded(context, project)
  const send = (method: "prepare" | "find", input: unknown, signal?: AbortSignal) =>
    handler(
      new Request(
        `http://opencode.local/api/rpc/loginom.dashboard/${method}?location[directory]=${encodeURIComponent(project)}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }), signal },
      ),
    )
  const call = (method: "prepare" | "find", input: unknown) =>
    Effect.promise(async () => {
      const response = await send(method, input)
      return { status: response.status, body: await response.json() }
    })
  const offer = (published: boolean) => {
    const value = snapshot(published)
    snapshots.set(value.id, value)
    return value
  }
  return { send, call, offer, script, seen, lookup, origin, resources }
})

const methods = (log: { method: string }[]) => log.map((entry) => entry.method)

describe("loginom.dashboard (B2.9h)", () => {
  it.live(
    "prepares the folder under the server's data root from the template: Desktop defers the publication check of a new dashboard, the CLI reads it through the Host with the captured generation",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const desktop = test.offer(false)
        expect(yield* test.call("find", { id: desktop.id })).toEqual({
          status: 200,
          body: { output: { found: false } },
        })
        const created = yield* test.call("prepare", { id: desktop.id, defer: true })
        expect(created.status).toBe(200)
        expect(created.body.output).toMatchObject({ nodeName: "Заказы", action: "create", fresh: true })
        expect(Object.keys(created.body.output).toSorted()).toEqual(["action", "directory", "fresh", "nodeName"])
        const directory: string = created.body.output.directory
        expect(directory.startsWith(Dashboard.root() + path.sep)).toBe(true)
        expect(Dashboard.isWork(directory)).toBe(true)
        expect(yield* Effect.promise(() => fs.readdir(path.join(directory, "src")))).toEqual(
          yield* Effect.promise(() => fs.readdir(path.join(template, "src"))),
        )
        // Desktop's new dashboard: the Host was asked its status only, Studio its snapshot only.
        expect(methods(test.script.log)).toEqual(["connection.status"])
        expect(test.seen).toEqual([`/dashboard/snapshots/${desktop.id}`])
        expect(yield* test.call("find", { id: desktop.id })).toEqual({ status: 200, body: { output: { found: true } } })

        test.script.log.length = 0
        const cli = test.offer(false)
        const read = yield* test.call("prepare", { id: cli.id, defer: false })
        expect(read.body.output).toMatchObject({ nodeName: "Заказы", action: "create", fresh: true })
        expect(test.script.log).toEqual([
          { method: "connection.status", input: {} },
          { method: "connection.ready", input: {} },
          { method: "dashboard.read", input: { origin: test.origin, generation: 2, binding: cli.binding } },
        ])

        // A published dashboard whose publication cannot be checked opens its saved local draft with a notice.
        test.script.log.length = 0
        test.script.ready = "LOGINOM_CONNECTION_NOT_READY"
        const again = test.offer(true)
        again.binding = desktop.binding
        const reopened = yield* test.call("prepare", { id: again.id, defer: true })
        expect(reopened.body.output).toEqual({
          directory,
          nodeName: "Заказы",
          action: "edit",
          fresh: false,
          notice: { kind: "publication-check-unavailable" },
        })
        expect(methods(test.script.log)).toEqual(["connection.status", "connection.ready"])

        // Its latest version failed to build in Studio: the notice names it, without the reason Studio did not give.
        test.script.ready = undefined
        const version = { name: "20261124T120000Z.json", sourceHash: "b".repeat(64) }
        test.script.read = () => ({ version, content: "{}" })
        test.lookup.body = {
          key: "fixture",
          exists: true,
          hash: null,
          appOrigin: test.origin,
          mode: "normal",
          cliButton: false,
          currentVersion: null,
          latest: null,
          publication: { name: version.name, sourceHash: version.sourceHash, status: "failed" },
        }
        const failed = test.offer(true)
        failed.binding = desktop.binding
        expect(yield* test.call("prepare", { id: failed.id, defer: true })).toEqual({
          status: 200,
          body: {
            output: {
              directory,
              nodeName: "Заказы",
              action: "edit",
              fresh: false,
              notice: { kind: "latest-build-failed", latest: version.name },
            },
          },
        })
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "answers 0.4's codes: the Host's with their text, the dashboard's by name, nothing that carries a path",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const prepare = (id: string, defer = true) =>
          test.call("prepare", { id, defer }).pipe(Effect.map((response) => [response.status, response.body.output]))

        // No connection: refused before the one-time snapshot is fetched.
        test.script.generation = 0
        const waiting = test.offer(false)
        expect(yield* prepare(waiting.id)).toEqual([
          200,
          { code: "LOGINOM_CONFIG_REQUIRED", message: "LOGINOM_CONFIG_REQUIRED" },
        ])
        expect(test.seen).toEqual([])
        test.script.generation = 2

        // An installation without the template: refused before the snapshot too.
        const link = path.join(test.resources, "dashboard", "template")
        yield* Effect.promise(() => fs.rm(link))
        expect(yield* prepare(waiting.id)).toEqual([
          200,
          { code: "DASHBOARD_RESOURCES_MISSING", message: "DASHBOARD_RESOURCES_MISSING" },
        ])
        expect(test.seen).toEqual([])
        yield* Effect.promise(() => fs.symlink(template, link, "dir"))

        // The snapshot is good once.
        const [, prepared] = yield* prepare(waiting.id)
        expect(prepared).toMatchObject({ action: "create", fresh: true })
        expect(yield* prepare(waiting.id)).toEqual([
          200,
          { code: "DASHBOARD_SNAPSHOT_UNAVAILABLE", message: "DASHBOARD_SNAPSHOT_UNAVAILABLE" },
        ])

        // A Host reply that is not a publication; nothing is created.
        test.script.read = () => ({ version: { name: "20261124T120000Z.json" } })
        const malformed = test.offer(true)
        expect(yield* prepare(malformed.id)).toEqual([
          200,
          { code: "LOGINOM_REPLY_INVALID", message: "LOGINOM_REPLY_INVALID" },
        ])

        // The Host refuses a generation that is gone; nothing is created without a local draft to fall back to.
        test.script.read = () => {
          throw hostException("LOGINOM_GENERATION_UNAVAILABLE")
        }
        const replaced = test.offer(true)
        const before = yield* Effect.promise(() => fs.readdir(Dashboard.root()))
        expect(yield* prepare(replaced.id)).toEqual([
          200,
          {
            code: "LOGINOM_GENERATION_UNAVAILABLE",
            message:
              'LOGINOM_GENERATION_UNAVAILABLE: {"reason":"Подключение изменилось. Откройте dashboard заново из Studio."}',
          },
        ])
        expect(yield* Effect.promise(() => fs.readdir(Dashboard.root()))).toEqual(before)

        // A folder whose binding is gone belongs to nobody.
        yield* Effect.promise(() => fs.rm(path.join(path.dirname(prepared.directory), "control", "binding.json")))
        const conflict = test.offer(false)
        conflict.binding = waiting.binding
        expect(yield* prepare(conflict.id)).toEqual([
          200,
          { code: "DASHBOARD_BINDING_CONFLICT", message: "DASHBOARD_BINDING_CONFLICT" },
        ])

        // A file system failure reaches the client as a code, without its path.
        yield* Effect.promise(async () => {
          await fs.rm(Dashboard.root(), { recursive: true })
          await fs.writeFile(Dashboard.root(), "not a directory")
        })
        const blocked = test.offer(false)
        expect(yield* prepare(blocked.id)).toEqual([
          200,
          { code: "LOGINOM_HOST_REQUEST_FAILED", message: "LOGINOM_HOST_REQUEST_FAILED" },
        ])

        // Without the Host nothing is asked.
        yield* Effect.promise(() => ServiceHost.close())
        test.script.log.length = 0
        const late = test.offer(false)
        expect(yield* prepare(late.id)).toEqual([
          200,
          { code: "LOGINOM_HOST_NOT_READY", message: "LOGINOM_HOST_NOT_READY" },
        ])
        expect(test.script.log).toEqual([])
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )

  it.live(
    "a cancelled call stops waiting for the Host's readiness: the publication is never read and no folder is left",
    () =>
      Effect.gen(function* () {
        const test = yield* boot
        const hold = Promise.withResolvers<void>()
        test.script.hold = hold.promise
        const cancelled = test.offer(true)
        const controller = new AbortController()
        const pending = test.send("prepare", { id: cancelled.id, defer: false }, controller.signal).then(
          (response) => response.status,
          () => "aborted",
        )
        yield* Effect.promise(async () => {
          const deadline = Date.now() + 10_000
          while (!methods(test.script.log).includes("connection.ready") && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 10))
        })
        expect(methods(test.script.log)).toEqual(["connection.status", "connection.ready"])
        controller.abort()
        yield* Effect.promise(() => pending)
        hold.resolve()
        // Preparations run one after another, so the next one answers after the cancelled one ended.
        const next = test.offer(false)
        expect((yield* test.call("prepare", { id: next.id, defer: true })).body.output).toMatchObject({ fresh: true })
        expect(methods(test.script.log)).toEqual(["connection.status", "connection.ready", "connection.status"])
        expect((yield* test.call("find", { id: cancelled.id })).body.output).toEqual({ found: false })
      }).pipe(Effect.scoped, Effect.provideService(Flag.Overrides, undefined)),
    timeout,
  )
})
