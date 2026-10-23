import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { captureCampaignSnapshot, publishCampaignSnapshot } from "../script/campaign-snapshot"
import type { CampaignManifest, CampaignJournal } from "../script/run-campaign"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"

async function sourceFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-snapshot-"))
  const manifest: CampaignManifest = { id: "snapshot", server: "runner1", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: ["first", "second"].map(taskId => ({ corpus: "ordinary", taskId, round: 1 })), pins: { EVAL_AGENT_MODEL: "pinned/model", JUDGE_MODEL: "pinned-judge" },
    issueId: "issue", wakeupIds: ["timer"] }
  const journal: CampaignJournal = { manifestHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"),
    server: manifest.server, campaignId: manifest.id, executor: manifest.executor, repairing: false, repairer: null, batches: [],
    attempts: [{ key: manifest.keys[0]!, resultFile: "/unavailable/runner1/first/1/result.json", status: "no_artifact", counted: true,
      pass: false, score: 0, cleanupConfirmed: true }], lastProgressAt: 1000, consecutiveErrors: 0, cleanupVerified: true }
  const manifestFile = path.join(root, "manifest.json"), journalFile = path.join(root, "journal.json")
  await writeLeaseReceipt(manifestFile, manifest)
  await writeLeaseReceipt(journalFile, journal)
  return { root, manifest, journal, manifestFile, journalFile, snapshotFile: path.join(root, "ops/snapshot.json") }
}

