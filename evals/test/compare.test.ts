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

test("compare: дельты метрик со стрелками", () => {
  const text = compare(summary([attempt({ score: 50 })], { run_id: "a" }), summary([attempt({ score: 90 })], { run_id: "b" }))
  expect(text).toContain("mean_score")
  expect(text).toContain("50.0 → 90.0 ▲")
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
