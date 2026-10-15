import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, readFile, rename } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"
import { evalsRoot } from "../src/config"
import { createEvalrunnerManifest, loadEvalrunnerCorpus, reserveEvalrunnerSeries, readEvalrunnerSeries, admitEvalrunnerSlot, durableEvalrunnerJson, evalrunnerHash } from "../src/evalrunner-series"
import { acquireEvalrunnerSeriesLease } from "../src/evalrunner-controller"
import { auditEvalrunnerPreInference, claimEvalrunnerRecovery, resolveEvalrunnerReadiness } from "../src/evalrunner-recovery"

const issue = "01a13fd2-a6b1-7459-b641-fb41b04eb229"

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-recovery-"))
  const config = { root, results: path.join(root, "results"), profile: path.join(root, "profile") }
  await mkdir(config.results); await mkdir(config.profile)
  const manifest = createEvalrunnerManifest({ issue, task: "first", scope: "readiness-calc", pins: {}, corpus: await loadEvalrunnerCorpus(evalsRoot),
    series: path.join(config.results, `v02-readiness-calc-${issue}`) })
  await reserveEvalrunnerSeries(config, manifest)
  const selected = await admitEvalrunnerSlot(config, manifest, manifest.slots[0]!, "first")
  await acquireEvalrunnerSeriesLease(config, manifest)
  const run = path.join(selected, "runs/one"), attempt = path.join(run, "calc-data-double/1"), archive = config.profile + ".history/closed"
  await mkdir(attempt, { recursive: true }); await mkdir(path.join(archive, "data"), { recursive: true })
  const db = new Database(path.join(archive, "data/loginom-ai-agent.db"), { create: true })
  db.exec("CREATE TABLE session(id TEXT);CREATE TABLE message(id TEXT)"); db.close()
  await durableEvalrunnerJson(path.join(attempt, "cleanup.json"), { result: { status: "confirmed" },
    processes: { status: "confirmed", capture_complete: true, unknownProcesses: [], observation_mode: "continuous", verification: [{ owned_remaining: 0 }, { owned_remaining: 0 }] },
    stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed", ...(stage === "profile_history" ? { path: archive } : {}) })) })
  await Bun.write(path.join(attempt, "events.jsonl"), JSON.stringify({ type: "error", error: { name: "ProviderModelNotFoundError" } }) + "\n")
  await durableEvalrunnerJson(path.join(run, "summary.json"), { storage_leftovers: [], config: { infra_retries: 0 },
    task_ids: ["calc-data-double"], tasks: [{ id: "calc-data-double", attempts: [{ status: "failed", failure_kind: "provider", session_id: "", judge_attempts: 0,
      errors: ["ProviderModelNotFoundError"], tokens: { input: 0, output: 0, reasoning: 0 }, counters: { toolCalls: 0 }, environment_cleanup: { status: "confirmed" } }] }] })
  const owner = path.join(root, "operations/stand.lease/owner.json"), admission = path.join(root, "operations/series-admissions", issue + "-readiness-calc/readiness-calc-r1.json")
  const proofFile = path.join(root, "proof.json")
  await durableEvalrunnerJson(proofFile, { kind: "lab77-independent-pre-inference-refusal-proof", status: "VERIFIED_PRE_INFERENCE_PROVIDER_REFUSAL", issue, scope: manifest.scope,
    series: manifest.series, manifestSha256: evalrunnerHash(await readFile(path.join(manifest.series, "manifest.json"))),
    globalAdmissionSha256: evalrunnerHash(await readFile(admission)), standOwnerSha256: evalrunnerHash(await readFile(owner)),
    sessionCount: 0, messageCount: 0, productInferenceCalls: 0, judgeCalls: 0, dbSourcesUnchanged: true, processCaptureComplete: true, unknownProcesses: 0,
    emptyVerificationChecks: 2, currentProfileAndStorage: { originalProfile: "CLEAN", newProfile: "CLEAN", storage: "EMPTY_AND_ISOLATED" }, releaseCreated: false })
  return { config, manifest, attempt, run, archive, owner, admission, proofFile }
}

test("only the authorized pre-inference calc refusal is eligible; source evidence and DB stay unchanged", async () => {
  const f = await fixture()
  try {
    const before = await readFile(path.join(f.archive, "data/loginom-ai-agent.db"))
    expect(await auditEvalrunnerPreInference(f.config, { series: f.manifest.series, proofFile: f.proofFile })).toMatchObject({ productInferenceCalls: 0, judgeCalls: 0 })
    expect(await readFile(path.join(f.archive, "data/loginom-ai-agent.db"))).toEqual(before)
    const db = new Database(path.join(f.archive, "data/loginom-ai-agent.db")); db.exec("INSERT INTO session VALUES ('inference-or-unknown')"); db.close()
    await expect(auditEvalrunnerPreInference(f.config, { series: f.manifest.series, proofFile: f.proofFile })).rejects.toThrow("Session/message")
  } finally { await rm(f.config.root, { recursive: true, force: true }) }
})

test.each(["session", "judge", "unknown", "cleanup", "events", "full", "owner", "empty-release"])("pre-inference recovery refuses %s evidence", async kind => {
  const f = await fixture()
  try {
    if (kind === "full") {
      const raw = JSON.parse(await Bun.file(f.proofFile).text()); raw.scope = "full"; await Bun.write(f.proofFile, JSON.stringify(raw))
    } else if (kind === "empty-release") await Bun.write(path.join(f.manifest.series, "release.json"), "")
    else if (kind === "owner") await Bun.write(f.owner, "foreign")
    else if (kind === "events") await Bun.write(path.join(f.attempt, "events.jsonl"), '{"type":"step_finish","sessionID":"unexpected"}\n')
    else if (kind === "unknown" || kind === "cleanup") {
      const file = path.join(f.attempt, "cleanup.json"), value = await Bun.file(file).json()
      if (kind === "unknown") value.processes.unknownProcesses = [{ pid: 999 }]
      else value.result.status = "failed"
      await Bun.write(file, JSON.stringify(value))
    } else {
      const file = path.join(f.run, "summary.json"), value = await Bun.file(file).json()
      value.tasks[0].attempts[0][kind === "session" ? "session_id" : "judge_attempts"] = kind === "session" ? "ses_unexpected" : 1
      await Bun.write(file, JSON.stringify(value))
    }
    await expect(auditEvalrunnerPreInference(f.config, { series: f.manifest.series, proofFile: f.proofFile })).rejects.toThrow()
    expect(await Bun.file(f.admission).exists()).toBe(true)
    expect(await Bun.file(path.join(f.manifest.series, "release.json")).exists()).toBe(kind === "empty-release")
  } finally { await rm(f.config.root, { recursive: true, force: true }) }
})

test("recovery request is spent durably once, including concurrent and crashed requests", async () => {
  const f = await fixture()
  try {
    const audit = await auditEvalrunnerPreInference(f.config, { series: f.manifest.series, proofFile: f.proofFile })
    const results = await Promise.allSettled([claimEvalrunnerRecovery(f.config, audit), claimEvalrunnerRecovery(f.config, audit)])
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1)
    await expect(claimEvalrunnerRecovery(f.config, audit)).rejects.toThrow("already requested")
    expect(await Bun.file(f.owner).exists()).toBe(true)
    expect(await Bun.file(f.admission).exists()).toBe(true)
  } finally { await rm(f.config.root, { recursive: true, force: true }) }
})

