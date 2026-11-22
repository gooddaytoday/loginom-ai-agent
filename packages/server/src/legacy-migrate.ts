export * as LegacyMigrate from "./legacy-migrate"

// Loginom AI Agent: moves the sessions of a 0.3.9 or 0.4.x profile (OpenCode v1 schema) into an OpenCode 2 database.
// The v2 server cannot do it in place: the fork's own `migration` table sends the v2 schema migrations down the
// "replay the V1 squash" branch, which drops the v1 tables before `V1Migration` looks for them (spike S4). So the
// legacy file is only ever read here, with bun:sqlite, and never handed to `Database.layer`.
import { Cause, Effect, Fiber, Layer, Option } from "effect"
import { eq, sql } from "drizzle-orm"
import { existsSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import type { Database as SQLiteDatabase } from "bun:sqlite"
import { Database } from "@opencode/core/database/database"
import { storedAbsolutePath } from "@opencode/core/database/path"
import { V1Migration } from "@opencode/core/database/v1-migration"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { EventSequenceTable } from "@opencode/core/event/sql"
import { KVTable } from "@opencode/core/kv/sql"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionSchema } from "@opencode/core/session/schema"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import { ProjectID } from "@opencode/schema/project-id"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Flock } from "@opencode/util/flock"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"

export type Input = {
  /** The legacy database. It is only read; it stays where it is or, when it is the target itself, becomes `backup`. */
  readonly source: string
  readonly target: string
  readonly backup: string
}

export type Summary = {
  readonly source: string
  readonly target: string
  readonly backup?: string
  readonly schema?: string
  readonly rows: { readonly sessions: number; readonly messages: number; readonly parts: number }
  readonly migrated: { readonly sessions: number; readonly messages: number }
  readonly present: number
  readonly warnings: ReadonlyArray<V1Migration.Warning>
}

export type Result =
  | { readonly status: "migrated" | "already-migrated"; readonly summary: Summary }
  | { readonly status: "missing" }
  | { readonly status: "current" }

export class MigrateError extends Error {}

const SIDECARS = ["-wal", "-shm"]

/** Where the original goes when the new database takes its path. */
export function backupPath(source: string) {
  return path.join(path.dirname(source), `${path.basename(source, ".db")}.v1-backup.db`)
}

/**
 * Runs before the server opens its database: a 0.3.9/0.4 database at that path is migrated first, because the v2
 * schema migrations would drop its sessions and report success (spike S4), and a failed migration stops the start.
 * Anything else passes through to the server as before: a v2 or missing database, a file that does not read as a
 * database at all, the in-memory one, and the Node build, which cannot read the legacy file.
 */
export function guard(file: string) {
  if (file === ":memory:" || typeof Bun === "undefined" || !existsSync(file)) return Effect.void
  return Effect.gen(function* () {
    const sqlite = yield* Effect.promise(() => import("bun:sqlite"))
    if (!(yield* readOnly(sqlite.Database, file, isLegacy).pipe(Effect.orElseSucceed(() => false)))) return
    const result = yield* run({ source: file, target: file, backup: backupPath(file) })
    if (result.status === "migrated")
      yield* Effect.logWarning("migrated a Loginom AI Agent 0.3.9/0.4 database before opening it", result.summary)
  }).pipe(
    Effect.mapError(
      (error) =>
        new MigrateError(
          `The Loginom AI Agent 0.3.9/0.4 database ${file} could not be migrated, so the server does not start: ${error.message}`,
        ),
    ),
  )
}

