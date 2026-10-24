import { cellText, copyCell, type Cell, type DefectRecord, type TableData } from "./cells"
import { numberOf } from "./generate"
import { forceViolation, strictViolation } from "./rules"
import type { Rng } from "./rng"
import type { Column, Defect, Link, Realism, Table, When } from "./spec"

const alphabet = "абвгдежзийклмнопрстуфхцчшщыэюяaeiou"

export function applyDefects(rng: Rng, tables: Array<{ spec: Table; data: TableData }>, defects: Defect[], realism?: Realism, entities: Link[] = []) {
  const records: DefectRecord[] = []
  const rejected = new Map<string, number>()
  const guard = realism || entities.length || tables.some((table) => table.spec.rules.some((rule) => rule.severity === "strict")) ? createGuard(realism, entities) : undefined
  for (const defect of defects) {
    const table = tables.find((item) => item.spec.name === defect.table)
    if (!table) continue
    if (defect.kind === "duplicate") duplicate(rng, table, defect, records, entities)
    else if (defect.kind === "broken_row") broken(rng, table.data, defect, records)
    else if (defect.kind === "rule_violation") violate(rng, table, defect, records, guard, rejected)
    else if (defect.kind === "drop") dropRows(rng, table.data, defect, records)
    else change(rng, table, defect, tables, records, guard, rejected)
  }
  return { records, rejected }
}

