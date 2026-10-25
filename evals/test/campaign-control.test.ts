import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { campaignTick, controlCampaign, prepareCampaignBatch, runCampaign, type CampaignManifest } from "../script/run-campaign"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { tryCampaignLock } from "../src/campaign-lock"
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

test.skipIf(process.env.EVAL_PAIR_INTEGRATION !== "1" || process.env.EVAL_SYSTEMD_TESTS !== "1")(
  "generation continuity uses stable proof and preserves legacy and ownership guards", async () => {
    const { createPair, destroyPair, readServerObservation } = await import("../src/parallel-pair")
    const { acquireResourceLease, globalLockRoot } = await import("../src/lease")
    const { parseSlots } = await import("../src/slots")
    const { evalsRoot } = await import("../src/config")
    const { parallelFixture } = await import("./helpers/parallel-fixture")
    const fixture = await controlFixture(), native = await parallelFixture(fixture.root)
    const name = `eval-continuity-${crypto.randomUUID().slice(0, 8)}`
    const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
    const url = `http://127.0.0.1:${listener.port}/app/`
    listener.stop(true)
    const slots = parseSlots({ ...native.slots, server: { ...native.slots.server, container: `${name}-server`,
      studioContainer: `${name}-studio`, network: name, alias: "loginom-server-7.4.2-test", url } }, 1)
    const options = { purpose: "research" as const, out: path.join(fixture.root, "evidence"), lockRoot: globalLockRoot }
    const api = Bun.serve({ port: 0, fetch() { return Response.json([]) } })
    try {
      const created = await createPair(slots, options), before = await readServerObservation(slots)
      await writeLeaseReceipt(slots.controller.adminCredentialsFile, { username: "unused", password: "unused" })
      await writeLeaseReceipt(fixture.config.slotsFile, slots)
      // These real reservations are never used by a CLI or judge; release proves only that fact.
      for (const key of [`judge:${slots.judge.codexHome}`, ...slots.slots.map(slot => `profile:${slot.profileDir}`)]) {
        const commandId = crypto.randomUUID(), journal = path.join(fixture.root, `${commandId}.json`)
        await writeLeaseReceipt(journal, { commandId, kind: "unused-continuity-probe", key })
        const lease = await acquireResourceLease({ key, journal, commandId, lockRoot: globalLockRoot })
        try {
          const proof = path.join(fixture.root, `${commandId}-released.json`)
          await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key, token: lease.reservation.token, revision: lease.reservation.revision })
          await lease.release(proof)
        } finally { await lease.close() }
      }
      // Data-only receipt inputs; this does not simulate native account preparation or CLI execution.
      const writePreparations = async (identity: typeof before.identity, proofs: unknown[]) => {
        for (const [index, slot] of slots.slots.entries()) await writeLeaseReceipt(path.join(slots.controller.stateDir, `prepare-${slot.id}.json`), {
          version: 2, kind: "user-preparation", state: "staged", slotId: slot.id, username: slot.username, endpoint: url, identity,
          ...(proofs[index] === undefined ? {} : { stableConfiguration: proofs[index] }),
        })
      }
      await writePreparations(before.identity, slots.slots.map(() => before.stableConfiguration))
      fixture.manifest.pins = { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: process.execPath, EVAL_AGENT_MODEL: "unused/model",
        EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "unused", JUDGE_REASONING: "xhigh" }
      await writeLeaseReceipt(fixture.manifestFile, fixture.manifest)
      await writeLeaseReceipt(fixture.config.experimentPinsFile, { cli: process.execPath,
        cliBinarySha256: new Bun.CryptoHasher("sha256").update(await Bun.file(process.execPath).bytes()).digest("hex") })
      await writeLeaseReceipt(fixture.config.resourceBudgetFile, [])
      await Bun.write(fixture.config.multica.tokenFile, "fixture-token", { mode: 0o600 })
      await writeLeaseReceipt(fixture.serverFile, { ...fixture.config, harnessRoot: evalsRoot,
        acceptedHarness: (await Bun.$`git -C ${evalsRoot} rev-parse HEAD`.quiet()).text().trim(),
        verifyCommand: [process.execPath, fixture.config.slotsFile, "{verificationDir}"],
        multica: { ...fixture.config.multica, url: `http://127.0.0.1:${api.port}` } })
      const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
      await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved, repairing: true, repairer: "EvalBaseline" })
      await Bun.$`docker restart ${created.identity.containerId} ${created.identity.studioContainerId}`.quiet()
      const after = await readServerObservation(slots)
      expect(after.identity.configurationHash).not.toBe(before.identity.configurationHash)
      expect(after.stableConfiguration).toEqual(before.stableConfiguration)
      const server = await Bun.file(fixture.serverFile).text()
      const check = async (error: string) => {
        await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalBaseline")).rejects.toThrow(error)
        expect(await Bun.file(fixture.serverFile).text()).toBe(server)
        expect(await Bun.file(path.join(fixture.root, "environment-generations")).exists()).toBe(false)
        expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
        expect(await readLeaseReceipt(path.join(fixture.root, "control/journal.json"))).toMatchObject({ attempts: [], batches: [], repairing: true })
      }
      await check("RESOURCE_BUDGET_INVALID")
      const dnsEquivalent = after.compatibleStableHashes.find(hash => hash !== before.stableConfiguration.hash)
      expect(dnsEquivalent).toBeDefined()
      await writePreparations(before.identity, slots.slots.map(() => ({ version: 1, hash: dnsEquivalent })))
      await check("RESOURCE_BUDGET_INVALID")
      await writePreparations(before.identity, [])
      await check("CAMPAIGN_GENERATION_IDENTITY_CHANGED")
      await writePreparations(after.identity, [])
      await check("CAMPAIGN_GENERATION_UNCHANGED")
      for (const proofs of [[before.stableConfiguration], [before.stableConfiguration, null],
        [before.stableConfiguration, { version: 1, hash: "f".repeat(64) }]]) {
        await writePreparations(before.identity, proofs)
        await check(proofs[1] === null ? "USER_PREPARATION_CONFLICT" : "CAMPAIGN_PREPARATION_UNCONFIRMED")
      }
      await writePreparations({ ...before.identity, containerId: "f".repeat(64) }, slots.slots.map(() => before.stableConfiguration))
      await check("CAMPAIGN_PAIR_UNCONFIRMED")
      await writePreparations(before.identity, slots.slots.map(() => before.stableConfiguration))
      const components = (await Bun.$`docker exec ${created.identity.containerId} cat /workdir/Components.cfg`.quiet()).text()
      try {
        await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf "\\n" >> /workdir/Components.cfg'}`.quiet()
        await check("CAMPAIGN_GENERATION_IDENTITY_CHANGED")
      } finally {
        await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf %s "$1" > /workdir/Components.cfg'} sh ${components}`.quiet()
      }
      const commandId = crypto.randomUUID(), journal = path.join(fixture.root, `${commandId}.json`)
      await writeLeaseReceipt(journal, { commandId, kind: "unused-continuity-probe" })
      const lease = await acquireResourceLease({ key: `profile:${slots.slots[0]!.profileDir}`, journal, commandId, lockRoot: globalLockRoot })
      try { await check("CAMPAIGN_GENERATION_RELEASE_UNCONFIRMED") }
      finally {
        const proof = path.join(fixture.root, `${commandId}-released.json`)
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key: lease.reservation.key, token: lease.reservation.token, revision: lease.reservation.revision })
        await lease.release(proof)
      }
      await Bun.$`docker stop ${created.identity.containerId} ${created.identity.studioContainerId}`.quiet()
      await check("RESOURCE_BUDGET_INVALID")
    } finally {
      api.stop(true)
      await destroyPair(slots, options)
      // Keep private release proofs referenced by the native global reservations.
      console.error(`continuity probe evidence: ${fixture.root}`)
    }
  }, 90_000,
)

