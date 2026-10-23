import path from "node:path"
import { cp } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { evaluationContractHash, rubricSnapshot } from "./evaluation"
import { agentInputsHash, loadTasks, rubricHash } from "./task"
import type { AgentRun } from "./cli"
import { parseArtifactSource } from "./artifact"
import { preflight } from "./preflight"
import { createJudgeGate, judgeInfo, judgedFields, type JudgeInfo, type JudgeSettings } from "./judge"
import { aggregate, aggregateTask, isQualityResult, renderReport, writeSummary, type AttemptResult, type RunSummary } from "./report"
import { describe, installSigint } from "./run"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"

export async function readPendingJudge(config: EvalConfig, resultFile: string) {
  if (!config.judgeOnly || config.calibrate || config.skipJudge || path.basename(config.judgeOnly) !== config.judgeOnly || [".", ".."].includes(config.judgeOnly))
    throw new EvalFailure("PENDING_JUDGE_MODE", 2)
  const runDir = path.join(config.resultsDir, config.judgeOnly)
  const dir = path.dirname(resultFile)
  if (!path.isAbsolute(resultFile) || path.resolve(resultFile) !== resultFile || path.basename(resultFile) !== "result.json" ||
    path.dirname(path.dirname(dir)) !== runDir) throw new EvalFailure("PENDING_JUDGE_PATH", 2)
  const result = await readLeaseReceipt(resultFile) as AttemptResult
  if (result.task_id !== path.basename(path.dirname(dir)) || !Number.isSafeInteger(result.attempt) || result.attempt < 1 || String(result.attempt) !== path.basename(dir))
    throw new EvalFailure("PENDING_JUDGE_IDENTITY", 2)
  const complete = isQualityResult(result)
  if (complete) return { runDir, dir, result, complete: true as const }
  if (result.judge_status === "skipped" && (result.judge_attempts !== 0 || await Bun.file(path.join(dir, "judge/verdict.json")).exists()))
    throw new EvalFailure("PENDING_JUDGE_OUTCOME_UNCONFIRMED", 2)
  if (!["skipped", "error"].includes(result.judge_status) || !["completed", "failed", "timeout"].includes(result.status) ||
    result.harness_error || result.failure_kind === "provider" || result.interrupted || !result.package_path || result.judge_cleanup_unconfirmed)
    throw new EvalFailure("PENDING_JUDGE_GENERATION_UNCONFIRMED", 2)
  if (result.judge_attempts !== 0 && result.judge_attempts !== 1 && result.judge_attempts !== 2) throw new EvalFailure("PENDING_JUDGE_BUDGET", 2)
  if (result.judge_attempts === 2) throw new EvalFailure("Judge invocation budget exhausted", 2)
  const saved = await Bun.file(path.join(runDir, "config.json")).json() as Pick<EvalConfig, "only" | "tasksDir" | "skipJudge" | "passThreshold" | "judgeTimeoutMs"> &
    { agent_inputs_hash: string; rubric_hash: string; judge: JudgeInfo | null }
  if (saved.skipJudge !== false || typeof saved.tasksDir !== "string" || !path.isAbsolute(saved.tasksDir) || !saved.judge?.codex_version ||
    saved.passThreshold !== config.passThreshold || saved.judgeTimeoutMs !== config.judgeTimeoutMs ||
    saved.judge.model !== config.judge.model || saved.judge.reasoning !== config.judge.reasoning)
    throw new EvalFailure("PENDING_JUDGE_PINS_CHANGED", 2)
  const tasks = await loadTasks(saved.tasksDir, saved.only)
  const task = tasks.find(task => task.id === result.task_id)
  if (!task || await agentInputsHash(tasks) !== saved.agent_inputs_hash || await rubricHash(tasks) !== saved.rubric_hash ||
    evaluationContractHash({ rubric_hash: saved.rubric_hash, judge: saved.judge, pass_threshold: saved.passThreshold }) !== result.evaluation_contract_hash)
    throw new EvalFailure("PENDING_JUDGE_PINS_CHANGED", 2)
  const artifactDir = path.join(dir, "artifact")
  if (!(await Array.fromAsync(new Bun.Glob("unpacked/Unit_*/Unit.xml").scan(artifactDir))).length) throw new EvalFailure("PENDING_JUDGE_ARTIFACT_MISSING", 2)
  const run = await Bun.file(path.join(dir, "run.json")).json() as AgentRun
  const prompt = await Bun.file(path.join(dir, "prompt.txt")).text()
  return { runDir, dir, result, complete: false as const, saved, task, artifactDir, run, prompt, judgeAttemptsUsed: result.judge_attempts as 0 | 1 }
}

