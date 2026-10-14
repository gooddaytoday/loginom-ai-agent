import path from "node:path"
import { createHash } from "node:crypto"
import { appendFile, lstat, mkdir, readdir, realpath, unlink, writeFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { inspectSelection, inspectSelectionReview, readSelectionReceipt } from "../src/node-selection"
import type { SelectionMode } from "../src/node-selection"
import { readSelectionSnapshot, runSelectionAttempt, selectionAttempt } from "./run-node-selection-attempt"
import { buildAgentPrompt, loadTasks } from "../src/task"
import { assessTechnicalContinuation, selectionPackageCleanup } from "../src/node-selection-continuation"

export async function verifySeriesInputs(inputs: ReadonlyMap<string, string>) {
  for (const [file, expected] of inputs) if (await hash(file) !== expected) throw Error("SERIES_INPUT_CHANGED")
}

type SeriesAcceptance = { criteriaVersion: "node-selection-policy-v2"; criteriaSha256: string }

async function sealedSeriesFile(file: string, expected: unknown) {
  if (!path.isAbsolute(file) || !digest(expected) || !(await lstat(file)).isFile() || (await lstat(file)).mode & 0o222
    || await hash(file) !== expected) throw Error("SERIES_SEAL_MISMATCH")
  return await Bun.file(file).json() as unknown
}

async function readSeriesAcceptance(lockFile: string, expectedHash: string, acceptance?: { path: string; sha256: string }) {
  const lock = await sealedSeriesFile(lockFile, expectedHash)
  const inputs = new Map<string, string>([[lockFile, expectedHash]])
  const sourceOverrides: Record<string, string> = {}
  if (!acceptance) return { lock, inputs, sourceOverrides, context: undefined }
  const value = await sealedSeriesFile(acceptance.path, acceptance.sha256)
  if (!record(value) || value.version !== 2 || value.ready !== true) throw Error("SERIES_ACCEPTANCE_NOT_ADMITTED")
  if (value.criteriaVersion !== "node-selection-policy-v2" || !digest(value.criteriaSha256) || !nonempty(value.criteriaPath)
    || !path.isAbsolute(value.criteriaPath) || value.originalProtocolPath !== lockFile || value.originalProtocolSha256 !== expectedHash
    || !nonempty(value.originalSourceArchiveIndexPath) || !digest(value.originalSourceArchiveIndexSha256)
    || !record(value.sourceOverrides) || !record(lock) || !record(lock.files)) throw Error("SERIES_ACCEPTANCE_BINDING_INVALID")
  const allowed = ["evals/script/run-node-selection-series.ts", "evals/test/node-selection-series.test.ts",
    "evals/src/node-selection-continuation.ts", "evals/test/node-selection-continuation.test.ts"]
  const overrides = value.sourceOverrides, files = lock.files
  if (Object.keys(overrides).length !== allowed.length || allowed.some((name) => !digest(overrides[name])
    || !digest(files[name]))) throw Error("SERIES_SOURCE_OVERRIDE_FORBIDDEN")
  const index = await sealedSeriesFile(value.originalSourceArchiveIndexPath, value.originalSourceArchiveIndexSha256)
  if (!record(index) || index.version !== 1 || index.originalProtocolSha256 !== expectedHash || !record(index.sourceFiles)
    || Object.keys(index.sourceFiles).length !== Object.keys(files).length) throw Error("SERIES_SOURCE_ARCHIVE_INVALID")
  for (const [relative, expected] of Object.entries(files)) {
    const archived = index.sourceFiles[relative]
    if (!record(archived) || !nonempty(archived.path) || !path.isAbsolute(archived.path) || archived.sha256 !== expected || !digest(expected))
      throw Error("SERIES_SOURCE_ARCHIVE_INVALID")
    if (!(await lstat(archived.path)).isFile() || (await lstat(archived.path)).mode & 0o222 || await hash(archived.path) !== expected)
      throw Error("SERIES_SEAL_MISMATCH")
    inputs.set(archived.path, expected)
  }
  if (!(await lstat(value.criteriaPath)).isFile() || await hash(value.criteriaPath) !== value.criteriaSha256)
    throw Error("SERIES_ACCEPTANCE_BINDING_INVALID")
  inputs.set(acceptance.path, acceptance.sha256)
  inputs.set(value.criteriaPath, value.criteriaSha256)
  inputs.set(value.originalSourceArchiveIndexPath, value.originalSourceArchiveIndexSha256)
  for (const name of allowed) sourceOverrides[name] = String(overrides[name])
  const context: SeriesAcceptance = { criteriaVersion: "node-selection-policy-v2", criteriaSha256: value.criteriaSha256 }
  return { lock, inputs, sourceOverrides, context }
}

export async function runSelectionSeries(lockFile: string, expectedHash: string, limit = 31, acceptance?: { path: string; sha256: string }) {
  if (!path.isAbsolute(lockFile) || !digest(expectedHash) || !Number.isSafeInteger(limit) || limit < 1 || limit > 31)
    throw Error("SERIES_ARGUMENTS_INVALID")
  const { lock, inputs, sourceOverrides, context } = await readSeriesAcceptance(lockFile, expectedHash, acceptance)
  if (!record(lock) || lock.ready !== true || !record(lock.files) || !record(lock.pinsSha256)
    || !digest(lock.auditVersion) || !nonempty(lock.matrixInterfaceCheckPath) || !record(lock.runtimeSourcePins)
    || !nonempty(lock.runtimeSourcePins.path)) throw Error("SERIES_NOT_ADMITTED")
  const slots = selectionSeriesSlots(lock)
  const runtime = await sealedSeriesFile(lock.runtimeSourcePins.path, lock.runtimeSourcePins.sha256)
  inputs.set(lock.runtimeSourcePins.path, String(lock.runtimeSourcePins.sha256))
  const matrix = await sealedSeriesFile(lock.matrixInterfaceCheckPath, lock.matrixInterfaceCheckSha256)
  inputs.set(lock.matrixInterfaceCheckPath, String(lock.matrixInterfaceCheckSha256))
  if (!record(matrix) || !Array.isArray(matrix.slots) || matrix.slots.length !== 31 || matrix.promptArgumentCount !== 3 || !record(runtime))
    throw Error("SERIES_MATRIX_INVALID")
  const pinHashes = lock.pinsSha256
  const matrixSlots = matrix.slots
  const plans = await Promise.all(slots.map(async (slot, index) => {
    const names = Object.keys(pinHashes).filter((name) => name.startsWith(slot.phase + "-pins") && name.endsWith(".json"))
    if (names.length !== 1 || path.basename(names[0]!) !== names[0]) throw Error("SERIES_PINS_AMBIGUOUS")
    const file = path.join(path.dirname(lockFile), names[0]!)
    const raw = await sealedSeriesFile(file, pinHashes[names[0]!])
    inputs.set(file, String(pinHashes[names[0]!]))
    const plan = selectionAttempt(raw, slot.task, slot.attempt)
    if (plan.pins.phase !== slot.phase || plan.pins.resultsRoot !== path.dirname(lockFile) || plan.pins.runID !== lock.runID
      || !record(raw) || raw.auditVersion !== lock.auditVersion) throw Error("SERIES_PINS_MISMATCH")
    const projected = matrixSlots[index]
    const task = (await loadTasks(path.dirname(plan.task.directory), [slot.task]))[0]!
    if (!record(projected) || projected.phase !== slot.phase || projected.task !== slot.task || projected.attempt !== slot.attempt
      || projected.mode !== plan.task.mode || projected.directory !== plan.directory || projected.prefix !== plan.prefix
      || projected.workspace !== plan.workspace || projected.packagePath !== plan.packagePath || projected.resultName !== plan.resultName
      || projected.promptSha256 !== createHash("sha256").update(buildAgentPrompt(task.prompt, plan.packagePath, plan.resultName)).digest("hex"))
      throw Error("SERIES_MATRIX_MISMATCH")
    const revision = runtime[slot.phase]
    if (!record(revision) || !digest(revision.revision)) throw Error("SERIES_RUNTIME_PIN_INVALID")
    return { plan, file, revision: revision.revision }
  }))
  if (new Set(plans.map(({ plan }) => plan.pins.profile)).size !== 1) throw Error("SERIES_PROFILE_MISMATCH")
  for (const phase of ["baseline", "candidate"]) {
    const pinned = plans.find(({ plan }) => plan.pins.phase === phase)!.plan.pins
    const count = Object.values(pinned.tasks).reduce((sum, task) => sum + task.attempts.length, 0)
    if (count !== (phase === "baseline" ? 6 : 25)) throw Error("SERIES_PINNED_SLOTS_MISMATCH")
  }
  for (const required of ["evals/script/run-node-selection-series.ts", "evals/script/run-node-selection-attempt.ts",
    "evals/src/node-selection-continuation.ts", "evals/src/node-selection.ts", "evals/test/node-selection-series.test.ts",
    "evals/test/node-selection-continuation.test.ts"])
    if (!digest(lock.files[required])) throw Error("SERIES_SOURCE_NOT_SEALED")
  // Recheck this small evaluator closure before every slot: the auditor is a
  // fresh subprocess. The thousands of immutable payload files are not rehashed.
  for (const [relative, original] of Object.entries(lock.files)) {
    const expected = sourceOverrides[relative] ?? original
    const file = await ownFile(path.resolve(import.meta.dir, "../.."), relative)
    if (!digest(expected) || await hash(file) !== expected) throw Error("SERIES_SOURCE_CHANGED")
    inputs.set(file, expected)
  }
  const directory = path.join(path.dirname(lockFile), "series")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const lease = path.join(directory, ".active")
  await writeJson(lease, { pid: process.pid, lockSha256: expectedHash, startedAt: new Date().toISOString() })
  let dispatched = 0
  try {
    for (const [index, item] of plans.entries()) {
      await verifySeriesInputs(inputs)
      const existing = await exists(path.join(directory, `${item.plan.pins.phase}-${item.plan.taskID}-${item.plan.number}`, "dispatch.json"))
      if (!existing && dispatched >= limit) return { status: "paused-limit", next: slots[index], dispatched }
      if (!existing) dispatched++
      const result = await runSeriesSlot(item.file, item.plan.taskID, item.plan.number, lock.auditVersion, item.revision, true, context)
      const auditFile = path.join(item.plan.directory, "selection-audit.json")
      await appendFile(path.join(directory, "ledger.jsonl"), JSON.stringify({ recordedAt: new Date().toISOString(), lockSha256: expectedHash,
        ...(context ? { version: 2, ...context, acceptanceLockSha256: acceptance!.sha256 } : {}),
        slot: slots[index], rechecked: existing, ...result, auditSha256: await exists(auditFile) ? await hash(auditFile) : null }) + "\n", { mode: 0o600 })
      if (result.decision !== "advance") return { status: result.decision, slot: slots[index], reason: result.reason, dispatched }
    }
    // Final policy/review acceptance and comparison reporting remain separate.
    return { status: "machine-complete-review-required", dispatched }
  } finally { await unlink(lease) }
}

export function selectionSeriesSlots(lock: unknown): { phase: string; task: string; attempt: number }[] {
  if (!record(lock) || lock.technicalContinuationVersion !== 1 || !record(lock.executionSchedule) || lock.plannedModelSlots !== 31
    || lock.plannedBaselineSlots !== 6 || lock.plannedCandidateSlots !== 25) throw Error("SERIES_SCHEDULE_INVALID")
  const schedule = lock.executionSchedule
  if (!["completedFirst9RequiredBeforeBaseline", "technicalFailuresRemainFailed", "strictReleaseBeforeNext", "trustedHistoryBeforeContinuation",
    "noStartedAttemptReplacement", "comparativePassRequiresBothPhasesComplete", "policyViolationStopsDigestImmediately"]
    .every((key) => schedule[key] === true)) throw Error("SERIES_SCHEDULE_INVALID")
  const slots = [["candidateFirst9", 9, "candidate"], ["baseline6", 6, "baseline"], ["candidateRemaining16", 16, "candidate"]]
    .flatMap(([key, count, phase]) => {
      const group = schedule[String(key)]
      if (!Array.isArray(group) || group.length !== count) throw Error("SERIES_SCHEDULE_INVALID")
      return group.map((slot: unknown) => {
        if (!record(slot) || slot.phase !== phase || !nonempty(slot.task) || !Number.isSafeInteger(slot.attempt)
          || ![1, 2, 3].includes(Number(slot.attempt)) || key !== "candidateRemaining16" && slot.attempt !== 1
          || key === "candidateRemaining16" && slot.attempt === 1) throw Error("SERIES_SLOT_INVALID")
        return { phase: String(phase), task: slot.task, attempt: Number(slot.attempt) }
      })
    })
  if (new Set(slots.map((slot) => `${slot.phase}/${slot.task}/${slot.attempt}`)).size !== 31) throw Error("SERIES_SLOT_INVALID")
  return slots
}

export async function runSeriesSlot(pinsFile: string, taskID: string, number: number, auditVersion: string, runtimeRevision?: string, technicalContinuation = false,
  acceptance?: SeriesAcceptance) {
  const plan = selectionAttempt(await Bun.file(pinsFile).json() as unknown, taskID, number)
  const directory = path.join(plan.pins.resultsRoot, "series", `${plan.pins.phase}-${taskID}-${number}`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (await exists(path.join(directory, "dispatch.json"))) {
    if (technicalContinuation && await exists(path.join(directory, "technical-continuation.json")))
      return assessTechnicalContinuation(plan, directory, pinsFile, auditVersion, runtimeRevision, acceptance)
    if (!await exists(path.join(directory, "closure.json"))) return { decision: "halt", reason: "SLOT_ALREADY_DISPATCHED" }
    return assessCollected(plan, directory, auditVersion, runtimeRevision, acceptance)
  }
  if (await exists(plan.directory)) return { decision: "halt", reason: "SLOT_ALREADY_EXISTS" }
  if (await exists(path.join(plan.pins.profile, ".writer"))) return { decision: "halt", reason: "PROFILE_BUSY" }
  const before = await hostFiles(plan.pins.profile)
  await writeJson(path.join(directory, "dispatch.json"), { pinsFile, pinsSha256: await hash(pinsFile), taskID, number,
    ...(acceptance ? { version: 2, ...acceptance } : {}),
    auditVersion, startedAt: new Date().toISOString(), hostFilesBefore: before })
  const state: { running: boolean; interruptReason: string | null; reading: boolean } = { running: true, interruptReason: null, reading: false }
  const timer = setInterval(() => {
    if (!state.running || state.reading || state.interruptReason) return
    state.reading = true
    void Bun.file(path.join(plan.directory, "events.jsonl")).text().then((text) => {
      const mode = plan.pins.phase === "baseline" ? "explicit-js" : plan.task.mode
      const check = inspectSeriesLiveParts(text, mode)
      if (check.stop) return check
      const event = completeEvents(text).find((value) => record(value) && nonempty(value.sessionID))
      if (!record(event) || !nonempty(event.sessionID)) return check
      // CLI emits tool_use only on completion. Read the durable running part
      // from the exact Session already bound by this child's own event stream.
      return inspectSeriesLiveParts(text, mode, readSelectionSnapshot(path.join(plan.pins.profile, "data/loginom-ai-agent.db"), event.sessionID))
    })
      .then((check) => {
        if (!check.stop || !state.running || state.interruptReason) return
        state.interruptReason = check.reason
        // Invoke the currently installed single-runner cancellation handler;
        // it owns the sole SIGINT, deadline, grace period and CLI cleanup.
        if (process.listenerCount("SIGINT")) process.emit("SIGINT")
      }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || !state.running || state.interruptReason) return
        state.interruptReason = "LIVE_EVIDENCE_INVALID"
        if (process.listenerCount("SIGINT")) process.emit("SIGINT")
      }).finally(() => { state.reading = false })
  }, 250)
  const attempt = await runSelectionAttempt(pinsFile, taskID, number).finally(() => { state.running = false; clearInterval(timer) })
  await writeJson(path.join(directory, "returned.json"), { evidence: attempt.evidence, attemptSha256: await hash(path.join(attempt.evidence, "attempt.json")),
    interruptReason: state.interruptReason })
  if (state.interruptReason || attempt.cliExitCode !== 0 || attempt.cleanupConfirmed !== true)
    return { decision: "halt", reason: state.interruptReason ?? attempt.blocker ?? "ATTEMPT_NOT_COMPLETE" }
  try {
    await collectSeriesSlot(plan, directory, before, auditVersion, runtimeRevision)
    return await assessCollected(plan, directory, auditVersion, runtimeRevision, acceptance)
  } catch (error) {
    await writeJson(path.join(directory, "collection-failure.json"), { reason: error instanceof Error ? error.message : "CLOSE_COLLECTION_FAILED" })
    return { decision: "halt", reason: "CLOSE_COLLECTION_FAILED" }
  }
}