export function run(input: Input): Effect.Effect<Result, MigrateError, Global.Service> {
  return Effect.gen(function* () {
    if (typeof Bun === "undefined") return yield* Effect.fail(new MigrateError("migrate runs only in the Bun build"))
    // Imported here, not statically: the Node build of the CLI bundles this module too.
    const sqlite = yield* Effect.promise(() => import("bun:sqlite"))
    if (input.target === ":memory:")
      return yield* Effect.fail(
        new MigrateError("the database is in memory (LOGINOM_AI_AGENT_DB); nothing to migrate into"),
      )
    const source = path.resolve(input.source)
    const target = path.resolve(input.target)
    const backup = path.resolve(input.backup)
    // One migration of a database at a time: two server starts, or a start and `migrate`, otherwise share the
    // temporary file and the second start may open a half-built database. The state is read again under the lock.
    yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: (signal) => Flock.acquire(target, { dir: path.dirname(target), signal }),
        catch: (error) => describe(`cannot lock ${target}`, error),
      }),
      (lease) => Effect.promise(() => lease.release()),
    )
    const existing = existsSync(target)
      ? yield* readOnly(sqlite.Database, target, (db) => ({ next: isNext(db), done: marker(db, source) }))
      : undefined
    if (existing?.done) return { status: "already-migrated" as const, summary: existing.done }
    // A profile that never had 0.4 data, once the server has created its database there.
    if (source === target && existing?.next) return { status: "current" as const }
    if (!existsSync(source)) {
      if (source === target && existsSync(backup))
        return yield* Effect.fail(
          new MigrateError(`${source} is missing and ${backup} exists: restore the backup and run migrate again`),
        )
      return { status: "missing" as const }
    }
    const inPlace = source === target
    if (inPlace && existsSync(backup))
      return yield* Effect.fail(new MigrateError(`backup ${backup} already exists; move it away and run again`))
    if (!inPlace && existing && !existing.next)
      return yield* Effect.fail(new MigrateError(`${target} is not an OpenCode 2 database`))
    // A new database is built beside the target and takes its place only once complete and verified.
    const fresh = !existing || inPlace
    const destination = fresh ? `${target}.migrating` : target
    if (fresh) removeDatabase(destination)
    const summary = yield* copy(sqlite.Database, destination, { source, target, ...(inPlace ? { backup } : {}) }).pipe(
      Effect.tapCause(() => Effect.sync(() => fresh && removeDatabase(destination))),
    )
    if (fresh) {
      if (inPlace) moveDatabase(source, backup)
      moveDatabase(destination, target)
    }
    return { status: "migrated" as const, summary }
  }).pipe(Effect.scoped, Effect.catchCause(failWith("migrate failed")))
}

