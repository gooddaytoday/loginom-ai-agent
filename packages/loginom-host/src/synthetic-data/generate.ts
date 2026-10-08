import { cellText, copyCell, type Cell, type TableData } from "./cells"
import { dictionaryValue } from "./dictionaries"
import { createRng, poisson, type Rng } from "./rng"
import type { Column, Spec, Table } from "./spec"

const letters = "абвгдежзийклмнопрстуфхцчшщыэюя"

export function generateTables(spec: Spec) {
  const rng = createRng(spec.seed)
  const built = new Map<string, TableData>()
  const tables = spec.tables.map((table) => {
    const data = generateTable(rng, table, built)
    built.set(table.name, data)
    return { spec: table, data }
  })
  return { rng, tables }
}

function generateTable(rng: Rng, table: Table, built: Map<string, TableData>): TableData {
  const plans = new Map<string, number[]>()
  for (const column of table.columns) {
    if (column.type !== "ref" || !column.unique) continue
    const parent = built.get(column.table)
    const indexes = parent ? parent.rows.map((_, index) => index) : []
    for (let index = indexes.length - 1; index > 0; index -= 1) {
      const swap = rng.int(0, index)
      const current = indexes[index] ?? 0
      indexes[index] = indexes[swap] ?? 0
      indexes[swap] = current
    }
    plans.set(column.name, indexes.slice(0, table.rows))
  }
  const rows = Array.from({ length: table.rows }, (_, index) => {
    const row: Cell[] = []
    const picks = new Map<string, number>()
    for (const column of table.columns) row.push(generateCell(rng, column, table.columns, row, index, built, plans, picks))
    return row
  })
  return { name: table.name, columns: table.columns.map((column) => column.name), rows, broken: rows.map(() => null) }
}

function generateCell(rng: Rng, column: Column, columns: Column[], row: Cell[], index: number, built: Map<string, TableData>, plans: Map<string, number[]>, picks: Map<string, number>): Cell {
  if (column.type === "sequence") {
    const number = String(column.start + index * column.step).padStart(column.width, "0")
    if (column.prefix || column.width) return { kind: "text", value: column.prefix + number }
    return { kind: "number", value: column.start + index * column.step, scale: 0 }
  }
  if (column.type === "int" || column.type === "float" || column.type === "decimal") {
    const drawn = draw(rng, column)
    const trended = trend(drawn, column, columns, row)
    const value = column.trend || column.season ? trended : clamp(trended, column.min, column.max)
    const rounded = column.type === "int" ? Math.round(value) : column.scale === undefined ? value : round(value, column.scale)
    return { kind: "number", value: rounded, scale: column.type === "float" ? undefined : column.scale }
  }
  if (column.type === "string") return { kind: "text", value: pattern(rng, column.pattern, column.length) }
  if (column.type === "category") return { kind: "text", value: weighted(rng, column.values, column.weights) }
  if (column.type === "date" || column.type === "datetime") {
    const day = randomDay(rng, column.from, column.to)
    if (column.type === "date") return { kind: "date", value: day, time: false }
    const time = [rng.int(0, 23), rng.int(0, 59), rng.int(0, 59)].map((part) => String(part).padStart(2, "0")).join(":")
    return { kind: "date", value: `${day}T${time}`, time: true }
  }
  if (column.type === "bool") return { kind: "bool", value: rng.chance(column.probability) }
  if (column.type === "dictionary" || column.type === "text") return { kind: "text", value: dictionaryValue(column.dictionary, (values) => rng.pick(values), index) }
  if (column.type === "ref") return reference(rng, column, index, built, plans, picks)
  if (column.type === "lookup") return lookup(column, columns, row, built, picks)
  if (column.type !== "expr") return { kind: "null" }
  const value = evaluateExpr(column.expr, Object.fromEntries(columns.map((item, itemIndex) => [item.name, numberOf(row[itemIndex])])))
  return value === null ? { kind: "null" } : { kind: "number", value, scale: 2 }
}

function reference(rng: Rng, column: Extract<Column, { type: "ref" }>, index: number, built: Map<string, TableData>, plans: Map<string, number[]>, picks: Map<string, number>): Cell {
  const parent = built.get(column.table)
  if (!parent?.rows.length) return { kind: "null" }
  const columnIndex = parent.columns.indexOf(column.column)
  const planned = plans.get(column.name)?.[index]
  const picked = planned ?? (column.distribution === "zipf" ? zipf(rng, parent.rows.length, column.zipf) : rng.int(0, parent.rows.length - 1))
  picks.set(column.name, picked)
  return copyCell(parent.rows[picked]?.[columnIndex] ?? { kind: "null" })
}

function lookup(column: Extract<Column, { type: "lookup" }>, columns: Column[], row: Cell[], built: Map<string, TableData>, picks: Map<string, number>): Cell {
  const parent = built.get(column.table)
  if (!parent) return { kind: "null" }
  const valueIndex = parent.columns.indexOf(column.column)
  const ref = columns.find((item) => item.name === column.match && item.type === "ref" && item.table === column.table)
  const picked = ref ? picks.get(ref.name) : undefined
  if (picked !== undefined) return copyCell(parent.rows[picked]?.[valueIndex] ?? { kind: "null" })
  const keyIndex = parent.columns.indexOf(ref && ref.type === "ref" ? ref.column : column.match)
  const key = cellText(row[columns.findIndex((item) => item.name === column.match)] ?? { kind: "null" })
  const found = parent.rows.find((item) => cellText(item[keyIndex] ?? { kind: "null" }) === key)
  return copyCell(found?.[valueIndex] ?? { kind: "null" })
}

