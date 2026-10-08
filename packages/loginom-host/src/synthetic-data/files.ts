import { cellText, type Cell, type DefectRecord, type RowBreak, type TableData } from "./cells"
import type { Output, Table } from "./spec"
import { writeJson, writeJsonl, writeXml } from "./writers/structured"
import { writeDelimited } from "./writers/text"
import { writeWorkbook } from "./writers/xlsx"

export type LocatedDefect = DefectRecord & { file: string; line: number }

type Group = {
  filename: string
  sheet: string
  table: string
  columns: string[]
  output: Output
  rows: Array<{ index: number; cells: Cell[]; broken: RowBreak }>
}

export async function renderFiles(tables: Array<{ spec: Table; data: TableData }>, defects: DefectRecord[]) {
  const groups = tables.flatMap((table) => splitTable(table.spec, table.data))
  if (groups.length > 200) throw Error("SYNTHETIC_DATA_LIMIT")
  const files = new Map<string, Group[]>()
  for (const group of groups) {
    const current = files.get(group.filename) ?? []
    if (current.length && current[0]?.output.format !== "xlsx") throw Error("SYNTHETIC_DATA_SPEC_INVALID")
    if (current.length && group.output.format !== "xlsx") throw Error("SYNTHETIC_DATA_SPEC_INVALID")
    current.push(group)
    files.set(group.filename, current)
  }
  const locations = new Map<string, { file: string; line: number }>()
  const rendered: Array<{ filename: string; bytes: Uint8Array; rows: number; table: string }> = []
  for (const [filename, sheets] of files) {
    for (const sheet of sheets) {
      sheet.rows.forEach((row, index) => locations.set(`${sheet.table}:${row.index}`, { file: filename, line: index + 1 }))
    }
    const bytes = await render(sheets)
    rendered.push({ filename, bytes, rows: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0), table: sheets.map((sheet) => sheet.table).join(",") })
  }
  const located: LocatedDefect[] = defects.flatMap((defect) => {
    const place = locations.get(`${defect.table}:${defect.row}`)
    if (!place) return []
    return [{ ...defect, file: place.file, line: place.line }]
  })
  return { files: rendered, defects: located }
}

function splitTable(table: Table, data: TableData): Group[] {
  const extension = table.output.format
  const buckets = new Map<string, Group["rows"]>()
  data.rows.forEach((cells, index) => {
    const key = table.split ? cellText(cells[data.columns.indexOf(table.split.by)] ?? { kind: "null" }) : ""
    const rows = buckets.get(key) ?? []
    rows.push({ index, cells, broken: data.broken[index] ?? null })
    buckets.set(key, rows)
  })
  return [...buckets].map(([key, rows]) => ({
    filename: table.split ? table.split.file.replaceAll("{value}", sanitize(key)) : table.output.file ?? `${sanitize(table.name)}.${extension}`,
    sheet: table.split ? `${table.output.sheet} ${key}`.trim() : table.output.sheet,
    table: table.name,
    columns: data.columns,
    output: table.output,
    rows,
  }))
}

async function render(groups: Group[]) {
  const first = groups[0]
  if (!first) throw Error("SYNTHETIC_DATA_FAILED")
  if (first.output.format === "xlsx") return writeWorkbook(groups.map((group) => ({ name: group.sheet, columns: group.columns, rows: group.rows.map((row) => row.cells), output: group.output })))
  if (first.output.format === "json") return writeJson(first.columns, first.rows.map((row) => row.cells), first.output)
  if (first.output.format === "jsonl") return writeJsonl(first.columns, first.rows.map((row) => row.cells), first.output)
  if (first.output.format === "xml") return writeXml(first.table, first.columns, first.rows.map((row) => row.cells), first.output)
  return writeDelimited(first.columns, first.rows, first.output)
}

function sanitize(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/gu, "")
  return cleaned || "empty"
}

export function safeFileName(filename: string) {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..") || filename.startsWith(".")) return
  return filename
}
