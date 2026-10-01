import path from "node:path"
import { evalsRoot } from "./config"
import { EvalFailure } from "./fail"
import type { RunSummary } from "./report"
import { aggregate } from "./report"

const delta = (value: number, digits: number) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`
const num = (x: number | null, y: number | null, digits = 1) =>
  x === null || y === null ? "—" : `${x.toFixed(digits)} → ${y.toFixed(digits)} (Δ ${delta(y - x, digits)})`
const pct = (x: number | null, y: number | null) =>
  x === null || y === null ? "—" : `${(x * 100).toFixed(1)}% → ${(y * 100).toFixed(1)}% (Δ ${delta((y - x) * 100, 1)} п.п.)`
const timeouts = (limits?: Record<string, number>) =>
  limits === undefined ? null : JSON.stringify(Object.entries(limits).sort(([x], [y]) => x.localeCompare(y)))

export function compare(a: RunSummary, b: RunSummary) {
  const identity: [string, unknown, unknown][] = [
    ["agent.model", a.agent.model, b.agent.model],
    ["agent.variant", a.agent.variant ?? null, b.agent.variant ?? null],
    ["agent_inputs_hash", a.agent_inputs_hash, b.agent_inputs_hash],
    ["rubric_hash", a.rubric_hash, b.rubric_hash],
    ["judge.model", a.judge?.model ?? null, b.judge?.model ?? null],
    ["judge.reasoning", a.judge?.reasoning ?? null, b.judge?.reasoning ?? null],
    ["judge.prompt_sha256", a.judge?.prompt_sha256 ?? null, b.judge?.prompt_sha256 ?? null],
    ["judge.schema_sha256", a.judge?.schema_sha256 ?? null, b.judge?.schema_sha256 ?? null],
    ["config.pass_threshold", a.config.pass_threshold, b.config.pass_threshold],
    ["config.task_timeout_ms", timeouts(a.config.task_timeout_ms), timeouts(b.config.task_timeout_ms)],
  ]
  const environment: [string, unknown, unknown][] = [
    ["dock.skill_revision", a.dock.skill_revision, b.dock.skill_revision],
    ["dock.skill_revisions", a.dock.skill_revisions ? [...a.dock.skill_revisions].sort().join(",") : null, b.dock.skill_revisions ? [...b.dock.skill_revisions].sort().join(",") : null],
    ["dock.action_manifest_sha256", [...a.dock.action_manifest_sha256].sort().join(","), [...b.dock.action_manifest_sha256].sort().join(",")],
    ["loginom.image_digest", a.loginom.image_digest, b.loginom.image_digest],
  ]
  const mismatches = identity.filter(([, x, y]) => x !== y)
  const changed = environment.filter(([, x, y]) => x !== y)
  const judgeless = a.judge === null && b.judge === null
  const partial = [a, b].filter((run) => run.interrupted || run.stopped_reason)
  const taskIds = [...new Set([...a.task_ids, ...b.task_ids])]
  const coverage = taskIds.flatMap((id) => {
    const first = aggregate(a.tasks.find((task) => task.id === id)?.attempts ?? [], a.judge === null)
    const second = aggregate(b.tasks.find((task) => task.id === id)?.attempts ?? [], b.judge === null)
    return first.total !== second.total || first.pass_evaluated_count !== second.pass_evaluated_count
      ? [`${id}: попыток ${first.total} → ${second.total}, оценено ${first.pass_evaluated_count} → ${second.pass_evaluated_count}`]
      : []
  })
  const uneven = [a, b].flatMap((run) => {
    const counts = run.task_ids.map((id) => ({ id, total: aggregate(run.tasks.find((task) => task.id === id)?.attempts ?? [], run.judge === null).total }))
    return new Set(counts.map((task) => task.total)).size > 1
      ? [`**неполное покрытие внутри прогона ${run.run_id}:** ${counts.map((task) => `${task.id}=${task.total}`).join(", ")}. Задачи имеют разный вес в общем среднем.`]
      : []
  })
  const lines = [
    ...(mismatches.length
      ? [`**Прогоны несравнимы:** различаются ${mismatches.map(([name, x, y]) => `${name} (${String(x)} → ${String(y)})`).join("; ")}`, ""]
      : []),
    `# Сравнение ${a.run_id}${a.label ? ` (${a.label})` : ""} → ${b.run_id}${b.label ? ` (${b.label})` : ""}`,
    "",
    `Агент A → B: ${[a, b].map((run) => `CLI ${run.agent.cli_version ?? "неизвестен"}, source ${run.agent.source_commit ?? (run.agent.cli_mode === "source" ? run.agent.git_sha : null) ?? "неизвестен"}${run.agent.source_dirty ? "-dirty" : ""}, binary ${run.agent.binary_sha256 ?? "—"}, variant ${run.agent.variant ?? "неизвестен"}`).join(" → ")}.`,
    `Повторов: ${a.config.repeat} → ${b.config.repeat}. Попыток: ${a.metrics.total} → ${b.metrics.total}.`,
    "Показаны наблюдаемые дельты. Статистический вердикт «лучше/хуже» не вычисляется; разброс и число попыток нужно учитывать при выводах.",
    ...(partial.length ? [`**неполное покрытие:** ${partial.map((run) => `${run.run_id} (${run.interrupted ? "прерван" : run.stopped_reason})`).join(", ")} — метрики по разному числу попыток.`] : []),
    ...(coverage.length ? [`**неполное покрытие:** ${coverage.join("; ")}. Общие средние зависят от числа попыток каждой задачи.`] : []),
    ...uneven,
    ...(changed.length ? [`**изменилось окружение:** ${changed.map(([name, x, y]) => `${name} (${String(x)} → ${String(y)})`).join("; ")}. Сравнение допустимо, но часть дельты может объясняться Dock/Loginom.`] : []),
    ...(judgeless ? ["Оба прогона без судьи: сравнение только по completion_rate."] : []),
    "",
    "## Метрики",
    "",
    "| Метрика | a → b |",
    "|---|---|",
    `| completion_rate | ${pct(a.metrics.completion_rate, b.metrics.completion_rate)} |`,
    `| oracle_pass_rate | ${pct(a.metrics.oracle_pass_rate ?? null, b.metrics.oracle_pass_rate ?? null)} |`,
    `| oracle_checked_count | ${num(a.metrics.oracle_checked_count ?? null, b.metrics.oracle_checked_count ?? null, 0)} |`,
    ...(judgeless
      ? []
      : [
          `| mean_score | ${num(a.metrics.mean_score, b.metrics.mean_score)} |`,
          `| mean_score_completed | ${num(a.metrics.mean_score_completed, b.metrics.mean_score_completed)} |`,
          `| pass_rate | ${pct(a.metrics.pass_rate, b.metrics.pass_rate)} |`,
        ]),
    `| tool_errors | ${num(a.metrics.tool_errors, b.metrics.tool_errors, 0)} |`,
    `| total_cost | ${num(a.metrics.total_cost, b.metrics.total_cost, 4)} |`,
    "",
    "## Задачи",
    "",
    "| Задача | completion a → b | mean_score a → b | разброс a | разброс b |",
    "|---|---|---|---|---|",
    ...taskIds.map((id) => {
      const x = a.tasks.find((task) => task.id === id)?.metrics
      const y = b.tasks.find((task) => task.id === id)?.metrics
      const spread = (m?: RunSummary["tasks"][number]["metrics"]) =>
        m && m.min_score !== null && m.max_score !== null ? `${m.min_score}–${m.max_score}` : "—"
      return `| ${id} | ${pct(x?.completion_rate ?? null, y?.completion_rate ?? null)} | ${num(x?.mean_score ?? null, y?.mean_score ?? null)} | ${spread(x)} | ${spread(y)} |`
    }),
    "",
  ]
  return lines.join("\n")
}

if (import.meta.main) {
  const [first, second] = Bun.argv.slice(2)
  if (!first || !second) {
    console.error("Использование: bun run src/compare.ts <run-a> <run-b>")
    process.exit(2)
  }
  const read = async (id: string) => {
    const file = Bun.file(path.join(evalsRoot, "results", id, "summary.json"))
    if (!(await file.exists())) throw new EvalFailure(`Нет summary.json для прогона ${id}`, 2)
    return (await file.json()) as RunSummary
  }
  Promise.all([read(first), read(second)])
    .then(async ([a, b]) => {
      const text = compare(a, b)
      await Bun.write(path.join(evalsRoot, "results", `compare-${first}-vs-${second}.md`), text)
      console.log(text)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(error instanceof EvalFailure ? error.exitCode : 1)
    })
}
