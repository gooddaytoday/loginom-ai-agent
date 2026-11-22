import { afterAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { restoreLegacy } from "../../server/test/fixture/legacy/restore"
import { isolatedEnv } from "./fixture/environment"

// A server started before `migrate` must not open a 0.3.9/0.4 database as its own: the v2 schema migrations would drop
// its sessions and report success (spike S4). `serve`, which Desktop and the CLI start, migrates the file first or
// refuses to start. The migration itself is covered in packages/server/test/legacy-migrate.test.ts.
const cli = path.join(import.meta.dir, "..")
const password = "legacy-guard-test"
// The directory the fixture sessions were recorded in.
const project = "/tmp/loginom-fixture/project"
const roots: string[] = []

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("serve on a 0.3.9/0.4 database", () => {
  test("migrates a 0.4 profile first, keeps the original as the backup and later starts on the result as before", async () => {
    const root = await profile("0.4")
    const original = await hash(path.join(root, "loginom-ai-agent.db"))

    expect(await sessions(root)).toHaveLength(3)
    expect(await hash(path.join(root, "loginom-ai-agent.v1-backup.db"))).toBe(original)

    expect(await sessions(root)).toHaveLength(3)
    expect(await hash(path.join(root, "loginom-ai-agent.v1-backup.db"))).toBe(original)
  }, 60_000)

  test("migrates a 0.3.9 profile first", async () => {
    const root = await profile("0.3.9")
    const original = await hash(path.join(root, "loginom-ai-agent.db"))

    expect(await sessions(root)).toHaveLength(3)
    expect(await hash(path.join(root, "loginom-ai-agent.v1-backup.db"))).toBe(original)
  }, 60_000)

  test("does not start when the migration fails and leaves the original alone", async () => {
    const root = await profile("0.4")
    // OpenCode 2 accepts only session IDs that start with "ses", so this session stops the migration.
    const db = new Database(path.join(root, "loginom-ai-agent.db"))
    db.run(
      "INSERT INTO session SELECT 'zzz', project_id, workspace_id, parent_id, slug, directory, path, title, version, share_url, summary_additions, summary_deletions, summary_files, summary_diffs, metadata, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, revert, permission, agent, model, time_created, time_updated, time_compacting, time_archived FROM session LIMIT 1",
    )
    db.close()
    const original = await hash(path.join(root, "loginom-ai-agent.db"))

    const child = serve(root)
    const url = await listening(child)
    if (url) child.kill("SIGTERM")
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited])

    expect(url).toBeUndefined()
    expect(stderr).toContain("could not be migrated, so the server does not start: cannot copy session zzz")
    expect(code).toBe(1)
    expect(await hash(path.join(root, "loginom-ai-agent.db"))).toBe(original)
    expect((await fs.readdir(root)).filter((name) => name.includes(".db"))).toEqual(["loginom-ai-agent.db"])
  }, 60_000)
})

// isolatedEnv points LOGINOM_AI_AGENT_DB at <root>/loginom-ai-agent.db, where the legacy profile is restored.
async function profile(version: "0.3.9" | "0.4") {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-legacy-guard-")))
  roots.push(root)
  await restoreLegacy(version, path.join(root, "loginom-ai-agent.db"))
  return root
}

function serve(root: string) {
  // The CLI entry needs the preload from this package's bunfig.toml.
  return Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--port", "0"], {
    cwd: cli,
    env: isolatedEnv(root, { LOGINOM_AI_AGENT_PASSWORD: password }),
    stdout: "pipe",
    stderr: "pipe",
  })
}

// Starts the server, lists its sessions through the API and stops it again.
async function sessions(root: string) {
  const child = serve(root)
  try {
    const url = await listening(child)
    if (!url) throw new Error(`server did not start: ${await new Response(child.stderr).text()}`)
    const response = await fetch(new URL("/api/session", url), {
      headers: {
        authorization: `Basic ${btoa(`opencode:${password}`)}`,
        "x-opencode-directory": encodeURIComponent(project),
      },
    })
    if (!response.ok) throw new Error(`GET /api/session: ${response.status} ${await response.text()}`)
    return ((await response.json()) as { data: { id: string }[] }).data.map((session) => session.id)
  } finally {
    child.kill("SIGTERM")
    await child.exited
  }
}

// The URL once the server listens, or undefined when it exits first.
async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  return undefined
}

async function hash(file: string) {
  return new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex")
}
