type SummaryCgroup = {
  path: string | null
  memory_current_bytes?: number | null
  swap_current_bytes?: number | null
  memory_events?: { oom?: number; oom_kill?: number } | null
  cpu_usage?: { usage_usec?: number; user_usec?: number; system_usec?: number } | null
  cpu_throttling?: { nr_periods?: number; nr_throttled?: number; throttled_usec?: number } | null
  ancestors?: SummaryCgroup[] | null
}

type ResourceSummarySample = {
  sequence: number
  elapsed_ms: number
  missed_intervals: number
  processes?: { producer_pid: number; scopes: {
    owner: { kind: string; id: string }; status: "observed" | "unavailable"
    processes: { identity: { pid: number; starttime: string }; verified: boolean; rss_bytes: number | null; cgroup?: SummaryCgroup | null
      cpu: { user_ticks: number; system_ticks: number } | null }[] | null
  }[] } | null
  containers?: {
    container_id: string; epoch_stable: boolean; inspect: { started_at: string } | null; cgroup?: SummaryCgroup | null
    io?: { major: unknown; minor: unknown; op: unknown; bytes: unknown }[] | null
    cpu?: { total_usage_ns: number | null; system_cpu_usage_ns?: number | null; online_cpus?: number | null } | null
    memory?: { current_bytes: number | null; limit_bytes: number | null } | null
    pids?: { current: number | null } | null
  }[] | null
  host: {
    collector_cgroup?: SummaryCgroup | null
    filesystems?: { path: string; capacity: { available_bytes?: number; total_bytes?: number; available_inodes?: number; total_inodes?: number } | null }[]
    cpu: { ticks: number[] } | null
    memory: { available_bytes?: number; total_bytes?: number; swap_free_bytes?: number; swap_total_bytes?: number } | null
  }
}

export function summarizeResourceSamples(samples: readonly ResourceSummarySample[]) {
  const metrics = [
    ...scopedMetrics(samples, sample => [
      ...cgroupRows("collector", sample.host.collector_cgroup),
      ...(sample.containers ?? []).flatMap(container => cgroupRows(`container:${container.container_id}:${container.inspect?.started_at ?? "unverified"}`,
        container.cgroup, container.epoch_stable)),
      ...(sample.processes?.scopes ?? []).flatMap(scope => (scope.processes ?? []).flatMap(process =>
        cgroupRows(processScope(sample.processes!.producer_pid, scope.owner, process.identity), process.cgroup, scope.status === "observed" && process.verified))),
    ]),
    ...scopedMetrics(samples, sample => (sample.containers ?? []).flatMap(container => (container.io ?? []).map(entry => ({
      scope: `container:${container.container_id}:${container.inspect?.started_at ?? "unverified"}:io:${entry.major}:${entry.minor}:${entry.op}`,
      values: { bytes: container.epoch_stable && typeof entry.bytes === "number" ? entry.bytes : null },
    })))),
    ...scopedMetrics(samples, sample => sample.processes?.scopes.flatMap(scope => (scope.processes ?? []).map(process => ({
      scope: processScope(sample.processes!.producer_pid, scope.owner, process.identity),
      values: {
        rss_bytes: scope.status === "observed" && process.verified ? process.rss_bytes : null,
        "cpu.user_ticks": scope.status === "observed" && process.verified ? process.cpu?.user_ticks ?? null : null,
        "cpu.system_ticks": scope.status === "observed" && process.verified ? process.cpu?.system_ticks ?? null : null,
      },
    }))) ?? []),
    ...scopedMetrics(samples, sample => (sample.containers ?? []).map(container => ({
      scope: `container:${container.container_id}:${container.inspect?.started_at ?? "unverified"}`,
      values: {
        "cpu.total_usage_ns": container.epoch_stable ? container.cpu?.total_usage_ns ?? null : null,
        "cpu.system_cpu_usage_ns": container.epoch_stable ? container.cpu?.system_cpu_usage_ns ?? null : null,
        "cpu.online_cpus": container.epoch_stable ? container.cpu?.online_cpus ?? null : null,
        "memory.current_bytes": container.epoch_stable ? container.memory?.current_bytes ?? null : null,
        "memory.limit_bytes": container.epoch_stable ? container.memory?.limit_bytes ?? null : null,
        "pids.current": container.epoch_stable ? container.pids?.current ?? null : null,
      },
    }))),
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
      const counter = ["cpu.ticks.", "cpu_usage.", "cpu_throttling.", "memory_events."].some(prefix => series.metric.startsWith(prefix)) || series.metric === "bytes" && series.scope.startsWith("container:") || ["cpu.total_usage_ns", "cpu.system_cpu_usage_ns", "cpu.user_ticks", "cpu.system_ticks"].includes(series.metric)
      const resets = counter ? observed.slice(1).filter((value, index) => value < observed[index]!).length : 0
      return { scope: series.scope, metric: series.metric, observed: observed.length, missing: series.values.length - observed.length,
        min: observed.length ? Math.min(...observed) : null, peak: observed.length ? Math.max(...observed) : null,
        delta: observed.length > 1 && !resets ? observed.at(-1)! - observed[0]! : null,
        ...(counter ? { counter_resets: resets } : {}) }
    }) : [],
  }
}

function scopedMetrics(samples: readonly ResourceSummarySample[], select: (sample: ResourceSummarySample) => { scope: string; values: Record<string, number | null> }[]) {
  const rows = samples.flatMap((sample, frame) => select(sample).map(row => ({ ...row, frame })))
  return [...new Set(rows.map(row => row.scope))].flatMap(scope => {
    const owned = rows.filter(row => row.scope === scope)
    const frames = new Map(owned.map(row => [row.frame, row.values]))
    const first = owned[0]!.frame, last = owned.at(-1)!.frame
    return Object.keys(owned[0]!.values).map(metric => ({ scope, metric,
      values: Array.from({ length: last - first + 1 }, (_, index) => frames.get(first + index)?.[metric] ?? null) }))
  })
}

function cgroupRows(scope: string, group?: SummaryCgroup | null, verified = true) {
  return group ? [group, ...(group.ancestors ?? [])].map(entry => {
    const values = {
      memory_current_bytes: entry.memory_current_bytes ?? null,
      swap_current_bytes: entry.swap_current_bytes ?? null,
      "memory_events.oom": entry.memory_events?.oom ?? null,
      "memory_events.oom_kill": entry.memory_events?.oom_kill ?? null,
      "cpu_usage.usage_usec": entry.cpu_usage?.usage_usec ?? null,
      "cpu_usage.user_usec": entry.cpu_usage?.user_usec ?? null,
      "cpu_usage.system_usec": entry.cpu_usage?.system_usec ?? null,
      "cpu_throttling.nr_periods": entry.cpu_throttling?.nr_periods ?? null,
      "cpu_throttling.nr_throttled": entry.cpu_throttling?.nr_throttled ?? null,
      "cpu_throttling.throttled_usec": entry.cpu_throttling?.throttled_usec ?? null,
    }
    return { scope: `cgroup:${scope}:${entry.path ?? "unverified"}`,
      values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, verified && entry.path ? value : null])) }
  }) : []
}

function processScope(producer: number, owner: { kind: string; id: string }, identity: { pid: number; starttime: string }) {
  return `process:${producer}:${encodeURIComponent(owner.kind)}:${encodeURIComponent(owner.id)}:${identity.pid}:${identity.starttime}`
}
