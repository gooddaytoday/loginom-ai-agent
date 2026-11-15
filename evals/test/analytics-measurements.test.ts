import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rm, readFile, chmod, rename, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { auditMeasurement, exclusiveFact, freezeMeasurementInputs, measurementState, snapshotActor, validateManifest } from "../src/analytics-measurements"
import { evalsRoot } from "../src/config"

async function budgetRefusalFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "budget-refusal-"))
  const write = async (file: string, value: unknown) => {
    await Bun.write(file, typeof value === "string" ? value : JSON.stringify(value))
    await chmod(file, 0o600)
  }
  const pin = async (file: string) => ({ file, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex") })
  const job = { id: "one", taskId: "sample", form: "detailed", tasksDir: root,
    unit: "synthetic-budget-refusal.service", resultsDir: path.join(root, "results") }
  const stateDir = path.join(root, "controller")
  await mkdir(job.resultsDir, { mode: 0o700 }); await mkdir(stateDir, { mode: 0o700 })
  const binding = { unit: job.unit, manager: "system", invocation: "a".repeat(32),
    cgroup: "/system.slice/" + job.unit, bootId: (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim(),
    producer: { pid: 2147483647, uid: process.getuid!(), starttime: "1" } }
  const unit = { Id: job.unit, InvocationID: binding.invocation, ActiveState: "failed", MainPID: "0",
    ControlGroup: "", ExecMainStatus: "1", Restart: "no", Delegate: "no" }
  const budgetFile = path.join(root, "budget.json"), entryFile = path.join(root, "worker-entry.json"),
    intentFile = path.join(root, "launch-intent.json"), proofFile = path.join(root, "budget-refusal.json")
  await write(budgetFile, "[]")
  const budgetSha256 = (await pin(budgetFile)).sha256, manifestHash = "b".repeat(64)
  await write(entryFile, { manifestHash, job: job.id, binding })
  await write(intentFile, { manifestHash, job: job.id, unit: job.unit, resultsDir: job.resultsDir })
  const sourceRevision = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: path.dirname(evalsRoot) }).stdout.toString().trim()
  const sourceFile = path.join(root, "source-pins.json"), metadataFile = path.join(root, "original-metadata.json"),
    journalFile = path.join(root, "journal.jsonl")
  await write(sourceFile, { sourceRevision, manifestSha256: manifestHash, pins: { resourceBudgetSha256: budgetSha256 } })
  await write(metadataFile, { resourceBudgetSha256: budgetSha256, mode: "0o664", uid: binding.producer.uid,
    nlink: 1, originalWorkerInvocation: binding.invocation, resultsDirectoryEmpty: true })
  const common = { _BOOT_ID: binding.bootId.replaceAll("-", ""), INVOCATION_ID: binding.invocation, UNIT: job.unit }
  const authoritativeJournal: Record<string, string>[] = [
    { ...common, __CURSOR: "start", MESSAGE: "Started", _PID: "1", _UID: "0" },
    { ...common, __CURSOR: "refusal", MESSAGE: "LEASE_FILE_PRIVATE", _PID: String(binding.producer.pid),
      _UID: String(binding.producer.uid), _SYSTEMD_UNIT: job.unit, _SYSTEMD_CGROUP: binding.cgroup },
    { ...common, __CURSOR: "exit", MESSAGE: "Exited", _PID: "1", _UID: "0", EXIT_CODE: "exited", EXIT_STATUS: "1" },
  ]
  await write(journalFile, authoritativeJournal.map(row => JSON.stringify(row)).join("\n"))
  const executionSources = []
  for (const repositoryPath of ["evals/src/prepared-run.ts", "evals/src/lease.ts"]) {
    const file = path.join(root, path.basename(repositoryPath))
    const blob = Bun.spawnSync(["git", "show", sourceRevision + ":" + repositoryPath], { cwd: path.dirname(evalsRoot) })
    if (blob.exitCode) throw Error("FIXTURE_SOURCE_MISSING")
    await write(file, blob.stdout.toString())
    executionSources.push({ ...await pin(file), repositoryPath })
  }
  const proof = { version: 1, kind: "post-exit-budget-refusal", manifestHash, job: job.id, generation: 0,
    sourceRevision, sourcePins: await pin(sourceFile), budgetMetadata: await pin(metadataFile),
    journal: await pin(journalFile), executionSources }
  await write(proofFile, proof)
  return { root, write, pin, job, binding, unit, proof, sourceFile, metadataFile, journalFile,
    input: { job, unit, stateDir, manifestHash, generation: 0, budgetFile, budgetSha256,
      entryFile, intentFile, proofFile, authoritativeJournal } }
}

