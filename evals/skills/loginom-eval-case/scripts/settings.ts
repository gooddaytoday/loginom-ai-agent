// Читает несекретные настройки skill так же, как settings.py.
import { readFileSync } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"

export function readSettings<K extends string>(...required: K[]) {
  const file = process.env.LOGINOM_EVAL_CASE_ENV ?? path.join(homedir(), ".config/loginom-eval-case/env")
  const values: Record<string, string> = {}
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const index = trimmed.indexOf("=")
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }
  const missing = required.filter((key) => !values[key])
  if (missing.length) throw new Error(`в настройках нет: ${missing.join(", ")}`)
  return values as Record<K, string> & Record<string, string>
}
