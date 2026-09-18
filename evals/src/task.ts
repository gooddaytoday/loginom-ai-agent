import path from "node:path"
import { readdir } from "node:fs/promises"
import { EvalFailure } from "./fail"

type Raw = Record<string, unknown>

export async function loadTasks(dir: string, only?: string[]) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => undefined)
  if (!entries) throw new EvalFailure(`Каталог задач не найден: ${dir}`, 2)
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const unknown = (only ?? []).filter((id) => !ids.includes(id))
  if (unknown.length) throw new EvalFailure(`Неизвестные задачи: ${unknown.join(", ")} (доступны: ${ids.join(", ")})`, 2)
  const selected = only ? ids.filter((id) => only.includes(id)) : ids
  if (!selected.length) throw new EvalFailure(`В ${dir} нет задач`, 2)
  return Promise.all(selected.map((id) => loadTask(path.join(dir, id))))
}

export type Task = Awaited<ReturnType<typeof loadTasks>>[number]
export type ChecklistItem = Task["checklist"][number]

async function loadTask(dir: string) {
  const id = path.basename(dir)
  const file = Bun.file(path.join(dir, "task.json"))
  if (!(await file.exists())) throw new EvalFailure(`${id}: нет task.json`, 2)
  const parsed = parseJson(await file.text())
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new EvalFailure(`${id}: task.json не является корректным JSON-объектом`, 2)
  const raw = parsed as Raw
  if (raw.id !== id) throw new EvalFailure(`${id}: поле id ("${String(raw.id)}") должно совпадать с именем каталога`, 2)
  const task = {
    id,
    dir,
    title: text(raw, "title", id),
    prompt: text(raw, "prompt", id),
    inputs: strings(raw, "inputs", id),
    reference: text(raw, "reference", id),
    spec: text(raw, "spec", id),
    checklist: checklist(raw, id),
    expectedOutput: text(raw, "expected_output", id),
    timeoutMs: optionalPositive(raw, "timeout_ms", id),
  }
  for (const rel of [task.reference, task.spec, ...task.inputs]) {
    if (!(await Bun.file(path.join(dir, rel)).exists())) throw new EvalFailure(`${id}: файл "${rel}" не найден`, 2)
  }
  return task
}

// Битый файл отличим от валидного только через исключение JSON.parse — единственный try/catch в модуле.
function parseJson(source: string) {
  try {
    return JSON.parse(source) as unknown
  } catch {
    return undefined
  }
}

function text(raw: Raw, key: string, id: string) {
  const value = raw[key]
  if (typeof value !== "string" || !value.trim())
    throw new EvalFailure(`${id}: поле "${key}" должно быть непустой строкой`, 2)
  return value
}

function strings(raw: Raw, key: string, id: string) {
  const value = raw[key] ?? []
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new EvalFailure(`${id}: поле "${key}" должно быть массивом строк`, 2)
  return value as string[]
}

function optionalPositive(raw: Raw, key: string, id: string) {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new EvalFailure(`${id}: поле "${key}" должно быть положительным целым`, 2)
  return value
}

function checklist(raw: Raw, id: string) {
  const value = raw.checklist
  if (!Array.isArray(value) || !value.length) throw new EvalFailure(`${id}: checklist должен быть непустым массивом`, 2)
  const items = value.map((item: unknown, index) => {
    const entry = (item ?? {}) as Raw
    const itemId = typeof entry.id === "string" && entry.id ? entry.id : undefined
    const itemText = typeof entry.text === "string" && entry.text ? entry.text : undefined
    if (!itemId || !itemText) throw new EvalFailure(`${id}: checklist[${index}] требует непустые id и text`, 2)
    const weight = entry.weight === undefined ? 1 : entry.weight
    if (typeof weight !== "number" || weight <= 0)
      throw new EvalFailure(`${id}: checklist[${index}].weight должен быть положительным числом`, 2)
    const requiresResultFile = entry.requires_result_file === undefined ? false : entry.requires_result_file
    if (typeof requiresResultFile !== "boolean")
      throw new EvalFailure(`${id}: checklist[${index}].requires_result_file должен быть boolean`, 2)
    return { id: itemId, text: itemText, weight, requiresResultFile }
  })
  const duplicates = items.map((item) => item.id).filter((itemId, index, all) => all.indexOf(itemId) !== index)
  if (duplicates.length) throw new EvalFailure(`${id}: повторяющиеся id в checklist: ${duplicates.join(", ")}`, 2)
  return items
}

export async function agentInputsHash(tasks: Task[]) {
  const hasher = new Bun.CryptoHasher("sha256")
  for (const task of tasks) {
    hasher.update(`${task.id}\n${task.prompt}\n${task.inputs.join(",")}\n`)
    for (const input of [...task.inputs].sort()) hasher.update(await Bun.file(path.join(task.dir, input)).bytes())
  }
  return hasher.digest("hex")
}

export async function rubricHash(tasks: Task[]) {
  const hasher = new Bun.CryptoHasher("sha256")
  for (const task of tasks) {
    hasher.update(`${task.id}\n${JSON.stringify(task.checklist)}\n${task.expectedOutput}\n`)
    hasher.update(await Bun.file(path.join(task.dir, task.spec)).bytes())
    hasher.update(await Bun.file(path.join(task.dir, task.reference)).bytes())
  }
  return hasher.digest("hex")
}
