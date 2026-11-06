// Разбирает events.jsonl попытки и сверяет фактическую модель с настройками. Пишет summary.json.
import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readSettings } from "./settings"

if (!process.argv[2]) throw new Error("usage: bun summarize_attempt.ts <attempt_dir>")
const attempt = path.resolve(process.argv[2])
const settings = readSettings("AGENT_REPO", "PROFILE", "MODEL")
const { parseEvents } = await import(path.join(settings.AGENT_REPO, "evals/src/cli.ts"))
const parsed = parseEvents(readFileSync(path.join(attempt, "events.jsonl"), "utf8"))
const models = sessionModels(settings.PROFILE, parsed.sessionId)
const expected = {
  providerID: settings.MODEL.split("/")[0],
  modelID: settings.MODEL.split("/").slice(1).join("/"),
  variant: settings.VARIANT || null,
}
const confirmed = models.length === 1 && JSON.stringify(models[0]) === JSON.stringify(expected)
const summary = {
  sessionId: parsed.sessionId ?? null,
  saveReceipts: parsed.saveReceipts,
  skillRevision: parsed.skillRevision ?? null,
  errors: parsed.errors,
  errorTexts: parsed.errorTexts,
  counters: parsed.counters,
  tokens: parsed.tokens,
  finalText: parsed.finalText ?? null,
  models,
  expectedModel: expected,
  modelConfirmed: confirmed,
}
writeFileSync(path.join(attempt, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
console.log(JSON.stringify({ sessionId: summary.sessionId, confirmed, models }))
process.exit(confirmed ? 0 : 1)

function sessionModels(profile: string, sessionId: string | undefined) {
  if (!sessionId) return []
  const database = new Database(path.join(profile, "data/loginom-ai-agent.db"), { readonly: true })
  const query = "select data from message where session_id = ? and json_extract(data, '$.role') = 'assistant'"
  const rows = database.query(query).all(sessionId) as { data: string }[]
  database.close()
  const seen = new Map<string, { providerID: unknown; modelID: unknown; variant: unknown }>()
  for (const row of rows) {
    const data = JSON.parse(row.data) as { providerID?: unknown; modelID?: unknown; variant?: unknown }
    const model = { providerID: data.providerID ?? null, modelID: data.modelID ?? null, variant: data.variant ?? null }
    seen.set(JSON.stringify(model), model)
  }
  return [...seen.values()]
}
