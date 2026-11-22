import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { restoreLegacy } from "../../server/test/fixture/legacy/restore"
import { transpilerCache } from "./fixture/environment"

// `migrate` runs before the server: the database logic is covered in packages/server/test/legacy-migrate.test.ts, this
// file checks the command a release build runs, where the 0.4 database and the new one share a path.
const cli = path.join(import.meta.dir, "..")
const roots: string[] = []
const runs = {} as Record<"migrated" | "again" | "damaged", Awaited<ReturnType<typeof migrate>>>
const originals = {} as Record<"good" | "damaged", string>

beforeAll(async () => {
  const [good, damaged] = await Promise.all([profile(), profile()])
  await fs.mkdir(path.join(good.config, "plugins"), { recursive: true })
  await Bun.write(
    path.join(good.config, "loginom-ai-agent.jsonc"),
    '{\n  // 0.4 user plugins\n  "plugin": ["opencode-wakatime", ["@acme/loginom-extra", { "level": 1 }]]\n}\n',
  )
  await Bun.write(path.join(good.config, "plugins", "local-tool.ts"), "export default {}\n")
  await fs.truncate(damaged.database, (await fs.stat(damaged.database)).size / 2)
  originals.good = await hash(good.database)
  originals.damaged = await hash(damaged.database)
  const [migrated, broken] = await Promise.all([migrate(good.root), migrate(damaged.root)])
  runs.migrated = migrated
  runs.damaged = broken
  runs.again = await migrate(good.root)
}, 60_000)

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("migrate", () => {
  test("moves the channel's 0.4 database aside, writes the new one in its place and names the plugins it leaves", () => {
    const { stdout, stderr, code, data } = runs.migrated
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    expect(stdout).toContain(`Migrated ${path.join(data, "loginom-ai-agent.db")}`)
    expect(stdout).toContain("Written: 3 sessions")
    expect(stdout).toContain(`Original kept as ${path.join(data, "loginom-ai-agent.v1-backup.db")}`)
    expect(runs.migrated.files["loginom-ai-agent.v1-backup.db"]).toBe(originals.good)
    expect(stdout).toContain("User plugins are not migrated")
    expect(stdout).toContain("  opencode-wakatime (")
    expect(stdout).toContain("  @acme/loginom-extra (")
    expect(stdout).toContain("  local-tool.ts (")
  })

  test("a second run changes nothing", () => {
    expect(runs.again.code).toBe(0)
    expect(runs.again.stdout).toContain("Already migrated")
    expect(runs.again.files).toEqual(runs.migrated.files)
  })

  test("an error stops the command with a non-zero code and no success report", () => {
    const { stdout, stderr, code } = runs.damaged
    expect(stderr).toContain("migrate failed: cannot read")
    expect(stderr).toContain("database disk image is malformed")
    expect(code).toBe(1)
    expect(stdout).not.toContain("Migrated")
    expect(runs.damaged.files).toEqual({ "loginom-ai-agent.db": originals.damaged })
  })
})

// A source run uses the dev channel's directory; the release database name makes the 0.4 file and the new one collide.
async function profile() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-migrate-cli-")))
  roots.push(root)
  const data = path.join(root, "data", "loginom-ai-agent-dev")
  const config = path.join(root, "config", "loginom-ai-agent-dev")
  await fs.mkdir(data, { recursive: true })
  await fs.mkdir(config, { recursive: true })
  const database = path.join(data, "loginom-ai-agent.db")
  await restoreLegacy("0.4", database)
  return { root, data, config, database }
}

async function migrate(root: string) {
  const data = path.join(root, "data", "loginom-ai-agent-dev")
  const child = Bun.spawn([process.execPath, "run", path.join(cli, "src/index.ts"), "migrate"], {
    cwd: cli,
    env: {
      PATH: process.env.PATH,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: transpilerCache,
      HOME: root,
      USERPROFILE: root,
      TMPDIR: path.join(root, "tmp"),
      TEMP: path.join(root, "tmp"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_STATE_HOME: path.join(root, "state"),
      LOGINOM_AI_AGENT_DISABLE_CHANNEL_DB: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  // Every database file in the channel directory, sidecars and leftovers included.
  const names = (await fs.readdir(data)).filter((name) => name.includes(".db")).sort()
  const files = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await hash(path.join(data, name))])),
  )
  return { stdout, stderr, code, data, files }
}

async function hash(file: string) {
  return new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex")
}
