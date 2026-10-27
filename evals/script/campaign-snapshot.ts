import path from "node:path"
import { lstat, mkdir, realpath } from "node:fs/promises"
import { parseArgs } from "node:util"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { campaignLimits, publishCampaign } from "./run-campaign"
import type { CampaignManifest, CampaignJournal } from "./run-campaign"

type CampaignSnapshot = { manifest: CampaignManifest; journal: CampaignJournal; observedAt: number }

function requireIdentity(manifest: CampaignManifest, journal: CampaignJournal) {
  if (!manifest || !journal || typeof manifest.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(manifest.id) ||
    !manifest.server || !manifest.executor || !Number.isFinite(journal.lastProgressAt) || journal.lastProgressAt < 0 ||
    journal.campaignId !== manifest.id || journal.server !== manifest.server || journal.executor !== manifest.executor ||
    journal.manifestHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"))
    throw Error("CAMPAIGN_SNAPSHOT_IDENTITY")
}

async function privateDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (!path.isAbsolute(directory) || !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700 ||
    await realpath(directory) !== directory) throw Error("CAMPAIGN_SNAPSHOT_DIRECTORY_PRIVATE")
}

export async function captureCampaignSnapshot(manifestFile: string, journalFile: string, snapshotFile: string, now = Date.now()) {
  const manifest = await readLeaseReceipt(manifestFile) as CampaignManifest, journal = await readLeaseReceipt(journalFile) as CampaignJournal
  requireIdentity(manifest, journal)
  const snapshot = { manifest, journal, observedAt: now }
  await privateDirectory(path.dirname(snapshotFile))
  await writeLeaseReceipt(snapshotFile, snapshot)
  return snapshot
}

export async function publishCampaignSnapshot(snapshotFile: string, config: Parameters<typeof publishCampaign>[2], now = Date.now()) {
  const snapshot = await readLeaseReceipt(snapshotFile) as CampaignSnapshot
  if (!snapshot || !Number.isFinite(snapshot.observedAt) || snapshot.observedAt < 0 || snapshot.manifest?.issueId !== config.multica.issueId)
    throw Error("CAMPAIGN_SNAPSHOT_IDENTITY")
  requireIdentity(snapshot.manifest, snapshot.journal)
  if (snapshot.journal.published || now - snapshot.journal.lastProgressAt < campaignLimits(snapshot.manifest).noProgressMs) return snapshot.journal
  await privateDirectory(config.stateDir)
  const journalFile = path.join(config.stateDir, "journal.json")
  let journal = structuredClone(snapshot.journal), observedAt = snapshot.observedAt
  if (await Bun.file(journalFile).exists()) {
    const previous = await readLeaseReceipt(journalFile) as CampaignJournal
    requireIdentity(snapshot.manifest, previous)
    if (previous.published) return previous
    if ((previous.snapshotObservedAt ?? 0) > observedAt) journal = previous
    const attempts = new Map(snapshot.journal.attempts.map(attempt => [attempt.resultFile, attempt]))
    for (const attempt of previous.attempts)
      if (attempt.counted || !attempts.has(attempt.resultFile)) attempts.set(attempt.resultFile, attempt)
    journal.attempts = [...attempts.values()]
    journal.lastProgressAt = Math.max(previous.lastProgressAt, snapshot.journal.lastProgressAt)
    observedAt = Math.max(previous.snapshotObservedAt ?? 0, observedAt)
  }
  Object.assign(journal, { final: "partial", cleanupVerified: false,
    blocker: "NO_PROGRESS_LIMIT:HOST_UNAVAILABLE", blockerKind: "external", snapshotObservedAt: observedAt })
  await writeLeaseReceipt(journalFile, journal)
  await publishCampaign(snapshot.manifest, journal, config, now)
  return journal
}

async function main() {
  const args = parseArgs({ args: Bun.argv.slice(2), options: { capture: { type: "boolean" }, manifest: { type: "string" },
    journal: { type: "string" }, snapshot: { type: "string" }, server: { type: "string" }, out: { type: "string" } } }).values
  if (!args.out) throw Error("CAMPAIGN_SNAPSHOT_ARGUMENTS")
  if (args.capture) {
    if (!args.manifest || !args.journal || args.snapshot || args.server) throw Error("CAMPAIGN_SNAPSHOT_ARGUMENTS")
    const snapshot = await captureCampaignSnapshot(args.manifest, args.journal, args.out)
    console.log(JSON.stringify({ campaignId: snapshot.manifest.id, observedAt: snapshot.observedAt }))
    return
  }
  if (!args.snapshot || !args.server || args.manifest || args.journal) throw Error("CAMPAIGN_SNAPSHOT_ARGUMENTS")
  const server = await readLeaseReceipt(args.server) as { multica: Omit<Parameters<typeof publishCampaign>[2]["multica"], "issueId"> }
  const snapshot = await readLeaseReceipt(args.snapshot) as CampaignSnapshot
  const journal = await publishCampaignSnapshot(args.snapshot, { stateDir: args.out,
    multica: { ...server.multica, issueId: snapshot.manifest?.issueId ?? "" } })
  console.log(JSON.stringify({ campaignId: journal.campaignId, final: journal.final ?? null, published: journal.published === true }))
}

if (import.meta.main) await main().catch(error => {
  console.error(error instanceof Error && /^[A-Z][A-Z0-9_:]+$/.test(error.message) ? error.message : "CAMPAIGN_SNAPSHOT_FAILED")
  process.exitCode = 2
})
