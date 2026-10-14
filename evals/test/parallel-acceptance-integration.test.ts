import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { chmod, mkdtemp, readlink, rm, stat, writeFile } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { collectHostResources, sampleCgroupResources, sampleContainerResources, sampleServerFilesystems } from "../src/parallel-resources"
import { pairImages } from "../src/parallel-pair"
import { assessCgroupCoverage, assessResourceTimeline, checkResourceEvidence } from "../src/parallel-acceptance"
import { freezeResourceBudget, writeResourceSummary } from "../src/parallel-resource-evidence"
import { writeLeaseReceipt } from "../src/lease"
import { superviseProcess } from "../src/process-supervisor"
import { parallelFixture } from "./helpers/parallel-fixture"

test("server filesystem sampling binds private container storage and preserves its contents", async () => {
  const image = pairImages.server, nonce = crypto.randomUUID(), name = `evals-storage-${nonce}`
  const created = await Bun.$`docker --host unix:///var/run/docker.sock run --detach --pull=never --name ${name} --label loginom.evals.kind=users --label loginom.evals.nonce=${nonce} --label loginom.evals.purpose=research --env LOGINOM_ADMIN_PASSWORD=storage-private-env-canary --network none --read-only --tmpfs /workdir:size=16m --cap-drop ALL --security-opt no-new-privileges --memory 64m --cpus 0.25 --pids-limit 16 --entrypoint /bin/sh ${image} -c ${"mkdir -p /workdir/UserStorage /workdir/SessionBackup; printf 'storage-content-canary' > /workdir/UserStorage/sentinel; exec sleep 600"}`.quiet().nothrow()
  expect(created.exitCode).toBe(0)
  const id = created.text().trim()
  expect(id).toMatch(/^[0-9a-f]{64}$/)
  try {
    const deadline = Date.now() + 5000
    while ((await Bun.$`docker --host unix:///var/run/docker.sock exec ${id} test -f /workdir/UserStorage/sentinel`.quiet().nothrow()).exitCode !== 0) {
      if (Date.now() > deadline) throw Error("Storage fixture did not initialize")
      await Bun.sleep(10)
    }
    const before = await Bun.$`docker --host unix:///var/run/docker.sock exec ${id} sha256sum /workdir/UserStorage/sentinel`.quiet().nothrow()
    expect(before.exitCode).toBe(0)
    const sample = await sampleServerFilesystems({ role: "server", id, name, image, nonce, purpose: "research" })
    expect(sample).toMatchObject({ container_id: id, epoch_stable: true, errors: [] })
    expect(sample.filesystems.map(file => file.path)).toEqual(["/workdir/UserStorage", "/workdir/SessionBackup"])
    for (const file of sample.filesystems) {
      expect(file.capacity?.total_bytes).toBe(16 * 1024 * 1024)
      expect(file.capacity?.available_bytes).toBeGreaterThan(0)
      expect(file.capacity?.available_bytes).toBeLessThanOrEqual(file.capacity!.total_bytes)
      expect(file.capacity?.available_inodes).toBeGreaterThan(0)
      expect(file.capacity?.available_inodes).toBeLessThanOrEqual(file.capacity!.total_inodes)
    }
    expect(JSON.stringify(sample)).not.toContain("storage-private-env-canary")
    const after = await Bun.$`docker --host unix:///var/run/docker.sock exec ${id} sha256sum /workdir/UserStorage/sentinel`.quiet().nothrow()
    expect(after.exitCode).toBe(0)
    expect(after.text()).toBe(before.text())
    const root = await mkdtemp(path.join(os.tmpdir(), "evals-server-filesystem-frames-")), out = path.join(root, "samples.jsonl")
    const abort = new AbortController()
    const pending = collectHostResources({ paths: [root], out, intervalMs: 1000, runId: "storage-frames", phase: "run", signal: abort.signal,
      containers: [{ role: "server", id, name, image, nonce, purpose: "research" }] })
    try {
      const framesDeadline = Date.now() + 5000
      while (!await Bun.file(out).exists() || !(await Bun.file(out).text()).includes("\n")) {
        if (Date.now() > framesDeadline) throw Error("Storage frame did not arrive")
        await Bun.sleep(10)
      }
      abort.abort()
      await pending
      const rows = (await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line))
      expect(rows[0].containers[0].storage?.container_id).toBe(id)
      expect(rows[0].containers[0].storage?.epoch_stable).toBe(true)
      expect(rows[0].containers[0].storage?.filesystems[0].capacity.total_bytes).toBe(16 * 1024 * 1024)
      expect(JSON.stringify(rows)).not.toContain("storage-private-env-canary")
      expect((await writeResourceSummary({ samplesFile: out, out: path.join(root, "summary.json") })).summary.samples).toBe(rows.length)
      const corrupted = path.join(root, "corrupted.jsonl"), rejected = path.join(root, "rejected-summary.json")
      const storage = rows[0].containers[0].storage
      await writeFile(corrupted, JSON.stringify({ ...rows[0], containers: [{ ...rows[0].containers[0], storage: { ...storage,
        filesystems: storage.filesystems.map((file: typeof sample.filesystems[number]) => ({ ...file, capacity: { ...file.capacity, available_bytes: "malformed-counter-canary" } })) } }] }) + "\n", { mode: 0o600 })
      await expect(writeResourceSummary({ samplesFile: corrupted, out: rejected })).rejects.toThrow("RESOURCE_SAMPLES_INVALID")
      expect(await Bun.file(rejected).exists()).toBe(false)
      for (const [index, change] of [{ epoch_stable: "true" }, { container_id: "short-id" },
        { inspect: { ...storage.inspect, pid: "malformed-counter-canary" } }, { filesystems: "malformed-filesystem-canary" }].entries()) {
        const source = path.join(root, `bad-storage-${index}.jsonl`), summary = path.join(root, `bad-storage-${index}.json`)
        await writeFile(source, JSON.stringify({ ...rows[0], containers: [{ ...rows[0].containers[0], storage: { ...storage, ...change } }] }) + "\n", { mode: 0o600 })
        await expect(writeResourceSummary({ samplesFile: source, out: summary })).rejects.toThrow("RESOURCE_SAMPLES_INVALID")
        expect(await Bun.file(summary).exists()).toBe(false)
      }
    } finally { abort.abort(); await pending; await rm(root, { recursive: true, force: true }) }
    expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${id} rmdir /workdir/SessionBackup`.quiet().nothrow()).exitCode).toBe(0)
    const partial = await sampleServerFilesystems({ role: "server", id, name, image, nonce, purpose: "research" })
    expect(partial.epoch_stable).toBe(true)
    expect(partial.filesystems[0]!.capacity?.total_bytes).toBe(16 * 1024 * 1024)
    expect(partial.filesystems[1]!.capacity).toBeNull()
    expect(partial.errors).toContain("SERVER_FILESYSTEM_UNAVAILABLE")
    const refused = await sampleServerFilesystems({ role: "server", id, name, image, nonce: crypto.randomUUID(), purpose: "research" })
    expect(refused.epoch_stable).toBe(false)
    expect(refused.filesystems.every(file => file.capacity === null)).toBe(true)
    expect(refused.errors).toContain("SERVER_STORAGE_IDENTITY_UNVERIFIED")
    await expect(sampleServerFilesystems({ role: "studio", id, name, image, nonce, purpose: "research" })).rejects.toThrow("RESOURCE_STORAGE_TARGET")
    await expect(sampleServerFilesystems({ role: "server", id: id.slice(0, 12), name, image, nonce, purpose: "research" })).rejects.toThrow("RESOURCE_STORAGE_TARGET")
  } finally {
    const owned = await Bun.$`docker --host unix:///var/run/docker.sock inspect --format ${'{{.Id}}|{{.Image}}|{{index .Config.Labels "loginom.evals.nonce"}}'} ${id}`.quiet().nothrow()
    expect(owned.exitCode).toBe(0)
    expect(owned.text().trim()).toBe(`${id}|${image}|${nonce}`)
    expect((await Bun.$`docker --host unix:///var/run/docker.sock rm --force --volumes ${id}`.quiet().nothrow()).exitCode).toBe(0)
  }
}, 15000)

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
    expect(sample.epoch_stable).toBe(true)
    const membership = (await Bun.file(`/proc/${sample.inspect!.pid}/cgroup`).text()).split("\n").find(line => line.startsWith("0::"))!.slice(3)
    expect(sample.cgroup?.path).toBe(membership)
    expect(sample.cgroup?.memory_limit_bytes).toBe(64 * 1024 * 1024)
    expect(Number(sample.cgroup?.cpu_max?.quota_usec) / Number(sample.cgroup?.cpu_max?.period_usec)).toBe(0.25)
    expect(sample.cgroup?.memory_events?.oom_kill).toBeGreaterThanOrEqual(0)
    expect(sample.cgroup?.cpu_throttling?.nr_throttled).toBeGreaterThanOrEqual(0)
    const hostView = (await sampleCgroupResources()).view!
    expect(assessCgroupCoverage({ groups: [sample.cgroup], view: hostView })).toEqual({ status: "passed", codes: [] })
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

      expect((await writeResourceSummary({ samplesFile: out, out: path.join(root, "control-summary.json") })).summary.samples).toBe(rows.length)
      for (const [index, change] of [{ epoch_stable: "true" },
        { memory: { current_bytes: "malformed-counter-canary", limit_bytes: 67108864 } },
        { io: [{ major: 8, minor: 0, op: "Write", bytes: "malformed-counter-canary" }] },
        { inspect: { ...rows[0].containers[0].inspect, running: "true" } },
        { inspect: { ...rows[0].containers[0].inspect, pid: "malformed-counter-canary" } },
        { inspect: { ...rows[0].containers[0].inspect, memory_bytes: "malformed-counter-canary" } }].entries()) {
        const samplesFile = path.join(root, `malformed-${index}.jsonl`), summary = path.join(root, `malformed-${index}.json`)
        await writeFile(samplesFile, JSON.stringify({ ...rows[0], containers: [{ ...rows[0].containers[0], ...change }] }) + "\n", { mode: 0o600 })
        await expect(writeResourceSummary({ samplesFile, out: summary })).rejects.toThrow("RESOURCE_SAMPLES_INVALID")
        expect(await Bun.file(summary).exists()).toBe(false)
      }
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
        expect([row.containers[0].cpu, row.containers[0].memory, row.containers[0].raw_stats, row.containers[0].cgroup]).toEqual([null, null, null, null])
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
  expect(removed.cgroup).toBeNull()
  expect(removed.epoch_stable).toBe(false)
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

