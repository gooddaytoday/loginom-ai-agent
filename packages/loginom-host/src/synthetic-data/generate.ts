import { cellText, copyCell, type Cell, type TableData } from "./cells"
import { dictionaryValue } from "./dictionaries"
import { assignCounters, groupSizes, groupSpan, keysUnique, sortGroups } from "./groups"
import { materializeLink, pickTuple, sharedValueCount } from "./links"
import { adjustCompare, allowedCategories, allowedTuples, avoidNever, strictViolation } from "./rules"
import { createRng, poisson, type Rng } from "./rng"
import { addOffset, seriesGrid, walkStep } from "./series"
import type { Column, Rule, Spec, Table } from "./spec"

const letters = "абвгдежзийклмнопрстуфхцчшщыэюя"

export type Constraint = {
  table: string
  groups?: { count: number; min: number; max: number }
  series?: { series: number; periods: number }
  links: Array<{ name: string; tuples: number; shared_values: number }>
  rules: number
  violations: number
  rejected_defects: number
}

type GenContext = {
  rules: Rule[]
  links: Map<string, string[][]>
  linkSpecs: Table["links"]
  chosen: Map<string, string[]>
  seriesState: Map<string, number>
  previous?: Cell[]
  sharedKey: string
  previousKey: string
}

export function generateTables(spec: Spec) {
  const rng = createRng(spec.seed)
  const built = new Map<string, TableData>()
  const constraints: Constraint[] = []
  const tables = spec.tables.map((table) => {
    const generated = generateTable(rng, table, built)
    built.set(table.name, generated.data)
    constraints.push(generated.constraint)
    return { spec: table, data: generated.data }
  })
  return { rng, tables, constraints }
}

function generateTable(rng: Rng, table: Table, built: Map<string, TableData>) {
  const links = new Map(table.links.map((link) => [link.name, materializeLink(link, rng)]))
  if (table.series) return generateSeries(rng, table, built, links)
  if (table.groups) return generateGrouped(rng, table, built, links)
  const data = plainTable(rng, table, built, links)
  if (table.columns.some((column) => column.type === "sequence" && column.per?.length))
    assignCounters(data.rows, data.rows.map((_, index) => index), table.columns, { keys: [], shared: [], size: { min: 1, max: 1 }, sortBy: [] })
  return { data, constraint: constraintFor(table, data, links, undefined) }
}

function plainTable(rng: Rng, table: Table, built: Map<string, TableData>, links: Map<string, string[][]>): TableData {
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
  let previous: Cell[] | undefined
  const rows = Array.from({ length: table.rows }, (_, index) => {
    const row: Cell[] = []
    const picks = new Map<string, number>()
    const context = contextFor(table, links)
    context.previous = previous
    for (const column of table.columns) row.push(generateCell(rng, column, table.columns, row, index, built, plans, picks, context))
    previous = row
    return row
  })
  return { name: table.name, columns: table.columns.map((column) => column.name), rows, broken: rows.map(() => null) }
}

function generateCell(rng: Rng, column: Column, columns: Column[], row: Cell[], index: number, built: Map<string, TableData>, plans: Map<string, number[]>, picks: Map<string, number>, context: GenContext): Cell {
  const cell = rawCell(rng, column, columns, row, index, built, plans, picks, context)
  const fitted = context.rules.length ? avoidNever(context.rules, columns, row, columns.indexOf(column), cell) : cell
  const compared = context.rules.length ? adjustCompare(context.rules, columns, row, columns.indexOf(column), fitted) : fitted
  if (column.optional === undefined || compared.kind === "null") return compared
  if (!rng.chance(column.optional)) return compared
  const trial = row.slice()
  trial[columns.indexOf(column)] = { kind: "null" }
  if (strictViolation(context.rules, columns, trial)) return compared
  return { kind: "null" }
}

