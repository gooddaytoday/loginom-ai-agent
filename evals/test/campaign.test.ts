import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm, stat, utimes } from "node:fs/promises"
import { emptyResult } from "../src/run"
import { writeLeaseReceipt } from "../src/lease"
import { campaignEnvironment, campaignTick, prepareCampaignBatch, publishCampaign, type CampaignManifest, type CampaignJournal } from "../script/run-campaign"
import { pendingJudgeFixture } from "./helpers/pending-judge"
import { runOfflineJudge } from "../src/judge-environment"
import { loadConfig } from "../src/config"

async function admitRun(runDir: string, taskIds: string[]) {
  const commandJournal = path.join(runDir, "native-command.json")
  await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir,
    attempts: taskIds.map(taskId => ({ taskId, attempt: 1, purpose: "measurement" })) })
  await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal })
}

test("campaign finishes only the pending judge then selects the next missing key once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-pending-offline-"))
  try {
    const fixture = await pendingJudgeFixture(root)
    const key = { corpus: "ordinary", taskId: fixture.original.result.task_id, round: 1 }
    const next = { ...key, taskId: "calc-data-double" }
    const manifest: CampaignManifest = { id: "pending-offline", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1, keys: [key, next],
      pins: { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli", EVAL_AGENT_MODEL: "pinned/model", EVAL_AGENT_VARIANT: "medium",
        JUDGE_MODEL: "judge", JUDGE_REASONING: "xhigh" } }
    await writeLeaseReceipt(fixture.resultFile, { ...fixture.original.result, environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } })
    await writeLeaseReceipt(path.join(path.dirname(fixture.resultFile), "cleanup.json"), { processes: { status: "confirmed" }, nextAdmissionAllowed: true })
    const commandJournal = path.join(fixture.runDir, "native-command.json")
    await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir: fixture.runDir,
      attempts: [{ taskId: key.taskId, attempt: 1, purpose: "measurement" }] })
    await writeLeaseReceipt(path.join(fixture.runDir, "config.json"), { ...await Bun.file(path.join(fixture.runDir, "config.json")).json(), commandJournal })
    const state: CampaignJournal = { manifestHash: "a".repeat(64), server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "one", keys: [key], resultsDir: path.dirname(fixture.runDir), invocationBefore: "before", started: true }],
      attempts: [], lastProgressAt: Date.now() - 1000, consecutiveErrors: 0 }
    const pending = await campaignTick(manifest, state, { active: false, invocation: "done", exitCode: 1 })
    expect(pending.action).toBe("judge")
    if (pending.action !== "judge") throw Error("pending judge was not selected")
    expect(pending.pendingJudge.resultFile).toBe(fixture.resultFile)
    const judged = await runOfflineJudge({ ...fixture.config, judge: { ...fixture.config.judge, env: { FAKE_CODEX_VERDICT: "fail" } } },
      fixture.fixture.lockRoot, pending.pendingJudge.resultFile)
    expect(judged).toMatchObject({ code: 0, judgeCleanupConfirmed: true })
    await utimes(fixture.resultFile, new Date(), (Date.now() + 0.5) / 1000)
    const completedAt = (await stat(fixture.resultFile)).mtimeMs
    expect(Number.isInteger(completedAt)).toBe(false)
    const observedAt = Math.ceil(completedAt)
    const after = await campaignTick(manifest, pending.journal, { active: false, invocation: "done", exitCode: 1 }, observedAt)
    expect(after.next).toEqual([next])
    expect(after.journal.attempts).toMatchObject([{ key, counted: true, pass: false, score: 0 }])
    expect(after.journal.startedAttempts).toBe(1)
    expect(after.journal.consecutiveErrors).toBe(0)
    const repeated = await campaignTick(manifest, after.journal, { active: false, invocation: "done", exitCode: 1 }, observedAt + 1)
    expect(repeated.next).toEqual([next])
    expect(repeated.journal.attempts).toHaveLength(1)
    const config = { stateDir: path.join(root, "controller"), controllerLock: path.join(root, "controller.lock"), harnessRoot: path.join(root, "harness"),
      slotsFile: path.join(root, "slots.json"), batchEnvFile: path.join(root, "batch.env"), resourceBudgetFile: path.join(root, "budget.json"),
      corpora: { ordinary: { entrypoint: "src/run.ts", tasks: "tasks" } } }
    await prepareCampaignBatch(manifest, repeated.journal, repeated.next, "done", config)
    const environment = Object.fromEntries((await Bun.file(config.batchEnvFile).text()).trim().split("\n").map(line => {
      const separator = line.indexOf("=")
      return [line.slice(0, separator), JSON.parse(line.slice(separator + 1))]
    }))
    expect(loadConfig(["--dry-run"], environment).campaign?.lastProgressAt).toBe(Math.floor(completedAt))
    expect(repeated.journal.lastProgressAt).toBe(Math.floor(completedAt))
    expect((await Bun.file(fixture.trace).text()).trim().split("\n").map(line => JSON.parse(line)).filter(row => row.kind === "start")).toHaveLength(1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign retains a saved generation for pending judge even when the measurement budget is exhausted", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-pending-judge-"))
  try {
    const key = { corpus: "ordinary", taskId: "first", round: 1 }
    const manifest: CampaignManifest = { id: "pending-judge", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [key], pins: {}, limits: { maxStartedAttempts: 1 } }
    const runDir = path.join(root, "run")
    const out = path.join(runDir, key.taskId, "1")
    await mkdir(out, { recursive: true })
    await writeLeaseReceipt(path.join(out, "result.json"), { ...emptyResult(key.taskId, 1, false), status: "completed", exit_code: 0,
      package_path: "/user/saved.lgp", judge_status: "skipped", score: null, pass: null,
      environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } })
    await writeLeaseReceipt(path.join(out, "cleanup.json"), { processes: { status: "confirmed" }, nextAdmissionAllowed: true })
    await admitRun(runDir, [key.taskId])
    const state: CampaignJournal = { manifestHash: "fixture", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "one", keys: [key], resultsDir: root, invocationBefore: "before", started: true }],
      attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    const tick = await campaignTick(manifest, state, { active: false, invocation: "done", exitCode: 1 }, 2000)
    expect(tick.action).toBe("judge")
    expect(tick.next).toEqual([])
    expect(tick.journal.batches[0]?.accounted).toBe(false)
    expect(tick.journal.startedAttempts).toBe(1)
    expect(tick.journal.consecutiveErrors).toBe(0)
    expect(tick.journal.lastProgressAt).toBe(1000)
    expect(tick.journal.attempts).toMatchObject([{ counted: false }])
    expect(tick.journal.attempts[0]?.completedAt).toBeUndefined()
    expect(tick.journal.attempts[0]?.cleanupConfirmed).toBe(false)
    expect((await campaignTick(manifest, tick.journal, { active: true, invocation: "running", exitCode: 0 }, 3000)).action).toBe("wait")
    expect((await campaignTick(manifest, { ...tick.journal, repairing: true }, { active: false, invocation: "done", exitCode: 1 }, 3000)).action).toBe("blocked")
    expect((await campaignTick(manifest, { ...tick.journal, blocker: "TECHNICAL_REPAIR" }, { active: false, invocation: "done", exitCode: 1 }, 3000)).action).toBe("blocked")
    const expired = await campaignTick(manifest, tick.journal, { active: false, invocation: "done", exitCode: 1 }, 1000 + 24 * 3600000)
    expect(expired.action).toBe("finalize")
    expect(expired.journal.final).toBe("partial")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("a recovered earlier quality result preserves later infrastructure errors in their original order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-recovered-order-"))
  try {
    const ids = ["a", "b", "c"]
    const manifest: CampaignManifest = { id: "recovered-order", server: "runner2", executor: "EvalBaseline", parallel: 3, batchSize: 3,
      keys: ids.map(taskId => ({ corpus: "ordinary", taskId, round: 1 })), pins: {} }
    const runDir = path.join(root, "run")
    const attempts = []
    for (const [index, id] of ids.entries()) {
      const resultFile = path.join(runDir, id, "1/result.json")
      await Bun.write(resultFile, JSON.stringify({ ...emptyResult(id, 1, false), status: index === 0 ? "no_artifact" : "infra_error",
        pass: index === 0 ? false : null, score: index === 0 ? 0 : null, judge_status: index === 0 ? "no_artifact" : "skipped",
        environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }))
      await Bun.write(path.join(runDir, id, "1/cleanup.json"), JSON.stringify({ processes: { status: "confirmed" }, nextAdmissionAllowed: true }))
      attempts.push({ key: manifest.keys[index]!, resultFile, status: index === 0 ? "no_artifact" : "infra_error",
        counted: false, pass: null, score: null, cleanupConfirmed: true, completedAt: (index + 1) * 1000 })
    }
    await admitRun(runDir, ids)
    await writeLeaseReceipt(path.join(runDir, "native-command.json"), { version: 2, kind: "unactivated-preparation", runDir,
      attempts: ids.map((taskId, index) => ({ taskId, attempt: 1, purpose: "measurement", completedAt: (index + 1) * 1000,
        completionOrder: index + 1, quality: index === 0 })) })
    const journal: CampaignJournal = { manifestHash: "fixture", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "one", keys: manifest.keys, resultsDir: root, invocationBefore: "before", started: true }],
      attempts, lastProgressAt: 500, consecutiveErrors: 3, blocker: "CONSECUTIVE_INFRASTRUCTURE_ERRORS" }
    const tick = await campaignTick(manifest, journal, { active: false, invocation: "done", exitCode: 1 }, 4000)
    expect(tick.journal.consecutiveErrors).toBe(2)
    expect(tick.journal.lastProgressAt).toBe(1000)
    expect(tick.journal.attempts).toHaveLength(3)
    expect(tick.journal.attempts[0]?.counted).toBe(true)
    expect(tick.journal.blocker).toBe("CONSECUTIVE_INFRASTRUCTURE_ERRORS")
    const repeated = await campaignTick(manifest, tick.journal, { active: false, invocation: "done", exitCode: 1 }, 5000)
    expect(repeated.journal.consecutiveErrors).toBe(2)
    expect(repeated.journal.attempts).toHaveLength(3)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign uses explicit experiment pins and canonical server paths for both preflight and dispatch", () => {
  const manifest: CampaignManifest = { id: "pins", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli",
      EVAL_AGENT_MODEL: "pinned/model", EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "pinned-judge", JUDGE_REASONING: "xhigh",
      EVAL_SLOTS_FILE: "/old/slots.json", EVAL_RESOURCE_BUDGET_FILE: "/old/budget.json" } }
  const server = { slotsFile: "/current/slots.json", resourceBudgetFile: "/current/budget.json" }
  expect(campaignEnvironment(manifest, server)).toEqual({ ...manifest.pins, EVAL_SLOTS_FILE: server.slotsFile,
    EVAL_RESOURCE_BUDGET_FILE: server.resourceBudgetFile })
  for (const key of ["EVAL_CLI_MODE", "EVAL_CLI_BIN", "EVAL_AGENT_MODEL", "EVAL_AGENT_VARIANT", "JUDGE_MODEL", "JUDGE_REASONING"]) {
    const unpinned = structuredClone(manifest)
    delete unpinned.pins[key]
    expect(() => campaignEnvironment(unpinned, server)).toThrow("CAMPAIGN_EXPERIMENT_PINS_REQUIRED")
  }
})

