import { expect } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { OpenCode } from "@opencode/client/promise"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { FSUtil } from "@opencode/util/fs-util"
import { Deferred, Effect, Fiber, Layer, Schedule } from "effect"
import { ModelServerRpc } from "../../loginom-host/src/model-server-rpc"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { serveRoutes } from "./fixture/routes"

const fixture = (ids: readonly string[]) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const requests: { path: string; authorization: string | null }[] = []
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
          const path = new URL(request.url).pathname
          requests.push({ path, authorization: request.headers.get("authorization") })
          if (path === "/redirect/models" || path === "/redirect/chat/completions")
            return Response.redirect(new URL(`/v1${path.slice("/redirect".length)}`, request.url), 307)
          if (path === "/v1/models") return Response.json({ data: ids.map((id) => ({ id })) })
          if (path === "/v1/chat/completions") {
            const body = await request.json()
            const messages = JSON.stringify(body?.messages)
            if (body?.model !== ids[0] || !messages?.includes("Fixture only"))
              return new Response(null, { status: 400 })
            if (messages.includes("Fixture only: rejected")) {
              const key = request.headers.get("authorization")?.slice("Bearer ".length)
              const message = `Fixture rejected credential ${key}`
              return messages.includes("(plain)")
                ? new Response(message, { status: 401 })
                : Response.json({ error: { message } }, { status: 401 })
            }
            const chunk = (delta: object, finish_reason: "stop" | null) =>
              `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: ids[0], choices: [{ index: 0, delta, finish_reason }] })}\n\n`
            return new Response(
              `${chunk({ role: "assistant", content: "Local fixture response" }, null)}${chunk({}, "stop")}data: [DONE]\n\n`,
              {
                headers: { "content-type": "text/event-stream" },
              },
            )
          }
          return new Response(null, { status: 404 })
        },
      })
      return { server, requests, address: new URL("/v1", server.url).href }
    }),
    ({ server }) => Effect.promise(() => server.stop(true)),
  )

