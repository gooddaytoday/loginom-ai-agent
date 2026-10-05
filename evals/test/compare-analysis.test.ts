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
