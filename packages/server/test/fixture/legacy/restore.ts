import { Database } from "bun:sqlite"
import path from "node:path"

// Profiles written by the CLI of Loginom AI Agent 0.3.9 and 0.4.x themselves (generate.ts), kept as SQL dumps. Each has
// three sessions: two turns of text, a `read` tool call with a file:// attachment, and an attachment sent as a data: URL.
export async function restoreLegacy(version: "0.3.9" | "0.4", file: string) {
  const db = new Database(file, { create: true })
  db.run(await Bun.file(path.join(import.meta.dir, `${version}.sql`)).text())
  // Real profiles are WAL databases.
  db.run("PRAGMA journal_mode = WAL")
  db.close()
}
