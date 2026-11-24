// Offline evidence. Assignment in a private campaign manifest never enters the model prompt.
import path from "node:path"
import { readdir } from "node:fs/promises"
import { parseArgs } from "node:util"
import type { CampaignJournal, CampaignManifest } from "./run-campaign"
import type { AttemptResult } from "../src/report"

const options = { type: "string" } as const
const { values } = parseArgs({ options: {
  run: options, purpose: options, assignment: options, manifest: options, journal: options, cold: options,
} })
const purposes = ["pilot", "held-out", "controlled", "corpus"]
type Key = Pick<CampaignManifest["keys"][number], "taskId" | "round" | "experiment"> & { corpus?: string }
type Admission = { purpose: "preflight" | "measurement"; attempt: number; taskId: string; slotId: string }
type Entry = {
  commandId: string; sourceCommit: string | null; slot: string; resultFile: string
  result: ReturnType<typeof outcome> | null; initial?: ReturnType<typeof outcome>
  cold: Awaited<ReturnType<typeof coldOutcome>> | null; accounted?: ReturnType<typeof accounting>
}
const keyId = (k: Key) => JSON.stringify([k.corpus, k.taskId, k.round])
const index = new Map<string, Key & { attempts: Entry[] }>()
const gaps: ({ missing: string } | { resultFile: string; key: Key; accounted: ReturnType<typeof accounting> })[] = []
const seenResults = new Set<string>()
let preflights = 0

function plan(key: Key) {
  if (!/^[\w-]+$/.test(key.taskId) || !Number.isSafeInteger(key.round) || key.round < 1 || index.has(keyId(key)))
    throw Error("Invalid or duplicate planned key")
  index.set(keyId(key), { ...key, attempts: [] })
}

async function readRun(runDir: string, keys: Key[], ledger?: CampaignJournal) {
  const config = await Bun.file(path.join(runDir, "config.json")).json()
  if (!config.commandJournal) { gaps.push({ missing: path.join(runDir, "config.json") + "#commandJournal" }); return }
  if (typeof config.commandJournal !== "string" || !path.isAbsolute(config.commandJournal)) throw Error("Invalid native journal path")
  const journal = Bun.file(config.commandJournal)
  if (!await journal.exists()) { gaps.push({ missing: config.commandJournal }); return }
  const native = await journal.json()
  if (native.version !== 2 || native.kind !== "unactivated-preparation" || native.runDir !== runDir ||
      !native.commandId || path.basename(config.commandJournal) !== `run-command-${native.commandId}.json`) throw Error("Native admission identity mismatch")
  if (!Array.isArray(native.attempts)) { gaps.push({ missing: config.commandJournal + "#attempts" }); return }
  for (const entry of native.attempts as Admission[]) {
    if (entry.purpose === "preflight") { preflights++; continue }
    const matches = keys.filter(key => key.taskId === entry.taskId)
    const row = matches.length === 1 ? index.get(keyId(matches[0]!)) : undefined
    if (!row || entry.purpose !== "measurement" || entry.attempt !== 1) throw Error("Measurement does not match the assigned key")
    const resultFile = path.join(runDir, row.taskId, String(entry.attempt), "result.json")
    if (seenResults.has(resultFile)) throw Error("Duplicate native measurement")
    seenResults.add(resultFile)
    const file = Bun.file(resultFile)
    const result: AttemptResult | null = await file.exists() ? await file.json() : null
    if (result && (result.task_id !== entry.taskId || result.attempt !== entry.attempt || result.slot_id !== entry.slotId))
      throw Error("Result identity mismatch")
    const accounted = ledger?.attempts.find(item => item.resultFile === resultFile)
    if (accounted && keyId(accounted.key) !== keyId(row)) throw Error("Ledger result identity mismatch")
    row.attempts.push({ commandId: native.commandId, sourceCommit: config.source_commit ?? null, slot: entry.slotId, resultFile, result: result && outcome(result),
      cold: values.cold ? await coldOutcome(path.dirname(resultFile), values.cold).catch(() => ({ source: values.cold!, gap: "unavailable" })) : null,
      ...(result?.infra_retry ? { initial: outcome(result.infra_retry.initial) } : {}),
      ...(accounted ? { accounted: accounting(accounted) } : {}) })
  }
}