// Copies only the ended attempt's exact runtime. The Host receipt has no chat ID,
// so attribution requires a sole newly created file inside this exclusive interval.
export async function collectSeriesSlot(plan: ReturnType<typeof selectionAttempt>, directory: string, before: string[], auditVersion: string, runtimeRevision?: string) {
  const attempt: unknown = await Bun.file(path.join(plan.directory, "attempt.json")).json()
  const snapshot: unknown = await Bun.file(path.join(plan.directory, "parts.json")).json()
  const manifest: unknown = await Bun.file(path.join(plan.directory, "runtime-journals.json")).json()
  if (!record(attempt) || !record(snapshot) || !Array.isArray(snapshot.parts) || !Array.isArray(manifest)
    || !nonempty(attempt.sessionID) || snapshot.sessionID !== attempt.sessionID || attempt.evidence !== plan.directory)
    throw Error("CLOSE_SESSION_UNBOUND")
  if (attempt.taskID !== plan.taskID || attempt.mode !== plan.task.mode || attempt.packagePath !== plan.packagePath
    || attempt.model !== plan.pins.model || attempt.variant !== plan.pins.variant || attempt.expectedSkillDigest !== plan.pins.expectedSkillDigest
    || attempt.binaryManifestSha256 !== plan.pins.manifestSha256) throw Error("CLOSE_ATTEMPT_PINS_MISMATCH")
  const chat = createHash("sha256").update(attempt.sessionID).digest("hex")
  const sessions = manifest.filter(record).filter((entry) => typeof entry.path === "string" && entry.path.endsWith("/session.json"))
  if (sessions.length !== 1) throw Error("CLOSE_RUNTIME_NOT_UNIQUE")
  const entry = sessions[0]!
  if (!nonempty(entry.path) || !nonempty(entry.source) || !digest(entry.sha256)
    || !new RegExp(`^runtime/generations/[^/]+/chats/${chat}/attempts/[^/]+/session\\.json$`).test(entry.path)) throw Error("CLOSE_RUNTIME_UNBOUND")
  const localSession = await ownFile(plan.directory, entry.path)
  const source = path.join(plan.pins.profile, "loginom", entry.path)
  if (entry.source !== source || await realpath(source) !== source || await hash(localSession) !== entry.sha256
    || await hash(source) !== entry.sha256) throw Error("CLOSE_RUNTIME_CHANGED")
  const session: unknown = await Bun.file(localSession).json()
  if (!record(session) || !nonempty(session.sessionId) || session.skillRevision !== plan.pins.expectedSkillDigest
    || !runtimeRevision || session.clientRevision !== runtimeRevision) throw Error("CLOSE_RUNTIME_PIN_MISMATCH")
  const outputs: unknown = await Bun.file(path.join(plan.directory, "tool-outputs.json")).json()
  if (!Array.isArray(outputs)) throw Error("CLOSE_OUTPUT_MANIFEST_INVALID")
  const parts = await Promise.all(snapshot.parts.map(async (part: unknown) => {
    if (!record(part) || !record(part.state) || !record(part.state.metadata) || part.state.metadata.truncated !== true) return part
    const matches = outputs.filter(record).filter((output) => output.partID === part.id)
    if (matches.length !== 1 || !nonempty(matches[0]!.path) || !digest(matches[0]!.sha256)
      || matches[0]!.source !== part.state.metadata.outputPath) throw Error("CLOSE_OUTPUT_UNAVAILABLE")
    const file = await ownFile(plan.directory, matches[0]!.path)
    if (await hash(file) !== matches[0]!.sha256) throw Error("CLOSE_OUTPUT_CHANGED")
    return { ...part, state: { ...part.state, output: await Bun.file(file).text(), metadata: { ...part.state.metadata, truncated: false } } }
  }))
  const receipts = parts.filter(record).filter((part) => part.sessionID === attempt.sessionID && record(part.state)
    && part.state.status === "completed").map((part) => ({ part, value: readSelectionReceipt(part) }))
  const prepared = receipts.filter(({ part, value }) => part.tool === "loginom_dock_prepare" && record(value)
    && value.prepared === true && value.sessionId === session.sessionId).map(({ value }) => value).filter(record)
  if (!prepared.length || prepared.some((value) => !record(value.workspace) || value.workspace.status !== "READY"
    || !nonempty(value.workspace.document_id) || value.workspace.loginom_account !== plan.pins.connection.username)) throw Error("CLOSE_PREPARE_UNBOUND")
  const workspace = prepared[0]!.workspace
  if (!record(workspace) || prepared.some((value) => !record(value.workspace) || value.workspace.document_id !== workspace.document_id))
    throw Error("CLOSE_DOCUMENT_UNBOUND")
  const saves = receipts.filter(({ part, value }) => part.tool === "loginom_dock_action_run" && record(part.state)
    && record(part.state.input) && ["package.save_as", "package.save_checkpoint"].includes(String(part.state.input.action_key))
    && record(value) && value.status === "SUCCEEDED" && value.cleanup_complete === true && value.operation_id === part.state.input.operation_id
    && record(value.output) && (value.output.save_completed === true || value.output.reopened === true) && record(value.output.package_ref)
    && value.output.package_ref.path === plan.packagePath).map(({ value }) => value).filter(record)
  if (!saves.length) throw Error("CLOSE_SAVE_UNBOUND")
  const save = saves.at(-1)!
  const copied: Record<string, string> = {}
  const cleanup = await selectionPackageCleanup(path.dirname(source))
  for (const name of [cleanup.name, "resource-close.jsonl", "terminal-close.jsonl"]) {
    const from = await ownFile(path.dirname(source), name)
    const target = path.join(directory, name)
    await writeFile(target, await Bun.file(from).bytes(), { mode: 0o600, flag: "wx" })
    copied[name] = await hash(target)
  }
  const hosts = (await hostFiles(plan.pins.profile)).filter((name) => !before.includes(name))
  if (hosts.length !== 1) throw Error("HOST_CLOSE_NOT_UNIQUE")
  const host = await ownFile(path.join(plan.pins.profile, "loginom/runtime"), hosts[0]!)
  await writeFile(path.join(directory, "host-close.json"), await Bun.file(host).bytes(), { mode: 0o600, flag: "wx" })
  copied["host-close.json"] = await hash(path.join(directory, "host-close.json"))
  const protectedFiles: Record<string, string> = {}
  for await (const relative of new Bun.Glob("**/*").scan({ cwd: plan.directory, onlyFiles: true })) {
    if (["selection-audit.json", "graph-review.json"].includes(relative)) continue
    protectedFiles[relative] = await hash(await ownFile(plan.directory, relative))
  }
  const result = {
    phase: plan.pins.phase, mode: plan.task.mode, taskID: plan.taskID, auditVersion,
    sessionID: attempt.sessionID, resourceSessionID: session.sessionId, documentID: workspace.document_id,
    account: plan.pins.connection.username, packagePath: plan.packagePath, saveOperationID: save.operation_id,
    runtimeRevision, pinsSha256: createHash("sha256").update(JSON.stringify(plan.pins)).digest("hex"),
    historyAnomaly: parts.some((part) => record(part) && (part.type === "retry" || record(part.state) && part.state.status === "error"))
      || receipts.some(({ value }) => record(value) && ["FAILED", "AMBIGUOUS", "NOT_APPLIED", "REQUEST_REJECTED"].includes(String(value.status)))
      || Array.isArray(snapshot.messages) && snapshot.messages.some((message: unknown) => record(message) && message.error != null),
    cliPid: Number((await Bun.file(path.join(plan.directory, "cli.pid")).text()).trim()), copied, protectedFiles,
  }
  await writeJson(path.join(directory, "closure.json"), result)
  return result
}

