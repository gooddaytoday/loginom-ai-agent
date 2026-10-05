import { rename } from "node:fs/promises"
import path from "node:path"

export type Status = "completed" | "failed" | "timeout" | "interrupted" | "no_artifact" | "harness_error" | "infra_error"
export type JudgeStatus = "scored" | "no_artifact" | "skipped" | "error"
export type FailureKind = "permission" | "recovery" | "cancelled" | "provider" | "tool" | "other"

export type EnvironmentCleanup = {
  status: "confirmed" | "failed" | "not_run"
  evidence: string | null
  error: string | null
}

export function statusFor(
  run: {
    exitCode: number | null; timedOut: boolean; interrupted: boolean
    sessionId?: string; tokens?: { input: number; output: number; reasoning: number }
    counters?: { toolCalls: number }; stderrHead?: string
  },
  hasArtifact: boolean,
): { status: Status; stop: boolean } {
  if (run.interrupted) return { status: "interrupted", stop: true }
  if (run.timedOut) return { status: "timeout", stop: false }
  if (run.exitCode === 0) return { status: hasArtifact ? "completed" : "no_artifact", stop: false }
  if (!run.sessionId && run.counters?.toolCalls === 0 && run.tokens?.input === 0 && run.tokens.output === 0 && run.tokens.reasoning === 0 &&
    /\b(?:LOGINOM_HOST_(?:TIMEOUT|CLOSED|NOT_READY|REQUEST_FAILED)|LOGINOM_CONNECTION_NOT_READY|PROFILE_BUSY)\b/.test(run.stderrHead ?? ""))
    return { status: "infra_error", stop: false }
  // Коды 2/3 — конфигурация или профиль: следующие попытки получили бы то же самое.
  if (run.exitCode === 2 || run.exitCode === 3) return { status: "harness_error", stop: true }
  return { status: "failed", stop: false }
}

export type AttemptResult = {
  task_id: string
  attempt: number
  status: Status
  exit_code: number | null
  timed_out: boolean
  interrupted: boolean
  failure_kind: FailureKind | null
  structural_score?: number | null
  evaluation_contract_hash?: string
  score: number | null
  pass: boolean | null
  oracle_pass?: boolean | null
  oracle_error?: string | null
  judge_status: JudgeStatus
  judge_attempts: number
  judge_confidence: string | null
  judge_summary: string | null
  checklist: { id: string; passed: boolean; evidence: string }[] | null
  duration_ms: number
  cost: number
  tokens: { input: number; output: number; reasoning: number }
  counters: { toolCalls: number; loginomToolCalls: number; toolErrors: number; memoryToolCalls: number }
  package_path: string | null
  artifact_origin: string | null
  artifact_ambiguous: string[]
  cleanup_error: string | null
  environment_cleanup?: EnvironmentCleanup
  action_manifest_sha256: string | null
  skill_revision?: string | null
  session_id: string | null
  profile_recovered: boolean
  errors: string[]
  harness_error: string | null
  stderr_head: string | null
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits
const mean = (values: number[]) =>
  values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 1) : null
const scoresOf = (list: AttemptResult[]) => list.flatMap((item) => (typeof item.score === "number" ? [item.score] : []))

export function aggregate(attempts: AttemptResult[], skipJudge: boolean) {
  const spent = attempts.filter((item) => item.status !== "interrupted")
  const counted = spent.filter((item) => item.status !== "harness_error" && item.status !== "infra_error")
  const total = counted.length
  const completed = counted.filter((item) => item.status === "completed")
  const scored = counted.filter((item) => typeof item.score === "number")
  const evaluated = counted.filter((item) => item.pass !== null)
  const oracleChecked = counted.filter((item) => typeof item.oracle_pass === "boolean")
  const sum = (pick: (item: AttemptResult) => number) => spent.reduce((acc, item) => acc + pick(item), 0)
  return {
    total,
    environment_cleanup_error_count: attempts.filter((item) => item.environment_cleanup?.status === "failed").length,
    environment_cleanup_checked_count: attempts.filter((item) => ["failed", "confirmed"].includes(item.environment_cleanup?.status ?? "")).length,
    completed: completed.length,
    completion_rate: total ? round(completed.length / total, 3) : null,
    mean_score: skipJudge ? null : mean(scoresOf(scored)),
    mean_score_completed: skipJudge ? null : mean(scoresOf(completed)),
    pass_rate: skipJudge || !evaluated.length ? null : round(evaluated.filter((item) => item.pass === true).length / evaluated.length, 3),
    pass_evaluated_count: evaluated.length,
    oracle_checked_count: oracleChecked.length,
    oracle_pass_rate: oracleChecked.length ? round(oracleChecked.filter((item) => item.oracle_pass).length / oracleChecked.length, 3) : null,
    scored_count: scored.length,
    excluded_count: total - scored.length,
    harness_error_count: spent.filter((item) => item.status === "harness_error").length,
    infra_error_count: spent.filter((item) => item.status === "infra_error").length,
    judge_error_count: counted.filter((item) => item.judge_status === "error").length,
    failure_kinds: counted.reduce<Record<string, number>>(
      (acc, item) => (item.failure_kind ? { ...acc, [item.failure_kind]: (acc[item.failure_kind] ?? 0) + 1 } : acc),
      {},
    ),
    tool_calls: sum((item) => item.counters.toolCalls),
    tool_errors: sum((item) => item.counters.toolErrors),
    memory_tool_calls: sum((item) => item.counters.memoryToolCalls),
    total_cost: round(sum((item) => item.cost), 4),
    total_duration_ms: sum((item) => item.duration_ms),
  }
}
export type Metrics = ReturnType<typeof aggregate>

