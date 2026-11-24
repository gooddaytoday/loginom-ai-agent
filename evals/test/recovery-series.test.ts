import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const write = (file: string, value: unknown) => Bun.write(file, JSON.stringify(value))
async function pilot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "recovery-series-"))
  roots.push(dir)
  const run = path.join(dir, "batches", "one", "run"), commandId = crypto.randomUUID()
  const commandJournal = path.join(dir, `run-command-${commandId}.json`)
  const planned = { corpus: "regular", taskId: "double", round: 1 }
  await write(path.join(run, "config.json"), { only: ["double"], repeat: 1, commandJournal })
  const journal = { version: 2, kind: "unactivated-preparation", commandId, runDir: run, attempts: [
    { slotId: "slot-a", taskId: "request-preflight-slot-a", attempt: 1, purpose: "preflight" },
    { slotId: "slot-a", taskId: planned.taskId, attempt: 1, purpose: "measurement" },
  ] }
  await write(commandJournal, journal)
  return { dir, run, planned, commandJournal, journal }
}
async function audit(...args: string[]) {
  const proc = Bun.spawn([process.execPath, "--no-env-file", path.resolve(import.meta.dir, "../script/audit-recovery-series.ts"), ...args], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  if (code) throw Error(stderr)
  return JSON.parse(stdout)
}
test("standalone pilot separates measurement, preflight, CLI, judgement and cleanup", async () => {
  const f = await pilot()
  await write(path.join(f.run, "double/1/result.json"), { task_id: "double", slot_id: "slot-a", attempt: 1,
    status: "failed", exit_code: 1, pass: true, score: 100, judge_status: "scored", environment_cleanup: { status: "confirmed" } })
  const args = ["--run", f.run, "--purpose", "pilot", "--assignment", "pilot-ticket"]
  const report = await audit(...args)
  expect(report).toMatchObject({ purpose: "pilot", assignment: "pilot-ticket", planned: { pilot: 1, corpus: 0 }, preflights: 1,
    keys: [{ taskId: "double", round: 1, attempts: [{ commandId: f.journal.commandId,
      result: { status: "failed", exitCode: 1, pass: true, score: 100, judgeStatus: "scored", cleanup: "confirmed" } }] }] })
  await rm(f.commandJournal)
  const incomplete = await audit(...args)
  expect(incomplete.keys[0].attempts).toEqual([])
  expect(incomplete.gaps).toContainEqual(expect.objectContaining({ admission: "unconfirmed", result: expect.objectContaining({ pass: true, score: 100 }) }))
})

test("held-out ledger preserves planned, missing-result and retried attempts under the assigned key", async () => {
  const first = await pilot(), second = await pilot()
  const experiment = { family: "f", pair: "p", arm: "before", order: 2, condition: "delayed-list" }
  const key = { ...first.planned, experiment }
  const manifest = { id: "paired", seriesPurpose: "held-out", keys: [key, { ...key, round: 2 }] }
  const manifestFile = path.join(first.dir, "manifest.json"), journalFile = path.join(first.dir, "ledger.json")
  await write(manifestFile, manifest)
  const resultFile = path.join(second.run, "double/1/result.json")
  const initial = { task_id: "double", attempt: 1, slot_id: "slot-a", status: "infra_error", pass: null }
  await write(resultFile, { ...initial, status: "completed", pass: true, infra_retry: { initial } })
  await write(journalFile, { campaignId: "paired", manifestHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"),
    batches: [first, second].map(f => ({ resultsDir: path.dirname(f.run), keys: [key] })),
    attempts: [{ key, resultFile, counted: true, pass: true, score: 95, cleanupConfirmed: false }] })
  const args = ["--manifest", manifestFile, "--journal", journalFile]
  const report = await audit(...args)
  expect(report).toMatchObject({ purpose: "held-out", preflights: 2,
    keys: [{ ...key, attempts: [{ commandId: first.journal.commandId, result: null },
      { commandId: second.journal.commandId, result: { status: "completed" }, initial: { status: "infra_error" },
        accounted: { counted: true, pass: true, score: 95, cleanupConfirmed: false } }] }, { round: 2, attempts: [] }] })
  const damaged = path.join(first.run, "double/1/result.json")
  await Bun.write(damaged, "{")
  const partial = await audit(...args)
  expect(partial.gaps).toContainEqual({ unreadableResult: damaged })
  expect(partial.keys[0].attempts).toMatchObject([{ result: null }, { result: { pass: true } }])
})

test("cold evidence binds to the saved package and keeps an unrelated verdict out of the pilot", async () => {
  const f = await pilot(), resultDir = path.join(f.run, "double/1"), cold = path.join(f.dir, "cold.json")
  const bytes = "synthetic package"
  await Bun.write(path.join(resultDir, "artifact/package.lgp"), bytes)
  await write(path.join(resultDir, "result.json"), { task_id: "double", attempt: 1, slot_id: "slot-a", pass: true })
  const evidence = { serverLgpSha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), status: "UI_ALL_NODES_EXECUTED",
    allNodesExecuted: true, settingsApplied: false, saveRequested: false, serverLgpUnchanged: true }
  const args = ["--run", f.run, "--purpose", "pilot", "--assignment", "pilot-ticket", "--cold", cold]
  await write(cold, evidence)
  expect((await audit(...args)).keys[0].attempts[0].cold).toMatchObject({ ...evidence, uiCleanup: null })
  await write(cold, { ...evidence, serverLgpSha256: "1".repeat(64) })
  expect((await audit(...args)).keys[0].attempts[0]).toMatchObject({ result: { pass: true }, cold: { gap: "package-mismatch" } })
})

test("a missing journal is a gap and an old manifest does not relabel its retained verdict as corpus", async () => {
  const f = await pilot(), manifestFile = path.join(f.dir, "manifest.json"), journalFile = path.join(f.dir, "ledger.json")
  const manifest = { id: "old", keys: [f.planned] }, resultFile = path.join(f.run, "double/1/result.json")
  await write(manifestFile, manifest)
  await write(journalFile, { campaignId: "old", manifestHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"),
    startedAttempts: 1, batches: [{ resultsDir: path.dirname(f.run), keys: [f.planned], startedAttempts: 1 }],
    attempts: [{ key: f.planned, resultFile, counted: true, pass: false, score: 53, cleanupConfirmed: true }] })
  await rm(f.commandJournal)
  const report = await audit("--manifest", manifestFile, "--journal", journalFile)
  expect(report).toMatchObject({ purpose: null, planned: { corpus: 0 }, keys: [{ attempts: [] }] })
  expect(report.gaps).toContainEqual({ missing: f.commandJournal })
  expect(report.gaps).toContainEqual(expect.objectContaining({ resultFile, accounted: { counted: true, pass: false, score: 53, cleanupConfirmed: true } }))
  await rm(path.join(f.run, "config.json"))
  expect((await audit("--manifest", manifestFile, "--journal", journalFile)).gaps).toContainEqual({ missing: path.join(f.run, "config.json") })
  await rm(f.run, { recursive: true })
  expect((await audit("--manifest", manifestFile, "--journal", journalFile)).gaps).toContainEqual({ missingNativeAdmissions: 1, source: journalFile })
  await rm(path.dirname(f.run), { recursive: true })
  expect((await audit("--manifest", manifestFile, "--journal", journalFile)).gaps).toContainEqual({ missing: path.dirname(f.run) })
})
