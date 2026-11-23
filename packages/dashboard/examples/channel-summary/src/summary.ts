import type { DashboardState } from "./loginom"

export function summarize(table: NonNullable<DashboardState["table"]>) {
  const fields = ["channel", "campaigns"]
  const columns = fields.map(name => table.schema.findIndex(field => field.name === name))
  const missing = fields.filter((_, index) => columns[index] < 0)
  if (missing.length) return { rows: [], total: 0, error: `Структура данных изменилась. Отсутствующие поля: ${missing.join(", ")}. Нажмите «Изменить в чате».` }
  const [channel, campaigns] = columns
  if (table.rows.some(row => typeof row[campaigns] !== "number" || !Number.isSafeInteger(row[campaigns]) || Number(row[campaigns]) < 0)) {
    return { rows: [], total: 0, error: "В поле campaigns ожидается неотрицательное целое число для каждого канала." }
  }
  const rows = table.rows.map(row => ({ channel: String(row[channel] ?? "Без канала"), campaigns: row[campaigns] as number }))
  return { rows, total: rows.reduce((sum, row) => sum + row.campaigns, 0), error: null }
}
