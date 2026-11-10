import type { DashboardState } from "./loginom"

export function summarize(table: NonNullable<DashboardState["table"]>) {
  const channel = table.schema.findIndex(field => field.name === "channel")
  const campaigns = table.schema.findIndex(field => field.name === "campaigns")
  if (channel < 0 || campaigns < 0) return { rows: [], total: 0, error: "В выходе Loginom отсутствуют поля channel или campaigns." }
  if (table.rows.some(row => typeof row[campaigns] !== "number" || !Number.isSafeInteger(row[campaigns]) || Number(row[campaigns]) < 0)) {
    return { rows: [], total: 0, error: "В поле campaigns ожидается неотрицательное целое число для каждого канала." }
  }
  const rows = table.rows.map(row => ({ channel: String(row[channel] ?? "Без канала"), campaigns: row[campaigns] as number }))
  return { rows, total: rows.reduce((sum, row) => sum + row.campaigns, 0), error: null }
}
