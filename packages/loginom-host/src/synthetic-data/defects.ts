import { cellText, copyCell, type Cell, type DefectRecord, type TableData } from "./cells"
import { numberOf } from "./generate"
import type { Rng } from "./rng"
import type { Column, Defect, Table } from "./spec"

const alphabet = "абвгдежзийклмнопрстуфхцчшщыэюяaeiou"

export function applyDefects(rng: Rng, tables: Array<{ spec: Table; data: TableData }>, defects: Defect[]) {
  const records: DefectRecord[] = []
  for (const defect of defects) {
    const table = tables.find((item) => item.spec.name === defect.table)
    if (!table) continue
    if (defect.kind === "duplicate") duplicate(rng, table.data, defect, records)
    else if (defect.kind === "broken_row") broken(rng, table.data, defect, records)
    else change(rng, table, defect, tables, records)
  }
  return records
}

function change(rng: Rng, table: { spec: Table; data: TableData }, defect: Exclude<Defect, { kind: "duplicate" | "broken_row" }>, tables: Array<{ spec: Table; data: TableData }>, records: DefectRecord[]) {
  const column = table.spec.columns.find((item) => item.name === defect.column)
  const index = table.data.columns.indexOf(defect.column)
  if (!column || index < 0) return
  const length = table.data.rows.length
  if (defect.kind === "missing" && defect.mechanism === "block") {
    for (let row = 0; row < length; row += defect.length) {
      if (!rng.chance(defect.rate)) continue
      for (let offset = 0; offset < defect.length && row + offset < length; offset += 1) write(table.data, row + offset, index, defect.column, "missing", blank(defect), records)
    }
    return
  }
  const stats = defect.kind === "outlier" ? distribution(table.data, index) : undefined
  for (let row = 0; row < length; row += 1) {
    if (defect.kind === "missing" && defect.mechanism === "depends" && defect.when && !matches(table.data.rows[row] ?? [], table.data.columns, defect.when)) continue
    if (!rng.chance(defect.rate)) continue
    const cell = table.data.rows[row]?.[index]
    if (!cell) continue
    const next = replacement(rng, defect, column, cell, stats, tables)
    if (next) write(table.data, row, index, defect.column, defect.kind === "noise" ? defect.noise : defect.kind, next, records)
  }
}

function replacement(rng: Rng, defect: Exclude<Defect, { kind: "duplicate" | "broken_row" }>, column: Column, cell: Cell, stats: Stats | undefined, tables: Array<{ spec: Table; data: TableData }>): Cell | undefined {
  if (defect.kind === "missing") return blank(defect)
  if (cell.kind === "null") return
  if (defect.kind === "outlier" && cell.kind === "number" && stats) return { kind: "number", value: outlier(rng, defect, cell.value, stats), scale: cell.scale }
  if (defect.kind === "noise") return noise(rng, defect, cell)
  if (defect.kind === "text_in_number" && cell.kind === "number") return { kind: "text", value: defect.token }
  if (defect.kind === "out_of_range" && cell.kind === "number" && (column.type === "int" || column.type === "float" || column.type === "decimal")) {
    const span = Math.max(1, column.max - column.min)
    const high = defect.direction === "both" ? rng.chance(0.5) : defect.direction !== "low"
    return { kind: "number", value: high ? column.max + span : column.min - span, scale: cell.scale }
  }
  if (defect.kind === "orphan") return { kind: "text", value: orphan(cellText(cell), tables) }
  if (defect.kind === "inconsistent" && cell.kind === "number") return { kind: "number", value: cell.value * defect.factor, scale: cell.scale }
}

function blank(defect: Extract<Defect, { kind: "missing" }>): Cell {
  if (defect.as === "empty") return { kind: "text", value: "" }
  if (defect.as === "sentinel") return { kind: "text", value: defect.sentinel }
  return { kind: "null" }
}

function outlier(rng: Rng, defect: Extract<Defect, { kind: "outlier" }>, value: number, stats: Stats) {
  if (defect.force === "zero") return 0
  if (defect.force === "negative") return -Math.abs(value) - 1
  const high = defect.direction === "both" ? rng.chance(0.5) : defect.direction !== "low"
  if (defect.method === "zscore") return stats.mean + (high ? defect.factor : -defect.factor) * stats.sd
  if (defect.method === "iqr") return high ? stats.q3 + defect.factor * stats.iqr : stats.q1 - defect.factor * stats.iqr
  if (!high) return defect.factor === 0 ? value : value / defect.factor
  return value * defect.factor
}

