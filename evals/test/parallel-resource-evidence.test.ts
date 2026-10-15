import { expect, test } from "bun:test"
import { appendFile, chmod, link, mkdtemp, rm, stat, symlink, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { collectHostResources, sampleHostResources, sampleSupervisedResources } from "../src/parallel-resources"
import { freezeResourceManifest, readFrozenResourceManifest, freezeResourceBudget, readFrozenResourceBudget, readResourceEvidence, readResourceSummary, writeResourceSummary } from "../src/parallel-resource-evidence"
import { superviseProcess } from "../src/process-supervisor"
import { checkResourceEvidence } from "../src/parallel-acceptance"
import { parallelFixture } from "./helpers/parallel-fixture"
import { resourceBudgetFixture } from "./helpers/resource-budget-fixture"
import { writeLeaseReceipt } from "../src/lease"
import { readLeaseReceipt } from "../src/lease"

test("resource manifest freezes all selected slot paths and both container generations before dispatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-manifest-"))
  try {
    const fixture = await parallelFixture(root), slotsFile = path.join(root, "slots.json"), out = path.join(root, "manifest.json")
    await writeLeaseReceipt(slotsFile, fixture.slots)
    const containers = ["server", "studio"].map((role, index) => ({ role: role as "server" | "studio", id: String(index + 1).repeat(64),
      image: "sha256:" + String(index + 3).repeat(64), startedAt: "2026-10-14T10:00:00.000Z", name: fixture.slots.server[role === "server" ? "container" : "studioContainer"],
      nonce: crypto.randomUUID(), purpose: "research" }))
    const view = { namespace: "cgroup:[123]", root: { device: 1, inode: 2 } }
    const weak = await freezeResourceBudget({ out: path.join(root, "weak-budget.json"), runId: "manifest-smoke",
      bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: 1, maximum: null }] })
    while (Date.now() <= Date.parse(weak.budget.fixed_at)) await Bun.sleep(1)
    const rejected = path.join(root, "incomplete-manifest.json")
    await expect(freezeResourceManifest({ out: rejected, slotsFile, parallel: 2, runId: "manifest-smoke", containers, view, budget: weak.source }))
      .rejects.toThrow("RESOURCE_BUDGET_SCOPES_INCOMPLETE")
    expect(await Bun.file(rejected).exists()).toBe(false)
    const budget = await freezeResourceBudget({ out: path.join(root, "budget.json"), runId: "manifest-smoke",
      bounds: resourceBudgetFixture([fixture.slots.controller.stateDir, ...fixture.slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])], containers) })
    for (const [index] of budget.budget.bounds.entries()) {
      const partial = await freezeResourceBudget({ out: path.join(root, `partial-budget-${index}.json`), runId: "manifest-smoke",
        bounds: budget.budget.bounds.filter((_, position) => position !== index) })
      while (Date.now() <= Date.parse(partial.budget.fixed_at)) await Bun.sleep(1)
      await expect(freezeResourceManifest({ out: rejected, slotsFile, parallel: 2, runId: "manifest-smoke", containers, view, budget: partial.source }))
        .rejects.toThrow("RESOURCE_BUDGET_SCOPES_INCOMPLETE")
      expect(await Bun.file(rejected).exists()).toBe(false)
    }
    const invalid = [
      budget.budget.bounds.map(bound => ({ ...bound, minimum: bound.maximum, maximum: bound.minimum })),
      budget.budget.bounds.map(bound => bound.metric === "available_bytes" || bound.metric === "available_inodes" || bound.metric === "memory.available_bytes"
        ? { ...bound, minimum: 0 } : bound),
      budget.budget.bounds.map(bound => bound.metric === "cpu.utilization_percent" ? { ...bound, maximum: 101 } : bound),
      budget.budget.bounds.map(bound => bound.scope.startsWith("container:") ? { ...bound, scope: bound.scope.replace(containers[0]!.startedAt, "2026-10-14T11:00:00.000Z") } : bound),
    ]
    for (const [index, bounds] of invalid.entries()) {
      const source = await freezeResourceBudget({ out: path.join(root, `invalid-thresholds-${index}.json`), runId: "manifest-smoke", bounds })
      while (Date.now() <= Date.parse(source.budget.fixed_at)) await Bun.sleep(1)
      await expect(freezeResourceManifest({ out: rejected, slotsFile, parallel: 2, runId: "manifest-smoke", containers, view, budget: source.source }))
        .rejects.toThrow("RESOURCE_BUDGET_SCOPES_INCOMPLETE")
      expect(await Bun.file(rejected).exists()).toBe(false)
    }
    while (Date.now() <= Date.parse(budget.budget.fixed_at)) await Bun.sleep(1)
    const suppliedView = { ...view, privateData: "manifest-private-canary" }
    const frozen = await freezeResourceManifest({ out, slotsFile, parallel: 2, runId: "manifest-smoke",
      containers: containers.map(container => ({ ...container, privateData: "manifest-private-canary" })),
      view: suppliedView, budget: budget.source })
    expect(frozen.manifest.coverage.paths).toEqual([fixture.slots.controller.stateDir,
      ...fixture.slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])])
    expect(frozen.manifest.slots).toEqual(fixture.slots.slots)
    expect(frozen.manifest.coverage.containers).toEqual(containers)
    expect(frozen.manifest.interval_ms).toBe(1000)
    expect(frozen.manifest.budget).toEqual(budget.source)
    expect((await stat(out)).mode & 0o777).toBe(0o600)
    const bytes = await Bun.file(out).text()
    expect(bytes).not.toContain("manifest-private-canary")
    while (Date.now() <= Date.parse(frozen.manifest.fixed_at)) await Bun.sleep(1)
    const request = { ...frozen.source, runId: "manifest-smoke", startedAt: new Date().toISOString() }
    expect(await readFrozenResourceManifest(request)).toEqual(frozen.manifest)
    const thin = path.join(root, "thin-manifest.json")
    await writeLeaseReceipt(thin, { ...frozen.manifest, budget: weak.source })
    const thinBytes = await Bun.file(thin).text()
    await expect(readFrozenResourceManifest({ ...request, file: thin, sha256: new Bun.CryptoHasher("sha256").update(thinBytes).digest("hex") }))
      .rejects.toThrow("RESOURCE_BUDGET_SCOPES_INCOMPLETE")
    expect(await Bun.file(thin).text()).toBe(thinBytes)
    const samplesFile = path.join(root, "manifest-samples.jsonl"), receipt = path.join(root, "manifest-summary.json")
    const abort = new AbortController()
    const pending = collectHostResources({ out: samplesFile, paths: frozen.manifest.coverage.paths, intervalMs: 1000,
      runId: "manifest-smoke", phase: "run", signal: abort.signal })
    try {
      const deadline = Date.now() + 5000
      while (!await Bun.file(samplesFile).exists() || (await Bun.file(samplesFile).text()).trim().split("\n").length < 2) {
        if (Date.now() > deadline) throw Error("Manifest resource frames did not arrive")
        await Bun.sleep(10)
      }
    } finally { abort.abort(); await pending }
    const frames = (await Bun.file(samplesFile).text()).trim().split("\n").map(line => JSON.parse(line))
    await writeResourceSummary({ samplesFile, out: receipt })
    const input = { file: receipt, samplesFile, runId: request.runId, startedAt: frames[0].host.observed_at,
      finishedAt: frames.at(-1).host.observed_at, coverage: { paths: [], containers: [], owners: [] }, processWindows: [],
      view: frozen.manifest.view, budget: budget.source, manifest: frozen.source }
    expect((await checkResourceEvidence(input)).checks.coverage)
      .toEqual({ status: "incomplete", codes: ["CONTAINER_RESOURCE_COVERAGE_INCOMPLETE"] })
    expect((await checkResourceEvidence(input)).checks.processTimeline)
      .toEqual({ status: "incomplete", codes: ["RESOURCE_SLOT_PROCESS_PROOFS_INCOMPLETE"] })


    view.root.inode = 99
    containers[0]!.name = "changed"
    expect(frozen.manifest.view.root.inode).toBe(2)
    expect(frozen.manifest.coverage.containers[0]!.name).toBe(fixture.slots.server.container)
    await expect(freezeResourceManifest({ out, slotsFile, parallel: 2, runId: "manifest-smoke", containers: frozen.manifest.coverage.containers,
      view: frozen.manifest.view, budget: budget.source })).rejects.toThrow("RESOURCE_OUTPUT_PRIVATE")
    expect(await Bun.file(out).text()).toBe(bytes)
    const forbiddenOut = path.join(fixture.slots.slots[0]!.profileDir, "resource-manifest.json")
    await expect(freezeResourceManifest({ out: forbiddenOut, slotsFile, parallel: 2, runId: "manifest-smoke",
      containers: frozen.manifest.coverage.containers, view: frozen.manifest.view, budget: budget.source })).rejects.toThrow("RESOURCE_OUTPUT_EXPOSED")
    expect(await Bun.file(forbiddenOut).exists()).toBe(false)
    await expect(readFrozenResourceManifest({ ...request, runId: "foreign" })).rejects.toThrow("RESOURCE_MANIFEST_RUN_MISMATCH")
    await expect(readFrozenResourceManifest({ ...request, startedAt: frozen.manifest.fixed_at })).rejects.toThrow("RESOURCE_MANIFEST_NOT_FIXED_BEFORE_RUN")
    const singleBudget = await freezeResourceBudget({ out: path.join(root, "single-budget.json"), runId: "manifest-smoke",
      bounds: resourceBudgetFixture([fixture.slots.controller.stateDir,
        ...fixture.slots.slots.slice(0, 1).flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])], frozen.manifest.coverage.containers) })
    while (Date.now() <= Date.parse(singleBudget.budget.fixed_at)) await Bun.sleep(1)
    const single = await freezeResourceManifest({ out: path.join(root, "single.json"), slotsFile, parallel: 1,
      runId: "manifest-smoke", containers: frozen.manifest.coverage.containers, view: frozen.manifest.view, budget: singleBudget.source })
    expect(single.manifest.slots).toEqual(fixture.slots.slots.slice(0, 1))
    expect(single.manifest.coverage.paths).toEqual([fixture.slots.controller.stateDir,
      ...fixture.slots.slots.slice(0, 1).flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])])
    await expect(freezeResourceManifest({ out: rejected, slotsFile, parallel: 2, runId: "manifest-smoke",
      containers: frozen.manifest.coverage.containers, view: frozen.manifest.view, budget: singleBudget.source }))
      .rejects.toThrow("RESOURCE_BUDGET_SCOPES_INCOMPLETE")
    expect(await Bun.file(rejected).exists()).toBe(false)
    for (const containers of [[], frozen.manifest.coverage.containers.slice(0, 1),
      frozen.manifest.coverage.containers.map(container => ({ ...container, id: frozen.manifest.coverage.containers[0]!.id })),
      frozen.manifest.coverage.containers.map(container => ({ ...container, name: "foreign-container" }))]) {
      const invalidOut = path.join(root, "invalid.json")
      await expect(freezeResourceManifest({ out: invalidOut, slotsFile, parallel: 2, runId: "manifest-smoke",
        containers, view: frozen.manifest.view, budget: budget.source })).rejects.toThrow("RESOURCE_MANIFEST_INVALID")
      expect(await Bun.file(invalidOut).exists()).toBe(false)
    }
    await writeFile(out, bytes + " ")
    await expect(readFrozenResourceManifest(request)).rejects.toThrow("RESOURCE_SOURCE_HASH_MISMATCH")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource budget freezes private thresholds before dispatch and verifies their original bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-frozen-budget-")), file = path.join(root, "budget.json")
  try {
    const bounds = [{ scope: "host", metric: "memory.available_bytes", minimum: 1, maximum: null }]
    const frozen = await freezeResourceBudget({ out: file, runId: "frozen-budget", bounds })
    expect(frozen.budget).toMatchObject({ version: 1, kind: "parallel-resource-budget", run_id: "frozen-budget", bounds })
    const bytes = await Bun.file(file).text(), inode = (await stat(file)).ino
    expect(frozen.source).toEqual({ file, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") })
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    while (Date.now() <= Date.parse(frozen.budget.fixed_at)) await Bun.sleep(1)
    const request = { file, sha256: frozen.source.sha256, runId: "frozen-budget", startedAt: new Date().toISOString() }
    expect(await readFrozenResourceBudget(request)).toEqual(frozen.budget)
    bounds[0]!.minimum = 2
    expect(frozen.budget.bounds[0]!.minimum).toBe(1)
    await expect(readFrozenResourceBudget({ ...request, runId: "another-run" })).rejects.toThrow("RESOURCE_BUDGET_RUN_MISMATCH")
    await expect(readFrozenResourceBudget({ ...request, startedAt: frozen.budget.fixed_at })).rejects.toThrow("RESOURCE_BUDGET_NOT_FIXED_BEFORE_RUN")
    await expect(readFrozenResourceBudget({ ...request, startedAt: "unverified" })).rejects.toThrow("RESOURCE_BUDGET_TIME_UNVERIFIED")
    await expect(freezeResourceBudget({ out: file, runId: "frozen-budget", bounds })).rejects.toThrow("RESOURCE_OUTPUT_PRIVATE")
    expect(await Bun.file(file).text()).toBe(bytes)
    expect((await stat(file)).ino).toBe(inode)
    await writeFile(file, JSON.stringify({ ...frozen.budget, bounds: [{ ...bounds[0], minimum: 0 }] }) + "\n")
    await expect(readFrozenResourceBudget(request)).rejects.toThrow("RESOURCE_SOURCE_HASH_MISMATCH")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource budget refuses invalid bounds and unsafe output before persisting thresholds", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-invalid-budget-")), file = path.join(root, "budget.json")
  try {
    for (const bounds of [[], [{ scope: "host", metric: "memory.available_bytes", minimum: null, maximum: null }],
      [{ scope: "host", metric: "memory.available_bytes", minimum: 2, maximum: 1 }],
      [{ scope: "host", metric: "memory.available_bytes", minimum: NaN, maximum: null }]]) {
      await expect(freezeResourceBudget({ out: file, runId: "invalid-budget", bounds })).rejects.toThrow("RESOURCE_BUDGET_INVALID")
      expect(await Bun.file(file).exists()).toBe(false)
    }
    await chmod(root, 0o755)
    await expect(freezeResourceBudget({ out: file, runId: "invalid-budget",
      bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: 1, maximum: null }] })).rejects.toThrow("RESOURCE_OUTPUT_PRIVATE")
    expect(await Bun.file(file).exists()).toBe(false)
  } finally { await chmod(root, 0o700); await rm(root, { recursive: true, force: true }) }
})

