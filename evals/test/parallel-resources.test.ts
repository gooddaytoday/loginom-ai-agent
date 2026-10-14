import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm, statfs } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sampleHostResources } from "../src/parallel-resources"

test("resource sampling observes actual host counters and filesystem capacity without modifying its roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-sample-"))
  try {
    await Bun.write(path.join(root, "private-content"), "credential-canary")
    const before = await readdir(root)
    const sample = await sampleHostResources([root])
    expect(Number.isFinite(Date.parse(sample.observed_at))).toBe(true)
    expect(sample.cpu?.ticks.length).toBeGreaterThanOrEqual(8)
    expect(sample.cpu?.ticks.every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true)
    expect(sample.memory?.total_bytes).toBe(os.totalmem())
    expect(sample.memory?.available_bytes).toBeGreaterThan(0)
    expect(sample.memory?.swap_total_bytes).toBeGreaterThanOrEqual(0)
    expect(sample.memory?.swap_free_bytes).toBeGreaterThanOrEqual(0)
    expect(sample.filesystems).toHaveLength(1)
    expect(sample.filesystems[0]?.path).toBe(root)
    expect(sample.filesystems[0]?.capacity?.total_bytes).toBe((await statfs(root)).blocks * (await statfs(root)).bsize)
    expect(sample.filesystems[0]?.capacity?.available_bytes).toBeGreaterThan(0)
    expect(sample.filesystems[0]?.capacity?.available_inodes).toBeGreaterThan(0)
    expect(sample.errors).toEqual([])
    expect(JSON.stringify(sample)).not.toContain("credential-canary")
    expect(await readdir(root)).toEqual(before)
    expect(await Bun.file(path.join(root, "private-content")).text()).toBe("credential-canary")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource sampling records an unavailable filesystem as unknown while retaining healthy measurements", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-missing-"))
  try {
    const missing = path.join(root, "missing")
    const sample = await sampleHostResources([root, missing])
    expect(sample.filesystems[0]?.capacity?.available_bytes).toBeGreaterThan(0)
    expect(sample.filesystems[1]).toMatchObject({ path: missing, capacity: null, error: "FILESYSTEM_UNAVAILABLE" })
    expect(sample.errors).toEqual(["FILESYSTEM_UNAVAILABLE"])
    expect(sample.cpu?.ticks.length).toBeGreaterThanOrEqual(8)
    expect(sample.memory?.available_bytes).toBeGreaterThan(0)
    expect(await readdir(root)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
