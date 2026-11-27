import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { openDatabase } from "./database"
import { importLegacyStores } from "./legacy"
import { createStateStore } from "./state"
import { readWindowSnapshot } from "./window-snapshot"

const now = new Date("2026-07-01T00:00:00.000Z")

const day = 24 * 60 * 60 * 1000

const roots: string[] = []

beforeEach(() => setSystemTime(now))

afterEach(() => {
  setSystemTime()

  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "opencode-legacy-store-"))
  roots.push(root)

  return root
}

function writeStore(root: string, name: string, value: string, modified = now) {
  writeFileSync(path.join(root, name), value)
  utimesSync(path.join(root, name), modified, modified)
}

const listing = (root: string) => readdirSync(root).sort()

const rows = (db: ReturnType<typeof openDatabase>["db"]) =>
  db.all<{ name: string; key: string; value: string }>(sql`SELECT name, key, value FROM state ORDER BY name, key`)

const run = (db: ReturnType<typeof openDatabase>["db"], root: string) =>
  Effect.runPromise(
    importLegacyStores(db, root).pipe(Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer))),
  )

describe("legacy store import", () => {
  test("copies native namespaces into state and keeps the source files", async () => {
    const root = tempRoot()
    const database = openDatabase(":memory:")
    writeStore(root, "opencode.global.dat", JSON.stringify({ model: "m", layout: { sidebar: 1 } }))
    writeStore(root, "opencode.window.w1.dat", JSON.stringify({ tabs: "[]" }))
    writeStore(root, "default.dat", JSON.stringify({ "settings.v3": "{}" }))
    writeStore(root, "loginom-ai-agent.settings", JSON.stringify({ keep: true }))
    writeStore(root, "unrelated.txt", "x")

    const result = await run(database.db, root)

    expect(result.imported).toBe(4)
    expect(rows(database.db)).toEqual([
      { name: "default.dat", key: "settings.v3", value: "{}" },
      { name: "opencode.global.dat", key: "layout", value: '{"sidebar":1}' },
      { name: "opencode.global.dat", key: "model", value: "m" },
      { name: "opencode.window.w1.dat", key: "tabs", value: "[]" },
    ])
    expect(listing(root)).toEqual([
      "default.dat",
      "loginom-ai-agent.settings",
      "opencode.global.dat",
      "opencode.window.w1.dat",
      "unrelated.txt",
    ])
  })

  test("restores 0.4 window tabs in the current namespace and imports the profile once", async () => {
    const root = tempRoot()
    const file = path.join(root, "drafts.sqlite")
    const tabs = JSON.stringify([{ type: "session", server: "sidecar", sessionId: "ses_saved" }])
    const recent = JSON.stringify({ key: "sidecar\n/server/c2lkZWNhcg/session/ses_saved" })
    const windowFile = "loginom-ai-agent.window.w1.dat"
    const windowSource = JSON.stringify({ tabs, "tabs.recent": recent }, null, "\t")
    writeStore(root, windowFile, windowSource)
    writeStore(root, "loginom-ai-agent.global.dat", JSON.stringify({ language: '{"locale":"ru"}' }))
    writeStore(root, "loginom-ai-agent.workspace.project.hash.dat", JSON.stringify({ "workspace:terminal": "{}" }))
    writeStore(root, "loginom-ai-agent.draft.draft-id.hash.dat", JSON.stringify({ "draft:prompt": '{"prompt":[]}' }))
    const database = openDatabase(file)
    const windowName = "opencode.window.w1.dat"
    const storage = createStateStore(database.db)

    try {
      expect(readWindowSnapshot(root, [windowName]).storage).toEqual({})
      expect((await run(database.db, root)).imported).toBe(5)
      expect(readWindowSnapshot(root, [windowName]).storage).toEqual({
        [windowName]: { items: { tabs, "tabs.recent": recent }, revision: 0 },
      })
      expect(storage.get("opencode.global.dat", "language")).toBe('{"locale":"ru"}')
      expect(storage.get("opencode.workspace.project.hash.dat", "workspace:terminal")).toBe("{}")
      expect(storage.get("opencode.draft.draft-id.hash.dat", "draft:prompt")).toBe('{"prompt":[]}')
      expect(readFileSync(path.join(root, windowFile), "utf8")).toBe(windowSource)

      storage.clear(windowName)
    } finally {
      storage.close()
      database.close()
    }

    const restarted = openDatabase(file)

    try {
      expect((await run(restarted.db, root)).imported).toBe(0)
      expect(readWindowSnapshot(root, [windowName]).storage).toEqual({
        [windowName]: { items: {}, revision: 0 },
      })
      expect(readFileSync(path.join(root, windowFile), "utf8")).toBe(windowSource)
    } finally {
      restarted.close()
    }
  })

  test("merges both file sets with SQLite first and native files second", async () => {
    const root = tempRoot()
    const database = openDatabase(":memory:")
    database.db.run(sql`INSERT INTO state VALUES ('opencode.global.dat', 'model', 'new', 0)`)
    writeStore(root, "opencode.global.dat", JSON.stringify({ model: "native", language: "en" }))
    writeStore(root, "loginom-ai-agent.global.dat", JSON.stringify({ model: "0.4", language: "ru", layout: "{}" }))

    await run(database.db, root)

    expect(rows(database.db)).toEqual([
      { name: "opencode.global.dat", key: "language", value: "en" },
      { name: "opencode.global.dat", key: "layout", value: "{}" },
      { name: "opencode.global.dat", key: "model", value: "new" },
    ])
    expect(listing(root)).toEqual(["loginom-ai-agent.global.dat", "opencode.global.dat"])
  })

  test("leaves unreadable files in place", async () => {
    const root = tempRoot()
    const database = openDatabase(":memory:")
    writeStore(root, "loginom-ai-agent.global.dat", "{not json")
    writeStore(root, "loginom-ai-agent.workspace.x.dat", JSON.stringify({ terminal: "{}" }))

    const result = await run(database.db, root)

    expect(result.imported).toBe(1)
    expect(rows(database.db)).toEqual([{ name: "opencode.workspace.x.dat", key: "terminal", value: "{}" }])
    expect(readFileSync(path.join(root, "loginom-ai-agent.global.dat"), "utf8")).toBe("{not json")
  })

  test("applies draft retention: skips empty, stale, and excess draft files", async () => {
    const root = tempRoot()
    const database = openDatabase(":memory:")
    writeStore(root, "loginom-ai-agent.draft.empty.dat", "{}")
    writeStore(
      root,
      "loginom-ai-agent.draft.stale.dat",
      JSON.stringify({ "draft:prompt": "old" }),
      new Date(now.getTime() - 31 * day),
    )
    Array.from({ length: 102 }).forEach((_, index) =>
      writeStore(
        root,
        `loginom-ai-agent.draft.${index}.dat`,
        JSON.stringify({ "draft:prompt": `${index}` }),
        new Date(now.getTime() - index * 1_000),
      ),
    )

    const result = await run(database.db, root)

    expect(result.imported).toBe(100)
    const names = rows(database.db).map((row) => row.name)
    expect(names).toContain("opencode.draft.0.dat")
    expect(names).toContain("opencode.draft.99.dat")
    expect(names).not.toContain("opencode.draft.100.dat")
    expect(names).not.toContain("opencode.draft.101.dat")
    expect(names).not.toContain("opencode.draft.stale.dat")
    expect(names).not.toContain("opencode.draft.empty.dat")
    expect(listing(root)).toHaveLength(104)
  })
})
