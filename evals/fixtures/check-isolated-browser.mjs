import path from "node:path"
import { mkdir } from "node:fs/promises"
import { createRequire } from "node:module"

const [resources, browser, directory] = process.argv.slice(2)
const require = createRequire(path.join(resources, "runtime/client/package.json"))
const { chromium } = require("playwright-core")
const profile = path.join(directory, "browser-profile")
await mkdir(profile, { recursive: true, mode: 0o700 })
const context = await chromium.launchPersistentContext(profile, {
  executablePath: browser, headless: true, chromiumSandbox: true, timeout: 30_000, viewport: { width: 1280, height: 800 },
  downloadsPath: path.join(directory, "browser-downloads"),
  handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
  env: { ...process.env, CHROME_LOG_FILE: path.join(profile, "chrome-debug.log") },
  args: ["--no-proxy-server", "--disable-logging", `--log-file=${path.join(profile, "chrome-debug.log")}`],
})
try {
  await context.newPage()
  // Leave one observation window for the native process ownership supervisor.
  await new Promise(resolve => setTimeout(resolve, 200))
} finally {
  await context.close()
}
console.log("BROWSER_READY")