function rawCell(rng: Rng, column: Column, columns: Column[], row: Cell[], index: number, built: Map<string, TableData>, plans: Map<string, number[]>, picks: Map<string, number>, context: GenContext): Cell {
  if (column.type === "sequence" && column.per?.length) return { kind: "null" }
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
  if (column.type === "category") {
    const filtered = context.rules.length ? allowedCategories(column.values, column.weights, column.name, context.rules, columns, row, columns.indexOf(column)) : undefined
    const values = filtered?.values ?? column.values
    const weights = filtered?.weights ?? column.weights
    if (!values.length) throw Error("SYNTHETIC_DATA_RULE_UNSATISFIABLE")
    return { kind: "text", value: weighted(rng, values, weights) }
  }
  if (column.type === "date" || column.type === "datetime") {
    const day = randomDay(rng, column.from, column.to)
    if (column.type === "date") return { kind: "date", value: day, time: false }
    const time = [rng.int(0, 23), rng.int(0, 59), rng.int(0, 59)].map((part) => String(part).padStart(2, "0")).join(":")
    return { kind: "date", value: `${day}T${time}`, time: true }
  }
  if (column.type === "bool") {
    if (!context.rules.length) return { kind: "bool", value: rng.chance(column.probability) }
    const allowed = [true, false].filter((value) => allowedCategories([value ? "true" : "false"], [1], column.name, context.rules, columns, row, columns.indexOf(column)).values.length)
    if (!allowed.length) throw Error("SYNTHETIC_DATA_RULE_UNSATISFIABLE")
    if (allowed.length === 1) return { kind: "bool", value: allowed[0] ?? false }
    return { kind: "bool", value: rng.chance(column.probability) }
  }
  if (column.type === "dictionary" || column.type === "text") return { kind: "text", value: dictionaryValue(column.dictionary, (values) => rng.pick(values), index) }
  if (column.type === "ref") return reference(rng, column, index, built, plans, picks)
  if (column.type === "lookup") return lookup(column, columns, row, built, picks)
  if (column.type === "linked") return linkedCell(rng, column, columns, row, context)
  if (column.type === "offset") return offsetCell(rng, column, columns, row, context)
  if (column.type === "walk") return walkCell(rng, column, context)
  if (column.type !== "expr") return { kind: "null" }
  const value = evaluateExpr(column.expr, Object.fromEntries(columns.map((item, itemIndex) => [item.name, numberOf(row[itemIndex])])))
  if (value === null) return { kind: "null" }
  const scale = column.scale ?? 2
  return { kind: "number", value: column.scale === undefined ? value : round(value, scale), scale }
}

function generateGrouped(rng: Rng, table: Table, built: Map<string, TableData>, links: Map<string, string[][]>) {
  const groups = table.groups
  if (!groups) throw Error("SYNTHETIC_DATA_RULE_UNSATISFIABLE")
  const sizes = groupSizes(table.rows, groups.size.min, groups.size.max, (min, max) => rng.int(min, max))
  const plans = new Map<string, number[]>()
  const headers = sizes.map((size, groupIndex) => {
    const cells: Cell[] = []
    const context = contextFor(table, links)
    for (const column of table.columns) {
      const shared = groups.shared.includes(column.name) && !(column.type === "sequence" && column.per?.length)
      cells.push(shared ? generateCell(rng, column, table.columns, cells, groupIndex, built, plans, new Map(), context) : { kind: "null" })
    }
    return { cells, size }
  })
  const rows: Cell[][] = []
  const membership: number[] = []
  let lastKey = ""
  sortGroups(headers, table.columns, groups.sortBy).forEach((header, groupIndex) => {
    for (let offset = 0; offset < header.size; offset += 1) {
      const row = header.cells.map((cell) => copyCell(cell))
      const context = contextFor(table, links)
      context.previous = rows.at(-1)
      context.previousKey = lastKey
      context.sharedKey = groups.shared.map((name) => cellText(row[table.columns.findIndex((column) => column.name === name)] ?? { kind: "null" })).join("\u0000")
      lastKey = context.sharedKey
      for (const column of table.columns) {
        if (groups.shared.includes(column.name) || (column.type === "sequence" && column.per?.length)) continue
        const columnIndex = table.columns.findIndex((item) => item.name === column.name)
        row[columnIndex] = generateCell(rng, column, table.columns, row, rows.length, built, plans, new Map(), context)
      }
      rows.push(row)
      membership.push(groupIndex)
    }
  })
  assignCounters(rows, membership, table.columns, groups)
  if (!keysUnique(rows, table.columns.map((column) => column.name), groups.keys)) throw Error("SYNTHETIC_DATA_KEY_COLLISION")
  const data = tableData(table, rows)
  return { data, constraint: constraintFor(table, data, links, groupSpan(sizes)) }
}

function generateSeries(rng: Rng, table: Table, built: Map<string, TableData>, links: Map<string, string[][]>) {
  const spec = table.series
  const grid = spec ? seriesGrid(spec, table.columns) : undefined
  if (!spec || !grid) throw Error("SYNTHETIC_DATA_RULE_UNSATISFIABLE")
  const plans = new Map<string, number[]>()
  const rows: Cell[][] = []
  let lastKey = ""
  for (const combo of grid.combos) {
    const state = new Map<string, number>()
    for (const date of grid.dates) {
      const row: Cell[] = []
      const context = contextFor(table, links)
      context.seriesState = state
      context.previous = rows.at(-1)
      context.previousKey = lastKey
      context.sharedKey = combo.join("\u0000")
      lastKey = context.sharedKey
      for (const column of table.columns) {
        const keyIndex = spec.by.indexOf(column.name)
        if (keyIndex >= 0) {
          row.push({ kind: "text", value: combo[keyIndex] ?? "" })
          continue
        }
        if (column.name === spec.date) {
          row.push({ kind: "date", value: date, time: grid.time })
          continue
        }
        row.push(generateCell(rng, column, table.columns, row, rows.length, built, plans, new Map(), context))
      }
      rows.push(row)
    }
  }
  const data = tableData(table, rows)
  return { data, constraint: constraintFor(table, data, links, undefined, { series: grid.combos.length, periods: grid.dates.length }) }
}