test("prepare generation requires the campaign owner before touching infrastructure", async () => {
  const fixture = await controlFixture()
  try {
    const original = await Bun.file(fixture.serverFile).text()
    const unlock = await tryCampaignLock(fixture.config.controllerLock)
    try {
      await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalRunner"))
        .rejects.toThrow("CAMPAIGN_BUSY")
    } finally { await unlock!() }
    await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalRunner"))
      .rejects.toThrow("CAMPAIGN_OWNER_MISMATCH")
    expect(await Bun.file(fixture.serverFile).text()).toBe(original)
    expect(await Bun.file(path.join(fixture.root, "environment-generations")).exists()).toBe(false)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("prepare generation requires the parked repairer and preserves admission state", async () => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const journalFile = path.join(fixture.root, "control/journal.json")
    for (const repair of [{ repairing: false, repairer: null }, { repairing: true, repairer: "EvalBaseline" }]) {
      await writeLeaseReceipt(journalFile, { ...reserved, ...repair })
      const original = await Bun.file(journalFile).text()
      await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalRunner"))
        .rejects.toThrow("CAMPAIGN_REPAIRER_MISMATCH")
      expect(await Bun.file(journalFile).text()).toBe(original)
      expect(await Bun.file(path.join(fixture.root, "environment-generations")).exists()).toBe(false)
    }
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("prepare generation accounts saved FAIL before rejecting an unaccepted harness", async () => {
  const fixture = await controlFixture()
  const api = Bun.serve({ port: 0, fetch() { return Response.json([]) } })
  try {
    fixture.manifest.keys.push({ corpus: "ordinary", taskId: "second", round: 1 })
    fixture.manifest.pins = { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli", EVAL_AGENT_MODEL: "pinned/model",
      EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "judge", JUDGE_REASONING: "xhigh" }
    await writeLeaseReceipt(fixture.manifestFile, fixture.manifest)
    await writeLeaseReceipt(fixture.serverFile, { ...fixture.config, multica: { ...fixture.config.multica, url: `http://127.0.0.1:${api.port}` } })
    await Bun.write(fixture.config.multica.tokenFile, "fixture-token", { mode: 0o600 })
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const resultsDir = path.join(fixture.root, "control/batches/1"), runDir = path.join(resultsDir, "saved")
    const out = path.join(runDir, "first/1"), commandJournal = path.join(runDir, "native.json")
    const completedAt = Date.now() - 3600000
    await mkdir(out, { recursive: true, mode: 0o700 })
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal })
    await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir,
      attempts: [{ taskId: "first", attempt: 1, purpose: "measurement", completedAt, quality: true }] })
    await writeLeaseReceipt(path.join(runDir, "resource-acceptance.json"), { checks: [{ status: "passed", codes: [] }] })
    await writeLeaseReceipt(path.join(out, "result.json"), { ...emptyResult("first", 1, false), status: "no_artifact", pass: false,
      score: 0, judge_status: "no_artifact", environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } })
    await writeLeaseReceipt(path.join(out, "cleanup.json"), { processes: { status: "confirmed" }, nextAdmissionAllowed: true })
    const original = await Bun.file(path.join(out, "result.json")).text(), server = await Bun.file(fixture.serverFile).text()
    const journalFile = path.join(fixture.root, "control/journal.json")
    await writeLeaseReceipt(journalFile, { ...reserved, repairing: true, repairer: "EvalRunner", lastProgressAt: completedAt - 1000,
      batches: [{ id: "one", keys: [fixture.manifest.keys[0]!], resultsDir, invocationBefore: "before", started: true }] })
    await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalRunner"))
      .rejects.toThrow("CAMPAIGN_HARNESS_CHANGED")
    const checked = await readLeaseReceipt(journalFile)
    expect(checked).toMatchObject({ repairing: true, repairer: "EvalRunner", lastProgressAt: completedAt, startedAttempts: 1,
      batches: [{ accounted: true }], attempts: [{ counted: true, pass: false, score: 0 }] })
    expect(await Bun.file(path.join(out, "result.json")).text()).toBe(original)
    expect(await Bun.file(fixture.serverFile).text()).toBe(server)
    expect(await readLeaseReceipt(fixture.manifestFile)).toEqual(fixture.manifest)
    expect(await Bun.file(path.join(fixture.root, "environment-generations")).exists()).toBe(false)
  } finally { api.stop(true); await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("prepare generation refuses a pinned username before infrastructure changes", async () => {
  const fixture = await controlFixture()
  const api = Bun.serve({ port: 0, fetch() { return Response.json([]) } })
  try {
    fixture.manifest.pins.LOGINOM_USERNAME = "fixed-user"
    await writeLeaseReceipt(fixture.manifestFile, fixture.manifest)
    await writeLeaseReceipt(fixture.serverFile, { ...fixture.config, multica: { ...fixture.config.multica, url: `http://127.0.0.1:${api.port}` } })
    await Bun.write(fixture.config.multica.tokenFile, "fixture-token", { mode: 0o600 })
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved, repairing: true, repairer: "EvalRunner" })
    await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalRunner"))
      .rejects.toThrow("CAMPAIGN_USERNAME_PINNED")
    expect(await Bun.file(path.join(fixture.root, "environment-generations")).exists()).toBe(false)
    expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
  } finally { api.stop(true); await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1").each(["deadline", "published", "unavailable"] as const)("prepare generation respects %s on repeated entry", async state => {
  const fixture = await controlFixture()
  const api = Bun.serve({ port: 0, fetch(request) {
    if (state === "unavailable") return new Response(null, { status: 503 })
    const route = new URL(request.url).pathname
    if (route.endsWith("/comments")) return Response.json(state === "published"
      ? [{ id: "ops-final", content: "<!-- eval-campaign:control -->\n<!-- eval-final:partial -->\n# частичный: остановлено" }] : [])
    if (route.endsWith("/wakeups")) return Response.json([])
    return Response.json({ revision: 1, status: "in_review" })
  } })
  try {
    await writeLeaseReceipt(fixture.serverFile, { ...fixture.config, multica: { ...fixture.config.multica, url: `http://127.0.0.1:${api.port}` } })
    await Bun.write(fixture.config.multica.tokenFile, "fixture-token", { mode: 0o600 })
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const journalFile = path.join(fixture.root, "control/journal.json")
    const lastProgressAt = state === "deadline" ? Date.now() - 25 * 3600000 : reserved.lastProgressAt
    await writeLeaseReceipt(journalFile, { ...reserved, repairing: true, repairer: "EvalRunner", lastProgressAt, startedAttempts: 0 })
    const server = await Bun.file(fixture.serverFile).text()
    for (let entry = 0; entry < 2; entry++) {
      const prepared = controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalRunner")
      if (state === "unavailable") await expect(prepared).rejects.toThrow("CAMPAIGN_STATE_UNAVAILABLE")
      if (state !== "unavailable") expect(await prepared).toMatchObject({ final: "partial", ...(state === "published" ? { published: true } : {}) })
      expect(await readLeaseReceipt(journalFile)).toMatchObject({ repairing: true, repairer: "EvalRunner", lastProgressAt,
        startedAttempts: 0, attempts: [] })
      expect(await Bun.file(fixture.serverFile).text()).toBe(server)
      expect(await Bun.file(path.join(fixture.root, "environment-generations")).exists()).toBe(false)
      expect(await Bun.file(fixture.config.batchEnvFile).exists()).toBe(false)
    }
  } finally { api.stop(true); await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("prepare generation rechecks config after observing the external final", async () => {
  const fixture = await controlFixture()
  const next = { ...fixture.config, resourceBudgetFile: path.join(fixture.root, "changed-budget.json") }
  const api = Bun.serve({ port: 0, async fetch() {
    await writeLeaseReceipt(fixture.serverFile, next)
    return Response.json([])
  } })
  try {
    await writeLeaseReceipt(fixture.serverFile, { ...fixture.config, multica: { ...fixture.config.multica, url: `http://127.0.0.1:${api.port}` } })
    await Bun.write(fixture.config.multica.tokenFile, "fixture-token", { mode: 0o600 })
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    await writeLeaseReceipt(path.join(fixture.root, "control/journal.json"), { ...reserved, repairing: true, repairer: "EvalRunner" })
    await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "prepare-generation", "EvalRunner"))
      .rejects.toThrow("CAMPAIGN_SERVER_CONFIG_CHANGED")
    expect(await readLeaseReceipt(fixture.serverFile)).toEqual(next)
    expect(await Bun.file(path.join(fixture.root, "environment-generations")).exists()).toBe(false)
  } finally { api.stop(true); await fixture.close() }
})

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

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1").each(["ADMISSION_STATE_UNCONFIRMED", "CLEANUP_UNCONFIRMED"])("resume rechecks old accounted admissions after %s", async blocker => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const resultsDir = path.join(fixture.root, "control/batches/1"), runDir = path.join(resultsDir, "run")
    const commandJournal = path.join(runDir, "native-command.json"), journalFile = path.join(fixture.root, "control/journal.json")
    await mkdir(runDir, { recursive: true })
    await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir, attempts: null })
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal })
    const original = await Bun.file(commandJournal).text()
    await writeLeaseReceipt(journalFile, { ...reserved, repairing: true, repairer: "EvalRunner", blocker,
      batches: [{ id: "batch", keys: fixture.manifest.keys, resultsDir, invocationBefore: "", started: true, accounted: true }], startedAttempts: 0 })
    await Bun.write(path.join(fixture.root, "verify.ts"), 'import { mkdir } from "node:fs/promises"; await mkdir(process.argv[2]!)')
    await expect(controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")).rejects.toThrow("ADMISSION_STATE_UNCONFIRMED")
    expect(await readLeaseReceipt(journalFile)).toMatchObject({ repairing: true, blocker: "ADMISSION_STATE_UNCONFIRMED",
      startedAttempts: 0, lastProgressAt: reserved.lastProgressAt, batches: [{ accounted: false }] })
    expect(await Bun.file(path.join(fixture.root, "control/verification")).exists()).toBe(false)
    expect(await Bun.file(commandJournal).text()).toBe(original)
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(1)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("resume reconciles an empty initial admission ledger before fresh verification", async () => {
  const fixture = await controlFixture()
  try {
    const reserved = await controlCampaign(fixture.manifestFile, fixture.serverFile, "reserve")
    const resultsDir = path.join(fixture.root, "control/batches/1"), runDir = path.join(resultsDir, "run")
    const commandJournal = path.join(runDir, "native-command.json"), journalFile = path.join(fixture.root, "control/journal.json")
    await mkdir(runDir, { recursive: true })
    await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir, attempts: [] })
    await writeLeaseReceipt(path.join(runDir, "config.json"), { commandJournal })
    const original = await Bun.file(commandJournal).text()
    await writeLeaseReceipt(journalFile, { ...reserved, repairing: true, repairer: "EvalRunner", blocker: "ADMISSION_STATE_UNCONFIRMED",
      batches: [{ id: "batch", keys: fixture.manifest.keys, resultsDir, invocationBefore: "", started: true, accounted: true }], startedAttempts: 0 })
    await Bun.write(path.join(fixture.root, "verify.ts"), 'import { mkdir } from "node:fs/promises"; await mkdir(process.argv[2]!)')
    const resumed = await controlCampaign(fixture.manifestFile, fixture.serverFile, "resume", "EvalRunner")
    expect(resumed).toMatchObject({ repairing: false, repairer: null, cleanupVerified: true, startedAttempts: 0,
      lastProgressAt: reserved.lastProgressAt, attempts: [], batches: [{ accounted: true, startedAttempts: 0 }] })
    expect(resumed.blocker).toBeUndefined()
    expect((await stat(resumed.verificationDir!)).isDirectory()).toBe(true)
    expect(await Bun.file(commandJournal).text()).toBe(original)
    expect(await Bun.file(path.join(fixture.root, "preflights.json")).json()).toBe(2)
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
    const generation = Bun.spawn([...args, "prepare-generation", "--repairer", "EvalRunner"], { stdout: "pipe", stderr: "pipe" })
    expect(await generation.exited).toBe(2)
    expect(await new Response(generation.stderr).text()).toContain("CAMPAIGN_REPAIRER_MISMATCH")
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
