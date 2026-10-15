import path from "node:path"
import { readFile, realpath, lstat } from "node:fs/promises"
import { checkEvalrunnerEvidence, checkEvalrunnerOutcome } from "./evalrunner"
import { readEvalrunnerSeries, evalrunnerHash, type EvalrunnerSlot, type EvalrunnerSeriesManifest } from "./evalrunner-series"
import type { verifyEvalrunnerModel } from "./evalrunner-model"
import type { RunSummary } from "./report"
import { loadTasks } from "./task"
import { parseVerdict, scoreVerdict } from "./judge"
import { checkOracle } from "./oracle"
import { validateNodeRun } from "./node-evals"

type Roots = { root: string; results: string; checkout?: string; profile?: string }
export type EvalrunnerMeasurement = Awaited<ReturnType<typeof verifyEvalrunnerSlot>>

export async function inspectEvalrunnerSeries(config: Roots, series: string) {
  const manifest = await readEvalrunnerSeries(config, series)
  const measurements: EvalrunnerMeasurement[] = []
  let next: EvalrunnerSlot | null = null
  for (const slot of manifest.slots) {
    const admission = path.join(config.root, "operations/series-admissions", `${manifest.issue}-${manifest.scope}`, `${slot.id}.json`)
    if (!await Bun.file(admission).exists()) {
      if (await Bun.file(path.join(series, "slots", slot.id, "release.json")).exists())
        return { status: "BLOCKED" as const, completed: measurements.length, expected: manifest.slots.length, next: null, blockedSlot: slot.id, reason: "Unadmitted evidence", measurements }
      next ??= slot
      continue
    }
    try {
      if (next) throw Error("Admission after an unadmitted slot")
      const raw = await readFile(admission, "utf8")
      const data = JSON.parse(raw)
      if (data.manifestSha256 !== evalrunnerHash(JSON.stringify(manifest, null, 2)) ||
        JSON.stringify(data.slot) !== JSON.stringify(slot) || data.issue !== manifest.issue || data.scope !== manifest.scope ||
        raw !== await readFile(path.join(series, "slots", slot.id, "manifest.json"), "utf8")) throw Error("Admission changed")
      measurements.push(await verifyEvalrunnerSlot(config, manifest, slot))
    } catch (error) {
      return { status: "BLOCKED" as const, completed: measurements.length, expected: manifest.slots.length, next: null, blockedSlot: slot.id,
        reason: error instanceof Error ? error.message : "Unconfirmed admitted slot", measurements }
    }
  }
  return { status: next ? "READY" as const : "COMPLETE" as const, completed: measurements.length,
    expected: manifest.slots.length, next, blockedSlot: null, reason: null, measurements }
}

