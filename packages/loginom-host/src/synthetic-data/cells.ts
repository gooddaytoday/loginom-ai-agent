export type Cell =
  | { kind: "null" }
  | { kind: "number"; value: number; scale?: number }
  | { kind: "text"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "date"; value: string; time: boolean }

export type RowBreak = "extra" | "missing" | null

export type TableData = {
  name: string
  columns: string[]
  rows: Cell[][]
  broken: RowBreak[]
}

export type DefectRecord = {
  table: string
  row: number
  column: string
  kind: string
  original: string
  value: string
}

export function cellText(cell: Cell) {
  if (cell.kind === "null") return ""
  if (cell.kind === "number") return cell.scale === undefined ? String(cell.value) : cell.value.toFixed(cell.scale)
  if (cell.kind === "bool") return cell.value ? "true" : "false"
  return cell.value
}

export function copyCell(cell: Cell): Cell {
  if (cell.kind === "number") return { kind: "number", value: cell.value, scale: cell.scale }
  if (cell.kind === "text") return { kind: "text", value: cell.value }
  if (cell.kind === "bool") return { kind: "bool", value: cell.value }
  if (cell.kind === "date") return { kind: "date", value: cell.value, time: cell.time }
  return { kind: "null" }
}
