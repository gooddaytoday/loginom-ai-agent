import { expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Logger } from "effect"
import { LOG_DAY_MS, pruneLegacyLogs } from "@loginom-ai-agent/loginom-host/local-logs"
import { desktopServiceLogger } from "../src/desktop-service-logging"

test("the service logger removes only its old journals and masks OAuth and API secrets in new ones", async () => {
  const root = mkdtempSync(join(tmpdir(), "service-logging-"))
  const previous = process.env.LOGINOM_AI_AGENT_SERVICE_LOG_DIR
  try {
    const nested = join(root, "nested")
    mkdirSync(nested)
    const expired = new Date(Date.now() - 8 * LOG_DAY_MS)
    const service = join(root, "service-expired.old.log")
    const unrelated = join(root, "another-app.log")
    const nestedService = join(nested, "service-expired.log")
    const legacy = join(nested, "loginom-ai-agent.log")
    const freshLegacy = join(nested, "loginom-ai-agent-dev.log")
    for (const file of [service, unrelated, nestedService, legacy, freshLegacy]) writeFileSync(file, "old log")
    for (const file of [service, unrelated, nestedService, legacy]) utimesSync(file, expired, expired)
    process.env.LOGINOM_AI_AGENT_SERVICE_LOG_DIR = root
    const serviceLogs = desktopServiceLogger()
    if (!serviceLogs) throw Error("Service logger was not loaded")
    expect(process.env.LOGINOM_AI_AGENT_SERVICE_LOG_DIR).toBeUndefined()

    const key = `AIza${"X".repeat(35)}`
    await Effect.runPromise(Effect.logInfo("ready", { access: "fixture-oauth-access", refresh: "fixture-oauth-refresh" },
      `https://example.test/?access_token=[redacted]&key=${key}&page=2`).pipe(
      Effect.provide(Logger.layer([serviceLogs.logger], { mergeWithExisting: false })),
    ))
    await serviceLogs.flush()
    expect(existsSync(service)).toBe(false)
    expect(existsSync(unrelated)).toBe(true)
    expect(existsSync(nestedService)).toBe(true)
    const files = readdirSync(root).filter((name) => /^service-.*\.log$/.test(name))
    expect(files).toHaveLength(1)
    const text = readFileSync(join(root, files[0]), "utf8")
    expect(text).toContain('"access":"[redacted]","refresh":"[redacted]"')
    expect(text).toContain("access_token=%5Bredacted%5D&key=%5Bredacted%5D&page=2")
    for (const secret of [key, "fixture-oauth-access", "fixture-oauth-refresh"]) expect(text).not.toContain(secret)

    pruneLegacyLogs([nested])
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(nestedService)).toBe(true)
    expect(existsSync(freshLegacy)).toBe(true)
  } finally {
    if (previous === undefined) delete process.env.LOGINOM_AI_AGENT_SERVICE_LOG_DIR
    else process.env.LOGINOM_AI_AGENT_SERVICE_LOG_DIR = previous
    rmSync(root, { recursive: true, force: true })
  }
})
