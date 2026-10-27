import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { finalizeCampaign, runCampaign, type CampaignManifest, type CampaignJournal } from "../script/run-campaign"
import { writeLeaseReceipt } from "../src/lease"

async function finalizationFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-finalization-"))
  const comments: { id: string; content: string; revision?: number; attachments?: { id: string }[]; author_type?: string; author_id?: string; parent_id?: string }[] = []
  const attachments: { id: string; filename: string; bytes: Uint8Array }[] = []
  const issue = { revision: 1, status: "in_progress" }
  const wakeup = { id: "timer", kind: "every", enabled: true }
  const observed: { cleanupAtPublication?: boolean } = {}
  const api = { available: true, postAttempts: 0 }
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (request.method === "POST") api.postAttempts++
    if (!api.available) return new Response(null, { status: 503 })
    const route = new URL(request.url).pathname
    if (route === "/api/agents") return Response.json([{ id: "runner", name: "EvalBaseline" }])
    if (route.startsWith("/api/comments/") && request.method === "PUT") {
      const comment = comments.find(item => route === `/api/comments/${item.id}`)!
      const data = await request.json()
      Object.assign(comment, data, { attachments: data.attachment_ids?.map((id: string) => ({ id })), revision: (comment.revision ?? 0) + 1 })
      return Response.json(comment)
    }
    if (route === "/api/upload-file") {
      const file = (await request.formData()).get("file") as File
      const attachment = { id: `archive-${attachments.length + 1}`, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      attachments.push(attachment)
      return Response.json({ id: attachment.id, filename: attachment.filename })
    }
    if (route.endsWith("/download")) return new Response(attachments.find(item => route === `/api/attachments/${item.id}/download`)!.bytes)
    if (route.endsWith("/attachments")) return Response.json(attachments.map(({ id, filename }) => ({ id, filename })))
    if (route.endsWith("/comments/trigger-preview")) return Response.json({ agents: [{ id: "runner" }] })
    if (route.endsWith("/comments")) {
      if (request.method === "POST") {
        observed.cleanupAtPublication = (await Bun.file(path.join(root, "journal.json")).json()
          .catch(() => Bun.file(path.join(root, "campaigns/finalization/journal.json")).json())).cleanupVerified
        comments.push({ ...await request.json(), id: `comment-${comments.length + 1}`, revision: 1 })
      }
      if (request.method === "POST") return Response.json(comments.at(-1))
      const report = comments.find(comment => comment.content.includes("<!-- eval-handoff:"))
      if (report && !comments.some(comment => comment.id === "runner-final")) comments.push({ id: "runner-final", revision: 1,
        author_type: "agent", author_id: "runner", parent_id: report.id, content: "<!-- eval-executor-final:finalization -->" })
      return Response.json(comments)
    }
    if (route.endsWith("/disable")) { wakeup.enabled = false; return Response.json({}) }
    if (route.endsWith("/wakeups")) return Response.json([wakeup])
    if (request.method === "PUT") Object.assign(issue, await request.json())
    return Response.json(issue)
  } })
  await Bun.write(path.join(root, "token"), "fixture-token", { mode: 0o600 })
  const verifyScript = path.join(root, "verify.ts")
  await Bun.write(verifyScript, `
const stateDir = process.argv[2]!
const previous = await Bun.file(stateDir + "/verify-observation.json").json().catch(() => ({ count: 0 }))
const journal = await Bun.file(stateDir + "/journal.json").json()
await Bun.write(stateDir + "/verify-observation.json", JSON.stringify({ count: previous.count + 1, durable: journal.verificationAttempted, parallel: process.argv[3] }))
process.exit(1)
`)
  const manifest: CampaignManifest = { id: "finalization", server: "runner2", executor: "EvalBaseline", parallel: 2, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, wakeupIds: ["timer"], limits: { noProgressMs: 1000 } }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [], attempts: [{ key: manifest.keys[0]!, resultFile: "/saved/result.json", status: "no_artifact",
      counted: true, pass: false, score: 0, cleanupConfirmed: true }], lastProgressAt: 1000, consecutiveErrors: 0, final: "full" }
  return { root, manifest, journal, comments, attachments, issue, wakeup, observed, api,
    config: { stateDir: root, harnessRoot: root, verifyCommand: [process.execPath, "--no-env-file", verifyScript, "{stateDir}", "{parallel}"],
      multica: { url: `http://127.0.0.1:${server.port}`, workspace: "lab", issueId: "issue", tokenFile: path.join(root, "token") } },
    async close() { server.stop(true); await rm(root, { recursive: true, force: true }) } }
}

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("campaign service performs local final cleanup while Multica is unavailable", async () => {
  const fixture = await finalizationFixture()
  try {
    fixture.api.available = false
    fixture.manifest.issueId = "issue"
    const stateRoot = path.join(fixture.root, "campaigns"), stateDir = path.join(stateRoot, fixture.manifest.id)
    const manifestFile = path.join(fixture.root, "manifest.json"), serverFile = path.join(fixture.root, "server.json")
    const manifestHash = new Bun.CryptoHasher("sha256").update(JSON.stringify(fixture.manifest)).digest("hex")
    await mkdir(stateDir, { recursive: true, mode: 0o700 })
    await writeLeaseReceipt(manifestFile, fixture.manifest)
    await writeLeaseReceipt(path.join(stateDir, "journal.json"), { ...fixture.journal, manifestHash })
    await writeLeaseReceipt(path.join(stateRoot, "owner.json"), { campaignId: fixture.manifest.id })
    await writeLeaseReceipt(serverFile, { ...fixture.config, server: "runner2", stateRoot,
      controllerLock: path.join(fixture.root, "controller.lock"), batchUnit: "loginom-campaign-fixture-missing.service",
      acceptedHarness: "a".repeat(40), batchEnvFile: path.join(fixture.root, "batch.env"),
      slotsFile: path.join(fixture.root, "slots.json"), resourceBudgetFile: path.join(fixture.root, "budget.json"),
      experimentPinsFile: path.join(fixture.root, "pins.json"), corpusPinsFile: path.join(fixture.root, "corpus-pins.json"),
      preflightCommand: [process.execPath, "unreachable.ts"], corpora: {} })
    const verifyScript = path.join(fixture.root, "verify.ts")
    await Bun.write(verifyScript, (await Bun.file(verifyScript).text()).replace("process.exit(1)", "process.exit(0)"))
    const finished = await runCampaign(manifestFile, serverFile, true)
    expect(finished).toMatchObject({ final: "partial", verificationAttempted: true, cleanupVerified: true, reportingError: "MULTICA_UNAVAILABLE" })
    expect(finished.published).not.toBe(true)
    expect(await Bun.file(path.join(stateDir, "verify-observation.json")).json()).toEqual({ count: 1, durable: true, parallel: "2" })
    expect(await Bun.file(path.join(stateDir, "journal.json")).json()).toMatchObject({ verificationAttempted: true, cleanupVerified: true })
    expect(fixture.api.postAttempts).toBe(0)
    expect(await Bun.file(path.join(stateRoot, "owner.json")).exists()).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("service entry adopts an external partial before waiting for an active batch with fresh local progress", async () => {
  const fixture = await finalizationFixture()
  try {
    fixture.manifest.issueId = "issue"
    const stateRoot = path.join(fixture.root, "campaigns"), stateDir = path.join(stateRoot, fixture.manifest.id)
    const manifestFile = path.join(fixture.root, "manifest.json"), serverFile = path.join(fixture.root, "server.json")
    const manifestHash = new Bun.CryptoHasher("sha256").update(JSON.stringify(fixture.manifest)).digest("hex")
    await mkdir(stateDir, { recursive: true, mode: 0o700 })
    await writeLeaseReceipt(manifestFile, fixture.manifest)
    const state = { ...fixture.journal, manifestHash, final: undefined, lastProgressAt: Date.now(),
      batches: [{ id: "owned", keys: fixture.manifest.keys, resultsDir: path.join(stateDir, "batches/1"), invocationBefore: "prior", started: true }] }
    await writeLeaseReceipt(path.join(stateDir, "journal.json"), state)
    await writeLeaseReceipt(serverFile, { ...fixture.config, server: "runner2", stateRoot,
      controllerLock: path.join(fixture.root, "controller.lock"), batchUnit: "basic.target", acceptedHarness: "a".repeat(40),
      batchEnvFile: path.join(fixture.root, "batch.env"), slotsFile: path.join(fixture.root, "slots.json"),
      resourceBudgetFile: path.join(fixture.root, "budget.json"), experimentPinsFile: path.join(fixture.root, "pins.json"),
      corpusPinsFile: path.join(fixture.root, "corpus-pins.json"), preflightCommand: [process.execPath, "unreachable.ts"], corpora: {} })
    fixture.comments.push({ id: "ops-final", content: `<!-- eval-campaign:${fixture.manifest.id} -->\n<!-- eval-final:partial -->\n# частичный: host unavailable` })
    const finished = await runCampaign(manifestFile, serverFile, true)
    expect(finished).toMatchObject({ final: "partial", published: true, reportCommentId: "ops-final", lastProgressAt: state.lastProgressAt })
    expect(finished.attempts).toEqual(state.attempts)
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeup.enabled).toBe(false)
    expect(await Bun.file(path.join(stateDir, "verify-observation.json")).exists()).toBe(false)
    expect(fixture.attachments).toHaveLength(0)
  } finally { await fixture.close() }
})

test("failed final cleanup preserves quality and publishes a partial after the no-progress limit without repeating verification", async () => {
  const fixture = await finalizationFixture()
  try {
    const attempts = structuredClone(fixture.journal.attempts)
    const blocked = await finalizeCampaign(fixture.manifest, fixture.journal, fixture.config, 1500)
    expect(blocked).toMatchObject({ blocker: "CLEANUP_UNCONFIRMED", blockerKind: "technical", verificationAttempted: true })
    expect(blocked.final).toBeUndefined()
    expect(blocked.published).not.toBe(true)
    expect(blocked.attempts).toEqual(attempts)
    expect(fixture.comments).toHaveLength(0)
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).json()).toEqual({ count: 1, durable: true, parallel: "2" })
    const finished = await finalizeCampaign(fixture.manifest, blocked, fixture.config, 2000)
    expect(finished).toMatchObject({ final: "partial", published: true, verificationAttempted: true })
    expect(finished.cleanupVerified).not.toBe(true)
    expect(finished.attempts).toEqual(attempts)
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).json()).toEqual({ count: 1, durable: true, parallel: "2" })
    expect(fixture.comments.filter(comment => comment.content.includes("eval-campaign:"))).toHaveLength(1)
    const report = fixture.comments.find(comment => comment.content.includes("eval-campaign:"))!.content
    expect(report).toContain("<!-- eval-final:partial -->")
    expect(report).toContain("globalcleanupConfirmed=false")
    expect(report).toContain("FAIL")
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeup.enabled).toBe(false)
    expect(fixture.attachments).toHaveLength(1)
  } finally { await fixture.close() }
})