export function aggregateTask(attempts: AttemptResult[], skipJudge: boolean) {
  const base = aggregate(attempts, skipJudge)
  const scores = scoresOf(attempts.filter((item) => item.status !== "interrupted" && item.status !== "harness_error" && item.status !== "infra_error"))
  return {
    attempts: base.total,
    completed: base.completed,
    completion_rate: base.completion_rate,
    mean_score: base.mean_score,
    min_score: scores.length ? Math.min(...scores) : null,
    max_score: scores.length ? Math.max(...scores) : null,
    pass_rate: base.pass_rate,
    oracle_checked_count: base.oracle_checked_count,
    oracle_pass_rate: base.oracle_pass_rate,
  }
}
export type TaskMetrics = ReturnType<typeof aggregateTask>

export type RubricSnapshot = {
  version: 1
  checklist: { id: string; weight: number; required: boolean; requires_result_file: boolean; requires_run: boolean; axis?: "structure" | "result" | "report" }[]
  oracle_applicable: boolean
  oracle_tolerance: number
}
export type RunSummary = {
  run_id: string
  label: string | null
  started_at: string
  finished_at: string
  interrupted: boolean
  interrupted_cleanup: { recovered: boolean } | null
  stopped_reason: string | null
  agent: {
    cli_mode: string; git_sha: string | null; dirty: boolean | null; model: string
    variant?: string; cli_version?: string | null; binary_path?: string | null; binary_sha256?: string | null
    source_commit?: string | null; source_dirty?: boolean | null; source_tree_sha256?: string | null
  }
  harness?: { git_sha: string | null; dirty: boolean | null }
  judge: { backend: "codex"; codex_version: string | null; model: string; reasoning: string; prompt_sha256: string; schema_sha256?: string } | null
  dock: { skill_revision: string | null; skill_revisions?: string[]; action_manifest_sha256: string[] }
  loginom: { image_digest: string | null; container: string | null; storage_dir: string | null }
  agent_inputs_hash: string
  rubric_hash: string
  task_ids: string[]
  config: {
    repeat: number; timeout_ms: number; judge_timeout_ms: number; pass_threshold: number; keep_storage: boolean
    tasks_dir?: string; task_timeout_ms?: Record<string, number>
  }
  metrics: Metrics
  tasks: { id: string; rubric_snapshot?: RubricSnapshot; metrics: TaskMetrics; attempts: AttemptResult[] }[]
  storage_leftovers: string[] | null
}

export async function writeSummary(runDir: string, summary: RunSummary) {
  await Bun.write(path.join(runDir, "summary.json.tmp"), JSON.stringify(summary, null, 2))
  await rename(path.join(runDir, "summary.json.tmp"), path.join(runDir, "summary.json"))
  await Bun.write(path.join(runDir, "report.md.tmp"), renderReport(summary))
  await rename(path.join(runDir, "report.md.tmp"), path.join(runDir, "report.md"))
}

