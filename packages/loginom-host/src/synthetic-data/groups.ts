import { cellText, type Cell } from "./cells"
import type { Column, Groups } from "./spec"

export function groupSizes(rows: number, min: number, max: number, draw: (min: number, max: number) => number) {
  const sizes: number[] = []
  let remaining = rows
  while (remaining > 0) {
    const drawn = draw(min, max)
    const size = Math.min(remaining, drawn)
    sizes.push(size)
    remaining -= size
  }
  return sizes
}

export function sortGroups<T extends { cells: Cell[] }>(groups: T[], columns: Column[], sortBy: string[]) {
  if (!sortBy.length) return groups
  return [...groups].sort((left, right) => {
    for (const name of sortBy) {
      const index = columns.findIndex((column) => column.name === name)
      const compared = cellText(left.cells[index] ?? { kind: "null" }).localeCompare(cellText(right.cells[index] ?? { kind: "null" }))
      if (compared) return compared
    }
    return 0
  })
}

export function assignCounters(rows: Cell[][], membership: number[], columns: Column[], groups: Groups) {
  const state = new Map<string, { key: string; group: number; value: number; membership: number }>()
  rows.forEach((row, rowIndex) => {
    for (const column of columns) {
      if (column.type !== "sequence" || !column.per?.length) continue
      const index = columns.findIndex((item) => item.name === column.name)
      const key = column.per.map((name) => cellText(row[columns.findIndex((item) => item.name === name)] ?? { kind: "null" })).join("\u0000")
      const current = state.get(column.name)
      const member = membership[rowIndex] ?? 0
      const next = !current || current.key !== key
        ? { key, group: member, value: column.start, membership: member }
        : column.unit === "row"
          ? { ...current, value: current.value + column.step }
          : current.membership === member
            ? current
            : { ...current, membership: member, value: current.value + column.step }
      state.set(column.name, next)
      const text = String(next.value).padStart(column.width, "0")
      row[index] = column.prefix || column.width ? { kind: "text", value: column.prefix + text } : { kind: "number", value: next.value, scale: 0 }
    }
  })
}

export function keysUnique(rows: Cell[][], columns: string[], keys: string[]) {
  if (!keys.length) return true
  const seen = new Set<string>()
  for (const row of rows) {
    const key = keys.map((name) => cellText(row[columns.indexOf(name)] ?? { kind: "null" })).join("\u0000")
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

export function groupSpan(sizes: number[]) {
  if (!sizes.length) return { count: 0, min: 0, max: 0 }
  return { count: sizes.length, min: Math.min(...sizes), max: Math.max(...sizes) }
}
