import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { Cause, Effect, Exit } from "effect"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { tempGlobalLayer } from "../../core/test/fixture/global"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { LegacyMigrate } from "../src/legacy-migrate"
import { restoreLegacy } from "./fixture/legacy/restore"

const migrate = (input: LegacyMigrate.Input) =>
  Effect.runPromiseExit(LegacyMigrate.run(input).pipe(Effect.provide(tempGlobalLayer)))

const hash = async (file: string) =>
  new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex")

const rows = <T>(file: string, query: string) => {
  const db = new Database(file, { readonly: true })
  const result = db.query(query).all() as T[]
  db.close()
  return result
}

const failure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "the migration succeeded"

// Every part that carries content must reappear in the migrated session: text (also synthetic text), tool calls, and
// attachments, either as a file or as the marker the transform leaves for a file:// attachment it cannot read.
function expectPartsMigrated(legacy: string, next: string) {
  const migrated = Map.groupBy(
    rows<{ session_id: string; data: string }>(next, "SELECT session_id, data FROM session_message"),
    (row) => row.session_id,
  )
  const parts = rows<{ session_id: string; data: string }>(legacy, "SELECT session_id, data FROM part")
  const missing = parts.flatMap((row) => {
    const part = JSON.parse(row.data)
    const text = (migrated.get(row.session_id) ?? []).map((message) => message.data).join("\n")
    const expected =
      part.type === "text"
        ? [JSON.stringify(part.text).slice(1, -1)]
        : part.type === "tool"
          ? [`"id":"${part.callID}","name":"${part.tool}"`]
          : part.type === "file"
            ? [
                part.url.startsWith("data:")
                  ? `"data":"${part.url.slice(part.url.indexOf(",") + 1)}"`
                  : `[Attachment unavailable after migration: ${part.filename} (${part.mime})]`,
              ]
            : []
    return expected.filter((value) => !text.includes(value)).map((value) => `${row.session_id} ${part.type}: ${value}`)
  })
  expect(missing).toEqual([])
  return parts.length
}

