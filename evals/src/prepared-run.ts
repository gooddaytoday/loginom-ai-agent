import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { agentCommand, type AgentCommand } from "./cli"
import { parseArtifactSource } from "./artifact"
import { scopedSlotConfig } from "./environment-preparation"
import { evaluationContractHash, rubricSnapshot } from "./evaluation"
import { EvalFailure } from "./fail"
import { createJudgeGate, judgeInfo, type JudgeSettings } from "./judge"
import { acquireJudgeLease, readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { openLoginomAdmin, type AdminConnection } from "./loginom-admin"
import { requireResourceBudgetScopes, validResourceBound } from "./parallel-resource-budget"
import { freezeResourceBudget, readFrozenResourceBudget, readResourceEvidence } from "./parallel-resource-evidence"
import { assessResourceBudget, assessResourceIncidents, assessResourceTimeline } from "./parallel-acceptance"
import { sampleHostResources } from "./parallel-resources"
import { readServerIdentity } from "./parallel-pair"
import { preflight, gitInfo, type Environment } from "./preflight"
import { assertAuth, verifyProfile } from "./profile"
import type { ProcessCleanup } from "./process-supervisor"
import { aggregate, aggregateLimits, aggregateTask, renderReport, writeSummary, type AttemptResult, type RunSummary } from "./report"
import { describe, emptyResult, installSigint, redact, runAttempt, stamp } from "./run"
import { reserveRunDirectory } from "./run-directory"
import { requireAvailableMemory, startRunResourceSampler } from "./run-resources"
import { watchAttemptIncidents } from "./run-incidents"
import { buildJobs, runSlotQueue } from "./scheduler"
import { assertSessionBackupEmpty, cleanupSlotStorage } from "./slot-storage"
import { reconcileEnvironment } from "./startup-reconciliation"
import { acquireEnvironmentLeases, loadSlots, type SlotLease } from "./slots"
import { agentInputsHash, loadTasks, rubricHash, taskTimeoutMs } from "./task"

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
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity, phase: "cli_admitted", runDir,
    slotIds: file.slots.slice(0, config.parallel).map(slot => slot.id) })
  const budgetFile = path.join(runDir, "resource-budget.json")
  const budget = await freezeResourceBudget({ out: budgetFile, runId, bounds })
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2))
  const environment = await acquireEnvironmentLeases(file, config.parallel, identity, journal)
  const controller = new AbortController(), removeSigint = installSigint(controller)
  const contexts: { lease: SlotLease; config: EvalConfig; command: AgentCommand; cleanup: string; confirmed: boolean }[] = []
  const attempts: AttemptResult[] = []
  let admin: AdminConnection | undefined, judgeLease: Awaited<ReturnType<typeof acquireJudgeLease>> | undefined
  let sampler: Awaited<ReturnType<typeof startRunResourceSampler>> | undefined
  let metadata: Environment = { git, agent: null, codex: null, dock: null, loginom: null }
  let judge: Awaited<ReturnType<typeof judgeInfo>> | null = null, stopped: string | null = null
  let judgeConfirmed = true, dispatchStarted = "", executionFinished = ""
  const admissions: { slotId: string; taskId: string; attempt: number }[] = []
  let admissionWrite = Promise.resolve()
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
    const settings: JudgeSettings | undefined = judge ? { ...scopedJudge, timeoutMs: config.judgeTimeoutMs, passThreshold: config.passThreshold } : undefined
    const gate = createJudgeGate()
    const evaluationHash = evaluationContractHash({ rubric_hash: rubric, judge, pass_threshold: config.passThreshold })
    await Bun.write(path.join(runDir, "config.json"), JSON.stringify({ ...redact(config), agent_inputs_hash: inputsHash,
      rubric_hash: rubric, binary_sha256: metadata.agent?.binarySha256, source_commit: metadata.agent?.sourceCommit, judge }, null, 2))
    sampler = await startRunResourceSampler({ slotsFile: config.slotsFile, out: path.join(runDir, "resources.jsonl"), runId })
    dispatchStarted = new Date().toISOString()
    const queued = await runSlotQueue({ jobs: buildJobs(tasks.map(task => task.id), config.repeat), slots: contexts.map(context => context.lease.slot.id),
      signal: controller.signal, async execute(slotId, job) {
        const context = contexts.find(context => context.lease.slot.id === slotId)!
        const out = path.join(runDir, job.taskId, String(job.attempt))
        context.confirmed = false
        try {
        admissions.push({ slotId, taskId: job.taskId, attempt: job.attempt })
        admissionWrite = admissionWrite.then(() => writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId,
          identity, phase: "cli_admitted", runDir, slotIds: environment.slots.map(lease => lease.slot.id), attempts: [...admissions] }))
        await admissionWrite
        await mkdir(out, { recursive: true, mode: 0o700 })
        const watcher = watchAttemptIncidents(out, code => { stopped ??= code; controller.abort() })
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
          await Bun.write(path.join(out, "cleanup.json"), JSON.stringify({ processes, ...cleanup, slotId, profileDir: context.lease.slot.profileDir, serverEpoch: identity.serverEpoch,
            serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true }, null, 2))
        } catch (error) {
          context.confirmed = false
          result.environment_cleanup = { status: "failed", evidence: "cleanup.json", error: describe(error) }
          if (/SESSION_BACKUP|SERVER_EPOCH|SERVER_FENCE/.test(describe(error))) controller.abort()
        }
        if (result.limit_evidence?.events.length || result.failure_kind === "provider") {
          stopped = "PROVIDER_LIMIT_OBSERVED"; controller.abort()
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
        }
      } })
    executionFinished = new Date().toISOString()
    if (queued.quarantined.length || queued.unassigned.length) stopped ??= `Quarantined: ${queued.quarantined.join(",")}; unassigned: ${queued.unassigned.length}`
    // Capture a sample after the last cleanup, then stop and verify the sampler in finally.
    await Bun.sleep(1100)
  } catch (error) { stopped ??= describe(error) }
  finally {
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
  const resourceChecks: { status: string; codes: string[] }[] = []
  try {
    const evidence = await readResourceEvidence({ file: summaryFile, samplesFile, runId, phase: "run" })
    resourceChecks.push(assessResourceBudget({ runId, startedAt: dispatchStarted,
      budget: await readFrozenResourceBudget({ ...budget.source, runId, startedAt: dispatchStarted }), summary: evidence.receipt.summary }),
      assessResourceIncidents({ samples: evidence.samples, summary: evidence.receipt.summary }),
      assessResourceTimeline({ samples: evidence.samples, intervalMs: 1000, startedAt: dispatchStarted, finishedAt: executionFinished }))
    if (evidence.samples.some(sample => containers.some(target => {
      const rows = sample.containers?.filter(row => row.container_id === target.id) ?? []
      return rows.length !== 1 || rows[0]!.epoch_stable !== true || rows[0]!.inspect?.started_at !== target.startedAt
    }))) resourceChecks.push({ status: "failed", codes: ["CONTAINER_RESOURCE_IDENTITY_UNCONFIRMED"] })
  } catch (error) { resourceChecks.push({ status: "incomplete", codes: [describe(error)] }) }
  if (resourceChecks.some(check => check.status !== "passed")) stopped ??= resourceChecks.flatMap(check => check.codes).join(", ")
  const measured = attempts.filter((attempt): attempt is AttemptResult => attempt !== undefined)
  const limits = aggregateLimits(measured, ["provider", "judge"])
  if (limits.status !== "passed") stopped ??= limits.codes.join(", ")
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
