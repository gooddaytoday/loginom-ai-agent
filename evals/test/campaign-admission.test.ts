import { expect, test } from "bun:test"
import { isQualityResult } from "../src/report"
import { emptyResult } from "../src/run"
import { createCampaignAdmission } from "../src/prepared-run"
import { buildJobs, runSlotQueue } from "../src/scheduler"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { tryCampaignLock } from "../src/campaign-lock"
import { assessNodeAttempt } from "../src/node-evals"
import { nodeCaseIds } from "../src/node-cases"

test("node quality FAIL keeps the fourth job available while technical ERROR closes admissions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-node-admission-"))
  const ids = nodeCaseIds.slice(0, 4)
  try {
    for (const id of ids) await Bun.write(path.join(root, "tasks", id, "task.json"), JSON.stringify({ id, checklist: [{ id: "crosstable", required: true }] }))
    for (const technical of [false, true]) {
      for (const id of ids) {
        await Bun.write(path.join(root, id, "1/result.json"), JSON.stringify({ ...emptyResult(id, 1, false),
          status: technical ? "infra_error" : "no_artifact", environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }))
        await Bun.write(path.join(root, id, "1/cleanup.json"), JSON.stringify({ processes: { status: "confirmed" },
          result: { status: "confirmed", error: null }, stages: ["processes", "diagnostics", "writer", "ready", "profile_history"].map(stage => ({ stage, status: "confirmed" })) }))
      }
      const admissions: { taskId: string; quality?: boolean }[] = []
      const admission = createCampaignAdmission({ consecutiveErrors: 0, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000 }, async () => {})
      try {
        const queued = await runSlotQueue({ jobs: buildJobs(ids, 1), slots: ["one"], signal: admission.signal,
          async execute(_slot, job) {
            const entry: (typeof admissions)[number] = { taskId: job.taskId }
            admissions.push(entry)
            const assessed = await assessNodeAttempt({ runDir: root, taskId: job.taskId, tasksDir: path.join(root, "tasks") })
            await admission.complete(entry, assessed.code !== 2)
            return { result: assessed.verdict, quarantine: false }
          } })
        expect(queued.results.map(row => row.result)).toEqual(Array(technical ? 3 : 4).fill(technical ? "ERROR" : "FAIL"))
        expect(admissions.every(entry => entry.quality === !technical)).toBe(true)
        expect(queued.unassigned).toHaveLength(technical ? 1 : 0)
        expect(admission.signal.aborted).toBe(technical)
      } finally { await admission.close() }
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("a third infrastructure error during the journal read refuses a new durable admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-read-race-"))
  const control = { journalFile: path.join(root, "journal.json"), lockFile: path.join(root, "controller.lock"), manifestHash: "a".repeat(64) }
  await writeLeaseReceipt(control.journalFile, { manifestHash: control.manifestHash, repairing: false })
  const admission = createCampaignAdmission({ consecutiveErrors: 2, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000, control }, async () => {})
  let wrote = false, finished = false, reading = false
  const pending = admission.admit(async () => { wrote = true }).finally(() => { finished = true })
  try {
    for (let i = 0; i < 100 && !finished; i++) {
      const release = await tryCampaignLock(control.lockFile)
      if (!release) { reading = true; await admission.complete({}, false); break }
      await release()
    }
    expect(reading).toBe(true)
    expect(await pending).toBe(false)
    expect(wrote).toBe(false)
    expect(admission.signal.reason).toBe("CONSECUTIVE_INFRASTRUCTURE_ERRORS")
  } finally { await pending.catch(() => {}); await admission.close(); await rm(root, { recursive: true, force: true }) }
})

