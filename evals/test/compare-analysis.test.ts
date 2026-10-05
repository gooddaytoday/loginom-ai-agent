import { expect, test } from "bun:test"
import { analyzeComparison } from "../src/compare-analysis"
import { comparisonSummary } from "./helpers/compare-summary"

test("analysis: задачи имеют равный вес при разных числах попыток", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }, { successes: 0, attempts: 1 }])
  const b = comparisonSummary([{ successes: 0, attempts: 3 }, { successes: 1, attempts: 1 }])
  expect(analyzeComparison(a, b).axes.completion.observed).toEqual({ a: 0.5, b: 0.5, drop: 0 })
})
