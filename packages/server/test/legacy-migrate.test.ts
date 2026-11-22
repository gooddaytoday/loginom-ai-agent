import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { Cause, Effect, Exit } from "effect"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { tempGlobalLayer } from "../../core/test/fixture/global"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { LegacyMigrate } from "../src/legacy-migrate"
import { legacyDirectories, restoreLegacy } from "./fixture/legacy/restore"

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
    if (Exit.isFailure(exit) || !("summary" in exit.value)) return
    expect(exit.value.status).toBe("migrated")
    expect(exit.value.summary).toMatchObject({
      rows: { sessions: 4, messages: 11, parts: 29 },
      migrated: { sessions: 4 },
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
    expect(expectPartsMigrated(backup, source)).toBe(29)

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
    expect(rows(target, "SELECT COUNT(*) AS n FROM session_v2")).toEqual([{ n: 4 }])
    expect(expectPartsMigrated(source, target)).toBe(29)
  })

  test("gives the sessions of a directory without git that directory's project, as OpenCode 2 does", async () => {
    // 0.4 kept them under global; OpenCode 2 lists the sessions of a directory by its own project.
    await using dir = await tmpdir("loginom-migrate-")
    const source = path.join(dir.path, "legacy.db")
    const target = path.join(dir.path, "next.db")
    await restoreLegacy("0.4", source, dir.path)
    const directories = legacyDirectories(dir.path)

    const exit = await migrate({ source, target, backup: path.join(dir.path, "unused.db") })

    expect(failure(exit)).toBe("the migration succeeded")
    const owners = rows<{ directory: string; project_id: string; worktree: string; vcs: string | null }>(
      target,
      "SELECT DISTINCT s.directory, s.project_id, p.worktree, p.vcs FROM session_v2 s JOIN project p ON p.id = s.project_id ORDER BY s.directory",
    )
    expect(owners.map((owner) => ({ ...owner, project_id: owner.project_id === "global" ? "global" : "own" }))).toEqual(
      [
        { directory: directories.project, project_id: "own", worktree: directories.project, vcs: null },
        { directory: directories.repo, project_id: "own", worktree: directories.repo, vcs: "git" },
      ],
    )
    // The repository keeps the project 0.4 gave it.
    expect(owners[1].project_id).toBe(rows<{ id: string }>(source, "SELECT id FROM project WHERE vcs = 'git'")[0].id)
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

    expect(Exit.isSuccess(same) && "summary" in same.value && same.value.summary).toMatchObject({
      migrated: { sessions: 0, messages: 0 },
      present: 4,
    })
    expect(Exit.isSuccess(other) && "summary" in other.value && other.value.summary).toMatchObject({
      migrated: { sessions: 4 },
      present: 0,
    })
    expect(rows(target, "SELECT COUNT(*) AS n FROM session_v2")).toEqual([{ n: 8 }])
    expect(expectPartsMigrated(older, target)).toBe(29)
  })

  test("two migrations of one database at once run one after the other", async () => {
    // Two server starts, or a start and `migrate`, can reach the same 0.4 database together.
    await using dir = await tmpdir("loginom-migrate-")
    const source = path.join(dir.path, "loginom-ai-agent.db")
    const backup = path.join(dir.path, "loginom-ai-agent.v1-backup.db")
    await restoreLegacy("0.4", source)
    const original = await hash(source)

    const exits = await Promise.all([
      migrate({ source, target: source, backup }),
      migrate({ source, target: source, backup }),
    ])

    expect(exits.map((exit) => (Exit.isSuccess(exit) ? exit.value.status : failure(exit))).sort()).toEqual([
      "already-migrated",
      "migrated",
    ])
    expect(await hash(backup)).toBe(original)
    expect(rows(source, "SELECT COUNT(*) AS n FROM session_v2")).toEqual([{ n: 4 }])
  })

  test("an OpenCode 2 database at its own path has nothing to migrate", async () => {
    // A profile without 0.4 data: once the server has created the database, later runs must still succeed.
    await using dir = await tmpdir("loginom-migrate-")
    const legacy = path.join(dir.path, "legacy.db")
    const target = path.join(dir.path, "loginom-ai-agent.db")
    const backup = path.join(dir.path, "loginom-ai-agent.v1-backup.db")
    await restoreLegacy("0.4", legacy)
    expect(failure(await migrate({ source: legacy, target, backup }))).toBe("the migration succeeded")
    const current = await hash(target)

    const exit = await migrate({ source: target, target, backup })

    expect(Exit.isSuccess(exit) && exit.value.status).toBe("current")
    expect(await hash(target)).toBe(current)
    expect(existsSync(backup)).toBe(false)
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
    // OpenCode 2 accepts only session IDs that start with "ses"; this one sorts after the good sessions.
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
