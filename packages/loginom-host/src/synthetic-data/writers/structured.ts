import type { Cell } from "../cells"
import { displayCell } from "./text"
import type { Output } from "../spec"

export function writeJson(columns: string[], rows: Cell[][], output: Output) {
  const records = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, jsonValue(row[index], output)])))
  return new TextEncoder().encode(JSON.stringify(records, null, 2) + "\n")
}

export function writeJsonl(columns: string[], rows: Cell[][], output: Output) {
  const lines = rows.map((row) => JSON.stringify(Object.fromEntries(columns.map((column, index) => [column, jsonValue(row[index], output)]))))
  return new TextEncoder().encode(lines.join("\n") + (lines.length ? "\n" : ""))
}

export function writeXml(table: string, columns: string[], rows: Cell[][], output: Output) {
  const body = rows.map((row) => `  <row>${columns.map((column, index) => `<cell name="${escapeXml(column)}">${escapeXml(displayCell(row[index] ?? { kind: "null" }, output))}</cell>`).join("")}</row>`).join("\n")
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n<table name="${escapeXml(table)}">\n${body}\n</table>\n`)
}

function jsonValue(cell: Cell | undefined, output: Output) {
  if (!cell || cell.kind === "null") return null
  if (cell.kind === "number") return cell.value
  if (cell.kind === "bool") return cell.value
  if (cell.kind === "date") return displayCell(cell, output)
  return cell.value
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
