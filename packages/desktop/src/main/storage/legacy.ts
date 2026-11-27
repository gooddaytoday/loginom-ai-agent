import { Effect, FileSystem, Option, Path, Predicate, Schema } from "effect"
import type { Database } from "./database"
import { legacyStoreImportID, pendingLegacyStores } from "./legacy-files"
import { state } from "./schema"

const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const DRAFT_KEEP_RECENT = 100

const Entries = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))

const decode = Schema.decodeUnknownOption(Entries)

// Before the state table existed, every namespace the renderer persisted was an electron-store
// JSON file in userData. Copy it once before serving renderer state and leave the source intact.
export const importLegacyStores = Effect.fn("DesktopStorage.importLegacyStores")(function* (
  db: Database,
  userData: string,
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const names = yield* fs.readDirectory(userData).pipe(Effect.orElseSucceed(() => []))

  const files = yield* Effect.forEach(
    pendingLegacyStores(db.$client, names),
    Effect.fnUntraced(function* (source) {
      const file = path.join(userData, source.file)
      const stats = yield* fs.stat(file).pipe(Effect.orElseSucceed(() => undefined))

      if (stats?.type !== "File") return
      const raw = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined))

      if (raw === undefined) return
      const entries = decode(raw)

      if (Option.isNone(entries)) {
        yield* Effect.logWarning("legacy store is not readable, leaving it in place", { name: source.file })

        return
      }

      return {
        ...source,
        modified: Option.getOrElse(stats.mtime, () => new Date(0)).getTime(),
        entries: entries.value,
      }
    }),
    { concurrency: 5 },
  )

  const candidates = files.filter((file) => !!file)

  if (candidates.length === 0) return { imported: 0, files: [] }

  const kept = new Set(
    candidates
      .filter((file) => isDraft(file.name) && Object.keys(file.entries).length > 0)
      .filter((file) => Date.now() - file.modified <= DRAFT_RETENTION_MS)
      .sort((a, b) => b.modified - a.modified)
      .slice(0, DRAFT_KEEP_RECENT)
      .map((file) => file.file),
  )

  // Existing rows win. Among files, the current namespace takes precedence over aliases.
  candidates.sort((a, b) => Number(b.file === b.name) - Number(a.file === a.name))

  return db.transaction((tx) => {
    const record = db.$client.prepare("INSERT OR IGNORE INTO migration (id, time_completed) VALUES (?, ?)")
    const completed: string[] = []
    let imported = 0

    for (const file of candidates) {
      // Mark files in the same transaction as their rows so later startup cannot restore deleted values.
      if (!record.run(legacyStoreImportID(file.file), Date.now()).changes) continue
      completed.push(file.file)

      if (isDraft(file.name) && !kept.has(file.file)) continue

      for (const [key, value] of Object.entries(file.entries)) {
        const result = tx
          .insert(state)
          .values({
            name: file.name,
            key,
            value: Predicate.isString(value) ? value : JSON.stringify(value),
            updated_at: file.modified,
          })
          .onConflictDoNothing()
          .run()

        imported += Number(result.changes)
      }
    }

    return { imported, files: completed }
  })
})

function isDraft(name: string) {
  return name.startsWith("opencode.draft.")
}
