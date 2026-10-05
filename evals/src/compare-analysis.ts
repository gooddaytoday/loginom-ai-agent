import { EvalFailure } from "./fail"
import { evaluationContractHash, sameRubricSnapshot } from "./evaluation"
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
    if (complete && freshEvaluation(a, task) && freshEvaluation(b, other) && sameRubricSnapshot(task.rubric_snapshot, other.rubric_snapshot)) {
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
  const snapshotMismatch = oraclePairs.some((pair) => !sameRubricSnapshot(pair.a.rubric_snapshot, pair.b.rubric_snapshot)) ? ["snapshot_mismatch"] : []
  const oracleLineage = oraclePairs.filter((pair) => pair.a.rubric_snapshot?.oracle_applicable && pair.b.rubric_snapshot?.oracle_applicable).some((pair) => !freshEvaluation(a, pair.a) || !freshEvaluation(b, pair.b)) ? ["evaluation_provenance"] : []
  const lineage = oraclePairs.some((pair) => !freshEvaluation(a, pair.a) || !freshEvaluation(b, pair.b)) ? ["evaluation_provenance"] : []
  const oracleReasons = !oracleKnown ? ["snapshot_unavailable"] : !oracleRates.length ? ["oracle_not_applicable"] : !a.judge || !b.judge ? ["judge_skipped"] :
    oraclePairs.some((pair) => pair.a.rubric_snapshot?.oracle_applicable &&
      [pair.a, pair.b].some((task) => measured(task.attempts).some((attempt) => typeof attempt.oracle_pass !== "boolean"))) ? ["oracle_coverage"] : []
  const structureRates = oraclePairs.map((pair) => ({ a: judgedRate(pair.a.attempts, "structural_score"), b: judgedRate(pair.b.attempts, "structural_score") }))
  const structureReasons = !a.judge || !b.judge ? ["judge_skipped"] :
    oraclePairs.some((pair) => [pair.a, pair.b].some((task) => !task.rubric_snapshot ||
      task.rubric_snapshot.checklist.some((item) => item.axis === undefined) ||
      !task.rubric_snapshot.checklist.some((item) => item.axis === "structure"))) ? ["structure_unclassified"] :
    oraclePairs.some((pair) => [pair.a, pair.b].some((task) => measured(task.attempts).some((attempt) => typeof attempt.structural_score !== "number"))) ? ["structure_coverage"] : []
  return { policy, compatibility, tasks, reliability: { k: policy.k, a: snapshotMismatch.length ? {pass1:null,passk:null} : reliability(a, policy.k), b: snapshotMismatch.length ? {pass1:null,passk:null} : reliability(b, policy.k), reasons: [
    ...(policy.k === null ? ["k_unknown"] : []),
    ...lineage,
    ...snapshotMismatch,
    ...([a, b].some((run) => { const result = reliability(run, policy.k); return result.pass1 === null || policy.k !== null && result.passk === null }) ? ["pass_coverage"] : []),
  ] }, axes: { completion: axis(rates, policy, partial), oracle: axis(oracleRates, policy, [...oracleReasons, ...partial, ...oracleLineage, ...snapshotMismatch]), structure: axis(structureRates, policy, [...structureReasons, ...partial, ...lineage, ...snapshotMismatch]) } }
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
      for (const key of ["score", "structural_score"] as const) {
        const value = attempt[key]
        if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100))
          throw new EvalFailure(`Некорректный summary: ${key} задачи ${task.id}`, 2)
      }
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

