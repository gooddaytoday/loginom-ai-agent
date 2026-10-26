import { cellText, type Cell } from "./cells"
import type { Column, Condition, Rule } from "./spec"

export function conditionHolds(condition: Condition, cell: Cell | undefined) {
  const empty = !cell || cell.kind === "null" || (cell.kind === "text" && cell.value === "")
  if (condition.empty) return empty
  if (condition.notEmpty) return !empty
  const value = cell ? cellText(cell) : ""
  if (condition.in) return condition.in.includes(value)
  if (condition.notIn) return !condition.notIn.includes(value)
  return false
}

export function allowedCategories(values: string[], weights: number[], column: string, rules: Rule[], columns: Column[], row: Cell[], index: number) {
  const blocked = new Set<string>()
  for (const rule of rules) {
    if (!("never" in rule)) continue
    const mine = rule.never.find((item) => item.column === column)
    if (!mine) continue
    const others = rule.never.filter((item) => item.column !== column)
    if (!others.length || !others.every((item) => known(item.column, columns, index) && conditionHolds(item, cellAt(row, columns, item.column)))) continue
    for (const value of values) if (valueBreaks(mine, value)) blocked.add(value)
  }
  const kept = values.flatMap((value, valueIndex) => blocked.has(value) ? [] : [{ value, weight: weights[valueIndex] ?? 1 }])
  return { values: kept.map((item) => item.value), weights: kept.map((item) => item.weight) }
}

export function allowedTuples(rows: string[][], names: string[], rules: Rule[], columns: Column[], row: Cell[], index: number) {
  return rows.filter((tuple) => !rules.some((rule) => {
    if (!("never" in rule)) return false
    const involved = rule.never.filter((item) => names.includes(item.column))
    if (!involved.length) return false
    const others = rule.never.filter((item) => !names.includes(item.column))
    if (others.some((item) => !known(item.column, columns, index) || !conditionHolds(item, cellAt(row, columns, item.column)))) return false
    if (others.length && !others.every((item) => conditionHolds(item, cellAt(row, columns, item.column)))) return false
    return involved.every((item) => valueBreaks(item, tuple[names.indexOf(item.column)] ?? ""))
  }))
}

export function strictViolation(rules: Rule[], columns: Column[], row: Cell[]) {
  return rules.find((rule) => rule.severity === "strict" && broken(rule, columns, row))
}

export function ruleBroken(rule: Rule, columns: Column[], row: Cell[]) {
  return broken(rule, columns, row)
}

export function forceViolation(rule: Rule, columns: Column[], row: Cell[]) {
  if ("never" in rule) return forceNever(rule.never, columns, row)
  return forceCompare(rule.compare, columns, row)
}

export function avoidNever(rules: Rule[], columns: Column[], row: Cell[], index: number, cell: Cell) {
  const name = columns[index]?.name
  if (!name) return cell
  let current = cell
  for (const rule of rules) {
    if (rule.severity !== "strict" || !("never" in rule)) continue
    const mine = rule.never.find((item) => item.column === name)
    if (!mine) continue
    const others = rule.never.filter((item) => item.column !== name)
    if (!others.length || !others.every((item) => known(item.column, columns, index) && conditionHolds(item, cellAt(row, columns, item.column)))) continue
    if (!conditionHolds(mine, current)) continue
    current = escapeCondition(mine, columns[index])
  }
  return current
}

export function adjustCompare(rules: Rule[], columns: Column[], row: Cell[], index: number, cell: Cell) {
  const name = columns[index]?.name
  if (!name) return cell
  let current = cell
  for (const rule of rules) {
    if (!("compare" in rule) || rule.severity !== "strict") continue
    const later = columns.findIndex((item) => item.name === rule.compare.left) > columns.findIndex((item) => item.name === rule.compare.right)
      ? rule.compare.left
      : rule.compare.right
    if (later !== name) continue
    const leftIndex = columns.findIndex((item) => item.name === rule.compare.left)
    const rightIndex = columns.findIndex((item) => item.name === rule.compare.right)
    const left = leftIndex === index ? current : row[leftIndex]
    const right = rightIndex === index ? current : row[rightIndex]
    if (left && right && relation(left, rule.compare.op, right)) continue
    current = moved(current, leftIndex === index ? right : left, rule.compare.op, leftIndex === index)
  }
  return current
}

function forceNever(conditions: Condition[], columns: Column[], row: Cell[]) {
  const changes = new Map<number, Cell>()
  for (const condition of conditions) {
    const index = columns.findIndex((item) => item.name === condition.column)
    const cell = changes.get(index) ?? row[index]
    if (index < 0 || conditionHolds(condition, cell)) continue
    changes.set(index, satisfying(condition, columns[index]))
  }
  return changes
}

