import { expect } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
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
    const url = new URL("/api/project", "http://opencode.local")
    const request = (payload: { directory: string; name?: string; hidden?: boolean }) =>
      Effect.promise(() =>
        server.fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      )
    const project = yield* request({ directory: named, name: "Отчёт: Q1/Q2" })
    expect(project.status).toBe(200)
    expect(yield* Effect.promise(() => project.json())).toMatchObject({ name: "Отчёт: Q1/Q2", canonical: named })
    const hidden = yield* request({ directory: loose, hidden: true })
    expect(hidden.status).toBe(200)
    expect(yield* Effect.promise(() => hidden.json())).toMatchObject({ hidden: true, canonical: loose })
    const location = new URL("/api/location", url)
    location.searchParams.set("location[directory]", loose)
    expect((yield* Effect.promise(() => server.fetch(location))).status).toBe(200)
    const list = yield* Effect.promise(() => server.fetch(url).then((response) => response.json()))
    expect(list).toContainEqual(expect.objectContaining({ canonical: named }))
    expect(list).not.toContainEqual(expect.objectContaining({ canonical: loose }))
    expect((yield* request({ directory: path.join(tmp.path, "missing"), hidden: true })).status).toBe(400)
    url.searchParams.set("includeHidden", "true")
    const expanded = yield* Effect.promise(() => server.fetch(url).then((response) => response.json()))
    expect(expanded).toContainEqual(expect.objectContaining({ canonical: loose, hidden: true }))
  }),
)
