import type { Rng } from "./rng"
import type { Link, LinkLevel } from "./spec"

export function materializeLink(link: Link, rng: Rng) {
  const rows = link.rows ?? expandLevels(link.generate ?? [], rng)
  return rows.slice(0, 5000)
}

export function pickTuple(rng: Rng, rows: string[][], distribution: "uniform" | "zipf", zipf: number, weights: number[] | undefined) {
  if (!rows.length) return 0
  if (weights?.length === rows.length) return weighted(rng, weights)
  if (distribution === "zipf") return weighted(rng, rows.map((_, index) => 1 / (index + 1) ** zipf))
  return rng.int(0, rows.length - 1)
}

export function sharedValueCount(rows: string[][]) {
  const groups = new Map<string, Set<string>>()
  for (const row of rows) {
    const value = row.at(-1) ?? ""
    const group = row[0] ?? ""
    const set = groups.get(value) ?? new Set<string>()
    set.add(group)
    groups.set(value, set)
  }
  return [...groups.values()].filter((set) => set.size > 1).length
}

function expandLevels(levels: LinkLevel[], rng: Rng) {
  const first = levels[0]
  if (!first) return []
  let tuples = levelValues(first).map((value) => [value])
  for (const level of levels.slice(1)) {
    const values = levelValues(level)
    const next: string[][] = []
    for (const tuple of tuples) {
      for (let index = 0; index < level.fanout && next.length < 5000; index += 1) {
        const child = values[rng.int(0, values.length - 1)] ?? values[0] ?? ""
        next.push([...tuple, child])
        if (level.share > 0 && tuples.length > 1 && rng.chance(level.share)) {
          const other = tuples[rng.int(0, tuples.length - 1)] ?? tuple
          if (other !== tuple) next.push([...other, child])
        }
      }
    }
    tuples = dedupe(next)
  }
  return tuples
}

function levelValues(level: LinkLevel) {
  if (level.values?.length) return level.values
  return Array.from({ length: level.count ?? 1 }, (_, index) => `${level.prefix ?? ""}${index + 1}`)
}

function dedupe(rows: string[][]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = row.join("\u0000")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function weighted(rng: Rng, weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let mark = rng.next() * (total || 1)
  for (let index = 0; index < weights.length; index += 1) {
    mark -= weights[index] ?? 0
    if (mark <= 0) return index
  }
  return weights.length - 1
}
