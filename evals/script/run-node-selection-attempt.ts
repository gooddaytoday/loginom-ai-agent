import path from "node:path"
import type { SelectionMode } from "../src/node-selection"

export type SelectionPins = {
  runID: string
  phase: string
  resultsRoot: string
  workspaceRoot: string
  payload: string
  profile: string
  manifestSha256: string
  expectedSkillDigest: string
  model: string
  variant: string
  frozenModelsPath: string
  frozenModelsSha256: string
  deadlineSeconds: number
  graceSeconds: number
  connection: { url: string; username: string; folder: string }
  container: { id: string; name: string }
  storageDir: string
  tasks: Record<string, {
    directory: string; mode: SelectionMode; attempts: number[]
    promptSha256: string; inputHashes: Record<string, string>; oracleSha256: string
  }>
}

export function selectionAttempt(raw: unknown, taskID: string, number: number) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(taskID)) throw Error("SELECTION_TASK_INVALID")
  if (!record(raw) || !record(raw.tasks) || !record(raw.tasks[taskID])) throw Error("SELECTION_PINS_INVALID")
  const task = raw.tasks[taskID]
  if (!Array.isArray(task.attempts) || !Number.isSafeInteger(number) || !task.attempts.includes(number) || number < 1)
    throw Error("SELECTION_SLOT_INVALID")
  const pins = raw as SelectionPins
  const prefix = `node-selection-${pins.runID}-${taskID}-${pins.phase}-${number}`
  return {
    pins, task: pins.tasks[taskID]!, taskID, number, prefix,
    directory: path.join(pins.resultsRoot, pins.phase, taskID, String(number)),
    workspace: path.join(pins.workspaceRoot, pins.runID, pins.phase, taskID, String(number)),
    packagePath: `${pins.connection.folder}/${prefix}.lgp`, resultName: `${prefix}.result.csv`,
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