test("campaign accounts a saved quality FAIL without summary and selects only the missing key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-"))
  try {
    const manifest: CampaignManifest = { id: "campaign-1", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }, { corpus: "ordinary", taskId: "second", round: 1 }], pins: {} }
    const batch = { id: "batch-1", keys: [manifest.keys[0]!], resultsDir: path.join(root, "batch-1"), invocationBefore: "prior", started: true }
    const out = path.join(batch.resultsDir, "run-1/first/1")
    await mkdir(out, { recursive: true })
    await Bun.write(path.join(out, "result.json"), JSON.stringify({ ...emptyResult("first", 1, false), status: "no_artifact",
      score: 0, pass: false, judge_status: "no_artifact", harness_error: null, interrupted: false,
      environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }))
    await Bun.write(path.join(out, "cleanup.json"), JSON.stringify({ processes: { status: "confirmed" }, nextAdmissionAllowed: true }))
    await admitRun(path.dirname(path.dirname(out)), ["first"])
    const state: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [batch], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    const tick = await campaignTick(manifest, state, { active: false, invocation: "finished", exitCode: 0 }, 2000)
    expect(tick.action).toBe("start")
    expect(tick.journal.attempts).toMatchObject([{ key: manifest.keys[0], counted: true, pass: false }])
    expect(tick.next).toEqual([manifest.keys[1]!])
    const again = await campaignTick(manifest, tick.journal, { active: false, invocation: "finished", exitCode: 0 }, 3000)
    expect(again.journal.attempts).toHaveLength(1)
    expect(again.next).toEqual([manifest.keys[1]!])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign leaves an unowned live batch untouched and blocks conflicting dispatch", async () => {
  const manifest: CampaignManifest = { id: "live", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {} }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
  const tick = await campaignTick(manifest, journal, { active: true, invocation: "live", exitCode: 0 }, 2000)
  expect(tick.action).toBe("blocked")
  expect(tick.journal.blocker).toBe("UNOWNED_BATCH_ACTIVE")
  expect(tick.journal.attempts).toEqual([])
})

