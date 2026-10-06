import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { loadTasks, rubricHash } from "./task"
import { parseArtifactSource, unzip } from "./artifact"
import { preflight } from "./preflight"
import { judgeInfo, judgeTask, type JudgeSettings } from "./judge"
import { describe, redact, stamp } from "./run"
import { evalsRoot } from "./config"
import { prepareCalibrationCases } from "./calibration-cases"
import { checkOracle } from "./oracle"

export async function calibrate(config: EvalConfig, corpusDir = path.join(evalsRoot, "calibration")) {
  const tasks = await loadTasks(config.tasksDir, config.only)
  await preflight(config, parseArtifactSource("docker", config.loginom))
  const judge = await judgeInfo(config)
  const runId = `${stamp(new Date())}-calibrate`
  const runDir = path.join(config.resultsDir, runId)
  await mkdir(runDir, { recursive: true })
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2))
  const settings: JudgeSettings = {
    command: config.judge.command,
    model: config.judge.model,
    reasoning: config.judge.reasoning,
    timeoutMs: config.judgeTimeoutMs,
    passThreshold: config.passThreshold,
  }
  const cases = await prepareCalibrationCases(tasks, runDir, corpusDir)
  const rows: {
    task: string; kind: "positive" | "negative" | "near-miss"; reference: string
    score: number | null; failed: string[]; error: string | null
    case_id?: string; expected_failed?: string[]; expected_oracle_pass?: boolean
    oracle_pass?: boolean | null; oracle_error?: string | null; expectations_met?: boolean
  }[] = []
  for (const [index, task] of tasks.entries()) {
    const checklist = task.checklist.filter((item) => !item.requiresRun && (!item.requiresResultFile || !!task.oracle))
    if (!checklist.length) {
      rows.push({
        task: task.id,
        kind: "positive",
        reference: task.id,
        score: null,
        failed: [],
        error: "чеклист пуст после исключения пунктов requires_result_file/requires_run — судья не вызывался",
      })
      continue
    }
    // negative — эталон следующей задачи по кругу: судья обязан заметить подмену.
    const negative = tasks.length > 1 ? tasks[(index + 1) % tasks.length] : undefined
    for (const [kind, reference] of [["positive", task], ["negative", negative]] as const) {
      if (!reference) continue
      const attemptDir = path.join(runDir, task.id, kind)
      const artifactDir = path.join(attemptDir, "artifact")
      await mkdir(path.join(artifactDir, "results"), { recursive: true })
      await cp(path.join(reference.dir, reference.reference), path.join(artifactDir, "package.lgp"))
      if (!(await unzip(path.join(artifactDir, "package.lgp"), path.join(artifactDir, "unpacked")))) {
        rows.push({
          task: task.id,
          kind,
          reference: reference.id,
          score: null,
          failed: [],
          error: `эталон ${reference.id} не распакован`,
        })
        console.error(`[calibrate ${task.id}/${kind}] score=error`)
        continue
      }
      if (kind === "positive" && task.oracle)
        await cp(path.join(task.dir, task.oracle), path.join(artifactDir, "results", "calibration.result.csv"))
      const oracle = kind === "positive" && task.oracle ? await checkOracle(task, artifactDir) : { passed: null, error: null }
      const judged = await judgeTask({
        task,
        artifactDir,
        prompt: task.prompt,
        outDir: path.join(attemptDir, "judge"),
        judge: settings,
        checklist: kind === "negative" ? checklist.filter((item) => !item.requiresResultFile) : checklist,
      }).catch((error: unknown) => ({ ok: false as const, error: describe(error), attempts: 0 as const }))
      rows.push({
        task: task.id,
        kind,
        reference: reference.id,
        oracle_pass: oracle.passed, oracle_error: oracle.error,
        score: judged.ok ? judged.score : null,
        failed: judged.ok ? judged.items.filter((item) => !item.passed).map((item) => item.id) : [],
        error: judged.ok ? null : judged.error,
      })
      console.error(`[calibrate ${task.id}/${kind}] score=${judged.ok ? judged.score : "error"}`)
    }
  }
  for (const entry of cases.prepared) {
    const judged = await judgeTask({
      task: entry.task, artifactDir: entry.artifactDir, prompt: entry.task.prompt,
      outDir: path.join(path.dirname(entry.artifactDir), "judge"), judge: settings,
      checklist: entry.task.checklist.filter((item) => !item.requiresRun),
    }).catch((error: unknown) => ({ ok: false as const, error: describe(error), attempts: 0 as const }))
    const failed = judged.ok ? judged.items.filter((item) => !item.passed).map((item) => item.id) : []
    rows.push({
      task: entry.task.id, kind: "near-miss", reference: entry.task.id,
      case_id: entry.mutation.id, expected_failed: entry.mutation.expected_failed,
      expected_oracle_pass: entry.mutation.expected_oracle_pass,
      oracle_pass: entry.oracle.passed, oracle_error: entry.oracle.error,
      expectations_met: judged.ok && entry.mutation.expected_failed.every((id) => failed.includes(id)) &&
        entry.oracle.passed === entry.mutation.expected_oracle_pass,
      score: judged.ok ? judged.score : null, failed, error: judged.ok ? null : judged.error,
    })
    console.error("[calibrate " + entry.task.id + "/" + entry.mutation.id + "] score=" + (judged.ok ? judged.score : "error"))
  }
  const { positiveMin, negativeMax } = config.calibration
  const warnings = rows.flatMap((row) => {
    if (row.score === null && row.error === "чеклист пуст после исключения пунктов requires_result_file/requires_run — судья не вызывался")
      return [`${row.task}/${row.kind}: ${row.error}`]
    if (row.score === null) return [`${row.task}/${row.kind}: судья не дал вердикт (${row.error})`]
    if (row.kind === "positive" && row.score < positiveMin)
      return [`${row.task}/positive: ${row.score} < ${positiveMin}; непройдены: ${row.failed.join(", ") || "—"}`]
    if (row.kind === "positive" && row.oracle_pass === false)
      return [row.task + "/positive: oracle не пройден (" + row.oracle_error + ")"]
    if (row.kind === "negative" && row.score > negativeMax)
      return [`${row.task}/negative (эталон ${row.reference}): ${row.score} > ${negativeMax} — судья не заметил подмену`]
    if (row.kind === "near-miss" && !row.expectations_met)
      return [row.task + "/" + row.case_id + ": не выполнены ожидания; ожидаемые провалы: " + row.expected_failed?.join(", ") +
        "; фактические: " + row.failed.join(", ") + "; oracle=" + row.oracle_pass + " (ожидание " + row.expected_oracle_pass + ")"]
    return []
  })
  await Bun.write(
    path.join(runDir, "calibration.json"),
    JSON.stringify({ run_id: runId, judge, rubric_hash: await rubricHash(tasks), thresholds: config.calibration, calibration_hash: cases.hash, near_miss_coverage: Object.fromEntries(tasks.map((task) => [task.id, cases.prepared.filter((entry) => entry.task.id === task.id).length])), rows, warnings }, null, 2),
  )
  const report = [
    `# Калибровка судьи ${runId}`,
    "",
    `Судья: ${judge.model}/${judge.reasoning} (${judge.codex_version ?? "?"}). Пороги: positive ≥ ${positiveMin}, negative ≤ ${negativeMax}.`,
    "",
    "| Задача | Вид | Эталон | score | Непройдено |",
    "|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.task} | ${row.kind} | ${row.reference} | ${row.score ?? "—"} | ${row.failed.join(", ") || "—"} |`),
    "",
    warnings.length ? "## Предупреждения" : "## Пороги выполнены",
    "",
    ...warnings.map((warning) => `- ${warning}`),
    "",
  ].join("\n")
  await Bun.write(path.join(runDir, "calibration.md"), report)
  console.log(report)
  return { code: warnings.length ? 1 : 0, runDir }
}
