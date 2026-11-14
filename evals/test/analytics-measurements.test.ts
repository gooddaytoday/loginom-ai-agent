import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rm, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { auditMeasurement, exclusiveFact, freezeMeasurementInputs, measurementState, snapshotActor, validateManifest } from "../src/analytics-measurements"
import { evalsRoot } from "../src/config"
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

test("retry release gate rejects a real held judge reservation and accepts its confirmed release", async () => {
  const { measurementRetryReleases } = await import("../src/analytics-measurements")
  const { acquireJudgeLease, writeLeaseReceipt } = await import("../src/lease")
  const root = await mkdtemp(path.join(os.tmpdir(), "measurement-release-"))
  try {
    const home = path.join(root, "judge"), journal = path.join(root, "journal.json"), lockRoot = path.join(root, "locks")
    await mkdir(home, { mode: 0o700 }); await mkdir(lockRoot, { mode: 0o700 }); await writeLeaseReceipt(journal, { commandId: "example" })
    const lease = await acquireJudgeLease({ codexHome: home, commandId: "example", journal, lockRoot })
    try {
      await expect(measurementRetryReleases([`judge:${home}`], lockRoot)).rejects.toThrow("RETRY_RELEASE_UNCONFIRMED")
      const file = path.join(root, "release.json")
      await writeLeaseReceipt(file, { version: 2, status: "confirmed", reason: "judge-unit-terminated", key: lease.reservation.key, token: lease.reservation.token, revision: lease.reservation.revision })
      await lease.release(file)
      expect(await measurementRetryReleases([`judge:${home}`], lockRoot)).toHaveLength(1)
    } finally { await lease.close() }
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
