import { cellText, type TableData } from "./cells"
import type { Link, Table } from "./spec"

export type EntityCheck = { name: string; tuples: number; tables: string[]; checked: number; mismatches: number }
export type LookupCheck = { checked: number; mismatches: number }

export function checkConsistency(tables: Array<{ spec: Table; data: TableData }>, entities: Map<string, string[][]>, specs: Link[]) {
  const report = specs.map((entity) => checkEntity(tables, entity, entities.get(entity.name) ?? []))
  const lookups = new Map(tables.map((table) => [table.spec.name, checkTableLookups(table, tables)]))
  const broken = report.some((item) => item.mismatches > 0) || [...lookups.values()].some((item) => item.mismatches > 0)
  return { report, lookups, broken }
}

function checkEntity(tables: Array<{ spec: Table; data: TableData }>, entity: Link, tuples: string[][]): EntityCheck {
  const keyName = entity.columns[0] ?? ""
  const byKey = new Map(tuples.map((tuple) => [tuple[0] ?? "", tuple]))
  const users = tables.filter((table) => table.spec.columns.some((column) => column.type === "linked" && column.link === entity.name))
  let checked = 0
  let mismatches = 0
  for (const table of users) {
    const columns = table.spec.columns.flatMap((column, index) => column.type === "linked" && column.link === entity.name ? [{ index, field: column.field ?? column.name }] : [])
    for (const row of table.data.rows) {
      const keyColumn = columns.find((column) => column.field === keyName)
      const tuple = byKey.get(cellText(row[keyColumn?.index ?? -1] ?? { kind: "null" }))
      for (const column of columns) {
        checked += 1
        const expected = tuple?.[entity.columns.indexOf(column.field)] ?? ""
        if (!tuple || cellText(row[column.index] ?? { kind: "null" }) !== expected) mismatches += 1
      }
    }
  }
  return { name: entity.name, tuples: tuples.length, tables: users.map((table) => table.spec.name), checked, mismatches }
}

function checkTableLookups(table: { spec: Table; data: TableData }, tables: Array<{ spec: Table; data: TableData }>): LookupCheck {
  let checked = 0
  let mismatches = 0
  for (const column of table.spec.columns) {
    if (column.type !== "lookup") continue
    const parent = tables.find((item) => item.spec.name === column.table)
    const ref = table.spec.columns.find((item) => item.name === column.match && item.type === "ref" && item.table === column.table)
    const keyName = ref?.type === "ref" ? ref.column : column.match
    const keyIndex = parent?.spec.columns.findIndex((item) => item.name === keyName) ?? -1
    const valueIndex = parent?.data.columns.indexOf(column.column) ?? -1
    const matchIndex = table.data.columns.indexOf(column.match)
    const localIndex = table.data.columns.indexOf(column.name)
    const grouped = new Map<string, Set<string>>()
    for (const row of parent?.data.rows ?? []) {
      const key = cellText(row[keyIndex] ?? { kind: "null" })
      const values = grouped.get(key) ?? new Set<string>()
      values.add(cellText(row[valueIndex] ?? { kind: "null" }))
      grouped.set(key, values)
    }
    for (const row of table.data.rows) {
      const key = cellText(row[matchIndex] ?? { kind: "null" })
      const values = grouped.get(key)
      checked += 1
      if (!values || values.size !== 1 || !values.has(cellText(row[localIndex] ?? { kind: "null" }))) mismatches += 1
    }
  }
  return { checked, mismatches }
}