async function assessCollected(plan: ReturnType<typeof selectionAttempt>, directory: string, auditVersion: string, runtimeRevision?: string, acceptance?: SeriesAcceptance) {
  const closure: unknown = await Bun.file(path.join(directory, "closure.json")).json()
  const dispatch: unknown = await Bun.file(path.join(directory, "dispatch.json")).json()
  const returned: unknown = await Bun.file(path.join(directory, "returned.json")).json()
  if (!record(closure) || !record(dispatch) || !record(returned) || returned.interruptReason !== null
    || closure.auditVersion !== auditVersion || closure.runtimeRevision !== runtimeRevision
    || closure.pinsSha256 !== createHash("sha256").update(JSON.stringify(plan.pins)).digest("hex")
    || !record(closure.copied) || !record(closure.protectedFiles)) return { decision: "halt", reason: "CLOSURE_BINDING_CHANGED" }
  for (const [file, expected] of Object.entries(closure.copied)) {
    if (!digest(expected) || await hash(await ownFile(directory, file)) !== expected) return { decision: "halt", reason: "CLOSE_COPY_CHANGED" }
  }
  for (const [file, expected] of Object.entries(closure.protectedFiles)) {
    if (!digest(expected) || await hash(await ownFile(plan.directory, file)) !== expected) return { decision: "halt", reason: "ATTEMPT_CHANGED" }
  }
  const host: unknown = await Bun.file(path.join(directory, "host-close.json")).json()
  const audit: unknown = await Bun.file(path.join(plan.directory, "selection-audit.json")).json()
  if (!record(audit) || audit.packageSha256 !== await hash(path.join(plan.directory, "artifact/package.lgp"))
    || audit.oracleSha256 !== plan.task.oracleSha256) return { decision: "halt", reason: "AUDIT_ARTIFACT_BINDING_CHANGED" }
  const deadPids = []
  for (const pid of [closure.cliPid, record(host) ? host.pid : undefined]) {
    if (typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0 && !await exists(`/proc/${pid}`)) deadPids.push(pid)
  }
  const cleanup = await selectionPackageCleanup(directory)
  if (!digest(closure.copied[cleanup.name])) return { decision: "halt", reason: "CLOSE_COPY_CHANGED" }
  const input = { ...closure, attempt: await Bun.file(path.join(plan.directory, "attempt.json")).json() as unknown, audit,
    packageCleanup: cleanup.cleanup,
    resourceClose: await jsonLines(path.join(directory, "resource-close.jsonl")), terminalClose: await jsonLines(path.join(directory, "terminal-close.jsonl")),
    hostClose: [host], deadPids, writerAbsent: !await exists(path.join(plan.pins.profile, ".writer")) }
  if (acceptance?.criteriaVersion === "node-selection-policy-v2" && digest(acceptance.criteriaSha256)
    && plan.pins.phase === "candidate" && plan.task.mode === "standard" && audit.calculationPassed === false && audit.oraclePassed === false)
    return assessNormalReleaseFailure(plan, directory, input, acceptance)
  const reviewFile = path.join(plan.directory, "graph-review.json")
  const review: unknown = await exists(reviewFile) ? await Bun.file(reviewFile).json() : null
  const reviewed = inspectSelectionReview({ review, mode: plan.task.mode, sessionID: closure.sessionID, packageSha256: audit.packageSha256 })
  // V2 preserves the sealed machine audit; a later bound review is effective only in memory.
  const effectiveAudit = acceptance?.criteriaVersion === "node-selection-policy-v2" && digest(acceptance.criteriaSha256)
    && audit.policyStatus === "passed" && audit.calculationPassed === true && audit.oraclePassed === true
    && ["pending", "not-required"].includes(String(audit.reviewStatus)) && reviewed.reviewStatus === "passed" ? { ...audit, reviewStatus: "passed" } : audit
  if (reviewed.reviewStatus !== effectiveAudit.reviewStatus) return { decision: "review", reason: "AUDIT_REVIEW_REFRESH_REQUIRED" }
  if (reviewed.reviewStatus === "passed" && (!record(review) || !Array.isArray(review.evidence)
    || !review.evidence.length)) return { decision: "review", reason: "REVIEW_EVIDENCE_MISSING" }
  if (record(review) && Array.isArray(review.evidence)) for (const file of review.evidence) {
    if (!nonempty(file)) return { decision: "review", reason: "REVIEW_EVIDENCE_MISSING" }
    await ownFile(plan.directory, file)
  }
  return inspectSeriesTransition({ ...input, audit: effectiveAudit })
}

