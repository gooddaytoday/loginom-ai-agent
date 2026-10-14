import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readlink, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { collectHostResources, sampleHostResources, sampleProcessResources, sampleSupervisedResources } from "../src/parallel-resources"
import { assessProcessResourceTimeline, assessResourceCoverage } from "../src/parallel-acceptance"
import { superviseProcess } from "../src/process-supervisor"

test("resource sampling observes two admitted supervisors and retains B after draining A", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-owned-"))
  const owners = [{ kind: "slot" as const, id: crypto.randomUUID() }, { kind: "judge" as const, id: crypto.randomUUID() }]
  const streams = owners.map(() => new TransformStream())
  const readers = streams.map(stream => stream.readable.getReader())
  const aborts = owners.map(() => new AbortController())
  const pending = owners.map((owner, index) => superviseProcess({ cmd: [process.execPath, "-e", "console.log('ready'); await Bun.sleep(120000)"],
    cwd: root, env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, timeoutMs: 15_000,
    stdout: streams[index]!.writable, signal: aborts[index]!.signal, owner }))
  try {
    await Promise.all(readers.map(reader => reader.read()))
    const deadline = Date.now() + 5000
    let sample = await sampleSupervisedResources()
    while (!owners.every(owner => sample.scopes.some(scope => scope.owner.id === owner.id && scope.status === "observed" && (scope.processes?.length ?? 0) >= 2))) {
      if (Date.now() > deadline) throw Error("Admitted resource scopes did not arrive")
      await Bun.sleep(10)
      sample = await sampleSupervisedResources()
    }
    expect(sample.producer_pid).toBe(process.pid)
    for (const owner of owners) {
      const scope = sample.scopes.find(scope => scope.owner.id === owner.id)!
      expect(scope.owner).toEqual(owner)
      expect(scope.processes?.every(item => item.verified && item.rss_bytes! > 0 && item.cpu !== null)).toBe(true)
    }

    const frame = { host: await sampleHostResources([root]), containers: null, processes: sample }
    const expected = owners.map(owner => ({ ...owner, launcher: sample.scopes.find(scope => scope.owner.id === owner.id)!.launcher }))
    const coverage = { samples: [frame], paths: [root], containers: [], owners: expected }
    expect(assessResourceCoverage(coverage)).toEqual({ status: "passed", codes: [] })
    expect(assessResourceCoverage({ ...coverage, samples: [{ ...frame, processes: null }] }))
      .toEqual({ status: "incomplete", codes: ["PROCESS_RESOURCE_COVERAGE_INCOMPLETE"] })
    expect(assessResourceCoverage({ ...coverage, owners: [{ ...expected[0]!, launcher: { ...expected[0]!.launcher, starttime: "unobserved" } }] }))
      .toEqual({ status: "incomplete", codes: ["PROCESS_RESOURCE_COVERAGE_INCOMPLETE"] })
    // Public observations must not expose mutable identity records used by signaling.
    sample.scopes.find(scope => scope.owner.id === owners[0]!.id)!.processes![0]!.identity.starttime = "changed"
    expect((await sampleSupervisedResources()).scopes.find(scope => scope.owner.id === owners[0]!.id)?.processes?.every(item => item.verified)).toBe(true)
    const out = path.join(root, "resources.jsonl")
    const abortCollector = new AbortController()
    const collecting = collectHostResources({ paths: [root], out, intervalMs: 1000, runId: "owned-process-smoke", phase: "run",
      signal: abortCollector.signal, processes: sampleSupervisedResources })
    try {
      const collectorDeadline = Date.now() + 8000
      while (!await Bun.file(out).exists() || !(await Bun.file(out).text()).includes("\n")) {
        if (Date.now() > collectorDeadline) throw Error("Owned process frames did not arrive")
        await Bun.sleep(10)
      }
      const startedAt = new Date().toISOString()
      while ((await Bun.file(out).text()).split("\n").filter(Boolean).length < 2) {
        if (Date.now() > collectorDeadline) throw Error("Owned process frames did not arrive")
        await Bun.sleep(10)
      }
      const finishedAt = new Date().toISOString()
      while ((await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line)).at(-1).host.observed_at < finishedAt) {
        if (Date.now() > collectorDeadline) throw Error("Owned process bracket frame did not arrive")
        await Bun.sleep(10)
      }
      abortCollector.abort()
      await collecting
      const rows = (await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line))
      expect(rows[0].processes.producer_pid).toBe(process.pid)
      expect(owners.every(owner => rows.every(row => row.processes.scopes.some((scope: { owner: { id: string }; processes: { verified: boolean; rss_bytes: number }[] | null }) =>
        scope.owner.id === owner.id && scope.processes?.every(item => item.verified && item.rss_bytes > 0))))).toBe(true)
      // This measured active subwindow does not claim a durable launch-to-exit receipt.
      expect(assessProcessResourceTimeline({ samples: rows, intervalMs: 1000,
        owners: expected.map(owner => ({ ...owner, startedAt, finishedAt })) })).toEqual({ status: "passed", codes: [] })
    } finally { abortCollector.abort(); await collecting }
    aborts[0]!.abort()
    while (!(await readers[0]!.read()).done) {}
    expect((await pending[0]!).processCleanup.status).toBe("confirmed")
    const after = await sampleSupervisedResources()
    expect(after.scopes.some(scope => scope.owner.id === owners[0]!.id)).toBe(false)
    expect(after.scopes.find(scope => scope.owner.id === owners[1]!.id)?.processes?.every(item => item.verified && item.rss_bytes! > 0)).toBe(true)
    const afterFrame = { ...frame, processes: after }
    expect(assessResourceCoverage({ ...coverage, samples: [afterFrame], owners: [expected[1]!] })).toEqual({ status: "passed", codes: [] })
    expect(assessResourceCoverage({ ...coverage, samples: [afterFrame] }))
      .toEqual({ status: "incomplete", codes: ["PROCESS_RESOURCE_COVERAGE_INCOMPLETE"] })

  } finally {
    aborts.forEach(abort => abort.abort())
    await Promise.all(readers.map(async reader => { while (!(await reader.read()).done) {} }))
    const results = await Promise.all(pending)
    readers.forEach(reader => reader.releaseLock())
    if (results.every(result => result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete)) await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("a supervisor with failed evidence persistence publishes an unavailable resource scope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-proof-failure-"))
  const owner = { kind: "command" as const, id: crypto.randomUUID() }
  let settled = false
  try {
    await mkdir(path.join(root, "process-cleanup.json"))
    const run = await superviseProcess({ cmd: [process.execPath, "-e", "await Bun.sleep(100)"], cwd: root,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, timeoutMs: 5000, outDir: root, owner })
    settled = run.processCleanup.capture_complete && run.processCleanup.error === "Process evidence persistence failed" &&
      run.processCleanup.verification?.length === 2 && run.processCleanup.verification.every(pass => pass.owned_remaining === 0) && !run.processCleanup.unknownProcesses?.length
    expect(run.processCleanup.status).toBe("failed")
    expect(run.processCleanup.error).toBe("Process evidence persistence failed")
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
    const scope = (await sampleSupervisedResources()).scopes.find(scope => scope.owner.id === owner.id)
    expect(scope?.status).toBe("unavailable")
    expect(scope?.processes).toBeNull()
  } finally { if (settled) await rm(root, { recursive: true, force: true }) }
}, 15_000)

