import { expect, test } from "bun:test"
import { summarizeResourceSamples } from "../src/parallel-resource-summary"

test("resource summary credits server filesystem counters only for the matching container epoch", () => {
  const id = "a".repeat(64)
  const inspect = { id, image: "observed-image", name: "/server", started_at: "first-epoch", pid: 100,
    running: true, owner_kind: "users", owner_nonce: "observed-nonce", purpose: "research" }
  const samples = [800, 9999, 600].map((available, index) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: null, memory: null }, containers: [{ container_id: id, epoch_stable: true, inspect,
      storage: { container_id: id, epoch_stable: true, inspect: { ...inspect, started_at: index === 1 ? "second-epoch" : inspect.started_at },
        filesystems: [
          { path: "/workdir/UserStorage", capacity: { total_bytes: 10000, available_bytes: available, total_inodes: 100, available_inodes: 50 - index * 10 } },
          { path: "/workdir/SessionBackup", capacity: { total_bytes: 10000, available_bytes: 1000, total_inodes: 100, available_inodes: 80 } },
        ] },
    }] }))
  const before = JSON.stringify(samples), summary = summarizeResourceSamples(samples)
  expect(summary.metrics.find(series => series.scope === `container:${id}:first-epoch:filesystem:/workdir/UserStorage` && series.metric === "available_bytes"))
    .toMatchObject({ observed: 2, missing: 1, min: 600, peak: 800, delta: -200 })
  expect(summary.metrics.find(series => series.scope === `container:${id}:first-epoch:filesystem:/workdir/UserStorage` && series.metric === "available_inodes"))
    .toMatchObject({ observed: 2, missing: 1, min: 30, peak: 50, delta: -20 })
  expect(summary.metrics.find(series => series.scope === `container:${id}:first-epoch:filesystem:/workdir/SessionBackup` && series.metric === "available_inodes"))
    .toMatchObject({ observed: 2, missing: 1, min: 80, peak: 80, delta: 0 })
  expect(JSON.stringify(samples)).toBe(before)
})

test("resource summary cannot credit storage when its independent identity is incomplete", () => {
  const id = "a".repeat(64)
  const inspect = { id, image: "observed-image", name: "/server", started_at: "first-epoch", pid: 100,
    running: true, owner_kind: "users", owner_nonce: "observed-nonce", purpose: "research" }
  const samples = [0, 1].map(index => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: null, memory: null }, containers: [{ container_id: id, epoch_stable: true, inspect,
      storage: { container_id: id, epoch_stable: true, inspect: { ...inspect, pid: undefined },
        filesystems: [{ path: "/workdir/UserStorage", capacity: { available_bytes: 1000, total_bytes: 2000, available_inodes: 10, total_inodes: 20 } }] },
    }] }))
  expect(summarizeResourceSamples(samples).metrics.find(series => series.scope === `container:${id}:first-epoch:filesystem:/workdir/UserStorage` && series.metric === "available_bytes"))
    .toMatchObject({ observed: 0, missing: 2, min: null, peak: null, delta: null })
})

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

test("resource summary separates container epochs and excludes counters without stable epoch proof", () => {
  const container = (epoch: string, verified: boolean, memory: number, cpu: number) => ({
    container_id: "a".repeat(64), epoch_stable: verified, inspect: { started_at: epoch },
    cpu: { total_usage_ns: cpu }, memory: { current_bytes: memory, limit_bytes: 1000 }, pids: { current: 2 },
  })
  const samples = [container("first", true, 100, 10), container("first", false, 999, 999),
    container("first", true, 300, 30), container("replacement", true, 20, 2)].map((entry, index) => ({
    sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: null, memory: null }, containers: [entry],
  }))
  const summary = summarizeResourceSamples(samples)
  expect(summary.metrics.find(item => item.scope === `container:${"a".repeat(64)}:first` && item.metric === "memory.current_bytes"))
    .toMatchObject({ observed: 2, missing: 1, min: 100, peak: 300, delta: 200 })
  expect(summary.metrics.find(item => item.scope === `container:${"a".repeat(64)}:first` && item.metric === "cpu.total_usage_ns"))
    .toMatchObject({ observed: 2, missing: 1, min: 10, peak: 30, delta: 20, counter_resets: 0 })
  expect(summary.metrics.find(item => item.scope === `container:${"a".repeat(64)}:replacement` && item.metric === "memory.current_bytes"))
    .toMatchObject({ observed: 1, missing: 0, min: 20, peak: 20, delta: null })
})

