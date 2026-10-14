import { constants } from "node:fs"
import { lstat, open, readFile, readlink, realpath, stat, statfs } from "node:fs/promises"
import path from "node:path"
import { EvalFailure } from "./fail"
import type { SlotFile } from "./slots"
import type { ProcessIdentity, ProcessOwner } from "./process-supervisor"

export async function sampleSupervisedResources() {
  const { supervisedProcesses } = await import("./process-supervisor")
  const snapshot = supervisedProcesses()
  return { ...snapshot, scopes: await Promise.all(snapshot.scopes.map(async scope => ({ ...scope,
    processes: scope.processes ? await Promise.all(scope.processes.map(identity => sampleProcessResources({ identity, owner: scope.owner }))) : null,
  }))) }
}

export async function sampleProcessResources(input: { identity: ProcessIdentity; owner: ProcessOwner }) {
  if (!Number.isSafeInteger(input.identity.pid) || input.identity.pid < 1) throw new EvalFailure("RESOURCE_PROCESS_IDENTITY", 2)
  const before = await resourceProcessView(input.identity.pid).catch(() => undefined)
  const cgroup = before && matchesResourceProcess(before, input.identity) ? await sampleCgroupResources(input.identity.pid) : null
  const after = await resourceProcessView(input.identity.pid).catch(() => undefined)
  const matched = before && after && [before, after].every(current => matchesResourceProcess(current, input.identity))
  const boundCgroup = matched && cgroup?.path && before.cgroup === cgroup.path && after.cgroup === cgroup.path ? cgroup : null
  const cpu = matched && cgroupNumber(before.fields[11]) !== null && cgroupNumber(before.fields[12]) !== null
    ? { user_ticks: cgroupNumber(before.fields[11])!, system_ticks: cgroupNumber(before.fields[12])! } : null
  const rss = matched ? cgroupNumber(before.status.match(/^VmRSS:\s+(\d+) kB$/m)?.[1]) : null
  const rssBytes = rss !== null && Number.isSafeInteger(rss * 1024) ? rss * 1024 : null
  return { owner: input.owner, identity: input.identity, observed_at: new Date().toISOString(), verified: Boolean(matched), cpu, rss_bytes: rssBytes, cgroup: boundCgroup,
    errors: [...(matched ? [] : ["PROCESS_IDENTITY_UNVERIFIED"]), ...(cpu ? [] : ["PROCESS_CPU_UNAVAILABLE"]),
      ...(rssBytes !== null ? [] : ["PROCESS_RSS_UNAVAILABLE"]), ...(boundCgroup ? [] : ["PROCESS_CGROUP_UNVERIFIED"])] }
}

async function resourceProcessView(pid: number) {
  const [raw, status, owner, executable, file, cgroup] = await Promise.all([readFile(`/proc/${pid}/stat`, "utf8"),
    readFile(`/proc/${pid}/status`, "utf8"), stat(`/proc/${pid}`), readlink(`/proc/${pid}/exe`), stat(`/proc/${pid}/exe`),
    readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => undefined)])
  const fields = raw.slice(raw.lastIndexOf(")") + 2).trim().split(/\s+/)
  if (["Z", "X"].includes(fields[0]!)) return undefined
  return { fields, status, starttime: fields[19], uid: owner.uid, group: Number(fields[2]), session: Number(fields[3]),
    executable, device: file.dev, inode: file.ino, cgroup: cgroup?.split("\n").find(line => line.startsWith("0::"))?.slice(3) }
}

function matchesResourceProcess(current: NonNullable<Awaited<ReturnType<typeof resourceProcessView>>>, saved: ProcessIdentity) {
  return current.starttime === saved.starttime && current.uid === saved.uid && current.group === saved.group && current.session === saved.session &&
    current.executable === saved.executable && current.device === saved.device && current.inode === saved.inode
}

export async function loadResourceContainers(file: SlotFile) {
  const { readLeaseReceipt } = await import("./lease")
  const { pairImages } = await import("./parallel-pair")
  const saved = await readLeaseReceipt(path.join(file.controller.stateDir, "pair.json")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("RESOURCE_PAIR_UNVERIFIED", 2)
  })
  if (saved === undefined) return null
  const journal = resourceObject(saved)
  const server = resourceObject(journal.server)
  const images = resourceObject(journal.images)
  const resources = resourceObject(journal.resources)
  const nonce = journal.nonce
  const purpose = journal.purpose
  if (journal.version !== 2 || journal.kind !== "pair-provision" || journal.phase !== "ready" || journal.intent !== undefined ||
    typeof nonce !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(nonce) ||
    purpose !== "acceptance" && purpose !== "research" || resources.server === resources.studio ||
    !Object.entries(file.server).every(([key, value]) => server[key] === value) || images.server !== pairImages.server || images.studio !== pairImages.studio)
    throw new EvalFailure("RESOURCE_PAIR_UNVERIFIED", 2)
  return (["server", "studio"] as const).map(role => {
    const id = resources[role]
    if (typeof id !== "string" || !/^[0-9a-f]{64}$/.test(id)) throw new EvalFailure("RESOURCE_PAIR_UNVERIFIED", 2)
    return { role, id, name: role === "server" ? file.server.container : file.server.studioContainer, image: pairImages[role], nonce, purpose }
  })
}