test("campaign snapshot preserves the protected source and records observation without advancing progress", async () => {
  const fixture = await sourceFixture()
  try {
    const manifestBefore = await Bun.file(fixture.manifestFile).text(), journalBefore = await Bun.file(fixture.journalFile).text()
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    expect(await readLeaseReceipt(fixture.snapshotFile)).toEqual({ manifest: fixture.manifest, journal: fixture.journal, observedAt: 2000 })
    expect((await stat(fixture.snapshotFile)).mode & 0o777).toBe(0o600)
    expect((await stat(path.dirname(fixture.snapshotFile))).mode & 0o777).toBe(0o700)
    expect(await Bun.file(fixture.manifestFile).text()).toBe(manifestBefore)
    expect(await Bun.file(fixture.journalFile).text()).toBe(journalBefore)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("campaign snapshot refuses mismatched identity or experiment pins without replacing the previous copy", async () => {
  const fixture = await sourceFixture()
  try {
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    const previous = await Bun.file(fixture.snapshotFile).text()
    for (const change of [{ campaignId: "another" }, { server: "runner2" }, { executor: "EvalRunner" }, { manifestHash: "changed" }]) {
      await writeLeaseReceipt(fixture.journalFile, { ...fixture.journal, ...change })
      await expect(captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 3000)).rejects.toThrow("CAMPAIGN_SNAPSHOT_IDENTITY")
      expect(await Bun.file(fixture.snapshotFile).text()).toBe(previous)
    }
    await writeLeaseReceipt(fixture.journalFile, fixture.journal)
    await writeLeaseReceipt(fixture.manifestFile, { ...fixture.manifest, pins: { ...fixture.manifest.pins, JUDGE_MODEL: "another-judge" } })
    await expect(captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 3000)).rejects.toThrow("CAMPAIGN_SNAPSHOT_IDENTITY")
    expect(await Bun.file(fixture.snapshotFile).text()).toBe(previous)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("campaign snapshot refuses a shared output directory", async () => {
  const fixture = await sourceFixture()
  try {
    await mkdir(path.dirname(fixture.snapshotFile), { mode: 0o755 })
    await expect(captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)).rejects.toThrow("CAMPAIGN_SNAPSHOT_DIRECTORY_PRIVATE")
    expect(await Bun.file(fixture.snapshotFile).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

async function publishingFixture() {
  const source = await sourceFixture()
  const comments: { id: string; content: string }[] = []
  const attachments: { id: string; filename: string; bytes: Uint8Array }[] = []
  const issue = { revision: 1, status: "blocked" }
  const wakeups = [{ id: "timer", enabled: true }, { id: "other-campaign", enabled: true }]
  const api = { available: true }
  let requests = 0
  const server = Bun.serve({ port: 0, async fetch(request) {
    requests++
    if (!api.available) return new Response(null, { status: 503 })
    const route = new URL(request.url).pathname
    if (route === "/api/upload-file") {
      const file = (await request.formData()).get("file") as File
      const attachment = { id: `archive-${attachments.length + 1}`, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      attachments.push(attachment)
      return Response.json({ id: attachment.id, filename: attachment.filename })
    }
    if (route.endsWith("/download")) return new Response(attachments.find(item => route === `/api/attachments/${item.id}/download`)!.bytes)
    if (route.endsWith("/attachments")) return Response.json(attachments.map(({ id, filename }) => ({ id, filename })))
    if (route.endsWith("/comments/trigger-preview")) return Response.json({ agents: [] })
    if (route.endsWith("/comments")) {
      if (request.method === "POST") comments.push({ ...await request.json(), id: `comment-${comments.length + 1}` })
      return Response.json(request.method === "POST" ? comments.at(-1) : comments)
    }
    if (route.endsWith("/disable")) {
      wakeups.find(item => route.endsWith(`/wakeups/${item.id}/disable`))!.enabled = false
      return Response.json({})
    }
    if (route.endsWith("/wakeups")) return Response.json(wakeups)
    if (request.method === "PUT") Object.assign(issue, await request.json(), { revision: issue.revision + 1 })
    return Response.json(issue)
  } })
  await writeLeaseReceipt(path.join(source.root, "token"), { fixture: true })
  return { ...source, comments, attachments, issue, wakeups, api, get requests() { return requests },
    config: { stateDir: path.join(source.root, "ops/delivery"),
      multica: { url: `http://127.0.0.1:${server.port}`, workspace: "lab", issueId: "issue", tokenFile: path.join(source.root, "token") } },
    async close() { server.stop(true); await rm(source.root, { recursive: true, force: true }) } }
}

test("an old snapshot publishes a partial at the original deadline with unconfirmed host resources", async () => {
  const fixture = await publishingFixture()
  try {
    const observedAt = fixture.journal.lastProgressAt + 23 * 3600000
    const deadline = fixture.journal.lastProgressAt + 24 * 3600000
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, observedAt)
    const before = await Bun.file(fixture.snapshotFile).text()
    const waiting = await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, deadline - 1)
    expect(waiting.published).not.toBe(true)
    expect(fixture.requests).toBe(0)
    const finished = await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, deadline)
    expect(finished).toMatchObject({ final: "partial", published: true, cleanupVerified: false, lastProgressAt: fixture.journal.lastProgressAt, snapshotObservedAt: observedAt })
    expect(finished.attempts).toEqual(fixture.journal.attempts)
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("# частичный:")
    expect(fixture.comments[0]!.content).toContain("HOST_UNAVAILABLE")
    expect(fixture.comments[0]!.content).toContain("globalcleanupConfirmed=false")
    expect(fixture.comments[0]!.content).toContain(new Date(observedAt).toISOString())
    expect(fixture.comments[0]!.content).toContain("FAIL")
    expect(fixture.comments[0]!.content).toContain("ordinary/second/1: не измерено")
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeups).toEqual([{ id: "timer", enabled: false }, { id: "other-campaign", enabled: true }])
    expect(fixture.attachments).toHaveLength(1)
    const archive = path.join(fixture.config.stateDir, fixture.attachments[0]!.filename)
    const child = Bun.spawn(["tar", "-xOzf", archive, "manifest.json"], { stdout: "pipe", stderr: "pipe" })
    const [code, pinned] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(JSON.parse(pinned)).toEqual(fixture.manifest)
    expect(await Bun.file(fixture.snapshotFile).text()).toBe(before)
    expect(await readLeaseReceipt(fixture.journalFile)).toEqual(fixture.journal)
    expect((await stat(fixture.config.stateDir)).mode & 0o777).toBe(0o700)
  } finally { await fixture.close() }
})

test("snapshot delivery is durable and does not recreate a deleted published final", async () => {
  const fixture = await publishingFixture()
  try {
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    const now = fixture.journal.lastProgressAt + 24 * 3600000
    await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now)
    const before = await Bun.file(path.join(fixture.config.stateDir, "journal.json")).text(), requests = fixture.requests
    fixture.comments.length = 0
    const repeated = await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now + 900_000)
    expect(repeated.published).toBe(true)
    expect(fixture.comments).toHaveLength(0)
    expect(fixture.attachments).toHaveLength(1)
    expect(fixture.requests).toBe(requests)
    expect(await Bun.file(path.join(fixture.config.stateDir, "journal.json")).text()).toBe(before)
  } finally { await fixture.close() }
})

test("snapshot publication refuses invalid progress, observation or target identity before any API call", async () => {
  const fixture = await publishingFixture()
  try {
    const snapshot = await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    for (const change of [{ journal: { ...snapshot.journal, lastProgressAt: null } }, { observedAt: "later" },
      { journal: { ...snapshot.journal, campaignId: "another" } }]) {
      await writeLeaseReceipt(fixture.snapshotFile, { ...snapshot, ...change })
      await expect(publishCampaignSnapshot(fixture.snapshotFile, fixture.config, 25 * 3600000)).rejects.toThrow("CAMPAIGN_SNAPSHOT_IDENTITY")
    }
    await writeLeaseReceipt(fixture.snapshotFile, snapshot)
    await expect(publishCampaignSnapshot(fixture.snapshotFile, { ...fixture.config, multica: { ...fixture.config.multica, issueId: "another" } },
      25 * 3600000)).rejects.toThrow("CAMPAIGN_SNAPSHOT_IDENTITY")
    expect(fixture.requests).toBe(0)
    expect(await Bun.file(path.join(fixture.config.stateDir, "journal.json")).exists()).toBe(false)
  } finally { await fixture.close() }
})

test("delivery retry uses the newest validated snapshot without losing previously confirmed quality", async () => {
  const fixture = await publishingFixture()
  try {
    const now = 25 * 3600000
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    fixture.api.available = false
    await expect(publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now)).rejects.toThrow("MULTICA_503")
    fixture.journal.attempts.push({ key: fixture.manifest.keys[1]!, resultFile: "/unavailable/runner1/second/1/result.json",
      status: "completed", counted: true, pass: true, score: 100, cleanupConfirmed: true })
    fixture.journal.lastProgressAt = 1100
    await writeLeaseReceipt(fixture.journalFile, fixture.journal)
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 3000)
    fixture.api.available = true
    const finished = await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now + 1)
    expect(finished.attempts).toEqual(fixture.journal.attempts)
    expect(finished.snapshotObservedAt).toBe(3000)
    expect(finished.cleanupVerified).toBe(false)
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("Учтено 2/2")
    expect(fixture.comments[0]!.content).toContain("FAIL")
    expect(fixture.comments[0]!.content).toContain("PASS")
  } finally { await fixture.close() }
})

