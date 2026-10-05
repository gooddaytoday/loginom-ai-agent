import { EvalFailure } from "./fail"
import { evaluationContractHash } from "./evaluation"
import type { AttemptResult, RunSummary } from "./report"

export type ComparePolicy = { margin: number; confidence: number; k: number | null }
export type ComparisonAxis = {
  task_count: number
  observed: { a: number; b: number; drop: number } | null
  interval: { lower: number; upper: number } | null
  verdict: "worse" | "better" | "indistinguishable" | null
  non_inferiority: "confirmed" | "rejected" | "inconclusive" | null
  reasons: string[]
}
export type ComparisonAnalysis = ReturnType<typeof analyzeComparison>

export function analyzeComparison(a: RunSummary, b: RunSummary, options: Partial<ComparePolicy> = {}) {
  const policy = { margin: options.margin === undefined ? 0.5 : options.margin, confidence: options.confidence === undefined ? 0.95 : options.confidence,
    k: options.k === undefined ? a.config.repeat === b.config.repeat ? a.config.repeat : null : options.k }
  if (!Number.isFinite(policy.margin) || policy.margin < 0 || policy.margin >= 1 ||
    !Number.isFinite(policy.confidence) || policy.confidence <= 0 || policy.confidence >= 1 ||
    policy.k !== null && (!Number.isInteger(policy.k) || policy.k <= 0))
    throw new EvalFailure("Некорректные параметры compare", 2)
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
  if (compatibility.length) return { policy, compatibility, reliability: { k: policy.k, a: { pass1: null, passk: null }, b: { pass1: null, passk: null }, reasons: compatibility }, tasks: [], axes: { completion: axis([], policy, compatibility), oracle: axis([], policy, ["snapshot_unavailable"]), structure: axis([], policy, ["structure_unavailable"]) } }
  const rates = a.tasks.map((task) => ({
    a: completion(task.attempts),
    b: completion(b.tasks.find((candidate) => candidate.id === task.id)!.attempts),
  }))
  const tasks = a.tasks.map((task, index) => {
    const other = b.tasks.find((candidate) => candidate.id === task.id)!
    const complete = a.config.repeat === 3 && b.config.repeat === 3 &&
      task.attempts.length === 3 && other.attempts.length === 3 &&
      task.attempts.every((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status)) &&
      other.attempts.every((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status)) &&
      !a.interrupted && !b.interrupted && !a.stopped_reason && !b.stopped_reason
    const regressions: ("completion" | "oracle" | "pass")[] = []
    if (complete && rates[index]!.a === 1 && rates[index]!.b === 0) regressions.push("completion")
    if (complete && freshEvaluation(a, task) && freshEvaluation(b, other)) {
      if (task.rubric_snapshot?.oracle_applicable && other.rubric_snapshot?.oracle_applicable && task.attempts.every((attempt) => attempt.oracle_pass === true) && other.attempts.every((attempt) => attempt.oracle_pass === false)) regressions.push("oracle")
      if (task.attempts.every((attempt) => attempt.pass === true) && other.attempts.every((attempt) => attempt.pass === false)) regressions.push("pass")
    }
    return { id: task.id, completion: rates[index]!, oracle: { a: judgedRate(task.attempts, "oracle_pass"), b: judgedRate(other.attempts, "oracle_pass") }, structure: { a: judgedRate(task.attempts, "structural_score"), b: judgedRate(other.attempts, "structural_score") }, regressions }
  })
  const oraclePairs = a.tasks.map((task) => ({ a: task, b: b.tasks.find((other) => other.id === task.id)! }))
  const oracleKnown = oraclePairs.every((pair) => pair.a.rubric_snapshot?.version === 1 && pair.b.rubric_snapshot?.version === 1 &&
    pair.a.rubric_snapshot.oracle_applicable === pair.b.rubric_snapshot.oracle_applicable)
  const oracleRates = oraclePairs.filter((pair) => pair.a.rubric_snapshot?.oracle_applicable && pair.b.rubric_snapshot?.oracle_applicable)
    .map((pair) => ({ a: judgedRate(pair.a.attempts, "oracle_pass"), b: judgedRate(pair.b.attempts, "oracle_pass") }))
  const partial = [a, b].some((run) => run.interrupted || run.stopped_reason || run.tasks.some((task) => task.attempts.some((attempt) => attempt.status === "interrupted"))) ? ["partial_run"] : []
  const lineage = oraclePairs.some((pair) => !freshEvaluation(a, pair.a) || !freshEvaluation(b, pair.b)) ? ["evaluation_provenance"] : []
  const oracleReasons = !oracleKnown ? ["snapshot_unavailable"] : !a.judge || !b.judge ? ["judge_skipped"] :
    oraclePairs.some((pair) => pair.a.rubric_snapshot?.oracle_applicable &&
      [pair.a, pair.b].some((task) => measured(task.attempts).some((attempt) => typeof attempt.oracle_pass !== "boolean"))) ? ["oracle_coverage"] : []
  const structureRates = oraclePairs.map((pair) => ({ a: judgedRate(pair.a.attempts, "structural_score"), b: judgedRate(pair.b.attempts, "structural_score") }))
  const structureReasons = !a.judge || !b.judge ? ["judge_skipped"] :
    oraclePairs.some((pair) => [pair.a, pair.b].some((task) => !task.rubric_snapshot ||
      task.rubric_snapshot.checklist.some((item) => item.axis === undefined) ||
      !task.rubric_snapshot.checklist.some((item) => item.axis === "structure"))) ? ["structure_unclassified"] :
    oraclePairs.some((pair) => [pair.a, pair.b].some((task) => measured(task.attempts).some((attempt) => typeof attempt.structural_score !== "number"))) ? ["structure_coverage"] : []
  return { policy, compatibility, tasks, reliability: { k: policy.k, a: reliability(a, policy.k), b: reliability(b, policy.k), reasons: [
    ...(policy.k === null ? ["k_unknown"] : []),
    ...lineage,
    ...([a, b].some((run) => { const result = reliability(run, policy.k); return result.pass1 === null || policy.k !== null && result.passk === null }) ? ["pass_coverage"] : []),
  ] }, axes: { completion: axis(rates, policy, partial), oracle: axis(oracleRates, policy, [...oracleReasons, ...partial, ...lineage]), structure: axis(structureRates, policy, [...structureReasons, ...partial, ...lineage]) } }
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
  if (run.tasks.some((task) => !freshEvaluation(run, task))) return { pass1: null, passk: null }
  const tasks = run.tasks.map((task) => {
    const attempts = task.attempts.filter((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status))
    if (attempts.some((attempt) => typeof attempt.pass !== "boolean")) return { pass1: null, passk: null }
    const successes = attempts.filter((attempt) => attempt.pass === true).length
    return {
      pass1: attempts.length ? successes / attempts.length : null,
      passk: k === null || attempts.length < k ? null : successes < k ? 0 : Array.from({ length: k }, (_, j) => (successes - j) / (attempts.length - j)).reduce((product, value) => product * value, 1),
    }
  })
  return {
    pass1: !tasks.length || tasks.some((task) => task.pass1 === null) ? null : tasks.reduce((sum, task) => sum + task.pass1!, 0) / tasks.length,
    passk: !tasks.length || tasks.some((task) => task.passk === null) ? null : tasks.reduce((sum, task) => sum + task.passk!, 0) / tasks.length,
  }
}

