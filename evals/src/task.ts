import path from "node:path"
import { readdir } from "node:fs/promises"
import { EvalFailure } from "./fail"
import type { EvalConfig } from "./config"

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
  const selected = only
    ? ids.filter((id) => only.includes(id))
    : (await Promise.all(ids.map(async (id) => {
        if (await Bun.file(path.join(dir, id, "task.json")).exists()) return id
        console.error(`Предупреждение: ${id}: нет task.json, каталог пропущен`)
        return undefined
      }))).filter((id): id is string => id !== undefined)
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
  if (raw.output_mode !== undefined && raw.output_mode !== "diagnostic")
    throw new EvalFailure(`${id}: output_mode должен быть diagnostic или отсутствовать`, 2)
  const task = {
    id,
    dir,
    title: text(raw, "title", id),
    prompt: text(raw, "prompt", id),
    inputs: strings(raw, "inputs", id),
    reference: raw.output_mode === "diagnostic" ? "" : text(raw, "reference", id),
    ...(raw.output_mode === "diagnostic" ? { outputMode: "diagnostic" as const } : {}),
    spec: text(raw, "spec", id),
    checklist: checklist(raw, id),
    expectedOutput: text(raw, "expected_output", id),
    timeoutMs: optionalPositive(raw, "timeout_ms", id),
    oracle: await Bun.file(path.join(dir, "oracle.csv")).exists() ? "oracle.csv" : undefined,
    oracleTolerance: oracleTolerance(raw, id),
  }
  for (const rel of [task.reference, task.spec, ...task.inputs].filter(Boolean)) {
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

function oracleTolerance(raw: Raw, id: string) {
  const value = raw.oracle_tolerance === undefined ? 0.01 : raw.oracle_tolerance
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new EvalFailure(`${id}: oracle_tolerance должен быть конечным неотрицательным числом`, 2)
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
    const requiresRun = entry.requires_run === undefined ? false : entry.requires_run
    if (typeof requiresRun !== "boolean")
      throw new EvalFailure(`${id}: checklist[${index}].requires_run должен быть boolean`, 2)
    const required = entry.required === undefined ? false : entry.required
    if (typeof required !== "boolean")
      throw new EvalFailure(`${id}: checklist[${index}].required должен быть boolean`, 2)
    const axis = entry.axis === "structure" || entry.axis === "result" || entry.axis === "report" ? entry.axis : undefined
    if (entry.axis !== undefined && axis === undefined) throw new EvalFailure(`${id}: checklist[${index}].axis должна быть structure, result или report`, 2)
    return { id: itemId, text: itemText, weight, requiresResultFile, requiresRun, required, ...(axis === undefined ? {} : { axis } as const) }
  })
  const duplicates = items.map((item) => item.id).filter((itemId, index, all) => all.indexOf(itemId) !== index)
  if (duplicates.length) throw new EvalFailure(`${id}: повторяющиеся id в checklist: ${duplicates.join(", ")}`, 2)
  return items
}

export const agentPromptTail =
  "Сохрани готовый пакет как `{package_path}`. " +
  "Если задача требует выгрузку в файл, назови его `{result_name}`. " +
  "Уточняющих вопросов не задавай — принимай разумные решения самостоятельно и доведи задачу до конца."

export const diagnosticPromptTail = "Выполни заданный диагностический протокол и сообщи наблюдаемый исход. " +
  "Ожидаемый отказ не требует успешного пакета или выгрузки. Уточняющих вопросов не задавай."

export function buildAgentPrompt(prompt: string, packagePath: string, resultName: string, outputMode?: "diagnostic") {
  return `${prompt.replaceAll("{{PACKAGE_PATH}}", () => packagePath)}\n\n${outputMode === "diagnostic" ? diagnosticPromptTail : agentPromptTail.replace("{package_path}", () => packagePath).replace("{result_name}", () => resultName)}`
}

export function taskTimeoutMs(config: Pick<EvalConfig, "timeoutMs" | "taskTimeoutMs">, task: Task) {
  return config.timeoutMs ?? task.timeoutMs ?? config.taskTimeoutMs
}

export async function agentInputsHash(tasks: Task[], tail = agentPromptTail) {
  const hasher = new Bun.CryptoHasher("sha256")
  hashPart(hasher, "prompt_tail", tail)
  for (const task of tasks) {
    hasher.update(`${task.id}\n`)
    if (task.outputMode) hashPart(hasher, "diagnostic_prompt_tail", diagnosticPromptTail)
    hashPart(hasher, "prompt", task.prompt)
    for (const rel of [...task.inputs].sort()) hashPart(hasher, `input:${rel}`, await Bun.file(path.join(task.dir, rel)).bytes())
  }
  return hasher.digest("hex")
}

export async function rubricHash(tasks: Task[]) {
  const hasher = new Bun.CryptoHasher("sha256")
  for (const task of tasks) {
    hasher.update(`${task.id}\n`)
    hashPart(hasher, "checklist", JSON.stringify(task.checklist))
    hashPart(hasher, "expected_output", task.expectedOutput)
    hashPart(hasher, "spec", await Bun.file(path.join(task.dir, task.spec)).bytes())
    if (task.outputMode) hashPart(hasher, "output_mode", task.outputMode)
    if (task.reference) hashPart(hasher, "reference", await Bun.file(path.join(task.dir, task.reference)).bytes())
    if (task.oracle) {
      hashPart(hasher, "oracle", await Bun.file(path.join(task.dir, task.oracle)).bytes())
      hashPart(hasher, "oracle_tolerance", String(task.oracleTolerance))
    }
  }
  return hasher.digest("hex")
}

function hashPart(hasher: Bun.CryptoHasher, label: string, data: string | Uint8Array) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  hasher.update(`${label}:${bytes.byteLength}\n`)
  hasher.update(bytes)
}
