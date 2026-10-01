import { expect, test } from "bun:test"
import { compare } from "../src/compare"
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "../src/report"

const attempt = (over: Partial<AttemptResult>): AttemptResult => ({
  task_id: "group-sum-qty", attempt: 1, status: "completed", exit_code: 0, timed_out: false, interrupted: false, failure_kind: null,
  score: 70, pass: true, judge_status: "scored", judge_attempts: 1, judge_confidence: "high", judge_summary: null, checklist: null,
  duration_ms: 1000, cost: 0.01, tokens: { input: 1, output: 1, reasoning: 0 }, counters: { toolCalls: 1, loginomToolCalls: 1, toolErrors: 0, memoryToolCalls: 0 },
  package_path: null, artifact_origin: null, artifact_ambiguous: [], cleanup_error: null, action_manifest_sha256: null, session_id: null,
  profile_recovered: false, errors: [], harness_error: null, stderr_head: null, ...over,
})

const summary = (attempts: AttemptResult[], over: Partial<RunSummary> = {}): RunSummary => ({
  run_id: "a", label: null, started_at: "", finished_at: "", interrupted: false, interrupted_cleanup: null, stopped_reason: null,
  agent: { cli_mode: "source", git_sha: "1", dirty: false, model: "openai/gpt-5.6-sol" },
  judge: { backend: "codex", codex_version: "v", model: "gpt-6-astra", reasoning: "high", prompt_sha256: "p" },
  dock: { skill_revision: "r1", action_manifest_sha256: ["m"] }, loginom: { image_digest: "d", container: "c", storage_dir: "/s" },
  agent_inputs_hash: "i", rubric_hash: "r", task_ids: ["group-sum-qty"],
  config: { repeat: 1, timeout_ms: 1, judge_timeout_ms: 1, pass_threshold: 70, keep_storage: false },
  metrics: aggregate(attempts, false), tasks: [{ id: "group-sum-qty", metrics: aggregateTask(attempts, false), attempts }], storage_leftovers: [], ...over,
})

test("compare: знаковая дельта не объявляет улучшение агента", () => {
  const text = compare(summary([attempt({ score: 50 })], { run_id: "a" }), summary([attempt({ score: 90 })], { run_id: "b" }))
  expect(text).toContain("mean_score")
  expect(text).toContain("50.0 → 90.0 (Δ +40.0)")
  expect(text).toContain("Статистический вердикт «лучше/хуже» не вычисляется")
  expect(text).not.toContain("▲")
  expect(text).not.toContain("несравнимы")
})

test("compare: разный судья — предупреждение о несравнимости первой строкой; разный Dock — предупреждение об окружении", () => {
  const a = summary([attempt({})])
  const b = summary([attempt({})], { judge: { ...a.judge!, model: "gpt-5.5" }, dock: { skill_revision: "r2", action_manifest_sha256: ["m"] } })
  const text = compare(a, b)
  expect(text.split("\n")[0]).toContain("несравнимы")
  expect(text).toContain("judge.model")
  expect(text).toContain("изменилось окружение")
  expect(text).toContain("dock.skill_revision")
})

test("compare: action_manifest_sha256 сравнивается после сортировки", () => {
  const text = compare(
    summary([attempt({})], { dock: { skill_revision: "r1", action_manifest_sha256: ["b", "a"] } }),
    summary([attempt({})], { dock: { skill_revision: "r1", action_manifest_sha256: ["a", "b"] } }),
  )
  expect(text).not.toContain("изменилось окружение")
})

test("compare: прерванный прогон — предупреждение о неполном покрытии", () => {
  const text = compare(summary([attempt({})]), summary([attempt({})], { interrupted: true }))
  expect(text).toContain("неполное покрытие")
})

test("compare: неизвестный variant старого прогона нельзя считать известным variant", () => {
  const a = summary([attempt({})])
  const b = summary([attempt({})], { agent: { ...a.agent, variant: "low" } })
  expect(compare(a, b)).toContain("agent.variant (null → low)")
})

test("compare: версии агента показаны как измеряемое изменение, а не несравнимость", () => {
  const a = summary([attempt({})])
  const text = compare(
    { ...a, agent: { ...a.agent, cli_version: "0.1.17", source_commit: "old", binary_sha256: "first" } },
    { ...a, agent: { ...a.agent, cli_version: "0.1.18", source_commit: "new", binary_sha256: "second" } },
  )
  expect(text).toContain("CLI 0.1.17, source old, binary first")
  expect(text).toContain("CLI 0.1.18, source new, binary second")
  expect(text).not.toContain("несравнимы")
})

test("compare: разное число измеренных попыток задачи помечает неполное покрытие", () => {
  const text = compare(summary([attempt({}), attempt({ attempt: 2 })]), summary([attempt({})]))
  expect(text).toContain("неполное покрытие")
  expect(text).toContain("group-sum-qty: попыток 2 → 1")
})

test("compare: верность результата по oracle показана отдельно от балла судьи", () => {
  const text = compare(summary([attempt({ score: 100, oracle_pass: true })]), summary([attempt({ score: 100, oracle_pass: false, pass: false })]))
  expect(text).toContain("| oracle_pass_rate | 100.0% → 0.0% (Δ -100.0 п.п.) |")
  expect(text).toContain("| mean_score | 100.0 → 100.0 (Δ 0.0) |")
})

test("compare: одинаковые лимиты задач сравнимы независимо от порядка, разные лимиты — нет", () => {
  const a = summary([attempt({})])
  const first = { ...a, config: { ...a.config, task_timeout_ms: { first: 1000, second: 2000 } } }
  const reordered = { ...a, config: { ...a.config, task_timeout_ms: { second: 2000, first: 1000 } } }
  const changed = { ...a, config: { ...a.config, task_timeout_ms: { first: 1000, second: 3000 } } }
  expect(compare(first, reordered)).not.toContain("несравнимы")
  expect(compare(first, changed)).toContain("config.task_timeout_ms")
  expect(compare(a, first)).toContain("config.task_timeout_ms (null →")
})

test("compare: фактические ревизии Dock сравниваются после сортировки и меняют предупреждение окружения", () => {
  const a = summary([attempt({})])
  const first = { ...a, dock: { ...a.dock, skill_revisions: ["r1", "r2"] } }
  const reordered = { ...a, dock: { ...a.dock, skill_revisions: ["r2", "r1"] } }
  const changed = { ...a, dock: { ...a.dock, skill_revisions: ["r1", "r3"] } }
  expect(compare(first, reordered)).not.toContain("изменилось окружение")
  expect(compare(first, changed)).toContain("dock.skill_revisions")
  expect(compare(first, changed)).not.toContain("несравнимы")
})

test("compare: одинаковое неполное покрытие обоих прогонов не скрывает разные веса задач", () => {
  const tasks = [
    { id: "group-sum-qty", attempts: [attempt({}), attempt({ attempt: 2 }), attempt({ attempt: 3 })] },
    { id: "filter-active-rows", attempts: [attempt({ task_id: "filter-active-rows" }), attempt({ task_id: "filter-active-rows", attempt: 2 })] },
  ].map((task) => ({ ...task, metrics: aggregateTask(task.attempts, false) }))
  const a = summary(tasks.flatMap((task) => task.attempts), { tasks, task_ids: tasks.map((task) => task.id) })
  const text = compare(a, { ...a, run_id: "b" })
  expect(text).toContain("неполное покрытие внутри прогона a")
  expect(text).toContain("неполное покрытие внутри прогона b")
  expect(text).toContain("group-sum-qty=3, filter-active-rows=2")
})