test("prejournal budget refusal uses original evidence across authorization restart", async () => {
  const { prejournalBudgetRetrySources, verifyMeasurementRetryProof } = await import("../src/analytics-measurements")
  const f = await budgetRefusalFixture()
  try {
    const sources = await prejournalBudgetRetrySources(f.input)
    expect(sources.map(x => x.file)).toContain(f.metadataFile)
    expect(sources.map(x => x.file)).toContain(f.journalFile)
    const authorization = path.join(f.root, "authorization.json")
    await exclusiveFact(authorization, { manifestHash: f.input.manifestHash, job: f.job.id, generation: 1, sources, releases: [] })
    await verifyMeasurementRetryProof(authorization, f.input.manifestHash, f.job.id, 1)
    expect(await prejournalBudgetRetrySources(f.input)).toEqual(sources)
    await f.write(f.metadataFile, { changed: true })
    await expect(verifyMeasurementRetryProof(authorization, f.input.manifestHash, f.job.id, 1)).rejects.toThrow("RETRY_EVIDENCE_CHANGED")
    await expect(prejournalBudgetRetrySources(f.input)).rejects.toThrow()
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("prejournal refusal rejects incomplete identity, evidence and every native admission", async () => {
  const { prejournalBudgetRetrySources } = await import("../src/analytics-measurements")
  for (const change of ["missing", "changed", "boot", "invocation", "producer", "uid", "active", "cleared",
    "results", "symlink-results", "native", "corrupt-native", "ambiguous-native", "measurement", "intent",
    "revision", "budget", "private-metadata", "no-refusal", "no-exit", "authoritative-mismatch", "execution-source"]) {
    const f = await budgetRefusalFixture()
    try {
      if (change === "missing") await rm(f.metadataFile)
      if (change === "changed") await f.write(f.journalFile, "changed")
      if (["boot", "producer", "uid", "no-refusal", "no-exit"].includes(change)) {
        if (change === "boot") f.input.authoritativeJournal.forEach(row => row._BOOT_ID = "f".repeat(32))
        if (change === "producer") f.input.authoritativeJournal[1]!._PID = "1"
        if (change === "uid") f.input.authoritativeJournal[1]!._UID = "0"
        if (change === "no-refusal") f.input.authoritativeJournal[1]!.MESSAGE = "OTHER_ERROR"
        if (change === "no-exit") f.input.authoritativeJournal[2]!.EXIT_STATUS = "0"
        await f.write(f.journalFile, f.input.authoritativeJournal.map(row => JSON.stringify(row)).join("\n"))
        f.proof.journal = await f.pin(f.journalFile); await f.write(f.input.proofFile, f.proof)
      }
      if (change === "authoritative-mismatch") f.input.authoritativeJournal[0]!.MESSAGE = "changed authoritative record"
      if (change === "invocation") f.unit.InvocationID = "f".repeat(32)
      if (change === "active") f.unit.ActiveState = "active"
      if (change === "cleared") f.unit.InvocationID = ""
      if (change === "results") await f.write(path.join(f.job.resultsDir, "started"), "evidence")
      if (change === "symlink-results") {
        await rename(f.job.resultsDir, f.job.resultsDir + "-real")
        await symlink(f.job.resultsDir + "-real", f.job.resultsDir)
      }
      if (["native", "corrupt-native", "ambiguous-native", "measurement"].includes(change)) {
        const native = { runDir: f.job.resultsDir + "/run", attempts: change === "measurement" ? [{ purpose: "measurement" }] : [] }
        await f.write(path.join(f.input.stateDir, "run-command-one.json"), change === "corrupt-native" ? "{" : native)
        if (change === "ambiguous-native") await f.write(path.join(f.input.stateDir, "run-command-two.json"), native)
      }
      if (change === "intent") await f.write(f.input.intentFile, { manifestHash: "foreign" })
      if (change === "revision") { f.proof.sourceRevision = "f".repeat(40); await f.write(f.input.proofFile, f.proof) }
      if (change === "budget") await f.write(f.input.budgetFile, "[1]")
      if (change === "private-metadata") {
        const metadata = await Bun.file(f.metadataFile).json()
        await f.write(f.metadataFile, { ...metadata, mode: "0o600" })
        f.proof.budgetMetadata = await f.pin(f.metadataFile); await f.write(f.input.proofFile, f.proof)
      }
      if (change === "execution-source") {
        const original = f.proof.executionSources[0]!
        await f.write(original.file, "changed source boundary")
        f.proof.executionSources[0] = { ...await f.pin(original.file), repositoryPath: original.repositoryPath }
        await f.write(f.input.proofFile, f.proof)
      }
      await expect(prejournalBudgetRetrySources(f.input)).rejects.toThrow()
    } finally { await rm(f.root, { recursive: true, force: true }) }
  }
})
test("concurrent launch facts admit exactly one controller and preserve evidence", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "measurements-"))
  try {
    const file = path.join(dir, "intent.json")
    const results = await Promise.all([exclusiveFact(file, { id: "first" }), exclusiveFact(file, { id: "second" })])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(["first", "second"]).toContain(JSON.parse(await readFile(file, "utf8")).id)
    expect(await exclusiveFact(file, { id: "replacement" })).toBe(false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("actor snapshot includes hidden content and metadata without listing foreign peers", async () => {
  const userRoot = "viking://user/example", peerRoot = userRoot + "/peers/current"
  const visited: string[] = []
  const server = Bun.serve({ port: 0, fetch(request) {
    const url = new URL(request.url), uri = url.searchParams.get("uri") ?? ""
    visited.push(uri)
    if (url.pathname === "/health") return Response.json({ healthy: true, account_id: "example", user_id: "example", role: "user" })
    if (url.pathname.endsWith("read")) return Response.json({ status: "ok", result: "complete hidden contents" })
    return Response.json({ status: "ok", result: uri === userRoot || uri === peerRoot
      ? [{ uri: uri + "/.metadata", name: ".metadata", isDir: false }, { uri: uri + "/memories", name: "memories", isDir: true }]
      : [{ uri: uri + "/.hidden", name: ".hidden", isDir: false }] })
  } })
  try {
    const snapshot = await snapshotActor({ scope: "actor", userRoot, peerRoot, identity: { account_id: "example", user_id: "example", role: "user" } }, server.url.href, "fake-key")
    expect(Object.keys(snapshot.files)).toHaveLength(2)
    expect(Object.keys(snapshot.peer_metadata)).toHaveLength(2)
    expect(visited).not.toContain(userRoot + "/peers")
    expect(snapshot.files[peerRoot + "/memories/.hidden"]).toBe("complete hidden contents")
  } finally { server.stop(true) }
})

test("terminal FAIL and NULL consume admission; unknown invocation and missing admissions hold", () => {
  const job = { id: "one", form: "business", taskId: "sample", tasksDir: "/tmp/example/tasks", unit: "example-one.service", resultsDir: "/tmp/example/results" }
  const unit = { Id: job.unit, InvocationID: "abc", ActiveState: "failed", Delegate: "no", MainPID: "0", ControlGroup: "" }
  const journal = { version: 2, kind: "unactivated-preparation", runDir: job.resultsDir + "/run", unitBinding: { unit: job.unit, invocation: "abc" }, attempts: [{ purpose: "measurement", taskId: "sample", slotId: "example", attempt: 1 }] }
  expect(measurementState(job, unit, journal)).toBe("consumed")
  expect(measurementState(job, unit, { ...journal, attempts: [] })).toBe("zero-admissions")
  expect(measurementState(job, { ...unit, InvocationID: "changed" }, journal)).toBe("hold")
  expect(measurementState(job, unit, { ...journal, attempts: undefined })).toBe("hold")
  expect(measurementState(job, { ...unit, ActiveState: "active" }, journal)).toBe("running")
})

test("manifest accepts only immutable ordered two/eight distinct jobs", () => {
  const manifest = { version: 1, kind: "analytics-measurements", id: "example", stateDir: "/tmp/example/state", controllerEnvFile: "/tmp/example/env", slotsFile: "/tmp/example/slots", resourceBudgetFile: "/tmp/example/budget", memory: { scope: "actor" }, pins: Object.fromEntries(["controllerEnvSha256", "slotsSha256", "resourceBudgetSha256", "cliBinarySha256", "cliManifestSha256"].map(key => [key, "a".repeat(64)])), jobs: Array.from({ length: 2 }, (_, index) => ({ id: `job-${index}`, taskId: "sample", form: "business", unit: `example-${index}.service`, tasksDir: "/tmp/example/tasks", resultsDir: `/tmp/example/results-${index}` })) }
  expect(validateManifest(manifest).jobs.map(job => job.id)).toEqual(["job-0", "job-1"])
  expect(() => validateManifest({ ...manifest, jobs: [manifest.jobs[0]] })).toThrow()
  expect(() => validateManifest({ ...manifest, jobs: [manifest.jobs[0], manifest.jobs[0]] })).toThrow()
})

test("incomplete memory reads hold instead of accepting a partial baseline", async () => {
  const root = "viking://user/example", peer = root + "/peers/current"
  const server = Bun.serve({ port: 0, fetch(request) {
    const url = new URL(request.url), uri = url.searchParams.get("uri") ?? ""
    if (url.pathname === "/health") return Response.json({ healthy: true, account_id: "example", user_id: "example", role: "user" })
    if (url.pathname.endsWith("read")) return Response.json({ status: "ok", result: "partial", truncated: true })
    return Response.json({ status: "ok", result: [{ uri: uri + (uri.endsWith("memories") ? "/entry" : "/memories"), name: uri.endsWith("memories") ? "entry" : "memories", isDir: !uri.endsWith("memories") }] })
  } })
  try { await expect(snapshotActor({ scope: "actor", userRoot: root, peerRoot: peer, identity: { account_id: "example", user_id: "example", role: "user" } }, server.url.href, "fake-key")).rejects.toThrow("MEMORY_INCOMPLETE_READ") }
  finally { server.stop(true) }
})

test("corrupt admission entries hold without accepting measurement budget", () => {
  const job = { id: "one", form: "business", taskId: "sample", tasksDir: "/tmp/example/tasks", unit: "example-one.service", resultsDir: "/tmp/example/results" }
  const unit = { Id: job.unit, InvocationID: "abc", ActiveState: "failed", Delegate: "no", MainPID: "0", ControlGroup: "" }
  expect(measurementState(job, unit, { version: 2, kind: "unactivated-preparation", runDir: job.resultsDir + "/run", unitBinding: { unit: job.unit, invocation: "abc" }, attempts: [null] })).toBe("hold")
})

test("audit failure preserves raw FAIL and NULL model outcomes without touching evidence", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "measurement-audit-"))
  try {
    const job = { id: "one", form: "business", taskId: "sample", tasksDir: path.join(dir, "tasks"), unit: "example-one.service", resultsDir: dir }
    const runDir = path.join(dir, "run"), journal = path.join(dir, "native.json")
    await mkdir(path.join(runDir, "sample", "1"), { recursive: true })
    await Bun.write(journal, JSON.stringify({ runDir }))
    const slots = { slots: [{ id: "example", username: "example", profileDir: path.join(dir, "profile"), historyDir: path.join(dir, "history"), workspaceRoot: path.join(dir, "workspace") }], judge: { codexHome: path.join(dir, "judge") } }
    for (const status of ["FAIL", "NULL"]) {
      const outcome = { status, score: status === "NULL" ? null : 0, pass: false, judge_status: "failed", oracle_pass: false, exit_code: 1, timed_out: false, interrupted: false, failure_kind: "other", environment_cleanup: null }
      const file = path.join(runDir, "sample", "1", "result.json"), bytes = JSON.stringify(outcome)
      await Bun.write(file, bytes)
      const audit = await auditMeasurement(job, journal, slots)
      expect(audit.rawOutcome).toEqual(outcome)
      expect(audit.status).toBe("INCOMPLETE")
      expect(await Bun.file(file).text()).toBe(bytes)
    }
    await Bun.write(path.join(runDir, "sample", "1", "result.json"), "{")
    await expect(auditMeasurement(job, journal, slots)).rejects.toThrow()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("dynamic recovery tools require a qualified, bounded and closed native handoff", async () => {
  const { recoveryToolsCovered } = await import("../src/analytics-measurements")
  const metadata = { sessionId: "synthetic-runtime", clientRevision: "c".repeat(64),
    actionManifestDigest: "d".repeat(64), targetIdentity: { platform: "linux" }, archiveActive: false, resultProfile: "user-v1" }
  const common = { session_id: metadata.sessionId, runtime_revision: metadata.clientRevision,
    manifest_sha256: metadata.actionManifestDigest, target: metadata.targetIdentity, attempt_id: "synthetic-attempt", operation_id: "step" }
  const input = { depth: 2 }
  const calls: Parameters<typeof recoveryToolsCovered>[0]["calls"] = [
    { tool: "loginom_dock_browser_recovery", status: "completed", input: { action: "start", operation_id: "step" } },
    { tool: "loginom_browser_snapshot", status: "completed", input },
    { tool: "loginom_dock_browser_recovery", status: "error", input: { action: "finish", operation_id: "step" } },
    { tool: "loginom_dock_browser_recovery", status: "completed", input: { action: "stop", operation_id: "step" } },
  ]
  const records: Parameters<typeof recoveryToolsCovered>[0]["records"] = [
    { ...common, phase: "browser_recovery_started", budget: { calls_left: 30, ms_left: 600000 } },
    { ...common, phase: "browser_recovery_handoff", stopped: true },
    { ...common, phase: "browser_recovery_action", tool: "browser_snapshot",
      arguments_sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(input)).digest("hex"),
      is_error: false, transport_error: null, page: { ok: true }, budget: { calls_left: 29, ms_left: 599000 } },
    { ...common, phase: "browser_recovery_stopped", cleanup: { state: "retained" } },
  ]
  const sample = { calls, records, metadata, qualifiedRevision: metadata.clientRevision, browserTools: ["browser_snapshot"] }
  expect(recoveryToolsCovered(sample)).toBe(true)
  const verified = structuredClone(sample)
  verified.records.splice(3, 1, { ...common, phase: "browser_recovery_attested" },
    { ...common, phase: "browser_recovery_verified", status: "completed" })
  verified.calls[3] = { tool: "loginom_dock_browser_recovery", status: "completed",
    input: { action: "finish", operation_id: "step", actions_performed: ["inspected"] } }
  expect(recoveryToolsCovered(verified)).toBe(true)
  for (const change of ["no-handoff", "no-stop", "foreign-session", "foreign-operation", "unqualified", "page",
    "transport", "budget", "arguments", "unknown-tool", "archive", "extra-action", "no-native", "runtime", "manifest", "target", "cleanup"]) {
    const changed = structuredClone(sample)
    if (change === "no-handoff") changed.records.splice(1, 1)
    if (change === "no-stop") changed.records.pop()
    if (change === "foreign-session") changed.records[2]!.session_id = "foreign"
    if (change === "foreign-operation") changed.calls[0]!.input.operation_id = "foreign"
    if (change === "unqualified") changed.qualifiedRevision = "f".repeat(64)
    if (change === "page") changed.records[2]!.page!.ok = false
    if (change === "transport") Object.assign(changed.records[2]!, { transport_error: "unknown" })
    if (change === "budget") changed.records[2]!.budget!.calls_left = -1
    if (change === "arguments") changed.calls[1]!.input.depth = 3
    if (change === "unknown-tool") changed.calls[1]!.tool = "loginom_browser_evaluate"
    if (change === "archive") changed.metadata.archiveActive = true
    if (change === "extra-action") changed.records.splice(3, 0, structuredClone(changed.records[2]!))
    if (change === "no-native") changed.records = []
    if (change === "runtime") changed.records[2]!.runtime_revision = "f".repeat(64)
    if (change === "manifest") changed.records[2]!.manifest_sha256 = "f".repeat(64)
    if (change === "target") changed.records[2]!.target = { foreign: true }
    if (change === "cleanup") changed.records[3]!.cleanup = { state: "unknown" }
    expect(recoveryToolsCovered(changed)).toBe(false)
  }
})

test("frozen measurement inputs reject later task or rubric changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "measurement-inputs-"))
  try {
    const tasksDir = path.join(root, "tasks"), file = path.join(root, "frozen.json")
    await cp(path.join(evalsRoot, "fixtures/calibration/sales-by-category"), path.join(tasksDir, "sales-by-category"), { recursive: true })
    const jobs = [{ id: "one", taskId: "sales-by-category", form: "detailed", tasksDir, unit: "example-one.service", resultsDir: path.join(root, "results") }]
    await freezeMeasurementInputs(file, "fixture", jobs)
    await freezeMeasurementInputs(file, "fixture", jobs)
    const task = path.join(tasksDir, "sales-by-category/task.json"), original = await Bun.file(task).json()
    for (const update of [{ prompt: "changed prompt" }, { expected_output: "changed rubric" }]) {
      await Bun.write(task, JSON.stringify({ ...original, ...update }))
      await expect(freezeMeasurementInputs(file, "fixture", jobs)).rejects.toThrow("TASK_PINS_CHANGED")
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("retry bindings reject duplicate units and overlapping results across the entire series", () => {
  const manifest = { version: 1, kind: "analytics-measurements", id: "example", stateDir: "/tmp/example/state", controllerEnvFile: "/tmp/example/env", slotsFile: "/tmp/example/slots", resourceBudgetFile: "/tmp/example/budget", memory: { scope: "actor" }, pins: Object.fromEntries(["controllerEnvSha256", "slotsSha256", "resourceBudgetSha256", "cliBinarySha256", "cliManifestSha256"].map(key => [key, "a".repeat(64)])), jobs: Array.from({ length: 2 }, (_, index) => ({ id: `job-${index}`, taskId: "sample", form: "business", unit: `example-${index}.service`, tasksDir: "/tmp/example/tasks", resultsDir: `/tmp/example/results-${index}`, retryBindings: [{ unit: `retry-${index}.service`, resultsDir: `/tmp/example/retry-${index}` }] })) }
  expect(validateManifest(manifest).jobs).toHaveLength(2)
  expect(() => validateManifest({ ...manifest, jobs: manifest.jobs.map(job => ({ ...job, retryBindings: [{ unit: "example-0.service", resultsDir: "/tmp/example/other" }] })) })).toThrow()
  expect(() => validateManifest({ ...manifest, jobs: manifest.jobs.map(job => ({ ...job, retryBindings: [{ unit: `retry-${job.id}.service`, resultsDir: job.resultsDir + "/nested" }] })) })).toThrow()
})

test("retry source admission requires terminal own worker and preserves original evidence", async () => {
  const { measurementRetrySources } = await import("../src/analytics-measurements")
  const root = await mkdtemp(path.join(os.tmpdir(), "measurement-retry-"))
  try {
    const job = { id: "one", taskId: "sample", form: "business", tasksDir: root, unit: "example.service", resultsDir: root }
    const unit = { Id: job.unit, Delegate: "no", ActiveState: "failed", MainPID: "0", ControlGroup: "", InvocationID: "own" }
    const binding = { unit: job.unit, invocation: "own", manager: "system" }
    const native = path.join(root, "native.json"), entry = path.join(root, "entry.json")
    await Bun.write(native, JSON.stringify({ version: 2, kind: "unactivated-preparation", runDir: root + "/run", unitBinding: binding, attempts: [] }))
    await Bun.write(entry, JSON.stringify({ manifestHash: "pin", job: job.id, binding }))
    expect(await measurementRetrySources(job, unit, native, entry, "pin")).toHaveLength(2)
    const journal = await Bun.file(native).json()
    for (const attempts of [undefined, null, [{ purpose: "measurement", taskId: job.taskId, slotId: "example", attempt: 1 }]]) {
      await Bun.write(native, JSON.stringify({ ...journal, attempts }))
      await expect(measurementRetrySources(job, unit, native, entry, "pin")).rejects.toThrow("RETRY_SOURCE_UNCONFIRMED")
    }
    await Bun.write(native, JSON.stringify(journal))
    await expect(measurementRetrySources(job, { ...unit, ActiveState: "active" }, native, entry, "pin")).rejects.toThrow("RETRY_SOURCE_UNCONFIRMED")
    await Bun.write(entry, JSON.stringify({ manifestHash: "pin", job: job.id, binding: { ...binding, invocation: "foreign" } }))
    await expect(measurementRetrySources(job, unit, native, entry, "pin")).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("retry proof restart preserves immutable authorization and refuses changed native history", async () => {
  const { verifyMeasurementRetryProof } = await import("../src/analytics-measurements")
  const root = await mkdtemp(path.join(os.tmpdir(), "measurement-proof-"))
  try {
    const native = path.join(root, "native.json"), entry = path.join(root, "entry.json"), authorization = path.join(root, "authorization.json")
    await Bun.write(native, "zero admissions"); await Bun.write(entry, "original worker")
    const sources = await Promise.all([native, entry].map(async file => ({ file, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex") })))
    const proof = { manifestHash: "pin", job: "one", generation: 1, sources, releases: [] }
    expect(await exclusiveFact(authorization, proof)).toBe(true)
    expect(await exclusiveFact(authorization, { ...proof, generation: 2 })).toBe(false)
    const child = Bun.spawn([process.execPath, "-e", `const {verifyMeasurementRetryProof}=await import(${JSON.stringify(path.join(evalsRoot, "src/analytics-measurements.ts"))});await verifyMeasurementRetryProof(process.argv[1],"pin","one",1)`, authorization], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    await expect(verifyMeasurementRetryProof(authorization, "pin", "one", 2)).rejects.toThrow("RETRY_PROOF_UNCONFIRMED")
    await Bun.write(native, "measurement admitted")
    await expect(verifyMeasurementRetryProof(authorization, "pin", "one", 1)).rejects.toThrow("RETRY_EVIDENCE_CHANGED")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("retry release gate rejects held server, profile and judge reservations", async () => {
  const { measurementRetryReleases } = await import("../src/analytics-measurements")
  const { acquireJudgeLease, acquireResourceLease, writeLeaseReceipt } = await import("../src/lease")
  const root = await mkdtemp(path.join(os.tmpdir(), "measurement-release-"))
  try {
    const home = path.join(root, "judge"), journal = path.join(root, "journal.json"), lockRoot = path.join(root, "locks")
    await mkdir(home, { mode: 0o700 }); await mkdir(lockRoot, { mode: 0o700 }); await writeLeaseReceipt(journal, { commandId: "example" })
    for (const key of ["server:synthetic", "profile:" + home, "judge:" + home]) {
      const lease = key.startsWith("judge:")
        ? await acquireJudgeLease({ codexHome: home, commandId: "example", journal, lockRoot })
        : await acquireResourceLease({ key, commandId: "example", journal, lockRoot })
      try {
        await expect(measurementRetryReleases([key], lockRoot)).rejects.toThrow("RETRY_RELEASE_UNCONFIRMED")
        const file = path.join(root, "release-" + key.split(":")[0] + ".json")
        await writeLeaseReceipt(file, { version: 2, status: "confirmed", reason: "synthetic-confirmed-release",
          key: lease.reservation.key, token: lease.reservation.token, revision: lease.reservation.revision })
        await lease.release(file)
        expect(await measurementRetryReleases([key], lockRoot)).toHaveLength(1)
      } finally { await lease.close() }
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("exact missing current peer is a complete empty scope and later peer creation changes the snapshot", async () => {
  const userRoot = "viking://user/example", peerRoot = userRoot + "/peers/current"
  let present = false
  let absentStatus = 404, absentCode = "NOT_FOUND"
  const visited: string[] = []
  const server = Bun.serve({ port: 0, fetch(request) {
    const url = new URL(request.url), uri = url.searchParams.get("uri") ?? ""
    visited.push(uri)
    if (url.pathname === "/health") return Response.json({ healthy: true, account_id: "example", user_id: "example", role: "user" })
    if (uri === peerRoot && !present && absentStatus === 200) return Response.json(null)
    if (uri === peerRoot && !present) return Response.json({ status: "error", error: { code: absentCode } }, { status: absentStatus })
    return Response.json({ status: "ok", result: uri.endsWith("memories") ? [] : [{ uri: uri + "/memories", name: "memories", isDir: true }] })
  } })
  const memory = { scope: "actor" as const, userRoot, peerRoot, identity: { account_id: "example", user_id: "example", role: "user" } }
  try {
    const before = await snapshotActor(memory, server.url.href, "fake-key")
    expect(before.roots).toEqual([userRoot + "/memories"])
    expect(before.peers_entries).toEqual([])
    expect(before.peer_root_entries).toEqual({})
    expect(visited).not.toContain(peerRoot + "/memories")
    expect(visited).not.toContain(userRoot + "/peers")
    present = true
    const after = await snapshotActor(memory, server.url.href, "fake-key")
    expect(after.roots).toEqual([userRoot + "/memories", peerRoot + "/memories"])
    expect(JSON.stringify(before)).not.toBe(JSON.stringify(after))
    present = false
    for (const failure of [{ status: 403, code: "NOT_FOUND" }, { status: 404, code: "OTHER" }]) {
      absentStatus = failure.status; absentCode = failure.code
      await expect(snapshotActor(memory, server.url.href, "fake-key")).rejects.toThrow("MEMORY_HTTP")
    }
    absentStatus = 200
    await expect(snapshotActor(memory, server.url.href, "fake-key")).rejects.toThrow("MEMORY_INCOMPLETE_LIST")
  } finally { server.stop(true) }
})

test("garbage collected unit invocation consumes only exact historical worker admissions and still requires full audit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "measurement-gc-"))
  try {
    const job = { id: "one", taskId: "sample", form: "business", tasksDir: root, unit: "example.service", resultsDir: root }
    const unit = { Id: job.unit, Delegate: "no", ActiveState: "inactive", MainPID: "0", ControlGroup: "", InvocationID: "" }
    const binding = { unit: job.unit, invocation: "saved", manager: "system" }
    const entry = { job: job.id, binding }, native = { version: 2, kind: "unactivated-preparation", phase: "cli_admitted", runDir: root + "/run", unitBinding: binding, attempts: [{ purpose: "measurement", taskId: job.taskId, slotId: "example", attempt: 1 }] }
    expect(measurementState(job, unit, native, entry)).toBe("consumed")
    expect(measurementState(job, { ...unit, InvocationID: "new" }, native, entry)).toBe("hold")
    expect(measurementState(job, unit, native)).toBe("hold")
    expect(measurementState(job, unit, { ...native, attempts: [] }, entry)).toBe("hold")
    expect(measurementState(job, unit, { ...native, attempts: undefined }, entry)).toBe("hold")
    expect(measurementState(job, unit, native, { ...entry, binding: { ...binding, invocation: "foreign" } })).toBe("hold")
    expect(measurementState(job, { ...unit, ActiveState: "active" }, undefined)).toBe("running")
    const journal = path.join(root, "journal.json")
    await Bun.write(journal, JSON.stringify(native))
    const slots = { slots: [{ id: "example", username: "example", profileDir: path.join(root, "profile"), historyDir: path.join(root, "history"), workspaceRoot: path.join(root, "workspace") }], judge: { codexHome: path.join(root, "judge") } }
    const audit = await auditMeasurement(job, journal, slots)
    expect(audit.status).toBe("INCOMPLETE")
    expect(audit.checks.some(check => !check.passed)).toBe(true)
    expect(await Bun.file(journal).json()).toEqual(native)
  } finally { await rm(root, { recursive: true, force: true }) }
})
