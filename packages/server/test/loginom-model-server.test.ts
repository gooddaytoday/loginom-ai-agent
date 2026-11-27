import { expect } from "bun:test"
import { join } from "node:path"
import { OpenCode } from "@opencode/client/promise"
import { Effect, Schedule } from "effect"
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
        fetch(request) {
          const path = new URL(request.url).pathname
          requests.push({ path, authorization: request.headers.get("authorization") })
          if (path === "/redirect/models") return Response.redirect(new URL("/v1/models", request.url))
          if (path === "/v1/models") return Response.json({ data: ids.map((id) => ({ id })) })
          if (path === "/v1/chat/completions") {
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
  "discovers and configures two private model servers while keeping the key out of config and RPC replies",
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
      const first = yield* fixture(["alpha", "beta", "alpha", fixtureKey, "{env:HOME}", "__proto__"])
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

      const invalid = yield* Effect.promise(() => rpc.discover({ address: "file:///tmp/models" }, options))
      expect(invalid).toEqual({ ok: false, issue: "modelServerAddressInvalid" })
      expect(first.requests).toEqual([])
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
      const firstID = yield* add(first.address, ["alpha", "beta"], fixtureKey)
      const secondID = yield* add(second.address, ["alpha"])
      expect(firstID).not.toBe(secondID)
      expect(first.requests.at(-1)).toEqual({ path: "/v1/models", authorization: `Bearer ${fixtureKey}` })
      expect(second.requests.at(-1)).toEqual({ path: "/v1/models", authorization: null })

      const text = yield* Effect.promise(() => Bun.file(config).text())
      expect(text).toContain("// Keep this comment")
      expect(text).not.toContain(fixtureKey)
      expect(text).toContain('"shell": "bash"')
      expect(text).toMatch(/"existing":\s*\{\s*"name": "Existing"\s*\}/u)
      for (const [id, address] of [
        [firstID, first.address],
        [secondID, second.address],
      ]) {
        expect(text).toContain(`"${id}": {`)
        expect(text).toContain(`"baseURL": "${address}"`)
      }

      const catalog = yield* Effect.promise(() => client.model.list({ location })).pipe(
        Effect.map((result) => result.data.filter((model) => [firstID, secondID].includes(model.providerID))),
        Effect.repeat({ until: (models) => models.length === 3, times: 50, schedule: Schedule.spaced(40) }),
      )
      expect(catalog.map((model) => `${model.providerID}/${model.id}`).sort()).toEqual(
        [`${firstID}/alpha`, `${firstID}/beta`, `${secondID}/alpha`].sort(),
      )
      for (const [id, target, authorization] of [
        [firstID, first, `Bearer ${fixtureKey}`],
        [secondID, second, null],
      ] as const) {
        expect(
          yield* Effect.promise(() =>
            client.experimental.generate.text({ model: { providerID: id, id: "alpha" }, prompt: "Fixture only" }),
          ),
        ).toEqual({ text: "Local fixture response" })
        expect(target.requests.at(-1)).toEqual({ path: "/v1/chat/completions", authorization })
      }
    }),
  20_000,
)
