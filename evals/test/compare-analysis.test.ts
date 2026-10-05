import { expect, test } from "bun:test"
import { analyzeComparison } from "../src/compare-analysis"
import { comparisonSummary } from "./helpers/compare-summary"

test("analysis: задачи имеют равный вес при разных числах попыток", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }, { successes: 0, attempts: 1 }])
  const b = comparisonSummary([{ successes: 0, attempts: 3 }, { successes: 1, attempts: 1 }])
  expect(analyzeComparison(a, b).axes.completion.observed).toEqual({ a: 0.5, b: 0.5, drop: 0 })
})

test("analysis: инфраструктура и прерывание не снижают completion", () => {
  const run = comparisonSummary([{ successes: 1, attempts: 4 }])
  run.tasks[0]!.attempts[1]!.status = "infra_error"
  run.tasks[0]!.attempts[2]!.status = "harness_error"
  run.tasks[0]!.attempts[3]!.status = "interrupted"
  expect(analyzeComparison(run, run).axes.completion.observed).toEqual({ a: 1, b: 1, drop: 0 })
})

test("analysis: пустая задача не создаёт нулевую оценку или NaN", () => {
  const run = comparisonSummary([{ successes: 0, attempts: 0 }])
  expect(analyzeComparison(run, run).axes.completion.observed).toBeNull()
})

test("analysis: разные наборы задач не сравниваются по удобному пересечению", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }])
  const b = comparisonSummary([{ successes: 3, attempts: 3 }, { successes: 0, attempts: 3 }])
  expect(analyzeComparison(a, b).axes.completion.observed).toBeNull()
  expect(analyzeComparison(a, b).compatibility).toContain("task_ids")
})

test("analysis: несовместимые и неизвестные идентичности не доказывают сравнимость", () => {
  const changes: ((run: ReturnType<typeof comparisonSummary>) => void)[] = [
    (run) => { run.agent.model = "other/model" },
    (run) => { delete run.agent.variant },
    (run) => { run.agent_inputs_hash = "other-inputs" },
    (run) => { run.rubric_hash = "other-rubric" },
    (run) => { run.judge!.model = "other-judge" },
    (run) => { run.judge!.reasoning = "low" },
    (run) => { run.judge!.prompt_sha256 = "other-prompt" },
    (run) => { delete run.judge!.schema_sha256 },
    (run) => { run.config.pass_threshold = 80 },
    (run) => { run.config.task_timeout_ms!["task-0"] = 2000 },
  ]
  changes.forEach((change) => {
    const a = comparisonSummary([{ successes: 3, attempts: 3 }])
    const b = comparisonSummary([{ successes: 3, attempts: 3 }])
    change(b)
    expect(analyzeComparison(a, b).compatibility.length).toBeGreaterThan(0)
    expect(analyzeComparison(a, b).axes.completion.observed).toBeNull()
  })
  const legacy = comparisonSummary([{ successes: 3, attempts: 3 }])
  delete legacy.agent.variant
  expect(analyzeComparison(legacy, legacy).compatibility).toContain("agent.variant")
})

test("analysis: повреждённые данные отклоняются вместо тихого пересчёта", () => {
  const changes: ((run: ReturnType<typeof comparisonSummary>) => void)[] = [
    (run) => { run.task_ids.push("task-0") },
    (run) => { run.tasks[0]!.id = "other-task" },
    (run) => { run.tasks[0]!.attempts[1]!.attempt = 1 },
    (run) => { run.tasks[0]!.attempts[0]!.score = NaN },
    (run) => { run.tasks[0]!.attempts[0]!.score = 101 },
    (run) => { Object.assign(run.tasks[0]!.attempts[0]!, { pass: "yes" }) },
  ]
  changes.forEach((change) => {
    const run = comparisonSummary([{ successes: 3, attempts: 3 }])
    change(run)
    expect(() => analyzeComparison(run, run)).toThrow("Некорректный summary")
  })
})