function copy(
  Sqlite: typeof SQLiteDatabase,
  destination: string,
  location: Pick<Summary, "source" | "target" | "backup">,
) {
  return Effect.gen(function* () {
    const global = yield* Global.Service
    const legacy = yield* Effect.acquireRelease(
      attempt(`cannot read ${location.source}`, () => openReadOnly(Sqlite, location.source)),
      (opened) => Effect.sync(opened.close),
    )
    const read = yield* attempt(`cannot read ${location.source}`, () => readLegacy(legacy.db, location.source))
    const messages = legacy.db.query<V1Migration.SourceMessage, [string]>(
      "SELECT id, session_id, time_created, time_updated, data FROM message WHERE session_id = ?",
    )
    const parts = legacy.db.query<V1Migration.SourcePart, [string]>(
      "SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ?",
    )
    const known = new Map(read.projects.map((project) => [project.id, project.worktree]))
    const written = yield* Effect.gen(function* () {
      const db = (yield* Database.Service).db
      // As V1Migration.run: v1 kept the sessions of a directory without git under the global project, v2 gives that
      // directory its own project and lists its sessions there. Resolved before the transaction, without persisting.
      const owners = yield* resolveOwners(
        read.sessions.flatMap((session) =>
          (session.project_id === ProjectID.global || !known.has(session.project_id)) &&
          session.workspace_id === null &&
          storedAbsolutePath(session.directory)
            ? [session.directory]
            : [],
        ),
      )
      return yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const now = Date.now()
          yield* Effect.forEach(read.projects, (project) =>
            tx.run(sql`
              INSERT OR IGNORE INTO project (
                id, worktree, vcs, name, icon_url, icon_url_override, icon_color,
                time_created, time_updated, time_initialized, time_active, sandboxes, commands
              ) VALUES (
                ${project.id}, ${project.worktree}, ${project.vcs}, ${project.name}, ${project.icon_url},
                ${project.icon_url_override}, ${project.icon_color}, ${project.time_created}, ${project.time_updated},
                ${project.time_initialized}, ${project.time_updated}, ${project.sandboxes}, ${project.commands}
              )
            `),
          )
          // As V1Migration.run: sessions of unknown projects go to the global project, which must exist.
          yield* tx.run(sql`
            INSERT OR IGNORE INTO project (id, worktree, time_created, time_updated, time_active, sandboxes)
            VALUES (${ProjectID.global}, ${path.parse(destination).root}, ${now}, ${now}, ${now}, '[]')
          `)
          const results = yield* Effect.forEach(read.sessions, (session) =>
            Effect.gen(function* () {
              const id = SessionSchema.ID.make(session.id)
              if (yield* tx.select({ id: SessionTable.id }).from(SessionTable).where(eq(SessionTable.id, id)).get())
                return undefined
              const projectID = known.has(session.project_id) ? session.project_id : ProjectID.global
              // As V1Migration.run: a relative ACP directory becomes the project worktree.
              const directory =
                !session.directory || storedAbsolutePath(session.directory)
                  ? session.directory
                  : (storedAbsolutePath(known.get(projectID) ?? path.parse(destination).root) ?? "")
              const owner =
                projectID === ProjectID.global && session.workspace_id === null && directory === session.directory
                  ? owners.get(directory)
                  : undefined
              if (owner)
                yield* tx
                  .insert(ProjectTable)
                  .values({
                    id: owner.project.id,
                    worktree: owner.project.canonical,
                    vcs: owner.project.vcs?.type,
                    sandboxes: [],
                    time_active: session.time_updated,
                  })
                  .onConflictDoNothing()
                  .run()
              yield* tx.run(sql`
                INSERT INTO session_v2 (
                  id, project_id, workspace_id, parent_id, slug, directory, path, title, version, share_url,
                  summary_additions, summary_deletions, summary_files, summary_diffs, metadata, cost,
                  tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
                  revert, permission, agent, model, time_created, time_updated, time_compacting, time_archived
                ) VALUES (
                  ${session.id}, ${owner?.project.id ?? projectID}, ${session.workspace_id}, ${session.parent_id},
                  ${session.slug}, ${directory}, ${owner?.path ?? session.path}, ${session.title}, ${session.version}, ${session.share_url},
                  ${session.summary_additions}, ${session.summary_deletions}, ${session.summary_files},
                  ${session.summary_diffs}, ${session.metadata}, ${session.cost}, ${session.tokens_input},
                  ${session.tokens_output}, ${session.tokens_reasoning}, ${session.tokens_cache_read},
                  ${session.tokens_cache_write}, ${session.revert}, NULL, ${session.agent}, ${session.model},
                  ${session.time_created}, ${session.time_updated}, ${session.time_compacting}, ${session.time_archived}
                )
              `)
              const next = yield* tx.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
              if (!next) return yield* Effect.fail(new MigrateError("the session row was not written"))
              const transformed = V1Migration.transformSession({
                session: next,
                messages: messages.all(session.id),
                parts: parts.all(session.id),
              })
              yield* Effect.forEach(transformed.messages, (message) =>
                tx
                  .insert(SessionMessageTable)
                  .values({
                    id: SessionMessage.ID.make(message.id),
                    session_id: id,
                    type: message.type,
                    seq: message.seq,
                    time_created: message.time_created,
                    time_updated: message.time_updated,
                    data: sql`${JSON.stringify(message.data)}`,
                  })
                  .run(),
              )
              yield* tx
                .update(SessionTable)
                .set({ ...transformed.session, time_updated: next.time_updated })
                .where(eq(SessionTable.id, id))
                .run()
              yield* tx
                .insert(EventSequenceTable)
                .values({ aggregate_id: id, seq: transformed.watermark })
                .onConflictDoUpdate({
                  target: EventSequenceTable.aggregate_id,
                  set: { seq: transformed.watermark, owner_id: null },
                })
                .run()
              return { id: session.id, messages: transformed.messages.length, warnings: transformed.warnings }
            }).pipe(Effect.catchCause(failWith(`cannot copy session ${session.id}`))),
          )
          const copied = results.filter((item) => item !== undefined)
          const summary: Summary = {
            ...location,
            ...(read.schema ? { schema: read.schema } : {}),
            rows: read.rows,
            migrated: { sessions: copied.length, messages: copied.reduce((total, item) => total + item.messages, 0) },
            present: results.length - copied.length,
            warnings: copied.flatMap((item) => item.warnings),
          }
          // The marker commits with the rows: a rerun finds it and leaves both databases alone.
          yield* tx
            .insert(KVTable)
            .values({ key: markerKey(location.source), value: JSON.parse(JSON.stringify(summary)) })
            .run()
          return { summary, ids: copied.map((item) => item.id) }
        }),
      )
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([Database.node, Project.node, FSUtil.node]), [
          Database.node.replace(
            Database.layer({ path: destination }).pipe(Layer.provide(Layer.succeed(Global.Service, global))),
          ),
          Global.node.replace(Layer.succeed(Global.Service, global)),
        ]),
      ),
      Effect.catchCause(failWith(`cannot write ${destination}`)),
    )
    // Count again on the closed file: that is what the next server start sees.
    const stored = yield* readOnly(Sqlite, destination, (db) => {
      const count = (query: string, ids: ReadonlyArray<string>) =>
        db.query<{ value: number }, [string]>(query).get(JSON.stringify(ids))?.value ?? 0
      return {
        sessions: count(
          "SELECT COUNT(*) AS value FROM session_v2 WHERE id IN (SELECT value FROM json_each(?))",
          read.sessions.map((session) => session.id),
        ),
        messages: count(
          "SELECT COUNT(*) AS value FROM session_message WHERE session_id IN (SELECT value FROM json_each(?))",
          written.ids,
        ),
        marker: marker(db, location.source) !== undefined,
      }
    })
    if (
      stored.sessions !== read.sessions.length ||
      stored.messages !== written.summary.migrated.messages ||
      !stored.marker
    )
      return yield* Effect.fail(
        new MigrateError(
          `${destination} holds ${stored.sessions} of ${read.sessions.length} sessions and ${stored.messages} of ${written.summary.migrated.messages} messages after the copy`,
        ),
      )
    return written.summary
  }).pipe(Effect.scoped)
}

