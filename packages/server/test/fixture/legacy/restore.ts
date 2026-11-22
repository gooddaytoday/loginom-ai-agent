import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"

// Profiles written by the CLI of Loginom AI Agent 0.3.9 and 0.4.x themselves (generate.ts), kept as SQL dumps. The
// sessions were recorded under `/tmp/loginom-fixture`: three in `project`, a directory without git (two turns of text,
// a `read` tool call with a file:// attachment, an attachment sent as a data: URL), and one in `repo`, a git repository.
export const recorded = "/tmp/loginom-fixture"

export async function restoreLegacy(version: "0.3.9" | "0.4", file: string, root?: string) {
  const db = new Database(file, { create: true })
  db.run(await Bun.file(path.join(import.meta.dir, `${version}.sql`)).text())
  // Moves the recorded directories under `root`, so parallel runs do not share them.
  if (root) {
    db.run("UPDATE session SET directory = replace(directory, ?, ?)", [recorded, root])
    db.run("UPDATE project SET worktree = replace(worktree, ?, ?)", [recorded, root])
  }
  // Real profiles are WAL databases.
  db.run("PRAGMA journal_mode = WAL")
  db.close()
}

// The recorded directories: `project` without git, and `repo` with the root commit 0.4 took its project ID from. Fixed
// identity, dates and message give that commit the same hash wherever it is made.
export function legacyDirectories(root: string) {
  mkdirSync(path.join(root, "project"), { recursive: true })
  const repo = path.join(root, "repo")
  mkdirSync(repo, { recursive: true })
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  }
  const identity = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false"]
  ;[
    ["init", "-q"],
    [...identity, "commit", "-q", "--allow-empty", "-m", "fixture"],
  ].forEach((args) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: repo, env, stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`)
  })
  return { project: path.join(root, "project"), repo }
}