export async function collectHostResources(input: {
  paths: string[]; out: string; intervalMs: number; runId: string | null; phase: "before" | "run" | "after" | null; signal: AbortSignal
  containers?: NonNullable<Awaited<ReturnType<typeof loadResourceContainers>>> | null
  processes?: typeof sampleSupervisedResources
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
      const [host, containers, processes] = await Promise.all([sampleHostResources(input.paths), input.containers
        ? Promise.all(input.containers.map(sampleBoundContainerResources)) : null, input.processes ? input.processes() : null])
      await handle.writeFile(JSON.stringify({ version: 1, sequence: ++samples, run_id: input.runId, phase: input.phase,
        interval_ms: input.intervalMs, elapsed_ms: observed - started, missed_intervals: missed,
        duration_ms: performance.now() - observed, host, containers, processes }) + "\n")
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

async function sampleBoundContainerResources(target: NonNullable<Awaited<ReturnType<typeof loadResourceContainers>>>[number]) {
  const sample = await sampleContainerResources(target.id)
  if (sample.inspect?.name === `/${target.name}` && sample.inspect.image === target.image &&
    sample.inspect.owner_kind === "users" && sample.inspect.owner_nonce === target.nonce && sample.inspect.purpose === target.purpose)
    return { ...sample, role: target.role }
  return { ...sample, role: target.role, cpu: null, memory: null, pids: null, io: null, raw_stats: null, cgroup: null,
    errors: [...sample.errors, "CONTAINER_IDENTITY_UNVERIFIED"] }
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

export async function sampleCgroupResources(pid = process.pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new EvalFailure("RESOURCE_PROCESS_IDENTITY", 2)
  const raw = (await readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => undefined))
    ?.split("\n").find(line => line.startsWith("0::"))?.slice(3)
  const group = raw && path.posix.isAbsolute(raw) && path.posix.normalize(raw) === raw ? raw : undefined
  const [current, ancestors] = await Promise.all([readCgroupResources(group), group
    ? Promise.all(group.split("/").filter(Boolean).map((_, index, parts) => readCgroupResources("/" + parts.slice(0, -index - 1).join("/")))) : null])
  return { ...current, ancestors }
}

async function readCgroupResources(group?: string) {
  const files = group ? await Promise.all(["cpu.stat", "memory.events", "memory.current", "memory.max", "memory.swap.current", "memory.swap.max", "cpu.max", "cgroup.controllers"]
    .map(name => readFile(path.join("/sys/fs/cgroup", group, name), "utf8").catch(() => undefined))) : []
  const cpu = cgroupCounters(files[0])
  const events = cgroupCounters(files[1])
  const quota = files[6]?.trim().split(/\s+/)
  const sample = {
    path: group ?? null,
    controllers: files[7] !== undefined ? files[7].trim().split(/\s+/).filter(Boolean) : null,
    cpu_max: quota?.length === 2 && (quota[0] === "max" || (cgroupNumber(quota[0]) ?? 0) > 0) && (cgroupNumber(quota[1]) ?? 0) > 0
      ? { quota_usec: quota[0] === "max" ? "max" as const : cgroupNumber(quota[0])!, period_usec: cgroupNumber(quota[1])! } : null,
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
  const inspect = await containerInspection(id).catch(() => null)
  const observedCgroup = inspect?.running && inspect.pid ? await sampleCgroupResources(inspect.pid) : null
  const version = await fetch("http://localhost/version", { unix: "/var/run/docker.sock", signal: AbortSignal.timeout(2000) })
    .then(async response => response.ok ? resourceObject(await response.json()).ApiVersion : undefined).catch(() => undefined)
  const payload = typeof version === "string" && /^1\.\d+$/.test(version)
    ? await fetch(`http://localhost/v${version}/containers/${id}/stats?stream=false&one-shot=true`, { unix: "/var/run/docker.sock", signal: AbortSignal.timeout(2000) })
      .then(async response => {
        if (!response.ok) return undefined
        const raw = await response.text()
        return { raw, data: resourceObject(JSON.parse(raw)) }
      }).catch(() => undefined) : undefined
  const final = await containerInspection(id).catch(() => null)
  const stable = inspect?.running && final?.running && inspect.pid === final.pid && inspect.started_at === final.started_at &&
    inspect.image === final.image && inspect.name === final.name && inspect.owner_nonce === final.owner_nonce &&
    inspect.owner_kind === final.owner_kind && inspect.purpose === final.purpose
  const cgroup = stable && observedCgroup?.path ? observedCgroup : null
  // Engine 1.48 omits id in one-shot stats; the request uses the immutable full ID.
  const matched = payload && (payload.data.id === undefined || payload.data.id === id) ? payload : undefined
  const cpu = resourceObject(matched?.data.cpu_stats)
  const usage = resourceObject(cpu.cpu_usage)
  const memory = resourceObject(matched?.data.memory_stats)
  const pids = resourceObject(matched?.data.pids_stats)
  const io = resourceObject(matched?.data.blkio_stats).io_service_bytes_recursive
  const sample = {
    container_id: id, observed_at: new Date().toISOString(),
    inspect,
    epoch_stable: Boolean(stable), cgroup,
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
  return { ...sample, errors: [...(matched ? [] : ["CONTAINER_STATS_UNAVAILABLE"]), ...(inspect ? [] : ["CONTAINER_INSPECT_UNAVAILABLE"]),
    ...(stable ? [] : ["CONTAINER_EPOCH_UNVERIFIED"]), ...(cgroup ? [] : ["CONTAINER_CGROUP_UNAVAILABLE"]),
    ...["cpu", "memory", "pids", "io"].flatMap(key => sample[key as "cpu" | "memory" | "pids" | "io"] === null ? [`CONTAINER_${key.toUpperCase()}_UNAVAILABLE`] : [])] }
}

async function containerInspection(id: string) {
  // Select metadata in Docker itself so Config.Env never enters collector output or memory.
  const format = `{"id":{{json .Id}},"image":{{json .Image}},"name":{{json .Name}},"started_at":{{json .State.StartedAt}},"running":{{json .State.Running}},"oom_killed":{{json .State.OOMKilled}},"pid":{{json .State.Pid}},"memory_bytes":{{json .HostConfig.Memory}},"memory_swap_bytes":{{json .HostConfig.MemorySwap}},"nano_cpus":{{json .HostConfig.NanoCpus}},"cpu_quota":{{json .HostConfig.CpuQuota}},"cpu_period":{{json .HostConfig.CpuPeriod}},"pids_limit":{{json .HostConfig.PidsLimit}},"owner_kind":{{json (index .Config.Labels "loginom.evals.kind")}},"owner_nonce":{{json (index .Config.Labels "loginom.evals.nonce")}},"purpose":{{json (index .Config.Labels "loginom.evals.purpose")}}}`
  const child = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "inspect", "--format", format, id],
    { env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, stdin: "ignore", stdout: "pipe", stderr: "ignore" })
  const timer = setTimeout(() => child.kill("SIGKILL"), 2000)
  try {
    const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
    if (code !== 0) return null
    const item = resourceObject(JSON.parse(stdout))
    if (item.id !== id || typeof item.image !== "string" || typeof item.name !== "string" || typeof item.started_at !== "string" ||
      typeof item.running !== "boolean" || typeof item.oom_killed !== "boolean") return null
    return { id, image: item.image, name: item.name, started_at: item.started_at, running: item.running, oom_killed: item.oom_killed,
      pid: resourceCounter(item.pid), memory_bytes: resourceCounter(item.memory_bytes), nano_cpus: resourceCounter(item.nano_cpus),
      cpu_period: resourceCounter(item.cpu_period),
      memory_swap_bytes: Number.isSafeInteger(item.memory_swap_bytes) && Number(item.memory_swap_bytes) >= -1 ? Number(item.memory_swap_bytes) : null,
      cpu_quota: Number.isSafeInteger(item.cpu_quota) && Number(item.cpu_quota) >= -1 ? Number(item.cpu_quota) : null,
      pids_limit: Number.isSafeInteger(item.pids_limit) && Number(item.pids_limit) >= -1 ? Number(item.pids_limit) : null,
      owner_kind: typeof item.owner_kind === "string" ? item.owner_kind : null,
      owner_nonce: typeof item.owner_nonce === "string" ? item.owner_nonce : null,
      purpose: typeof item.purpose === "string" ? item.purpose : null }
  } finally { clearTimeout(timer) }
}

function resourceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function resourceCounter(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : null
}