// One lookup per directory. A lookup that hangs (a dead network mount) stops the rest, which stay global.
function resolveOwners(directories: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const owners = new Map<string, { readonly project: Project.Resolved; readonly path: string } | undefined>()
    for (const directory of new Set(directories)) {
      const resolved = yield* resolveDirectory(directory)
      if (Option.isNone(resolved)) {
        yield* Effect.logWarning("Stopped resolving 0.4 session directories after a timeout", { directory })
        return owners
      }
      owners.set(directory, resolved.value)
    }
    return owners
  })
}

// Copied from V1Migration.run (not exported there): any failure keeps the session under global, and the lookup runs
// detached so a filesystem or git call that ignores interruption cannot stall the migration.
function resolveDirectory(directory: string) {
  return Effect.gen(function* () {
    const fiber = yield* Effect.forkDetach(
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const normalized = yield* fs
          .realPath(path.resolve(FSUtil.windowsPath(directory)))
          .pipe(Effect.orElseSucceed(() => undefined))
        if (!normalized || !(yield* fs.isDir(normalized))) return
        const projects = yield* Project.Service
        const project = yield* projects.resolve(AbsolutePath.make(normalized), { persist: false })
        return { project, path: path.relative(project.directory, normalized).replaceAll("\\", "/") }
      }),
    )
    const result = yield* Fiber.join(fiber).pipe(
      Effect.catchDefect((defect) =>
        Effect.logWarning("Failed to resolve 0.4 session directory", { directory, defect }).pipe(Effect.as(undefined)),
      ),
      Effect.timeoutOption("5 seconds"),
    )
    if (Option.isNone(result)) yield* Effect.forkDetach(Fiber.interrupt(fiber))
    return result
  })
}

function readLegacy(db: SQLiteDatabase, source: string) {
  const tables = new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((table) => table.name),
  )
  if (tables.has("session_v2")) throw new MigrateError(`${source} is already an OpenCode 2 database`)
  const missing = ["project", "session", "message", "part"].filter((table) => !tables.has(table))
  if (missing.length) throw new MigrateError(`${source} is not a 0.3.9 or 0.4 database: no table ${missing.join(", ")}`)
  const count = (table: string) =>
    db.query<{ value: number }, []>(`SELECT COUNT(*) AS value FROM ${table}`).get()?.value ?? 0
  return {
    rows: { sessions: count("session"), messages: count("message"), parts: count("part") },
    schema: tables.has("migration")
      ? db.query<{ id: string }, []>("SELECT id FROM migration ORDER BY id DESC LIMIT 1").get()?.id
      : undefined,
    projects: db
      .query<LegacyProject, []>(
        `SELECT id, worktree, vcs, name, icon_url, icon_url_override, icon_color, time_created, time_updated,
          time_initialized, sandboxes, commands
        FROM project`,
      )
      .all(),
    sessions: db
      .query<LegacySession, []>(
        `SELECT id, project_id, workspace_id, parent_id, slug, directory, path, title, version, share_url,
          summary_additions, summary_deletions, summary_files, summary_diffs, metadata, cost,
          tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
          revert, agent, model, time_created, time_updated, time_compacting, time_archived
        FROM session ORDER BY id`,
      )
      .all(),
  }
}