export async function finishPendingJudge(config: EvalConfig, resultFile: string, onRunDirectory?: (directory: string) => Promise<void>) {
  const pending = await readPendingJudge(config, resultFile)
  if (pending.complete) return { code: pending.result.judge_cleanup_unconfirmed ? 1 : 0, runDir: pending.runDir, judgeCleanupConfirmed: !pending.result.judge_cleanup_unconfirmed }
  const result = pending.result
  const controller = new AbortController(), removeSigint = installSigint(controller)
  try {
    await onRunDirectory?.(pending.runDir)
    const judge = await judgeInfo(config, controller.signal)
    if (evaluationContractHash({ rubric_hash: pending.saved.rubric_hash, judge, pass_threshold: config.passThreshold }) !== result.evaluation_contract_hash)
      throw new EvalFailure("PENDING_JUDGE_PINS_CHANGED", 2)
    const previous = path.join(pending.dir, "judge/verdict.json")
    if (await Bun.file(previous).exists()) await cp(previous, path.join(pending.dir, "verdict.prev.json"))
    const judged = await createJudgeGate()({ task: pending.task, run: pending.run, prompt: pending.prompt, artifactDir: pending.artifactDir,
      outDir: path.join(pending.dir, "judge"), signal: controller.signal,
      judge: { ...config.judge, timeoutMs: pending.saved.judgeTimeoutMs, passThreshold: pending.saved.passThreshold }, judgeAttemptsUsed: pending.judgeAttemptsUsed,
      saveJudgeFields: async fields => {
        Object.assign(result, fields)
        await writeLeaseReceipt(resultFile, result)
      } })
    const cleanupUnconfirmed = "cleanupUnconfirmed" in judged && judged.cleanupUnconfirmed
    Object.assign(result, judgedFields(judged), { judge_attempts: Math.max(result.judge_attempts, judged.attempts) }, cleanupUnconfirmed ? {
      environment_cleanup: { status: "failed", evidence: judged.attempts ? `judge-processes-${judged.attempts}/process-cleanup.json` : null,
        error: !judged.ok ? judged.error : null },
    } : {})
    await writeLeaseReceipt(resultFile, result)
    return { code: judged.ok ? 0 : 1, runDir: pending.runDir, judgeCleanupConfirmed: !cleanupUnconfirmed }
  } finally { removeSigint() }
}

