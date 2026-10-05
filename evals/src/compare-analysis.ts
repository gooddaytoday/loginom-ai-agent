import type { AttemptResult, RunSummary } from "./report"

export function analyzeComparison(a: RunSummary, b: RunSummary) {
  const rates = a.tasks.map((task) => ({
    a: completion(task.attempts),
    b: completion(b.tasks.find((candidate) => candidate.id === task.id)!.attempts),
  }))
  const first = rates.reduce((sum, rate) => sum + rate.a, 0) / rates.length
  const second = rates.reduce((sum, rate) => sum + rate.b, 0) / rates.length
  return { axes: { completion: { observed: { a: first, b: second, drop: first - second } } } }
}

function completion(attempts: AttemptResult[]) {
  const measured = attempts.filter((attempt) => !["infra_error", "harness_error", "interrupted"].includes(attempt.status))
  return measured.filter((attempt) => attempt.status === "completed").length / measured.length
}
