import { constants } from "node:fs"
import { lstat, open, readFile, realpath, statfs } from "node:fs/promises"
import path from "node:path"
import { EvalFailure } from "./fail"

export async function collectHostResources(input: {
  paths: string[]; out: string; intervalMs: number; runId: string | null; phase: "before" | "run" | "after" | null; signal: AbortSignal
}) {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs <= 0) throw new EvalFailure("RESOURCE_INTERVAL", 2)
  const directory = path.dirname(input.out)
  const info = await lstat(directory).catch(() => { throw new EvalFailure("RESOURCE_OUTPUT_PRIVATE", 2) })
  if (!path.isAbsolute(input.out) || input.out !== path.resolve(input.out) || !info.isDirectory() ||
    info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700 || await realpath(directory) !== directory)
    throw new EvalFailure("RESOURCE_OUTPUT_PRIVATE", 2)
  const handle = await open(input.out, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    .catch(() => { throw new EvalFailure("RESOURCE_OUTPUT_PRIVATE", 2) })
  const started = performance.now()
  let samples = 0, next = started
  try {
    const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { await parent.sync() } finally { await parent.close() }
    while (!input.signal.aborted) {
      const observed = performance.now()
      const missed = Math.max(0, Math.floor((observed - next) / input.intervalMs))
      const host = await sampleHostResources(input.paths)
      await handle.writeFile(JSON.stringify({ version: 1, sequence: ++samples, run_id: input.runId, phase: input.phase,
        interval_ms: input.intervalMs, elapsed_ms: observed - started, missed_intervals: missed,
        duration_ms: performance.now() - observed, host }) + "\n")
      await handle.sync()
      next += (missed + 1) * input.intervalMs
      await new Promise<void>(resolve => {
        const cancel = () => { clearTimeout(timer); input.signal.removeEventListener("abort", cancel); resolve() }
        const timer = setTimeout(cancel, Math.max(0, next - performance.now()))
        input.signal.addEventListener("abort", cancel, { once: true })
        if (input.signal.aborted) cancel()
      })
    }
    return { samples }
  } finally { await handle.close() }
}

export async function sampleHostResources(paths: string[]) {
  const [cpu, memory, collectorCgroup] = await Promise.all([
    readFile("/proc/stat", "utf8").catch(() => undefined), readFile("/proc/meminfo", "utf8").catch(() => undefined),
    sampleCgroupResources(),
  ])
  const ticks = cpu?.split("\n")[0]!.trim().split(/\s+/).slice(1).map(Number)
  const hostCpu = ticks && /^cpu\s+/.test(cpu ?? "") && ticks.length >= 8 && ticks.every(value => Number.isSafeInteger(value) && value >= 0)
    ? { ticks } : null
  const fields = new Map([...(memory ?? "").matchAll(/^(MemTotal|MemAvailable|SwapTotal|SwapFree):\s+(\d+) kB$/gm)]
    .map(match => [match[1]!, Number(match[2]) * 1024]))
  const hostMemory = ["MemTotal", "MemAvailable", "SwapTotal", "SwapFree"].every(key => Number.isSafeInteger(fields.get(key)) && Number(fields.get(key)) >= 0)
    ? { total_bytes: fields.get("MemTotal")!, available_bytes: fields.get("MemAvailable")!,
      swap_total_bytes: fields.get("SwapTotal")!, swap_free_bytes: fields.get("SwapFree")! } : null
  const filesystems = await Promise.all(paths.map(async file => {
    const info = await statfs(file).catch(() => undefined)
    return { path: file, capacity: info ? { total_bytes: info.blocks * info.bsize, available_bytes: info.bavail * info.bsize,
      total_inodes: info.files, available_inodes: info.ffree } : null, error: info ? null : "FILESYSTEM_UNAVAILABLE" }
  }))
  return {
    observed_at: new Date().toISOString(),
    cpu: hostCpu,
    memory: hostMemory,
    collector_cgroup: collectorCgroup,
    filesystems,
    errors: [...(hostCpu ? [] : ["HOST_CPU_UNAVAILABLE"]), ...(hostMemory ? [] : ["HOST_MEMORY_UNAVAILABLE"]),
      ...filesystems.flatMap(file => file.error ? [file.error] : [])],
  }
}

