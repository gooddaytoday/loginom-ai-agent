import { EvalFailure } from "./fail"
import type { AttemptResult, RunSummary } from "./report"

export function analyzeComparison(a: RunSummary, b: RunSummary) {
  const identity: [string, unknown, unknown][] = [
    ["agent.model", a.agent.model, b.agent.model],
    ["agent.variant", a.agent.variant, b.agent.variant],
    ["agent_inputs_hash", a.agent_inputs_hash, b.agent_inputs_hash],
    ["rubric_hash", a.rubric_hash, b.rubric_hash],
    ["config.pass_threshold", a.config.pass_threshold, b.config.pass_threshold],
    ["config.task_timeout_ms", taskTimeouts(a.config.task_timeout_ms), taskTimeouts(b.config.task_timeout_ms)],
    ...(!a.judge && !b.judge ? [] : [
      ["judge.backend", a.judge?.backend, b.judge?.backend],
      ["judge.codex_version", a.judge?.codex_version, b.judge?.codex_version],
      ["judge.model", a.judge?.model, b.judge?.model],
      ["judge.reasoning", a.judge?.reasoning, b.judge?.reasoning],
      ["judge.prompt_sha256", a.judge?.prompt_sha256, b.judge?.prompt_sha256],
      ["judge.schema_sha256", a.judge?.schema_sha256, b.judge?.schema_sha256],
    ] as [string, unknown, unknown][]),
  ]
  const compatibility = identity.filter(([, first, second]) => first == null || second == null || first === "" || second === "" || first !== second).map(([name]) => name)
  if (a.task_ids.length !== b.task_ids.length || a.task_ids.some((id) => !b.task_ids.includes(id))) compatibility.push("task_ids")
  if (compatibility.length) return { compatibility, axes: { completion: { observed: null } } }
  const rates = a.tasks.map((task) => ({
    a: completion(task.attempts),
    b: completion(b.tasks.find((candidate) => candidate.id === task.id)!.attempts),
  }))
  const first = rates.reduce((sum, rate) => sum + (rate.a ?? 0), 0) / rates.length
  const second = rates.reduce((sum, rate) => sum + (rate.b ?? 0), 0) / rates.length
  return { compatibility, axes: { completion: {
    observed: !rates.length || rates.some((rate) => rate.a === null || rate.b === null) ? null : { a: first, b: second, drop: first - second },
  } } }
}

function completion(attempts: AttemptResult[]) {
  const measured = attempts.filter((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status))
  return measured.length ? measured.filter((attempt) => attempt.status === "completed").length / measured.length : null
}

function taskTimeouts(limits?: Record<string, number>) {
  return limits === undefined ? null : JSON.stringify(Object.entries(limits).sort(([a], [b]) => a.localeCompare(b)))
}
