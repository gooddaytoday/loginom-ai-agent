import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { requireAvailableMemory, startRunResourceSampler } from "../src/run-resources"
import { writeLeaseReceipt } from "../src/lease"
import { parallelFixture } from "./helpers/parallel-fixture"

test("host memory admission requires the recorded budget and refuses insufficient available memory", () => {
  const bounds = [{ scope: "host", metric: "memory.available_bytes", minimum: 3 * 1024 ** 3, maximum: null }]
  expect(() => requireAvailableMemory(5 * 1024 ** 3, bounds)).not.toThrow()
  expect(() => requireAvailableMemory(2 * 1024 ** 3, bounds)).toThrow("HOST_MEMORY_BUDGET_INSUFFICIENT")
  expect(() => requireAvailableMemory(null, bounds)).toThrow("HOST_MEMORY_UNAVAILABLE")
  expect(() => requireAvailableMemory(5 * 1024 ** 3, [])).toThrow("HOST_MEMORY_BUDGET_REQUIRED")
})

test("run owns a clean-environment sampler and waits for its final summary even on interruption", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-run-sampler-")), fixture = await parallelFixture(root)
  const slotsFile = path.join(root, "slots.json"), out = path.join(root, "resources.jsonl")
  await writeLeaseReceipt(slotsFile, fixture.slots)
  try {
    const sampler = await startRunResourceSampler({ slotsFile, out, runId: "unit-run" }, {
      PATH: process.env.PATH, HOME: root, TMPDIR: os.tmpdir(), EVAL_SECRET: "private", OPENAI_API_KEY: "private", PRIVATE_OTHER_TOKEN: "private",
    })
    try { throw Error("interrupted run") } catch {} finally { await sampler.stop() }
    await sampler.stop()
    const samples = (await Bun.file(out).text()).trim().split("\n").map(row => JSON.parse(row))
    expect(samples.length).toBeGreaterThan(0)
    expect(samples[0]).toMatchObject({ run_id: "unit-run", phase: "run", interval_ms: 1000, processes: null, containers: null })
    expect(samples[0].host.memory.available_bytes).toBeGreaterThan(0)
    expect((await stat(out)).mode & 0o777).toBe(0o600)
    expect(await Bun.file(`${out}.summary.json`).exists()).toBe(true)
  } finally { await rm(root, { recursive: true }) }
})

test("sampler admission refuses an existing output before mistaking it for a fresh sample", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-sampler-existing-")), fixture = await parallelFixture(root)
  const slotsFile = path.join(root, "slots.json"), out = path.join(root, "resources.jsonl")
  await writeLeaseReceipt(slotsFile, fixture.slots)
  await Bun.write(out, "preserve-existing-sample\n")
  try {
    const result = await startRunResourceSampler({ slotsFile, out, runId: "unit-run" }).then(async sampler => {
      await sampler.stop().catch(() => {})
      return "admitted"
    }, (error: Error) => error.message)
    expect(result).toBe("RESOURCE_OUTPUT_EXISTS")
    expect(await Bun.file(out).text()).toBe("preserve-existing-sample\n")
  } finally { await rm(root, { recursive: true }) }
})
