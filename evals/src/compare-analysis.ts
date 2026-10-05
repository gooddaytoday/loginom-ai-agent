import type { RunSummary } from "./report"

export function analyzeComparison(a: RunSummary, b: RunSummary) {
  const rates = a.tasks.map((task) => {
    const second = b.tasks.find((candidate) => candidate.id === task.id)!
    return {
      a: task.attempts.filter((attempt) => attempt.status === "completed").length / task.attempts.length,
      b: second.attempts.filter((attempt) => attempt.status === "completed").length / second.attempts.length,
    }
  })
  const first = rates.reduce((sum, rate) => sum + rate.a, 0) / rates.length
  const second = rates.reduce((sum, rate) => sum + rate.b, 0) / rates.length
  return { axes: { completion: { observed: { a: first, b: second, drop: first - second } } } }
}
