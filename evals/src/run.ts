import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import { loadConfig, type EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { agentInputsHash, loadTasks, rubricHash, type Task } from "./task"
import { agentCommand, runAgent, type AgentCommand } from "./cli"
import { cleanupArtifact, fetchArtifact, listStorage, parseArtifactSource, type ArtifactSource } from "./artifact"
import { preflight } from "./preflight"
import { assertAuth, ensureProfile, recoverIfNeeded, releaseStaleWriter, resetProfile, waitProfileIdle } from "./profile"
import { judgeInfo, judgeTask, judgedFields, type JudgeSettings } from "./judge"
import { aggregate, aggregateTask, renderReport, statusFor, writeSummary, type AttemptResult, type RunSummary } from "./report"

export async function main(argv: string[]) {
  const config = loadConfig(argv)
  const tasks = await loadTasks(config.tasksDir, config.only)
  const source = parseArtifactSource(config.artifactSource, config.loginom)
  const environment = await preflight(config, source)
  const command = agentCommand(config)
  const controller = new AbortController()
  installSigint(controller)
  if (!config.dryRun) await prepareProfile(config, command)
  const startedAt = new Date()
  const runId = `${stamp(startedAt)}-${environment.git?.sha ?? "nogit"}${environment.git?.dirty ? "-dirty" : ""}`
  const runDir = path.join(config.resultsDir, runId)
  await mkdir(runDir, { recursive: true })
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2))
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
  const attempts: AttemptResult[] = []
  const state: { stopped: string | null; recovered: boolean; interruptedCleanup: { recovered: boolean } | null } = {
    stopped: null,
    recovered: false,
    interruptedCleanup: null,
  }
  // Round-robin: сбой окружения размазывается по задачам, Ctrl+C после первого круга оставляет полное покрытие.
  outer: for (const attempt of Array.from({ length: config.repeat }, (_, index) => index + 1)) {
    for (const task of tasks) {
      if (controller.signal.aborted) break outer
      const { result, stop } = await runAttempt({
        config,
        command,
        source,
        task,
        attempt,
        runId,
        runDir,
        signal: controller.signal,
        profileRecovered: state.recovered,
        judge: settings,
        skipJudge: config.skipJudge,
      })
      attempts.push(result)
      console.error(`[${task.id}#${attempt}] ${result.status} score=${result.score ?? "—"} ${Math.round(result.duration_ms / 1000)}s`)
      if (result.status === "harness_error" && stop) {
        state.stopped = result.harness_error ?? "harness_error"
        break outer
      }
      if (!config.dryRun) {
        const after = await afterAttempt(config, command, result).catch((error: unknown) => ({ stop: describe(error) }))
        if ("stop" in after) {
          state.stopped = after.stop ?? "harness_error"
          break outer
        }
        state.recovered = after.recovered
        if (result.status === "interrupted") state.interruptedCleanup = { recovered: after.recovered }
      }
      if (result.status === "interrupted") break outer
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
      git_sha: environment.git?.sha ?? null,
      dirty: environment.git?.dirty ?? null,
      model: config.agent.model,
    },
    judge,
    dock: {
      skill_revision: environment.dock?.skillRevision ?? null,
      action_manifest_sha256: [...new Set(attempts.flatMap((item) => (item.action_manifest_sha256 ? [item.action_manifest_sha256] : [])))],
    },
    loginom: {
      image_digest: environment.loginom?.imageDigest ?? null,
      container: source.kind === "dir" ? null : config.loginom.container,
      storage_dir: source.kind === "dir" ? null : config.loginom.storageDir,
    },
    agent_inputs_hash: await agentInputsHash(tasks),
    rubric_hash: await rubricHash(tasks),
    task_ids: tasks.map((task) => task.id),
    config: {
      repeat: config.repeat,
      timeout_ms: config.timeoutMs ?? config.taskTimeoutMs,
      judge_timeout_ms: config.judgeTimeoutMs,
      pass_threshold: config.passThreshold,
      keep_storage: config.keepStorage,
    },
    metrics: aggregate(attempts, config.skipJudge),
    tasks: tasks.map((task) => {
      const own = attempts.filter((item) => item.task_id === task.id)
      return { id: task.id, metrics: aggregateTask(own, config.skipJudge), attempts: own }
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
  skipJudge: boolean
  judge?: JudgeSettings
}): Promise<{ result: AttemptResult; stop: boolean }> {
  const base = emptyResult(input.task.id, input.attempt, input.profileRecovered)
  return attemptBody(input, base).catch((error: unknown) => ({
    result: {
      ...base,
      status: "harness_error" as const,
      judge_status: "skipped" as const,
      harness_error: describe(error),
    },
    stop: false,
  }))
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
  const prompt =
    `${task.prompt}\n\nСохрани готовый пакет как \`${packagePath}\`. ` +
    `Если задача требует выгрузку в файл, назови его \`${name}.result.csv\`. ` +
    "Уточняющих вопросов не задавай — принимай разумные решения самостоятельно и доведи задачу до конца."
  await Bun.write(path.join(outDir, "prompt.txt"), prompt)
  const since = Date.now()
  const run = await runAgent({
    command: input.command,
    taskId: task.id,
    model: config.agent.model,
    prompt,
    files,
    workdir,
    timeoutMs: config.timeoutMs ?? task.timeoutMs ?? config.taskTimeoutMs,
    outDir,
    signal: input.signal,
  })
  const early = statusFor(run, false)
  const fetched =
    early.status === "interrupted" || early.status === "harness_error"
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
    artifact && !config.keepStorage
      ? await cleanupArtifact(input.source, artifact).then(
          () => null,
          (error: unknown) => describe(error),
        )
      : null
  const noJudge = status === "harness_error" || status === "interrupted"
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
        }).catch((error) => ({ ok: false as const, error: describe(error), attempts: 0 as const }))
      : undefined
  const skippedJudge = input.skipJudge || artifact || noJudge
  const judgeFields = judged
    ? judgedFields(judged)
    : {
        score: skippedJudge ? null : 0,
        pass: skippedJudge ? null : false,
        judge_status: (skippedJudge ? "skipped" : "no_artifact") as AttemptResult["judge_status"],
        judge_attempts: 0,
        judge_confidence: null,
        judge_summary: null,
        checklist: null,
      }
  const result: AttemptResult = {
    ...base,
    ...judgeFields,
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
    action_manifest_sha256: run.actionManifestSha256 ?? null,
    session_id: run.sessionId ?? null,
    errors: run.errors,
    stderr_head: run.stderrHead.trim() ? run.stderrHead : null,
    harness_error:
      artifactError ??
      (status === "harness_error"
        ? `CLI exit ${run.exitCode}: ${firstNonEmptyLine(run.stderrHead) ?? run.errors.join(", ") ?? "—"}`
        : null),
  }
  await Bun.write(path.join(outDir, "result.json"), JSON.stringify(result, null, 2))
  return { result, stop }
}

async function prepareProfile(config: EvalConfig, command: AgentCommand) {
  if (config.resetProfile) await resetProfile(config)
  await releaseStaleWriter(config.profileDir)
  await ensureProfile(config, command)
  await assertAuth(config, command)
  await recoverIfNeeded(command, 2)
}

async function afterAttempt(config: EvalConfig, command: AgentCommand, result: AttemptResult) {
  if (result.timed_out || result.interrupted) {
    if (!(await waitProfileIdle(config.profileDir)))
      return { stop: `Процессы профиля ${config.profileDir} не завершились за 60 с` }
    await releaseStaleWriter(config.profileDir)
  }
  const recovery = await recoverIfNeeded(command, 1)
  return { recovered: recovery.recovered }
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
  const entries = await listStorage(source).catch(() => [])
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
