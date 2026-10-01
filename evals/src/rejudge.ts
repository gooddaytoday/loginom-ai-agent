import path from "node:path"
import { cp } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { agentInputsHash, loadTasks, rubricHash } from "./task"
import type { AgentRun } from "./cli"
import { parseArtifactSource } from "./artifact"
import { preflight } from "./preflight"
import { judgeInfo, judgeTask, judgedFields, type JudgeSettings } from "./judge"
import { aggregate, aggregateTask, renderReport, writeSummary, type AttemptResult, type RunSummary } from "./report"
import { describe, installSigint } from "./run"

export async function rejudge(config: EvalConfig, runId: string) {
  const runDir = path.join(config.resultsDir, runId)
  const summaryFile = Bun.file(path.join(runDir, "summary.json"))
  if (!(await summaryFile.exists())) throw new EvalFailure(`Нет прогона ${runId}: ${runDir}/summary.json не найден`, 2)
  const prev = (await summaryFile.json()) as RunSummary
  const saved = await Bun.file(path.join(runDir, "config.json")).json().catch(() => undefined) as { tasksDir?: unknown } | undefined
  const tasksDir = config.tasksDirExplicit
    ? config.tasksDir
    : prev.config.tasks_dir ?? (typeof saved?.tasksDir === "string" ? saved.tasksDir : config.tasksDir)
  const tasks = await loadTasks(tasksDir, prev.task_ids)
  await preflight(config, parseArtifactSource("docker", config.loginom))
  const judge = await judgeInfo(config)
  if ((await agentInputsHash(tasks)) !== prev.agent_inputs_hash)
    console.error("Предупреждение: agent_inputs_hash текущих задач отличается от прогона — артефакты созданы под прежними входами")
  await cp(path.join(runDir, "summary.json"), path.join(runDir, "summary.prev.json"))
  const controller = new AbortController()
  installSigint(controller)
  const settings: JudgeSettings = {
    command: config.judge.command,
    model: config.judge.model,
    reasoning: config.judge.reasoning,
    timeoutMs: config.judgeTimeoutMs,
    passThreshold: config.passThreshold,
  }
  const attempts: AttemptResult[] = []
  for (const group of prev.tasks) {
    const task = tasks.find((item) => item.id === group.id)
    for (const attempt of group.attempts) {
      const dir = path.join(runDir, group.id, String(attempt.attempt))
      const artifactDir = path.join(dir, "artifact")
      const units = await Array.fromAsync(new Bun.Glob("unpacked/Unit_*/Unit.xml").scan(artifactDir)).catch(() => [])
      const judgeable = task && units.length > 0 && attempt.status !== "harness_error" && attempt.status !== "infra_error" && attempt.status !== "interrupted"
      if (!judgeable || controller.signal.aborted) {
        // Dry-run/--skip-judge оставляют score=null; при --judge-only нет артефакта → те же поля, что у живого прогона.
        if (controller.signal.aborted || attempt.status === "harness_error" || attempt.status === "infra_error" || attempt.status === "interrupted" || attempt.judge_status !== "skipped") {
          attempts.push(attempt)
          continue
        }
        const updated: AttemptResult = {
          ...attempt,
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
        await Bun.write(path.join(dir, "result.json"), JSON.stringify(updated, null, 2))
        attempts.push(updated)
        continue
      }
      const previous = path.join(dir, "judge", "verdict.json")
      if (await Bun.file(previous).exists()) await cp(previous, path.join(dir, "verdict.prev.json"))
      const run = (await Bun.file(path.join(dir, "run.json")).json()) as AgentRun
      const prompt = await Bun.file(path.join(dir, "prompt.txt")).text()
      const judged = await judgeTask({
        task,
        run,
        artifactDir,
        prompt,
        outDir: path.join(dir, "judge"),
        judge: settings,
        signal: controller.signal,
      }).catch((error: unknown) => ({ ok: false as const, error: describe(error), attempts: 0 as const }))
      const updated: AttemptResult = { ...attempt, ...judgedFields(judged) }
      await Bun.write(path.join(dir, "result.json"), JSON.stringify(updated, null, 2))
      attempts.push(updated)
    }
  }
  const summary: RunSummary = {
    ...prev,
    finished_at: new Date().toISOString(),
    interrupted: prev.interrupted || controller.signal.aborted,
    judge,
    rubric_hash: await rubricHash(tasks),
    metrics: aggregate(attempts, false),
    tasks: prev.tasks.map((group) => {
      const own = attempts.filter((item) => item.task_id === group.id)
      return { id: group.id, metrics: aggregateTask(own, false), attempts: own }
    }),
  }
  await writeSummary(runDir, summary)
  console.log(renderReport(summary))
  return { code: 0, runDir }
}