test("resource evidence returns the validated raw observations with their verified receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-verified-samples-"))
  const samplesFile = path.join(root, "samples.jsonl"), out = path.join(root, "summary.json")
  try {
    const samples = await Promise.all([0, 1].map(async index => ({ version: 1, sequence: index + 1, elapsed_ms: index * 1000,
      missed_intervals: 0, duration_ms: 1, interval_ms: 1000, run_id: "verified-samples", phase: "run" as const,
      host: await sampleHostResources([root]), containers: null, processes: null })))
    const bytes = samples.map(sample => JSON.stringify(sample) + "\n").join("")
    await writeFile(samplesFile, bytes, { mode: 0o600 })
    const receipt = await writeResourceSummary({ samplesFile, out })
    const request = { file: out, samplesFile, runId: "verified-samples", phase: "run" as const }
    const evidence = await readResourceEvidence(request)
    expect(evidence).toEqual({ receipt, samples })
    expect(evidence.receipt.source.sha256).toBe(new Bun.CryptoHasher("sha256").update(bytes).digest("hex"))
    evidence.samples[0]!.sequence = 99
    expect(await Bun.file(samplesFile).text()).toBe(bytes)
    expect((await readResourceEvidence(request)).samples).toEqual(samples)
    await appendFile(samplesFile, "\n")
    await expect(readResourceEvidence(request)).rejects.toThrow("RESOURCE_SOURCE_HASH_MISMATCH")
    expect(await readLeaseReceipt(out)).toEqual(receipt)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("resource evidence reads historical summaries without OOM increase counts and preserves their files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-historical-summary-"))
  const samplesFile = path.join(root, "samples.jsonl"), out = path.join(root, "summary.json")
  try {
    const source = JSON.stringify({ version: 1, sequence: 1, elapsed_ms: 0, missed_intervals: 0, duration_ms: 1,
      interval_ms: 1000, run_id: "historical-summary", phase: "before", host: await sampleHostResources([root]), containers: null, processes: null }) + "\n"
    await writeFile(samplesFile, source, { mode: 0o600 })
    const expected = await writeResourceSummary({ samplesFile, out })
    const historical = { ...expected, summary: { ...expected.summary, metrics: expected.summary.metrics.map(metric =>
      Object.fromEntries(Object.entries(metric).filter(([key]) => key !== "counter_increases"))) } }
    const bytes = JSON.stringify(historical)
    await writeFile(out, bytes)
    expect(await readResourceSummary({ file: out, samplesFile, runId: "historical-summary", phase: "before" })).toEqual(expected)
    expect(await Bun.file(out).text()).toBe(bytes)
    expect(await Bun.file(samplesFile).text()).toBe(source)
    await writeFile(out, JSON.stringify({ ...expected, summary: { ...expected.summary, metrics: expected.summary.metrics.map(metric =>
      metric.metric === "memory_events.oom" ? { ...metric, counter_increases: 123 } : metric) } }))
    await expect(readResourceSummary({ file: out, samplesFile, runId: "historical-summary", phase: "before" })).rejects.toThrow("RESOURCE_SUMMARY_MISMATCH")
    expect(await Bun.file(samplesFile).text()).toBe(source)
  } finally { await rm(root, { recursive: true, force: true }) }
})

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
      { cpu_max: { quota_usec: 1000, period_usec: "malformed-counter-canary" } },
      { controllers: "malformed-counter-canary" }, { controllers: [null] },
      { view: { namespace: "malformed-view-canary", root: { device: 29, inode: 1 } } },
      { view: { namespace: "cgroup:[1]", root: { device: "malformed-view-canary", inode: 1 } } }].entries()) {
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