async function assessNormalReleaseFailure(plan: ReturnType<typeof selectionAttempt>, directory: string,
  input: Record<string, unknown>, acceptance: SeriesAcceptance) {
  const stop = (reason: string) => ({ decision: "halt" as const, reason })
  if (!record(input.attempt) || !record(input.audit)) return stop("SERIES_EVIDENCE_INCOMPLETE")
  const attempt = input.attempt, audit = input.audit
  const invalidAttempt = inspectClosedAttempt(input, attempt)
  if (invalidAttempt) return invalidAttempt
  if (input.phase !== "candidate" || input.mode !== "standard" || input.taskID !== plan.taskID
    || attempt.exitCode !== 2 || attempt.resultPath !== null || !Array.isArray(attempt.collectionFailures)
    || attempt.collectionFailures.length !== 1 || attempt.collectionFailures[0] !== "RESULT_RECEIPT_MISSING_OR_AMBIGUOUS"
    || audit.auditStage !== "complete" || audit.auditVersion !== input.auditVersion || audit.taskID !== input.taskID
    || audit.mode !== "standard" || audit.policyStatus !== "incomplete" || audit.reviewStatus !== "not-required" || audit.historyComplete !== true
    || !["jsNodes", "jsCalls", "successfulJsCalls"].every((key) => audit[key] === 0)
    || !Array.isArray(audit.failures) || !audit.failures.length || !audit.failures.every((reason) =>
      ["RESULT_RECEIPT_UNVERIFIED", "RUNTIME_APPLY_MISMATCH", "TOOL_RECEIPT_INCOMPLETE", "CATALOG_UNVERIFIED", "GRAPH_IMPORT_EXPORT_REQUIRED"].includes(String(reason))))
    return stop("POLICY_V2_FAILURE_NOT_ELIGIBLE")
  const invalidRelease = inspectSeriesRelease(input, attempt)
  if (invalidRelease) return invalidRelease
  const sidecarPath = `policy-v2/${plan.pins.phase}/${plan.taskID}/${plan.number}.json`
  if (!await exists(path.join(plan.pins.resultsRoot, sidecarPath))) return { decision: "review" as const, reason: "POLICY_V2_FAILURE_REVIEW_REQUIRED" }
  try {
    const sidecarFile = await ownFile(plan.pins.resultsRoot, sidecarPath)
    const sidecar: unknown = await Bun.file(sidecarFile).json()
    if ((await lstat(sidecarFile)).mode & 0o222 || !record(sidecar) || sidecar.version !== 2
      || sidecar.criteriaVersion !== acceptance.criteriaVersion || !record(sidecar.criteria) || sidecar.criteria.sha256 !== acceptance.criteriaSha256
      || sidecar.phase !== plan.pins.phase || sidecar.taskID !== plan.taskID || sidecar.attempt !== plan.number
      || sidecar.sessionID !== input.sessionID || sidecar.packageSha256 !== audit.packageSha256 || !nonempty(sidecar.reviewer)
      || !record(sidecar.policy) || !record(sidecar.runtime) || !record(sidecar.trustedHistory) || !record(sidecar.analytics)
      || !record(sidecar.analytics.originalAudit) || sidecar.analytics.originalAudit.packageSha256 !== audit.packageSha256)
      return stop("POLICY_V2_FAILURE_REVIEW_INVALID")
    const policy = sidecar.policy, history = sidecar.trustedHistory
    if (policy.verdict !== "passed" || !nonempty(policy.reason) || policy.historyComplete !== true || policy.substantiveSelectionSufficient !== true
      || policy.entireToolLedgerReviewed !== true || policy.temporaryAndFailedJsAttemptsIncluded !== true
      || !["jsApplyAttempts", "successfulJsCalls", "savedJsNodes", "unjustifiedJsAttempts"].every((key) => policy[key] === 0)
      || policy.standardFailureUsedAsJsJustification !== false || !Array.isArray(policy.substantiveSelections)
      || !policy.substantiveSelections.some((item) => record(item) && nonempty(item.type) && item.type.startsWith("transform.") && item.toolState === "completed")
      || history.parentID !== null || !empty(history.childSessionIDs) || history.allSessionAndMessageBindingsMatch !== true || history.allEventsOwnSession !== true
      || sidecar.runtime.publicOperationsSettled !== true || sidecar.runtime.catalogIdentityVerified !== true)
      return stop("POLICY_V2_FAILURE_REVIEW_INSUFFICIENT")
    const reviewFile = await ownFile(plan.directory, "independent-failed-attempt-review.json")
    if ((await lstat(reviewFile)).mode & 0o222 || !record(sidecar.failureReview) || !record(policy.manualReview)
      || sidecar.failureReview.path !== reviewFile || !digest(sidecar.failureReview.sha256)
      || policy.manualReview.path !== reviewFile || policy.manualReview.sha256 !== sidecar.failureReview.sha256
      || await hash(reviewFile) !== sidecar.failureReview.sha256) return stop("POLICY_V2_FAILURE_REVIEW_UNBOUND")
    const review: unknown = await Bun.file(reviewFile).json()
    if (inspectSelectionReview({ review, mode: plan.task.mode, sessionID: input.sessionID, packageSha256: audit.packageSha256 }).reviewStatus !== "passed"
      || !record(review) || !Array.isArray(review.evidence) || !review.evidence.length
      || review.criteriaVersion !== acceptance.criteriaVersion || review.criteriaSha256 !== acceptance.criteriaSha256
      || review.phase !== plan.pins.phase || review.taskID !== plan.taskID || review.attempt !== plan.number
      || review.policyVerdict !== "passed" || review.functionalResultPassed !== false || review.historyComplete !== true
      || review.substantiveSelectionSufficient !== true || review.jsApplyAttempts !== 0 || review.unjustifiedJsAttempts !== 0
      || review.publicOperationsSettled !== true || review.catalogIdentityVerified !== true) return stop("POLICY_V2_FAILURE_REVIEW_INVALID")
    const manifest: unknown = await Bun.file(path.join(plan.directory, "runtime-journals.json")).json()
    if (!Array.isArray(manifest) || !manifest.length || !Array.isArray(sidecar.evidence)) return stop("POLICY_V2_FAILURE_EVIDENCE_INVALID")
    const expected = new Map<string, string>()
    for (const item of sidecar.evidence) {
      if (!record(item) || !nonempty(item.path) || !digest(item.sha256) || expected.has(item.path)) return stop("POLICY_V2_FAILURE_EVIDENCE_INVALID")
      const file = await ownFile(plan.pins.resultsRoot, path.relative(plan.pins.resultsRoot, item.path))
      if (file !== item.path || await hash(file) !== item.sha256) return stop("POLICY_V2_FAILURE_EVIDENCE_INVALID")
      expected.set(file, item.sha256)
    }
    const required = ["attempt.json", "selection-audit.json", "parts.json", "runtime-journals.json", "artifact/package.lgp", "independent-failed-attempt-review.json"]
    for (const item of manifest) {
      if (!record(item) || !nonempty(item.path) || !digest(item.sha256)
        || expected.get(await ownFile(plan.directory, item.path)) !== item.sha256) return stop("POLICY_V2_FAILURE_EVIDENCE_INVALID")
      required.push(item.path)
    }
    for (const relative of [...required, ...review.evidence]) {
      if (!nonempty(relative) || !expected.has(await ownFile(plan.directory, relative))) return stop("POLICY_V2_FAILURE_EVIDENCE_INVALID")
    }
    if (!expected.has(await ownFile(directory, "closure.json"))) return stop("POLICY_V2_FAILURE_EVIDENCE_INVALID")
    return { decision: "advance" as const, reason: "POLICY_V2_FAILURE_RECORDED", outcome: "failed" as const,
      policyStatus: audit.policyStatus, policyVerdict: policy.verdict, calculationPassed: audit.calculationPassed,
      oraclePassed: audit.oraclePassed, jsCalls: audit.jsCalls, jsNodes: audit.jsNodes,
      sidecarSha256: await hash(sidecarFile), failureReviewSha256: sidecar.failureReview.sha256 }
  } catch { return stop("POLICY_V2_FAILURE_EVIDENCE_INVALID") }
}

