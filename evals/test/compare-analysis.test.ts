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
