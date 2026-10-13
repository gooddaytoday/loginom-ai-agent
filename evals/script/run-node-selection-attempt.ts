import path from "node:path"
import { mkdir, mkdtemp } from "node:fs/promises"
import { createHash } from "node:crypto"
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
  if (
    !identifier(raw.runID) || !identifier(raw.phase) ||
    ![raw.resultsRoot, raw.workspaceRoot, raw.payload, raw.profile, raw.frozenModelsPath, task.directory].every(absolute) ||
    ![raw.manifestSha256, raw.expectedSkillDigest, raw.frozenModelsSha256, task.promptSha256, task.oracleSha256].every(digest) ||
    typeof raw.model !== "string" || !/^[^\s/]+\/[^\s/]+$/.test(raw.model) ||
    typeof raw.variant !== "string" || !identifier(raw.variant) ||
    raw.deadlineSeconds !== 1800 || raw.graceSeconds !== 90 ||
    !record(raw.connection) || !record(raw.container) || !digest(raw.container.id) ||
    !identifier(raw.container.name) || typeof raw.connection.username !== "string" ||
    !raw.connection.username || [".", ".."].includes(raw.connection.username) ||
    /[\\/\x00-\x1f\x7f]/.test(raw.connection.username) || raw.connection.folder !== "/" + raw.connection.username ||
    raw.storageDir !== "/workdir/UserStorage" + raw.connection.folder ||
    typeof raw.connection.url !== "string" || !URL.canParse(raw.connection.url) ||
    !["http:", "https:"].includes(new URL(raw.connection.url).protocol) ||
    new URL(raw.connection.url).username || new URL(raw.connection.url).password ||
    typeof task.mode !== "string" || !["standard", "explicit-js", "capability-gap", "standard-recovery"].includes(task.mode) ||
    !record(task.inputHashes) || !Object.keys(task.inputHashes).length ||
    Object.entries(task.inputHashes).some(([name, hash]) => !relativeFile(name) || !digest(hash)) ||
    path.basename(String(task.directory)) !== taskID
  ) throw Error("SELECTION_PINS_INVALID")
  const pins = raw as SelectionPins
  const roots = [pins.resultsRoot, pins.workspaceRoot, pins.payload, pins.profile]
  if (roots.some((root, index) => roots.some((other, otherIndex) =>
    index !== otherIndex && (root === other || root.startsWith(other + path.sep))))) throw Error("SELECTION_PINS_INVALID")
  const prefix = `node-selection-${pins.runID}-${taskID}-${pins.phase}-${number}`
  return {
    pins, task: pins.tasks[taskID]!, taskID, number, prefix,
    directory: path.join(pins.resultsRoot, pins.phase, taskID, String(number)),
    workspace: path.join(pins.workspaceRoot, pins.runID, pins.phase, taskID, String(number)),
    packagePath: `${pins.connection.folder}/${prefix}.lgp`, resultName: `${prefix}.result.csv`,
  }
}

export async function reserveAttempt(plan: ReturnType<typeof selectionAttempt>) {
  await mkdir(path.dirname(plan.directory), { recursive: true, mode: 0o700 })
  await mkdir(plan.directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw Error("SELECTION_SLOT_EXISTS")
    throw error
  })
  await mkdir(plan.workspace, { recursive: true, mode: 0o700 })
  const workspace = await mkdtemp(path.join(plan.workspace, "inputs-"))
  await mkdir(path.join(plan.directory, "artifact/results"), { recursive: true, mode: 0o700 })
  return { ...plan, workspace }
}

export async function runSelectionAttempt(pinsFile: string, taskID: string, number: number) {
  if (!absolute(pinsFile)) throw Error("SELECTION_PINS_PATH_INVALID")
  const plan = selectionAttempt(await Bun.file(pinsFile).json() as unknown, taskID, number)
  await mkdir(path.join(plan.pins.resultsRoot, "incidents"), { recursive: true, mode: 0o700 })
  const evidence = await mkdtemp(path.join(plan.pins.resultsRoot, "incidents", `${plan.prefix}-`))
  const result = { exitCode: 3, evidence, modelStarted: false, blocker: "SELECTION_DISPATCH_NOT_IMPLEMENTED" }
  const manifest = await Bun.file(path.join(plan.pins.payload, "cli-manifest.json")).bytes()
  if (createHash("sha256").update(manifest).digest("hex") !== plan.pins.manifestSha256)
    result.blocker = "SELECTION_MANIFEST_MISMATCH"
  await Bun.write(path.join(evidence, "attempt.json"), JSON.stringify(result, null, 2) + "\n")
  return result
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)
}

function absolute(value: unknown): value is string {
  return typeof value === "string" && path.isAbsolute(value) && path.resolve(value) === value && value !== "/"
}

function relativeFile(value: string) {
  return !!value && !path.isAbsolute(value) && !value.includes("\\") && !value.split("/").some((part) => !part || part === "." || part === "..")
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}