test("successful final cleanup is durable before publishing the full report", async () => {
  const fixture = await finalizationFixture()
  try {
    const verifyScript = fixture.config.verifyCommand[2]!
    await Bun.write(verifyScript, (await Bun.file(verifyScript).text()).replace("process.exit(1)", "process.exit(0)"))
    const finished = await finalizeCampaign(fixture.manifest, fixture.journal, fixture.config, 1500)
    expect(finished).toMatchObject({ final: "full", verificationAttempted: true, cleanupVerified: true, published: true })
    expect(fixture.observed.cleanupAtPublication).toBe(true)
    expect(fixture.comments[0]!.content).toContain("globalcleanupConfirmed=true")
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).json()).toEqual({ count: 1, durable: true, parallel: "2" })
    await finalizeCampaign(fixture.manifest, finished, fixture.config, 1600)
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).json()).toEqual({ count: 1, durable: true, parallel: "2" })
    expect(fixture.comments).toHaveLength(2)
  } finally { await fixture.close() }
})

test("external Ops final is adopted before attempting native verification", async () => {
  const fixture = await finalizationFixture()
  try {
    const content = "<!-- eval-campaign:finalization -->\n<!-- eval-final:partial -->\n# частичный: хост недоступен"
    fixture.comments.push({ id: "ops-final", content })
    const finished = await finalizeCampaign(fixture.manifest, fixture.journal, fixture.config, 1500)
    expect(finished).toMatchObject({ final: "partial", published: true, reportCommentId: "ops-final" })
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).exists()).toBe(false)
    expect(fixture.comments).toEqual([{ id: "ops-final", content }])
    expect(fixture.attachments).toHaveLength(0)
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeup.enabled).toBe(false)
  } finally { await fixture.close() }
})