function axis(rates: { a: number | null; b: number | null }[], policy: ComparePolicy, reasons: string[]): ComparisonAxis {
  if (!rates.length || rates.some((rate) => rate.a === null || rate.b === null)) return {
    task_count: rates.length, observed: null, interval: null, verdict: null, non_inferiority: null,
    reasons: [...reasons, "coverage"],
  }
  const first = rates.reduce((sum, rate) => sum + rate.a!, 0) / rates.length
  const second = rates.reduce((sum, rate) => sum + rate.b!, 0) / rates.length
  const observed = { a: first, b: second, drop: first - second }
  if (reasons.length) return { task_count: rates.length, observed, interval: null, verdict: null, non_inferiority: null, reasons }
  const width = Math.sqrt(2 * Math.log(6 / (1 - policy.confidence)) / rates.length)
  const interval = { lower: Math.max(-1, observed.drop - width), upper: Math.min(1, observed.drop + width) }
  return { task_count: rates.length, observed, interval,
    verdict: interval.lower > policy.margin ? "worse" : interval.upper < -policy.margin ? "better" : "indistinguishable",
    non_inferiority: interval.upper <= policy.margin ? "confirmed" : interval.lower > policy.margin ? "rejected" : "inconclusive",
    reasons,
  }
}

function measured(attempts: AttemptResult[]) {
  return attempts.filter((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status))
}
function judgedRate(attempts: AttemptResult[], key: "oracle_pass" | "structural_score") {
  const values = measured(attempts).flatMap((attempt) => {
    const value = attempt[key]
    return typeof value === "boolean" ? [Number(value)] : typeof value === "number" ? [value / 100] : []
  })
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function freshEvaluation(run: RunSummary, task: RunSummary["tasks"][number]) {
  if (!run.judge || task.rubric_snapshot?.version !== 1) return false
  const contract = evaluationContractHash({ rubric_hash: run.rubric_hash, judge: run.judge, pass_threshold: run.config.pass_threshold })
  return measured(task.attempts).every((attempt) => attempt.evaluation_contract_hash === contract)
}