function change(rng: Rng, table: { spec: Table; data: TableData }, defect: Exclude<Defect, { kind: "duplicate" | "broken_row" | "rule_violation" | "drop" }>, tables: Array<{ spec: Table; data: TableData }>, records: DefectRecord[], guard: Guard | undefined, rejected: Map<string, number>) {
  const column = table.spec.columns.find((item) => item.name === defect.column)
  const index = table.data.columns.indexOf(defect.column)
  if (!column || index < 0) return
  const length = table.data.rows.length
  if (defect.kind === "missing" && defect.mechanism === "block") {
    for (let row = 0; row < length; row += defect.length) {
      if (!rng.chance(defect.rate)) continue
      for (let offset = 0; offset < defect.length && row + offset < length; offset += 1) write(table, row + offset, index, defect.column, "missing", blank(defect), records, guard, rejected)
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
    if (next) write(table, row, index, defect.column, defect.kind === "noise" ? defect.noise : defect.kind, next, records, guard, rejected)
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

function duplicate(rng: Rng, table: { spec: Table; data: TableData }, defect: Extract<Defect, { kind: "duplicate" }>, records: DefectRecord[], entities: Link[]) {
  const data = table.data
  const length = data.rows.length
  const skip = protectedIndexes(table.spec, entities)
  for (let row = 0; row < length; row += 1) {
    if (!rng.chance(defect.rate)) continue
    const copy = (data.rows[row] ?? []).map((cell) => copyCell(cell))
    if (defect.mode === "fuzzy") fuzz(rng, copy, skip)
    data.rows.push(copy)
    data.broken.push(null)
    records.push({ table: data.name, row: data.rows.length - 1, column: "", kind: "duplicate", original: String(row + 1), value: defect.mode })
  }
}

function protectedIndexes(table: Table, entities: Link[]) {
  return new Set(table.columns.flatMap((column, index) => entities.some((entity) => column.type === "linked" && entity.name === column.link) ? [index] : []))
}

function fuzz(rng: Rng, row: Cell[], skip: Set<number>) {
  const text = row.find((cell, index) => !skip.has(index) && cell.kind === "text" && cell.value.length > 0)
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

function write(table: { spec: Table; data: TableData }, row: number, index: number, column: string, kind: string, cell: Cell, records: DefectRecord[], guard: Guard | undefined, rejected: Map<string, number>) {
  const current = table.data.rows[row]?.[index]
  if (!current) return
  const next = guard ? guard.prepare(table, row, index, cell, kind) : cell
  if (!next) {
    rejected.set(table.spec.name, (rejected.get(table.spec.name) ?? 0) + 1)
    return
  }
  records.push({ table: table.data.name, row, column, kind, original: cellText(current), value: cellText(next) })
  table.data.rows[row][index] = next
  guard?.mark(table.spec.name, row, index)
}

function violate(rng: Rng, table: { spec: Table; data: TableData }, defect: Extract<Defect, { kind: "rule_violation" }>, records: DefectRecord[], guard: Guard | undefined, rejected: Map<string, number>) {
  const rule = table.spec.rules.find((item) => item.name === defect.rule && item.severity === "soft")
  if (!rule) return
  for (let row = 0; row < table.data.rows.length; row += 1) {
    if (!rng.chance(defect.rate)) continue
    const current = table.data.rows[row]
    if (!current) continue
    const changes = forceViolation(rule, table.spec.columns, current)
    const last = [...changes].at(-1)
    if (!last) continue
    const trial = current.map((cell) => cell)
    for (const [index, cell] of changes) trial[index] = cell
    if (strictViolation(table.spec.rules, table.spec.columns, trial)) {
      rejected.set(table.spec.name, (rejected.get(table.spec.name) ?? 0) + 1)
      continue
    }
    for (const [index, cell] of changes) {
      if (index !== last[0]) table.data.rows[row][index] = cell
    }
    write(table, row, last[0], table.spec.columns[last[0]]?.name ?? "", "rule_violation", last[1], records, guard, rejected)
    const saved = records.at(-1)
    if (saved?.row === row && saved.kind === "rule_violation") saved.value = `${defect.rule}=${saved.value}`
  }
}

function dropRows(rng: Rng, data: TableData, defect: Extract<Defect, { kind: "drop" }>, records: DefectRecord[]) {
  const dropped: number[] = []
  for (let row = 0; row < data.rows.length; row += 1) {
    if (rng.chance(defect.rate)) dropped.push(row)
  }
  while (dropped.length >= data.rows.length) dropped.pop()
  if (!dropped.length) return
  const omit = new Set(dropped)
  const kept = data.rows.map((_, index) => index).filter((index) => !omit.has(index))
  const mapped = new Map(kept.map((index, position) => [index, position]))
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]
    if (!record || record.table !== data.name) continue
    const position = mapped.get(record.row)
    if (position === undefined) records.splice(index, 1)
    else record.row = position
  }
  for (const row of dropped) {
    const anchor = kept.filter((index) => index < row).at(-1) ?? kept[0] ?? 0
    records.push({ table: data.name, row: mapped.get(anchor) ?? 0, column: "", kind: "drop", original: String(row + 1), value: "dropped" })
  }
  data.rows = kept.map((index) => data.rows[index] ?? [])
  data.broken = kept.map((index) => data.broken[index] ?? null)
}

type Guard = { prepare: (table: { spec: Table; data: TableData }, row: number, index: number, cell: Cell, kind: string) => Cell | undefined; mark: (table: string, row: number, index: number) => void }

function createGuard(realism: Realism | undefined, entities: Link[]): Guard {
  const touched = new Set<string>()
  const counts = new Map<string, number>()
  return {
    prepare(table, row, index, cell, kind) {
      const column = table.spec.columns[index]
      const entity = entities.find((item) => column?.type === "linked" && item.name === column.link)
      const entityKey = entity?.columns[0] === (column?.type === "linked" ? column.field ?? column.name : "")
      if (entity && !(kind === "orphan" && entityKey)) return
      if (realism && column?.type === "lookup") return
      const key = `${table.spec.name}:${row}`
      if (realism?.oneDefectPerCell && touched.has(`${key}:${index}`)) return
      if (realism && (counts.get(key) ?? 0) >= realism.maxDefectsPerRow) return
      const next = realism?.respectLimits ? limitCell(table.spec.columns[index], cell) : cell
      const current = table.data.rows[row]?.[index]
      if (!current || cellText(current) === cellText(next ?? { kind: "null" })) return
      if (!table.spec.rules.some((rule) => rule.severity === "strict")) return next
      const previous = current
      table.data.rows[row][index] = next ?? previous
      const violated = strictViolation(table.spec.rules, table.spec.columns, table.data.rows[row] ?? [])
      table.data.rows[row][index] = previous
      if (violated) return
      return next
    },
    mark(table, row, index) {
      touched.add(`${table}:${row}:${index}`)
      const key = `${table}:${row}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    },
  }
}

function limitCell(column: Column | undefined, cell: Cell): Cell {
  if (cell.kind !== "number") return cell
  let value = cell.value
  if (column?.limits?.min !== undefined) value = Math.max(column.limits.min, value)
  if (column?.limits?.max !== undefined) value = Math.min(column.limits.max, value)
  if (column?.limits?.min === undefined && column?.limits?.max === undefined) value = Math.max(-1_000_000, Math.min(1_000_000, value))
  return { kind: "number", value, scale: cell.scale }
}

function matches(row: Cell[], columns: string[], when: When) {
  const cell = row[columns.indexOf(when.column)]
  if (!cell) return false
  if (when.in) return when.in.includes(cellText(cell))
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
