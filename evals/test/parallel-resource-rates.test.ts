import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import type { ResourceSummarySample } from "../src/parallel-resource-summary"

// Independent arithmetic control: 100 total ticks, 30 idle and 20 iowait → 50 busy ticks.
test("CPU rates use adjacent counters rather than accumulated CPU time", async () => {
  const samples = [[100, 0, 100, 700, 100, 0, 0, 0, 50, 0], [120, 0, 130, 730, 120, 0, 0, 0, 60, 0]]
    .map((ticks, index) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0, host: { cpu: { ticks }, memory: null } }))
  const before = JSON.stringify(samples)
  const { summarizeResourceRates } = await import("../src/parallel-resource-rates")
  expect(summarizeResourceRates(samples)).toEqual([
    { scope: "host", metric: "cpu.utilization_percent", observed: 1, missing: 0, min: 50, peak: 50, delta: null },
  ])
  expect(JSON.stringify(samples)).toBe(before)
})

test("container CPU rates retain fractional cores and multi-core peaks over measured wall intervals", async () => {
  const id = "a".repeat(64)
  const times = ["2026-10-15T00:00:00Z", "2026-10-15T00:00:01Z", "2026-10-15T00:00:03Z"]
  const samples = [10_000_000_000, 10_500_000_000, 15_500_000_000].map((usage, index) => ({ sequence: index + 1,
    elapsed_ms: [0.5, 1000.5, 3000.5][index]!, missed_intervals: 0, duration_ms: 0, host: { observed_at: times[index]!, cpu: null, memory: null },
    containers: [{ container_id: id, epoch_stable: true, inspect: { started_at: "epoch-a" }, cpu: { total_usage_ns: usage, read_at: times[index]! } }] }))
  const { summarizeResourceRates } = await import("../src/parallel-resource-rates")
  expect(summarizeResourceRates(samples).find(row => row.scope === `container:${id}:epoch-a`))
    .toEqual({ scope: `container:${id}:epoch-a`, metric: "cpu.cores", observed: 2, missing: 0, min: 0.5, peak: 2.5, delta: null })
})

test("CPU rates refuse unverified intervals and counter resets instead of reporting idle CPU", async () => {
  const id = "a".repeat(64)
  const sample = (index: number) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0, duration_ms: 0,
    host: { observed_at: `2026-10-15T00:00:0${index}Z`, cpu: { ticks: [100 + index * 10, 0, 100, 700 + index * 90, 100, 0, 0, 0] }, memory: null },
    containers: [{ container_id: id, epoch_stable: true, inspect: { started_at: "epoch-a" }, cpu: { total_usage_ns: 1_000_000_000 + index * 500_000_000, read_at: `2026-10-15T00:00:0${index}Z` } }] })
  const { summarizeResourceRates } = await import("../src/parallel-resource-rates")
  for (const change of [
    { elapsed_ms: Infinity }, { elapsed_ms: 0 }, { elapsed_ms: -1 }, { sequence: 3 }, { missed_intervals: 1 },
  ]) {
    expect(summarizeResourceRates([sample(0), { ...sample(1), ...change }]).every(row => row.observed === 0 && row.missing === 1 && row.peak === null)).toBe(true)
  }
  const reset = sample(1)
  reset.host.cpu.ticks[4] = 99 // Linux explicitly permits a decreasing iowait counter.
  reset.containers[0]!.cpu.total_usage_ns = 0
  expect(summarizeResourceRates([sample(0), reset]).every(row => row.observed === 0 && row.missing === 1 && row.min === null)).toBe(true)
})

test("container CPU rates never join counters across missing observations or a new epoch", async () => {
  const id = "a".repeat(64)
  const samples = [1_000_000_000, 2_000_000_000, 3_000_000_000].map((usage, index) => ({ sequence: index + 1,
    elapsed_ms: index * 1000, missed_intervals: 0, duration_ms: 0, host: { observed_at: `2026-10-15T00:00:0${index}Z`, cpu: null, memory: null },
    containers: [{ container_id: id, epoch_stable: true, inspect: { started_at: "epoch-a" }, cpu: { total_usage_ns: usage, read_at: `2026-10-15T00:00:0${index}Z` } }] }))
  const { summarizeResourceRates } = await import("../src/parallel-resource-rates")
  const missing = samples.map((sample, index) => index === 1 ? { ...sample, containers: [] } : sample)
  expect(summarizeResourceRates(missing).find(row => row.metric === "cpu.cores"))
    .toMatchObject({ observed: 0, missing: 2, min: null, peak: null })
  const changed = samples.slice(0, 2).map((sample, index) => ({ ...sample,
    containers: sample.containers.map(container => ({ ...container, inspect: { started_at: `epoch-${index}` } })) }))
  expect(summarizeResourceRates(changed).filter(row => row.metric === "cpu.cores").map(row => [row.observed, row.missing])).toEqual([[0, 1], [0, 1]])
  expect(summarizeResourceRates([{ ...samples[0]!, containers: samples[0]!.containers.map(container => ({ ...container, epoch_stable: false })) }, samples[1]!])
    .find(row => row.metric === "cpu.cores")).toMatchObject({ observed: 0, missing: 1 })
  expect(summarizeResourceRates([samples[0]!]).every(row => row.observed === 0 && row.missing === 1)).toBe(true)
  expect(summarizeResourceRates([])).toEqual([])
})


