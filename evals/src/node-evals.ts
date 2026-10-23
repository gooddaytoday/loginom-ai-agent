import path from "node:path"
import type { AttemptResult, RunSummary } from "./report"
import type { SlotDefinition } from "./slots"
import { evalsRoot } from "./config"
import { checkOracle } from "./oracle"
import { readdir } from "node:fs/promises"
import { checkNodeXml, readNodeXml } from "./node-xml"
import { checkNodeEvidence } from "./node-evidence"
import { coverageCaseIds, nodeCaseIds } from "./node-cases"
import { collectNodeNativeEvidence } from "./node-native"
import { collectTextImportEvidence, textImportIds, textImportChecks, validateTextImportAttempt } from "./text-import"
import { confirmedProfileArchive } from "./profile-archive"

export async function assessNodeAttempt(input: { runDir: string; taskId: string; tasksDir: string;
  slot?: Pick<SlotDefinition, "id" | "profileDir" | "historyDir"> }) {
  const errors: string[] = [], failures: string[] = []
  const prefix = `${input.taskId}#1:`
  const directory = path.join(input.runDir, input.taskId, "1")
  let result: AttemptResult | undefined
  try {
    const task = await Bun.file(path.join(input.tasksDir, input.taskId, "task.json")).json() as { id: string; checklist: { id: string; required?: boolean }[] }
    if (task.id !== input.taskId || !(nodeCaseIds as readonly string[]).includes(task.id) && !textImportIds.includes(task.id))
      throw Error("unsupported node case or task identity differs")
    for (const item of task.checklist)
      if (item.required && !(textImportIds.includes(task.id) ? textImportChecks : ["input", "crosstable", "graph", "export", "result", "sequence"]).includes(item.id))
        throw Error(`unknown required ID: ${item.id}`)
    result = await Bun.file(path.join(directory, "result.json")).json() as AttemptResult
    if (result.task_id !== input.taskId || result.attempt !== 1) throw Error("attempt identity differs")
    if (!["completed", "failed", "timeout", "no_artifact"].includes(result.status) || result.harness_error || result.failure_kind === "provider" ||
      result.judge_status !== "skipped" || result.pass !== null || result.score !== null) throw Error(`technical node result: ${result.status}`)
    if (result.cleanup_error || result.environment_cleanup?.status !== "confirmed") throw Error("cleanup unconfirmed")
    const cleanup = await Bun.file(path.join(directory, "cleanup.json")).json()
    if (cleanup.processes?.observation_mode === "unit_after_exit") throw Error("unit_after_exit cleanup evidence cannot confirm node attempt")
    if (input.slot) {
      if (result.slot_id !== input.slot.id || cleanup.slotId !== input.slot.id || typeof cleanup.archive !== "string" ||
        !/^[a-f0-9]{64}$/.test(cleanup.serverEpoch ?? "") || cleanup.processes?.error !== null || cleanup.processes?.observation_mode !== "continuous")
        throw Error("cleanup evidence unconfirmed")
      await confirmedProfileArchive(directory, input.slot.profileDir, input.slot.historyDir)
    } else if (cleanup.result?.status !== "confirmed" || cleanup.result?.error || cleanup.processes?.status !== "confirmed" ||
      !["processes", "diagnostics", "writer", "ready"].every(stage => cleanup.stages?.some((item: { stage: string; status: string }) => item.stage === stage && item.status === "confirmed")) ||
      !cleanup.stages?.some((item: { stage: string; status: string }) => ["pruning", "profile_history"].includes(item.stage) && item.status === "confirmed"))
      throw Error("cleanup evidence unconfirmed")
    if (result.status !== "completed") failures.push(`${prefix} ${result.status}`)
    if (result.status === "completed") {
      const native = task.id === "crosstable-min-max" || coverageCaseIds.includes(task.id)
      if (native || textImportIds.includes(task.id)) {
        const profile = input.slot?.profileDir ?? (await Bun.file(path.join(input.runDir, "config.json")).json()).profileDir as string
        if (native) await collectNodeNativeEvidence(directory, profile, input.slot?.historyDir)
        if (textImportIds.includes(task.id)) await collectTextImportEvidence(directory, profile, input.slot?.historyDir)
      }
      const content = await validateNodeAttempt(path.join(input.tasksDir, task.id), directory, result.package_path ?? undefined)
      errors.push(...content.errors.map(error => `${prefix} ${error}`))
      failures.push(...content.failures.map(failure => `${prefix} ${failure}`))
    }
  } catch (error) { errors.push(`${prefix} ${error instanceof Error ? error.message : String(error)}`) }
  const verdict = errors.length ? "ERROR" : failures.length ? "FAIL" : "PASS"
  return { verdict, code: errors.length ? 2 : failures.length ? 1 : 0, errors, failures,
    attempts: result ? [{ task_id: input.taskId, attempt: 1, status: result.status, session_id: result.session_id,
      cleanup: result.environment_cleanup?.status, infra_retry_initial: result.infra_retry?.initial ?? null, verdict }] : [] }
}

