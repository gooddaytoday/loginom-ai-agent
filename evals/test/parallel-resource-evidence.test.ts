import { expect, test } from "bun:test"
import { appendFile, chmod, link, mkdtemp, rm, stat, symlink, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { collectHostResources, sampleHostResources, sampleSupervisedResources } from "../src/parallel-resources"
import { readResourceSummary, writeResourceSummary } from "../src/parallel-resource-evidence"
import { superviseProcess } from "../src/process-supervisor"
import { readLeaseReceipt } from "../src/lease"

test("resource evidence persists the actual sampler summary privately and binds the unchanged JSONL bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-summary-"))
  const samplesFile = path.join(root, "samples.jsonl"), out = path.join(root, "summary.json")
  const abort = new AbortController()
  const pending = collectHostResources({ paths: [root], out: samplesFile, intervalMs: 10, runId: "summary-smoke", phase: "before", signal: abort.signal })
  try {
    const deadline = Date.now() + 2000
    while (!await Bun.file(samplesFile).exists() || (await Bun.file(samplesFile).text()).trim().split("\n").length < 3) {
      if (Date.now() > deadline) throw Error("Summary smoke samples did not arrive")
      await Bun.sleep(10)
    }
    abort.abort()
    const collected = await pending
    const bytes = await Bun.file(samplesFile).text()
    const evidence = await writeResourceSummary({ samplesFile, out })
    expect(evidence).toMatchObject({ version: 1, kind: "resource-summary", run_id: "summary-smoke", phase: "before",
      source: { file: samplesFile, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }, summary: { samples: collected.samples } })
    expect(evidence.summary.metrics.find(item => item.scope === "host" && item.metric === "memory.available_bytes")?.min).toBeGreaterThan(0)
    expect(evidence.summary.metrics.find(item => item.scope === `filesystem:${root}` && item.metric === "available_bytes")?.missing).toBe(0)
    expect(await readLeaseReceipt(out)).toEqual(evidence)
    expect((await stat(out)).mode & 0o777).toBe(0o600)
    expect((await stat(out)).nlink).toBe(1)
    expect(await Bun.file(samplesFile).text()).toBe(bytes)
  } finally { abort.abort(); await pending; await rm(root, { recursive: true, force: true }) }
})


