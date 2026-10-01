import path from "node:path"
import { readdir } from "node:fs/promises"
import type { Task } from "./task"

export async function checkOracle(task: Pick<Task, "dir" | "oracle" | "oracleTolerance">, artifactDir: string) {
  if (!task.oracle) return { passed: null, error: null }
  const files = (await readdir(path.join(artifactDir, "results")).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return []
    throw error
  })).filter((name) => name.endsWith(".result.csv"))
  if (files.length !== 1) return { passed: false, error: `Для oracle требуется ровно один .result.csv, найдено ${files.length}` }
  return compareCsv(
    await Bun.file(path.join(task.dir, task.oracle)).text(),
    await Bun.file(path.join(artifactDir, "results", files[0] ?? "")).text(),
    task.oracleTolerance,
  )
}

export function compareCsv(expected: string, actual: string, tolerance = 0.01) {
  const reference = parseCsv(expected)
  if ("error" in reference) throw new Error(`Некорректный oracle CSV: ${reference.error}`)
  const result = parseCsv(actual)
  if ("error" in result) return { passed: false, error: `Некорректный CSV результата: ${result.error}` }
  const left = reference.rows
  const right = result.rows
  if (JSON.stringify(left[0]) !== JSON.stringify(right[0])) return { passed: false, error: "Колонки результата не совпадают с oracle" }
  if (left.length !== right.length) return { passed: false, error: "Количество строк результата не совпадает с oracle" }
  for (const [index, row] of left.entries()) {
    if (row.length !== right[index]?.length) return { passed: false, error: `Строка ${index}: количество полей не совпадает` }
    for (const [column, value] of row.entries()) {
      const found = right[index]?.[column] ?? ""
      if (value === found) continue
      const expectedNumber = number(value)
      const actualNumber = number(found)
      if (index > 0 && expectedNumber !== undefined && actualNumber !== undefined &&
        Math.abs(expectedNumber - actualNumber) <= tolerance + (tolerance ? Number.EPSILON * Math.max(1, Math.abs(expectedNumber), Math.abs(actualNumber)) : 0)) continue
      return { passed: false, error: `Строка ${index}, колонка ${left[0]?.[column]}: результат не совпадает с oracle` }
    }
  }
  return { passed: true, error: null }
}

function parseCsv(source: string) {
  const rows: string[][] = []
  const text = source.replace(/^\uFEFF/, "")
  const header = text.split(/\r?\n/, 1)[0]?.replace(/"(?:[^"]|"")*"/g, "") ?? ""
  const separator = header.includes(";") && !header.includes(",") ? ";" : ","
  let row: string[] = []
  let field = ""
  let quoted = false
  let closed = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
        continue
      }
      if (char === '"') {
        quoted = false
        closed = true
        continue
      }
      field += char
      continue
    }
    if (char === separator || char === "\n" || char === "\r") {
      row.push(field)
      field = ""
      closed = false
      if (char !== separator) {
        rows.push(row)
        row = []
        if (char === "\r" && text[index + 1] === "\n") index++
      }
      continue
    }
    if (char === '"' && !field && !closed) {
      quoted = true
      continue
    }
    if (closed || char === '"') return { error: "некорректные кавычки" }
    field += char
  }
  if (quoted) return { error: "незакрытая кавычка" }
  if (field || row.length || closed) rows.push([...row, field])
  if (!rows.length || rows[0]?.some((name) => !name) || new Set(rows[0]).size !== rows[0]?.length)
    return { error: "пустые или повторяющиеся имена колонок" }
  if (rows.some((value) => value.length !== rows[0]?.length)) return { error: "разное количество полей в строках" }
  return { rows }
}

function number(value: string) {
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return undefined
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : undefined
}
