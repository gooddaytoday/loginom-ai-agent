import path from "node:path"
import type { RunSummary } from "./report"

export async function validateNodeAttempt(taskDir: string, attemptDir: string) {
  const task = await Bun.file(path.join(taskDir, "task.json")).json() as { checklist: { id: string; required?: boolean }[] }
  const known = ["input", "crosstable", "graph", "export", "result", "sequence"]
  return { errors: task.checklist.filter((item) => item.required && !known.includes(item.id)).map((item) => `unknown required ID: ${item.id}`), failures: [] as string[] }
}

export async function validateNodeRun(runDir: string, taskIds: string[]) {
  const summary = await Bun.file(path.join(runDir, "summary.json")).json() as RunSummary
  const errors = [
    ...(summary.interrupted || summary.stopped_reason ? ["interrupted/stopped run"] : []),
    ...(summary.storage_leftovers === null || summary.storage_leftovers.length ? ["storage cleanup unconfirmed"] : []),
    ...taskIds.flatMap((id) => {
    const task = summary.tasks.find((task) => task.id === id)
    if (task?.attempts.length !== summary.config.repeat) return [`incomplete: ${id}`]
    return task.attempts.flatMap((attempt) => {
      if (["infra_error", "harness_error", "interrupted"].includes(attempt.status)) return [`${id}#${attempt.attempt}: ${attempt.status}`]
      if (attempt.cleanup_error || attempt.environment_cleanup?.status !== "confirmed") return [`${id}#${attempt.attempt}: cleanup unconfirmed`]
      return []
    })
  })]
  const failures = summary.tasks.flatMap((task) => task.attempts.flatMap((attempt) =>
    ["failed", "timeout", "no_artifact"].includes(attempt.status) ? [`${task.id}#${attempt.attempt}: ${attempt.status}`] : []))
  return { verdict: errors.length ? "ERROR" : failures.length ? "FAIL" : "PASS", code: errors.length ? 2 : failures.length ? 1 : 0, errors, failures }
}