it.live(
  "discovers, reconnects and removes two model servers without exposing credentials or following redirects",
  () =>
    Effect.gen(function* () {
      const { path } = yield* tmpdirScoped("loginom-model-server-")
      const config = join(path, "loginom-ai-agent.jsonc")
      yield* Effect.promise(() =>
        Bun.write(
          config,
          '{\n  // Keep this comment\n  "shell": "bash",\n  "providers": { "existing": { "name": "Existing" } },\n}\n',
        ),
      )
      const fixtureKey = "fixture-secret-not-an-api-key"
      const first = yield* fixture(["alpha", "beta", "model", "alpha", "{env:HOME}", "__proto__"])
      const second = yield* fixture(["alpha"])
      const routes = yield* serveRoutes({
        database: { path: ":memory:" },
        config: { directory: path, project: false, claude: false },
        fs: { filewatcher: false },
        models: { fetch: false },
        fetch: (input, init) => {
          const request = new Request(input, init)
          if (![first.server.url.origin, second.server.url.origin].includes(new URL(request.url).origin))
            throw new Error("Tests must not call an external model")
          return fetch(request)
        },
      })
      yield* routes.pluginsLoaded(path)
      const client = OpenCode.make({
        baseUrl: "http://opencode.local",
        fetch: Object.assign(
          (input: RequestInfo | URL, init?: RequestInit) => routes.handler(new Request(input, init)),
          { preconnect: fetch.preconnect },
        ),
      })
      const rpc = client.rpc(ModelServerRpc)
      const location = { directory: path }
      const options = { location }

      const legacyID = "loginom-model-server-01234567-0123-0123-0123-0123456789ab"
      const removedLegacy = yield* Effect.promise(() =>
        rpc.remove({ providerID: legacyID }, options).then(() => "accepted", () => "rejected"),
      )
      expect(removedLegacy).toBe("rejected")

      const invalid = yield* Effect.promise(() => rpc.discover({ address: "file:///tmp/models" }, options))
      expect(invalid).toEqual({ ok: false, issue: "modelServerAddressInvalid" })
      expect(first.requests).toEqual([])
      for (const address of [
        "http://169.254.1.1",
        "http://169.254.169.254",
        "http://[::ffff:a9fe:a9fe]",
        "http://[fe80::1]",
        "http://[fd00:ec2::254]",
        "http://100.100.100.200",
      ]) {
        const blocked = { ok: false, issue: "modelServerAddressBlocked" } as const
        expect(yield* Effect.promise(() => rpc.discover({ address }, options))).toEqual(blocked)
        expect(yield* Effect.promise(() => rpc.save({ address, models: ["alpha"] }, options))).toEqual(blocked)
      }
      const redirect = yield* Effect.promise(() =>
        rpc.discover({ address: new URL("/redirect", first.server.url).href, key: fixtureKey }, options),
      )
      expect(redirect).toEqual({ ok: false, issue: "modelServerDiscoveryFailed" })
      expect(first.requests.map((request) => request.path)).toEqual(["/redirect/models"])

      const add = (address: string, ids: readonly string[], key?: string) =>
        Effect.gen(function* () {
          const found = yield* Effect.promise(() => rpc.discover({ address: `${address}/`, key }, options))
          expect(found).toEqual({ ok: true, value: ids })
          if (!found.ok) throw new Error("Local model discovery failed")
          const saved = yield* Effect.promise(() => rpc.save({ address, key, models: found.value }, options))
          expect(JSON.stringify(saved)).not.toContain(fixtureKey)
          if (!saved.ok) throw new Error(`Local model server save failed: ${saved.issue}`)
          return saved.value.providerID
        })
      const firstID = yield* add(first.address, ["alpha", "beta", "model"], fixtureKey)
      const secondID = yield* add(second.address, ["alpha"])
      expect(firstID).not.toBe(secondID)
      expect(first.requests.at(-1)).toEqual({ path: "/v1/models", authorization: `Bearer ${fixtureKey}` })
      expect(second.requests.at(-1)).toEqual({ path: "/v1/models", authorization: null })

      const nextKey = 'fixture-replacement-"key"'
      const reconnected = yield* Effect.promise(() =>
        rpc.save({ address: `${first.address}/`, key: nextKey, models: ["alpha", "beta", "model"] }, options),
      )
      expect(reconnected).toEqual({ ok: true, value: { providerID: firstID } })
      const credentials = () =>
        Effect.promise(() => client.credential.list()).pipe(
          Effect.map((result) => result.filter((entry) => entry.integrationID === firstID)),
        )
      expect(yield* credentials()).toHaveLength(1)

      const text = yield* Effect.promise(() => Bun.file(config).text())
      expect(text).toContain("// Keep this comment")
      expect(text).not.toContain(fixtureKey)
      expect(text).not.toContain(nextKey)
      expect(text).toContain('"shell": "bash"')
      expect(text).toMatch(/"existing":\s*\{\s*"name": "Existing"\s*\}/u)
      for (const [id, address] of [
        [firstID, first.address],
        [secondID, second.address],
      ]) {
        expect(text).toContain(`"${id}": {`)
        expect(text).toContain(`"baseURL": "${address}"`)
        expect(text).toContain(`"name": "${new URL(address).host}/v1"`)
      }

      const catalog = yield* Effect.promise(() => client.model.list({ location })).pipe(
        Effect.map((result) => result.data.filter((model) => [firstID, secondID].includes(model.providerID))),
        Effect.repeat({ until: (models) => models.length === 4, times: 50, schedule: Schedule.spaced(40) }),
      )
      expect(catalog.map((model) => `${model.providerID}/${model.id}`).sort()).toEqual(
        [`${firstID}/alpha`, `${firstID}/beta`, `${firstID}/model`, `${secondID}/alpha`].sort(),
      )
      for (const [id, target, authorization] of [
        [firstID, first, `Bearer ${nextKey}`],
        [secondID, second, null],
      ] as const) {
        expect(
          yield* Effect.promise(() =>
            client.experimental.generate.text({ model: { providerID: id, id: "alpha" }, prompt: "Fixture only" }),
          ),
        ).toEqual({ text: "Local fixture response" })
        expect(target.requests.at(-1)).toEqual({ path: "/v1/chat/completions", authorization })
      }

      for (const format of ["json", "plain"]) {
        const rejected = yield* Effect.promise(() =>
          routes.fetch("http://opencode.local/api/experimental/generate/text", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: { providerID: firstID, id: "alpha" },
              prompt: `Fixture only: rejected (${format})`,
            }),
          }),
        )
        expect(rejected.status).toBe(502)
        const error = yield* Effect.promise(() => rejected.text())
        expect(error).toContain("Fixture rejected credential [redacted]")
        expect(error).not.toContain("fixture-replacement-")
      }

      for (const key of ["a", "1"]) {
        expect(yield* Effect.promise(() => rpc.discover({ address: first.address, key }, options))).toEqual({
          ok: true,
          value: ["alpha", "beta", "model"],
        })
        expect(
          yield* Effect.promise(() =>
            rpc.save({ address: first.address, key, models: ["alpha", "beta", "model"] }, options),
          ),
        ).toEqual({ ok: true, value: { providerID: firstID } })
      }

      const redirectAddress = new URL("/redirect", first.server.url).href
      const savedRedirect = yield* Effect.promise(() =>
        rpc.save({ address: redirectAddress, models: ["alpha"] }, options),
      )
      if (!savedRedirect.ok) throw new Error(`Redirect fixture save failed: ${savedRedirect.issue}`)
      const redirectedModel = { providerID: savedRedirect.value.providerID, id: "alpha" }
      yield* Effect.promise(() => client.model.list({ location })).pipe(
        Effect.repeat({
          until: (models) => models.data.some((model) => model.providerID === redirectedModel.providerID),
          times: 50,
          schedule: Schedule.spaced(40),
        }),
      )
      const priorPaths = first.requests.map((entry) => entry.path)
      const generation = yield* Effect.tryPromise(() =>
        client.experimental.generate.text({ model: redirectedModel, prompt: "Fixture only" }),
      ).pipe(Effect.exit)
      expect(generation._tag).toBe("Failure")
      expect(first.requests.slice(priorPaths.length).map((entry) => entry.path)).toEqual(["/redirect/chat/completions"])

      const isGone = (id: string) =>
        Effect.promise(() => client.model.list({ location })).pipe(
          Effect.map((result) => !result.data.some((model) => model.providerID === id)),
          Effect.repeat({ until: (gone) => gone, times: 50, schedule: Schedule.spaced(40) }),
        )
      for (const providerID of [firstID, secondID]) {
        expect(yield* Effect.promise(() => rpc.remove({ providerID }, options))).toEqual({ ok: true, value: true })
        expect(yield* isGone(providerID)).toBe(true)
      }
      expect(yield* credentials()).toEqual([])
      const after = yield* Effect.promise(() => Bun.file(config).text())
      expect(after).not.toContain(firstID)
      expect(after).not.toContain(secondID)
      expect(after).toMatch(/"existing":\s*\{\s*"name": "Existing"\s*\}/u)
      expect(after).toContain("// Keep this comment")
    }),
  20_000,
)