function linkedCell(rng: Rng, column: Extract<Column, { type: "linked" }>, columns: Column[], row: Cell[], context: GenContext): Cell {
  const link = context.linkSpecs.find((item) => item.name === column.link)
  const names = link?.columns ?? []
  let tuple = context.chosen.get(column.link)
  if (!tuple) {
    const rows = context.links.get(column.link) ?? []
    const allowed = context.rules.length ? allowedTuples(rows, names, context.rules, columns, row, columns.indexOf(column)) : rows
    if (!allowed.length) throw Error("SYNTHETIC_DATA_RULE_UNSATISFIABLE")
    const weights = allowed.length === rows.length ? link?.weights : undefined
    tuple = allowed[pickTuple(rng, allowed, link?.distribution ?? "uniform", link?.zipf ?? 1, weights)] ?? []
    context.chosen.set(column.link, tuple)
  }
  return { kind: "text", value: tuple[names.indexOf(column.name)] ?? "" }
}

function offsetCell(rng: Rng, column: Extract<Column, { type: "offset" }>, columns: Column[], row: Cell[], context: GenContext): Cell {
  const source = row[columns.findIndex((item) => item.name === column.from)]
  const previous = context.previous?.[columns.indexOf(column)]
  const continued = column.cumulative && previous?.kind === "date" && context.sharedKey !== "" && context.sharedKey === context.previousKey
  const base = continued ? previous.value : source?.kind === "date" ? source.value : undefined
  if (!base) return { kind: "null" }
  const fraction = column.distribution === "lognormal" ? 1 / (1 + Math.exp(-rng.normal())) : rng.next()
  const amount = Math.round(column.min + fraction * (column.max - column.min))
  const stamp = addOffset(base, amount, column.unit)
  const time = column.unit !== "days" || base.includes("T")
  return { kind: "date", value: time ? stamp.slice(0, 19) : stamp.slice(0, 10), time }
}

function walkCell(rng: Rng, column: Extract<Column, { type: "walk" }>, context: GenContext): Cell {
  const key = context.sharedKey || column.name
  const previous = context.seriesState.get(key)
  const value = previous === undefined
    ? typeof column.start === "number" ? column.start : column.start.min + rng.next() * (column.start.max - column.start.min)
    : walkStep(rng, column, previous)
  context.seriesState.set(key, value)
  return { kind: "number", value, scale: column.scale }
}

function contextFor(table: Table, links: Map<string, string[][]>): GenContext {
  return { rules: table.rules, links, linkSpecs: table.links, chosen: new Map(), seriesState: new Map(), sharedKey: "", previousKey: "" }
}

function tableData(table: Table, rows: Cell[][]): TableData {
  return { name: table.name, columns: table.columns.map((column) => column.name), rows, broken: rows.map(() => null) }
}

function constraintFor(table: Table, data: TableData, links: Map<string, string[][]>, groups: Constraint["groups"], series?: Constraint["series"]): Constraint {
  return {
    table: table.name,
    groups,
    series,
    links: table.links.map((link) => {
      const rows = links.get(link.name) ?? []
      return { name: link.name, tuples: rows.length, shared_values: sharedValueCount(rows) }
    }),
    rules: table.rules.length,
    violations: table.rules.length ? data.rows.filter((row) => strictViolation(table.rules, table.columns, row)).length : 0,
    rejected_defects: 0,
  }
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
    const name = expr.slice(start, index)
    skip()
    if (char() !== "(") return row[name] ?? null
    index += 1
    const args: Array<number | null> = []
    if (char() !== ")") {
      args.push(parseSum())
      while (char() === ",") {
        index += 1
        args.push(parseSum())
      }
    }
    if (char() === ")") index += 1
    if (args.some((item) => item === null)) return null
    const numbers = args.filter((item): item is number => item !== null)
    if (name === "abs") return Math.abs(numbers[0] ?? 0)
    if (name === "min") return Math.min(...numbers)
    if (name === "max") return Math.max(...numbers)
    return null
  }
  function skip() {
    while (expr[index] === " ") index += 1
  }
  function char() {
    return expr[index]
  }
}
