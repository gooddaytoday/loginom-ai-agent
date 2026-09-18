import { expect, test } from "bun:test"
import { mkdtemp, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { aggregate, aggregateTask, renderReport, statusFor, writeSummary, type AttemptResult, type RunSummary } from "../src/report"

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
  expect(metrics.pass_rate).toBeCloseTo(0.333, 3)
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

test("aggregateTask: разброс score по попыткам", () => {
  const task = aggregateTask([attempt({ score: 40 }), attempt({ attempt: 2, score: 90 })], false)
  expect(task).toMatchObject({ attempts: 2, completed: 2, mean_score: 65, min_score: 40, max_score: 90, pass_rate: 1 })
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