test.skipIf(!Bun.which("bwrap"))("cgroup sampler preserves an unavailable ancestor quota without substituting an unlimited budget", async () => {
  const baseline = await sampleCgroupResources()
  const target = baseline.ancestors?.find(ancestor => ancestor.cpu_max !== null)
  expect(target?.cpu_max).not.toBeNull()
  expect(target).toBeDefined()
  const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc",
    "--dev", "/dev", "--ro-bind", "/dev/null", path.join("/sys/fs/cgroup", target!.path!, "cpu.max"),
    "--chdir", evalsRoot, process.execPath, "-e", `
import {sampleCgroupResources} from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
console.log(JSON.stringify(await sampleCgroupResources()))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const sample = JSON.parse(stdout)
  const ancestor = sample.ancestors.find((item: { path: string }) => item.path === target!.path)
  expect(ancestor.cpu_max).toBeNull()
  expect(ancestor.errors).toContain("CGROUP_CPU_MAX_UNAVAILABLE")
  expect(sample.memory_current_bytes).toBeGreaterThan(0)
}, 10_000)


test.skipIf(!Bun.which("bwrap"))("cgroup sampler keeps unreadable controller availability unknown in its private namespace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-cgroup-controllers-"))
  const file = path.join(root, "unreadable")
  try {
    await writeFile(file, "cpu memory", { mode: 0o600 })
    await chmod(file, 0o000)
    const group = (await Bun.file("/proc/self/cgroup").text()).split("\n").find(line => line.startsWith("0::"))!.slice(3)
    const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev",
      "--ro-bind", file, path.join("/sys/fs/cgroup", group, "cgroup.controllers"), "--chdir", evalsRoot, process.execPath, "-e", `
import { sampleCgroupResources } from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
console.log(JSON.stringify(await sampleCgroupResources()))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    const sample = JSON.parse(stdout)
    expect(sample.path).toBe(group)
    expect(sample.controllers).toBeNull()
    expect(sample.errors).toContain("CGROUP_CONTROLLERS_UNAVAILABLE")
    expect(sample.cpu_usage.usage_usec).toBeGreaterThan(0)
  } finally { await chmod(file, 0o600); await rm(root, { recursive: true, force: true }) }
})