test("recovered generation requires its exact receipt, preserves original admissions, and cannot be reused or generalized", async () => {
  const f = await fixture()
  try {
    const original = await readFile(f.admission)
    const audit = await auditEvalrunnerPreInference(f.config, { series: f.manifest.series, proofFile: f.proofFile })
    const directory = await claimEvalrunnerRecovery(f.config, audit)
    await expect(resolveEvalrunnerReadiness(f.config, issue, "readiness-calc")).rejects.toThrow()
    const series = f.manifest.series + "-g1", file = path.join(directory, "receipt.json"), pins = { configSha256: "new-pins" }
    await rename(path.dirname(f.owner), path.join(directory, "original-stand.lease"))
    const preserved = [
      { file: f.admission, sha256: evalrunnerHash(original) },
      { file: path.join(directory, "original-stand.lease/owner.json"), sha256: audit.ownerSha256 },
      ...audit.evidence.map(item => ({ file: path.join(f.manifest.series, item.path), sha256: item.sha256 })),
    ]
    await durableEvalrunnerJson(file, { status: "RECOVERED_PRE_INFERENCE", issue, scope: "readiness-calc", generation: 1, newSeries: series,
      originalReleased: false, newPinsSha256: evalrunnerHash(JSON.stringify(pins)), preserved, audit, productInferenceCalls: 0, judgeCalls: 0 })
    const manifest = createEvalrunnerManifest({ ...f.manifest, series, generation: 1, pins, recovery: { file, sha256: evalrunnerHash(await readFile(file)) } })
    await reserveEvalrunnerSeries(f.config, manifest)
    expect(await resolveEvalrunnerReadiness(f.config, issue, "readiness-calc")).toBe(series)
    const selected = await admitEvalrunnerSlot(f.config, manifest, manifest.slots[0]!, "recovered")
    expect(selected).toBe(path.join(series, "slots/readiness-calc-r1"))
    expect(await readFile(f.admission)).toEqual(original)
    await expect(admitEvalrunnerSlot(f.config, manifest, manifest.slots[0]!, "another-task")).rejects.toThrow("already admitted")
    await expect(reserveEvalrunnerSeries(f.config, manifest)).rejects.toThrow("already reserved")
    expect(() => createEvalrunnerManifest({ ...manifest, scope: "full" })).toThrow("Unauthorized")
    expect(await Bun.file(path.join(f.manifest.series, "release.json")).exists()).toBe(false)
    await Bun.write(f.admission, "changed")
    await expect(readEvalrunnerSeries(f.config, series)).rejects.toThrow("original evidence changed")
  } finally { await rm(f.config.root, { recursive: true, force: true }) }
})

test("a crash after request never authorizes a second recovery or the next readiness", async () => {
  const f = await fixture()
  try {
    const audit = await auditEvalrunnerPreInference(f.config, { series: f.manifest.series, proofFile: f.proofFile })
    const child = Bun.spawn([process.execPath, "-e", `
      import {claimEvalrunnerRecovery} from ${JSON.stringify(path.join(evalsRoot, "src/evalrunner-recovery.ts"))};
      await claimEvalrunnerRecovery(${JSON.stringify(f.config)},${JSON.stringify(audit)});process.exit(17);
    `], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(17)
    await expect(claimEvalrunnerRecovery(f.config, audit)).rejects.toThrow("already requested")
    await expect(resolveEvalrunnerReadiness(f.config, issue, "readiness-calc")).rejects.toThrow()
    expect(await Bun.file(f.owner).exists()).toBe(true)
  } finally { await rm(f.config.root, { recursive: true, force: true }) }
})