async function ownFile(root: string, relative: string) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => !part || part === "." || part === "..")) throw Error("EVIDENCE_PATH_INVALID")
  const file = path.join(root, relative)
  if (!(await lstat(file)).isFile() || await realpath(file) !== path.join(await realpath(root), relative)) throw Error("EVIDENCE_PATH_INVALID")
  return file
}
async function jsonLines(file: string): Promise<unknown[]> { return (await Bun.file(file).text()).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown) }

async function hostFiles(profile: string) {
  const directory = path.join(profile, "loginom/runtime")
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  return files.filter((name) => /^runtime-close-\d+-[a-f0-9-]+\.json$/.test(name)).sort()
}

async function exists(file: string) {
  return lstat(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false
    throw error
  })
}
async function hash(file: string) { return createHash("sha256").update(await Bun.file(file).bytes()).digest("hex") }
async function writeJson(file: string, value: unknown) { await writeFile(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" }) }

export function inspectSeriesLiveParts(text: string, mode: SelectionMode, snapshot?: unknown): { stop: boolean; reason: string | null } {
  const events = completeEvents(text)
  if (events.some((event) => record(event) && event.type === "error")) return { stop: true, reason: "CLI_ERROR_EVENT" }
  const sessions = new Set(events.filter(record).map((event) => event.sessionID).filter(nonempty))
  if (sessions.size > 1) return { stop: true, reason: "LIVE_SESSION_UNBOUND" }
  const parts = events.filter(record).filter((event) => event.type === "tool_use").map((event) => event.part)
  if (snapshot !== undefined) {
    if (!record(snapshot) || !sessions.has(String(snapshot.sessionID)) || snapshot.parentID !== null
      || !empty(snapshot.childSessionIDs) || !Array.isArray(snapshot.parts) || !Array.isArray(snapshot.messages))
      return { stop: true, reason: "LIVE_SESSION_UNBOUND" }
    if (snapshot.messages.some((message: unknown) => record(message) && message.error != null)) return { stop: true, reason: "CLI_ERROR_EVENT" }
    parts.push(...snapshot.parts)
  }
  if (parts.some((part) => !record(part) || !sessions.has(String(part.sessionID)))) return { stop: true, reason: "LIVE_SESSION_UNBOUND" }
  const selection = inspectSelection({ mode, nodeTypes: null, parts })
  return selection.failures.includes("JAVASCRIPT_NOT_ALLOWED")
    ? { stop: true, reason: "JAVASCRIPT_NOT_ALLOWED" } : { stop: false, reason: null }
}

function completeEvents(text: string): unknown[] {
  return text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown)
}

export function inspectSeriesTransition(input: unknown): { decision: "advance" | "halt" | "review"; reason: string | null } {
  const stop = (reason: string) => ({ decision: "halt" as const, reason })
  if (!record(input) || !record(input.attempt) || !record(input.audit)) return stop("SERIES_EVIDENCE_INCOMPLETE")
  const attempt = input.attempt
  const audit = input.audit
  const invalidAttempt = inspectClosedAttempt(input, attempt)
  if (invalidAttempt) return invalidAttempt
  if (!nonempty(attempt.resultPath) || !empty(attempt.collectionFailures)) return stop("ATTEMPT_NOT_COMPLETE")
  if (audit.auditStage !== "complete" || audit.auditVersion !== input.auditVersion || audit.taskID !== input.taskID || audit.mode !== input.mode
    || !["oraclePassed", "calculationPassed", "historyComplete", "runtimeSettled", "identityVerified", "graphComplete", "exportIdentityVerified"]
      .every((key) => audit[key] === true) || !digest(audit.packageSha256)
    || !["jsNodes", "jsCalls", "successfulJsCalls"].every((key) => Number.isSafeInteger(audit[key]) && Number(audit[key]) >= 0)
    || Number(audit.successfulJsCalls) > Number(audit.jsCalls)) return stop("AUDIT_NOT_COMPLETE")
  const baselineJavascript = input.phase === "baseline" && input.mode === "standard" && audit.policyStatus === "failed"
    && Array.isArray(audit.failures) && audit.failures.length === 1 && audit.failures[0] === "JAVASCRIPT_NOT_ALLOWED"
    && Number.isSafeInteger(audit.jsCalls) && Number.isSafeInteger(audit.jsNodes)
    && (Number(audit.jsCalls) > 0 || Number(audit.jsNodes) > 0)
  if (!baselineJavascript && (audit.policyStatus !== "passed" || !empty(audit.failures))
    || typeof attempt.exitCode !== "number"
    || ![0, ...(baselineJavascript ? [1] : []), ...(input.mode !== "standard" ? [2] : [])].includes(attempt.exitCode)) return stop("POLICY_OR_WRAPPER_FAILED")
  if (input.mode === "standard" && !baselineJavascript && (audit.jsNodes !== 0 || audit.jsCalls !== 0)) return stop("JAVASCRIPT_NOT_ALLOWED")
  const invalidRelease = inspectSeriesRelease(input, attempt)
  if (invalidRelease) return invalidRelease
  if (audit.reviewStatus === "failed") return stop("SEMANTIC_REVIEW_FAILED")
  if (!["standard", "explicit-js", "capability-gap", "standard-recovery"].includes(String(input.mode))) return stop("MODE_UNKNOWN")
  if ((input.mode !== "standard" || input.phase === "candidate" && input.historyAnomaly === true) && audit.reviewStatus !== "passed"
    || !["passed", "not-required"].includes(String(audit.reviewStatus)))
    return { decision: "review", reason: "MANUAL_REVIEW_REQUIRED" }
  return { decision: "advance", reason: null }
}

function inspectClosedAttempt(input: Record<string, unknown>, attempt: Record<string, unknown>) {
  const stop = (reason: string) => ({ decision: "halt" as const, reason })
  if (!['candidate', 'baseline'].includes(String(input.phase)) || attempt.sessionID !== input.sessionID
    || !["sessionID", "resourceSessionID", "documentID", "account", "packagePath", "saveOperationID", "auditVersion"].every((key) => nonempty(input[key]))
    || attempt.taskID !== input.taskID || attempt.mode !== input.mode || attempt.packagePath !== input.packagePath
    || attempt.modelStarted !== true || attempt.cliExitCode !== 0 || attempt.cleanupConfirmed !== true
    || attempt.blocker !== null || attempt.timedOut !== false || attempt.interruptSentAt !== null
    || !orderedTimes(attempt.startedAt, attempt.cliStartedAt, attempt.cliFinishedAt, attempt.finishedAt))
    return stop("ATTEMPT_NOT_COMPLETE")
  return null
}

function inspectSeriesRelease(input: Record<string, unknown>, attempt: Record<string, unknown>) {
  const stop = (reason: string) => ({ decision: "halt" as const, reason })
  const cleanup = input.packageCleanup
  if (!record(cleanup) || cleanup.version !== 1 || cleanup.status !== "SUCCEEDED" || cleanup.reason !== null
    || cleanup.session_id !== input.resourceSessionID || cleanup.document_id !== input.documentID || cleanup.account !== input.account
    || cleanup.package_path !== input.packagePath || cleanup.save_operation_id !== input.saveOperationID
    || cleanup.policy !== undefined && cleanup.policy !== "last_confirmed_own_save" || cleanup.package_closed !== true || cleanup.logged_out !== true
    || cleanup.unsaved_changes_discarded !== false || cleanup.packages_before !== 1 || cleanup.packages_after !== 0
    || !orderedTimes(attempt.cliStartedAt, cleanup.started_at, cleanup.completed_at, attempt.cliFinishedAt)) return stop("PACKAGE_CLOSE_UNCONFIRMED")
  const resource = input.resourceClose
  if (!Array.isArray(resource) || !resource.every(record) || resource.some((row) => !["started", "fulfilled"].includes(String(row.status)) || row.version !== 1
    || !["drain", "client", "bridge", "bridge_ack", "browser_server", "browser", "profile", "complete"].includes(String(row.stage)))
    || ["drain", "client", "bridge", "bridge_ack", "browser_server", "browser", "complete"].some((stage) =>
      resource.filter((row) => row.stage === stage && row.status === "fulfilled").length !== 1)) return stop("RESOURCE_CLOSE_UNCONFIRMED")
  const terminal = input.terminalClose
  if (!Array.isArray(terminal) || !terminal.every(record) || terminal.some((row) => row.version !== 1
    || !["reply_sending", "reply_flushed", "disconnect_returned", "stop_requested", "exit_requested", "exit_event"].includes(String(row.stage)))
    || ["reply_flushed", "exit_event"].some((stage) => terminal.filter((row) => row.stage === stage).length !== 1)) return stop("RUNTIME_TERMINAL_UNCONFIRMED")
  const hosts = input.hostClose
  if (!Array.isArray(hosts) || hosts.length !== 1 || !record(hosts[0])) return stop("HOST_CLOSE_UNBOUND")
  const host = hosts[0]
  if (host.version !== 1 || host.closed_ack !== true || host.exit_code !== 0 || host.exit_signal !== null || host.request_error !== null
    || !Number.isSafeInteger(host.pid) || Number(host.pid) <= 0
    || !orderedTimes(attempt.cliStartedAt, host.started_at, cleanup.started_at, cleanup.completed_at, host.completed_at, attempt.cliFinishedAt))
    return stop("HOST_CLOSE_UNCONFIRMED")
  const deadPids = input.deadPids
  if (!Number.isSafeInteger(input.cliPid) || Number(input.cliPid) <= 0 || input.cliPid === host.pid
    || !Array.isArray(deadPids) || ![input.cliPid, host.pid].every((pid) => deadPids.includes(pid))) return stop("OWN_PROCESS_NOT_GONE")
  if (input.writerAbsent !== true) return stop("PROFILE_WRITER_PRESENT_OR_UNKNOWN")
  return null
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.length > 0 }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) }
function empty(value: unknown) { return Array.isArray(value) && value.length === 0 }
function orderedTimes(...values: unknown[]) {
  return values.every((value, index) => typeof value === "string" && Number.isFinite(Date.parse(value))
    && (index === 0 || Date.parse(value) >= Date.parse(String(values[index - 1]))))
}

if (import.meta.main) {
  const args = parseArgs({ options: { lock: { type: "string" }, sha: { type: "string" }, limit: { type: "string" },
    "acceptance-lock": { type: "string" }, "acceptance-sha": { type: "string" } } }).values
  if (!args.lock || !args.sha || Boolean(args["acceptance-lock"]) !== Boolean(args["acceptance-sha"])) throw Error("SERIES_ARGUMENTS_INVALID")
  const result = await runSelectionSeries(path.resolve(args.lock), args.sha, args.limit ? Number(args.limit) : 31,
    args["acceptance-lock"] ? { path: path.resolve(args["acceptance-lock"]), sha256: args["acceptance-sha"]! } : undefined)
  console.log(JSON.stringify(result))
  process.exitCode = result.status === "halt" ? 1 : result.status === "review" ? 2 : 0
}