type LegacyProject = {
  readonly id: string
  readonly worktree: string
  readonly vcs: string | null
  readonly name: string | null
  readonly icon_url: string | null
  readonly icon_url_override: string | null
  readonly icon_color: string | null
  readonly time_created: number
  readonly time_updated: number
  readonly time_initialized: number | null
  readonly sandboxes: string
  readonly commands: string | null
}

type LegacySession = {
  readonly id: string
  readonly project_id: string
  readonly workspace_id: string | null
  readonly parent_id: string | null
  readonly slug: string
  readonly directory: string
  readonly path: string | null
  readonly title: string
  readonly version: string
  readonly share_url: string | null
  readonly summary_additions: number | null
  readonly summary_deletions: number | null
  readonly summary_files: number | null
  readonly summary_diffs: string | null
  readonly metadata: string | null
  readonly cost: number
  readonly tokens_input: number
  readonly tokens_output: number
  readonly tokens_reasoning: number
  readonly tokens_cache_read: number
  readonly tokens_cache_write: number
  readonly revert: string | null
  readonly agent: string | null
  readonly model: string | null
  readonly time_created: number
  readonly time_updated: number
  readonly time_compacting: number | null
  readonly time_archived: number | null
}

function markerKey(source: string) {
  return `loginom.migrate:${source}`
}

function marker(db: SQLiteDatabase, source: string) {
  if (!isNext(db)) return undefined
  const row = db.query<{ value: string }, [string]>("SELECT value FROM kv WHERE key = ?").get(markerKey(source))
  return row ? (JSON.parse(row.value) as Summary) : undefined
}

function isLegacy(db: SQLiteDatabase) {
  const tables = new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((table) => table.name),
  )
  return !tables.has("session_v2") && ["project", "session", "message", "part"].every((table) => tables.has(table))
}

function isNext(db: SQLiteDatabase) {
  return (
    db
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('kv', 'session_v2')")
      .all().length === 2
  )
}

// A read-only open of a WAL database creates empty -wal and -shm files; close removes the ones this open created.
function openReadOnly(Sqlite: typeof SQLiteDatabase, file: string) {
  const created = SIDECARS.map((suffix) => file + suffix).filter((sidecar) => !existsSync(sidecar))
  const db = new Sqlite(file, { readonly: true, strict: true })
  return {
    db,
    close: () => {
      db.close()
      created.forEach((sidecar) => rmSync(sidecar, { force: true }))
    },
  }
}

// The WAL travels with its database: a v1 -wal left beside the new file would be replayed into it.
function moveDatabase(from: string, to: string) {
  SIDECARS.filter((suffix) => existsSync(from + suffix)).forEach((suffix) => renameSync(from + suffix, to + suffix))
  renameSync(from, to)
}

function removeDatabase(file: string) {
  ;["", ...SIDECARS].forEach((suffix) => rmSync(file + suffix, { force: true }))
}

function readOnly<A>(Sqlite: typeof SQLiteDatabase, file: string, read: (db: SQLiteDatabase) => A) {
  return Effect.acquireUseRelease(
    attempt(`cannot read ${file}`, () => openReadOnly(Sqlite, file)),
    (opened) => attempt(`cannot read ${file}`, () => read(opened.db)),
    (opened) => Effect.sync(opened.close),
  )
}

function attempt<A>(context: string, read: () => A) {
  return Effect.try({ try: read, catch: (error) => describe(context, error) })
}

function failWith(context: string) {
  return (cause: Cause.Cause<unknown>) => Effect.fail(describe(context, Cause.squash(cause)))
}

function describe(context: string, error: unknown) {
  if (error instanceof MigrateError) return error
  return new MigrateError(`${context}: ${errorText(error)}`)
}

function errorText(input: unknown): string {
  if (!(input instanceof Error)) return String(input)
  return input.cause instanceof Error ? `${input.message}: ${errorText(input.cause)}` : input.message
}