test("a stale snapshot cannot regress saved quality or observation after a failed delivery", async () => {
  const fixture = await publishingFixture()
  try {
    const now = 25 * 3600000
    const stale = await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    fixture.journal.attempts.push({ key: fixture.manifest.keys[1]!, resultFile: "/unavailable/runner1/second/1/result.json",
      status: "completed", counted: true, pass: true, score: 100, cleanupConfirmed: true })
    fixture.journal.lastProgressAt = 2000
    await writeLeaseReceipt(fixture.journalFile, fixture.journal)
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 3000)
    fixture.api.available = false
    await expect(publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now)).rejects.toThrow("MULTICA_503")
    await writeLeaseReceipt(fixture.snapshotFile, stale)
    await expect(publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now + 1)).rejects.toThrow("MULTICA_503")
    const saved = await readLeaseReceipt(path.join(fixture.config.stateDir, "journal.json")) as CampaignJournal
    expect(saved.attempts).toEqual(fixture.journal.attempts)
    expect(saved.lastProgressAt).toBe(2000)
    expect(saved.snapshotObservedAt).toBe(3000)
    await writeLeaseReceipt(fixture.snapshotFile, { ...stale, observedAt: 4000,
      journal: { ...stale.journal, attempts: stale.journal.attempts.map(attempt => ({ ...attempt, counted: false, pass: null })) } })
    await expect(publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now + 2)).rejects.toThrow("MULTICA_503")
    const newerObservation = await readLeaseReceipt(path.join(fixture.config.stateDir, "journal.json")) as CampaignJournal
    expect(newerObservation.attempts).toEqual(fixture.journal.attempts)
    expect(newerObservation).toMatchObject({ lastProgressAt: 2000, snapshotObservedAt: 4000 })
    await writeLeaseReceipt(fixture.snapshotFile, stale)
    fixture.api.available = true
    const finished = await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, now + 3)
    expect(finished.attempts).toEqual(fixture.journal.attempts)
    expect(finished).toMatchObject({ lastProgressAt: 2000, snapshotObservedAt: 4000, final: "partial", published: true })
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("Учтено 2/2")
    expect(fixture.comments[0]!.content).toContain(new Date(4000).toISOString())
  } finally { await fixture.close() }
})

