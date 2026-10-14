type ResourceSummarySample = {
  sequence: number
  elapsed_ms: number
  missed_intervals: number
  host: {
    filesystems?: { path: string; capacity: { available_bytes?: number; total_bytes?: number; available_inodes?: number; total_inodes?: number } | null }[]
    cpu: { ticks: number[] } | null
    memory: { available_bytes?: number; total_bytes?: number; swap_free_bytes?: number; swap_total_bytes?: number } | null
  }
}

export function summarizeResourceSamples(samples: readonly ResourceSummarySample[]) {
  const metrics = [
    ...[...new Set(samples.flatMap(sample => sample.host.filesystems?.map(file => file.path) ?? []))].flatMap(path =>
      (["available_bytes", "total_bytes", "available_inodes", "total_inodes"] as const).map(name => ({
        scope: `filesystem:${path}`, metric: name, values: samples.map(sample => sample.host.filesystems?.find(file => file.path === path)?.capacity?.[name] ?? null),
      }))),
    ...(["available_bytes", "total_bytes", "swap_free_bytes", "swap_total_bytes"] as const).map(name => ({
      scope: "host", metric: `memory.${name}`, values: samples.map(sample => sample.host.memory?.[name] ?? null),
    })),
    ...Array.from({ length: Math.max(10, ...samples.map(sample => sample.host.cpu?.ticks.length ?? 0)) }, (_, index) => ({
      scope: "host", metric: `cpu.ticks.${index}`, values: samples.map(sample => sample.host.cpu?.ticks[index] ?? null),
    })),
  ]
  return {
    samples: samples.length,
    missed_intervals: samples.reduce((sum, sample) => sum + sample.missed_intervals, 0),
    max_gap_ms: samples.length > 1 ? Math.max(...samples.slice(1).map((sample, index) => sample.elapsed_ms - samples[index]!.elapsed_ms)) : null,
    metrics: samples.length ? metrics.map(series => {
      const observed = series.values.filter((value): value is number => value !== null && Number.isSafeInteger(value) && value >= 0)
      const counter = series.scope === "host" && series.metric.startsWith("cpu.ticks.")
      const resets = counter ? observed.slice(1).filter((value, index) => value < observed[index]!).length : 0
      return { scope: series.scope, metric: series.metric, observed: observed.length, missing: samples.length - observed.length,
        min: observed.length ? Math.min(...observed) : null, peak: observed.length ? Math.max(...observed) : null,
        delta: observed.length > 1 && !resets ? observed.at(-1)! - observed[0]! : null,
        ...(counter ? { counter_resets: resets } : {}) }
    }) : [],
  }
}