describe("LegacyMigrate", () => {
  test("moves a 0.4 profile into the database at its own path, keeps it as the backup, and a rerun changes nothing", async () => {
    await using dir = await tmpdir("loginom-migrate-")
    const source = path.join(dir.path, "loginom-ai-agent.db")
    const backup = path.join(dir.path, "loginom-ai-agent.v1-backup.db")
    await restoreLegacy("0.4", source)
    const original = await hash(source)

    const exit = await migrate({ source, target: source, backup })

    expect(failure(exit)).toBe("the migration succeeded")
    if (Exit.isFailure(exit) || exit.value.status === "missing") return
    expect(exit.value.status).toBe("migrated")
    expect(exit.value.summary).toMatchObject({
      rows: { sessions: 3, messages: 9, parts: 25 },
      migrated: { sessions: 3 },
      present: 0,
      warnings: [],
      backup,
    })
    expect(await hash(backup)).toBe(original)
    expect((await fs.readdir(dir.path)).sort()).toEqual(["loginom-ai-agent.db", "loginom-ai-agent.v1-backup.db"])
    expect(rows(source, "SELECT id FROM session_v2 ORDER BY id")).toEqual(
      rows(backup, "SELECT id FROM session ORDER BY id"),
    )
    // Every v1 message keeps its own row; the transform adds synthetic and system ones beside them.
    expect(rows(source, "SELECT id FROM session_message WHERE type IN ('user', 'assistant') ORDER BY id")).toEqual(
      rows(backup, "SELECT id FROM message ORDER BY id"),
    )
    expect(expectPartsMigrated(backup, source)).toBe(25)

    const migrated = await hash(source)
    const again = await migrate({ source, target: source, backup })

    expect(Exit.isSuccess(again) && again.value.status).toBe("already-migrated")
    expect(await hash(source)).toBe(migrated)
    expect(await hash(backup)).toBe(original)
  })

  test("copies a 0.3.9 profile into a separate database and leaves the original untouched", async () => {
    await using dir = await tmpdir("loginom-migrate-")
    const source = path.join(dir.path, "loginom-ai-agent.db")
    const target = path.join(dir.path, "loginom-ai-agent-local.db")
    await restoreLegacy("0.3.9", source)
    const original = await hash(source)

    const exit = await migrate({ source, target, backup: path.join(dir.path, "unused.db") })

    expect(failure(exit)).toBe("the migration succeeded")
    expect(Exit.isSuccess(exit) && exit.value.status).toBe("migrated")
    expect(await hash(source)).toBe(original)
    expect((await fs.readdir(dir.path)).sort()).toEqual(["loginom-ai-agent-local.db", "loginom-ai-agent.db"])
    expect(rows(target, "SELECT COUNT(*) AS n FROM session_v2")).toEqual([{ n: 3 }])
    expect(expectPartsMigrated(source, target)).toBe(25)
  })

  test("adds another profile to an existing database in place and skips sessions it already holds", async () => {
    await using dir = await tmpdir("loginom-migrate-")
    const target = path.join(dir.path, "loginom-ai-agent-local.db")
    const desktop = path.join(dir.path, "desktop.db")
    const copy = path.join(dir.path, "copy.db")
    const older = path.join(dir.path, "older.db")
    await restoreLegacy("0.4", desktop)
    await fs.copyFile(desktop, copy)
    await restoreLegacy("0.3.9", older)
    const backup = path.join(dir.path, "unused.db")
    expect(failure(await migrate({ source: desktop, target, backup }))).toBe("the migration succeeded")

    const same = await migrate({ source: copy, target, backup })
    const other = await migrate({ source: older, target, backup })

    expect(Exit.isSuccess(same) && same.value.status !== "missing" && same.value.summary).toMatchObject({
      migrated: { sessions: 0, messages: 0 },
      present: 3,
    })
    expect(Exit.isSuccess(other) && other.value.status !== "missing" && other.value.summary).toMatchObject({
      migrated: { sessions: 3 },
      present: 0,
    })
    expect(rows(target, "SELECT COUNT(*) AS n FROM session_v2")).toEqual([{ n: 6 }])
    expect(expectPartsMigrated(older, target)).toBe(25)
  })

  test("a damaged profile stops the migration and changes nothing", async () => {
    await using dir = await tmpdir("loginom-migrate-")
    const source = path.join(dir.path, "loginom-ai-agent.db")
    await restoreLegacy("0.4", source)
    await fs.truncate(source, (await fs.stat(source)).size / 2)
    const original = await hash(source)

    const exit = await migrate({ source, target: source, backup: path.join(dir.path, "backup.db") })

    expect(failure(exit)).toContain(`cannot read ${source}: database disk image is malformed`)
    expect(await hash(source)).toBe(original)
    expect(await fs.readdir(dir.path)).toEqual(["loginom-ai-agent.db"])
  })

  test("a session that cannot be copied rolls the whole migration back", async () => {
    await using dir = await tmpdir("loginom-migrate-")
    const source = path.join(dir.path, "loginom-ai-agent.db")
    const target = path.join(dir.path, "loginom-ai-agent-local.db")
    await restoreLegacy("0.4", source)
    // OpenCode 2 accepts only session IDs that start with "ses"; this one sorts after the three good sessions.
    const db = new Database(source)
    db.run(
      "INSERT INTO session SELECT 'zzz', project_id, workspace_id, parent_id, slug, directory, path, title, version, share_url, summary_additions, summary_deletions, summary_files, summary_diffs, metadata, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, revert, permission, agent, model, time_created, time_updated, time_compacting, time_archived FROM session LIMIT 1",
    )
    db.close()
    const original = await hash(source)

    const exit = await migrate({ source, target, backup: path.join(dir.path, "unused.db") })

    expect(failure(exit)).toContain("cannot copy session zzz")
    expect(await hash(source)).toBe(original)
    expect(existsSync(target)).toBe(false)
    expect(await fs.readdir(dir.path)).toEqual(["loginom-ai-agent.db"])
  })
})
