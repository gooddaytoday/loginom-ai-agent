import path from "node:path"
import type { RunSummary } from "./report"
import { evalsRoot } from "./config"
import { checkOracle } from "./oracle"

export async function validateNodeAttempt(taskDir: string, attemptDir: string) {
  const task = await Bun.file(path.join(taskDir, "task.json")).json() as { checklist: { id: string; required?: boolean }[] }
  const known = ["input", "crosstable", "graph", "export", "result", "sequence"]
  const errors = task.checklist.filter((item) => item.required && !known.includes(item.id)).map((item) => `unknown required ID: ${item.id}`)
  const failures = await Bun.file(path.join(attemptDir, "artifact/package.lgp")).exists() ? [] : ["missing artifact/package.lgp"]
  if (task.checklist.some((item) => item.required && item.id === "result")) {
    const result = await checkOracle({ dir: taskDir, oracle: "oracle.csv", oracleTolerance: 0 }, path.join(attemptDir, "artifact"))
    if (!result.passed) failures.push(`result: ${result.error}`)
  }
  return { errors, failures }
}

export async function validateNodeRun(runDir: string, taskIds: string[], tasksDir = path.join(evalsRoot, "tasks/node-evals")) {
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
  if (!errors.length) {
    for (const task of summary.tasks) {
      for (const attempt of task.attempts.filter((item) => item.status === "completed")) {
        const result = await validateNodeAttempt(path.join(tasksDir, task.id), path.join(runDir, task.id, String(attempt.attempt)))
        errors.push(...result.errors.map((error) => `${task.id}#${attempt.attempt}: ${error}`))
        failures.push(...result.failures.map((failure) => `${task.id}#${attempt.attempt}: ${failure}`))
      }
    }
  }
  return { verdict: errors.length ? "ERROR" : failures.length ? "FAIL" : "PASS", code: errors.length ? 2 : failures.length ? 1 : 0, errors, failures }
}