test("resource evidence refuses malformed host counters before creating a summary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-invalid-"))
  const samplesFile = path.join(root, "samples.jsonl")
  const frame = { version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1, interval_ms: 1000,
    run_id: "run", phase: "before", host: { cpu: null, memory: null, filesystems: [] }, containers: null, processes: null }
  try {
    await writeFile(samplesFile, JSON.stringify(frame) + "\n", { mode: 0o600 })
    expect((await writeResourceSummary({ samplesFile, out: path.join(root, "control.json") })).summary.samples).toBe(1)
    for (const [index, host] of [
      { ...frame.host, cpu: { ticks: "malformed-counter-canary" } },
      { ...frame.host, memory: { available_bytes: "malformed-counter-canary" } },
    ].entries()) {
      await writeFile(samplesFile, JSON.stringify({ ...frame, host }) + "\n")
      const out = path.join(root, `invalid-${index}.json`)
      await expect(writeResourceSummary({ samplesFile, out })).rejects.toThrow("RESOURCE_SAMPLES_INVALID")
      expect(await Bun.file(out).exists()).toBe(false)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("resource evidence preserves existing summaries and refuses public or aliased sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-private-summary-"))
  const samplesFile = path.join(root, "samples.jsonl"), out = path.join(root, "summary.json")
  try {
    await writeFile(samplesFile, JSON.stringify({ version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1,
      interval_ms: 1000, run_id: null, phase: null, host: await sampleHostResources([root]), containers: null, processes: null }) + "\n", { mode: 0o600 })
    await writeResourceSummary({ samplesFile, out })
    const before = await Bun.file(out).text(), inode = (await stat(out)).ino
    await expect(writeResourceSummary({ samplesFile, out })).rejects.toThrow("RESOURCE_OUTPUT_PRIVATE")
    await symlink(out, path.join(root, "alias.json"))
    await expect(writeResourceSummary({ samplesFile, out: path.join(root, "alias.json") })).rejects.toThrow("RESOURCE_OUTPUT_PRIVATE")
    await chmod(samplesFile, 0o644)
    await expect(writeResourceSummary({ samplesFile, out: path.join(root, "public-source.json") })).rejects.toThrow("RESOURCE_SOURCE_PRIVATE")
    expect(await Bun.file(path.join(root, "public-source.json")).exists()).toBe(false)
    await chmod(samplesFile, 0o600)
    await link(samplesFile, path.join(root, "source-alias.jsonl"))
    await expect(writeResourceSummary({ samplesFile, out: path.join(root, "linked-source.json") })).rejects.toThrow("RESOURCE_SOURCE_PRIVATE")
    expect(await Bun.file(path.join(root, "linked-source.json")).exists()).toBe(false)
    await unlink(path.join(root, "source-alias.jsonl"))
    expect(await Bun.file(out).text()).toBe(before)
    expect((await stat(out)).ino).toBe(inode)
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("resource receipt read-back recomputes the actual private source and refuses changed JSONL bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-readback-"))
  const samplesFile = path.join(root, "samples.jsonl"), out = path.join(root, "summary.json")
  try {
    await writeFile(samplesFile, JSON.stringify({ version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1,
      interval_ms: 1000, run_id: "readback-smoke", phase: "before", host: await sampleHostResources([root]), containers: null, processes: null }) + "\n", { mode: 0o600 })
    const written = await writeResourceSummary({ samplesFile, out })
    const request = { file: out, samplesFile, runId: "readback-smoke", phase: "before" as const }
    expect(await readResourceSummary(request)).toEqual(written)
    const before = await Bun.file(out).text()
    await appendFile(samplesFile, "\n")
    await expect(readResourceSummary(request)).rejects.toThrow("RESOURCE_SOURCE_HASH_MISMATCH")
    expect(await Bun.file(out).text()).toBe(before)
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("resource receipt read-back refuses a changed source path before opening the declared replacement", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-source-binding-"))
  const samplesFile = path.join(root, "samples.jsonl"), out = path.join(root, "summary.json")
  try {
    await writeFile(samplesFile, JSON.stringify({ version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1,
      interval_ms: 1000, run_id: "source-binding", phase: "before", host: await sampleHostResources([root]), containers: null, processes: null }) + "\n", { mode: 0o600 })
    const receipt = await writeResourceSummary({ samplesFile, out })
    const request = { file: out, samplesFile, runId: "source-binding", phase: "before" as const }
    expect(await readResourceSummary(request)).toEqual(receipt)
    await writeFile(out, JSON.stringify({ ...receipt, source: { ...receipt.source, file: path.join(root, "not-a-measured-source.json") } }))
    await expect(readResourceSummary(request)).rejects.toThrow("RESOURCE_SOURCE_PATH_MISMATCH")
    expect(await Bun.file(path.join(root, "not-a-measured-source.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("resource receipt read-back refuses another run, phase or modified summary without rewriting evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-context-"))
  const samplesFile = path.join(root, "samples.jsonl"), out = path.join(root, "summary.json")
  try {
    await writeFile(samplesFile, JSON.stringify({ version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1,
      interval_ms: 1000, run_id: "context-smoke", phase: "before", host: await sampleHostResources([root]), containers: null, processes: null }) + "\n", { mode: 0o600 })
    const receipt = await writeResourceSummary({ samplesFile, out })
    const request = { file: out, samplesFile, runId: "context-smoke", phase: "before" as const }
    const sourceBefore = await Bun.file(samplesFile).text(), receiptBefore = await Bun.file(out).text()
    await expect(readResourceSummary({ ...request, runId: "another-run" })).rejects.toThrow("RESOURCE_RECEIPT_CONTEXT_MISMATCH")
    await expect(readResourceSummary({ ...request, phase: "after" })).rejects.toThrow("RESOURCE_RECEIPT_CONTEXT_MISMATCH")
    expect(await Bun.file(out).text()).toBe(receiptBefore)
    await writeFile(out, JSON.stringify({ ...receipt, summary: { ...receipt.summary, missed_intervals: 99 } }))
    const changed = await Bun.file(out).text()
    await expect(readResourceSummary(request)).rejects.toThrow("RESOURCE_SUMMARY_MISMATCH")
    expect(await Bun.file(out).text()).toBe(changed)
    expect(await Bun.file(samplesFile).text()).toBe(sourceBefore)
    // A forged header cannot relabel the measured raw source as another run.
    await writeFile(out, JSON.stringify({ ...receipt, run_id: "another-run" }))
    await expect(readResourceSummary({ ...request, runId: "another-run" })).rejects.toThrow("RESOURCE_RECEIPT_CONTEXT_MISMATCH")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource evidence refuses malformed cgroup counters instead of silently reducing them to missing values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-cgroup-schema-"))
  const samplesFile = path.join(root, "samples.jsonl")
  try {
    const host = await sampleHostResources([root])
    const frame = { version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1, interval_ms: 1000,
      run_id: "cgroup-schema", phase: "before", host, containers: null, processes: null }
    await writeFile(samplesFile, JSON.stringify(frame) + "\n", { mode: 0o600 })
    expect((await writeResourceSummary({ samplesFile, out: path.join(root, "control.json") })).summary.samples).toBe(1)
    for (const [index, change] of [{ memory_current_bytes: "malformed-counter-canary" },
      { memory_events: { oom: "malformed-counter-canary", oom_kill: 0 } },
      { cpu_max: { quota_usec: 1000, period_usec: "malformed-counter-canary" } }].entries()) {
      const out = path.join(root, `invalid-${index}.json`)
      await writeFile(samplesFile, JSON.stringify({ ...frame, host: { ...host, collector_cgroup: { ...host.collector_cgroup, ...change } } }) + "\n")
      await expect(writeResourceSummary({ samplesFile, out })).rejects.toThrow("RESOURCE_SAMPLES_INVALID")
      expect(await Bun.file(out).exists()).toBe(false)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("resource evidence validates actual admitted process counters and rejects malformed observation flags", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-process-schema-"))
  const owner = { kind: "command" as const, id: crypto.randomUUID() }
  const abort = new AbortController(), ready = Promise.withResolvers<void>()
  const pending = superviseProcess({ cmd: [process.execPath, "-e", "console.log('ready'); await Bun.sleep(10000)"], cwd: root,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, timeoutMs: 12000, signal: abort.signal, owner,
    stdout: new WritableStream<Uint8Array>({ write() { ready.resolve() } }),
  })
  try {
    await Promise.race([ready.promise, pending.then(() => { throw Error("Process schema child exited before readiness") })])
    const deadline = Date.now() + 5000
    let observed = await sampleSupervisedResources()
    while (!observed.scopes.some(scope => scope.owner.id === owner.id && scope.status === "observed" && scope.processes?.length)) {
      if (Date.now() > deadline) throw Error("Process schema scope did not arrive")
      await Bun.sleep(10)
      observed = await sampleSupervisedResources()
    }
    const scope = observed.scopes.find(scope => scope.owner.id === owner.id)!
    const frame = { version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1, interval_ms: 1000,
      run_id: "process-schema", phase: "run", host: await sampleHostResources([root]), containers: null,
      processes: { ...observed, scopes: [scope] } }
    const samplesFile = path.join(root, "samples.jsonl")
    await writeFile(samplesFile, JSON.stringify(frame) + "\n", { mode: 0o600 })
    expect((await writeResourceSummary({ samplesFile, out: path.join(root, "control.json") })).summary.samples).toBe(1)
    for (const [index, change] of [{ rss_bytes: "malformed-counter-canary" },
      { cpu: { user_ticks: "malformed-counter-canary", system_ticks: 0 } }, { verified: "true" }].entries()) {
      const out = path.join(root, `invalid-${index}.json`)
      const processes = scope.processes!.map((process, index) => index ? process : { ...process, ...change })
      await writeFile(samplesFile, JSON.stringify({ ...frame, processes: { ...observed, scopes: [{ ...scope, processes }] } }) + "\n")
      await expect(writeResourceSummary({ samplesFile, out })).rejects.toThrow("RESOURCE_SAMPLES_INVALID")
      expect(await Bun.file(out).exists()).toBe(false)
    }
  } finally {
    abort.abort()
    const run = await pending
    if (run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete) await rm(root, { recursive: true, force: true })
  }
}, 20000)
