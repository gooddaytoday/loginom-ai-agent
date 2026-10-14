import { expect, test } from "bun:test"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { sampleContainerResources } from "../src/parallel-resources"

test("container resource sampler observes a labelled bounded disposable container without changing its limits", async () => {
  const image = "sha256:d138ce018adb4959282e65f5e5b7fe58265706d6c8c5a432022e4400ca387d1a"
  const nonce = crypto.randomUUID()
  const created = await Bun.$`docker --host unix:///var/run/docker.sock run --detach --pull=never --label evals-resource-owner=${nonce} --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 64m --cpus 0.25 --pids-limit 16 --entrypoint /bin/sh ${image} -c ${"while :; do sleep 1; done"}`.quiet().nothrow()
  expect(created.exitCode).toBe(0)
  const id = created.text().trim()
  expect(id).toMatch(/^[0-9a-f]{64}$/)
  try {
    const sample = await sampleContainerResources(id)
    expect(sample.container_id).toBe(id)
    expect(sample.errors, JSON.stringify({ hasRawStats: sample.raw_stats !== null })).not.toContain("CONTAINER_STATS_UNAVAILABLE")
    expect(sample.cpu?.total_usage_ns).toBeGreaterThan(0)
    expect(sample.memory?.current_bytes).toBeGreaterThan(0)
    expect(sample.memory?.limit_bytes).toBe(64 * 1024 * 1024)
    expect(sample.pids?.current).toBeGreaterThan(0)
    expect(sample.pids?.current).toBeLessThanOrEqual(16)
    expect(JSON.parse(sample.raw_stats!).cpu_stats.cpu_usage.total_usage).toBe(sample.cpu?.total_usage_ns)
    expect(sample.io === null ? sample.errors.includes("CONTAINER_IO_UNAVAILABLE") : sample.io.every(item => Number(item.bytes) >= 0)).toBe(true)
    const limits = await Bun.$`docker --host unix:///var/run/docker.sock inspect --format ${"{{.HostConfig.Memory}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}"} ${id}`.quiet().nothrow()
    expect(limits.exitCode).toBe(0)
    expect(limits.text().trim()).toBe("67108864|250000000|16")
  } finally {
    const owned = await Bun.$`docker --host unix:///var/run/docker.sock inspect --format ${'{{.Id}}|{{.Image}}|{{index .Config.Labels "evals-resource-owner"}}'} ${id}`.quiet().nothrow()
    expect(owned.exitCode).toBe(0)
    expect(owned.text().trim()).toBe(`${id}|${image}|${nonce}`)
    expect((await Bun.$`docker --host unix:///var/run/docker.sock rm --force ${id}`.quiet().nothrow()).exitCode).toBe(0)
  }
  const removed = await sampleContainerResources(id)
  expect([removed.cpu, removed.memory, removed.pids, removed.io, removed.raw_stats]).toEqual([null, null, null, null, null])
  expect(removed.errors).toContain("CONTAINER_STATS_UNAVAILABLE")
}, 15_000)

test.skipIf(!Bun.which("bwrap"))("host sampler marks unavailable proc measurements in its private mount namespace", async () => {
  const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc",
    "--dev", "/dev", "--ro-bind", "/dev/null", "/proc/stat", "--ro-bind", "/dev/null", "/proc/meminfo",
    "--chdir", evalsRoot, process.execPath, "-e", `
import { sampleHostResources } from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
console.log(JSON.stringify(await sampleHostResources([${JSON.stringify(evalsRoot)}])))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const sample = JSON.parse(stdout)
  expect(sample.cpu).toBeNull()
  expect(sample.memory).toBeNull()
  expect(sample.errors).toEqual(["HOST_CPU_UNAVAILABLE", "HOST_MEMORY_UNAVAILABLE"])
  expect(sample.filesystems[0].capacity.available_bytes).toBeGreaterThan(0)
}, 10_000)

test.skipIf(!Bun.which("bwrap"))("cgroup sampler keeps unavailable memory and OOM counters unknown in its private namespace", async () => {
  const group = (await Bun.file("/proc/self/cgroup").text()).split("\n").find(line => line.startsWith("0::"))!.slice(3)
  const root = path.join("/sys/fs/cgroup", group)
  const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc",
    "--dev", "/dev", "--ro-bind", "/dev/null", path.join(root, "memory.current"),
    "--ro-bind", "/dev/null", path.join(root, "memory.events"), "--chdir", evalsRoot, process.execPath, "-e", `
import { sampleCgroupResources } from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
console.log(JSON.stringify(await sampleCgroupResources()))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const sample = JSON.parse(stdout)
  expect(sample.memory_current_bytes).toBeNull()
  expect(sample.memory_events).toBeNull()
  expect(sample.errors).toContain("CGROUP_MEMORY_CURRENT_BYTES_UNAVAILABLE")
  expect(sample.errors).toContain("CGROUP_MEMORY_EVENTS_UNAVAILABLE")
  expect(sample.cpu_usage.usage_usec).toBeGreaterThan(0)
}, 10_000)