test("a busy controller lock keeps timers and healthy completion live and protects the durable admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-contention-"))
  const control = { journalFile: path.join(root, "journal.json"), lockFile: path.join(root, "controller.lock"), manifestHash: "a".repeat(64) }
  await writeLeaseReceipt(control.journalFile, { manifestHash: control.manifestHash, repairing: false, reportingError: "MULTICA_UNAVAILABLE" })
  let saved: unknown, wrote = false, ticked = false
  const admission = createCampaignAdmission({ consecutiveErrors: 1, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000, control }, async state => { saved = state })
  const release = await tryCampaignLock(control.lockFile)
  const timer = setTimeout(() => { ticked = true }, 10)
  const pending = admission.admit(async () => {
    expect(await tryCampaignLock(control.lockFile)).toBeUndefined()
    await writeLeaseReceipt(path.join(root, "run-command.json"), { attempts: [{ taskId: "first", purpose: "measurement" }] })
    wrote = true
  })
  try {
    await admission.complete({}, true)
    await Bun.sleep(35)
    expect(ticked).toBe(true)
    expect(wrote).toBe(false)
    expect(saved).toMatchObject({ consecutiveErrors: 0 })
    expect(admission.signal.aborted).toBe(false)
    await release!()
    expect(await pending).toBe(true)
    expect(await readLeaseReceipt(path.join(root, "run-command.json"))).toEqual({ attempts: [{ taskId: "first", purpose: "measurement" }] })
    expect(admission.signal.aborted).toBe(false)
  } finally { clearTimeout(timer); await admission.close(); await rm(root, { recursive: true, force: true }) }
})

test("an admission waiting for the controller rechecks repair state after acquiring its lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-repair-"))
  const control = { journalFile: path.join(root, "journal.json"), lockFile: path.join(root, "controller.lock"), manifestHash: "a".repeat(64) }
  await writeLeaseReceipt(control.journalFile, { manifestHash: control.manifestHash, repairing: false })
  const admission = createCampaignAdmission({ consecutiveErrors: 0, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000, control }, async () => {})
  const release = await tryCampaignLock(control.lockFile)
  let wrote = false
  const pending = admission.admit(async () => { wrote = true })
  try {
    await Bun.sleep(30)
    await writeLeaseReceipt(control.journalFile, { manifestHash: control.manifestHash, repairing: true })
    await release!()
    expect(await pending).toBe(false)
    expect(wrote).toBe(false)
    expect(admission.signal.reason).toBe("CAMPAIGN_REPAIRING")
  } finally { await admission.close(); await rm(root, { recursive: true, force: true }) }
})

test("an unconfirmed campaign identity closes admissions without writing a native attempt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-identity-"))
  const control = { journalFile: path.join(root, "journal.json"), lockFile: path.join(root, "controller.lock"), manifestHash: "a".repeat(64) }
  const admission = createCampaignAdmission({ consecutiveErrors: 0, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000, control }, async () => {})
  let wrote = false
  try {
    await writeLeaseReceipt(control.journalFile, { manifestHash: "b".repeat(64), repairing: false })
    await expect(admission.admit(async () => { wrote = true })).rejects.toThrow("CAMPAIGN_CONTROL_UNCONFIRMED")
    expect(wrote).toBe(false)
    expect(admission.signal.aborted).toBe(true)
    const release = await tryCampaignLock(control.lockFile)
    expect(release).toBeFunction()
    await release!()
  } finally { await admission.close(); await rm(root, { recursive: true, force: true }) }
})

test("cancellation while waiting for the campaign lock creates no attempt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-cancel-"))
  const control = { journalFile: path.join(root, "journal.json"), lockFile: path.join(root, "controller.lock"), manifestHash: "a".repeat(64) }
  const admission = createCampaignAdmission({ consecutiveErrors: 0, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000, control }, async () => {})
  const execution = new AbortController(), release = await tryCampaignLock(control.lockFile)
  let wrote = false
  try {
    const pending = admission.admit(async () => { wrote = true }, execution.signal)
    execution.abort()
    expect(await pending).toBe(false)
    expect(wrote).toBe(false)
  } finally { await release!(); await admission.close(); await rm(root, { recursive: true, force: true }) }
})

