import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { campaignTick, controlCampaign, prepareCampaignBatch, runCampaign, type CampaignManifest } from "../script/run-campaign"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { emptyResult } from "../src/run"

async function controlFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-control-"))
  const manifest: CampaignManifest = { id: "control", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, issueId: "issue", wakeupIds: [] }
  const manifestFile = path.join(root, "manifest.json"), serverFile = path.join(root, "server.json")
  const config = { server: "runner2", stateRoot: root, harnessRoot: root, controllerLock: path.join(root, "controller.lock"),
    batchUnit: "getty@tty63.service", batchEnvFile: path.join(root, "batch.env"), acceptedHarness: "a".repeat(40),
    slotsFile: path.join(root, "slots.json"), resourceBudgetFile: path.join(root, "budget.json"), experimentPinsFile: path.join(root, "pins.json"),
    corpusPinsFile: path.join(root, "corpus-pins.json"), preflightCommand: [process.execPath, "--no-env-file", path.join(root, "preflight.ts")],
    verifyCommand: [process.execPath, "--no-env-file", path.join(root, "verify.ts"), "{verificationDir}"], corpora: {},
    multica: { url: "http://127.0.0.1:1", workspace: "lab", tokenFile: path.join(root, "token") } }
  await writeLeaseReceipt(manifestFile, manifest)
  await writeLeaseReceipt(serverFile, config)
  await Bun.write(path.join(root, "preflight.ts"), `
const file = ${JSON.stringify(path.join(root, "preflights.json"))}
const count = await Bun.file(file).json().catch(() => 0)
await Bun.write(file, JSON.stringify(count + 1))
`)
  return { root, manifest, manifestFile, serverFile, config, async close() { await rm(root, { recursive: true, force: true }) } }
}

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("reservation is idempotent and a different campaign cannot claim the same server", async () => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    expect(reserved).toMatchObject({ campaignId: "control", executor: "EvalBaseline", batches: [], attempts: [] })
    expect(await readLeaseReceipt(path.join(fixture.root, "owner.json"))).toEqual({ campaignId: "control" })
    expect(await readLeaseReceipt(path.join(fixture.root, "control/manifest.json"))).toEqual(fixture.manifest)
    const repeated = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    expect(repeated).toEqual(reserved)
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(1)
    const other = path.join(fixture.root, "other.json")
    await writeLeaseReceipt(other, { ...fixture.manifest, id: "other" })
    await expect(controlCampaign(other, fixture.serverFile, "reserve")).rejects.toThrow("CAMPAIGN_SERVER_BUSY")
    expect(await Bun.file(path.join(fixture.root, "other/journal.json")).exists()).toBe(false)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("reservation preflights only the first bounded batch of a larger campaign", async () => {
  const fixture = await controlFixture()
  try {
    fixture.manifest.keys.push({ corpus: "ordinary", taskId: "second", round: 1 })
    await writeLeaseReceipt(fixture.manifestFile, fixture.manifest)
    const script = path.join(fixture.root, "preflight.ts"), selection = path.join(fixture.root, "selection.json")
    await Bun.write(script, await Bun.file(script).text() + `\nawait Bun.write(${JSON.stringify(selection)}, JSON.stringify(process.argv.slice(-4)))`)
    await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    expect(await Bun.file(selection).json()).toEqual(["ordinary", "first", "1", "1"])
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("service refuses pending judge from another harness before changing resources", async () => {
  const fixture = await controlFixture()
  const api = Bun.serve({ port: 0, fetch(request) {
    if (request.method === "GET" && new URL(request.url).pathname.endsWith("/comments")) return Response.json([])
    return new Response(null, { status: 503 })
  } })
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const resultsDir = path.join(fixture.root, "control/batches/1"), runDir = path.join(resultsDir, "saved")
    const resultFile = path.join(runDir, "first/1/result.json"), commandJournal = path.join(runDir, "native-command.json")
    await mkdir(path.dirname(resultFile), { recursive: true, mode: 0o700 })
    await writeLeaseReceipt(resultFile, { ...emptyResult("first", 1, false), status: "completed", package_path: "/saved.lgp" })
    const original = await Bun.file(resultFile).text()
    await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "first", attempt: 1, purpose: "measurement" }] })
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal })
    await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved,
      batches: [{ id: "one", keys: fixture.manifest.keys, resultsDir, invocationBefore: "before", started: true }] })
    await Bun.write(path.join(fixture.root, "token"), "fixture-token", { mode: 0o600 })
    await writeLeaseReceipt(fixture.serverFile, { ...fixture.config,
      multica: { ...fixture.config.multica, url: `http://127.0.0.1:${api.port}` } })
    const finished = await runCampaign(fixture.manifestFile, fixture.serverFile, true)
    expect(finished).toMatchObject({ blocker: "CAMPAIGN_JUDGE_RECOVERY_FAILED", blockerKind: "technical", startedAttempts: 1 })
    expect(await Bun.file(path.join(fixture.root, "control/verification")).exists()).toBe(false)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
    expect(await Bun.file(resultFile).text()).toBe(original)
  } finally { api.stop(true); await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("repair assigns one repairer without changing progress, attempts or the fixed manifest", async () => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const journalFile = path.join(fixture.root, "control/journal.json")
    const blocked = { ...reserved, blocker: "TECHNICAL_REPAIR", consecutiveErrors: 3, emptyPreflights: 3, startedAttempts: 1 }
    await writeLeaseReceipt(journalFile, blocked)
    const repairing = await controlCampaign(fixture.manifestFile, fixture.serverFile, "repair", "EvalRunner")
    expect(repairing).toMatchObject({ ...blocked, repairing: true, repairer: "EvalRunner" })
    expect(await controlCampaign(fixture.manifestFile, fixture.serverFile, "repair", "EvalRunner")).toEqual(repairing)
    await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "repair", "EvalBaseline")).rejects.toThrow("CAMPAIGN_REPAIRER_MISMATCH")
    expect(await readLeaseReceipt(fixture.manifestFile)).toEqual(fixture.manifest)
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(1)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("verified repair resumes with fresh cleanup evidence and preserved quality, deadline and budget", async () => {
  const fixture = await controlFixture()
  try {
    fixture.manifest.keys.push({ corpus: "ordinary", taskId: "second", round: 1 })
    await writeLeaseReceipt(fixture.manifestFile, fixture.manifest)
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const journalFile = path.join(fixture.root, "control/journal.json"), resultFile = path.join(fixture.root, "result.json")
    const attempts = [{ key: fixture.manifest.keys[0]!, resultFile, status: "no_artifact", counted: true, pass: false, score: 0, cleanupConfirmed: true }]
    await Bun.write(resultFile, JSON.stringify(attempts[0]))
    const original = await Bun.file(resultFile).text()
    await writeLeaseReceipt(journalFile, { ...reserved, attempts, repairing: true, repairer: "EvalRunner", blocker: "TECHNICAL_REPAIR",
      consecutiveErrors: 3, emptyPreflights: 3, startedAttempts: 1, verificationAttempted: true, cleanupVerified: false })
    await Bun.write(path.join(fixture.root, "verify.ts"), `
import { mkdir } from "node:fs/promises"
const dir = process.argv[2]!
await mkdir(dir)
await Bun.write(dir + "/proof.json", "confirmed")
const file = ${JSON.stringify(path.join(fixture.root, "verifications.json"))}
const entries = await Bun.file(file).json().catch(() => [])
await Bun.write(file, JSON.stringify([...entries, dir]))
`)
    const resumed = await controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")
    expect(resumed).toMatchObject({ repairing: false, repairer: null, consecutiveErrors: 0, emptyPreflights: 0,
      cleanupVerified: true, verificationAttempted: true, lastProgressAt: reserved.lastProgressAt, startedAttempts: 1, attempts })
    expect(resumed.blocker).toBeUndefined()
    expect(resumed.final).toBeUndefined()
    expect(await Bun.file(resultFile).text()).toBe(original)
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(2)
    const verification = await Bun.file(path.join(fixture.root, "verifications.json")).json()
    expect(verification).toHaveLength(1)
    expect(verification[0]).toStartWith(path.join(fixture.root, "control/verification/"))
    expect(await controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")).toEqual(resumed)
    expect(await Bun.file(path.join(fixture.root, "verifications.json")).json()).toEqual(verification)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("an expired technical blocker ends repair admission without resetting the deadline", async () => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const lastProgressAt = Date.now() - 25 * 3600000
    await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved, lastProgressAt,
      blocker: "TECHNICAL_REPAIR", consecutiveErrors: 3, startedAttempts: 1 })
    const finished = await controlCampaign(fixture.manifestFile, fixture.serverFile, "repair", "EvalRunner")
    expect(finished).toMatchObject({ final: "partial", lastProgressAt, repairing: false, repairer: null,
      consecutiveErrors: 3, startedAttempts: 1, blocker: "NO_PROGRESS_LIMIT:TECHNICAL_REPAIR" })
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(1)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("controller CLI reserves without starting measurements and rejects unknown operations", async () => {
  const fixture = await controlFixture()
  try {
    const args = [process.execPath, "--no-env-file", path.resolve(import.meta.dir, "../script/run-campaign.ts"),
      "--manifest", fixture.manifestFile, "--server", fixture.serverFile, "--operation"]
    const reserved = Bun.spawn([...args, "reserve"], { stdout: "pipe", stderr: "pipe" })
    const output = await new Response(reserved.stdout).text()
    expect(await reserved.exited).toBe(0)
    expect(JSON.parse(output)).toMatchObject({ campaignId: "control", batches: [], attempts: [] })
    const journal = await Bun.file(path.join(fixture.root, "control/journal.json")).text()
    const rejected = Bun.spawn([...args, "invalid"], { stdout: "pipe", stderr: "pipe" })
    expect(await rejected.exited).toBe(2)
    expect(await new Response(rejected.stderr).text()).toContain("CAMPAIGN_OPERATION_INVALID")
    expect(await Bun.file(path.join(fixture.root, "control/journal.json")).text()).toBe(journal)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1").each(["repair", "resume", "service"] as const)("published partial permits %s to confirm cleanup without reopening measurements", async operation => {
  const fixture = await controlFixture()
  const api = Bun.serve({ port: 0, fetch(request) {
    const route = new URL(request.url).pathname
    if (route.endsWith("/comments")) return Response.json([{ id: "ops-final", content: "<!-- eval-campaign:control -->\n<!-- eval-final:partial -->\n# частичный: хост недоступен" }])
    if (route.endsWith("/wakeups")) return Response.json([])
    return Response.json({ revision: 1, status: "in_review" })
  } })
  try {
    fixture.config.multica.url = `http://127.0.0.1:${api.port}`
    await Bun.write(fixture.config.multica.tokenFile, "fixture-token", { mode: 0o600 })
    await writeLeaseReceipt(fixture.serverFile, fixture.config)
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved, blocker: "TECHNICAL_REPAIR",
      repairing: true, repairer: "EvalRunner", consecutiveErrors: 3 })
    await Bun.write(path.join(fixture.root, "verify.ts"), 'import { mkdir } from "node:fs/promises"; await mkdir(process.argv[2]!)')
    const finished = operation === "service" ? await runCampaign(fixture.manifestFile, fixture.serverFile, true)
      : await controlCampaign(fixture.manifestFile, fixture.serverFile, operation, "EvalRunner")
    expect(finished).toMatchObject({ final: "partial", published: true, reportCommentId: "ops-final", consecutiveErrors: 3, cleanupVerified: true })
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(1)
    expect(await Bun.file(path.join(fixture.root, "owner.json")).exists()).toBe(false)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { api.stop(true); await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("failed verification retains repair ownership and the next check uses a fresh evidence directory", async () => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const journalFile = path.join(fixture.root, "control/journal.json")
    await writeLeaseReceipt(journalFile, { ...reserved, repairing: true, repairer: "EvalRunner", blocker: "TECHNICAL_REPAIR",
      consecutiveErrors: 3, emptyPreflights: 3, startedAttempts: 1 })
    const script = `
import { mkdir } from "node:fs/promises"
const dir = process.argv[2]!
await mkdir(dir)
const file = ${JSON.stringify(path.join(fixture.root, "verifications.json"))}
const entries = await Bun.file(file).json().catch(() => [])
await Bun.write(file, JSON.stringify([...entries, dir]))
process.exit(1)
`
    await Bun.write(path.join(fixture.root, "verify.ts"), script)
    await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")).rejects.toThrow("CAMPAIGN_CLEANUP_UNCONFIRMED")
    expect(await readLeaseReceipt(journalFile)).toMatchObject({ repairing: true, repairer: "EvalRunner", cleanupVerified: false,
      consecutiveErrors: 3, emptyPreflights: 3, startedAttempts: 1, lastProgressAt: reserved.lastProgressAt })
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(1)
    await Bun.write(path.join(fixture.root, "verify.ts"), script.replace("process.exit(1)", "process.exit(0)"))
    expect(await controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner"))
      .toMatchObject({ repairing: false, cleanupVerified: true, consecutiveErrors: 0, emptyPreflights: 0,
        lastProgressAt: reserved.lastProgressAt, startedAttempts: 1 })
    const directories = await Bun.file(path.join(fixture.root, "verifications.json")).json()
    expect(directories).toHaveLength(2)
    expect(directories[0]).not.toBe(directories[1])
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("confirmed release permits the next campaign and an old publisher cannot release its owner", async () => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved, final: "full", published: true, cleanupVerified: true })
    await controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")
    expect(await Bun.file(path.join(fixture.root, "owner.json")).exists()).toBe(false)
    const other = path.join(fixture.root, "other.json")
    await writeLeaseReceipt(other, { ...fixture.manifest, id: "other" })
    await controlCampaign(other, fixture.serverFile, "reserve")
    await controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")
    expect(await readLeaseReceipt(path.join(fixture.root, "owner.json"))).toEqual({ campaignId: "other" })
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("a late cleanup proof remains effective after the next healthy batch", async () => {
  const fixture = await controlFixture()
  try {
    fixture.manifest.keys = ["first", "second", "third"].map(taskId => ({ corpus: "ordinary", taskId, round: 1 }))
    fixture.manifest.pins = { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli", EVAL_AGENT_MODEL: "pinned/model",
      EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "judge", JUDGE_REASONING: "xhigh" }
    fixture.config.corpora = { ordinary: { entrypoint: "src/run.ts", tasks: "tasks" } }
    await writeLeaseReceipt(fixture.manifestFile, fixture.manifest)
    await writeLeaseReceipt(fixture.serverFile, fixture.config)
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const resultFile = path.join(fixture.root, "first-result.json")
    const original = JSON.stringify({ ...emptyResult("first", 1, false), status: "no_artifact", judge_status: "no_artifact", pass: false, score: 0 })
    await Bun.write(resultFile, original)
    await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved, repairing: true, repairer: "EvalRunner",
      blocker: "CLEANUP_UNCONFIRMED", attempts: [{ key: fixture.manifest.keys[0]!, resultFile, status: "no_artifact", counted: true,
        pass: false, score: 0, cleanupConfirmed: false }] })
    await Bun.write(path.join(fixture.root, "verify.ts"), 'import { mkdir } from "node:fs/promises"; await mkdir(process.argv[2]!)')
    const resumed = await controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")
    const batch = await prepareCampaignBatch(fixture.manifest, resumed, [fixture.manifest.keys[1]!], "old-unit",
      { ...fixture.config, stateDir: path.join(fixture.root, "control") })
    batch.started = true
    const runDir = path.join(batch.resultsDir, "run"), out = path.join(runDir, "second/1"), commandJournal = path.join(runDir, "native.json")
    await mkdir(out, { recursive: true })
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal })
    await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "second", attempt: 1, purpose: "measurement" }] })
    await Bun.write(path.join(out, "result.json"), JSON.stringify({ ...emptyResult("second", 1, false), status: "no_artifact", pass: false,
      score: 0, judge_status: "no_artifact", environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }))
    await Bun.write(path.join(out, "cleanup.json"), JSON.stringify({ processes: { status: "confirmed" }, nextAdmissionAllowed: true }))
    const next = await campaignTick(fixture.manifest, resumed, { active: false, invocation: "completed", exitCode: 0 })
    expect(next.action).toBe("start")
    expect(next.next).toEqual([fixture.manifest.keys[2]!])
    expect(next.journal.attempts.filter(attempt => attempt.counted)).toHaveLength(2)
    expect(await Bun.file(resultFile).text()).toBe(original)
  } finally { await fixture.close() }
})
