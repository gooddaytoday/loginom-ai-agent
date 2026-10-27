import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises"
import { writeLeaseReceipt } from "../src/lease"
import { emptyResult } from "../src/run"
import { campaignLimits, campaignTick, type CampaignManifest, type CampaignJournal } from "../script/run-campaign"

test("every blocker and unsuccessful repair expires after the pinned period without progress", async () => {
  const manifest: CampaignManifest = { id: "deadline", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {} }
  const state: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: true, repairer: "EvalRunner", batches: [], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
  for (const blocker of ["HOST_UNAVAILABLE", "HARNESS_REPAIR_INCOMPLETE", "CLEANUP_UNCONFIRMED"]) {
    const before = await campaignTick(manifest, { ...state, blocker }, { active: false, invocation: "", exitCode: 0 }, 1000 + 24 * 3600000 - 1)
    expect(before.action).toBe("blocked")
    const after = await campaignTick(manifest, { ...before.journal, blocker: blocker + "_RECHECKED" },
      { active: false, invocation: "", exitCode: 0 }, 1000 + 24 * 3600000)
    expect(after.action).toBe("finalize")
    expect(after.journal.final).toBe("partial")
    expect(after.journal.lastProgressAt).toBe(1000)
    expect(after.journal.blocker).toContain("NO_PROGRESS_LIMIT")
    expect(after.next).toEqual([])
  }
})

test("corrupt reconciliation data becomes a finite technical blocker without losing accepted quality", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-corrupt-"))
  try {
    const runDir = path.join(root, "batch/run"), out = path.join(runDir, "second/1")
    await mkdir(out, { recursive: true })
    const native = path.join(root, "run-command.json")
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal: native })
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "second", attempt: 1, purpose: "measurement" }] })
    await Bun.write(path.join(out, "result.json"), "{corrupt")
    const keys = ["first", "second"].map(taskId => ({ corpus: "ordinary", taskId, round: 1 }))
    const manifest: CampaignManifest = { id: "corrupt", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1, keys, pins: {} }
    const accepted = { key: keys[0]!, resultFile: "/saved/first/result.json", status: "no_artifact", counted: true, pass: false, score: 0, cleanupConfirmed: true }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "batch", keys: [keys[1]!], resultsDir: path.join(root, "batch"), invocationBefore: "", started: true }],
      attempts: [accepted], lastProgressAt: 1000, consecutiveErrors: 0 }
    const unit = { active: false, invocation: "finished", exitCode: 1 }
    const waiting = await campaignTick(manifest, journal, unit, 2000)
    expect(waiting.action).toBe("blocked")
    expect(waiting.journal.blocker).toBe("CAMPAIGN_RECONCILIATION_FAILED")
    const expired = await campaignTick(manifest, waiting.journal, unit, 1000 + 24 * 3600000)
    expect(expired.action).toBe("finalize")
    expect(expired.journal.final).toBe("partial")
    expect(expired.journal.attempts).toEqual([accepted])
    expect(await Bun.file(path.join(out, "result.json")).text()).toBe("{corrupt")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("an unstarted durable intent obeys repair and no-progress guards before launch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-pending-"))
  try {
    const keys = [{ corpus: "ordinary", taskId: "first", round: 1 }]
    const manifest: CampaignManifest = { id: "pending", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1, keys, pins: {} }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: true, repairer: "EvalRunner", batches: [{ id: "same-intent", keys, resultsDir: root, invocationBefore: "old", started: false }],
      attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    const unit = { active: false, invocation: "old", exitCode: 0 }
    expect((await campaignTick(manifest, journal, unit, 2000)).action).toBe("blocked")
    const expired = await campaignTick(manifest, { ...journal, repairing: false }, unit, 1000 + 25 * 3600000)
    expect(expired.action).toBe("finalize")
    expect(expired.journal.final).toBe("partial")
    expect(expired.journal.batches.map(batch => batch.id)).toEqual(["same-intent"])
    expect(expired.next).toEqual([])
    const allowed = await campaignTick(manifest, { ...journal, repairing: false }, unit, 2000)
    expect(allowed.action).toBe("launch")
    expect(allowed.next).toEqual(keys)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("the pinned campaign budget caps the next batch and defaults to 281 for 234 keys", async () => {
  const keys = ["first", "second", "third"].map(taskId => ({ corpus: "ordinary", taskId, round: 1 }))
  const manifest: CampaignManifest = { id: "remaining", server: "runner2", executor: "EvalBaseline", parallel: 2, batchSize: 3,
    keys, pins: {}, limits: { maxStartedAttempts: 3 } }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [], attempts: [], startedAttempts: 2, lastProgressAt: 1000, consecutiveErrors: 0 }
  const tick = await campaignTick(manifest, journal, { active: false, invocation: "", exitCode: 0 }, 2000)
  expect(tick.next).toEqual([keys[0]!])
  expect(campaignLimits({ ...manifest, keys: Array.from({ length: 234 }, (_, i) => ({ corpus: "ordinary", taskId: String(i), round: 1 })), limits: undefined }))
    .toEqual({ maxStartedAttempts: 281, noProgressMs: 86400000, consecutiveErrors: 3 })
  expect(() => campaignLimits({ ...manifest, limits: { maxStartedAttempts: 0 } })).toThrow("CAMPAIGN_LIMITS_INVALID")
})