test("analysis: порядок задач и смена commit сохраняют сравнимость", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }, { successes: 1, attempts: 3 }])
  const b = comparisonSummary([{ successes: 3, attempts: 3 }, { successes: 1, attempts: 3 }])
  b.tasks.reverse()
  b.task_ids.reverse()
  b.agent.git_sha = "source-b"
  b.agent.source_commit = "other-source"
  b.agent.binary_sha256 = "other-binary"
  expect(analyzeComparison(a, b).compatibility).toEqual([])
  expect(analyzeComparison(a, b).axes.completion.observed).toEqual({ a: 2 / 3, b: 2 / 3, drop: 0 })
})

test("analysis: pass^3 означает все три успеха, а не хотя бы один", () => {
  const run = comparisonSummary([{ successes: 2, attempts: 3 }])
  expect(analyzeComparison(run, run).reliability.a.pass1).toBeCloseTo(2 / 3, 12)
  expect(analyzeComparison(run, run).reliability.a.passk).toBe(0)
})

test("analysis: неполные карты effective лимитов неизвестны", () => {
  const run = comparisonSummary([{ successes: 3, attempts: 3 }])
  for (const limits of [{}, { other: 1000 }] as Record<string, number>[]) {
    run.config.task_timeout_ms = limits
    expect(analyzeComparison(run, run).compatibility).toContain("config.task_timeout_ms")
  }
})

test("analysis: pass^k использует выборку без возвращения", () => {
  const run = comparisonSummary([{ successes: 3, attempts: 6 }])
  expect(analyzeComparison(run, run, { k: 3 }).reliability.a.passk).toBeCloseTo(0.05, 12)
})

test("analysis: неизвестный pass не выбирает удобное подмножество попыток", () => {
  const run = comparisonSummary([{ successes: 3, attempts: 3 }])
  run.tasks[0]!.attempts[0]!.pass = null
  expect(analyzeComparison(run, run).reliability.a).toEqual({ pass1: null, passk: null })
})

test("analysis: стабильная задача 3/3 → 0/3 получает наблюдаемый guard", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }])
  const b = comparisonSummary([{ successes: 0, attempts: 3 }])
  expect(analyzeComparison(a, b).tasks[0]?.regressions).toContain("completion")
})

test("analysis: oracle и конечный pass имеют отдельные наблюдаемые guards", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }])
  const b = comparisonSummary([{ successes: 0, attempts: 3 }])
  expect(analyzeComparison(a, b).tasks[0]?.regressions).toEqual(["completion", "oracle", "pass"])
})

test("analysis: общий k и недостаточное покрытие явно объясняются", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }], 3)
  const b = comparisonSummary([{ successes: 3, attempts: 3 }], 6)
  expect(analyzeComparison(a, b).reliability).toMatchObject({ k: null, a: { pass1: 1, passk: null } })
  expect(analyzeComparison(a, b).reliability.reasons).toContain("k_unknown")
  expect(analyzeComparison(a, b, { k: 3 }).reliability.a.passk).toBe(1)
  expect(analyzeComparison(a, b, { k: 4 }).reliability.reasons).toContain("pass_coverage")
})

test("analysis: одинаковые 5×3 не доказывают направление или non-inferiority", () => {
  const run = comparisonSummary(Array.from({ length: 5 }, () => ({ successes: 3, attempts: 3 })))
  expect(analyzeComparison(run, run).axes.completion).toMatchObject({
    interval: { lower: -1, upper: 1 }, verdict: "indistinguishable", non_inferiority: "inconclusive",
  })
})

test("analysis: policy отклоняет недопустимые вероятности и k", () => {
  const run = comparisonSummary([{ successes: 3, attempts: 3 }])
  for (const options of [{ margin: -1 }, { margin: 1 }, { margin: NaN }, { confidence: 0 }, { confidence: 1 }, { confidence: Infinity }, { k: 0 }, { k: 1.5 }])
    expect(() => analyzeComparison(run, run, options)).toThrow("Некорректные параметры compare")
})

test("analysis: остановленный прогон сохраняет описание без inferential verdict", () => {
  const run = comparisonSummary(Array.from({ length: 39 }, () => ({ successes: 3, attempts: 3 })))
  run.stopped_reason = "test stop"
  expect(analyzeComparison(run, run).axes.completion).toMatchObject({
    observed: { a: 1, b: 1, drop: 0 }, interval: null, verdict: null, non_inferiority: null, reasons: ["partial_run"],
  })
})

