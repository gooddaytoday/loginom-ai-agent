import { expect, test } from "bun:test"
import { chmod, mkdtemp, readdir, rm, stat, statfs } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { collectHostResources, sampleHostResources } from "../src/parallel-resources"
import { loadResourceSlots } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { parallelFixture } from "./helpers/parallel-fixture"

test("resource configuration reads private metadata without admin credentials or prepared profiles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-config-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    const before = await Bun.file(file).text()
    await rm(fixture.slots.slots[0]!.profileDir, { recursive: true })
    const observed = await loadResourceSlots(file)
    expect(observed).toEqual(fixture.slots)
    expect(await Bun.file(file).text()).toBe(before)
    expect(await Bun.file(observed.controller.adminCredentialsFile).exists()).toBe(false)
    const sample = await sampleHostResources([observed.slots[0]!.profileDir])
    expect(sample.filesystems[0]?.capacity).toBeNull()
    expect(sample.errors).toContain("FILESYSTEM_UNAVAILABLE")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource collector persists ordered private samples and stops cleanly on abort", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-collector-"))
  const out = path.join(root, "samples.jsonl")
  const abort = new AbortController()
  const pending = collectHostResources({ paths: [root], out, intervalMs: 10, runId: "run-1", phase: "before", signal: abort.signal })
  try {
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (await Bun.file(out).exists() && (await Bun.file(out).text()).split("\n").filter(Boolean).length >= 3) break
      await Bun.sleep(10)
    }
    abort.abort()
    const result = await pending
    const saved = await Bun.file(out).text()
    const rows = saved.trim().split("\n").map(line => JSON.parse(line))
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(result.samples).toBe(rows.length)
    expect(rows.map(row => row.sequence)).toEqual(rows.map((_, index) => index + 1))
    expect(rows.every(row => row.run_id === "run-1" && row.phase === "before")).toBe(true)
    expect(rows.every(row => row.host.memory.available_bytes > 0 && row.host.cpu.ticks.length >= 8)).toBe(true)
    expect(rows.every(row => Number.isFinite(row.elapsed_ms) && row.elapsed_ms >= 0)).toBe(true)
    expect((await stat(out)).mode & 0o777).toBe(0o600)
    expect((await stat(out)).nlink).toBe(1)
    expect(await Bun.file(out).text()).toBe(saved)
  } finally { abort.abort(); await pending.catch(() => {}); await rm(root, { recursive: true, force: true }) }
})

test("resource collector refuses a public output directory before creating evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-public-"))
  const out = path.join(root, "samples.jsonl")
  const abort = new AbortController()
  abort.abort()
  try {
    await chmod(root, 0o755)
    await expect(collectHostResources({ paths: [root], out, intervalMs: 10, runId: "run-1", phase: "before", signal: abort.signal }))
      .rejects.toThrow("RESOURCE_OUTPUT_PRIVATE")
    expect(await Bun.file(out).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource collector preserves an existing evidence file instead of appending a new run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-existing-"))
  const out = path.join(root, "samples.jsonl")
  const abort = new AbortController()
  abort.abort()
  try {
    await Bun.write(out, "previous-evidence")
    const before = await stat(out)
    await expect(collectHostResources({ paths: [root], out, intervalMs: 10, runId: "run-2", phase: "run", signal: abort.signal }))
      .rejects.toThrow("RESOURCE_OUTPUT_PRIVATE")
    expect(await Bun.file(out).text()).toBe("previous-evidence")
    expect((await stat(out)).ino).toBe(before.ino)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource collector rejects a zero interval before creating evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-interval-"))
  const out = path.join(root, "samples.jsonl")
  const abort = new AbortController()
  abort.abort()
  try {
    await expect(collectHostResources({ paths: [root], out, intervalMs: 0, runId: "run-1", phase: "before", signal: abort.signal }))
      .rejects.toThrow("RESOURCE_INTERVAL")
    expect(await Bun.file(out).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource collector records a delayed observation as missed intervals without inventing samples", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-gap-"))
  const out = path.join(root, "samples.jsonl")
  const abort = new AbortController()
  const pending = collectHostResources({ paths: [root], out, intervalMs: 10, runId: "run-1", phase: "run", signal: abort.signal })
  try {
    const deadline = Date.now() + 2000
    while (!await Bun.file(out).exists() || !(await Bun.file(out).text()).includes("\n")) {
      if (Date.now() >= deadline) throw Error("First sample did not arrive")
      await Bun.sleep(1)
    }
    // Intentionally stall this observer's event loop; no sampler or clock is replaced.
    const stalledUntil = performance.now() + 80
    while (performance.now() < stalledUntil) {}
    while ((await Bun.file(out).text()).split("\n").filter(Boolean).length < 2) {
      if (Date.now() >= deadline) throw Error("Next sample did not arrive")
      await Bun.sleep(1)
    }
    abort.abort()
    const result = await pending
    const rows = (await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows[1].missed_intervals).toBeGreaterThanOrEqual(5)
    expect(rows[1].elapsed_ms - rows[0].elapsed_ms).toBeGreaterThanOrEqual(60)
    expect(rows.map(row => row.sequence)).toEqual(rows.map((_, index) => index + 1))
    expect(result.samples).toBe(rows.length)
  } finally { abort.abort(); await pending.catch(() => {}); await rm(root, { recursive: true, force: true }) }
})

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