test.each([true, false])("Multica outage permits local cleanup and recovery retries only delivery (cleanup success=%s)", async cleanupSucceeded => {
  const fixture = await finalizationFixture()
  try {
    const verifyScript = fixture.config.verifyCommand[2]!
    if (cleanupSucceeded) await Bun.write(verifyScript, (await Bun.file(verifyScript).text()).replace("process.exit(1)", "process.exit(0)"))
    const final = cleanupSucceeded ? "full" : "partial"
    fixture.journal.final = final
    const attempts = structuredClone(fixture.journal.attempts)
    fixture.api.available = false
    const waiting = await finalizeCampaign(fixture.manifest, fixture.journal, fixture.config, 1500)
    expect(waiting).toMatchObject({ final, verificationAttempted: true, reportingError: "MULTICA_UNAVAILABLE" })
    expect(waiting.cleanupVerified === true).toBe(cleanupSucceeded)
    expect(waiting.published).not.toBe(true)
    expect(waiting.attempts).toEqual(attempts)
    expect(await Bun.file(path.join(fixture.root, "journal.json")).json()).toMatchObject({ reportingError: "MULTICA_UNAVAILABLE", verificationAttempted: true })
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).json()).toEqual({ count: 1, durable: true, parallel: "2" })
    expect(fixture.comments).toHaveLength(0)
    expect(fixture.api.postAttempts).toBe(0)
    fixture.api.available = true
    const finished = await finalizeCampaign(fixture.manifest, waiting, fixture.config, 1600)
    expect(finished).toMatchObject({ final, published: true })
    expect(finished.cleanupVerified === true).toBe(cleanupSucceeded)
    expect(finished.reportingError).toBeUndefined()
    expect(finished.attempts).toEqual(attempts)
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).json()).toEqual({ count: 1, durable: true, parallel: "2" })
    expect(fixture.comments).toHaveLength(2)
    expect(fixture.comments[0]!.content).toContain(`globalcleanupConfirmed=${cleanupSucceeded}`)
    expect(fixture.wakeup.enabled).toBe(false)
  } finally { await fixture.close() }
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("active owned batch reaches partial without executing cleanup against running resources", async () => {
  const fixture = await finalizationFixture()
  try {
    fixture.manifest.issueId = "issue"
    const stateRoot = path.join(fixture.root, "campaigns"), stateDir = path.join(stateRoot, fixture.manifest.id)
    const manifestFile = path.join(fixture.root, "manifest.json"), serverFile = path.join(fixture.root, "server.json")
    await mkdir(stateDir, { recursive: true, mode: 0o700 })
    await writeLeaseReceipt(manifestFile, fixture.manifest)
    await writeLeaseReceipt(path.join(stateDir, "journal.json"), { ...fixture.journal,
      manifestHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(fixture.manifest)).digest("hex"), final: undefined,
      batches: [{ id: "owned", keys: fixture.manifest.keys, resultsDir: path.join(stateDir, "batches/1"), invocationBefore: "prior", started: true }] })
    await writeLeaseReceipt(path.join(stateRoot, "owner.json"), { campaignId: fixture.manifest.id })
    await writeLeaseReceipt(serverFile, { ...fixture.config, server: "runner2", stateRoot,
      controllerLock: path.join(fixture.root, "controller.lock"), batchUnit: "basic.target", acceptedHarness: "a".repeat(40),
      batchEnvFile: path.join(fixture.root, "batch.env"), slotsFile: path.join(fixture.root, "slots.json"),
      resourceBudgetFile: path.join(fixture.root, "budget.json"), experimentPinsFile: path.join(fixture.root, "pins.json"),
      corpusPinsFile: path.join(fixture.root, "corpus-pins.json"), preflightCommand: [process.execPath, "unreachable.ts"], corpora: {} })
    const finished = await runCampaign(manifestFile, serverFile, true)
    expect(finished).toMatchObject({ final: "partial", cleanupVerified: false })
    expect(await Bun.file(path.join(stateDir, "verify-observation.json")).exists()).toBe(false)
    expect(await Bun.file(path.join(stateRoot, "owner.json")).exists()).toBe(true)
    expect(finished.attempts).toEqual(fixture.journal.attempts)
  } finally { await fixture.close() }
})

test("a new snapshot partial is adopted without native verification on the returning host", async () => {
  const fixture = await finalizationFixture()
  try {
    fixture.comments.push({ id: "snapshot-handoff", revision: 1, content: [
      "<!-- eval-campaign:finalization -->", "<!-- eval-final:partial -->", "<!-- eval-handoff:finalization -->",
      "# частичный: хост недоступен", "globalcleanupConfirmed=false", "<!-- eval-snapshot-observed:2026-10-27T10:00:00.000Z -->",
      "Последнее наблюдение: 2026-10-27T10:00:00.000Z. Текущее состояние ресурсов хоста не подтверждено.",
      "[@EvalBaseline](mention://agent/runner)",
    ].join("\n") })
    const finished = await finalizeCampaign(fixture.manifest, fixture.journal, fixture.config, 1500)
    expect(await Bun.file(path.join(fixture.root, "verify-observation.json")).exists()).toBe(false)
    expect(finished).toMatchObject({ final: "partial", cleanupVerified: false, snapshotObservedAt: Date.parse("2026-10-27T10:00:00.000Z") })
    expect(finished.attempts).toEqual(fixture.journal.attempts)
  } finally { await fixture.close() }
})
