import path from "node:path"
import { cp, mkdir, readdir, rename } from "node:fs/promises"
import { loadConfig, type EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { evaluationContractHash, rubricSnapshot } from "./evaluation"
import { agentInputsHash, buildAgentPrompt, loadTasks, rubricHash, taskTimeoutMs, type Task } from "./task"
import { agentCommand, runAgent, type AgentCommand } from "./cli"
import { cleanupArtifact, cleanupIsolatedStorage, cleanupOrphanResult, fetchArtifact, listStorage, parseArtifactSource, storageEntryExists, type ArtifactSource } from "./artifact"
import { checkIsolatedLoginom, gitInfo, preflight } from "./preflight"
import { archiveProfileHistory, assertAuth, ensureProfile, recoverIfNeeded, releaseStaleWriter, resetProfile, waitProfileIdle } from "./profile"
import { createJudgeGate, judgeInfo, judgeTask, judgedFields, type JudgeSettings } from "./judge"
import { archiveDiagnostics } from "./diagnostics"
import type { ProcessCleanup } from "./process-supervisor"
import { acquireRunHarnessLease } from "./node-eval-ops"
import { SandboxFailure } from "./sandbox"
import { reserveRunDirectory } from "./run-directory"
import { buildJobs, runSlotQueue } from "./scheduler"
import { beginFixtureAttempt, finishFixtureAttempt, finishFixtureJudge, inspectFixtureStorage, fenceFixtureStorage, prepareFixture, validateFixture, type ParallelFixture } from "./parallel-fixture"
import { aggregate, aggregateTask, renderReport, statusFor, writeSummary, type AttemptResult, type RunSummary } from "./report"

export async function main(argv: string[], env: Record<string, string | undefined> = process.env, options?: { fixture: ParallelFixture }) {
  const config: EvalConfig = loadConfig(argv, options?.fixture ? { ...env, EVAL_SLOTS_FILE: env.EVAL_SLOTS_FILE ?? "fixture-programmatic-only" } : env)
  const fixture = options?.fixture ? await validateFixture(config, options.fixture, env) : undefined
  if (fixture) {
    config.artifactSource = `dir:${fixture.storage}`
    config.judge.env = { CODEX_HOME: fixture.file.judge.codexHome }
    return executeRun(config, fixture)
  }
  if (config.judgeOnly !== undefined) {
    const { rejudge } = await import("./rejudge")
    return rejudge(config, config.judgeOnly)
  }
  if (config.calibrate) {
    const { calibrate } = await import("./calibrate")
    return calibrate(config)
  }
  // Replaced by the v2 controller after user/session/backup admission is qualified.
  if (config.slotsFile) throw new EvalFailure("SLOTS_ADMISSION_UNAVAILABLE", 2)
  const lease = config.dryRun ? undefined : await acquireRunHarnessLease(config.profileDir, env)
  if (lease) config.profileDir = lease.profileDir
  const result = await executeRun(config)
  if (result.code === 0) await lease?.release()
  return result
}

async function executeRun(config: EvalConfig, fixture?: Awaited<ReturnType<typeof validateFixture>>) {
  const controller = new AbortController()
  const removeSigint = installSigint(controller)
  return executeRunBody(config, fixture, controller).finally(removeSigint)
}

async function executeRunBody(config: EvalConfig, fixture: Awaited<ReturnType<typeof validateFixture>> | undefined, controller: AbortController) {
  const tasks = await loadTasks(config.tasksDir, config.only)
  if (!config.skipJudge && tasks.some(task => task.outputMode === "diagnostic"))
    throw new EvalFailure("diagnostic tasks require --skip-judge", 2)
  const source = parseArtifactSource(config.artifactSource, config.loginom)
  const environment = fixture
    ? { git: await gitInfo(), agent: null, codex: null, dock: null, loginom: null }
    : await preflight(config, source)
  const startedAt = new Date()
  const runDir = await reserveRunDirectory(config.resultsDir,
    `${stamp(startedAt)}-${environment.git?.sha ?? "nogit"}${environment.git?.dirty ? "-dirty" : ""}`)
  const runId = path.basename(runDir)
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2))
  if (fixture && config.dryRun) await Bun.write(path.join(runDir, "fixture-plan.json"), JSON.stringify({
    liveQualified: false, ready: false, jobs: buildJobs(tasks.map(task => task.id), config.repeat),
  }, null, 2))
  const command: AgentCommand = { ...agentCommand(config), cleanupDir: path.join(runDir, "preparation"),
    cleanupSecrets: [config.loginom.password, config.dock.apiKey, config.agent.provider?.apiKey ?? ""] }
  const judge = config.skipJudge ? null : await judgeInfo(config)
  const settings: JudgeSettings | undefined = judge
    ? {
        command: config.judge.command,
        model: config.judge.model,
        reasoning: config.judge.reasoning,
        timeoutMs: config.judgeTimeoutMs,
        passThreshold: config.passThreshold,
        env: config.judge.env,
      }
    : undefined
  const judgeGate = createJudgeGate()
  const inputsHash = await agentInputsHash(tasks)
  const rubric = await rubricHash(tasks)
  const evaluationHash = evaluationContractHash({ rubric_hash: rubric, judge, pass_threshold: config.passThreshold })
  const attempts: AttemptResult[] = []
  const slotStates = new Map<string, { state: "closed" | "quarantined"; lease_receipt: string; cleanup_receipt: string; storage_root: string; storage_leftovers: string[] | null; storage_error: string | null }>()
  const state: { stopped: string | null } = { stopped: null }
  if (fixture && !config.dryRun) {
    const contexts = await prepareFixture(config, fixture, runId, runDir)
    const unconfirmed = new Set<string>()
    try {
      const queued = await runSlotQueue({ jobs: buildJobs(tasks.map(task => task.id), config.repeat),
        slots: contexts.map(context => context.lease.slot.id), signal: controller.signal,
        async execute(slotId, job) {
          const context = contexts.find(context => context.lease.slot.id === slotId)!
          const out = path.join(runDir, job.taskId, String(job.attempt))
          const perform = async (initialInfraAttempt?: AttemptResult) => {
            unconfirmed.add(slotId)
            await beginFixtureAttempt(context)
            const completed = await runAttempt({ config: context.config, command: context.command,
              source: parseArtifactSource(context.config.artifactSource, context.config.loginom),
              task: tasks.find(task => task.id === job.taskId)!, attempt: job.attempt, runId, runDir,
              signal: controller.signal, profileRecovered: false, slotId, judge: settings,
              initialInfraAttempt, skipJudge: config.skipJudge, evaluationHash, judgeGate })
            attempts[job.index] = completed.result
            if (completed.result.judge_cleanup_unconfirmed)
              throw Error(completed.result.environment_cleanup?.error ?? "Judge process cleanup unconfirmed")
            const cleanup = await finishFixtureAttempt(context, completed.result, out).then(() => true, async (error: unknown) => {
              completed.result.environment_cleanup = { status: "failed", evidence: "cleanup.json", error: describe(error) }
              await Bun.write(path.join(out, "result.json"), JSON.stringify(completed.result, null, 2))
              return false
            })
            if (cleanup) unconfirmed.delete(slotId)
            return { result: completed.result, quarantine: !cleanup, stop: completed.stop && completed.result.status !== "interrupted" }
          }
          const first = await perform()
          if (first.result.status !== "infra_error" || first.quarantine || first.stop || controller.signal.aborted) return first
          await archiveInfraAttempt(out).catch(async (error: unknown) => {
            unconfirmed.add(slotId)
            first.result.environment_cleanup = { status: "failed", evidence: "infra-error", error: describe(error) }
            await Bun.write(path.join(out, "result.json"), JSON.stringify(first.result, null, 2))
            throw error
          })
          return perform(first.result)
        } })
      const stopped = [...queued.quarantined, ...(queued.stopped ?? [])]
      if (stopped.length) state.stopped = `Stopped slots: ${stopped.join(", ")}`
    } catch (error) { state.stopped = error instanceof AggregateError ? error.errors.map(describe).join("; ") : describe(error) }
    finally {
      for (const context of contexts) {
        const storage = await inspectFixtureStorage(context, runId)
        slotStates.set(context.lease.slot.id, { state: "quarantined", lease_receipt: context.lease.receipt, cleanup_receipt: context.cleanup,
          storage_root: context.storage.path, storage_leftovers: storage.names, storage_error: storage.error })
        if (storage.names === null || storage.names.length) {
          unconfirmed.add(context.lease.slot.id)
          state.stopped ??= storage.error ?? `Slot storage not empty: ${context.lease.slot.id}`
          await fenceFixtureStorage(context, storage).catch((error: unknown) => { state.stopped ??= describe(error) })
        }
        if (unconfirmed.has(context.lease.slot.id)) continue
        await context.lease.release(context.cleanup).then(() => { slotStates.get(context.lease.slot.id)!.state = "closed" },
          (error: unknown) => { state.stopped ??= describe(error) })
      }
      await Promise.all(contexts.map(context => context.lease.close()))
      if (attempts.some(result => result.judge_cleanup_unconfirmed)) await contexts[0]!.judgeLease?.close()
      if (!attempts.some(result => result.judge_cleanup_unconfirmed))
        await finishFixtureJudge(contexts[0]!, runDir).catch((error: unknown) => { state.stopped ??= describe(error) })
    }
  }
  if (!fixture && !config.dryRun) await prepareProfile(config, command, runId).catch((error) => { state.stopped = describe(error) })
  // Round-robin: сбой окружения размазывается по задачам, Ctrl+C после первого круга оставляет полное покрытие.
  outer: for (const attempt of Array.from({ length: config.repeat }, (_, index) => index + 1)) {
    for (const task of tasks) {
      if (fixture) break outer
      if (controller.signal.aborted || state.stopped) break outer
      const history: { initial?: AttemptResult } = {}
      for (const retry of [0, 1]) {
        if (controller.signal.aborted || state.stopped) break outer
        const { result, stop } = await runAttempt({
          config,
          command,
          source,
          task,
          attempt,
          runId,
          runDir,
          signal: controller.signal,
          profileRecovered: false,
          initialInfraAttempt: history.initial,
          judge: settings,
          skipJudge: config.skipJudge,
          evaluationHash,
        })
        if (retry === 0) attempts.push(result)
        if (retry === 1) attempts[attempts.length - 1] = result
        console.error(`[${task.id}#${attempt}] ${result.status} score=${result.score ?? "—"} ${Math.round(result.duration_ms / 1000)}s`)
        if (!config.dryRun) {
          const out = path.join(runDir, task.id, String(attempt))
          const after = await afterAttempt(config, { ...command, cleanupDir: path.join(out, "management") }, result, out)
            .catch((error: unknown) => {
              result.environment_cleanup = { status: "failed", evidence: "cleanup.json", error: describe(error) }
              return { stop: describe(error) }
            })
          await Bun.write(path.join(out, "result.json"), JSON.stringify(result, null, 2)).catch(async () => {
            const error = "Attempt result persistence failed; measured outcome retained in summary"
            result.environment_cleanup = { status: "failed", evidence: "cleanup.json", error }
            state.stopped = error
            await Bun.write(path.join(out, "result.persistence-failure.json"), JSON.stringify(result, null, 2)).catch(() => {})
          })
          if (state.stopped) break outer
          if ("stop" in after) { state.stopped = after.stop ?? "Environment cleanup failed"; break outer }
        }
        if (result.cleanup_error || result.environment_cleanup?.status === "failed" || result.status === "harness_error" && stop) {
          state.stopped = result.cleanup_error ?? result.environment_cleanup?.error ?? result.harness_error ?? "harness_error"
          break outer
        }
        if (result.status === "interrupted") break outer
        if (result.status !== "infra_error" || retry === 1 || controller.signal.aborted) break
        const out = path.join(runDir, task.id, String(attempt))
        await archiveInfraAttempt(out).catch(async (error: unknown) => {
          state.stopped = describe(error)
          result.environment_cleanup = { status: "failed", evidence: "infra-error", error: state.stopped }
          await Bun.write(path.join(out, "result.json"), JSON.stringify(result, null, 2)).catch(() => {})
        })
        if (state.stopped) break outer
        history.initial = result
      }
    }
  }
  const interruptedAttempts = attempts.filter(result => result.status === "interrupted")
  const summary: RunSummary = {
    run_id: runId,
    slots: fixture ? fixture.file.slots.slice(0, config.parallel).map(slot => ({ ...slot,
      liveQualified: false, ...(config.dryRun ? { state: "planned" as const, storage_root: path.join(fixture.storage, slot.id) } : slotStates.get(slot.id)!) }))
      : [{ id: "default", username: config.loginom.username, profileDir: config.profileDir,
        historyDir: `${config.profileDir}.history`, workspaceRoot: path.resolve(config.agent.workspaceRoot), liveQualified: false,
        state: config.dryRun ? "planned" : state.stopped || attempts.some(result => result.environment_cleanup?.status !== "confirmed") ? "quarantined" : "closed",
        ...(attempts.at(-1) ? { cleanup_receipt: path.join(runDir, attempts.at(-1)!.task_id, String(attempts.at(-1)!.attempt), "cleanup.json") } : {}) }],
    label: config.label,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    interrupted: controller.signal.aborted,
    interrupted_cleanup: interruptedAttempts.length ? { recovered: interruptedAttempts.some(result => result.profile_recovered) } : null,
    stopped_reason: state.stopped,
    agent: {
      cli_mode: config.agent.cliMode,
      git_sha: config.agent.cliMode === "binary" ? environment.agent?.sourceCommit ?? null : environment.git?.sha ?? null,
      dirty: config.agent.cliMode === "binary" ? environment.agent?.sourceDirty ?? null : environment.git?.dirty ?? null,
      model: config.agent.model,
      variant: config.agent.variant,
      cli_version: environment.agent?.cliVersion ?? null,
      binary_path: environment.agent?.binaryPath ?? null,
      binary_sha256: environment.agent?.binarySha256 ?? null,
      source_commit: config.agent.cliMode === "binary" ? environment.agent?.sourceCommit ?? null : environment.git?.sha ?? null,
      source_dirty: config.agent.cliMode === "binary" ? environment.agent?.sourceDirty ?? null : environment.git?.dirty ?? null,
      source_tree_sha256: environment.agent?.sourceTreeSha256 ?? null,
    },
    harness: { git_sha: environment.git?.sha ?? null, dirty: environment.git?.dirty ?? null },
    judge,
    dock: {
      skill_revision: environment.dock?.skillRevision ?? null,
      skill_revisions: [...new Set(attempts.flatMap((item) => item.skill_revision ? [item.skill_revision] : []))].sort(),
      action_manifest_sha256: [...new Set(attempts.flatMap((item) => (item.action_manifest_sha256 ? [item.action_manifest_sha256] : [])))].sort(),
    },
    loginom: {
      image_digest: environment.loginom?.imageDigest ?? null,
      container: source.kind === "dir" ? null : config.loginom.container,
      storage_dir: fixture ? config.parallel === 1 ? path.join(fixture.storage, fixture.file.slots[0]!.id) : null
        : source.kind === "dir" ? null : config.loginom.storageDir,
    },
    agent_inputs_hash: inputsHash,
    rubric_hash: rubric,
    task_ids: tasks.map((task) => task.id),
    config: {
      parallel: config.parallel,
      repeat: config.repeat,
      tasks_dir: config.tasksDir,
      task_timeout_ms: Object.fromEntries(tasks.map((task) => [task.id, taskTimeoutMs(config, task)])),
      timeout_ms: config.timeoutMs ?? config.taskTimeoutMs,
      judge_timeout_ms: config.judgeTimeoutMs,
      pass_threshold: config.passThreshold,
      keep_storage: config.keepStorage,
    },
    metrics: aggregate(attempts, config.skipJudge),
    tasks: tasks.map((task) => {
      const own = attempts.filter((item) => item.task_id === task.id)
      return { id: task.id, rubric_snapshot: rubricSnapshot(task), metrics: aggregateTask(own, config.skipJudge), attempts: own }
    }),
    storage_leftovers: config.dryRun ? [] : fixture
      ? [...slotStates.values()].some(slot => slot.storage_leftovers === null) ? null
        : [...slotStates].flatMap(([id, slot]) => slot.storage_leftovers!.map(name => `${id}/${name}`)).sort()
      : await leftovers(source, runId),
  }
  await writeSummary(runDir, summary)
  console.log(renderReport(summary))
  console.error(`Результаты: ${runDir}`)
  return { code: state.stopped ? 1 : 0, runDir }
}