export async function validateNodeAttempt(taskDir: string, attemptDir: string, packagePath?: string) {
  const task = await Bun.file(path.join(taskDir, "task.json")).json() as { id: string; checklist: { id: string; required?: boolean }[] }
  if (textImportIds.includes(task.id)) return validateTextImportAttempt(taskDir, attemptDir, packagePath)
  if (!(nodeCaseIds as readonly string[]).includes(task.id)) return { errors: [`unsupported node case: ${task.id}`], failures: [] }
  const known = ["input", "crosstable", "graph", "export", "result", "sequence"]
  const errors = task.checklist.filter((item) => item.required && !known.includes(item.id)).map((item) => `unknown required ID: ${item.id}`)
  const failures = await Bun.file(path.join(attemptDir, "artifact/package.lgp")).exists() ? [] : ["missing artifact/package.lgp"]
  const required = new Set(task.checklist.filter(i => i.required).map(i => i.id))
  if (!failures.length && ["input", "crosstable", "graph", "export", "sequence"].some(id => required.has(id))) {
    const xml = await readNodeXml(path.join(attemptDir, "artifact"))
    if ("invalid" in xml) failures.push(`package: ${xml.invalid}`)
    else {
      const id = (task as { id?: string }).id ?? ""
      failures.push(...checkNodeXml(xml, id, required).failures)
      if (["input", "export", "sequence"].some(id => required.has(id))) failures.push(...await checkNodeEvidence(taskDir, attemptDir, id, required, xml, packagePath))
    }
  }
  if (task.checklist.some((item) => item.required && item.id === "result")) {
    const result = await checkOracle({ dir: taskDir, oracle: "oracle.csv", oracleTolerance: 0 }, path.join(attemptDir, "artifact"))
    if (!result.passed) failures.push(`result: ${result.error}`)
    const files = (await readdir(path.join(attemptDir, "artifact/results")).catch(() => [])).filter((name) => name.endsWith(".result.csv"))
    if (files.length === 1 && !(await Bun.file(path.join(attemptDir, "artifact/results", files[0]!)).text()).split(/\r?\n/)[0]?.includes(","))
      failures.push("result: comma delimiter required")
  }
  return { errors, failures }
}

export async function validateNodeRun(runDir: string, taskIds: string[], tasksDir = path.join(evalsRoot, "tasks/node-evals")) {
  try { return await validateRun(runDir, taskIds, tasksDir) }
  catch (error) { return { verdict: "ERROR", code: 2, errors: [`validator: ${error instanceof Error ? error.message : String(error)}`], failures: [], attempts: [] } }
}

export function requireNodeEvidenceSlot(summary: RunSummary, slotId: string | undefined) {
  const slots = summary.slots?.filter(slot => slot.id === slotId)
  if (slots && slots.length !== 1 || !slots && (summary.config.parallel ?? 1) > 1)
    throw Error("Unknown node evidence slot")
  return slots?.[0]
}

