import type { ResourceMetric, ResourceSummarySample } from "./parallel-resource-summary"

export function summarizeResourceRates(samples: readonly ResourceSummarySample[]) {
  if (!samples.length) return []
  const intervals = samples.slice(1).map((sample, index) => ({ sample, previous: samples[index]!,
    valid: [sample.sequence, samples[index]!.sequence].every(value => Number.isSafeInteger(value) && value >= 1) &&
      [sample.elapsed_ms, samples[index]!.elapsed_ms].every(value => Number.isFinite(value) && value >= 0) &&
      sample.sequence === samples[index]!.sequence + 1 && sample.elapsed_ms > samples[index]!.elapsed_ms && sample.missed_intervals === 0 }))
  const values = intervals.map(({ sample, previous, valid }) => {
    if (!valid) return null
    const before = previous.host.cpu?.ticks.slice(0, 8), after = sample.host.cpu?.ticks.slice(0, 8)
    if (!before || !after || before.length !== 8 || after.length !== 8 ||
      [...before, ...after].some(value => !Number.isSafeInteger(value) || value < 0)) return null
    // guest/guest_nice are already included in user/nice. Exclude them from total time.
    const ticks = after.map((value, index) => value - before[index]!)
    if (ticks.some(value => value < 0)) return null
    const total = ticks.reduce((sum, value) => sum + value, 0)
    return Number.isSafeInteger(total) && total > 0 ? (total - ticks[3]! - ticks[4]!) / total * 100 : null
  })
  const containers = new Map(samples.flatMap(sample => (sample.containers ?? []).map(container =>
    [`container:${container.container_id}:${container.inspect?.started_at ?? "unverified"}`, container] as const)))
  const metrics = [{ scope: "host", metric: "cpu.utilization_percent", values }, ...[...containers].map(([scope, target]) => ({ scope, metric: "cpu.cores",
    values: intervals.map(({ sample, previous, valid }) => {
      const before = previous.containers?.find(container => container.container_id === target.container_id && container.inspect?.started_at === target.inspect?.started_at)
      const after = sample.containers?.find(container => container.container_id === target.container_id && container.inspect?.started_at === target.inspect?.started_at)
      if (!valid || !before?.epoch_stable || !after?.epoch_stable || !target.inspect?.started_at ||
        !Number.isSafeInteger(before.cpu?.total_usage_ns) || !Number.isSafeInteger(after.cpu?.total_usage_ns) ||
        Number(before.cpu?.total_usage_ns) < 0 || Number(after.cpu?.total_usage_ns) < Number(before.cpu?.total_usage_ns)) return null
      const first = readCounterTime(previous, before.cpu?.read_at)
      const last = readCounterTime(sample, after.cpu?.read_at)
      if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return null
      return (after.cpu!.total_usage_ns! - before.cpu!.total_usage_ns!) / ((last - first) * 1_000_000)
    }),
  }))]
  return metrics.map((series): ResourceMetric => {
    const observed = series.values.filter((value): value is number => value !== null)
    return { scope: series.scope, metric: series.metric, observed: observed.length, missing: Math.max(1, series.values.length) - observed.length,
      min: observed.length ? Math.min(...observed) : null, peak: observed.length ? Math.max(...observed) : null, delta: null }
  })
}

function readCounterTime(sample: ResourceSummarySample, readAt: string | null | undefined) {
  const time = typeof readAt === "string" ? Date.parse(readAt) : NaN
  const observed = typeof sample.host.observed_at === "string" ? Date.parse(sample.host.observed_at) : NaN
  // Both snapshots occur within this frame; Date timestamps are quantized to milliseconds.
  return Number.isFinite(time) && Number.isFinite(observed) && typeof sample.duration_ms === "number" &&
    Number.isFinite(sample.duration_ms) && sample.duration_ms >= 0 && Math.abs(time - observed) <= Math.ceil(sample.duration_ms) ? time : NaN
}
