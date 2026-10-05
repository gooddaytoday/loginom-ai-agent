import { EvalFailure } from "./fail"
import type { AttemptResult, RunSummary } from "./report"

export type ComparePolicy = { margin: number; confidence: number; k: number | null }

export function analyzeComparison(a: RunSummary, b: RunSummary, options: Partial<ComparePolicy> = {}) {
  const policy = { margin: options.margin ?? 0.5, confidence: options.confidence ?? 0.95,
    k: options.k === undefined ? a.config.repeat === b.config.repeat ? a.config.repeat : null : options.k }
  requireSummary(a)
  requireSummary(b)
  const identity: [string, unknown, unknown][] = [
    ["agent.model", a.agent.model, b.agent.model],
    ["agent.variant", a.agent.variant, b.agent.variant],
    ["agent_inputs_hash", a.agent_inputs_hash, b.agent_inputs_hash],
    ["rubric_hash", a.rubric_hash, b.rubric_hash],
    ["config.pass_threshold", a.config.pass_threshold, b.config.pass_threshold],
    ["config.task_timeout_ms", taskTimeouts(a.config.task_timeout_ms, a.task_ids), taskTimeouts(b.config.task_timeout_ms, b.task_ids)],
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
  if (compatibility.length) return { policy, compatibility, reliability: { k: policy.k, a: { pass1: null, passk: null }, b: { pass1: null, passk: null }, reasons: compatibility }, axes: { completion: { observed: null } } }
  const rates = a.tasks.map((task) => ({
    a: completion(task.attempts),
    b: completion(b.tasks.find((candidate) => candidate.id === task.id)!.attempts),
  }))
  const first = rates.reduce((sum, rate) => sum + (rate.a ?? 0), 0) / rates.length
  const second = rates.reduce((sum, rate) => sum + (rate.b ?? 0), 0) / rates.length
  return { policy, compatibility, reliability: { k: policy.k, a: reliability(a, policy.k), b: reliability(b, policy.k), reasons: [] }, axes: { completion: {
    observed: !rates.length || rates.some((rate) => rate.a === null || rate.b === null) ? null : { a: first, b: second, drop: first - second },
  } } }
}

function completion(attempts: AttemptResult[]) {
  const measured = attempts.filter((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status))
  return measured.length ? measured.filter((attempt) => attempt.status === "completed").length / measured.length : null
}

function taskTimeouts(limits: Record<string, number> | undefined, ids: string[]) {
  return !limits || ids.some((id) => !Number.isFinite(limits[id]) || limits[id]! <= 0) ? null :
    JSON.stringify(ids.toSorted().map((id) => [id, limits[id]]))
}

function requireSummary(run: RunSummary) {
  if (new Set(run.task_ids).size !== run.task_ids.length || new Set(run.tasks.map((task) => task.id)).size !== run.tasks.length ||
    run.task_ids.length !== run.tasks.length || run.tasks.some((task) => !run.task_ids.includes(task.id)))
    throw new EvalFailure("Некорректный summary: task_ids не соответствуют уникальным tasks", 2)
  run.tasks.forEach((task) => {
    const measured = new Set<number>()
    task.attempts.forEach((attempt) => {
      if (attempt.task_id !== task.id || !Number.isInteger(attempt.attempt) || attempt.attempt < 1 ||
        !["completed", "failed", "timeout", "interrupted", "no_artifact", "harness_error", "infra_error"].includes(attempt.status))
        throw new EvalFailure(`Некорректный summary: попытка задачи ${task.id}`, 2)
      if (!["interrupted", "harness_error", "infra_error"].includes(attempt.status)) {
        if (measured.has(attempt.attempt)) throw new EvalFailure(`Некорректный summary: повтор попытки ${task.id}/${attempt.attempt}`, 2)
        measured.add(attempt.attempt)
      }
      if (attempt.score != null && (typeof attempt.score !== "number" || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 100))
        throw new EvalFailure(`Некорректный summary: score задачи ${task.id}`, 2)
      if (attempt.pass != null && typeof attempt.pass !== "boolean" || attempt.oracle_pass != null && typeof attempt.oracle_pass !== "boolean")
        throw new EvalFailure(`Некорректный summary: pass задачи ${task.id}`, 2)
    })
  })
}

function reliability(run: RunSummary, k: number | null) {
  const tasks = run.tasks.map((task) => {
    const attempts = task.attempts.filter((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status) && typeof attempt.pass === "boolean")
    const successes = attempts.filter((attempt) => attempt.pass === true).length
    return {
      pass1: attempts.length ? successes / attempts.length : null,
      passk: k === null || attempts.length < k ? null : successes < k ? 0 : 1,
    }
  })
  return {
    pass1: !tasks.length || tasks.some((task) => task.pass1 === null) ? null : tasks.reduce((sum, task) => sum + task.pass1!, 0) / tasks.length,
    passk: !tasks.length || tasks.some((task) => task.passk === null) ? null : tasks.reduce((sum, task) => sum + task.passk!, 0) / tasks.length,
  }
}
