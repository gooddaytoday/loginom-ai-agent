import { expect } from "bun:test"
import { ClientError, OpenCode } from "@opencode/client/promise"
import { Session } from "@opencode/schema/session"
import { mkdir, rmdir, stat } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { failedSessionCreate } from "../../app/src/new-session/session-create-outcome"
import { serveRoutes } from "./fixture/routes"

it.live("keeps registered hidden workspaces out of the public project list", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir("project-visibility-")))
    const named = path.join(tmp.path, "named")
    const loose = path.join(tmp.path, "conversation")
    yield* Effect.promise(() => Promise.all([mkdir(named), mkdir(loose)]))
    const server = yield* serveRoutes({
      database: { path: ":memory:" },
      config: { directory: path.join(tmp.path, "config") },
      fs: { filewatcher: false },
      models: { fetch: false },
    })
    const stable = new URL("/api/project", "http://opencode.local")
    const url = new URL("/api/experimental/project", stable)
    const request = (payload: { directory: string; name?: string; experimental?: { hidden: boolean } }) =>
      Effect.promise(() =>
        server.fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      )
    const project = yield* request({ directory: named, name: "Отчёт: Q1/Q2" })
    expect(project.status).toBe(200)
    const namedInfo = yield* Effect.promise(() => project.json())
    expect(namedInfo).toMatchObject({ name: "Отчёт: Q1/Q2", canonical: named })
    const hidden = yield* request({ directory: loose, experimental: { hidden: true } })
    expect(hidden.status).toBe(200)
    const hiddenInfo = yield* Effect.promise(() => hidden.json())
    expect(hiddenInfo).toMatchObject({ experimental: { hidden: true }, canonical: loose })
    expect(hiddenInfo).not.toHaveProperty("hidden")
    const location = new URL("/api/location", url)
    location.searchParams.set("location[directory]", loose)
    expect((yield* Effect.promise(() => server.fetch(location))).status).toBe(200)
    stable.searchParams.set("includeHidden", "true")
    const list = yield* Effect.promise(() => server.fetch(stable).then((response) => response.json()))
    expect(list).toContainEqual(expect.objectContaining({ canonical: named }))
    expect(list).not.toContainEqual(expect.objectContaining({ canonical: loose }))
    expect((yield* request({ directory: path.join(tmp.path, "missing"), experimental: { hidden: true } })).status).toBe(
      400,
    )
    expect((yield* Effect.promise(() => server.fetch(stable, { method: "POST" }))).status).not.toBe(200)
    const expanded = yield* Effect.promise(() => server.fetch(url).then((response) => response.json()))
    expect(expanded).toContainEqual(expect.objectContaining({ canonical: loose, experimental: { hidden: true } }))

    const forget = new URL(`${url.pathname}/${hiddenInfo.id}`, url)
    expect((yield* Effect.promise(() => server.fetch(forget, { method: "DELETE" }))).status).toBe(204)
    const sameProject = expect.objectContaining({ id: hiddenInfo.id, experimental: { hidden: true } })
    expect(yield* Effect.promise(() => server.fetch(url).then((response) => response.json()))).toContainEqual(sameProject)
    yield* Effect.promise(() => rmdir(loose))
    expect((yield* Effect.promise(() => server.fetch(forget, { method: "DELETE" }))).status).toBe(204)
    expect(yield* Effect.promise(() => server.fetch(url).then((response) => response.json()))).not.toContainEqual(sameProject)

    const cancel = new URL(`${url.pathname}/${namedInfo.id}?includeVisible=true`, url)
    expect((yield* Effect.promise(() => server.fetch(cancel, { method: "DELETE" }))).status).toBe(204)
    expect(yield* Effect.promise(() => server.fetch(stable).then((response) => response.json()))).toContainEqual(
      expect.objectContaining({ id: namedInfo.id }),
    )
    yield* Effect.promise(() => rmdir(named))
    expect((yield* Effect.promise(() => server.fetch(cancel, { method: "DELETE" }))).status).toBe(204)
    expect(yield* Effect.promise(() => server.fetch(stable).then((response) => response.json()))).not.toContainEqual(
      expect.objectContaining({ id: namedInfo.id }),
    )
  }),
)

it.live("recovers the persisted session by ID when its HTTP create response is lost", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir("project-create-response-")))
    const directory = path.join(tmp.path, "conversation")
    yield* Effect.promise(() => mkdir(directory))
    const server = yield* serveRoutes({
      database: { path: ":memory:" },
      config: { directory: path.join(tmp.path, "config") },
      fs: { filewatcher: false },
      models: { fetch: false },
    })

    const client = OpenCode.make({
      baseUrl: "http://opencode.local",
      fetch: Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          const request = new Request(input, init)
          const response = await server.handler(request)
          if (request.method === "POST" && new URL(request.url).pathname === "/api/session") {
            expect(response.status).toBe(200)
            await response.body?.cancel()
            throw new Error("Connection lost after the handler committed")
          }
          return response
        },
        { preconnect: fetch.preconnect },
      ),
    })

    yield* Effect.promise(async () => {
      const project = await client.experimental.project.register({ directory, experimental: { hidden: true } })
      const id = Session.ID.create()
      const failure = await client.session.create({ id, location: { directory } }).then(
        () => undefined,
        (error) => {
          if (!(error instanceof ClientError)) throw error
          return error
        },
      )
      expect(failure).toBeInstanceOf(ClientError)
      expect(failure).toHaveProperty("reason", "Transport")

      const outcome = await failedSessionCreate(client.session, id, failure)
      expect(outcome).toMatchObject({ type: "created", session: { id, projectID: project.id, location: { directory } } })
      expect(await failedSessionCreate(client.session, Session.ID.create(), failure)).toEqual({ type: "unknown" })

      await client.experimental.project.forget({ projectID: project.id })
      expect(await client.experimental.project.list()).toContainEqual(expect.objectContaining({ id: project.id }))
      expect((await stat(directory)).isDirectory()).toBe(true)
    })
  }),
)