export async function runAttempt(input: {
  config: EvalConfig
  command: AgentCommand
  source: ArtifactSource
  task: Task
  attempt: number
  runId: string
  runDir: string
  signal: AbortSignal
  profileRecovered: boolean
  slotId?: string
  initialInfraAttempt?: AttemptResult
  skipJudge: boolean
  judge?: JudgeSettings
  judgeGate?: ReturnType<typeof createJudgeGate>
  evaluationHash?: string
}): Promise<{ result: AttemptResult; stop: boolean }> {
  const base: AttemptResult = {
    ...emptyResult(input.task.id, input.attempt, input.profileRecovered),
    slot_id: input.slotId ?? "default",
    ...(input.initialInfraAttempt ? { infra_retry: { initial: input.initialInfraAttempt } } : {}),
  }
  return attemptBody(input, base).catch(async (error: unknown) => {
    const measured = base.exit_code !== null
    const result: AttemptResult = measured
      ? { ...base, environment_cleanup: { status: "failed", evidence: "cleanup.json", error: describe(error) } }
      : { ...base, status: "harness_error", judge_status: "skipped", harness_error: describe(error) }
    await Bun.write(path.join(input.runDir, input.task.id, String(input.attempt), "result.json"), JSON.stringify(result, null, 2))
      .catch(() => { console.error("Не удалось сохранить attempt result; исход сохранится в summary") })
    return { result, stop: measured || error instanceof SandboxFailure }
  })
}

