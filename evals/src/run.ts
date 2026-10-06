import path from "node:path"
import { cp, mkdir, readdir, rename } from "node:fs/promises"
import { loadConfig, type EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { evaluationContractHash, rubricSnapshot } from "./evaluation"
import { agentInputsHash, buildAgentPrompt, loadTasks, rubricHash, taskTimeoutMs, type Task } from "./task"
import { agentCommand, runAgent, type AgentCommand } from "./cli"
import { cleanupArtifact, cleanupOrphanResult, fetchArtifact, listStorage, parseArtifactSource, type ArtifactSource } from "./artifact"
import { preflight } from "./preflight"
import { assertAuth, ensureProfile, managementRuntimeDirectories, pruneRuntimeAttempts, recoverIfNeeded, releaseStaleWriter, resetProfile, waitProfileIdle } from "./profile"
import { judgeInfo, judgeTask, judgedFields, type JudgeSettings } from "./judge"
import { archiveDiagnostics } from "./diagnostics"
import type { ProcessCleanup } from "./process-supervisor"
import { acquireHarnessLease } from "./lease"
import { aggregate, aggregateTask, renderReport, statusFor, writeSummary, type AttemptResult, type RunSummary } from "./report"

export async function main(argv: string[], env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(argv, env)
  if (config.judgeOnly !== undefined) {
    const { rejudge } = await import("./rejudge")
    return rejudge(config, config.judgeOnly)
  }
  if (config.calibrate) {
    const { calibrate } = await import("./calibrate")
    return calibrate(config)
  }
  const lease = config.dryRun ? undefined : await acquireHarnessLease(config.profileDir)
  if (lease) config.profileDir = lease.profileDir
  const result = await executeRun(config)
  if (result.code === 0) await lease?.release()
  return result
}

async function executeRun(config: EvalConfig) {
  const tasks = await loadTasks(config.tasksDir, config.only)
  const source = parseArtifactSource(config.artifactSource, config.loginom)
  const environment = await preflight(config, source)
  const controller = new AbortController()
  installSigint(controller)
  const startedAt = new Date()
  const runId = `${stamp(startedAt)}-${environment.git?.sha ?? "nogit"}${environment.git?.dirty ? "-dirty" : ""}`
  const runDir = path.join(config.resultsDir, runId)
  await mkdir(runDir, { recursive: true })
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2))
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
      }
    : undefined
  const inputsHash = await agentInputsHash(tasks)
  const rubric = await rubricHash(tasks)
  const evaluationHash = evaluationContractHash({ rubric_hash: rubric, judge, pass_threshold: config.passThreshold })
  const attempts: AttemptResult[] = []
  const state: { stopped: string | null; interruptedCleanup: { recovered: boolean } | null } = {
    stopped: null,
    interruptedCleanup: null,
  }
  if (!config.dryRun) await prepareProfile(config, command).catch((error) => { state.stopped = describe(error) })
  // Round-robin: сбой окружения размазывается по задачам, Ctrl+C после первого круга оставляет полное покрытие.
  outer: for (const attempt of Array.from({ length: config.repeat }, (_, index) => index + 1)) {
    for (const task of tasks) {
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
          if (result.status === "interrupted") state.interruptedCleanup = { recovered: after.recovered }
        }
        if (result.environment_cleanup?.status === "failed" || result.status === "harness_error" && stop) {
          state.stopped = result.environment_cleanup?.error ?? result.harness_error ?? "harness_error"
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
  const summary: RunSummary = {
    run_id: runId,
    label: config.label,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    interrupted: controller.signal.aborted,
    interrupted_cleanup: state.interruptedCleanup,
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
      storage_dir: source.kind === "dir" ? null : config.loginom.storageDir,
    },
    agent_inputs_hash: inputsHash,
    rubric_hash: rubric,
    task_ids: tasks.map((task) => task.id),
    config: {
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
    storage_leftovers: config.dryRun ? [] : await leftovers(source, runId),
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
  initialInfraAttempt?: AttemptResult
  skipJudge: boolean
  judge?: JudgeSettings
  evaluationHash?: string
}): Promise<{ result: AttemptResult; stop: boolean }> {
  const base: AttemptResult = {
    ...emptyResult(input.task.id, input.attempt, input.profileRecovered),
    ...(input.initialInfraAttempt ? { infra_retry: { initial: input.initialInfraAttempt } } : {}),
  }
  return attemptBody(input, base).catch(async (error: unknown) => {
    const measured = base.exit_code !== null
    const result: AttemptResult = measured
      ? { ...base, environment_cleanup: { status: "failed", evidence: "cleanup.json", error: describe(error) } }
      : { ...base, status: "harness_error", judge_status: "skipped", harness_error: describe(error) }
    await Bun.write(path.join(input.runDir, input.task.id, String(input.attempt), "result.json"), JSON.stringify(result, null, 2))
      .catch(() => { console.error("Не удалось сохранить attempt result; исход сохранится в summary") })
    return { result, stop: measured }
  })
}

async function attemptBody(input: Parameters<typeof runAttempt>[0], base: AttemptResult): Promise<{ result: AttemptResult; stop: boolean }> {
  const { config, task, attempt } = input
  const outDir = path.join(input.runDir, task.id, String(attempt))
  const workdir = path.join(config.agent.workspaceRoot, input.runId, task.id, String(attempt))
  await mkdir(outDir, { recursive: true })
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
  const prompt = buildAgentPrompt(task.prompt, packagePath, `${name}.result.csv`)
  await Bun.write(path.join(outDir, "prompt.txt"), prompt)
  const since = Date.now()
  const run = await runAgent({
    command: input.command,
    taskId: task.id,
    model: config.agent.model,
    variant: config.agent.variant,
    profileDir: config.dryRun ? undefined : config.profileDir,
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
  const { status, stop } = artifactError ? { status: "harness_error" as const, stop: false } : statusFor(run, artifact !== undefined)
  const cleanupError =
    !config.keepStorage && (artifact || !config.dryRun)
      ? await (artifact ? cleanupArtifact(input.source, artifact) : cleanupOrphanResult({
          source: input.source, name: `${name}.result.csv`, outDir,
        })).then(
          () => null,
          (error: unknown) => describe(error),
        )
      : null
  const noJudge = status === "harness_error" || status === "interrupted" || status === "infra_error"
  const judged =
    artifact && !noJudge && !input.signal.aborted && input.judge && !input.skipJudge
      ? await judgeTask({
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
      status: run.processCleanup.status === "failed" ? "failed" : "not_run",
      evidence: "cleanup.json", error: run.processCleanup.error,
    },
    action_manifest_sha256: run.actionManifestSha256 ?? null,
    skill_revision: run.skillRevision ?? null,
    session_id: run.sessionId ?? null,
    errors: run.errors,
    stderr_head: run.stderrHead.trim() ? run.stderrHead : null,
    harness_error:
      artifactError ??
      (status === "harness_error"
        ? `CLI exit ${run.exitCode}: ${firstNonEmptyLine(run.stderrHead) ?? run.errors.join(", ") ?? "—"}`
        : null),
  }
  Object.assign(base, result)
  await Bun.write(path.join(outDir, "cleanup.json"), JSON.stringify({ processes: run.processCleanup }, null, 2))
  await Bun.write(path.join(outDir, "result.json"), JSON.stringify(result, null, 2))
  return { result, stop: stop || run.processCleanup.status === "failed" }
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

async function prepareProfile(config: EvalConfig, command: AgentCommand) {
  if (config.resetProfile) await resetProfile(config)
  await releaseStaleWriter(config.profileDir, null)
  await ensureProfile(config, command)
  await assertAuth(config, command)
  await recoverIfNeeded(command, 2)
  await pruneRuntimeAttempts(config.profileDir, await managementRuntimeDirectories(command))
}

export async function afterAttempt(config: EvalConfig, command: AgentCommand, result: AttemptResult, outDir?: string) {
  const evidence: { processes?: ProcessCleanup; stages: { stage: string; status: string }[] } = { stages: [] }
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
    await pruneRuntimeAttempts(config.profileDir, [...evidence.processes.runtimeDirectories, ...await managementRuntimeDirectories(command)])
    evidence.stages.push({ stage: "pruning", status: "confirmed" })
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
  process.on("SIGINT", () => {
    if (controller.signal.aborted) {
      console.error("\nПовторный Ctrl+C — немедленный выход без summary.")
      process.exit(130)
    }
    console.error("\nCtrl+C: останавливаю текущую попытку и дописываю summary. Ещё раз Ctrl+C — выход немедленно.")
    controller.abort()
  })
}

export const stamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-")

export function redact(config: EvalConfig) {
  return {
    ...config,
    loginom: { ...config.loginom, password: config.loginom.password ? "<set>" : "<unset>" },
    dock: { ...config.dock, apiKey: config.dock.apiKey ? "<set>" : "<unset>" },
    agent: { ...config.agent, provider: config.agent.provider ? { ...config.agent.provider, apiKey: "<set>" } : undefined },
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
