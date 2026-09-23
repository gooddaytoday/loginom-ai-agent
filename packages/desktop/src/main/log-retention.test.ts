import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync } from "node:fs"
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { logRetention } from "./log-retention"

const roots: string[] = []
const day = 24 * 60 * 60 * 1000

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "loginom-log-retention-"))
  roots.push(root)
  return root
}

async function writeAged(file: string, age: number, bytes = 3) {
  mkdirSync(dirname(file), { recursive: true })
  await writeFile(file, "x".repeat(bytes))
  const when = new Date(Date.now() - age)
  await utimes(file, when, when)
}

function retention(root: string, run: string, maxBytes = 100 * 1024 * 1024) {
  return logRetention({
    root,
    run,
    crashDumps: join(root, "crash"),
    legacy: [],
    maxBytes,
    maxAge: 7 * day,
    reserve: { log: 5 * 1024 * 1024, netlog: 20 * 1024 * 1024 },
  })
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("log retention", () => {
  test("removes files from old runs past the retention age and deletes emptied run directories", async () => {
    const root = await tempRoot()
    const current = join(root, "current")
    await writeAged(join(root, "stale", "main.log"), 8 * day)
    await writeAged(join(root, "stale", "nested", "server.log"), 8 * day)
    await writeAged(join(root, "fresh", "main.log"), day)
    await writeAged(join(current, "main.log"), 8 * day)

    retention(root, current).prune()

    expect(existsSync(join(root, "stale"))).toBe(false)
    expect(existsSync(join(root, "fresh", "main.log"))).toBe(true)
    expect(existsSync(join(current, "main.log"))).toBe(true)
  })

  test("deletes the oldest files outside the current run until the directory fits the size limit", async () => {
    const root = await tempRoot()
    const current = join(root, "current")
    const older = join(root, "older", "main.log")
    const newer = join(root, "newer", "main.log")
    await writeAged(older, 2 * day, 6)
    await writeAged(newer, day, 6)
    await writeAged(join(current, "main.log"), 0, 4)

    logRetention({
      root,
      run: current,
      crashDumps: join(root, "crash"),
      legacy: [],
      maxBytes: 10,
      maxAge: 7 * day,
      reserve: { log: 0, netlog: 0 },
    }).prune()

    expect(existsSync(older)).toBe(false)
    expect(existsSync(newer)).toBe(true)
    expect(existsSync(join(current, "main.log"))).toBe(true)
  })

  test("keeps the current run and the log root, and deletes a rotated file from the current run", async () => {
    const root = await tempRoot()
    const current = join(root, "current")
    const rotated = join(current, "main.old.log")
    await writeAged(join(root, "session"), day, 6)
    await writeAged(join(current, "main.log"), day, 6)
    await writeAged(rotated, day, 6)

    logRetention({
      root,
      run: current,
      crashDumps: join(root, "crash"),
      legacy: [],
      maxBytes: 10,
      maxAge: 7 * day,
      reserve: { log: 0, netlog: 0 },
    }).prune()

    expect(existsSync(rotated)).toBe(false)
    expect(existsSync(join(current, "main.log"))).toBe(true)
    expect(existsSync(join(root, "session"))).toBe(true)
  })

  test("reserves room for each active log to reach its cap and for a netlog that does not exist yet", async () => {
    const root = await tempRoot()
    const current = join(root, "current")
    const old = join(root, "old", "main.log")
    await writeAged(join(current, "main.log"), 0, 1)
    await writeAged(join(current, "renderer.log"), 0, 1)
    await writeAged(old, day, 1)

    logRetention({
      root,
      run: current,
      crashDumps: join(root, "crash"),
      legacy: [],
      maxBytes: 12,
      maxAge: 7 * day,
      reserve: { log: 4, netlog: 4 },
    }).prune()

    expect(existsSync(old)).toBe(false)
    expect(existsSync(join(current, "main.log"))).toBe(true)
    expect(existsSync(join(current, "renderer.log"))).toBe(true)
  })

  test("skips a file that cannot be deleted and removes the next oldest", async () => {
    if (process.platform === "win32") return
    const root = await tempRoot()
    const current = join(root, "current")
    const lockedDir = join(root, "locked")
    const locked = join(lockedDir, "main.log")
    const next = join(root, "next", "main.log")
    await writeAged(locked, 2 * day, 6)
    await writeAged(next, day, 6)
    await writeAged(join(current, "main.log"), 0, 4)
    chmodSync(lockedDir, 0o555)
    try {
      logRetention({
        root,
        run: current,
        crashDumps: join(root, "crash"),
        legacy: [],
        maxBytes: 10,
        maxAge: 7 * day,
        reserve: { log: 0, netlog: 0 },
      }).prune()

      expect(existsSync(locked)).toBe(true)
      expect(existsSync(next)).toBe(false)
      expect(existsSync(join(current, "main.log"))).toBe(true)
    } finally {
      chmodSync(lockedDir, 0o755)
    }
  })

  test("reports the previous run and only crash dumps newer than its marker", async () => {
    const root = await tempRoot()
    const run = join(root, "current")
    const dumps = join(root, "crash")
    const oldDump = join(dumps, "completed", "old.dmp")
    const newDump = join(dumps, "completed", "new.dmp")
    const session = logRetention({
      root,
      run,
      crashDumps: dumps,
      legacy: [],
      maxBytes: 100,
      maxAge: 7 * day,
      reserve: { log: 0, netlog: 0 },
    })

    expect(session.start()).toBeUndefined()
    const marked = (await stat(join(root, "session"))).mtimeMs
    await writeAged(oldDump, 0)
    await utimes(oldDump, new Date(marked - 1000), new Date(marked - 1000))
    await writeAged(newDump, 0)
    await utimes(newDump, new Date(marked + 1000), new Date(marked + 1000))

    expect(session.start()).toEqual({ run, dumps: [newDump] })
    session.end()
    expect(existsSync(join(root, "session"))).toBe(false)
    expect(session.start()).toBeUndefined()
  })

  test("removes a legacy log older than the retention age and keeps a fresh one", async () => {
    const root = await tempRoot()
    const outside = await tempRoot()
    const stale = join(outside, "loginom-ai-agent.log")
    const fresh = join(outside, "fresh.log")
    await writeAged(stale, 8 * day)
    await writeAged(fresh, day)

    logRetention({
      root,
      run: join(root, "current"),
      crashDumps: join(root, "crash"),
      legacy: [stale, fresh],
      maxBytes: 100,
      maxAge: 7 * day,
      reserve: { log: 0, netlog: 0 },
    }).start()

    expect(existsSync(stale)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
  })
})
