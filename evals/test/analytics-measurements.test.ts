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