export async function rejudge(config: EvalConfig, runId: string, onRunDirectory?: (directory: string) => Promise<void>) {
  const controller = new AbortController()
  const removeSigint = installSigint(controller)
  try {
    const runDir = await requireRejudgeRunDirectory(config.resultsDir, runId)
    const summaryFile = Bun.file(path.join(runDir, "summary.json"))
    await onRunDirectory?.(runDir)
    const prev = (await summaryFile.json()) as RunSummary
    const saved = await Bun.file(path.join(runDir, "config.json")).json().catch(() => undefined) as { tasksDir?: unknown } | undefined
    const tasksDir = config.tasksDirExplicit
      ? config.tasksDir
      : prev.config.tasks_dir ?? (typeof saved?.tasksDir === "string" ? saved.tasksDir : config.tasksDir)
    const tasks = await loadTasks(tasksDir, prev.task_ids)
    await preflight(config, parseArtifactSource("docker", config.loginom), controller.signal)
    const judge = await judgeInfo(config, controller.signal)
    if ((await agentInputsHash(tasks)) !== prev.agent_inputs_hash)
      console.error("Предупреждение: agent_inputs_hash текущих задач отличается от прогона — артефакты созданы под прежними входами")
    await cp(path.join(runDir, "summary.json"), path.join(runDir, "summary.prev.json"))
    const judgeAttempt = createJudgeGate()
    const settings: JudgeSettings = {
      command: config.judge.command,
      model: config.judge.model,
      reasoning: config.judge.reasoning,
      env: config.judge.env,
      systemd: config.judge.systemd,
      timeoutMs: config.judgeTimeoutMs,
      passThreshold: config.passThreshold,
    }
    const rubric = await rubricHash(tasks)
    const evaluationHash = evaluationContractHash({ rubric_hash: rubric, judge, pass_threshold: config.passThreshold })
    const attempts: AttemptResult[] = []
    for (const group of prev.tasks) {
      const task = tasks.find((item) => item.id === group.id)
      for (const attempt of group.attempts) {
        const dir = path.join(runDir, group.id, String(attempt.attempt))
        const artifactDir = path.join(dir, "artifact")
        const units = await Array.fromAsync(new Bun.Glob("unpacked/Unit_*/Unit.xml").scan(artifactDir)).catch(() => [])
        const judgeable = task && units.length > 0 && attempt.status !== "harness_error" && attempt.status !== "infra_error" && attempt.status !== "interrupted"
        if (!judgeable || controller.signal.aborted) {
          // Без артефакта пересчитываем также старый no_artifact по текущей рубрике.
          if (controller.signal.aborted || attempt.status === "harness_error" || attempt.status === "infra_error" || attempt.status === "interrupted" || (attempt.judge_status !== "skipped" && attempt.judge_status !== "no_artifact")) {
            attempts.push(attempt)
            continue
          }
          const updated: AttemptResult = {
            ...attempt,
            evaluation_contract_hash: evaluationHash,
            structural_score: task && task.checklist.every((item) => item.axis !== undefined) && task.checklist.some((item) => item.axis === "structure") ? 0 : null,
            score: 0,
            pass: false,
            judge_status: "no_artifact",
            judge_attempts: 0,
            judge_confidence: null,
            judge_summary: null,
            checklist: null,
            oracle_pass: task?.oracle ? false : null,
            oracle_error: task?.oracle ? "Артефакт и файл результата для oracle отсутствуют" : null,
          }
          await writeLeaseReceipt(path.join(dir, "result.json"), updated)
          attempts.push(updated)
          continue
        }
        const previous = path.join(dir, "judge", "verdict.json")
        if (await Bun.file(previous).exists()) await cp(previous, path.join(dir, "verdict.prev.json"))
        const run = (await Bun.file(path.join(dir, "run.json")).json()) as AgentRun
        const prompt = await Bun.file(path.join(dir, "prompt.txt")).text()
        const judged = await judgeAttempt({
          task,
          run,
          artifactDir,
          prompt,
          outDir: path.join(dir, "judge"),
          judge: settings,
          signal: controller.signal,
        }).catch((error: unknown) => ({ ok: false as const, error: describe(error), attempts: 0 as const }))
        const updated: AttemptResult = { ...attempt, ...judgedFields(judged), evaluation_contract_hash: evaluationHash }
        await writeLeaseReceipt(path.join(dir, "result.json"), updated)
        attempts.push(updated)
      }
    }
    const summary: RunSummary = {
      ...prev,
      finished_at: new Date().toISOString(),
      interrupted: prev.interrupted || controller.signal.aborted,
      judge,
      rubric_hash: rubric,
      config: { ...prev.config, tasks_dir: tasksDir, pass_threshold: config.passThreshold, judge_timeout_ms: config.judgeTimeoutMs },
      metrics: aggregate(attempts, false),
      tasks: prev.tasks.map((group) => {
        const own = attempts.filter((item) => item.task_id === group.id)
        return { id: group.id, rubric_snapshot: rubricSnapshot(tasks.find((task) => task.id === group.id)!), metrics: aggregateTask(own, false), attempts: own }
      }),
    }
    await writeSummary(runDir, summary)
    console.log(renderReport(summary))
    return { code: 0, runDir, judgeCleanupConfirmed: !attempts.some(attempt => attempt.judge_cleanup_unconfirmed) }
  } finally { removeSigint() }
}

export async function requireRejudgeRunDirectory(resultsDir: string, runId: string) {
  const runDir = path.join(resultsDir, runId)
  if (!await Bun.file(path.join(runDir, "summary.json")).exists())
    throw new EvalFailure(`Нет прогона ${runId}: ${runDir}/summary.json не найден`, 2)
  return runDir
}
