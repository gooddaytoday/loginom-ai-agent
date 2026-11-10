import type { DashboardState } from "./loginom"

export function summarize(table: NonNullable<DashboardState["table"]>) {
  const fields = ["channel", "total_budget", "total_revenue", "campaigns", "roi_pct"]
  const columns = fields.map(name => table.schema.findIndex(column => column.name === name))
  const missing = fields.filter((_, index) => columns[index] < 0)
  const empty = { rows: [], totals: { budget: 0, revenue: 0, campaigns: 0 } }
  if (missing.length) return { ...empty, error: `В результате отсутствуют поля: ${missing.join(", ")}.` }
  const valid = table.rows.every(row => typeof row[columns[0]] === "string" && columns.slice(1, 4).every(column => typeof row[column] === "number" && Number.isFinite(row[column])) && Number.isInteger(row[columns[3]]) && Number(row[columns[3]]) >= 0)
  if (!valid) return { ...empty, error: "В результате ожидаются название канала, числовые суммы и неотрицательный целый счётчик campaigns." }
  const rows = table.rows.map(row => ({
    channel: String(row[columns[0]]),
    budget: Number(row[columns[1]]),
    revenue: Number(row[columns[2]]),
    campaigns: Number(row[columns[3]]),
    roi: row[columns[1]] === 0 || typeof row[columns[4]] !== "number" ? null : Number(row[columns[4]]),
  }))
  return {
    rows,
    totals: rows.reduce((sum, row) => ({ budget: sum.budget + row.budget, revenue: sum.revenue + row.revenue, campaigns: sum.campaigns + row.campaigns }), empty.totals),
    error: null,
  }
}