test("unknown unit state and a foreign active unit cannot extend the waiting period", async () => {
  const manifest: CampaignManifest = { id: "unknown", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {} }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
  for (const unit of [undefined, { active: true, invocation: "foreign", exitCode: 0 }]) {
    const waiting = await campaignTick(manifest, journal, unit, 2000)
    expect(waiting.action).toBe("blocked")
    const expired = await campaignTick(manifest, waiting.journal, unit, 1000 + 24 * 3600000)
    expect(expired.journal.final).toBe("partial")
    expect(expired.next).toEqual([])
  }
})

test.each([false, true])("a saved result from 25 hours ago is counted without granting another waiting period (active=%s)", async active => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-old-result-"))
  try {
    const now = Date.now(), completedAt = now - 25 * 3600000
    const runDir = path.join(root, "batch/run"), out = path.join(runDir, "first/1")
    await mkdir(out, { recursive: true })
    const native = path.join(root, "run-command.json")
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal: native })
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ slotId: "a", taskId: "first", attempt: 1, purpose: "measurement", completedAt, completionOrder: 1, quality: true }] })
    await writeLeaseReceipt(path.join(out, "result.json"), { ...emptyResult("first", 1, false), status: "no_artifact", pass: false, score: 0,
      judge_status: "no_artifact", harness_error: null, environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } })
    await utimes(path.join(out, "result.json"), new Date(completedAt), new Date(completedAt))
    await writeLeaseReceipt(path.join(out, "cleanup.json"), { processes: { status: "confirmed" }, nextAdmissionAllowed: true })
    const keys = [{ corpus: "ordinary", taskId: "first", round: 1 }]
    const manifest: CampaignManifest = { id: "old", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1, keys, pins: {} }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: true, repairer: "EvalRunner", blocker: "HARNESS_REPAIR_INCOMPLETE", batches: [{ id: "batch", keys,
        resultsDir: path.join(root, "batch"), invocationBefore: "", started: true }], attempts: [], lastProgressAt: completedAt - 1000, consecutiveErrors: 0 }
    const tick = await campaignTick(manifest, journal, { active, invocation: "finished", exitCode: 1 }, now)
    expect(tick.journal.attempts).toMatchObject([{ counted: true, pass: false }])
    expect(tick.journal.lastProgressAt).toBe(completedAt)
    expect(tick.journal.final).toBe("partial")
    expect(tick.action).toBe("finalize")
    if (active) {
      expect(tick.journal.cleanupVerified).not.toBe(true)
      expect(tick.journal.batches[0]!.accounted).not.toBe(true)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("an active batch reconciles completed attempts before its no-progress deadline without dispatching", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-active-progress-"))
  try {
    const now = Date.now(), completedAt = now - 1000
    const runDir = path.join(root, "batch/run"), out = path.join(runDir, "first/1")
    await mkdir(out, { recursive: true })
    const native = path.join(root, "run-command.json")
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal: native })
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "first", attempt: 1, purpose: "measurement", completedAt, completionOrder: 1, quality: true },
        { taskId: "second", attempt: 1, purpose: "measurement" }] })
    await writeLeaseReceipt(path.join(out, "result.json"), { ...emptyResult("first", 1, false), status: "no_artifact", pass: false, score: 0,
      judge_status: "no_artifact", harness_error: null, environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } })
    await writeLeaseReceipt(path.join(out, "cleanup.json"), { processes: { status: "confirmed" }, nextAdmissionAllowed: true })
    const keys = ["first", "second"].map(taskId => ({ corpus: "ordinary", taskId, round: 1 }))
    const manifest: CampaignManifest = { id: "active-progress", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 2, keys, pins: {} }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "batch", keys, resultsDir: path.join(root, "batch"), invocationBefore: "", started: true }],
      attempts: [], lastProgressAt: now - 25 * 3600000, consecutiveErrors: 2 }
    const active = { active: true, invocation: "running", exitCode: 0 }
    const tick = await campaignTick(manifest, journal, active, now)
    expect(tick.action).toBe("wait")
    expect(tick.next).toEqual([])
    expect(tick.journal.attempts).toMatchObject([{ key: keys[0], counted: true, completedAt }])
    expect(tick.journal.lastProgressAt).toBe(completedAt)
    expect(tick.journal.consecutiveErrors).toBe(0)
    expect(tick.journal.final).toBeUndefined()
    expect(tick.journal.blocker).toBeUndefined()
    expect(tick.journal.batches[0]!.accounted).not.toBe(true)
    expect(tick.journal.cleanupVerified).not.toBe(true)
    const again = await campaignTick(manifest, tick.journal, active, now + 1)
    expect(again.action).toBe("wait")
    expect(again.journal).toEqual(tick.journal)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("a saved active result needs a matching native completion to reset the no-progress clock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-active-admission-"))
  try {
    const runDir = path.join(root, "batch/run"), out = path.join(runDir, "first/1")
    await mkdir(out, { recursive: true })
    const native = path.join(root, "run-command.json")
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal: native })
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "first", attempt: 1, purpose: "measurement" }] })
    await writeLeaseReceipt(path.join(out, "result.json"), { ...emptyResult("first", 1, false), status: "no_artifact", pass: false, score: 0,
      judge_status: "no_artifact", harness_error: null, environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } })
    const keys = [{ corpus: "ordinary", taskId: "first", round: 1 }]
    const manifest: CampaignManifest = { id: "active-admission", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys, pins: {}, limits: { noProgressMs: 1000 } }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "batch", keys, resultsDir: path.join(root, "batch"), invocationBefore: "", started: true }],
      attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    const active = { active: true, invocation: "running", exitCode: 0 }
    const waiting = await campaignTick(manifest, journal, active, 1999)
    expect(waiting.action).toBe("wait")
    expect(waiting.journal.lastProgressAt).toBe(1000)
    expect(waiting.journal.attempts).toEqual([])
    const expired = await campaignTick(manifest, waiting.journal, active, 2000)
    expect(expired).toMatchObject({ action: "finalize", next: [], journal: { final: "partial", blocker: "NO_PROGRESS_LIMIT", lastProgressAt: 1000, attempts: [] } })
    expect(expired.journal.cleanupVerified).not.toBe(true)
    expect(expired.journal.batches[0]!.accounted).not.toBe(true)
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "first", attempt: 1, purpose: "measurement", completedAt: 1900, completionOrder: 1, quality: false }] })
    const mismatched = await campaignTick(manifest, journal, active, 1999)
    expect(mismatched.action).toBe("wait")
    expect(mismatched.journal.lastProgressAt).toBe(1000)
    expect(mismatched.journal.attempts).toMatchObject([{ counted: true, completedAt: undefined }])
    const stale = await campaignTick(manifest, mismatched.journal, active, 2000)
    expect(stale.journal.final).toBe("partial")
    expect(stale.journal.lastProgressAt).toBe(1000)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("an active batch waits for its config and admission receipt without retaining transient blockers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-active-preparation-"))
  try {
    const runDir = path.join(root, "batch/run")
    await mkdir(runDir, { recursive: true })
    const keys = [{ corpus: "ordinary", taskId: "first", round: 1 }]
    const manifest: CampaignManifest = { id: "active-preparation", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1, keys, pins: {} }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "batch", keys, resultsDir: path.join(root, "batch"), invocationBefore: "", started: true, startedAttempts: 1 }],
      attempts: [], startedAttempts: 1, lastProgressAt: 1000, consecutiveErrors: 0 }
    const active = { active: true, invocation: "a".repeat(32), exitCode: 0 }
    const missing = await campaignTick(manifest, journal, active, 2000)
    expect(missing.action).toBe("wait")
    expect(missing.journal.blocker).toBeUndefined()
    const terminal = await campaignTick(manifest, journal, { ...active, active: false }, 2000)
    expect(terminal.journal.blocker).toBe("ADMISSION_STATE_UNCONFIRMED")
    const commandId = crypto.randomUUID(), native = path.join(root, `run-command-${commandId}.json`)
    await Bun.write(path.join(runDir, "config.json"), "{writing")
    const writing = await campaignTick(manifest, missing.journal, active, 2100)
    expect(writing.journal.blocker).toBeUndefined()
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal: native })
    const unrecorded = await campaignTick(manifest, writing.journal, active, 2200)
    expect(unrecorded.journal.blocker).toBeUndefined()
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", commandId, phase: "cli_admitted", runDir,
      slotIds: ["a"], unitBinding: { invocation: active.invocation } })
    const initial = await campaignTick(manifest, unrecorded.journal, active, 2300)
    expect(initial.journal.blocker).toBeUndefined()
    expect(initial.journal.startedAttempts).toBe(1)
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "first", attempt: 1, purpose: "measurement" }] })
    const admitted = await campaignTick(manifest, initial.journal, active, 2400)
    expect(admitted.action).toBe("wait")
    expect(admitted.journal.blocker).toBeUndefined()
    expect(admitted.journal.lastProgressAt).toBe(1000)
    expect(admitted.journal.attempts).toEqual([])
    expect(admitted.journal.batches[0]!.accounted).not.toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("budget counts native measurement admissions without results and excludes preflight requests", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-budget-"))
  try {
    const runDir = path.join(root, "batch/run")
    await mkdir(runDir, { recursive: true })
    const keys = ["first", "second", "third"].map(taskId => ({ corpus: "ordinary", taskId, round: 1 }))
    const manifest: CampaignManifest = { id: "budget", server: "runner2", executor: "EvalBaseline", parallel: 2, batchSize: 3,
      keys, pins: {}, limits: { maxStartedAttempts: 3 } }
    const native = path.join(root, "run-command.json")
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal: native })
    await writeLeaseReceipt(native, { version: 2, kind: "unactivated-preparation", commandId: "command", runDir,
      attempts: [{ slotId: "a", taskId: "request-preflight-a", attempt: 1, purpose: "preflight" },
        { slotId: "b", taskId: "request-preflight-b", attempt: 1, purpose: "preflight" },
        ...keys.map(key => ({ slotId: "a", taskId: key.taskId, attempt: 1, purpose: "measurement" }))] })
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "batch", keys, resultsDir: path.join(root, "batch"), invocationBefore: "", started: true }],
      attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    const tick = await campaignTick(manifest, journal, { active: false, invocation: "finished", exitCode: 1 }, 2000)
    expect(tick.journal.startedAttempts).toBe(3)
    expect(tick.journal.final).toBe("partial")
    expect(tick.journal.blocker).toBe("ATTEMPT_BUDGET_EXHAUSTED")
    expect(tick.next).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("an owned active batch expires honestly and a completed full result survives delivery waiting", async () => {
  const manifest: CampaignManifest = { id: "owned-deadline", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, limits: { noProgressMs: 1000 } }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [{ id: "owned", keys: manifest.keys, resultsDir: "/unread-active-results", started: true, invocationBefore: "prior" }],
    attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
  const active = { active: true, invocation: "owned", exitCode: 0 }
  expect((await campaignTick(manifest, journal, active, 1999)).action).toBe("wait")
  const expired = await campaignTick(manifest, journal, active, 2000)
  expect(expired).toMatchObject({ action: "finalize", next: [], journal: { final: "partial", blocker: "NO_PROGRESS_LIMIT" } })
  expect(expired.journal.cleanupVerified).not.toBe(true)
  expect(expired.journal.batches[0]!.accounted).not.toBe(true)
  expect(expired.journal.attempts).toEqual([])
  for (const unit of [undefined, { active: false, invocation: "finished", exitCode: 0 }]) {
    const completed = await campaignTick(manifest, { ...journal, final: "full", cleanupVerified: true }, unit, 3000)
    expect(completed.journal.final).toBe("full")
    expect(completed.action).toBe("finalize")
  }
})