export async function verifyEvalrunnerSlot(config: Roots, manifest: EvalrunnerSeriesManifest, slot: EvalrunnerSlot, requireModel = true) {
  const selected = path.join(manifest.series, "slots", slot.id)
  if (!await Bun.file(path.join(selected, "release.json")).exists()) throw Error("Admitted slot has no confirmed release; do not redispatch")
  const release = await checkEvalrunnerEvidence(selected) as Awaited<ReturnType<typeof checkEvalrunnerEvidence>> & {
    runDir: string; case: string; sessionId: string; verdict: string; code: number; summarySha256: string
  }
  if (release.case !== slot.case || !release.runDir.startsWith(selected + path.sep) || await realpath(release.runDir) !== release.runDir)
    throw Error("Slot release boundary differs")
  const summaryFile = path.join(release.runDir, "summary.json")
  if (evalrunnerHash(await readFile(summaryFile)) !== release.summarySha256) throw Error("Slot summary changed")
  const summary = await Bun.file(summaryFile).json() as RunSummary
  const node = slot.collection === "node"
  const outcome = checkEvalrunnerOutcome(summary, node)
  if (summary.config.repeat !== 1 || summary.task_ids.length !== 1 || summary.task_ids[0] !== slot.case || summary.tasks.length !== 1 ||
    summary.tasks[0]?.id !== slot.case || summary.tasks[0].attempts.length !== 1 || summary.config.keep_storage ||
    summary.config.timeout_ms !== 1_800_000 || summary.config.judge_timeout_ms !== 300_000 || summary.config.pass_threshold !== 70 ||
    summary.agent.cli_mode !== "binary" || summary.agent.cli_version !== (manifest.pins.cli as { version: string } | undefined)?.version ||
    !summary.harness?.git_sha || summary.harness.dirty !== false || !String(manifest.pins.harnessSha).startsWith(summary.harness.git_sha) ||
    summary.agent.model !== "openai/gpt-6.1-sol" || summary.agent.variant !== "medium" || summary.agent.source_dirty !== false ||
    summary.agent.source_commit !== (manifest.pins.cli as { sourceCommit: string } | undefined)?.sourceCommit ||
    summary.agent.binary_sha256 !== manifest.pins.binarySha256 || summary.loginom.image_digest !== manifest.pins.imageDigest ||
    (!node && (summary.judge?.model !== "gpt-6-sol" || summary.judge.reasoning !== "xhigh")) || node && summary.judge !== null)
    throw Error("Measured slot pins or coverage differ")
  const attempt = summary.tasks[0]!.attempts[0]!
  const cleanupFile = path.join(release.runDir, slot.case, "1/cleanup.json")
  const cleanup = await Bun.file(cleanupFile).json()
  if (cleanup.result?.status !== "confirmed" || cleanup.processes?.status !== "confirmed" || cleanup.processes?.observation_mode === "unit_after_exit" ||
    cleanup.processes?.capture_complete !== true || cleanup.processes?.unknownProcesses?.length ||
    !Array.isArray(cleanup.processes?.verification) || cleanup.processes.verification.length < 2 ||
    cleanup.processes.verification.some((pass: { owned_remaining: number }) => pass.owned_remaining !== 0) ||
    !["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].every(stage => cleanup.stages?.some((item: { stage: string; status: string }) => item.stage === stage && item.status === "confirmed")))
    throw Error("Slot native cleanup/history unconfirmed")
  if (!config.checkout) throw Error("Verifier checkout required")
  const tasksDir = path.join(config.checkout, "evals/tasks", node ? "node-evals" : slot.collection === "analytic" ? "analytic" : "")
  const task = (await loadTasks(tasksDir, [slot.case]))[0]!
  let verdict = outcome
  let failures = attempt.checklist?.filter(item => !item.passed).map(item => item.id) ?? []
  if (node) {
    const saved = await Bun.file(path.join(release.runDir, "code-verdict.json")).json()
    const checked = await validateNodeRun(release.runDir, [slot.case], tasksDir)
    if (checked.code === 2 || JSON.stringify(checked) !== JSON.stringify(saved)) throw Error("Node code verdict unconfirmed or changed")
    verdict = checked.verdict === "PASS" ? "PASS" : "FAIL"
    failures = checked.failures
  } else if (attempt.judge_status === "scored") {
    const parsed = parseVerdict(await Bun.file(path.join(release.runDir, slot.case, "1/judge/verdict.json")).text())
    if (!parsed) throw Error("Saved judge verdict invalid")
    const scored = scoreVerdict(task.checklist, parsed, 70)
    const oracle = await checkOracle(task, path.join(release.runDir, slot.case, "1/artifact"))
    if (!scored.ok || scored.score !== attempt.score || (scored.pass && oracle.passed !== false) !== attempt.pass || oracle.passed !== attempt.oracle_pass)
      throw Error("Rubric/checklist/oracle outcome differs")
  }
  if (release.verdict !== verdict || attempt.session_id !== release.sessionId) throw Error("Released product outcome differs")
  let modelProofSha256: string | null = null
  if (requireModel) {
    const proofFile = path.join(manifest.series, "completions", `${slot.id}.json`)
    if (!await Bun.file(proofFile).exists()) throw Error("Actual model proof missing; verify existing history without redispatch")
    const record = await Bun.file(proofFile).json() as { releaseSha256: string; model: Awaited<ReturnType<typeof verifyEvalrunnerModel>> }
    const model = record.model
    if (!config.profile || record.releaseSha256 !== evalrunnerHash(await readFile(path.join(selected, "release.json"))) ||
      model.status !== "VERIFIED" || model.sessionId !== release.sessionId || !model.assistantMessages ||
      model.messages.length !== model.assistantMessages || model.messages.some(item => item.providerID !== "openai" || item.modelID !== "gpt-6.1-sol" || item.variant !== "medium") ||
      !model.sourceHashesBefore.some(item => item.file === "loginom-ai-agent.db") ||
      JSON.stringify(model.sourceHashesBefore) !== JSON.stringify(model.sourceHashesAfter) ||
      !model.archive.startsWith(config.profile + ".history/") || await realpath(model.archive) !== model.archive) throw Error("Actual model proof differs")
    for (const source of model.sourceHashesBefore) {
      if (!["loginom-ai-agent.db", "loginom-ai-agent.db-wal", "loginom-ai-agent.db-shm"].includes(source.file)) throw Error("History source differs")
      const file = path.join(model.archive, "data", source.file)
      if ((await lstat(file)).isSymbolicLink() || evalrunnerHash(await readFile(file)) !== source.sha256) throw Error("Closed history source changed")
    }
    modelProofSha256 = evalrunnerHash(await readFile(proofFile))
  }
  return { slot, verdict, status: attempt.status, score: node ? null : attempt.score, pass: verdict === "PASS", failures,
    startedAt: summary.started_at, finishedAt: summary.finished_at,
    durationMs: attempt.duration_ms, tokens: attempt.tokens, sessionId: release.sessionId,
    releaseSha256: evalrunnerHash(await readFile(path.join(selected, "release.json"))), modelProofSha256, cleanupFile }
}