test("campaign retains quality with telemetry gaps but rejects an observed resource excess", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-resources-"))
  try {
    const manifest: CampaignManifest = { id: "resources", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {} }
    const batch = { id: "batch-1", keys: manifest.keys, resultsDir: root, invocationBefore: "prior", started: true }
    const out = path.join(root, "run-1/first/1")
    await mkdir(out, { recursive: true })
    const result = { ...emptyResult("first", 1, false), status: "no_artifact", score: 0, pass: false,
      judge_status: "no_artifact", harness_error: null, environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }
    await Bun.write(path.join(out, "result.json"), JSON.stringify(result))
    await Bun.write(path.join(out, "cleanup.json"), JSON.stringify({ processes: { status: "confirmed" }, nextAdmissionAllowed: true }))
    await admitRun(path.dirname(path.dirname(out)), ["first"])
    const state: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [batch], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    for (const [status, code, counted] of [["incomplete", "RESOURCE_OBSERVATIONS_INCOMPLETE", true], ["failed", "RESOURCE_BUDGET_EXCEEDED", false]] as const) {
      await Bun.write(path.join(root, "run-1/resource-acceptance.json"), JSON.stringify({ checks: [{ status, codes: [code] }] }))
      const tick = await campaignTick(manifest, state, { active: false, invocation: "finished", exitCode: 1 }, 2000)
      expect(tick.journal.attempts[0]).toMatchObject({ counted, pass: false, resources: { status, codes: [code] } })
      expect(tick.next).toEqual(counted ? [] : manifest.keys)
      expect(await Bun.file(path.join(out, "result.json")).json()).toEqual(result)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign durably records a batch before exposing its parameters and reuses that admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-admission-"))
  try {
    const manifest: CampaignManifest = { id: "admission", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli",
        EVAL_AGENT_MODEL: "pinned/model", EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "judge", JUDGE_REASONING: "xhigh" } }
    const state: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0,
      cleanupVerified: true, verificationAttempted: true, verificationDir: path.join(root, "previous-verification") }
    const config = { stateDir: root, controllerLock: path.join(root, "controller.lock"), harnessRoot: path.join(root, "harness"), slotsFile: path.join(root, "slots.json"),
      batchEnvFile: path.join(root, "batch.env"), resourceBudgetFile: path.join(root, "budget.json"),
      corpora: { ordinary: { entrypoint: "src/run.ts", tasks: "tasks" } } }
    const batch = await prepareCampaignBatch(manifest, state, manifest.keys, "old-unit", config)
    const saved = await Bun.file(path.join(root, "journal.json")).json()
    expect(saved.batches).toEqual([batch])
    expect(saved.cleanupVerified).not.toBe(true)
    expect(saved.verificationAttempted).not.toBe(true)
    expect(saved.verificationDir).toBeUndefined()
    const env = await Bun.file(config.batchEnvFile).text()
    expect(env).toContain('EVAL_AGENT_MODEL="pinned/model"')
    expect(env).toContain(`EVAL_ENTRYPOINT=${JSON.stringify(path.join(config.harnessRoot, "src/run.ts"))}`)
    expect(env).toContain(`EVAL_TASKS=${JSON.stringify(path.join(config.harnessRoot, "tasks"))}`)
    expect(env).toContain(`EVAL_SLOTS_FILE=${JSON.stringify(config.slotsFile)}`)
    expect(env).toContain(`EVAL_RESULTS_DIR=${JSON.stringify(batch.resultsDir)}`)
    expect(env).toContain('EVAL_CAMPAIGN_CONSECUTIVE_ERRORS="0"')
    expect(env).toContain('EVAL_CAMPAIGN_ERROR_LIMIT="3"')
    expect(env).toContain('EVAL_CAMPAIGN_LAST_PROGRESS_AT="1000"')
    expect(env).toContain('EVAL_CAMPAIGN_NO_PROGRESS_MS="86400000"')
    expect(env).toContain(`EVAL_CAMPAIGN_JOURNAL=${JSON.stringify(path.join(root, "journal.json"))}`)
    expect(env).toContain(`EVAL_CAMPAIGN_LOCK=${JSON.stringify(config.controllerLock)}`)
    expect(env).toContain(`EVAL_CAMPAIGN_MANIFEST_HASH=${JSON.stringify(state.manifestHash)}`)
    expect((await prepareCampaignBatch(manifest, state, manifest.keys, "old-unit", config)).id).toBe(batch.id)
    expect(state.batches).toHaveLength(1)
    config.corpora.ordinary.entrypoint = "/old/harness/src/run.ts"
    await expect(prepareCampaignBatch(manifest, state, manifest.keys, "old-unit", config)).rejects.toThrow("CAMPAIGN_CORPUS_PATH")
    expect(await Bun.file(config.batchEnvFile).text()).toBe(env)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("three consecutive empty request preflights block a campaign without spending measurement attempts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-preflight-"))
  try {
    const manifest: CampaignManifest = { id: "preflight", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, limits: { consecutiveErrors: 6 } }
    let state: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [], attempts: [{ key: manifest.keys[0]!, resultFile: path.join(root, "earlier/result.json"),
        status: "infra_error", counted: false, pass: null, score: null, cleanupConfirmed: true }], lastProgressAt: 1000, consecutiveErrors: 0 }
    const failures = ["REQUEST_PREFLIGHT_EMPTY", "REQUEST_PREFLIGHT_FAILED", "REQUEST_PREFLIGHT_EMPTY", "REQUEST_PREFLIGHT_EMPTY", "REQUEST_PREFLIGHT_EMPTY"]
    for (let failure = 1; failure <= failures.length; failure++) {
      const resultsDir = path.join(root, String(failure))
      await mkdir(path.join(resultsDir, "run"), { recursive: true })
      await Bun.write(path.join(resultsDir, "run/request-preflight.json"), JSON.stringify({ code: failures[failure - 1], evidence: "run.json" }))
      await admitRun(path.join(resultsDir, "run"), [])
      state.batches.push({ id: `probe-${failure}`, keys: manifest.keys, resultsDir, invocationBefore: "prior", started: true })
      const tick = await campaignTick(manifest, state, { active: false, invocation: `probe-${failure}`, exitCode: 2 }, 2000 + failure)
      expect(tick.action).toBe(failure < failures.length ? "start" : "blocked")
      expect(tick.journal.consecutiveErrors).toBe(failure)
      expect(tick.journal.attempts).toEqual(state.attempts)
      expect(tick.journal.lastProgressAt).toBe(1000)
      state = tick.journal
    }
    expect(state.blocker).toBe("REQUEST_PREFLIGHT_EMPTY")
    const again = await campaignTick(manifest, state, { active: false, invocation: "probe-5", exitCode: 2 }, 3000)
    expect(again.action).toBe("blocked")
    expect(again.next).toEqual([])
    expect(again.journal.consecutiveErrors).toBe(5)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign publishes its saved FAIL once and reads back the final issue and disabled wakeup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-publish-"))
  const comments: { id: string; content: string }[] = []
  const attachments: { id: string; filename: string }[] = []
  let uploaded = new Uint8Array()
  let downloads = 0
  let unwantedAgentRuns = 0
  const issue = { revision: 1, status: "in_progress" }
  const wakeup = { id: "timer", enabled: true }
  const server = Bun.serve({ port: 0, async fetch(request) {
    const route = new URL(request.url).pathname
    if (route === "/api/upload-file") {
      const data = await request.formData()
      const file = data.get("file") as File
      uploaded = new Uint8Array(await file.arrayBuffer())
      const attachment = { id: "archive", filename: file.name }
      attachments.push(attachment)
      return Response.json(attachment)
    }
    if (route.endsWith("/download")) { downloads++; return new Response(uploaded) }
    if (route.endsWith("/attachments")) return Response.json(attachments)
    if (route.endsWith("/comments/trigger-preview")) return Response.json({ agents: [{ id: "baseline" }] })
    if (route.endsWith("/comments")) {
      if (request.method === "POST") {
        const data = await request.json()
        if (!data.suppress_agent_ids?.includes("baseline")) unwantedAgentRuns++
        comments.push({ ...data, id: "report" })
      }
      return Response.json(request.method === "POST" ? comments.at(-1) : comments)
    }
    if (route.endsWith("/disable")) { wakeup.enabled = false; return Response.json(wakeup) }
    if (route.endsWith("/wakeups")) return Response.json([wakeup])
    if (request.method === "PUT") Object.assign(issue, await request.json())
    return Response.json(issue)
  } })
  try {
    const manifest: CampaignManifest = { id: "publish", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, wakeupIds: ["timer"] }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [], attempts: [{ key: manifest.keys[0]!, resultFile: "/saved/result.json", status: "no_artifact",
        counted: true, pass: false, score: 0, cleanupConfirmed: true, resources: { status: "incomplete", codes: ["RESOURCE_OBSERVATIONS_INCOMPLETE"] } }], lastProgressAt: 1000, consecutiveErrors: 0, final: "full", cleanupVerified: true }
    await Bun.write(path.join(root, "token"), "fixture-token", { mode: 0o600 })
    const config = { stateDir: root, multica: { url: `http://127.0.0.1:${server.port}`, workspace: "lab", issueId: "issue", tokenFile: path.join(root, "token") } }
    await publishCampaign(manifest, journal, config)
    await publishCampaign(manifest, journal, config)
    expect(comments).toHaveLength(1)
    expect(comments[0]!.content).toContain("полный")
    expect(comments[0]!.content).toContain("FAIL")
    expect(comments[0]!.content).toContain("ресурсы=incomplete; RESOURCE_OBSERVATIONS_INCOMPLETE")
    expect(issue.status).toBe("in_review")
    expect(wakeup.enabled).toBe(false)
    expect(journal.published).toBe(true)
    expect(attachments).toHaveLength(1)
    expect(downloads).toBeGreaterThan(0)
    expect(uploaded.length).toBeGreaterThan(0)
    expect(unwantedAgentRuns).toBe(0)
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
})