test("CPU rates consume the actual 1000ms sampler's monotonic clock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-cpu-rate-smoke-"))
  const signal = new AbortController()
  try {
    const { collectHostResources, sampleSupervisedResources } = await import("../src/parallel-resources")
    let frames = 0
    const samplesFile = path.join(root, "samples.jsonl")
    await collectHostResources({ out: samplesFile, paths: [], intervalMs: 1000, runId: "cpu-rates", phase: "run", signal: signal.signal,
      processes: async () => {
        const observation = await sampleSupervisedResources()
        if (++frames === 2) signal.abort()
        return observation
      } })
    const samples = (await Bun.file(samplesFile).text()).trim().split("\n").map(line => JSON.parse(line)) as ResourceSummarySample[]
    const { summarizeResourceRates } = await import("../src/parallel-resource-rates")
    expect(samples).toHaveLength(2)
    expect(summarizeResourceRates(samples).find(row => row.scope === "host"))
      .toMatchObject({ observed: 1, missing: 0 })
    const { writeResourceSummary, readResourceEvidence } = await import("../src/parallel-resource-evidence")
    const { writeLeaseReceipt } = await import("../src/lease")
    const receipt = path.join(root, "receipt.json")
    const saved = await writeResourceSummary({ samplesFile, out: receipt })
    const legacy = { ...saved, summary: { ...saved.summary, metrics: saved.summary.metrics.filter(row => !["cpu.utilization_percent", "cpu.cores"].includes(row.metric)) } }
    await writeLeaseReceipt(receipt, legacy)
    const before = await Bun.file(receipt).text()
    const input = { file: receipt, samplesFile, runId: "cpu-rates", phase: "run" as const }
    const read = await readResourceEvidence(input)
    expect(read.receipt.summary.metrics.find(row => row.metric === "cpu.utilization_percent")).toMatchObject({ observed: 1, missing: 0 })
    expect(await Bun.file(receipt).text()).toBe(before)
    await writeLeaseReceipt(receipt, { ...saved, summary: { ...saved.summary, metrics: saved.summary.metrics.map(row =>
      row.metric === "cpu.utilization_percent" ? { ...row, peak: 123 } : row) } })
    await expect(readResourceEvidence(input)).rejects.toThrow("RESOURCE_SUMMARY_MISMATCH")
  } finally { signal.abort(); await rm(root, { recursive: true, force: true }) }
}, 10_000)

test("resource summary exposes CPU rates to the frozen budget gate and preserves a known exceedance over gaps", async () => {
  const samples = [0, 1, 2].map(index => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: index === 2 ? null : { ticks: [100 + index * 50, 0, 100, 700 + index * 50, 100, 0, 0, 0] }, memory: null } }))
  const { summarizeResourceSamples } = await import("../src/parallel-resource-summary")
  const { assessResourceBudget } = await import("../src/parallel-acceptance")
  const summary = summarizeResourceSamples(samples)
  expect(summary.metrics.find(row => row.metric === "cpu.utilization_percent"))
    .toMatchObject({ observed: 1, missing: 1, min: 50, peak: 50 })
  const budget = { version: 1, kind: "parallel-resource-budget", run_id: "cpu-budget", fixed_at: "2026-10-15T00:00:00Z",
    bounds: [{ scope: "host", metric: "cpu.utilization_percent", minimum: null, maximum: 40 }] }
  const input = { runId: "cpu-budget", startedAt: "2026-10-15T00:00:01Z", budget, summary }
  expect(assessResourceBudget(input)).toEqual({ status: "failed", codes: ["RESOURCE_BUDGET_EXCEEDED"] })
  expect(assessResourceBudget({ ...input, budget: { ...budget, bounds: [{ ...budget.bounds[0]!, maximum: 60 }] } }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_OBSERVATIONS_INCOMPLETE"] })
})

test("container CPU rates use the counter's Docker clock instead of collector dispatch timing", async () => {
  const id = "a".repeat(64)
  const samples = [0, 1].map(index => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0, duration_ms: 1500,
    host: { observed_at: `2026-10-15T00:00:0${index}Z`, cpu: null, memory: null }, containers: [{ container_id: id, epoch_stable: true, inspect: { started_at: "epoch-a" },
      cpu: { total_usage_ns: 1_000_000_000 + index * 1_000_000_000, read_at: `2026-10-15T00:00:0${index * 2}.000Z` } }] }))
  const { summarizeResourceRates } = await import("../src/parallel-resource-rates")
  expect(summarizeResourceRates(samples).find(row => row.metric === "cpu.cores"))
    .toMatchObject({ observed: 1, min: 0.5, peak: 0.5 })
})

test("container CPU clocks must belong to their measured frame", async () => {
  const samples = [0, 1].map(index => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0, duration_ms: 10,
    host: { observed_at: `2026-10-15T00:00:0${index}Z`, cpu: null, memory: null },
    containers: [{ container_id: "a".repeat(64), epoch_stable: true, inspect: { started_at: "epoch-a" },
      cpu: { total_usage_ns: 1_000_000_000 + index * 1_000_000_000, read_at: `2026-10-14T00:00:0${index}Z` } }] }))
  const { summarizeResourceRates } = await import("../src/parallel-resource-rates")
  expect(summarizeResourceRates(samples).find(row => row.metric === "cpu.cores"))
    .toMatchObject({ observed: 0, missing: 1, peak: null })
})
