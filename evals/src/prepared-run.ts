import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { agentCommand, type AgentCommand } from "./cli"
import { tryCampaignLock } from "./campaign-lock"
import { parseArtifactSource } from "./artifact"
import { scopedSlotConfig } from "./environment-preparation"
import { evaluationContractHash, rubricSnapshot } from "./evaluation"
import { EvalFailure } from "./fail"
import { createJudgeGate, judgeInfo, type JudgeSettings } from "./judge"
import { acquireJudgeLease, readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { openLoginomAdmin, type AdminConnection } from "./loginom-admin"
import { requireResourceBudgetScopes, validResourceBound } from "./parallel-resource-budget"
import { freezeResourceBudget } from "./parallel-resource-evidence"
import { checkRunResourceEvidence } from "./parallel-acceptance"
import { sampleHostResources } from "./parallel-resources"
import { readServerIdentity } from "./parallel-pair"
import { preflight, requestPreflight, gitInfo, type Environment } from "./preflight"
import { assertAuth, verifyProfile } from "./profile"
import { captureUnitBinding, type ProcessCleanup } from "./process-supervisor"
import { aggregate, aggregateLimits, aggregateTask, isQualityResult, renderReport, writeSummary, type AttemptResult, type RunSummary } from "./report"
import { describe, emptyResult, installSigint, redact, runAttempt, stamp } from "./run"
import { reserveRunDirectory } from "./run-directory"
import { requireAvailableMemory, startRunResourceSampler } from "./run-resources"
import { watchAttemptIncidents } from "./run-incidents"
import { buildJobs, runSlotQueue } from "./scheduler"
import { assertSessionBackupEmpty, cleanupSlotStorage } from "./slot-storage"
import { reconcileEnvironment } from "./startup-reconciliation"
import { acquireEnvironmentLeases, loadSlots, type SlotLease } from "./slots"
import { agentInputsHash, loadTasks, rubricHash, taskTimeoutMs } from "./task"

type CommandAdmission = { slotId: string; taskId: string; attempt: number; purpose: "preflight" | "measurement"; completedAt?: number; completionOrder?: number; quality?: boolean }

export function createCampaignAdmission(config: EvalConfig["campaign"], persist: (state: { consecutiveErrors: number; lastProgressAt: number; admissionBlocker?: string }) => Promise<void>) {
  const controller = new AbortController()
  const state = { consecutiveErrors: config?.consecutiveErrors ?? 0, lastProgressAt: config?.lastProgressAt ?? Date.now(), admissionBlocker: undefined as string | undefined }
  let completionOrder = 0, writing = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    const snapshot = { ...state }
    writing = writing.then(() => persist(snapshot))
    void writing.catch(error => controller.abort(error))
    return writing
  }
  const stop = (reason: string) => {
    state.admissionBlocker ??= reason
    clearTimeout(timer)
    controller.abort(state.admissionBlocker)
  }
  const arm = () => {
    clearTimeout(timer)
    if (!config || state.admissionBlocker) return
    const remaining = state.lastProgressAt + config.noProgressMs - Date.now()
    if (remaining <= 0) { stop("NO_PROGRESS_LIMIT"); void save(); return }
    timer = setTimeout(arm, Math.min(remaining, 2_147_483_647))
  }
  if (config && state.consecutiveErrors >= config.errorLimit) { stop("CONSECUTIVE_INFRASTRUCTURE_ERRORS"); void save() }
  arm()
  return {
    signal: controller.signal,
    async admit(write: () => Promise<void>, signal = controller.signal) {
      const control = config?.control
      let release: (() => Promise<void>) | undefined
      while (control && !release) {
        if (signal.aborted || controller.signal.aborted) return false
        release = await tryCampaignLock(control.lockFile)
        if (!release) await Bun.sleep(25)
      }
      try {
        if (signal.aborted || controller.signal.aborted) return false
        if (control) {
          const journal = await readLeaseReceipt(control.journalFile)
          if (!journal || typeof journal !== "object" || Array.isArray(journal) || !("manifestHash" in journal) || journal.manifestHash !== control.manifestHash)
            throw new EvalFailure("CAMPAIGN_CONTROL_UNCONFIRMED", 2)
          if ("final" in journal && journal.final || "published" in journal && journal.published) {
            stop("CAMPAIGN_FINAL")
            await save()
            return false
          }
          if ("repairing" in journal && journal.repairing) {
            stop("CAMPAIGN_REPAIRING")
            await save()
            return false
          }
          if ("blocker" in journal && journal.blocker) {
            stop("CAMPAIGN_BLOCKED")
            await save()
            return false
          }
        }
        if (signal.aborted || controller.signal.aborted) return false
        await write()
        return true
      } catch (error) { controller.abort(error); throw error }
      finally { await release?.() }
    },
    async complete(admission: { completedAt?: number; completionOrder?: number; quality?: boolean }, quality: boolean) {
      admission.completedAt = Date.now()
      admission.completionOrder = ++completionOrder
      admission.quality = quality
      if (config && admission.completedAt - state.lastProgressAt >= config.noProgressMs) stop("NO_PROGRESS_LIMIT")
      state.consecutiveErrors = quality ? 0 : state.consecutiveErrors + 1
      if (quality) state.lastProgressAt = admission.completedAt
      if (config && state.consecutiveErrors >= config.errorLimit) stop("CONSECUTIVE_INFRASTRUCTURE_ERRORS")
      arm()
      await save()
    },
    async close() { clearTimeout(timer); await writing },
  }
}