it.live(
  "preserves a model server and a shell update written concurrently from different Locations",
  () =>
    Effect.gen(function* () {
      const { path } = yield* tmpdirScoped("loginom-model-server-concurrent-")
      const modelDirectory = join(path, "model-location")
      const shellDirectory = join(path, "shell-location")
      yield* Effect.promise(() => Promise.all([mkdir(modelDirectory), mkdir(shellDirectory)]))
      const config = join(path, "loginom-ai-agent.jsonc")
      yield* Effect.promise(() => Bun.write(config, '{\n  // keep this comment\n  "shell": "bash"\n}\n'))
      const shellWrite = yield* Deferred.make<void>()
      const releaseShell = yield* Deferred.make<void>()
      const delayedFilesystem = Layer.effect(
        FSUtil.Service,
        Effect.gen(function* () {
          const fs = yield* FSUtil.Service
          return FSUtil.Service.of({
            ...fs,
            writeWithDirs: (target, content, mode) => {
              const write = fs.writeWithDirs(target, content, mode)
              return target === config && typeof content === "string" && !content.includes('"providers"')
                ? Deferred.succeed(shellWrite, undefined).pipe(
                    Effect.andThen(Deferred.await(releaseShell)),
                    Effect.andThen(write),
                  )
                : write
            },
          })
        }),
      ).pipe(Layer.provide(LayerNode.compile(FSUtil.node)))
      const routes = yield* serveRoutes(
        {
          database: { path: ":memory:" },
          config: { directory: path, project: false, claude: false },
          fs: { filewatcher: false },
          models: { fetch: false },
        },
        [FSUtil.node.replace(delayedFilesystem)],
      )
      yield* routes.pluginsLoaded(modelDirectory)
      yield* routes.pluginsLoaded(shellDirectory)
      const client = OpenCode.make({
        baseUrl: "http://opencode.local",
        fetch: Object.assign(
          (input: RequestInfo | URL, init?: RequestInit) => routes.handler(new Request(input, init)),
          { preconnect: fetch.preconnect },
        ),
      })
      const endpoint = new URL("http://opencode.local/api/experimental/config")
      endpoint.searchParams.set("location[directory]", shellDirectory)
      const shell = yield* Effect.promise(() =>
        routes.fetch(endpoint, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ shell: "zsh" }),
        }),
      ).pipe(Effect.forkScoped)
      yield* Deferred.await(shellWrite)
      const provider = yield* Effect.promise(() =>
        client
          .rpc(ModelServerRpc)
          .save(
            { address: "http://127.0.0.1:41234/v1", models: ["alpha"] },
            { location: { directory: modelDirectory } },
          ),
      ).pipe(Effect.forkScoped({ startImmediately: true }))

      yield* Fiber.await(provider).pipe(Effect.timeoutOption("1 second"))
      yield* Deferred.succeed(releaseShell, undefined)
      const saved = yield* Fiber.join(provider)
      expect((yield* Fiber.join(shell)).status).toBe(204)
      if (!saved.ok) throw new Error(`Concurrent model server save failed: ${saved.issue}`)
      const text = yield* Effect.promise(() => Bun.file(config).text())
      expect(text).toContain('"shell": "zsh"')
      expect(text).toContain(`"${saved.value.providerID}"`)
      expect(text).toContain("// keep this comment")
    }),
  20_000,
)
