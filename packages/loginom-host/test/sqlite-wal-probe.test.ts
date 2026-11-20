import { Database } from "bun:sqlite"
import { test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Temporary (#1244): records how bun:sqlite opens a WAL chat database on this
// platform in the states the CLI leaves it. Removed after the macOS run.
test("sqlite WAL open probe", () => {
  const dir = mkdtempSync(join(tmpdir(), "loginom-sqlite-probe-"))
  const file = join(dir, "chat.db")
  const seed = new Database(file, { create: true })
  seed.run("CREATE TABLE session (id TEXT)")
  seed.run("INSERT INTO session VALUES ('a')")
  seed.close()
  const memory = new Database(":memory:")
  console.log(`MACPROBE sqlite ${JSON.stringify(memory.query("SELECT sqlite_version() AS v").get())} bun ${Bun.version}`)
  memory.close()
  const report = (state: string) => {
    for (const mode of ["readonly", "query_only"]) {
      const sides = `wal=${existsSync(file + "-wal")} shm=${existsSync(file + "-shm")}`
      const outcome = (() => {
        try {
          const db = mode === "readonly" ? new Database(file, { readonly: true }) : new Database(file, { readwrite: true, create: false })
          if (mode === "query_only") db.run("PRAGMA query_only = ON")
          const rows = JSON.stringify(db.query("SELECT count(*) AS n FROM session").get())
          db.close()
          return rows
        } catch (error) {
          return `error ${error instanceof Error ? `${(error as Error & { code?: string }).code} ${error.message}` : String(error)}`
        }
      })()
      console.log(`MACPROBE ${state} ${mode} (before: ${sides}): ${outcome}`)
    }
  }
  report("rollback")
  const writer = new Database(file)
  writer.run("PRAGMA journal_mode = WAL")
  report("fresh-wal")
  writer.run("INSERT INTO session VALUES ('b')")
  report("running-writer")
  writer.close()
  report("writer-exited")
  rmSync(dir, { recursive: true, force: true })
})
