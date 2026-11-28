import { eq } from "drizzle-orm"
import { Effect, FileSystem, Option, Path, Predicate, Schema } from "effect"
import type { Database } from "./database"
import { legacyStoreImportID, pendingLegacyStores } from "./legacy-files"
import { state } from "./schema"

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)))

const draftRetentionMs = 30 * 24 * 60 * 60 * 1000

const draftKeepRecent = 100

export const importProductLegacyStores = Effect.fn("DesktopStorage.importProductLegacyStores")(function* (
  db: Database,
  userData: string,
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const names = yield* fs.readDirectory(userData).pipe(Effect.orElseSucceed(() => []))
  const pending = pendingLegacyStores(db.$client, names).filter((entry) => entry.file !== entry.name)

  const files = yield* Effect.forEach(
    pending,
    Effect.fnUntraced(function* (source) {
      const file = path.join(userData, source.file)
      const stats = yield* fs.stat(file).pipe(Effect.orElseSucceed(() => undefined))

      if (stats?.type !== "File") return
      const raw = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined))

      if (raw === undefined) return

      return {
        ...source,
        modified: Option.getOrElse(stats.mtime, () => new Date(0)).getTime(),
        entries: Option.getOrUndefined(decode(raw)),
      }
    }),
    { concurrency: 5 },
  )

  const candidates = files.filter(Predicate.isNotUndefined)

  if (candidates.length === 0) return 0

  const kept = new Set(
    candidates
      .filter((file) => isDraft(file.name) && file.entries && Object.keys(file.entries).length > 0)
      .filter((file) => Date.now() - file.modified <= draftRetentionMs)
      .sort((a, b) => b.modified - a.modified)
      .slice(0, draftKeepRecent)
      .map((file) => file.file),
  )

  const result = yield* Effect.try(() =>
    db.transaction((tx) => {
      const record = db.$client.prepare("INSERT OR IGNORE INTO migration (id, time_completed) VALUES (?, ?)")
      const malformed: string[] = []
      let imported = 0

      for (const file of candidates) {
        // Claim the file before checking the namespace so both decisions share the same write transaction.
        if (!record.run(legacyStoreImportID(file.file), Date.now()).changes) continue

        if (!file.entries) {
          malformed.push(file.file)

          continue
        }

        if (isDraft(file.name) && !kept.has(file.file)) continue

        if (tx.select({ key: state.key }).from(state).where(eq(state.name, file.name)).limit(1).get()) continue

        for (const [key, value] of Object.entries(file.entries)) {
          tx.insert(state)
            .values({
              name: file.name,
              key,
              value: Predicate.isString(value) ? value : JSON.stringify(value),
              updated_at: file.modified,
            })
            .run()
          imported++
        }
      }

      return { imported, malformed }
    }),
  )

  for (const name of result.malformed) {
    yield* Effect.logWarning("legacy store has invalid data, leaving it in place", { name })
  }

  return result.imported
})

function isDraft(name: string) {
  return name.startsWith("opencode.draft.")
}