function draw(rng: Rng, column: Extract<Column, { type: "int" | "float" | "decimal" }>) {
  if (column.distribution === "poisson") return poisson(rng, column.lambda)
  if (column.distribution === "normal") return column.mean + rng.normal() * column.sd
  if (column.distribution === "lognormal") return Math.exp(column.mu + column.sigma * rng.normal())
  return column.min + rng.next() * (column.max - column.min)
}

function trend(value: number, column: Extract<Column, { type: "int" | "float" | "decimal" }>, columns: Column[], row: Cell[]) {
  const name = column.trend?.date ?? column.season?.date
  if (!name) return value
  const date = columns.find((item) => item.name === name)
  const cell = row[columns.indexOf(date ?? columns[0])]
  if (!date || (date.type !== "date" && date.type !== "datetime") || cell?.kind !== "date") return value
  const days = daysBetween(date.from, cell.value)
  const sloped = column.trend ? value + column.trend.slope * days : value
  if (!column.season) return sloped
  return sloped + column.season.amplitude * Math.sin((2 * Math.PI * days) / column.season.period)
}

function pattern(rng: Rng, source: string, length: number) {
  if (!source) return Array.from({ length }, () => rng.pick([...letters])).join("")
  return [...source].map((char) => (char === "#" ? String(rng.int(0, 9)) : char === "?" ? rng.pick([...letters]) : char)).join("")
}

function weighted(rng: Rng, values: string[], weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let mark = rng.next() * (total || 1)
  for (let index = 0; index < values.length; index += 1) {
    mark -= weights[index] ?? 0
    if (mark <= 0) return values[index] ?? values[0] ?? ""
  }
  return values.at(-1) ?? ""
}

function zipf(rng: Rng, count: number, slope: number) {
  const weights = Array.from({ length: count }, (_, index) => 1 / (index + 1) ** slope)
  return weights.length ? weightedIndex(rng, weights) : 0
}

function weightedIndex(rng: Rng, weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let mark = rng.next() * total
  for (let index = 0; index < weights.length; index += 1) {
    mark -= weights[index] ?? 0
    if (mark <= 0) return index
  }
  return weights.length - 1
}

function randomDay(rng: Rng, from: string, to: string) {
  const start = Date.parse(from + "T00:00:00Z")
  const days = Math.round((Date.parse(to + "T00:00:00Z") - start) / 86400000)
  return new Date(start + rng.int(0, Math.max(days, 0)) * 86400000).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to.slice(0, 10) + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, scale: number) {
  const factor = 10 ** scale
  return Math.round(value * factor) / factor
}

export function numberOf(cell: Cell | undefined) {
  if (cell?.kind === "number") return cell.value
  if (cell?.kind === "bool") return cell.value ? 1 : 0
  return null
}

export function evaluateExpr(expr: string, row: Record<string, number | null>) {
  let index = 0
  const value = parseSum()
  skip()
  if (index !== expr.length) return null
  return value

  function parseSum(): number | null {
    let left = parseProduct()
    while (true) {
      skip()
      if (char() !== "+" && char() !== "-") return left
      const op = expr[index]
      index += 1
      const right = parseProduct()
      if (left === null || right === null) return null
      left = op === "+" ? left + right : left - right
    }
  }
  function parseProduct(): number | null {
    let left = parseUnary()
    while (true) {
      skip()
      if (char() !== "*" && char() !== "/") return left
      const op = expr[index]
      index += 1
      const right = parseUnary()
      if (left === null || right === null || (op === "/" && right === 0)) return null
      left = op === "*" ? left * right : left / right
    }
  }
  function parseUnary(): number | null {
    skip()
    if (char() !== "-") return parsePrimary()
    index += 1
    const value = parseUnary()
    return value === null ? null : -value
  }
  function parsePrimary(): number | null {
    skip()
    if (char() === "(") {
      index += 1
      const value = parseSum()
      skip()
      if (char() === ")") index += 1
      return value
    }
    if (char() === "{") {
      const end = expr.indexOf("}", index + 1)
      if (end < 0) return null
      const name = expr.slice(index + 1, end)
      index = end + 1
      return row[name] ?? null
    }
    if (/[0-9.]/.test(char() ?? "")) {
      const start = index
      while (/[0-9.]/.test(expr[index] ?? "")) index += 1
      const value = Number(expr.slice(start, index))
      return Number.isFinite(value) ? value : null
    }
    const start = index
    while (/[\p{L}\p{N}_]/u.test(expr[index] ?? "")) index += 1
    if (start === index) return null
    return row[expr.slice(start, index)] ?? null
  }
  function skip() {
    while (expr[index] === " ") index += 1
  }
  function char() {
    return expr[index]
  }
}