export async function runPreparedSlots(config: EvalConfig) {
  if (!config.slotsFile || config.dryRun || config.agent.cliMode !== "binary" || !path.isAbsolute(config.agent.cliBin ?? ""))
    throw new EvalFailure("PREPARED_SLOTS_BINARY_REQUIRED", 2)
  if (!config.resourceBudgetFile) throw new EvalFailure("RESOURCE_BUDGET_REQUIRED", 2)
  const bounds = await readLeaseReceipt(config.resourceBudgetFile)
  if (!Array.isArray(bounds) || !bounds.length || !bounds.every(validResourceBound)) throw new EvalFailure("RESOURCE_BUDGET_INVALID", 2)
  const file = await loadSlots(config.slotsFile, config.parallel)
  if (file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir]).some(root =>
    [config.resultsDir, config.tasksDir, config.resourceBudgetFile!].some(target => target === root || target.startsWith(root + path.sep) || root.startsWith(target + path.sep))))
    throw new EvalFailure("SLOT_RUN_PATH_OVERLAP", 2)
  const identity = await readServerIdentity(file)
  await reconcileEnvironment(file, identity, config.agent.cliBin!)
  const paths = [file.controller.stateDir, ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])]
  const containers = [{ role: "server" as const, id: identity.containerId, startedAt: identity.startedAt },
    { role: "studio" as const, id: identity.studioContainerId, startedAt: identity.studioStartedAt }]
  requireResourceBudgetScopes(bounds, { paths, containers })
  requireAvailableMemory((await sampleHostResources(paths)).memory?.available_bytes ?? null, bounds)
  const tasks = await loadTasks(config.tasksDir, config.only)
  const inputsHash = await agentInputsHash(tasks), rubric = await rubricHash(tasks)
  if (!config.skipJudge && tasks.some(task => task.outputMode === "diagnostic")) throw new EvalFailure("diagnostic tasks require --skip-judge", 2)
  const git = await gitInfo(), started = new Date()
  const runDir = await reserveRunDirectory(config.resultsDir, `${stamp(started)}-${git?.sha ?? "nogit"}${git?.dirty ? "-dirty" : ""}`)
  const runId = path.basename(runDir), commandId = crypto.randomUUID()
  const journal = path.join(file.controller.stateDir, `run-command-${commandId}.json`)
  const commandJournal = { version: 2, kind: "unactivated-preparation", commandId, identity, phase: "cli_admitted", runDir,
    unitBinding: await captureUnitBinding(), slotIds: file.slots.slice(0, config.parallel).map(slot => slot.id) }
  await writeLeaseReceipt(journal, commandJournal)
  const budgetFile = path.join(runDir, "resource-budget.json")
  const budget = await freezeResourceBudget({ out: budgetFile, runId, bounds })
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify({ ...redact(config), commandJournal: journal }, null, 2))
  const environment = await acquireEnvironmentLeases(file, config.parallel, identity, journal)
  const controller = new AbortController(), removeSigint = installSigint(controller)
  const contexts: { lease: SlotLease; config: EvalConfig; command: AgentCommand; cleanup: string; confirmed: boolean }[] = []
  const attempts: AttemptResult[] = []
  let admin: AdminConnection | undefined, judgeLease: Awaited<ReturnType<typeof acquireJudgeLease>> | undefined
  let sampler: Awaited<ReturnType<typeof startRunResourceSampler>> | undefined
  let metadata: Environment = { git, agent: null, codex: null, dock: null, loginom: null }
  let judge: Awaited<ReturnType<typeof judgeInfo>> | null = null, stopped: string | null = null
  let judgeConfirmed = true, dispatchStarted = "", executionFinished = ""
  const admissions: CommandAdmission[] = []
  let admissionWrite = Promise.resolve()
  let admissionBlocker: string | undefined
  const saveAdmissions = () => {
    const receipt = { ...commandJournal, attempts: admissions.map(admission => ({ ...admission })), admissionBlocker }
    admissionWrite = admissionWrite.then(() => writeLeaseReceipt(journal, receipt))
    return admissionWrite
  }
  const admit = (slotId: string, taskId: string, attempt: number, purpose: "preflight" | "measurement") => {
    const admission: CommandAdmission = { slotId, taskId, attempt, purpose }
    admissions.push(admission)
    return saveAdmissions().then(() => admission)
  }
  const campaignAdmission = createCampaignAdmission(config.campaign, state => { admissionBlocker = state.admissionBlocker; return saveAdmissions() })
  try {
    admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, binary: config.agent.cliBin })
    judgeLease = await acquireJudgeLease({ codexHome: file.judge.codexHome, journal, commandId })
    const scopedJudge = { ...config.judge, env: { CODEX_HOME: file.judge.codexHome }, systemd: true }
    await assertSessionBackupEmpty(file, identity)
    await admin.inspectPoolPolicy()
    for (const lease of environment.slots) {
      await admin.verifySlotUser(lease.slot.username)
      const scoped = { ...await scopedSlotConfig(config, file, lease), judge: scopedJudge }
      const command = { ...agentCommand(scoped), cleanupDir: path.join(runDir, "preparation", lease.slot.id),
        cleanupSecrets: [scoped.loginom.password, scoped.dock.apiKey, scoped.agent.provider?.apiKey ?? ""] }
      const context = { lease, config: scoped, command, cleanup: path.join(file.controller.stateDir, `cleanup-${commandId}-${lease.slot.id}.json`), confirmed: false }
      contexts.push(context)
      await assertAuth(scoped, command)
      const checked = await verifyProfile(scoped, command)
      const cleanup = await cleanupSlotStorage(file, environment.server, lease, admin, checked.processCleanup, [])
      await writeSlotCleanup(context, cleanup)
    }
    if (!config.skipJudge) judgeConfirmed = false
    metadata = await preflight(contexts[0]!.config, parseArtifactSource("docker", contexts[0]!.config.loginom), controller.signal,
      { file, lease: contexts[0]!.lease, secretFile: path.join(file.controller.stateDir, `prepare-${contexts[0]!.lease.slot.id}.secret.json`) })
    judgeConfirmed = true
    if (!config.skipJudge) {
      judgeConfirmed = false
      judge = await judgeInfo({ judge: scopedJudge }, controller.signal)
      judgeConfirmed = true
    }
    for (const context of contexts) {
      const taskId = `request-preflight-${context.lease.slot.id}`
      const out = path.join(runDir, taskId, "1"), workdir = path.join(context.lease.slot.workspaceRoot, runId, taskId, "1")
      await mkdir(out, { recursive: true, mode: 0o700 })
      await mkdir(workdir, { recursive: true, mode: 0o700 })
      context.confirmed = false
      await admit(context.lease.slot.id, taskId, 1, "preflight")
      const probe = await requestPreflight({ command: context.command, taskId, model: context.config.agent.model, variant: context.config.agent.variant,
        workdir, outDir: out, profileDir: context.config.profileDir, slotId: context.lease.slot.id,
        timeoutMs: Math.min(...tasks.map(task => taskTimeoutMs(config, task))), signal: controller.signal })
      await writeLeaseReceipt(path.join(out, "cleanup.json"), { processes: probe.run.processCleanup, nextAdmissionAllowed: false })
      const cleanup = await cleanupSlotStorage(file, environment.server, context.lease, admin, probe.run.processCleanup, [`eval-${runId}-${taskId}-1`], [out])
      await writeSlotCleanup(context, cleanup)
      await writeLeaseReceipt(path.join(out, "cleanup.json"), { processes: probe.run.processCleanup, ...cleanup, nextAdmissionAllowed: true })
      await writeLeaseReceipt(path.join(runDir, "request-preflight.json"), { slotId: context.lease.slot.id, code: probe.code, evidence: path.join(out, "run.json") })
      if (probe.code) throw new EvalFailure(probe.code, 2)
    }
    const settings: JudgeSettings | undefined = judge ? { ...scopedJudge, timeoutMs: config.judgeTimeoutMs, passThreshold: config.passThreshold } : undefined
    const gate = createJudgeGate()
    const evaluationHash = evaluationContractHash({ rubric_hash: rubric, judge, pass_threshold: config.passThreshold })
    await Bun.write(path.join(runDir, "config.json"), JSON.stringify({ ...redact(config), commandJournal: journal, agent_inputs_hash: inputsHash,
      rubric_hash: rubric, binary_sha256: metadata.agent?.binarySha256, source_commit: metadata.agent?.sourceCommit, judge }, null, 2))
    sampler = await startRunResourceSampler({ slotsFile: config.slotsFile, out: path.join(runDir, "resources.jsonl"), runId })
    dispatchStarted = new Date().toISOString()
    const queued = await runSlotQueue({ jobs: buildJobs(tasks.map(task => task.id), config.repeat), slots: contexts.map(context => context.lease.slot.id),
      signal: AbortSignal.any([controller.signal, campaignAdmission.signal]),
      async admit(slotId, job) {
        return campaignAdmission.admit(async () => { await admit(slotId, job.taskId, job.attempt, "measurement") }, controller.signal)
      },
      async execute(slotId, job) {
        const context = contexts.find(context => context.lease.slot.id === slotId)!
        const out = path.join(runDir, job.taskId, String(job.attempt))
        const admission = admissions.find(item => item.purpose === "measurement" && item.slotId === slotId && item.taskId === job.taskId && item.attempt === job.attempt)!
        context.confirmed = false
        try {
        await mkdir(out, { recursive: true, mode: 0o700 })
        const watcher = watchAttemptIncidents(out, code => {
          if (code === "PROVIDER_ERROR_OBSERVED") return
          stopped ??= code; controller.abort()
        })
        const completed = await admin!.verifySlotUser(context.lease.slot.username).then(() => runAttempt({ config: context.config, command: context.command, source: parseArtifactSource("docker", context.config.loginom),
          task: tasks.find(task => task.id === job.taskId)!, attempt: job.attempt, runId, runDir, signal: controller.signal, profileRecovered: false,
          slotId, slot: { file, lease: context.lease, secretFile: path.join(file.controller.stateDir, `prepare-${slotId}.secret.json`) },
          skipJudge: config.skipJudge, judge: settings, judgeGate: gate, evaluationHash })).catch((error: unknown) => ({
            result: { ...emptyResult(job.taskId, job.attempt, false), slot_id: slotId, harness_error: describe(error) }, stop: true,
          })).finally(() => watcher.stop())
        const result = completed.result
        attempts[job.index] = result
        try {
          if (result.judge_cleanup_unconfirmed) { judgeConfirmed = false; controller.abort() }
          const processes = (await Bun.file(path.join(out, "cleanup.json")).json()).processes as ProcessCleanup
          const cleanup = await cleanupSlotStorage(file, environment.server, context.lease, admin!, processes, [`eval-${runId}-${job.taskId}-${job.attempt}`], [out])
          await writeSlotCleanup(context, cleanup)
          result.environment_cleanup = { status: "confirmed", evidence: "cleanup.json", error: null }
          await writeLeaseReceipt(path.join(out, "cleanup.json"), { processes, ...cleanup, slotId, profileDir: context.lease.slot.profileDir, serverEpoch: identity.serverEpoch,
            serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true })
        } catch (error) {
          context.confirmed = false
          result.environment_cleanup = { status: "failed", evidence: "cleanup.json", error: describe(error) }
          if (/SESSION_BACKUP|SERVER_EPOCH|SERVER_FENCE/.test(describe(error))) controller.abort()
        }
        await Bun.write(path.join(out, "result.json"), JSON.stringify(result, null, 2))
        console.error(`[${slotId}/${job.taskId}#${job.attempt}] ${result.status} score=${result.score ?? "—"}`)
        if (["infra_error", "harness_error", "timeout", "interrupted"].includes(result.status) || result.judge_cleanup_unconfirmed) context.confirmed = false
        return { result, quarantine: !context.confirmed || Boolean(result.judge_cleanup_unconfirmed) }
        } catch (error) {
          context.confirmed = false
          const result = attempts[job.index] ?? { ...emptyResult(job.taskId, job.attempt, false), slot_id: slotId }
          result.harness_error = describe(error)
          result.environment_cleanup = { status: "failed", evidence: "cleanup.json", error: describe(error) }
          attempts[job.index] = result
          console.error(`[${slotId}/${job.taskId}#${job.attempt}] slot quarantined: ${describe(error)}`)
          return { result, quarantine: true }
        } finally {
          const result = attempts[job.index]
          if (result) await campaignAdmission.complete(admission, isQualityResult(result))
        }
      } })
    executionFinished = new Date().toISOString()
    if (queued.quarantined.length || queued.unassigned.length) stopped ??= `Quarantined: ${queued.quarantined.join(",")}; unassigned: ${queued.unassigned.length}`
    // Capture a sample after the last cleanup, then stop and verify the sampler in finally.
    await Bun.sleep(1100)
  } catch (error) { stopped ??= describe(error) }
  finally {
    await campaignAdmission.close().catch(error => { stopped ??= describe(error) })
    if (campaignAdmission.signal.aborted) stopped ??= String(campaignAdmission.signal.reason)
    await sampler?.stop().catch(error => { stopped ??= describe(error) })
    await admin?.dispose().catch(error => { stopped ??= describe(error); contexts.forEach(context => { context.confirmed = false }) })
    for (const context of contexts.filter(context => context.confirmed))
      await context.lease.release(context.cleanup).catch(error => { context.confirmed = false; stopped ??= describe(error) })
    if (judgeLease && judgeConfirmed) {
      const proof = path.join(file.controller.stateDir, `cleanup-${commandId}-judge.json`)
      await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "judge-unit-terminated", key: judgeLease.reservation.key,
        token: judgeLease.reservation.token, revision: judgeLease.reservation.revision })
        .then(() => judgeLease!.release(proof)).catch(error => { stopped ??= describe(error) })
    }
    if (contexts.length === environment.slots.length && contexts.every(context => context.confirmed)) {
      const proof = path.join(file.controller.stateDir, `cleanup-${commandId}-server.json`)
      await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "run-slots-clean", key: environment.server.reservation.key,
        token: environment.server.reservation.token, revision: environment.server.reservation.revision, serverEpoch: identity.serverEpoch })
        .then(() => environment.server.release(proof)).catch(error => { stopped ??= describe(error) })
    }
    try { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close()), judgeLease?.close()]) }
    finally { removeSigint() }
  }
  if (!dispatchStarted) throw new EvalFailure(stopped ?? "SLOT_ADMISSION_FAILED", 2)
  const samplesFile = path.join(runDir, "resources.jsonl"), summaryFile = `${samplesFile}.summary.json`
  const resourceChecks = await checkRunResourceEvidence({ runId, startedAt: dispatchStarted, finishedAt: executionFinished,
    samplesFile, summaryFile, budget: budget.source, containers })
  if (resourceChecks.some(check => check.status === "failed")) stopped ??= resourceChecks.flatMap(check => check.codes).join(", ")
  const measured = attempts.filter((attempt): attempt is AttemptResult => attempt !== undefined)
  const limits = aggregateLimits(measured, ["provider", "judge"])
  if (limits.codes.some(code => code.startsWith("LOGINOM_") || code.startsWith("HOST_"))) stopped ??= limits.codes.join(", ")
  const summary: RunSummary = {
    run_id: runId, label: config.label, started_at: started.toISOString(), finished_at: new Date().toISOString(), interrupted: controller.signal.aborted,
    interrupted_cleanup: measured.some(attempt => attempt.interrupted) ? { recovered: false } : null, stopped_reason: stopped,
    slots: environment.slots.map(lease => ({ ...lease.slot, liveQualified: true, state: contexts.find(context => context.lease === lease)?.confirmed ? "closed" : "quarantined",
      lease_receipt: lease.receipt, cleanup_receipt: contexts.find(context => context.lease === lease)?.cleanup, storage_root: `${file.server.storageRoot}/${lease.slot.username}` })),
    agent: { cli_mode: config.agent.cliMode, model: config.agent.model, variant: config.agent.variant,
      git_sha: metadata.agent?.sourceCommit ?? null, dirty: metadata.agent?.sourceDirty ?? null, cli_version: metadata.agent?.cliVersion ?? null,
      binary_path: metadata.agent?.binaryPath ?? null, binary_sha256: metadata.agent?.binarySha256 ?? null,
      source_commit: metadata.agent?.sourceCommit ?? null, source_dirty: metadata.agent?.sourceDirty ?? null, source_tree_sha256: metadata.agent?.sourceTreeSha256 ?? null },
    harness: { git_sha: git?.sha ?? null, dirty: git?.dirty ?? null }, judge,
    dock: { skill_revision: metadata.dock?.skillRevision ?? null, skill_revisions: [...new Set(measured.flatMap(result => result.skill_revision ? [result.skill_revision] : []))],
      action_manifest_sha256: [...new Set(measured.flatMap(result => result.action_manifest_sha256 ? [result.action_manifest_sha256] : []))] },
    loginom: { image_digest: metadata.loginom?.imageDigest ?? null, container: identity.containerId, storage_dir: config.parallel === 1 ? `${file.server.storageRoot}/${file.slots[0]!.username}` : null },
    agent_inputs_hash: inputsHash, rubric_hash: rubric, task_ids: tasks.map(task => task.id),
    config: { parallel: config.parallel, repeat: config.repeat, tasks_dir: config.tasksDir, task_timeout_ms: Object.fromEntries(tasks.map(task => [task.id, taskTimeoutMs(config, task)])),
      timeout_ms: config.timeoutMs ?? config.taskTimeoutMs, judge_timeout_ms: config.judgeTimeoutMs, pass_threshold: config.passThreshold, keep_storage: false },
    metrics: aggregate(measured, config.skipJudge), parallel_limits: { ...limits, required_sources: ["provider", "judge"] },
    resources: { status: resourceChecks.some(check => check.status === "failed") ? "failed" : resourceChecks.some(check => check.status !== "passed") ? "incomplete" : "passed",
      evidence: "resource-acceptance.json", codes: resourceChecks.flatMap(check => check.codes) },
    tasks: tasks.map(task => ({ id: task.id, rubric_snapshot: rubricSnapshot(task), metrics: aggregateTask(measured.filter(result => result.task_id === task.id), config.skipJudge),
      attempts: measured.filter(result => result.task_id === task.id) })),
    storage_leftovers: contexts.length === environment.slots.length && contexts.every(context => context.confirmed) ? [] : null,
  }
  await writeSummary(runDir, summary)
  await writeLeaseReceipt(path.join(runDir, "resource-acceptance.json"), { budget_file: budgetFile, samples_file: samplesFile, summary_file: summaryFile, checks: resourceChecks })
  console.log(renderReport(summary))
  console.error(`Результаты: ${runDir}`)
  return { code: stopped || controller.signal.aborted ? 1 : 0, runDir }
}

async function writeSlotCleanup(context: { lease: SlotLease; cleanup: string; confirmed: boolean }, cleanup: Awaited<ReturnType<typeof cleanupSlotStorage>>) {
  await writeLeaseReceipt(context.cleanup, { version: 2, status: "confirmed", slotId: context.lease.slot.id, leaseToken: context.lease.token,
    serverEpoch: context.lease.identity.serverEpoch, processes: "confirmed", serverSessions: "confirmed", archive: "committed",
    profileArchive: cleanup.archive, closed: cleanup.closed, removed: cleanup.removed, storageDeletionAllowed: true, nextAdmissionAllowed: true })
  context.confirmed = true
}