test("a campaign blocker closes new admissions without creating a durable attempt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-blocker-"))
  const control = { journalFile: path.join(root, "journal.json"), lockFile: path.join(root, "controller.lock"), manifestHash: "a".repeat(64) }
  const admission = createCampaignAdmission({ consecutiveErrors: 0, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000, control }, async () => {})
  let wrote = false
  try {
    await writeLeaseReceipt(control.journalFile, { manifestHash: control.manifestHash, repairing: false, blocker: "HARNESS_REPAIR_REQUIRED" })
    expect(await admission.admit(async () => { wrote = true })).toBe(false)
    expect(wrote).toBe(false)
    expect(admission.signal.reason).toBe("CAMPAIGN_BLOCKED")
  } finally { await admission.close(); await rm(root, { recursive: true, force: true }) }
})

test("an external final closes admissions despite fresh local progress and lets healthy attempts finish", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-gate-"))
  const control = { journalFile: path.join(root, "journal.json"), lockFile: path.join(root, "controller.lock"), manifestHash: "a".repeat(64) }
  const started = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>()
  const admitted: number[] = [], completed: number[] = []
  await writeLeaseReceipt(control.journalFile, { manifestHash: control.manifestHash, repairing: false })
  const admission = createCampaignAdmission({ consecutiveErrors: 0, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000, control }, async () => {})
  const pending = runSlotQueue({ jobs: buildJobs(["task"], 5), slots: ["first", "healthy"], signal: admission.signal,
    async admit(_slot, job) { return admission.admit(async () => { admitted.push(job.index) }) },
    async execute(_slot, job) {
      if (admitted.length === 2) started.resolve()
      await finish.promise
      await admission.complete({}, true)
      completed.push(job.index)
      return { result: job.index, quarantine: false }
    } })
  try {
    await started.promise
    await writeLeaseReceipt(control.journalFile, { manifestHash: control.manifestHash, repairing: false, final: "partial", published: true })
    finish.resolve()
    const run = await pending
    expect(admitted).toEqual([0, 1])
    expect(completed.sort()).toEqual([0, 1])
    expect(run.results.map(row => row.result)).toEqual([0, 1])
    expect(run.unassigned.map(job => job.index)).toEqual([2, 3, 4])
    expect(admission.signal.reason).toBe("CAMPAIGN_FINAL")
  } finally { finish.resolve(); await pending.catch(() => {}); await admission.close(); await rm(root, { recursive: true, force: true }) }
})

test("campaign admission stops at the seeded third infrastructure completion and drains a healthy slot", async () => {
  const started = Promise.withResolvers<void>(), third = Promise.withResolvers<void>(), healthy = Promise.withResolvers<void>()
  const execution = new AbortController()
  const admissions: { index: number; completedAt?: number; completionOrder?: number; quality?: boolean }[] = []
  let saved: unknown
  const admission = createCampaignAdmission({ consecutiveErrors: 2, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 60_000 }, async state => { saved = structuredClone({ ...state, attempts: admissions }) })
  const pending = runSlotQueue({ jobs: buildJobs(["task"], 5), slots: ["broken", "healthy"], signal: AbortSignal.any([execution.signal, admission.signal]),
    async execute(slot, job) {
      const entry: (typeof admissions)[number] = { index: job.index }
      admissions.push(entry)
      if (slot === "broken") { await started.promise; await admission.complete(entry, false); third.resolve() }
      else { started.resolve(); await healthy.promise; expect(execution.signal.aborted).toBe(false); await admission.complete(entry, true) }
      return { result: job.index, quarantine: false }
    } })
  try {
    await third.promise
    expect(admission.signal.aborted).toBe(true)
    expect(saved).toMatchObject({ admissionBlocker: "CONSECUTIVE_INFRASTRUCTURE_ERRORS", consecutiveErrors: 3, attempts: [{ index: 0, quality: false, completionOrder: 1 }, { index: 1 }] })
    healthy.resolve()
    const finished = await pending
    expect(finished.results.map(row => row.result)).toEqual([0, 1])
    expect(finished.unassigned.map(job => job.index)).toEqual([2, 3, 4])
    expect(saved).toMatchObject({ admissionBlocker: "CONSECUTIVE_INFRASTRUCTURE_ERRORS", consecutiveErrors: 0, attempts: [{ index: 0, quality: false, completionOrder: 1 }, { index: 1, quality: true, completionOrder: 2 }] })
    expect(admission.signal.aborted).toBe(true)
  } finally { started.resolve(); healthy.resolve(); await pending; await admission.close() }
})