function forceCompare(compare: { left: string; op: "<" | "<=" | "=" | ">=" | ">"; right: string }, columns: Column[], row: Cell[]) {
  const left = columns.findIndex((item) => item.name === compare.left)
  const right = columns.findIndex((item) => item.name === compare.right)
  const later = left > right ? left : right
  const other = row[later === left ? right : left]
  if (later < 0 || !other) return new Map<number, Cell>()
  const opposite = compare.op === "<" ? ">=" : compare.op === "<=" ? ">" : compare.op === ">" ? "<=" : compare.op === ">=" ? "<" : "<"
  return new Map([[later, moved(row[later] ?? other, other, opposite, true)]])
}

function escapeCondition(condition: Condition, column: Column | undefined): Cell {
  if (condition.notEmpty) return { kind: "null" }
  if (condition.in && column?.type === "category") {
    const value = column.values.find((item) => !condition.in?.includes(item))
    if (value) return { kind: "text", value }
  }
  if (condition.in) return { kind: "null" }
  if (condition.notIn && column?.type === "category") {
    const value = column.values.find((item) => condition.notIn?.includes(item))
    if (value) return { kind: "text", value }
  }
  if (condition.empty && column?.type === "category" && column.values[0]) return { kind: "text", value: column.values[0] }
  if (condition.empty) return { kind: "text", value: "1" }
  return { kind: "null" }
}

function satisfying(condition: Condition, column: Column | undefined): Cell {
  if (condition.empty) return { kind: "null" }
  if (condition.in?.[0] !== undefined) return { kind: "text", value: condition.in[0] }
  if (condition.notIn && column?.type === "category") {
    const value = column.values.find((item) => !condition.notIn?.includes(item))
    if (value) return { kind: "text", value }
  }
  if (column?.type === "category" && column.values[0]) return { kind: "text", value: column.values[0] }
  if (column?.type === "bool") return { kind: "bool", value: true }
  return { kind: "text", value: "1" }
}

function broken(rule: Rule, columns: Column[], row: Cell[]) {
  if ("never" in rule) return rule.never.every((condition) => conditionHolds(condition, cellAt(row, columns, condition.column)))
  const left = cellAt(row, columns, rule.compare.left)
  const right = cellAt(row, columns, rule.compare.right)
  if (!left || !right) return false
  return !relation(left, rule.compare.op, right)
}

function valueBreaks(condition: Condition, value: string) {
  if (condition.empty) return value === ""
  if (condition.notEmpty) return value !== ""
  if (condition.in) return condition.in.includes(value)
  if (condition.notIn) return !condition.notIn.includes(value)
  return false
}

function known(column: string, columns: Column[], index: number) {
  const found = columns.findIndex((item) => item.name === column)
  return found >= 0 && found < index
}

function cellAt(row: Cell[], columns: Column[], name: string) {
  return row[columns.findIndex((item) => item.name === name)]
}

function relation(left: Cell, op: "<" | "<=" | "=" | ">=" | ">", right: Cell) {
  const first = comparable(left)
  const second = comparable(right)
  if (first === undefined || second === undefined) return true
  if (op === "<") return first < second
  if (op === "<=") return first <= second
  if (op === "=") return first === second
  if (op === ">=") return first >= second
  return first > second
}

function comparable(cell: Cell): number | string | undefined {
  if (cell.kind === "number") return cell.value
  if (cell.kind === "date") return Date.parse(cell.value.length === 10 ? `${cell.value}T00:00:00Z` : cell.value)
  if (cell.kind === "text" && cell.value) return cell.value
  if (cell.kind === "bool") return cell.value ? 1 : 0
}

function moved(current: Cell | undefined, other: Cell | undefined, op: "<" | "<=" | "=" | ">=" | ">", currentIsLeft: boolean): Cell {
  if (!other || other.kind === "null") return current ?? { kind: "null" }
  if (other.kind === "date") {
    const shift = op === ">" || op === ">=" ? 86400000 : op === "=" ? 0 : -86400000
    const base = Date.parse(other.value.length === 10 ? `${other.value}T00:00:00Z` : other.value) + (currentIsLeft ? shift : -shift)
    const value = new Date(base).toISOString().slice(0, other.time ? 19 : 10)
    return { kind: "date", value, time: other.time }
  }
  if (other.kind === "number") {
    const delta = op === ">" || op === ">=" ? 1 : op === "=" ? 0 : -1
    const value = other.value + (currentIsLeft ? delta : -delta)
    const scale = other.scale ?? (current?.kind === "number" ? current.scale : undefined)
    return { kind: "number", value, scale }
  }
  return current ?? { kind: "null" }
}