test("resource summary keeps process births separate and excludes unverified RSS and CPU", () => {
  const owned = (birth: string, verified: boolean, rss: number, ticks: number) => ({
    producer_pid: 500, scopes: [{ owner: { kind: "slot", id: "a" }, status: "observed" as const,
      processes: [{ identity: { pid: 12, starttime: birth }, verified, rss_bytes: rss, cpu: { user_ticks: ticks, system_ticks: 1 } }] }],
  })
  const samples = [owned("101", true, 100, 10), owned("101", false, 999, 999), owned("101", true, 200, 30),
    owned("102", true, 20, 2)].map((processes, index) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
      host: { cpu: null, memory: null }, processes }))
  const summary = summarizeResourceSamples(samples)
  expect(summary.metrics.find(item => item.scope === "process:500:slot:a:12:101" && item.metric === "rss_bytes"))
    .toMatchObject({ observed: 2, missing: 1, min: 100, peak: 200, delta: 100 })
  expect(summary.metrics.find(item => item.scope === "process:500:slot:a:12:101" && item.metric === "cpu.user_ticks"))
    .toMatchObject({ observed: 2, missing: 1, delta: 20, counter_resets: 0 })
  expect(summary.metrics.find(item => item.scope === "process:500:slot:a:12:102" && item.metric === "rss_bytes"))
    .toMatchObject({ observed: 1, missing: 0, min: 20, peak: 20, delta: null })
})

test("resource summary keeps shared ancestor cgroups separate and records OOM and throttling deltas", () => {
  const samples = [0, 1].map(index => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: null, memory: null, collector_cgroup: {
      path: "/app/collector", memory_current_bytes: 100 + index * 20, memory_events: { oom: index, oom_kill: 0 },
      cpu_usage: { usage_usec: 10 + index * 5 }, cpu_throttling: { nr_throttled: index, throttled_usec: index * 30 },
      ancestors: [{ path: "/app", memory_current_bytes: 1000 + index * 100, memory_events: { oom: 4, oom_kill: 2 },
        cpu_usage: { usage_usec: 2000 + index * 500 } }],
    } },
  }))
  const summary = summarizeResourceSamples(samples)
  expect(summary.metrics.find(item => item.scope === "cgroup:collector:/app/collector" && item.metric === "memory_events.oom"))
    .toMatchObject({ observed: 2, missing: 0, delta: 1, counter_resets: 0 })
  expect(summary.metrics.find(item => item.scope === "cgroup:collector:/app/collector" && item.metric === "cpu_throttling.throttled_usec"))
    .toMatchObject({ observed: 2, missing: 0, delta: 30, counter_resets: 0 })
  expect(summary.metrics.find(item => item.scope === "cgroup:collector:/app" && item.metric === "memory_current_bytes"))
    .toMatchObject({ min: 1000, peak: 1100, delta: 100 })
  expect(summary.metrics.find(item => item.scope === "cgroup:collector:/app/collector" && item.metric === "memory_current_bytes"))
    .toMatchObject({ min: 100, peak: 120, delta: 20 })
})

test("resource summary binds container IO and owner cgroups to the verified epoch and process birth", () => {
  const samples = [0, 1].map(index => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: null, memory: null }, containers: [{ container_id: "a".repeat(64), epoch_stable: true, inspect: { started_at: "first" },
      io: [{ major: 8, minor: 0, op: "Write", bytes: 100 + index * 50 }],
      cgroup: { path: "/docker/a", memory_events: { oom: 0, oom_kill: index } },
    }], processes: { producer_pid: 500, scopes: [{ owner: { kind: "judge", id: "a" }, status: "observed" as const,
      processes: [{ identity: { pid: 12, starttime: "101" }, verified: true, rss_bytes: 20, cpu: null,
        cgroup: { path: "/app", cpu_usage: { usage_usec: 500 + index * 40 } } }],
    }] },
  }))
  const summary = summarizeResourceSamples(samples)
  expect(summary.metrics.find(item => item.scope === `container:${"a".repeat(64)}:first:io:8:0:Write` && item.metric === "bytes"))
    .toMatchObject({ min: 100, peak: 150, delta: 50, counter_resets: 0 })
  expect(summary.metrics.find(item => item.scope === `cgroup:container:${"a".repeat(64)}:first:/docker/a` && item.metric === "memory_events.oom_kill"))
    .toMatchObject({ delta: 1, counter_resets: 0 })
  expect(summary.metrics.find(item => item.scope === "cgroup:process:500:judge:a:12:101:/app" && item.metric === "cpu_usage.usage_usec"))
    .toMatchObject({ delta: 40, counter_resets: 0 })
})

test("resource summary counts a missing frame inside a known container epoch rather than hiding the observation gap", () => {
  const containers = [{ container_id: "a".repeat(64), epoch_stable: true, inspect: { started_at: "first" },
    memory: { current_bytes: 100, limit_bytes: 1000 } }]
  const summary = summarizeResourceSamples([containers, null, containers].map((observed, index) => ({
    sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0, host: { cpu: null, memory: null }, containers: observed,
  })))
  expect(summary.metrics.find(item => item.scope === `container:${"a".repeat(64)}:first` && item.metric === "memory.current_bytes"))
    .toMatchObject({ observed: 2, missing: 1, min: 100, peak: 100, delta: 0 })
})
