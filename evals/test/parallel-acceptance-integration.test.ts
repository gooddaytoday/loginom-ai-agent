import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { collectHostResources, sampleContainerResources } from "../src/parallel-resources"
import { pairImages } from "../src/parallel-pair"
import { writeLeaseReceipt } from "../src/lease"
import { superviseProcess } from "../src/process-supervisor"
import { parallelFixture } from "./helpers/parallel-fixture"

test("resource CLI binds both pinned container roles from its private pair fixture journal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-docker-cli-"))
  const nonce = crypto.randomUUID()
  const owned: { id: string; image: string }[] = []
  const abort = new AbortController()
  let cleanupConfirmed = true
  try {
    const fixture = await parallelFixture(root)
    fixture.slots.server.container = `evals-resource-${nonce}-server`
    fixture.slots.server.studioContainer = `evals-resource-${nonce}-studio`
    for (const role of ["server", "studio"] as const) {
      const image = pairImages[role]
      const name = role === "server" ? fixture.slots.server.container : fixture.slots.server.studioContainer
      const created = await Bun.$`docker --host unix:///var/run/docker.sock run --detach --pull=never --name ${name} --label loginom.evals.kind=users --label loginom.evals.nonce=${nonce} --label loginom.evals.purpose=research --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 64m --cpus 0.25 --pids-limit 16 --entrypoint /bin/sh ${image} -c ${"while :; do sleep 1; done"}`.quiet().nothrow()
      expect(created.exitCode).toBe(0)
      const id = created.text().trim()
      expect(id).toMatch(/^[0-9a-f]{64}$/)
      owned.push({ id, image })
    }
    const file = path.join(root, "slots.json")
    const out = path.join(root, "samples.jsonl")
    await writeLeaseReceipt(file, fixture.slots)
    await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "pair.json"), {
      version: 2, kind: "pair-provision", phase: "ready", purpose: "research", nonce, daemonId: crypto.randomUUID(),
      server: fixture.slots.server, images: pairImages, resources: { server: owned[0]!.id, studio: owned[1]!.id },
    })
    cleanupConfirmed = false
    const pending = superviseProcess({ cmd: [process.execPath, path.join(evalsRoot, "script/sample-parallel-resources.ts"),
      "--config", file, "--out", out, "--interval-ms", "100"], cwd: root, env: { PATH: process.env.PATH!, HOME: root },
      timeoutMs: 15_000, signal: abort.signal })
    try {
      const deadline = Date.now() + 10_000
      while (!await Bun.file(out).exists() || (await Bun.file(out).text()).split("\n").filter(Boolean).length < 2) {
        if (Date.now() > deadline) throw Error("CLI container frames did not arrive")
        await Bun.sleep(10)
      }
      abort.abort()
      const run = await pending
      cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
      expect(run.processCleanup.status).toBe("confirmed")
      expect(run.exitCode, run.stderr).toBe(0)
      const rows = (await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line))
      expect(rows.length).toBeGreaterThanOrEqual(2)
      expect(rows[0].containers.map((item: { role: string; container_id: string }) => [item.role, item.container_id]))
        .toEqual([["server", owned[0]!.id], ["studio", owned[1]!.id]])
      expect(rows.every(row => row.containers.every((item: { memory: { current_bytes: number } | null; errors: string[] }) =>
        item.memory !== null && item.memory.current_bytes > 0 && !item.errors.includes("CONTAINER_IDENTITY_UNVERIFIED")))).toBe(true)
    } finally { abort.abort(); await pending }
  } finally {
    for (const item of owned) {
      const current = await Bun.$`docker --host unix:///var/run/docker.sock inspect --format ${'{{.Id}}|{{.Image}}|{{index .Config.Labels "loginom.evals.nonce"}}'} ${item.id}`.quiet().nothrow()
      expect(current.exitCode).toBe(0)
      expect(current.text().trim()).toBe(`${item.id}|${item.image}|${nonce}`)
      expect((await Bun.$`docker --host unix:///var/run/docker.sock rm --force ${item.id}`.quiet().nothrow()).exitCode).toBe(0)
    }
    if (cleanupConfirmed) await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("container resource sampler observes a labelled bounded disposable container without changing its limits", async () => {
  const image = "sha256:d138ce018adb4959282e65f5e5b7fe58265706d6c8c5a432022e4400ca387d1a"
  const nonce = crypto.randomUUID()
  const created = await Bun.$`docker --host unix:///var/run/docker.sock run --detach --pull=never --label evals-resource-owner=${nonce} --label loginom.evals.kind=users --label loginom.evals.nonce=${nonce} --label loginom.evals.purpose=research --env LOGINOM_ADMIN_PASSWORD=collector-private-env-canary --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 64m --cpus 0.25 --pids-limit 16 --entrypoint /bin/sh ${image} -c ${"while :; do sleep 1; done"}`.quiet().nothrow()
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
    expect(sample.inspect?.id).toBe(id)
    expect(sample.inspect?.running).toBe(true)
    expect(sample.inspect?.oom_killed).toBe(false)
    expect(sample.inspect?.memory_bytes).toBe(64 * 1024 * 1024)
    expect(sample.inspect?.nano_cpus).toBe(250_000_000)
    expect(sample.inspect?.pids_limit).toBe(16)
    expect(JSON.stringify(sample)).not.toContain("collector-private-env-canary")
    expect(JSON.parse(sample.raw_stats!).cpu_stats.cpu_usage.total_usage).toBe(sample.cpu?.total_usage_ns)
    expect(sample.io === null ? sample.errors.includes("CONTAINER_IO_UNAVAILABLE") : sample.io.every(item => Number(item.bytes) >= 0)).toBe(true)
    const limits = await Bun.$`docker --host unix:///var/run/docker.sock inspect --format ${"{{.HostConfig.Memory}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}"} ${id}`.quiet().nothrow()
    expect(limits.exitCode).toBe(0)
    expect(limits.text().trim()).toBe("67108864|250000000|16")
    const root = await mkdtemp(path.join(os.tmpdir(), "evals-container-collector-"))
    const out = path.join(root, "samples.jsonl")
    const abort = new AbortController()
    const pending = collectHostResources({ paths: [root], out, intervalMs: 50, runId: "docker-smoke", phase: "run", signal: abort.signal,
      containers: [{ role: "server", id, name: sample.inspect!.name.slice(1), image, nonce, purpose: "research" }] })
    try {
      const deadline = Date.now() + 5000
      while (!await Bun.file(out).exists() || (await Bun.file(out).text()).split("\n").filter(Boolean).length < 2) {
        if (Date.now() > deadline) throw Error("Container frames did not arrive")
        await Bun.sleep(10)
      }
      abort.abort()
      await pending
      const rows = (await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line))
      expect(rows[0].containers).toHaveLength(1)
      expect(rows[0].containers[0].role).toBe("server")
      expect(rows[0].containers[0].container_id).toBe(id)
      expect(rows.every(row => row.containers[0].memory.current_bytes > 0 && row.containers[0].inspect.memory_bytes === 67108864)).toBe(true)
      const rejected = path.join(root, "wrong-owner.jsonl")
      const abortWrong = new AbortController()
      const wrong = collectHostResources({ paths: [root], out: rejected, intervalMs: 50, runId: "docker-smoke", phase: "run", signal: abortWrong.signal,
        containers: [{ role: "server", id, name: sample.inspect!.name.slice(1), image, nonce: crypto.randomUUID(), purpose: "research" }] })
      try {
        while (!await Bun.file(rejected).exists() || !(await Bun.file(rejected).text()).includes("\n")) {
          if (Date.now() > deadline) throw Error("Rejected frame did not arrive")
          await Bun.sleep(10)
        }
        abortWrong.abort()
        await wrong
        const row = JSON.parse((await Bun.file(rejected).text()).trim().split("\n")[0]!)
        expect(row.containers[0].inspect.running).toBe(true)
        expect([row.containers[0].cpu, row.containers[0].memory, row.containers[0].raw_stats]).toEqual([null, null, null])
        expect(row.containers[0].errors).toContain("CONTAINER_IDENTITY_UNVERIFIED")
        expect(JSON.stringify(row)).not.toContain("collector-private-env-canary")
      } finally { abortWrong.abort(); await wrong }
    } finally { abort.abort(); await pending; await rm(root, { recursive: true, force: true }) }
  } finally {
    const owned = await Bun.$`docker --host unix:///var/run/docker.sock inspect --format ${'{{.Id}}|{{.Image}}|{{index .Config.Labels "evals-resource-owner"}}'} ${id}`.quiet().nothrow()
    expect(owned.exitCode).toBe(0)
    expect(owned.text().trim()).toBe(`${id}|${image}|${nonce}`)
    expect((await Bun.$`docker --host unix:///var/run/docker.sock rm --force ${id}`.quiet().nothrow()).exitCode).toBe(0)
  }
  const removed = await sampleContainerResources(id)
  expect([removed.cpu, removed.memory, removed.pids, removed.io, removed.raw_stats]).toEqual([null, null, null, null, null])
  expect(removed.errors).toContain("CONTAINER_STATS_UNAVAILABLE")
  expect(removed.inspect).toBeNull()
  expect(removed.errors).toContain("CONTAINER_INSPECT_UNAVAILABLE")
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
