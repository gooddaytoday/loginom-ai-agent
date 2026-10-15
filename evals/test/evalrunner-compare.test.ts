import { expect, test } from "bun:test"
import { describeEvalrunnerComparison } from "../src/evalrunner-compare"

test("descriptive comparison separates changed rubric and node code, preserves unknown monetary and judge usage", () => {
  const rows = ["regular:calc-data-double", "analytic:category-rating-revenue", "node:crosstable-fixed-sum"].flatMap(caseKey =>
    [1, 2, 3].map(round => ({ caseKey, round, verdict: "PASS", status: "completed", score: caseKey.startsWith("node:") ? null : 100,
      durationMs: 100, tokens: { input: 10, output: 2, reasoning: 1 }, failures: [], startedAt: "2026-10-15T00:00:00Z", finishedAt: "2026-10-15T00:00:01Z" })))
  const report = describeEvalrunnerComparison(rows, rows, { baseline: {}, current: {} })
  expect(report.comparison).toBe("DESCRIPTIVE_ONLY/INCOMPARABLE")
  expect(report.unchanged47.cases.map(row => row.caseKey)).not.toContain("analytic:category-rating-revenue")
  expect(report.changedRubric.cases.length).toBe(1)
  expect(report.all.collections.node.baseline.meanScore).toBe(null)
  expect(report.all.collections.node.baseline.passed).toBe(3)
  expect(report.all.collections.node.baseline.judgeTokens).toBe(null)
  expect(report.all.collections.regular.baseline.monetaryCost).toBe(null)
  expect(report.all.collections.regular.baseline.productDurationSumMs).toBe(300)
  expect(report.all.collections.regular.baseline.calendarDurationMs).toBe(1000)
})
