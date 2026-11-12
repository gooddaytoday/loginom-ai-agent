import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { checkCrashLog, checkStartup, containsRetiredEndpoint } from "./windows-installed-smoke.mjs"

test("startup requires the exact packaged version and actual readiness", () => {
  const start = "[info] app starting { version: '0.3.9', packaged: true, onboardingTest: true }\n"
  assert.throws(() => checkStartup(start + "[info] awaiting server ready", "0.3.9"), /SERVER_READY_MISSING/)
  assert.throws(() => checkStartup(start + "[info] server ready { url: 'http://localhost:1' }", "0.4.0"), /VERSION/)
  assert.throws(() => checkStartup(start.replace("packaged: true", "packaged: false") + "[info] server ready {}", "0.3.9"), /INSTALLED_APP/)
  checkStartup(start + "[info] server ready { url: 'http://localhost:1' }", "0.3.9")
})

test("normal crash reporter setup is allowed, crash events fail", () => {
  checkCrashLog("[2026-11-12] [info] (crash) crash reporter started { path: 'profile\\Crashpad' }\n")
  assert.throws(() => checkCrashLog("[error] (crash) previous session ended unexpectedly"), /CRASH_LOG_FAILURE/)
  assert.throws(() => checkCrashLog("[info] (crash) renderer process gone"), /CRASH_LOG_FAILURE/)
})

test("retired endpoint scan detects binary ASCII and UTF-16 across chunk boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "windows-smoke-scan-"))
  const path = join(root, "payload.asar")
  try {
    for (const encoding of ["utf8", "utf16le"]) {
      await writeFile(path, Buffer.concat([Buffer.alloc(13), Buffer.from("mcp.loginom.ai", encoding), Buffer.alloc(13)]))
      assert.equal(await containsRetiredEndpoint(path, 16), true)
    }
    await writeFile(path, "https://app.loginom.ai/resources/help")
    assert.equal(await containsRetiredEndpoint(path, 16), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