test("campaign no-progress deadline closes only new admissions and a late result remains saved", async () => {
  const finish = Promise.withResolvers<void>(), started = Promise.withResolvers<void>()
  const execution = new AbortController()
  let saved: unknown
  const admission = createCampaignAdmission({ consecutiveErrors: 0, errorLimit: 3, lastProgressAt: Date.now(), noProgressMs: 20 }, async state => { saved = state })
  const pending = runSlotQueue({ jobs: buildJobs(["task"], 2), slots: ["healthy"], signal: AbortSignal.any([execution.signal, admission.signal]),
    async execute(_slot, job) {
      started.resolve()
      await finish.promise
      expect(execution.signal.aborted).toBe(false)
      await admission.complete({}, true)
      return { result: job.index, quarantine: false }
    } })
  try {
    await started.promise
    await Promise.race([new Promise(resolve => admission.signal.addEventListener("abort", resolve, { once: true })), Bun.sleep(100)])
    expect(admission.signal.aborted).toBe(true)
    await Bun.sleep(0)
    expect(saved).toMatchObject({ admissionBlocker: "NO_PROGRESS_LIMIT" })
    finish.resolve()
    const run = await pending
    expect(run.results.map(row => row.result)).toEqual([0])
    expect(run.unassigned.map(row => row.index)).toEqual([1])
    expect(saved).toMatchObject({ admissionBlocker: "NO_PROGRESS_LIMIT", consecutiveErrors: 0 })
  } finally { finish.resolve(); await pending; await admission.close() }
})

test("only a quality result advances the campaign deadline", async () => {
  const admission = createCampaignAdmission({ consecutiveErrors: 1, errorLimit: 10, lastProgressAt: Date.now() - 250, noProgressMs: 300 }, async () => {})
  try {
    await admission.complete({}, isQualityResult({ ...emptyResult("task", 1, false), status: "completed", judge_status: "scored", pass: false }))
    await Bun.sleep(80)
    expect(admission.signal.aborted).toBe(false)
    await admission.complete({}, false)
    await Promise.race([new Promise(resolve => admission.signal.addEventListener("abort", resolve, { once: true })), Bun.sleep(400)])
    expect(admission.signal.reason).toBe("NO_PROGRESS_LIMIT")
  } finally { await admission.close() }
})

test("a completed attempt is persisted before its slot can admit the next job", async () => {
  const save = Promise.withResolvers<void>(), writing = Promise.withResolvers<void>()
  const starts: number[] = []
  const admission = createCampaignAdmission(undefined, async () => { writing.resolve(); await save.promise })
  const pending = runSlotQueue({ jobs: buildJobs(["task"], 2), slots: ["slot"], signal: admission.signal,
    async execute(_slot, job) {
      starts.push(job.index)
      await admission.complete({}, true)
      return { result: job.index, quarantine: false }
    } })
  try {
    await writing.promise
    expect(starts).toEqual([0])
    save.resolve()
    expect((await pending).results.map(row => row.result)).toEqual([0, 1])
  } finally { save.resolve(); await pending; await admission.close() }
})

test("campaign quality includes scored FAIL and excludes technical failure", () => {
  const qualityFail = { ...emptyResult("task", 1, false), status: "completed" as const, judge_status: "scored" as const, pass: false, score: 0 }
  expect(isQualityResult(qualityFail)).toBe(true)
  expect(isQualityResult({ ...qualityFail, judge_status: "no_artifact" })).toBe(true)
  expect(isQualityResult({ ...qualityFail, pass: null })).toBe(false)
  expect(isQualityResult({ ...qualityFail, failure_kind: "provider" })).toBe(false)
  expect(isQualityResult({ ...qualityFail, harness_error: "broken harness" })).toBe(false)
  for (const status of ["infra_error", "harness_error", "interrupted"] as const) expect(isQualityResult({ ...qualityFail, status })).toBe(false)
  expect(isQualityResult({ ...qualityFail, judge_status: "error" })).toBe(false)
})