test("snapshot retry validates saved delivery identity before using or replacing it", async () => {
  const fixture = await publishingFixture()
  try {
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    await mkdir(fixture.config.stateDir, { mode: 0o700 })
    const journalFile = path.join(fixture.config.stateDir, "journal.json")
    for (const change of [{ campaignId: "another" }, { server: "runner2" }, { manifestHash: "changed" }]) {
      await writeLeaseReceipt(journalFile, { ...fixture.journal, ...change, snapshotObservedAt: 3000 })
      const before = await Bun.file(journalFile).text()
      await expect(publishCampaignSnapshot(fixture.snapshotFile, fixture.config, 25 * 3600000)).rejects.toThrow("CAMPAIGN_SNAPSHOT_IDENTITY")
      expect(await Bun.file(journalFile).text()).toBe(before)
    }
    expect(fixture.requests).toBe(0)
  } finally { await fixture.close() }
})

test("a captured published final keeps its meaning and is never replaced by a partial", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.published = true
    await writeLeaseReceipt(fixture.journalFile, fixture.journal)
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    const known = await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, 25 * 3600000)
    expect(known).toEqual(fixture.journal)
    expect(fixture.requests).toBe(0)
    expect(await Bun.file(path.join(fixture.config.stateDir, "journal.json")).exists()).toBe(false)
  } finally { await fixture.close() }
})

test("snapshot publication adopts the existing remote final without replacing its report or archive", async () => {
  const fixture = await publishingFixture()
  try {
    const existing = { id: "remote-final", content: "<!-- eval-campaign:snapshot -->\n<!-- eval-final:full -->\n# полный\nАвторитетный итог службы." }
    fixture.comments.push(existing)
    await captureCampaignSnapshot(fixture.manifestFile, fixture.journalFile, fixture.snapshotFile, 2000)
    const finished = await publishCampaignSnapshot(fixture.snapshotFile, fixture.config, 25 * 3600000)
    expect(finished).toMatchObject({ final: "full", published: true, reportCommentId: "remote-final" })
    expect(fixture.comments).toEqual([existing])
    expect(fixture.attachments).toHaveLength(0)
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeups[0]!.enabled).toBe(false)
  } finally { await fixture.close() }
})

test("snapshot CLI captures protected state and publishes through the local server configuration", async () => {
  const fixture = await publishingFixture()
  try {
    const script = path.resolve("script/campaign-snapshot.ts")
    const capture = Bun.spawn([process.execPath, "--no-env-file", script, "--capture", "--manifest", fixture.manifestFile,
      "--journal", fixture.journalFile, "--out", fixture.snapshotFile], { stdout: "pipe", stderr: "pipe" })
    const [captureCode, captureOutput] = await Promise.all([capture.exited, new Response(capture.stdout).text(), new Response(capture.stderr).text()])
    expect(captureCode).toBe(0)
    expect(await Bun.file(fixture.snapshotFile).exists()).toBe(true)
    expect(JSON.parse(captureOutput).campaignId).toBe(fixture.manifest.id)
    expect(fixture.requests).toBe(0)
    const serverFile = path.join(fixture.root, "local-server.json")
    await writeLeaseReceipt(serverFile, { multica: { url: fixture.config.multica.url, workspace: "lab", tokenFile: fixture.config.multica.tokenFile } })
    const publish = Bun.spawn([process.execPath, "--no-env-file", script, "--snapshot", fixture.snapshotFile,
      "--server", serverFile, "--out", fixture.config.stateDir], { stdout: "pipe", stderr: "pipe" })
    const [publishCode, publishOutput] = await Promise.all([publish.exited, new Response(publish.stdout).text(), new Response(publish.stderr).text()])
    expect(publishCode).toBe(0)
    expect(JSON.parse(publishOutput)).toMatchObject({ campaignId: fixture.manifest.id, final: "partial", published: true })
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("globalcleanupConfirmed=false")
  } finally { await fixture.close() }
})
