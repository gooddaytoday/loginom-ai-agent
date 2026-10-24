import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { createInterface } from "node:readline"

const [resources, profile, heartbeat] = process.argv.slice(2)
const require = createRequire(path.join(resources, "runtime/client/package.json"))
const { chromium } = require("playwright-core")
const manifest = JSON.parse(await readFile(path.join(resources, "resource-manifest.json"), "utf8"))
await mkdir(profile, { recursive: true, mode: 0o700 })
const context = await chromium.launchPersistentContext(profile, {
  executablePath: path.join(resources, manifest.browser), headless: true, timeout: 10_000,
})
await writeFile(heartbeat, String(Date.now()), { mode: 0o600 })
let writing = Promise.resolve()
const timer = setInterval(() => {
  writing = writing.then(() => writeFile(heartbeat, String(Date.now()), { mode: 0o600 }))
}, 50)
console.log("ready")
try {
  for await (const line of createInterface({ input: process.stdin })) if (line === "close") break
} finally {
  clearInterval(timer)
  await writing
  await context.close()
}