async function attemptBody(input: Parameters<typeof runAttempt>[0], base: AttemptResult): Promise<{ result: AttemptResult; stop: boolean }> {
  const { config, task, attempt } = input
  const outDir = path.join(input.runDir, task.id, String(attempt))
  const workdir = path.join(config.agent.workspaceRoot, input.runId, task.id, String(attempt))
  await mkdir(outDir, { recursive: true })
  if (!config.dryRun && config.agent.cliMode === "binary")
    await checkIsolatedLoginom(input.source).catch((error: unknown) => { throw new SandboxFailure(describe(error)) })
  await mkdir(workdir, { recursive: true })
  const files = await Promise.all(
    task.inputs.map(async (rel) => {
      const dest = path.join(workdir, path.basename(rel))
      await cp(path.join(task.dir, rel), dest)
      return dest
    }),
  )
  const name = `eval-${input.runId}-${task.id}-${attempt}`
  const packagePath = `/${config.loginom.username}/${name}.lgp`
  const prompt = buildAgentPrompt(task.prompt, packagePath, `${name}.result.csv`, task.outputMode)
  await Bun.write(path.join(outDir, "prompt.txt"), prompt)
  const storageBefore = config.dryRun ? [] : await storageEntryExists(input.source, `${name}.result.csv`)
    .then(exists => exists ? [`${name}.result.csv`] : [], () => null)
  const since = Date.now()
  const run = await runAgent({
    command: input.command,
    taskId: task.id,
    model: config.agent.model,
    variant: config.agent.variant,
    profileDir: config.dryRun ? undefined : config.profileDir,
    slotId: input.slotId ?? "default",
    prompt,
    files,
    workdir,
    timeoutMs: taskTimeoutMs(config, task),
    outDir,
    signal: input.signal,
  })
  const early = statusFor(run, false)
  // This measured checkpoint survives failures in artifact/judge/evidence persistence.
  Object.assign(base, { status: early.status, exit_code: run.exitCode, timed_out: run.timedOut, interrupted: run.interrupted,
    duration_ms: run.durationMs, cost: run.cost, tokens: run.tokens, counters: run.counters,
    session_id: run.sessionId ?? null, errors: run.errors, stderr_head: run.stderrHead })
  const fetched =
    early.status === "interrupted" || early.status === "harness_error" || early.status === "infra_error"
      ? undefined
      : await fetchArtifact({
          source: input.source,
          username: config.loginom.username,
          receipts: run.saveReceipts,
          instructed: `${name}.lgp`,
          resultPrefix: name,
          since,
          outDir: path.join(outDir, "artifact"),
        }).catch((error: unknown) => ({ error: describe(error) }))
  const artifactError = fetched && "error" in fetched ? fetched.error : undefined
  const artifact = fetched && !("error" in fetched) ? fetched : undefined
  const { status, stop } = artifactError ? { status: "harness_error" as const, stop: false } : statusFor(run, artifact !== undefined || task.outputMode === "diagnostic")
  const cleanupError =
    !config.keepStorage && (artifact || !config.dryRun)
      ? await (artifact ? cleanupArtifact(input.source, artifact) : cleanupOrphanResult({
          source: input.source, name: `${name}.result.csv`, outDir, existingNames: storageBefore,
          processesConfirmed: run.processCleanup.status === "confirmed",
        })).then(
          () => null,
          (error: unknown) => describe(error),
        )
      : null
  const noJudge = status === "harness_error" || status === "interrupted" || status === "infra_error"
  const judged =
    artifact && !noJudge && !input.signal.aborted && input.judge && !input.skipJudge
      ? await (input.judgeGate ?? judgeTask)({
          task,
          run,
          artifactDir: path.dirname(artifact.unpackedDir),
          prompt,
          outDir: path.join(outDir, "judge"),
          judge: input.judge,
          signal: input.signal,
        }).catch((error: unknown) => ({ ok: false as const, error: describe(error), attempts: 0 as const }))
      : undefined
  const skippedJudge = input.skipJudge || artifact !== undefined || noJudge
  const judgeCleanupFailed = judged && "cleanupUnconfirmed" in judged && judged.cleanupUnconfirmed
  const judgeFields = judged
    ? judgedFields(judged)
    : {
        structural_score: skippedJudge || task.checklist.some((item) => item.axis === undefined) || !task.checklist.some((item) => item.axis === "structure") ? null : 0,
        score: skippedJudge ? null : 0,
        pass: skippedJudge ? null : false,
        judge_status: (skippedJudge ? "skipped" : "no_artifact") as AttemptResult["judge_status"],
        judge_attempts: 0,
        judge_confidence: null,
        judge_summary: null,
        checklist: null,
        oracle_pass: !skippedJudge && task.oracle ? false : null,
        oracle_error: !skippedJudge && task.oracle ? "Артефакт и файл результата для oracle отсутствуют" : null,
      }
  const result: AttemptResult = {
    ...base,
    ...judgeFields,
    ...(judgeCleanupFailed ? { judge_cleanup_unconfirmed: true } : {}),
    ...((judged || !skippedJudge) && input.evaluationHash ? { evaluation_contract_hash: input.evaluationHash } : {}),
    status,
    exit_code: run.exitCode,
    timed_out: run.timedOut,
    interrupted: run.interrupted,
    failure_kind: status === "failed" ? run.failureKind : null,
    duration_ms: run.durationMs,
    cost: run.cost,
    tokens: run.tokens,
    counters: run.counters,
    package_path: artifact?.packagePath ?? null,
    artifact_origin: artifact?.origin ?? null,
    artifact_ambiguous: artifact?.ambiguous ?? [],
    cleanup_error: cleanupError,
    environment_cleanup: {
      status: judgeCleanupFailed || run.processCleanup.status === "failed" ? "failed" : "not_run",
      evidence: judgeCleanupFailed ? judged.attempts ? `judge-processes-${judged.attempts}/process-cleanup.json` : null : "cleanup.json",
      error: judgeCleanupFailed && !judged.ok ? judged.error : run.processCleanup.error,
    },
    action_manifest_sha256: run.actionManifestSha256 ?? null,
    skill_revision: run.skillRevision ?? null,
    session_id: run.sessionId ?? null,
    errors: run.errors,
    stderr_head: run.stderrHead.trim() ? run.stderrHead : null,
    harness_error:
      artifactError ?? run.sandboxError ??
      (status === "harness_error"
        ? `CLI exit ${run.exitCode}: ${firstNonEmptyLine(run.stderrHead) ?? run.errors.join(", ") ?? "—"}`
        : null),
  }
  Object.assign(base, result)
  await Bun.write(path.join(outDir, "cleanup.json"), JSON.stringify({ processes: run.processCleanup }, null, 2))
  await Bun.write(path.join(outDir, "result.json"), JSON.stringify(result, null, 2))
  return { result, stop: stop || run.processCleanup.status === "failed" || Boolean(judgeCleanupFailed) }
}

