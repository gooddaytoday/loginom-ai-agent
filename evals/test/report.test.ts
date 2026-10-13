import { expect, test } from "bun:test"
import { mkdtemp, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { aggregate, aggregateTask, renderReport, statusFor, writeSummary, type AttemptResult, type RunSummary } from "../src/report"

test("statusFor: ошибка изоляции останавливает запуск даже при exit 1 или timeout", () => {
  const run = { exitCode: 1, timedOut: false, interrupted: false, sandboxError: "SANDBOX_EXECUTION_FAILED" }
  expect(statusFor(run, false)).toEqual({ status: "harness_error", stop: true })
  expect(statusFor({ ...run, timedOut: true }, false)).toEqual({ status: "harness_error", stop: true })
  expect(statusFor({ ...run, sandboxError: null }, false)).toEqual({ status: "failed", stop: false })
})

test("statusFor: таблица кодов выхода и приоритет timed_out/interrupted", () => {
  const run = (exitCode: number | null, extra: Partial<{ timedOut: boolean; interrupted: boolean }> = {}) => ({
    exitCode,
    timedOut: false,
    interrupted: false,
    ...extra,
  })
  expect(statusFor(run(0), true)).toEqual({ status: "completed", stop: false })
  expect(statusFor(run(0), false)).toEqual({ status: "no_artifact", stop: false })
  expect(statusFor(run(1), false)).toEqual({ status: "failed", stop: false })
  expect(statusFor(run(4), true)).toEqual({ status: "failed", stop: false })
  expect(statusFor(run(130), false)).toEqual({ status: "failed", stop: false })
  expect(statusFor(run(2), false)).toEqual({ status: "harness_error", stop: true })
  expect(statusFor(run(3), false)).toEqual({ status: "harness_error", stop: true })
  expect(statusFor(run(130, { timedOut: true }), true)).toEqual({ status: "timeout", stop: false })
  expect(statusFor(run(0, { interrupted: true }), true)).toEqual({ status: "interrupted", stop: true })
  expect(statusFor(run(null), false)).toEqual({ status: "failed", stop: false })
})

test("statusFor: известный сбой старта до сессии отделён от провала начавшего работу агента", () => {
  const startup = {
    exitCode: 1, timedOut: false, interrupted: false, sessionId: undefined,
    tokens: { input: 0, output: 0, reasoning: 0 }, counters: { toolCalls: 0 }, stderrHead: "LOGINOM_HOST_TIMEOUT",
  }
  expect(statusFor(startup, false)).toEqual({ status: "infra_error", stop: false })
  expect(statusFor({ ...startup, sessionId: "session" }, false)).toEqual({ status: "failed", stop: false })
  expect(statusFor({ ...startup, stderrHead: "unknown failure" }, false)).toEqual({ status: "failed", stop: false })
  expect(statusFor({ ...startup, counters: { toolCalls: 1 } }, false)).toEqual({ status: "failed", stop: false })
})

const attempt = (over: Partial<AttemptResult>): AttemptResult => ({
  task_id: "t",
  attempt: 1,
  status: "completed",
  exit_code: 0,
  timed_out: false,
  interrupted: false,
  failure_kind: null,
  score: 100,
  pass: true,
  judge_status: "scored",
  judge_attempts: 1,
  judge_confidence: "high",
  judge_summary: null,
  checklist: null,
  duration_ms: 1000,
  cost: 0.01,
  tokens: { input: 1, output: 1, reasoning: 0 },
  counters: { toolCalls: 3, loginomToolCalls: 3, toolErrors: 0, memoryToolCalls: 0 },
  package_path: null,
  artifact_origin: null,
  artifact_ambiguous: [],
  cleanup_error: null,
  action_manifest_sha256: null,
  session_id: null,
  profile_recovered: false,
  errors: [],
  harness_error: null,
  stderr_head: null,
  ...over,
})

test("aggregate: no_artifact = 0, null исключается, interrupted не считается, failure_kinds и суммы", () => {
  const metrics = aggregate(
    [
      attempt({ score: 100, pass: true }),
      attempt({ status: "no_artifact", score: 0, pass: false, judge_status: "no_artifact" }),
      attempt({ status: "failed", failure_kind: "tool", score: null, pass: null, judge_status: "error" }),
      attempt({ status: "interrupted", score: null, pass: null, judge_status: "skipped" }),
    ],
    false,
  )
  expect(metrics.total).toBe(3)
  expect(metrics.completed).toBe(1)
  expect(metrics.completion_rate).toBeCloseTo(0.333, 3)
  expect(metrics.mean_score).toBe(50)
  expect(metrics.mean_score_completed).toBe(100)
  expect(metrics.pass_rate).toBe(0.5)
  expect(metrics.scored_count).toBe(2)
  expect(metrics.excluded_count).toBe(1)
  expect(metrics.failure_kinds).toEqual({ tool: 1 })
  expect(metrics.tool_calls).toBe(9)
  expect(metrics.total_cost).toBeCloseTo(0.03)
})

test("aggregate: --skip-judge обнуляет метрики судьи, но не completion_rate", () => {
  const metrics = aggregate([attempt({ score: null, pass: null, judge_status: "skipped" })], true)
  expect(metrics.completion_rate).toBe(1)
  expect(metrics.mean_score).toBeNull()
  expect(metrics.pass_rate).toBeNull()
})

test("aggregate: ошибка harness исключена из качества и разброса, расходы сохраняются", () => {
  const attempts = [
    attempt({ score: 100, pass: true }),
    attempt({ status: "harness_error", score: 0, pass: false, judge_status: "skipped", cost: 0.02 }),
  ]
  expect(aggregate(attempts, false)).toMatchObject({
    total: 1, completed: 1, completion_rate: 1, mean_score: 100, pass_rate: 1,
    harness_error_count: 1, total_cost: 0.03, total_duration_ms: 2000,
  })
  expect(aggregateTask(attempts, false)).toMatchObject({ attempts: 1, mean_score: 100, min_score: 100, max_score: 100 })
})

test("aggregate: отказ судьи не считается ошибкой агента в pass_rate", () => {
  expect(aggregate([
    attempt({}),
    attempt({ score: null, pass: null, judge_status: "error" }),
    attempt({ status: "no_artifact", score: 0, pass: false, judge_status: "no_artifact" }),
  ], false)).toMatchObject({ total: 3, pass_rate: 0.5, pass_evaluated_count: 2, judge_error_count: 1 })
})

test("aggregate: сбой инфраструктуры не снижает метрики агента", () => {
  const attempts = [attempt({}), attempt({ status: "infra_error", score: 0, pass: false, judge_status: "skipped" })]
  expect(aggregate(attempts, false)).toMatchObject({ total: 1, completion_rate: 1, mean_score: 100, pass_rate: 1, infra_error_count: 1 })
  expect(aggregateTask(attempts, false)).toMatchObject({ attempts: 1, min_score: 100, max_score: 100 })
})

test("aggregate: без измеренных попыток нет показателя completion", () => {
  expect(aggregate([attempt({ status: "infra_error", score: null, pass: null, judge_status: "skipped" })], false)).toMatchObject({
    total: 0, completion_rate: null, mean_score: null, pass_rate: null, infra_error_count: 1,
  })
})

test("aggregate: oracle показывает отдельную долю проверенных результатов", () => {
  const attempts = [attempt({ oracle_pass: true }), attempt({ oracle_pass: false }), attempt({ oracle_pass: null })]
  expect(aggregate(attempts, false)).toMatchObject({ oracle_checked_count: 2, oracle_pass_rate: 0.5 })
  expect(aggregateTask(attempts, false)).toMatchObject({ oracle_checked_count: 2, oracle_pass_rate: 0.5 })
})

test("aggregateTask: разброс score по попыткам", () => {
  const task = aggregateTask([attempt({ score: 40 }), attempt({ attempt: 2, score: 90 })], false)
  expect(task).toMatchObject({ attempts: 2, completed: 2, mean_score: 65, min_score: 40, max_score: 90, pass_rate: 1 })
})

test("aggregate: cleanup отдельно от качества, включая interrupted и legacy", () => {
  const attempts = [
    attempt({ status: "no_artifact", score: 0, pass: false, environment_cleanup: { status: "failed", evidence: "cleanup.json", error: "owner unknown" } }),
    attempt({ environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }),
    attempt({ status: "interrupted", environment_cleanup: { status: "failed", evidence: "cleanup.json", error: "leftover" } }),
    attempt({}),
  ]
  expect(aggregate(attempts, false)).toMatchObject({
    total: 3, completed: 2, mean_score: 66.7, pass_rate: 0.667,
    environment_cleanup_error_count: 2, environment_cleanup_checked_count: 3,
  })
})

const summary = (): RunSummary => {
  const attempts = [attempt({ task_id: "group-sum-qty" }), attempt({ task_id: "group-sum-qty", attempt: 2, status: "failed", failure_kind: "provider", score: null, pass: null, judge_status: "error", errors: ["APIError"] })]
  return {
    run_id: "20260918-120000-abc1234",
    label: "baseline",
    started_at: "2026-09-18T12:00:00.000Z",
    finished_at: "2026-09-18T12:30:00.000Z",
    interrupted: false,
    interrupted_cleanup: null,
    stopped_reason: null,
    agent: { cli_mode: "source", git_sha: "abc1234", dirty: false, model: "openai/gpt-5.6-sol" },
    judge: { backend: "codex", codex_version: "codex-cli 0.153.4", model: "gpt-6-astra", reasoning: "high", prompt_sha256: "p" },
    dock: { skill_revision: "r1", action_manifest_sha256: [] },
    loginom: { image_digest: "sha256:x", container: null, storage_dir: null },
    agent_inputs_hash: "a",
    rubric_hash: "r",
    task_ids: ["group-sum-qty"],
    config: { repeat: 2, timeout_ms: 900000, judge_timeout_ms: 300000, pass_threshold: 70, keep_storage: false },
    metrics: aggregate(attempts, false),
    tasks: [{ id: "group-sum-qty", metrics: aggregateTask(attempts, false), attempts }],
    storage_leftovers: ["eval-20260918-120000-abc1234-group-sum-qty-2.~lgp"],
  }
}

test("renderReport: метрики, задачи, попытки, отказы и остатки", () => {
  const report = renderReport(summary())
  expect(report).toContain("completion_rate")
  expect(report).toContain("group-sum-qty")
  expect(report).toContain("provider")
  expect(report).toContain("APIError")
  expect(report).toContain("Остатки в хранилище")
})

test("renderReport: cleanup отдельно, включая completed failure и старую непроверенную попытку", () => {
  const attempts = [attempt({ environment_cleanup: { status: "failed", error: "archive failed", evidence: "cleanup.json" } }),
    attempt({ attempt: 2 })]
  const report = renderReport({ ...summary(), metrics: aggregate(attempts, false),
    tasks: [{ id: "t", metrics: aggregateTask(attempts, false), attempts }] })
  expect(report).toContain("environment_cleanup: ошибок 1, проверено 1")
  expect(report).toContain("| Cleanup |")
  expect(report).toContain("не проверялось")
  expect(report).toContain("cleanup failed — archive failed")
})

test("renderReport: отдельно показывает инфраструктуру, полноту судейства и проверку oracle", () => {
  const attempts = [attempt({ oracle_pass: false, oracle_error: "Колонки не совпали", pass: false })]
  const report = renderReport({ ...summary(), metrics: aggregate(attempts, false), tasks: [{ id: "t", metrics: aggregateTask(attempts, false), attempts }] })
  expect(report).toContain("oracle_pass_rate: 0.0% (проверено 1)")
  expect(report).toContain("infra_error: 0, harness_error: 0, judge_error: 0")
  expect(report).toContain("pass_rate: 0.0% (оценено 1)")
  expect(report).toContain("Колонки не совпали")
})

test("renderReport: идентифицирует измеряемый binary независимо от git harness", () => {
  const run = summary()
  expect(renderReport({ ...run, agent: { ...run.agent, cli_mode: "binary", cli_version: "0.1.17", variant: "low", source_commit: "source123", binary_sha256: "binary123" } }))
    .toContain("CLI 0.1.17 · variant low · source source123 · binary sha256 binary123")
})

test("renderReport: экранирует свободный текст в ячейках markdown", () => {
  const scored = attempt({ task_id: "group-sum-qty", judge_summary: "a|b\nc" })
  const report = renderReport({
    ...summary(),
    tasks: [{ id: "group-sum-qty", metrics: aggregateTask([scored], false), attempts: [scored] }],
    storage_leftovers: [],
  })
  const row = report.split("\n").find((line) => line.includes("a\\|b c"))
  expect(row).toBeDefined()
  expect(row).toContain("group-sum-qty")
})

test("renderReport: в отказах первая строка stderr_head", () => {
  const failed = attempt({
    task_id: "group-sum-qty",
    status: "failed",
    stderr_head: "LOGINOM_CONNECTION_NOT_READY\nmore",
    score: null,
    pass: null,
    judge_status: "error",
  })
  const report = renderReport({
    ...summary(),
    tasks: [{ id: "group-sum-qty", metrics: aggregateTask([failed], false), attempts: [failed] }],
    storage_leftovers: [],
  })
  expect(report).toContain("stderr: LOGINOM_CONNECTION_NOT_READY")
  expect(report).not.toContain("more")
})

test("renderReport: storage_leftovers null — не удалось получить листинг", () => {
  const report = renderReport({ ...summary(), storage_leftovers: null })
  expect(report).toContain("Остатки в хранилище: не удалось получить листинг")
  expect(report).not.toContain("eval-20260918-120000-abc1234-group-sum-qty-2.~lgp")
})

test("renderReport: команда очистки из loginom.container и storage_dir", () => {
  const report = renderReport({
    ...summary(),
    loginom: { image_digest: "sha256:x", container: "c-test", storage_dir: "/s/test" },
  })
  expect(report).toContain("docker exec c-test sh -c 'rm -f /s/test/eval-20260918-120000-abc1234-*'")
  expect(report).not.toContain("loginom-server-master")
})

test("writeSummary: пишет summary.json и report.md", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-summary-"))
  await writeSummary(dir, summary())
  const written = (await Bun.file(path.join(dir, "summary.json")).json()) as RunSummary
  expect(written.run_id).toBe("20260918-120000-abc1234")
  expect(await Bun.file(path.join(dir, "report.md")).exists()).toBe(true)
  expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([])
})
