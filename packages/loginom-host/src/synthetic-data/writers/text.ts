import type { Cell, RowBreak } from "../cells"
import type { Output } from "../spec"

const cp1251 = new Map<number, number>([
  [0x0401, 0xa8],
  [0x0451, 0xb8],
  [0x2116, 0xb9],
  [0x00ab, 0xab],
  [0x00bb, 0xbb],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x00a0, 0xa0],
])

export function encodeText(text: string, output: Pick<Output, "encoding" | "bom">) {
  if (output.encoding === "cp1251") return encodeCp1251(text)
  const body = new TextEncoder().encode(text)
  if (!output.bom) return body
  const bytes = new Uint8Array(body.length + 3)
  bytes.set([0xef, 0xbb, 0xbf])
  bytes.set(body, 3)
  return bytes
}

export function encodeCp1251(text: string) {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f
    if (code <= 0x7f) bytes.push(code)
    else if (code >= 0x0410 && code <= 0x042f) bytes.push(0xc0 + code - 0x0410)
    else if (code >= 0x0430 && code <= 0x044f) bytes.push(0xe0 + code - 0x0430)
    else bytes.push(cp1251.get(code) ?? 0x3f)
  }
  return Uint8Array.from(bytes)
}

export function formatDate(value: string, pattern: string) {
  const [date, time = "00:00:00"] = value.split("T")
  const [year, month, day] = date.split("-")
  const [hour, minute, second] = time.split(":")
  return pattern.replaceAll("YYYY", year ?? "").replaceAll("MM", month ?? "").replaceAll("DD", day ?? "").replaceAll("HH", hour ?? "00").replaceAll("mm", minute ?? "00").replaceAll("ss", (second ?? "00").slice(0, 2))
}

export function formatNumber(cell: Extract<Cell, { kind: "number" }>, decimal: "." | ",") {
  const text = cell.scale === undefined ? String(cell.value) : cell.value.toFixed(cell.scale)
  return decimal === "," ? text.replace(".", ",") : text
}

export function displayCell(cell: Cell, output: Output) {
  if (cell.kind === "null") return ""
  if (cell.kind === "number") return formatNumber(cell, output.decimal)
  if (cell.kind === "bool") return cell.value ? "true" : "false"
  if (cell.kind === "date") return formatDate(cell.value, cell.time && !output.dateFormat.includes("HH") ? output.dateFormat + " HH:mm:ss" : output.dateFormat)
  return cell.value
}

export function writeDelimited(columns: string[], rows: Array<{ cells: Cell[]; broken: RowBreak }>, output: Output) {
  const lines = [
    ...(output.header ? [columns.map((column) => quote(column, output)).join(output.delimiter)] : []),
    ...rows.map((row) => line(columns, row.cells, row.broken, output)),
  ]
  return encodeText(lines.join(output.newline) + output.newline, output)
}

function line(columns: string[], cells: Cell[], broken: RowBreak, output: Output) {
  const values = columns.map((_, index) => quote(displayCell(cells[index] ?? { kind: "null" }, output), output))
  if (broken === "missing" && values.length) values.pop()
  const text = values.join(output.delimiter)
  if (broken === "extra") return text + output.delimiter + quote("BROKEN", output)
  return text
}

function quote(value: string, output: Output) {
  if (![output.delimiter, output.quote, "\n", "\r"].some((part) => value.includes(part))) return value
  return output.quote + value.replaceAll(output.quote, output.quote + output.quote) + output.quote
}

export function defectsTable(records: Array<{ file: string; table: string; row: number; column: string; kind: string; original: string; value: string }>) {
  const output: Output = { format: "csv", delimiter: ",", quote: "\"", encoding: "utf-8", bom: false, decimal: ".", dateFormat: "YYYY-MM-DD", newline: "\n", header: true, sheet: "defects" }
  const columns = ["file", "table", "row", "column", "kind", "original", "value"]
  const rows = records.map((record) => ({
    cells: [record.file, record.table, String(record.row), record.column, record.kind, record.original, record.value].map((value) => ({ kind: "text" as const, value })),
    broken: null,
  }))
  return writeDelimited(columns, rows, output)
}