test("process resource sampling binds actual RSS and CPU ticks to its trusted birth identity", async () => {
  const identity = await selfIdentity()
  const owner = { kind: "command" as const, id: "resource-smoke" }
  const sample = await sampleProcessResources({ identity, owner })
  expect(sample.owner).toEqual(owner)
  expect(sample.identity).toEqual(identity)
  expect(sample.rss_bytes).toBeGreaterThan(0)
  expect(sample.cpu?.user_ticks).toBeGreaterThan(0)
  expect(sample.cpu?.system_ticks).toBeGreaterThanOrEqual(0)
  expect(sample.errors).toEqual([])
  expect(Number.isFinite(Date.parse(sample.observed_at))).toBe(true)
  expect(sample.verified).toBe(true)
  expect(sample.cgroup?.path).toBe((await Bun.file(`/proc/${process.pid}/cgroup`).text()).split("\n").find(line => line.startsWith("0::"))!.slice(3))
  expect(sample.cgroup?.cpu_usage?.usage_usec).toBeGreaterThan(0)
})

test("process resource sampling refuses changed birth, executable, owner and signal-group identities", async () => {
  const identity = await selfIdentity()
  for (const change of [{ starttime: String(BigInt(identity.starttime) + 1n) }, { inode: identity.inode + 1 },
    { device: identity.device + 1 }, { uid: identity.uid + 1 }, { group: identity.group + 1 },
    { session: identity.session + 1 }, { executable: "/foreign-executable" }]) {
    const sample = await sampleProcessResources({ owner: { kind: "command", id: "wrong-owner" }, identity: { ...identity, ...change } })
    expect(sample.verified).toBe(false)
    expect([sample.cpu, sample.rss_bytes]).toEqual([null, null])
    expect(sample.cgroup).toBeNull()
    expect(sample.errors).toContain("PROCESS_IDENTITY_UNVERIFIED")
  }
})

test("an exited actual process remains unknown rather than becoming a zero resource sample", async () => {
  const child = Bun.spawn([process.execPath, "-e", `import {readlink,stat} from "node:fs/promises";
console.log(JSON.stringify(await (${selfIdentity.toString()})()))`],
    { env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const identity: Awaited<ReturnType<typeof selfIdentity>> = JSON.parse(stdout)
  expect(identity.pid).toBe(child.pid)
  const sample = await sampleProcessResources({ identity, owner: { kind: "command", id: "exited-smoke" } })
  expect(sample.verified).toBe(false)
  expect([sample.cpu, sample.rss_bytes]).toEqual([null, null])
  expect(sample.errors).toContain("PROCESS_IDENTITY_UNVERIFIED")
})

async function selfIdentity() {
  const fields = (await Bun.file(`/proc/${process.pid}/stat`).text()).split(") ").at(-1)!.trim().split(/\s+/)
  const executable = await stat(`/proc/${process.pid}/exe`)
  return { pid: process.pid, starttime: fields[19]!, uid: process.getuid!(), parent: Number(fields[1]),
    group: Number(fields[2]), session: Number(fields[3]), executable: await readlink(`/proc/${process.pid}/exe`),
    device: executable.dev, inode: executable.ino }
}