const fmt = (value: number | null, digits = 1) => (value === null ? "—" : value.toFixed(digits))
const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`)
const cell = (text: string) => text.replaceAll("|", "\\|").replace(/(?:\r?\n)+/g, " ")

export function renderReport(summary: RunSummary) {
  const m = summary.metrics
  const head = [
    `# Eval ${summary.run_id}${summary.label ? ` (${summary.label})` : ""}`,
    "",
    `Агент: ${summary.agent.model} · ${summary.agent.cli_mode} · CLI ${summary.agent.cli_version ?? "неизвестен"} · variant ${summary.agent.variant ?? "неизвестен"} · source ${summary.agent.source_commit ?? (summary.agent.cli_mode === "source" ? summary.agent.git_sha : null) ?? "неизвестен"}${summary.agent.source_dirty ? "-dirty" : ""} · binary sha256 ${summary.agent.binary_sha256 ?? "—"}. Судья: ${summary.judge ? `${summary.judge.model}/${summary.judge.reasoning}` : "пропущен"}. Повторов: ${summary.config.repeat}.`,
    summary.interrupted ? "**Прогон прерван (Ctrl+C): метрики по завершённым попыткам.**" : "",
    summary.stopped_reason ? `**Прогон остановлен: ${cell(summary.stopped_reason)}**` : "",
    "",
    "## Метрики",
    "",
    `- completion_rate: ${pct(m.completion_rate)} (${m.completed}/${m.total})`,
    `- mean_score: ${fmt(m.mean_score)} (scored ${m.scored_count}, excluded ${m.excluded_count})`,
    `- mean_score_completed: ${fmt(m.mean_score_completed)}`,
    `- pass_rate: ${pct(m.pass_rate)} (оценено ${m.pass_evaluated_count ?? m.scored_count})`,
    `- oracle_pass_rate: ${pct(m.oracle_pass_rate ?? null)} (проверено ${m.oracle_checked_count ?? 0})`,
    `- infra_error: ${m.infra_error_count ?? 0}, harness_error: ${m.harness_error_count ?? 0}, judge_error: ${m.judge_error_count ?? 0}`,
    `- environment_cleanup: ошибок ${m.environment_cleanup_error_count ?? 0}, проверено ${m.environment_cleanup_checked_count ?? 0}`,
    `- failure_kinds: ${Object.entries(m.failure_kinds).map(([kind, count]) => `${kind}=${count}`).join(", ") || "—"}`,
    `- tool_calls: ${m.tool_calls}, tool_errors: ${m.tool_errors}, memory_tool_calls: ${m.memory_tool_calls}${m.memory_tool_calls > 0 ? " **(агент писал в память Dock)**" : ""}`,
    `- total_cost: ${m.total_cost}, total_duration: ${Math.round(m.total_duration_ms / 60000)} мин`,
    "",
    "## Задачи",
    "",
    "| Задача | completed/attempts | mean | min–max | pass_rate |",
    "|---|---|---|---|---|",
    ...summary.tasks.map(
      (task) =>
        `| ${task.id} | ${task.metrics.completed}/${task.metrics.attempts} | ${fmt(task.metrics.mean_score)} | ${fmt(task.metrics.min_score, 0)}–${fmt(task.metrics.max_score, 0)} | ${pct(task.metrics.pass_rate)} |`,
    ),
    "",
    "## Попытки",
    "",
    "| Задача | # | Статус | Код | failure_kind | score | pass | oracle | Время | Стоимость | Судья | Cleanup |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...summary.tasks.flatMap((task) =>
      task.attempts.map(
        (item) =>
          `| ${task.id} | ${item.attempt} | ${item.status} | ${item.exit_code ?? "—"} | ${item.failure_kind ?? "—"} | ${item.score ?? "—"} | ${item.pass === null ? "—" : item.pass ? "✓" : "✗"} | ${item.oracle_pass === undefined || item.oracle_pass === null ? "—" : item.oracle_pass ? "✓" : `✗ ${cell(item.oracle_error ?? "")}`} | ${Math.round(item.duration_ms / 1000)}s | ${item.cost.toFixed(4)} | ${cell(item.judge_summary ?? item.judge_status)} | ${item.environment_cleanup?.status === "confirmed" ? "confirmed" : item.environment_cleanup?.status === "failed" ? "failed" : "не проверялось"} |`,
      ),
    ),
  ]
  const failures = summary.tasks.flatMap((task) =>
    task.attempts
      .filter((item) => item.status !== "completed" || item.environment_cleanup?.status === "failed")
      .map((item) => {
        const names = [...item.errors.map(cell), item.harness_error ? cell(item.harness_error) : ""].filter(Boolean).join(", ") || "без событий error"
        const stderr = (item.stderr_head ?? "").split(/\r?\n/).find((line) => line.trim())?.slice(0, 200)
        return `- ${task.id}#${item.attempt}: ${item.status}${item.failure_kind ? ` (${item.failure_kind})` : ""} — ${names}${stderr ? ` — stderr: ${cell(stderr)}` : ""}${item.environment_cleanup?.status === "failed" ? ` — cleanup failed — ${cell(item.environment_cleanup.error ?? "unconfirmed")}` : ""}`
      }),
  )
  const leftovers =
    summary.storage_leftovers === null
      ? ["", "Остатки в хранилище: не удалось получить листинг"]
      : summary.storage_leftovers.length
        ? [
            "",
            "## Остатки в хранилище",
            "",
            ...summary.storage_leftovers.map((name) => `- ${name}`),
            ...(summary.loginom.container && summary.loginom.storage_dir
              ? [
                  "",
                  "```bash",
                  `docker exec ${summary.loginom.container} sh -c 'rm -f ${summary.loginom.storage_dir}/eval-${summary.run_id}-*'`,
                  "```",
                ]
              : []),
          ]
        : []
  return [...head, "", "## Отказы", "", ...(failures.length ? failures : ["— нет"]), ...leftovers, ""].join("\n")
}