async function validateRun(runDir: string, taskIds: string[], tasksDir: string) {
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
  if (summary.config.repeat !== 1 || !taskIds.length || new Set(taskIds).size !== taskIds.length ||
    summary.tasks.length !== taskIds.length || summary.tasks.some(t => !taskIds.includes(t.id)) || new Set(summary.tasks.map(t => t.id)).size !== taskIds.length)
    errors.push("incomplete/unexpected task collection or repeat")
  for (const id of taskIds) {
    if (!(nodeCaseIds as readonly string[]).includes(id) && !textImportIds.includes(id)) errors.push(`unsupported node case: ${id}`)
    const task = await Bun.file(path.join(tasksDir, id, "task.json")).json()
    if (task.id !== id) errors.push(`${id}: task identity differs`)
    for (const item of task.checklist) if (item.required && !(textImportIds.includes(id) ? textImportChecks : ["input", "crosstable", "graph", "export", "result", "sequence"]).includes(item.id))
      errors.push(`${id}: unknown required ID: ${item.id}`)
  }
  for (const task of summary.tasks) for (const attempt of task.attempts) {
    const slot = requireNodeEvidenceSlot(summary, attempt.slot_id)
    if (attempt.attempt !== 1 || !["completed", "failed", "timeout", "no_artifact", "infra_error", "harness_error", "interrupted"].includes(attempt.status))
      errors.push(`${task.id}: invalid attempt number/status`)
    const evidence = Bun.file(path.join(runDir, task.id, String(attempt.attempt), "cleanup.json"))
    if (!(await evidence.exists())) { errors.push(`${task.id}: cleanup.json missing`); continue }
    const cleanup = await evidence.json()
    if (cleanup.processes?.observation_mode === "unit_after_exit") errors.push(`${task.id}: unit_after_exit cleanup evidence cannot confirm node run`)
    // The legacy runner also publishes its single, unqualified default slot.
    if (slot && !(slot.id === "default" && slot.liveQualified === false && !slot.lease_receipt && (summary.config.parallel ?? 1) === 1)) {
      if (slot.state !== "closed" || slot.liveQualified !== true || cleanup.slotId !== slot.id || typeof cleanup.archive !== "string" ||
        !/^[a-f0-9]{64}$/.test(cleanup.serverEpoch ?? "") || cleanup.processes?.error !== null ||
        cleanup.processes?.observation_mode !== "continuous") {
        errors.push(`${task.id}: cleanup evidence unconfirmed`)
        continue
      }
      await confirmedProfileArchive(path.join(runDir, task.id, String(attempt.attempt)), slot.profileDir, slot.historyDir)
      continue
    }
    if (cleanup.result?.status !== "confirmed" || cleanup.result?.error || cleanup.processes?.status !== "confirmed" ||
      !["processes", "diagnostics", "writer", "ready"].every(stage => cleanup.stages?.some((s: { stage: string; status: string }) => s.stage === stage && s.status === "confirmed")) ||
      !cleanup.stages?.some((s: { stage: string; status: string }) => ["pruning", "profile_history"].includes(s.stage) && s.status === "confirmed"))
      errors.push(`${task.id}: cleanup evidence unconfirmed`)
  }
  const failures = summary.tasks.flatMap((task) => task.attempts.flatMap((attempt) =>
    ["failed", "timeout", "no_artifact"].includes(attempt.status) ? [`${task.id}#${attempt.attempt}: ${attempt.status}`] : []))
  if (!errors.length) {
    for (const task of summary.tasks) {
      for (const attempt of task.attempts.filter((item) => item.status === "completed")) {
        const result = await validateNodeAttempt(path.join(tasksDir, task.id), path.join(runDir, task.id, String(attempt.attempt)), attempt.package_path ?? undefined)
        errors.push(...result.errors.map((error) => `${task.id}#${attempt.attempt}: ${error}`))
        failures.push(...result.failures.map((failure) => `${task.id}#${attempt.attempt}: ${failure}`))
      }
    }
  }
  const attempts = summary.tasks.flatMap(task => task.attempts.map(attempt => {
    const prefix = `${task.id}#${attempt.attempt}:`
    return { task_id: task.id, attempt: attempt.attempt, status: attempt.status, session_id: attempt.session_id,
      cleanup: attempt.environment_cleanup?.status, infra_retry_initial: attempt.infra_retry?.initial ?? null,
      verdict: errors.length ? "ERROR" : failures.some(f => f.startsWith(prefix)) ? "FAIL" : "PASS" }
  }))
  return { verdict: errors.length ? "ERROR" : failures.length ? "FAIL" : "PASS", code: errors.length ? 2 : failures.length ? 1 : 0, errors, failures, attempts }
}