async function archiveInfraAttempt(outDir: string) {
  const files = await readdir(outDir)
  const archive = path.join(outDir, "infra-error")
  await mkdir(archive)
  // Корневой результат нужен и при прерывании до повторного запуска.
  await Promise.all(files.map((file) => file === "result.json"
    ? cp(path.join(outDir, file), path.join(archive, file))
    : rename(path.join(outDir, file), path.join(archive, file))))
}

async function prepareProfile(config: EvalConfig, command: AgentCommand, runId: string) {
  if (config.resetProfile) await resetProfile(config)
  await releaseStaleWriter(config.profileDir, null)
  await ensureProfile(config, command)
  await assertAuth(config, command)
  await recoverIfNeeded(command, 2)
  await archiveProfileHistory(config.profileDir, `${runId}-initial`)
}

export async function afterAttempt(config: EvalConfig, command: AgentCommand, result: AttemptResult, outDir?: string) {
  const evidence: { processes?: ProcessCleanup; stages: { stage: string; status: string; path?: string }[] } = { stages: [] }
  try {
    if (!outDir) throw Error("Attempt cleanup evidence directory required")
    evidence.processes = (await Bun.file(path.join(outDir, "cleanup.json")).json()).processes as ProcessCleanup
    if (evidence.processes?.status !== "confirmed") throw Error(evidence.processes?.error ?? "Process cleanup unconfirmed")
    evidence.stages.push({ stage: "processes", status: "confirmed" })
    if (result.environment_cleanup?.status === "failed") throw Error(result.environment_cleanup.error ?? "Attempt persistence failed")
    await archiveDiagnostics(config.profileDir, evidence.processes.runtimeDirectories, outDir,
      [config.loginom.password, config.dock.apiKey, config.agent.provider?.apiKey ?? ""])
    evidence.stages.push({ stage: "diagnostics", status: "confirmed" })
    if (!(await waitProfileIdle(config.profileDir, 1_000))) throw Error("Profile still has process owners")
    const released = await releaseStaleWriter(config.profileDir, evidence.processes.writer)
    evidence.stages.push({ stage: "writer", status: "confirmed" })
    const recovery = await recoverIfNeeded(command, 1)
    result.profile_recovered = released || recovery.recovered
    evidence.stages.push({ stage: "ready", status: "confirmed" })
    const archive = await archiveProfileHistory(config.profileDir,
      `${path.basename(path.dirname(path.dirname(outDir)))}-${result.task_id}-${result.attempt}-${result.session_id ?? "no-session"}`)
    evidence.stages.push({ stage: "profile_history", status: "confirmed", path: archive })
    if (!config.dryRun && config.agent.cliMode === "binary" && !config.keepStorage) {
      await cleanupIsolatedStorage(parseArtifactSource(config.artifactSource, config.loginom))
      evidence.stages.push({ stage: "storage", status: "confirmed" })
    }
    result.environment_cleanup = { status: "confirmed", evidence: "cleanup.json", error: null }
    return { recovered: result.profile_recovered }
  } catch (error) {
    result.environment_cleanup = { status: "failed", evidence: outDir ? "cleanup.json" : null, error: describe(error) }
    return { stop: describe(error) }
  } finally {
    if (outDir) {
      await Bun.write(path.join(outDir, "cleanup.json"), JSON.stringify({ ...evidence, result: result.environment_cleanup }, null, 2))
      await Bun.write(path.join(outDir, "result.json"), JSON.stringify(result, null, 2))
    }
  }
}

