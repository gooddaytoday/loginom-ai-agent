import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { loadTasks, rubricHash } from "./task"
import { parseArtifactSource, unzip } from "./artifact"
import { preflight } from "./preflight"
import { judgeInfo, judgeTask, type JudgeSettings } from "./judge"
import { redact, stamp } from "./run"

export async function calibrate(config: EvalConfig) {
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
  const rows: { task: string; kind: "positive" | "negative"; reference: string; score: number | null; failed: string[]; error: string | null }[] = []
  for (const [index, task] of tasks.entries()) {
    const checklist = task.checklist.filter((item) => !item.requiresResultFile)
    if (!checklist.length) {
      rows.push({
        task: task.id,
        kind: "positive",
        reference: task.id,
        score: null,
        failed: [],
        error: "checklist пуст",
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
      await unzip(path.join(artifactDir, "package.lgp"), path.join(artifactDir, "unpacked"))
      const judged = await judgeTask({ task, artifactDir, prompt: task.prompt, outDir: path.join(attemptDir, "judge"), judge: settings, checklist })
      rows.push({
        task: task.id,
        kind,
        reference: reference.id,
        score: judged.ok ? judged.score : null,
        failed: judged.ok ? judged.items.filter((item) => !item.passed).map((item) => item.id) : [],
        error: judged.ok ? null : judged.error,
      })
      console.error(`[calibrate ${task.id}/${kind}] score=${judged.ok ? judged.score : "error"}`)
    }
  }
  const { positiveMin, negativeMax } = config.calibration
  const warnings = rows.flatMap((row) => {
    if (row.score === null) return [`${row.task}/${row.kind}: судья не дал вердикт (${row.error})`]
    if (row.kind === "positive" && row.score < positiveMin)
      return [`${row.task}/positive: ${row.score} < ${positiveMin}; непройдены: ${row.failed.join(", ") || "—"}`]
    if (row.kind === "negative" && row.score > negativeMax)
      return [`${row.task}/negative (эталон ${row.reference}): ${row.score} > ${negativeMax} — судья не заметил подмену`]
    return []
  })
  await Bun.write(
    path.join(runDir, "calibration.json"),
    JSON.stringify({ run_id: runId, judge, rubric_hash: await rubricHash(tasks), thresholds: config.calibration, rows, warnings }, null, 2),
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
  return { code: 0, runDir }
}
