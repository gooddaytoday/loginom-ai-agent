import { evaluationContractHash } from "../../src/evaluation"
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "../../src/report"

export function comparisonSummary(counts: { successes: number; attempts: number }[], repeat = 3): RunSummary {
  const tasks = counts.map((count, index) => {
    const id = `task-${index}`
    const attempts = Array.from({ length: count.attempts }, (_, number): AttemptResult => ({
      task_id: id, attempt: number + 1,
      status: number < count.successes ? "completed" : "no_artifact",
      exit_code: 0, timed_out: false, interrupted: false, failure_kind: null,
      score: number < count.successes ? 100 : 0,
      structural_score: number < count.successes ? 100 : 0,
      pass: number < count.successes, oracle_pass: number < count.successes,
      judge_status: number < count.successes ? "scored" : "no_artifact",
      judge_attempts: 1, judge_confidence: "high", judge_summary: null, checklist: null,
      duration_ms: 1, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0 },
      counters: { toolCalls: 0, loginomToolCalls: 0, toolErrors: 0, memoryToolCalls: 0 },
      package_path: null, artifact_origin: null, artifact_ambiguous: [], cleanup_error: null,
      action_manifest_sha256: null, session_id: null, profile_recovered: false,
      errors: [], harness_error: null, stderr_head: null,
    }))
    return { id, rubric_snapshot: { version: 1 as const, checklist: [{ id: "structure", weight: 1, required: false, requires_result_file: false, requires_run: false, axis: "structure" as const }], oracle_applicable: true, oracle_tolerance: 0.01 }, attempts, metrics: aggregateTask(attempts, false) }
  })
  const summary: RunSummary = {
    run_id: "fixture", label: null, started_at: "", finished_at: "", interrupted: false,
    interrupted_cleanup: null, stopped_reason: null,
    agent: { cli_mode: "source", git_sha: "source-a", dirty: false, model: "fake/model", variant: "medium" },
    judge: { backend: "codex", codex_version: "fake", model: "fake", reasoning: "medium", prompt_sha256: "prompt", schema_sha256: "schema" },
    dock: { skill_revision: "skill", action_manifest_sha256: ["manifest"] },
    loginom: { image_digest: "image", container: null, storage_dir: null },
    agent_inputs_hash: "inputs", rubric_hash: "rubric", task_ids: tasks.map((task) => task.id),
    config: { repeat, timeout_ms: 1000, task_timeout_ms: Object.fromEntries(tasks.map((task) => [task.id, 1000])), judge_timeout_ms: 1000, pass_threshold: 70, keep_storage: false },
    metrics: aggregate(tasks.flatMap((task) => task.attempts), false), tasks, storage_leftovers: [],
  }
  const contract = evaluationContractHash({ rubric_hash: summary.rubric_hash, judge: summary.judge, pass_threshold: summary.config.pass_threshold })
  summary.tasks.forEach((task) => task.attempts.forEach((attempt) => { attempt.evaluation_contract_hash = contract }))
  return summary
}