test.skipIf(!Bun.which("bwrap"))("cgroup sampler refuses a namespaced proc path whose inherited sysfs view belongs to another scope", async () => {
  const parent = await readlink("/proc/self/ns/cgroup")
  const group = (await Bun.file("/proc/self/cgroup").text()).split("\n").find(line => line.startsWith("0::"))!.slice(3)
  const hierarchy = await stat("/sys/fs/cgroup"), local = await stat(path.join("/sys/fs/cgroup", group))
  const expectedView = { namespace: parent, root: { device: hierarchy.dev, inode: hierarchy.ino } }
  const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-cgroup", "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev",
    "--chdir", evalsRoot, process.execPath, "-e", `
import { readlink } from "node:fs/promises"
import { sampleCgroupResources } from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
console.log(JSON.stringify({ namespace: await readlink("/proc/self/ns/cgroup"), proc: await Bun.file("/proc/self/cgroup").text(), sample: await sampleCgroupResources() }))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const observed = JSON.parse(stdout)
  expect(observed.namespace).not.toBe(parent)
  expect(observed.proc.trim()).toBe("0::/")
  expect(observed.sample.path).toBeNull()
  expect(observed.sample.cpu_usage).toBeNull()
  expect(observed.sample.ancestors).toBeNull()
  expect(observed.sample.errors).toContain("CGROUP_MEMBERSHIP_UNVERIFIED")
  expect(observed.sample.view).toEqual({ namespace: observed.namespace, root: { device: hierarchy.dev, inode: hierarchy.ino } })
  const aligned = Bun.spawn([Bun.which("bwrap")!, "--unshare-cgroup", "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev",
    "--ro-bind", path.join("/sys/fs/cgroup", group), "/sys/fs/cgroup", "--chdir", evalsRoot, process.execPath, "-e", `
import { sampleCgroupResources } from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
console.log(JSON.stringify(await sampleCgroupResources()))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
  const [alignedOut, alignedError, alignedCode] = await Promise.all([new Response(aligned.stdout).text(), new Response(aligned.stderr).text(), aligned.exited])
  expect({ code: alignedCode, stderr: alignedError }).toEqual({ code: 0, stderr: "" })
  const sample = JSON.parse(alignedOut)
  expect(sample.path).toBe("/")
  expect(sample.cpu_usage.usage_usec).toBeGreaterThan(0)
  expect(sample.errors).not.toContain("CGROUP_MEMBERSHIP_UNVERIFIED")
  expect(sample.view.root).toEqual({ device: local.dev, inode: local.ino })
  expect(sample.view.root).not.toEqual({ device: hierarchy.dev, inode: hierarchy.ino })
  expect(sample.view.namespace).not.toBe(parent)
  expect(assessCgroupCoverage({ groups: [sample], view: expectedView })).toEqual({ status: "failed", codes: ["CGROUP_VIEW_MISMATCH"] })
  expect(assessCgroupCoverage({ groups: [observed.sample], view: expectedView })).toEqual({ status: "failed", codes: ["CGROUP_VIEW_MISMATCH"] })

})