export function parseComparisonSummary(value: unknown): RunSummary {
  const run = object(value)
  const agent = object(run.agent)
  const config = object(run.config)
  const dock = object(run.dock)
  const loginom = object(run.loginom)
  text(run.run_id)
  if (run.label !== null) text(run.label)
  for (const key of ["started_at","finished_at"]) text(run[key], true)
  boolean(run.interrupted)
  if (run.stopped_reason !== null) text(run.stopped_reason)
  for (const key of ["model","variant"]) optionalText(agent[key])
  for (const key of ["cli_mode","git_sha","cli_version","source_commit","binary_sha256"]) optionalText(agent[key])
  optionalText(run.agent_inputs_hash)
  optionalText(run.rubric_hash)
  numbers(config, ["repeat","timeout_ms","judge_timeout_ms"],1,Infinity,true)
  numeric(config.pass_threshold,0,100)
  boolean(config.keep_storage)
  if (config.task_timeout_ms !== undefined) Object.values(object(config.task_timeout_ms)).forEach((value) => numeric(value,1,Infinity,true))
  if (run.judge !== null) {
    const judge = object(run.judge)
    for (const key of ["backend","codex_version","model","reasoning","prompt_sha256","schema_sha256"]) optionalText(judge[key])
  }
  optionalText(dock.skill_revision)
  stringArray(dock.action_manifest_sha256)
  if (dock.skill_revisions !== undefined) stringArray(dock.skill_revisions)
  for (const key of ["image_digest","container","storage_dir"]) optionalText(loginom[key])
  stringArray(run.task_ids)
  metrics(object(run.metrics))
  if (!Array.isArray(run.tasks)) invalid()
  for (const raw of run.tasks as unknown[]) {
    const task = object(raw)
    text(task.id)
    metrics(object(task.metrics),true)
    if (!Array.isArray(task.attempts)) invalid()
    for (const raw of task.attempts as unknown[]) {
      const attempt = object(raw)
      text(attempt.task_id)
      numeric(attempt.attempt,1,Infinity,true)
      text(attempt.status)
      for (const key of ["score","structural_score"]) if (attempt[key] != null) numeric(attempt[key],0,100)
      for (const key of ["pass","oracle_pass"]) if (attempt[key] != null) boolean(attempt[key])
      optionalText(attempt.evaluation_contract_hash)
      text(attempt.judge_status)
      numeric(attempt.duration_ms,0,Infinity)
      numeric(attempt.cost,0,Infinity)
      numbers(object(attempt.tokens),["input","output","reasoning"],0,Infinity)
      numbers(object(attempt.counters),["toolCalls","loginomToolCalls","toolErrors","memoryToolCalls"],0,Infinity)
    }
    if (task.rubric_snapshot !== undefined) {
      const snapshot = object(task.rubric_snapshot)
      if (snapshot.version !== 1 || !Array.isArray(snapshot.checklist)) invalid()
      boolean(snapshot.oracle_applicable)
      numeric(snapshot.oracle_tolerance,0,Infinity)
      const ids = new Set<string>()
      for (const raw of snapshot.checklist as unknown[]) {
        const item = object(raw)
        text(item.id)
        if (ids.has(item.id as string)) invalid()
        ids.add(item.id as string)
        numeric(item.weight,Number.MIN_VALUE,Infinity)
        for (const key of ["required","requires_result_file","requires_run"]) boolean(item[key])
        if (item.axis !== undefined && !["structure","result","report"].includes(String(item.axis))) invalid()
      }
    }
  }
  const parsed = value as RunSummary // Все используемые поля проверены; исторические необязательные поля допускаются.
  requireSummary(parsed)
  return parsed
}
function invalid(): never { throw new EvalFailure("Некорректный summary: форма данных",2) }
function object(value: unknown): Record<string,unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid()
  return value as Record<string,unknown>
}
function text(value: unknown, empty = false) {
  if (typeof value !== "string" || !empty && !value) invalid()
}
function optionalText(value: unknown) { if (value != null) text(value,true) }
function boolean(value: unknown) { if (typeof value !== "boolean") invalid() }
function numeric(value: unknown,min: number,max: number,integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) invalid()
}
function numbers(record: Record<string,unknown>,keys: string[],min: number,max: number,integer = false) {
  keys.forEach((key) => numeric(record[key],min,max,integer))
}
function stringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === "string" && item.length > 0)) invalid()
}
function metrics(record: Record<string,unknown>,task = false) {
  numbers(record,task ? ["attempts","completed"] : ["total","completed","tool_errors","total_cost"],0,Infinity)
  for (const key of ["completion_rate","pass_rate"]) if (record[key] !== null) numeric(record[key],0,1)
  if (record.oracle_pass_rate != null) numeric(record.oracle_pass_rate,0,1)
  for (const key of ["oracle_checked_count","pass_evaluated_count"]) if (record[key] != null) numeric(record[key],0,Infinity,true)
  for (const key of task ? ["mean_score","min_score","max_score"] : ["mean_score","mean_score_completed"]) if (record[key] !== null) numeric(record[key],0,100)
}
