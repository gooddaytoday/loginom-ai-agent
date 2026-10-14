import { readFile, statfs } from "node:fs/promises"

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