function noise(rng: Rng, defect: Extract<Defect, { kind: "noise" }>, cell: Cell): Cell | undefined {
  if (defect.noise === "gaussian" && cell.kind === "number") return { kind: "number", value: cell.value + rng.normal() * (defect.sd ?? Math.max(Math.abs(cell.value) * 0.05, 0.01)), scale: cell.scale }
  if (defect.noise === "decimal" && cell.kind === "number") return { kind: "text", value: (cell.scale === undefined ? String(cell.value) : cell.value.toFixed(cell.scale)).replace(".", ",") }
  if (defect.noise === "date_format" && cell.kind === "date") {
    const [day, month, year] = [cell.value.slice(8, 10), cell.value.slice(5, 7), cell.value.slice(0, 4)]
    return { kind: "text", value: cell.time ? `${day}.${month}.${year} ${cell.value.slice(11, 19)}` : `${day}.${month}.${year}` }
  }
  if (cell.kind !== "text") return
  if (defect.noise === "case") return { kind: "text", value: rng.chance(0.5) ? cell.value.toUpperCase() : cell.value.toLowerCase() }
  if (defect.noise === "spaces") return { kind: "text", value: rng.chance(0.34) ? ` ${cell.value}` : rng.chance(0.5) ? `${cell.value} ` : cell.value.replace(" ", "  ") }
  if (defect.noise === "synonym") {
    const options = defect.synonyms[cell.value]
    if (!options?.length) return
    return { kind: "text", value: rng.pick(options) }
  }
  if (defect.noise !== "typo" || !cell.value) return
  const at = rng.int(0, [...cell.value].length - 1)
  const chars = [...cell.value]
  chars[at] = rng.pick([...alphabet])
  return { kind: "text", value: chars.join("") }
}

function duplicate(rng: Rng, data: TableData, defect: Extract<Defect, { kind: "duplicate" }>, records: DefectRecord[]) {
  const length = data.rows.length
  for (let row = 0; row < length; row += 1) {
    if (!rng.chance(defect.rate)) continue
    const copy = (data.rows[row] ?? []).map((cell) => copyCell(cell))
    if (defect.mode === "fuzzy") fuzz(rng, copy)
    data.rows.push(copy)
    data.broken.push(null)
    records.push({ table: data.name, row: data.rows.length - 1, column: "", kind: "duplicate", original: String(row + 1), value: defect.mode })
  }
}

function fuzz(rng: Rng, row: Cell[]) {
  const text = row.find((cell) => cell.kind === "text" && cell.value.length > 0)
  if (text?.kind === "text") {
    text.value = `${text.value.slice(0, -1)}${rng.pick([...alphabet])}`
    return
  }
  const number = row.find((cell) => cell.kind === "number")
  if (number?.kind === "number") number.value += 1
}

function broken(rng: Rng, data: TableData, defect: Extract<Defect, { kind: "broken_row" }>, records: DefectRecord[]) {
  for (let row = 0; row < data.rows.length; row += 1) {
    if (!rng.chance(defect.rate)) continue
    const mode = rng.chance(0.5) ? "extra" : "missing"
    data.broken[row] = mode
    records.push({ table: data.name, row, column: "", kind: "broken_row", original: "", value: mode })
  }
}

function write(data: TableData, row: number, index: number, column: string, kind: string, cell: Cell, records: DefectRecord[]) {
  const current = data.rows[row]?.[index]
  if (!current) return
  records.push({ table: data.name, row, column, kind, original: cellText(current), value: cellText(cell) })
  data.rows[row][index] = cell
}

function matches(row: Cell[], columns: string[], when: { column: string; equals?: string; above?: number }) {
  const cell = row[columns.indexOf(when.column)]
  if (!cell) return false
  if (when.equals !== undefined) return cellText(cell) === when.equals
  const value = numberOf(cell)
  return when.above !== undefined && value !== null && value > when.above
}

function orphan(current: string, tables: Array<{ spec: Table; data: TableData }>) {
  const used = new Set(tables.flatMap((table) => table.data.rows.flatMap((row) => row.map((cell) => cellText(cell)))))
  let value = `MISSING-${current || "X"}`
  while (used.has(value)) value += "X"
  return value
}

type Stats = { mean: number; sd: number; q1: number; q3: number; iqr: number }

function distribution(data: TableData, index: number): Stats {
  const values = data.rows.flatMap((row) => {
    const value = numberOf(row[index])
    return value === null ? [] : [value]
  })
  const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length || 1)
  const q1 = quantile(values, 0.25)
  const q3 = quantile(values, 0.75)
  return { mean, sd: Math.sqrt(variance) || 1, q1, q3, iqr: q3 - q1 || 1 }
}

function quantile(values: number[], probability: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * probability
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? 0
  const weight = index - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}