export function installSigint(controller: AbortController) {
  const handler = () => {
    if (controller.signal.aborted) {
      console.error("\nПовторный Ctrl+C — немедленный выход без summary.")
      process.exit(130)
    }
    console.error("\nCtrl+C: останавливаю текущую попытку и дописываю summary. Ещё раз Ctrl+C — выход немедленно.")
    controller.abort()
  }
  process.on("SIGINT", handler)
  return () => { process.off("SIGINT", handler) }
}

export const stamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-")

export function redact(config: EvalConfig) {
  return {
    ...config,
    loginom: { ...config.loginom, password: config.loginom.password ? "<set>" : "<unset>" },
    dock: { ...config.dock, apiKey: config.dock.apiKey ? "<set>" : "<unset>" },
    agent: { ...config.agent, provider: config.agent.provider ? { ...config.agent.provider, apiKey: "<set>" } : undefined },
    judge: { ...config.judge, env: config.judge.env && Object.fromEntries(
      Object.entries(config.judge.env).map(([key, value]) => [key, value ? "<set>" : "<unset>"]),
    ) },
  }
}

export const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

function firstNonEmptyLine(text: string) {
  return text.split(/\r?\n/).find((line) => line.trim())
}

async function leftovers(source: ArtifactSource, runId: string) {
  const entries = await listStorage(source).then(
    (listed) => listed,
    (error: unknown) => {
      console.error(`Не удалось получить листинг хранилища: ${describe(error)}`)
      return null
    },
  )
  if (!entries) return null
  return entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`eval-${runId}-`))
    .sort()
}

function emptyResult(taskId: string, attempt: number, profileRecovered: boolean): AttemptResult {
  return {
    task_id: taskId,
    attempt,
    status: "harness_error",
    exit_code: null,
    timed_out: false,
    interrupted: false,
    failure_kind: null,
    structural_score: null,
    score: null,
    pass: null,
    judge_status: "skipped",
    judge_attempts: 0,
    judge_confidence: null,
    judge_summary: null,
    checklist: null,
    duration_ms: 0,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0 },
    counters: { toolCalls: 0, loginomToolCalls: 0, toolErrors: 0, memoryToolCalls: 0 },
    package_path: null,
    artifact_origin: null,
    artifact_ambiguous: [],
    cleanup_error: null,
    action_manifest_sha256: null,
    session_id: null,
    profile_recovered: profileRecovered,
    errors: [],
    harness_error: null,
    stderr_head: null,
    skill_revision: null,
    oracle_pass: null,
    oracle_error: null,
  }
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).then(
    (result) => process.exit(result.code),
    (error: unknown) => {
      console.error(error instanceof EvalFailure ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error))
      process.exit(error instanceof EvalFailure ? error.exitCode : 1)
    },
  )
}
