// Проверяет набор кейсов так же, как harness с --tasks, плюс соглашения skill. Ненулевой код — набор нельзя отдавать в eval.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { readSettings } from "./settings"

type Item = { id: string; text: string; requiresResultFile: boolean; requiresRun: boolean; required: boolean }

if (!process.argv[2]) throw new Error("usage: bun validate_collection.ts <collection_dir>")
const collection = path.resolve(process.argv[2])
const settings = readSettings("AGENT_REPO")
const { loadTasks, agentInputsHash, rubricHash } = await import(path.join(settings.AGENT_REPO, "evals/src/task.ts"))
const { compareCsv } = await import(path.join(settings.AGENT_REPO, "evals/src/oracle.ts"))
const tasks = await loadTasks(collection)
const errors: string[] = []
const warnings: string[] = []
for (const task of tasks) {
  const checklist: Item[] = task.checklist
  const resultItems = checklist.filter((item) => item.requiresResultFile)
  const runItems = checklist.filter((item) => item.requiresRun).length
  const requiredItems = checklist.filter((item) => item.required && !item.requiresResultFile).length
  const basenames = task.inputs.map((input: string) => path.basename(input))
  if (new Set(basenames).size !== basenames.length) errors.push(`${task.id}: harness копирует входы по basename, имена совпадают: ${basenames}`)
  if (resultItems.length > 1) errors.push(`${task.id}: пунктов requires_result_file ${resultItems.length}, нужен не больше одного`)
  if (Boolean(task.oracle) !== (resultItems.length === 1))
    errors.push(`${task.id}: oracle.csv есть ровно тогда, когда есть пункт requires_result_file`)
  if (task.oracle) {
    const oracle = readFileSync(path.join(task.dir, task.oracle), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trimEnd()
    const parsed = oracleError(oracle, task.oracleTolerance)
    if (parsed) errors.push(`${task.id}: oracle.csv не разбирается harness: ${parsed}`)
    if (resultItems.length === 1 && !resultItems[0].text.includes(oracle))
      warnings.push(`${task.id}: пункт ${resultItems[0].id} не содержит oracle.csv целиком, а судья видит только текст пункта`)
    if (oracle.split("\n").length > 51) warnings.push(`${task.id}: в oracle.csv больше 50 строк данных, пункт результата станет громоздким`)
  }
  if (!requiredItems) warnings.push(`${task.id}: нет пунктов required: true, правильный CSV компенсирует неверный граф`)
  if (checklist.length < 5 || checklist.length > 8) warnings.push(`${task.id}: в чеклисте ${checklist.length} пунктов, ожидается 5–8`)
  if (runItems !== 1) warnings.push(`${task.id}: пунктов requires_run ${runItems}, обычно один`)
  const acceptancePath = path.join(task.dir, "acceptance.json")
  if (!existsSync(acceptancePath)) warnings.push(`${task.id}: нет acceptance.json`)
  if (existsSync(acceptancePath) && "result" in JSON.parse(readFileSync(acceptancePath, "utf8")))
    errors.push(`${task.id}: блок result в acceptance.json устарел, сверку задают oracle.csv и oracle_tolerance`)
  if (!existsSync(path.join(task.dir, "oracle.py"))) warnings.push(`${task.id}: нет oracle.py`)
  if (!existsSync(path.join(task.dir, "provenance.json"))) warnings.push(`${task.id}: нет provenance.json`)
  console.log(`${task.id} checklist=${checklist.length} required=${requiredItems} result_file=${resultItems.length} run=${runItems} oracle=${task.oracle ?? "—"}`)
}
const secrets = secretValues(path.join(settings.AGENT_REPO, "evals/.env"))
const leaked = walk(collection).filter((file) => {
  const bytes = readFileSync(file)
  return secrets.some((secret) => bytes.includes(secret))
})
if (leaked.length) errors.push(`секрет из evals/.env найден в: ${leaked}`)
const empty = emptyDirectories(collection)
if (empty.length) errors.push(`пустые каталоги: ${empty}`)
console.log(`agent_inputs_hash ${await agentInputsHash(tasks)}`)
console.log(`rubric_hash ${await rubricHash(tasks)}`)
for (const warning of warnings) console.log(`warning ${warning}`)
for (const error of errors) console.log(`error ${error}`)
process.exit(errors.length ? 1 : 0)

// compareCsv бросает исключение на некорректном oracle; сверка oracle с самим собой проверяет только разбор
function oracleError(oracle: string, tolerance: number) {
  try {
    compareCsv(oracle, oracle, tolerance)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function secretValues(envFile: string) {
  if (!existsSync(envFile)) return []
  return readFileSync(envFile, "utf8")
    .split("\n")
    .flatMap((line) => {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (!match || !match[2]) return []
      return ["KEY", "PASSWORD", "TOKEN"].some((word) => match[1].includes(word)) ? [Buffer.from(match[2])] : []
    })
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(child)
    return entry.isFile() ? [child] : []
  })
}

function emptyDirectories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return []
    const child = path.join(dir, entry.name)
    const nested = emptyDirectories(child)
    return readdirSync(child).length === 0 ? [child, ...nested] : nested
  })
}
