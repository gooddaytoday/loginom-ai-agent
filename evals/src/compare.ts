import path from "node:path"
import { evalsRoot } from "./config"
import { EvalFailure } from "./fail"
import type { RunSummary } from "./report"

const arrow = (delta: number) => (delta > 0 ? "▲" : delta < 0 ? "▼" : "=")
const num = (x: number | null, y: number | null, digits = 1) =>
  x === null || y === null ? "—" : `${x.toFixed(digits)} → ${y.toFixed(digits)} ${arrow(y - x)}`
const pct = (x: number | null, y: number | null) =>
  x === null || y === null ? "—" : `${(x * 100).toFixed(1)}% → ${(y * 100).toFixed(1)}% ${arrow(y - x)}`

export function compare(a: RunSummary, b: RunSummary) {
  const identity: [string, unknown, unknown][] = [
    ["agent.model", a.agent.model, b.agent.model],
    ["agent_inputs_hash", a.agent_inputs_hash, b.agent_inputs_hash],
    ["rubric_hash", a.rubric_hash, b.rubric_hash],
    ["judge.model", a.judge?.model ?? null, b.judge?.model ?? null],
    ["judge.reasoning", a.judge?.reasoning ?? null, b.judge?.reasoning ?? null],
    ["judge.prompt_sha256", a.judge?.prompt_sha256 ?? null, b.judge?.prompt_sha256 ?? null],
    ["config.pass_threshold", a.config.pass_threshold, b.config.pass_threshold],
  ]
  const environment: [string, unknown, unknown][] = [
    ["dock.skill_revision", a.dock.skill_revision, b.dock.skill_revision],
    ["dock.action_manifest_sha256", a.dock.action_manifest_sha256.join(","), b.dock.action_manifest_sha256.join(",")],
    ["loginom.image_digest", a.loginom.image_digest, b.loginom.image_digest],
  ]
  const mismatches = identity.filter(([, x, y]) => x !== y)
  const changed = environment.filter(([, x, y]) => x !== y)
  const judgeless = a.judge === null && b.judge === null
  const partial = [a, b].filter((run) => run.interrupted || run.stopped_reason)
  const lines = [
    ...(mismatches.length
      ? [`**Прогоны несравнимы:** различаются ${mismatches.map(([name, x, y]) => `${name} (${String(x)} → ${String(y)})`).join("; ")}`, ""]
      : []),
    `# Сравнение ${a.run_id}${a.label ? ` (${a.label})` : ""} → ${b.run_id}${b.label ? ` (${b.label})` : ""}`,
    "",
    `Повторов: ${a.config.repeat} → ${b.config.repeat}. Попыток: ${a.metrics.total} → ${b.metrics.total}.`,
    ...(partial.length ? [`**неполное покрытие:** ${partial.map((run) => `${run.run_id} (${run.interrupted ? "прерван" : run.stopped_reason})`).join(", ")} — метрики по разному числу попыток.`] : []),
    ...(changed.length ? [`**изменилось окружение:** ${changed.map(([name, x, y]) => `${name} (${String(x)} → ${String(y)})`).join("; ")}. Сравнение допустимо, но часть дельты может объясняться Dock/Loginom.`] : []),
    ...(judgeless ? ["Оба прогона без судьи: сравнение только по completion_rate."] : []),
    "",
    "## Метрики",
    "",
    "| Метрика | a → b |",
    "|---|---|",
    `| completion_rate | ${pct(a.metrics.completion_rate, b.metrics.completion_rate)} |`,
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
    ...[...new Set([...a.task_ids, ...b.task_ids])].map((id) => {
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