export async function sampleCgroupResources() {
  const group = (await readFile("/proc/self/cgroup", "utf8").catch(() => undefined))
    ?.split("\n").find(line => line.startsWith("0::"))?.slice(3)
  const files = group ? await Promise.all(["cpu.stat", "memory.events", "memory.current", "memory.max", "memory.swap.current", "memory.swap.max"]
    .map(name => readFile(path.join("/sys/fs/cgroup", group, name), "utf8").catch(() => undefined))) : []
  const cpu = cgroupCounters(files[0])
  const events = cgroupCounters(files[1])
  const sample = {
    path: group ?? null,
    cpu_usage: ["usage_usec", "user_usec", "system_usec"].every(key => Number.isSafeInteger(cpu.get(key)))
      ? { usage_usec: cpu.get("usage_usec")!, user_usec: cpu.get("user_usec")!, system_usec: cpu.get("system_usec")! } : null,
    cpu_throttling: ["nr_periods", "nr_throttled", "throttled_usec"].every(key => Number.isSafeInteger(cpu.get(key)))
      ? { nr_periods: cpu.get("nr_periods")!, nr_throttled: cpu.get("nr_throttled")!, throttled_usec: cpu.get("throttled_usec")! } : null,
    memory_events: ["oom", "oom_kill"].every(key => Number.isSafeInteger(events.get(key)))
      ? { oom: events.get("oom")!, oom_kill: events.get("oom_kill")! } : null,
    memory_current_bytes: cgroupNumber(files[2]),
    memory_limit_bytes: files[3]?.trim() === "max" ? "max" : cgroupNumber(files[3]),
    swap_current_bytes: cgroupNumber(files[4]),
    swap_limit_bytes: files[5]?.trim() === "max" ? "max" : cgroupNumber(files[5]),
  }
  return { ...sample, errors: Object.entries(sample).flatMap(([key, value]) => value === null ? [`CGROUP_${key.toUpperCase()}_UNAVAILABLE`] : []) }
}

function cgroupCounters(value?: string) {
  return new Map([...(value ?? "").matchAll(/^(\S+)\s+(\d+)$/gm)].flatMap(match => {
    const parsed = cgroupNumber(match[2])
    return parsed === null ? [] : [[match[1]!, parsed] as const]
  }))
}

function cgroupNumber(value?: string) {
  if (!value || !/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) return null
  return Number(value)
}

export async function sampleContainerResources(id: string) {
  if (!/^[0-9a-f]{64}$/.test(id)) throw new EvalFailure("RESOURCE_CONTAINER_ID", 2)
  const version = await fetch("http://localhost/version", { unix: "/var/run/docker.sock", signal: AbortSignal.timeout(2000) })
    .then(async response => response.ok ? resourceObject(await response.json()).ApiVersion : undefined).catch(() => undefined)
  const payload = typeof version === "string" && /^1\.\d+$/.test(version)
    ? await fetch(`http://localhost/v${version}/containers/${id}/stats?stream=false&one-shot=true`, { unix: "/var/run/docker.sock", signal: AbortSignal.timeout(2000) })
      .then(async response => {
        if (!response.ok) return undefined
        const raw = await response.text()
        return { raw, data: resourceObject(JSON.parse(raw)) }
      }).catch(() => undefined) : undefined
  // Engine 1.48 omits id in one-shot stats; the request uses the immutable full ID.
  const matched = payload && (payload.data.id === undefined || payload.data.id === id) ? payload : undefined
  const cpu = resourceObject(matched?.data.cpu_stats)
  const usage = resourceObject(cpu.cpu_usage)
  const memory = resourceObject(matched?.data.memory_stats)
  const pids = resourceObject(matched?.data.pids_stats)
  const io = resourceObject(matched?.data.blkio_stats).io_service_bytes_recursive
  const sample = {
    container_id: id, observed_at: new Date().toISOString(),
    cpu: resourceCounter(usage.total_usage) !== null ? { total_usage_ns: resourceCounter(usage.total_usage),
      system_cpu_usage_ns: resourceCounter(cpu.system_cpu_usage), online_cpus: resourceCounter(cpu.online_cpus) } : null,
    memory: resourceCounter(memory.usage) !== null && resourceCounter(memory.limit) !== null
      ? { current_bytes: resourceCounter(memory.usage), limit_bytes: resourceCounter(memory.limit) } : null,
    pids: resourceCounter(pids.current) !== null ? { current: resourceCounter(pids.current) } : null,
    io: Array.isArray(io) && io.length && io.every(entry => {
      const item = resourceObject(entry)
      return typeof item.op === "string" && resourceCounter(item.major) !== null && resourceCounter(item.minor) !== null && resourceCounter(item.value) !== null
    }) ? io.map(entry => { const item = resourceObject(entry); return { major: item.major, minor: item.minor, op: item.op, bytes: item.value } }) : null,
    // Preserve API bytes as well as the projection; large nanosecond counters exceed JS safe integers.
    raw_stats: matched?.raw ?? null,
  }
  return { ...sample, errors: [...(matched ? [] : ["CONTAINER_STATS_UNAVAILABLE"]),
    ...["cpu", "memory", "pids", "io"].flatMap(key => sample[key as "cpu" | "memory" | "pids" | "io"] === null ? [`CONTAINER_${key.toUpperCase()}_UNAVAILABLE`] : [])] }
}

function resourceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function resourceCounter(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : null
}
