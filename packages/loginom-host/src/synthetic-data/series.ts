import type { Rng } from "./rng"
import type { Column, SeriesSpec } from "./spec"

export function periods(from: string, to: string, weekdays: SeriesSpec["weekdays"]) {
  const dates: string[] = []
  let cursor = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  while (cursor <= end && dates.length < 100_000) {
    const day = new Date(cursor).getUTCDay()
    if (weekdays === "all" || (day !== 0 && day !== 6)) dates.push(new Date(cursor).toISOString().slice(0, 10))
    cursor += 86_400_000
  }
  return dates
}

export function seriesGrid(spec: SeriesSpec, columns: Column[]) {
  const date = columns.find((column) => column.name === spec.date && (column.type === "date" || column.type === "datetime"))
  if (!date || (date.type !== "date" && date.type !== "datetime")) return
  const keys = spec.by.map((name) => {
    const column = columns.find((item) => item.name === name && item.type === "category")
    return column && column.type === "category" ? column.values : undefined
  })
  if (keys.some((item) => !item?.length)) return
  const lists = keys.filter((item): item is string[] => !!item)
  const combos = lists.reduce<string[][]>((acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])), [[]])
  const dates = periods(date.from, date.to, spec.weekdays)
  return { combos: combos.slice(0, 500), dates, time: date.type === "datetime" }
}

export function walkStep(rng: Rng, column: Extract<Column, { type: "walk" }>, previous: number | undefined) {
  const start = typeof column.start === "number" ? column.start : undefined
  const current = previous ?? start ?? 0
  const shock = rng.normal()
  const next = column.model === "arithmetic"
    ? current + column.drift + column.volatility * shock
    : column.model === "ar1"
      ? (column.mean ?? current) + (column.speed ?? 0.5) * (current - (column.mean ?? current)) + column.volatility * shock
      : current * Math.exp(column.drift - 0.5 * column.volatility ** 2 + column.volatility * shock)
  const floored = column.floor === undefined ? next : Math.max(column.floor, next)
  const factor = 10 ** column.scale
  return Math.round(floored * factor) / factor
}

export function addOffset(value: string, amount: number, unit: "minutes" | "hours" | "days") {
  const base = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value)
  const delta = unit === "days" ? amount * 86_400_000 : unit === "hours" ? amount * 3_600_000 : amount * 60_000
  return new Date(base + delta).toISOString()
}
