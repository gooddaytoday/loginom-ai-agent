import { createReadStream } from "node:fs"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"

export async function files(root) {
  const result = []
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name)
    if (item.isDirectory()) result.push(...await files(path))
    else if (item.isFile()) result.push(path)
    else throw Error(`UNEXPECTED_INSTALLED_LINK: ${path}`)
  }
  return result
}

// Stream every installed file, including ASAR and executables, without loading
// the Chromium payload into memory. Carry enough bytes across chunk boundaries.
export async function containsRetiredEndpoint(path, highWaterMark = 1024 * 1024) {
  const needles = [Buffer.from("mcp.loginom.ai"), Buffer.from("mcp.loginom.ai", "utf16le")]
  let tail = Buffer.alloc(0)
  for await (const chunk of createReadStream(path, { highWaterMark })) {
    const bytes = Buffer.concat([tail, chunk])
    if (needles.some((needle) => bytes.includes(needle))) return true
    tail = bytes.subarray(-Math.max(...needles.map((needle) => needle.length)) + 1)
  }
  return false
}

export function checkStartup(main, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  if (!new RegExp(`app starting\\s*\\{\\s*version: ['"]${escaped}['"]`).test(main))
    throw Error("APP_START_VERSION_MISSING")
  if (!/packaged: true/.test(main) || !/onboardingTest: true/.test(main)) throw Error("ISOLATED_INSTALLED_APP_REQUIRED")
  // Do not accept the earlier 'awaiting server ready' line as readiness.
  if (!/\[info\]\s+server ready\s*\{/.test(main)) throw Error("SERVER_READY_MISSING")
  if (/\[error\]|initialization failed/.test(main)) throw Error("MAIN_LOG_FAILURE")
}

export function checkCrashLog(text) {
  // initCrashReporter always writes crash.log, even on a healthy first launch.
  // Permit that one info event; all other crash events fail the smoke.
  const events = text.split(/\r?\n/).filter((line) => /\[(?:info|warn|error|debug)\]/.test(line))
  if (text.trim() && (!events.length || events.some((line) => !/\[info\].*crash reporter started/.test(line))))
    throw Error("CRASH_LOG_FAILURE")
}

async function probe(install, profile, evidence, version, executableName) {
  if (process.platform !== "win32") throw Error("WINDOWS_REQUIRED")
  const resources = join(install, "resources", "loginom")
  const installed = await files(install)
  const retired = []
  for (const path of installed) if (await containsRetiredEndpoint(path)) retired.push(path)
  await writeFile(join(evidence, "installed-files.json"), JSON.stringify({ files: installed.length, retired }, null, 2))
  if (retired.length) throw Error(`RETIRED_ENDPOINT_IN_INSTALLED_FILES: ${retired.join(", ")}`)
  const help = JSON.parse(await readFile(join(resources, "help", "help-manifest.json"), "utf8"))
  if (!help || typeof help !== "object" || !Object.keys(help).length) throw Error("HELP_MANIFEST_INVALID")
  const require = createRequire(join(resources, "runtime", "client", "package.json"))
  const { _electron } = require("playwright-core")
  const application = await _electron.launch({
    executablePath: join(install, executableName),
    env: { ...process.env, LOGINOM_AI_AGENT_TEST_ONBOARDING: "1", LOGINOM_AI_AGENT_TEST_ROOT: profile },
    timeout: 120_000,
  })
  const child = application.process()
  try {
    const page = await application.firstWindow({ timeout: 120_000 })
    await page.locator('[data-component="settings-loginom"]').waitFor({ timeout: 120_000 })
    if (await application.evaluate(({ app }) => app.getVersion()) !== version) throw Error("INSTALLED_VERSION_MISMATCH")
    if (resolve(await application.evaluate(({ app }) => app.getPath("userData"))) !== resolve(join(profile, "desktop")))
      throw Error("PROFILE_ISOLATION_FAILED")
    await page.screenshot({ path: join(evidence, "first-window.png") })
    const deadline = Date.now() + 60_000
    let main = ""
    while (Date.now() < deadline) {
      const logs = await files(join(profile, "desktop", "logs"))
      main = (await Promise.all(logs.filter((path) => path.endsWith("main.log")).map((path) => readFile(path, "utf8")))).join("\n")
      if (/\[info\]\s+server ready\s*\{/.test(main)) break
      await delay(500)
    }
    checkStartup(main, version)
  } finally {
    await application.close()
  }
  if (child.exitCode !== 0 || child.signalCode) throw Error("DESKTOP_UNCLEAN_EXIT")
  const logs = await files(join(profile, "desktop", "logs"))
  const main = (await Promise.all(logs.filter((path) => path.endsWith("main.log")).map((path) => readFile(path, "utf8")))).join("\n")
  checkStartup(main, version)
  if (!/app quit[\s\S]{0,100}exitCode: 0/.test(main)) throw Error("CLEAN_QUIT_LOG_MISSING")
  for (const path of logs.filter((path) => path.endsWith("crash.log"))) checkCrashLog(await readFile(path, "utf8"))
  if ((await files(join(profile, "desktop"))).some((path) => path.endsWith(".dmp"))) throw Error("CRASH_DUMP_FOUND")
  console.log(JSON.stringify({ status: "PASS", version, installedFilesScanned: installed.length, helpManifest: true, onboardingWindow: true, cleanExit: true }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [install, profile, evidence, version, executableName] = process.argv.slice(2)
  if (![install, profile, evidence, version, executableName].every(Boolean))
    throw Error("Usage: node windows-installed-smoke.mjs <install> <profile> <evidence> <version> <executableName>")
  await mkdir(evidence, { recursive: true })
  await probe(install, profile, evidence, version, executableName)
}