test("analysis: направленный verdict требует достаточного числа задач", () => {
  for (const count of [25, 39]) {
    const a = comparisonSummary(Array.from({ length: count }, () => ({ successes: 3, attempts: 3 })))
    const b = comparisonSummary(Array.from({ length: count }, () => ({ successes: 0, attempts: 3 })))
    expect(analyzeComparison(a, b).axes.completion.verdict).toBe(count === 25 ? "indistinguishable" : "worse")
    expect(analyzeComparison(b, a).axes.completion.verdict).toBe(count === 25 ? "indistinguishable" : "better")
    expect(analyzeComparison(a, b).axes.completion.non_inferiority).toBe(count === 25 ? "inconclusive" : "rejected")
    expect(analyzeComparison(b, a).axes.completion.non_inferiority).toBe("confirmed")
  }
})
test("analysis: строгая граница verdict и включённая граница non-inferiority", () => {
  const run = comparisonSummary(Array.from({ length: 39 }, () => ({ successes: 3, attempts: 3 })))
  const width = Math.sqrt(2 * Math.log(6 / 0.05) / 39)
  expect(analyzeComparison(run, run, { margin: width }).axes.completion.non_inferiority).toBe("confirmed")
  const b = comparisonSummary(Array.from({ length: 39 }, () => ({ successes: 0, attempts: 3 })))
  const lower = analyzeComparison(run, b).axes.completion.interval!.lower
  expect(analyzeComparison(run, b, { margin: lower }).axes.completion.verdict).toBe("indistinguishable")
})
test("analysis: exclusions, reverse и unknown pass не дают локальный guard", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }])
  const b = comparisonSummary([{ successes: 0, attempts: 3 }])
  expect(analyzeComparison(b, a).tasks[0]!.regressions).toEqual([])
  b.tasks[0]!.attempts[0]!.status = "infra_error"
  expect(analyzeComparison(a, b).tasks[0]!.regressions).toEqual([])
})

test("analysis: null не заменяет явно ошибочные параметры на defaults", () => {
  const run = comparisonSummary([{ successes: 3, attempts: 3 }])
  expect(() => analyzeComparison(run, run, { margin: null } as unknown as { margin: number })).toThrow("Некорректные параметры compare")
  expect(() => analyzeComparison(run, run, { confidence: null } as unknown as { confidence: number })).toThrow("Некорректные параметры compare")
})

test("analysis: oracle имеет собственный task-paired verdict", () => {
  const a = comparisonSummary(Array.from({length:39}, () => ({successes:3,attempts:3})))
  const b = structuredClone(a)
  b.tasks.forEach((task) => task.attempts.forEach((attempt) => { attempt.oracle_pass = false }))
  expect(analyzeComparison(a,b).axes.oracle).toMatchObject({task_count:39, observed:{a:1,b:0,drop:1},verdict:"worse"})
  expect(analyzeComparison(a,b).axes.completion.verdict).toBe("indistinguishable")
})

test("analysis: structure не подменяется полным смешанным score", () => {
  const a = comparisonSummary(Array.from({length:39}, () => ({successes:3,attempts:3})))
  const b = structuredClone(a)
  b.tasks.forEach((task) => task.attempts.forEach((attempt) => { attempt.structural_score = 0 }))
  expect(analyzeComparison(a,b).axes.structure).toMatchObject({task_count:39, observed:{a:1,b:0,drop:1},verdict:"worse"})
  expect(analyzeComparison(a,b).axes.oracle.verdict).toBe("indistinguishable")
})

test("analysis: смешанный evaluation lineage блокирует свежие оценочные выводы", () => {
 const a = comparisonSummary(Array.from({length:39}, () => ({successes:3,attempts:3})))
 const b = structuredClone(a)
 b.tasks[0]!.attempts[0]!.evaluation_contract_hash = "old-contract"
 const result = analyzeComparison(a,b)
 expect(result.axes.oracle.verdict).toBeNull()
 expect(result.axes.structure.verdict).toBeNull()
 expect(result.reliability.b).toEqual({pass1:null,passk:null})
 expect(result.axes.completion.verdict).toBe("indistinguishable")
 expect(result.axes.structure.reasons).toContain("evaluation_provenance")
})
