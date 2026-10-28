#!/usr/bin/env bun
/**
 * Compares two compat-snapshot.ts outputs.
 *
 * The "before" snapshot is first rewritten with the documented internal renames
 * (@loginom-ai-agent/<upstream package> -> @opencode-ai/<package>, @loginom-ai-agent/agent -> opencode,
 * packages/agent -> packages/opencode). Every remaining difference is printed as a JSON path with both
 * values. Exit code 0 means the external surface is identical modulo those renames; 1 means differences.
 *
 * Usage: bun scripts/upstream-sync/compat-compare.ts before.json after.json [--allow path-prefix ...]
 * --allow lists JSON-path prefixes whose differences are explained elsewhere (e.g. in docs/upstream-sync/compat.md).
 */
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { allow: { type: "string", multiple: true } },
  allowPositionals: true,
})
const [beforePath, afterPath] = positionals
if (!beforePath || !afterPath) throw new Error("usage: compat-compare.ts before.json after.json [--allow prefix ...]")
const allow = values.allow ?? []

const FORK_ONLY = "product|loginom-host|runtime|site|evals"
const rename = (text: string) =>
  text
    .replaceAll(/@loginom-ai-agent\/agent(?![A-Za-z0-9_-])/g, "opencode")
    .replaceAll(new RegExp(`@loginom-ai-agent/(?!(?:${FORK_ONLY})(?![A-Za-z0-9_-]))`, "g"), "@opencode-ai/")
    .replaceAll(/packages\/agent(?![\w-])/g, "packages/opencode")
    .replaceAll("../../agent/", "../../opencode/")

// Arrays of plain strings are compared as sets: renaming changes their sort order.
const normalize = (value: unknown): unknown => {
  if (typeof value === "string") return rename(value)
  if (Array.isArray(value)) {
    const items = value.map(normalize)
    return items.every((item) => typeof item === "string") ? [...(items as string[])].sort() : items
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [rename(key), normalize(item)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    )
  return value
}

const sortedArrays = new Set(["envLiterals", "opencodeEnvFiles", "externalLiterals", "pluginMentions"])
const before: any = normalize(JSON.parse(readFileSync(beforePath, "utf8")))
const after: any = normalize(JSON.parse(readFileSync(afterPath, "utf8")))
delete before.head
delete after.head
delete before.agentDir
delete after.agentDir

const differences: string[] = []
const walk = (path: string, left: any, right: any) => {
  if (JSON.stringify(left) === JSON.stringify(right)) return
  if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) walk(`${path}.${key}`, left[key], right[key])
    return
  }
  if (Array.isArray(left) && Array.isArray(right) && sortedArrays.has(path.slice(1))) {
    const onlyLeft = left.filter((item) => !right.includes(item))
    const onlyRight = right.filter((item) => !left.includes(item))
    differences.push(`${path}: only before ${JSON.stringify(onlyLeft)}; only after ${JSON.stringify(onlyRight)}`)
    return
  }
  differences.push(`${path}: before=${JSON.stringify(left)?.slice(0, 300)} after=${JSON.stringify(right)?.slice(0, 300)}`)
}
walk("", before, after)

const explained = differences.filter((line) => allow.some((prefix) => line.slice(1).startsWith(prefix)))
const unexplained = differences.filter((line) => !explained.includes(line))
for (const line of explained) console.log(`ALLOWED   ${line}`)
for (const line of unexplained) console.log(`DIFFERENT ${line}`)
console.log(`${unexplained.length === 0 ? "IDENTICAL" : "DIFFERENT"}: ${unexplained.length} unexplained, ${explained.length} allowed differences`)
process.exit(unexplained.length === 0 ? 0 : 1)