async function audit() {
  if (values.run && !values.manifest && !values.journal && values.purpose === "pilot" && values.assignment) {
    const runDir = path.resolve(values.run)
    const config = await Bun.file(path.join(runDir, "config.json")).json()
    if (!Array.isArray(config.only) || config.only.length !== 1 || config.repeat !== 1) throw Error("Expected exactly one assigned pilot task")
    const key = { taskId: config.only[0], round: 1 }
    plan(key)
    await readRun(runDir, [key])
    return { purpose: values.purpose, assignment: values.assignment }
  }
  if (!values.manifest || !values.journal || values.run || values.purpose || values.assignment || values.cold)
    throw Error("Expected --run DIR --purpose pilot --assignment ID [--cold RESULT], or --manifest FILE --journal FILE")
  const manifest: CampaignManifest = await Bun.file(values.manifest).json()
  const ledger: CampaignJournal = await Bun.file(values.journal).json()
  if (manifest.id !== ledger.campaignId || ledger.manifestHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"))
    throw Error("Campaign manifest and ledger disagree")
  if (manifest.seriesPurpose !== undefined && !purposes.includes(manifest.seriesPurpose)) throw Error("Unknown recovery series purpose")
  manifest.keys.forEach(plan)
  for (const batch of ledger.batches) {
    for (const item of await readdir(batch.resultsDir, { withFileTypes: true }).catch(error => { missingFile(error); return [] })) {
      if (item.isDirectory()) await readRun(path.join(batch.resultsDir, item.name), batch.keys, ledger).catch(missingFile)
    }
  }
  for (const item of ledger.attempts) {
    if (!index.has(keyId(item.key))) throw Error("Unplanned ledger result")
    if (!seenResults.has(item.resultFile)) gaps.push({ resultFile: item.resultFile, key: item.key, accounted: accounting(item) })
  }
  return { purpose: manifest.seriesPurpose ?? null, assignment: manifest.id }
}

function missingFile(error: NodeJS.ErrnoException) {
  if (error.code !== "ENOENT" || !error.path) throw error
  gaps.push({ missing: error.path })
}

function accounting(item: CampaignJournal["attempts"][number]) {
  return { counted: item.counted, pass: item.pass, score: item.score, cleanupConfirmed: item.cleanupConfirmed }
}

function outcome(result: AttemptResult) {
  return { sessionId: result.session_id, status: result.status, exitCode: result.exit_code, package: result.package_path,
    failure: result.failure_kind, skillAudit: result.skill_audit, oraclePass: result.oracle_pass,
    judgeStatus: result.judge_status, pass: result.pass, score: result.score, cleanup: result.environment_cleanup?.status ?? null }
}

async function coldOutcome(attemptDir: string, source: string) {
  const cold = await Bun.file(source).json()
  const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(attemptDir, "artifact/package.lgp")).bytes()).digest("hex")
  if (digest !== cold.serverLgpSha256) return { source, gap: "package-mismatch" }
  return { source, serverLgpSha256: digest, status: cold.status, allNodesExecuted: cold.allNodesExecuted,
    settingsApplied: cold.settingsApplied, saveRequested: cold.saveRequested, serverLgpUnchanged: cold.serverLgpUnchanged,
    nodeCount: cold.nodeCount, cleanup: cold.cleanup ?? null }
}

const series = await audit()
console.log(JSON.stringify({ ...series, planned: Object.fromEntries(purposes.map(p => [p, series.purpose === p ? index.size : 0])),
  preflights, gaps, keys: [...index.values()] }, null, 2))