test.skipIf(!Bun.which("bwrap"))("cgroup sampler refuses an owned process that exits while its counter read is blocked", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-cgroup-exit-"))
  const fifo = path.join(root, "blocked-counter")
  try {
    const created = Bun.spawn(["mkfifo", "-m", "600", fifo], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
    expect(await created.exited).toBe(0)
    const group = (await Bun.file("/proc/self/cgroup").text()).split("\n").find(line => line.startsWith("0::"))!.slice(3)
    const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev",
      "--ro-bind", fifo, path.join("/sys/fs/cgroup", group, "cpu.stat"), "--chdir", evalsRoot, process.execPath, "-e", `
import { writeFile } from "node:fs/promises"
import { sampleCgroupResources } from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
const owned = Bun.spawn([process.execPath, "-e", "await Bun.sleep(750)"], { env: { PATH: "/usr/bin:/bin" }, stdout: "ignore", stderr: "ignore" })
const pending = sampleCgroupResources(owned.pid)
await owned.exited
// The private FIFO delays sampling until the real child is reaped; these values must be refused.
await writeFile(${JSON.stringify(fifo)}, "usage_usec 10\\nuser_usec 5\\nsystem_usec 5\\n")
console.log(JSON.stringify(await pending))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000)
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]).finally(() => clearTimeout(timer))
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    const sample = JSON.parse(stdout)
    expect(sample.path).toBeNull()
    expect(sample.cpu_usage).toBeNull()
    expect(sample.ancestors).toBeNull()
    expect(sample.errors).toContain("CGROUP_MEMBERSHIP_UNVERIFIED")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 10000)


test("resource timeline covers an actual owned command through confirmed cleanup at one-second cadence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-timeline-"))
  const samplesFile = path.join(root, "samples.jsonl"), abort = new AbortController()
  const budget = await freezeResourceBudget({ out: path.join(root, "budget.json"), runId: "timeline-smoke",
    bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: 1, maximum: null }] })
  const exceeded = await freezeResourceBudget({ out: path.join(root, "exceeded-budget.json"), runId: "timeline-smoke",
    bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: null, maximum: 0 }] })
  const collecting = collectHostResources({ paths: [root], out: samplesFile, intervalMs: 1000, runId: "timeline-smoke", phase: "run", signal: abort.signal })
  try {
    const deadline = Date.now() + 5000
    while (!await Bun.file(samplesFile).exists() || !(await Bun.file(samplesFile).text()).includes("\n")) {
      if (Date.now() > deadline) throw Error("Timeline collector did not start")
      await Bun.sleep(10)
    }
    while (Date.now() <= Date.parse(exceeded.budget.fixed_at)) await Bun.sleep(1)
    const startedAt = new Date().toISOString()
    const owned = await superviseProcess({ cmd: [process.execPath, "-e", "await Bun.sleep(100)"], cwd: root,
      env: { PATH: process.env.PATH! }, timeoutMs: 3000, owner: { kind: "command", id: "timeline-smoke" } })
    expect(owned.processCleanup.status).toBe("confirmed")
    const finishedAt = new Date().toISOString()
    while ((await Bun.file(samplesFile).text()).trim().split("\n").map(line => JSON.parse(line)).at(-1).host.observed_at < finishedAt) {
      if (Date.now() > deadline) throw Error("Timeline cleanup sample did not arrive")
      await Bun.sleep(10)
    }
    abort.abort()
    await collecting
    const samples = (await Bun.file(samplesFile).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(assessResourceTimeline({ samples, intervalMs: 1000, startedAt, finishedAt })).toEqual({ status: "passed", codes: [] })
    expect(samples.length).toBeGreaterThanOrEqual(2)
    expect(samples.every(sample => sample.missed_intervals === 0)).toBe(true)
    const receipt = await writeResourceSummary({ samplesFile, out: path.join(root, "summary.json") })
    const request = { file: path.join(root, "summary.json"), samplesFile, runId: "timeline-smoke",
      startedAt, finishedAt, coverage: { paths: [root], containers: [], owners: [] }, view: samples[0].host.collector_cgroup.view, budget: budget.source }
    const result = await checkResourceEvidence(request)
    expect(result).toMatchObject({ status: "passed", codes: [], source: receipt.source, budget_source: budget.source })
    expect(Object.keys(result.checks)).toEqual(["timeline", "coverage", "cgroups", "budget", "incidents"])
    expect(await checkResourceEvidence({ ...request, budget: null })).toMatchObject({ status: "incomplete", codes: ["RESOURCE_BUDGET_MISSING"] })
    expect(await checkResourceEvidence({ ...request, finishedAt: new Date(Date.parse(finishedAt) + 10000).toISOString(),
      budget: exceeded.source }))
      .toMatchObject({ status: "failed", codes: ["RESOURCE_TIMELINE_UNBRACKETED", "RESOURCE_BUDGET_EXCEEDED"] })
    await expect(checkResourceEvidence({ ...request, runId: "other-run" })).rejects.toThrow("RESOURCE_RECEIPT_CONTEXT_MISMATCH")
    const budgetBytes = await Bun.file(budget.source.file).text()
    await writeFile(budget.source.file, budgetBytes + "\n")
    await expect(checkResourceEvidence(request)).rejects.toThrow("RESOURCE_SOURCE_HASH_MISMATCH")
    await writeFile(budget.source.file, budgetBytes)
    await writeFile(samplesFile, (await Bun.file(samplesFile).text()) + "\n")
    await expect(checkResourceEvidence(request)).rejects.toThrow("RESOURCE_SOURCE_HASH_MISMATCH")
    expect(await Bun.file(path.join(root, "summary.json")).json()).toEqual(receipt)
  } finally { abort.abort(); await collecting; await rm(root, { recursive: true, force: true }) }
}, 10000)
