import { expect, test } from "bun:test"
import { summarizeResourceSamples } from "../src/parallel-resource-summary"

// Deliberately redacted observations exercise the receipt reducer, without OS mocks.
test("resource summary preserves host peaks, minima, deltas and unavailable measurements", () => {
  const samples = [
    { sequence: 1, elapsed_ms: 0, missed_intervals: 0, host: { memory: { available_bytes: 900, swap_free_bytes: 100 }, cpu: { ticks: [10, 0, 5, 20] } } },
    { sequence: 2, elapsed_ms: 1000, missed_intervals: 1, host: { memory: null, cpu: null } },
    { sequence: 3, elapsed_ms: 3000, missed_intervals: 0, host: { memory: { available_bytes: 500, swap_free_bytes: 70 }, cpu: { ticks: [30, 0, 15, 40] } } },
  ]
  const before = JSON.stringify(samples)
  const summary = summarizeResourceSamples(samples)
  expect(summary).toMatchObject({ samples: 3, missed_intervals: 1, max_gap_ms: 2000 })
  expect(summary.metrics.find(item => item.scope === "host" && item.metric === "memory.available_bytes"))
    .toEqual({ scope: "host", metric: "memory.available_bytes", observed: 2, missing: 1, min: 500, peak: 900, delta: -400 })
  expect(summary.metrics.find(item => item.scope === "host" && item.metric === "cpu.ticks.0"))
    .toMatchObject({ observed: 2, missing: 1, min: 10, peak: 30, delta: 20 })
  expect(JSON.stringify(samples)).toBe(before)
  const absent = summarizeResourceSamples([{ sequence: 1, elapsed_ms: 0, missed_intervals: 0, host: { memory: null, cpu: null } }])
  expect(absent.metrics.find(item => item.scope === "host" && item.metric === "memory.available_bytes"))
    .toMatchObject({ observed: 0, missing: 1, min: null, peak: null, delta: null })
  expect(summarizeResourceSamples([])).toMatchObject({ samples: 0, missed_intervals: 0, max_gap_ms: null, metrics: [] })
})

test("resource summary keeps each filesystem separate and does not replace failed capacity reads with zero", () => {
  const samples = [
    { sequence: 1, elapsed_ms: 0, missed_intervals: 0, host: { cpu: null, memory: null, filesystems: [
      { path: "/storage", capacity: { available_bytes: 800, available_inodes: 20 } },
      { path: "/archives", capacity: { available_bytes: 400, available_inodes: 30 } },
    ] } },
    { sequence: 2, elapsed_ms: 1000, missed_intervals: 0, host: { cpu: null, memory: null, filesystems: [
      { path: "/storage", capacity: null },
      { path: "/archives", capacity: { available_bytes: 300, available_inodes: 25 } },
    ] } },
    { sequence: 3, elapsed_ms: 2000, missed_intervals: 0, host: { cpu: null, memory: null, filesystems: [
      { path: "/storage", capacity: { available_bytes: 600, available_inodes: 18 } },
      { path: "/archives", capacity: { available_bytes: 200, available_inodes: 23 } },
    ] } },
  ]
  const summary = summarizeResourceSamples(samples)
  expect(summary.metrics.find(item => item.scope === "filesystem:/storage" && item.metric === "available_bytes"))
    .toMatchObject({ observed: 2, missing: 1, min: 600, peak: 800, delta: -200 })
  expect(summary.metrics.find(item => item.scope === "filesystem:/archives" && item.metric === "available_inodes"))
    .toMatchObject({ observed: 3, missing: 0, min: 23, peak: 30, delta: -7 })
})

test("resource summary marks a cumulative CPU counter reset instead of reporting a negative usage delta", () => {
  const summary = summarizeResourceSamples([100, 120, 5, 15].map((ticks, index) => ({
    sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: { ticks: [ticks] }, memory: null },
  })))
  expect(summary.metrics.find(item => item.scope === "host" && item.metric === "cpu.ticks.0"))
    .toMatchObject({ observed: 4, missing: 0, min: 5, peak: 120, delta: null, counter_resets: 1 })
})
