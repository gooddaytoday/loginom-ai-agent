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
  const [cpu, memory] = await Promise.all([
    readFile("/proc/stat", "utf8").catch(() => undefined), readFile("/proc/meminfo", "utf8").catch(() => undefined),
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
    filesystems,
    errors: [...(hostCpu ? [] : ["HOST_CPU_UNAVAILABLE"]), ...(hostMemory ? [] : ["HOST_MEMORY_UNAVAILABLE"]),
      ...filesystems.flatMap(file => file.error ? [file.error] : [])],
  }
}
