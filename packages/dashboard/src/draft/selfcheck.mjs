import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [playwright, executablePath, url] = process.argv.slice(2)
const { chromium } = await import(pathToFileURL(join(playwright, "index.mjs")).href)
// A stop during launch must wait until the browser can close its helpers cleanly.
let stopped = false
let browser
let closing
process.on("SIGTERM", () => {
  stopped = true
  if (browser) close()
})
// Model-written code runs in a fresh profile with the Chromium sandbox enabled.
browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true, handleSIGTERM: false, timeout: 30_000, args: ["--no-proxy-server"] })
try {
  if (stopped) throw Error("Self-check cancelled")
  const errors = []
  const context = await browser.newContext()
  await context.addInitScript(() => {
    addEventListener("securitypolicyviolation", event => console.error("CSP " + event.violatedDirective + " " + event.blockedURI))
    addEventListener("error", event => console.error("Uncaught " + event.message))
  })
  const page = await context.newPage()
  page.on("console", message => { if (message.type() === "error" && errors.length < 20) errors.push(message.text()) })
  page.on("pageerror", error => { if (errors.length < 20) errors.push(String(error)) })
  await page.goto(url)
  const state = await page.waitForFunction(() => document.body?.dataset.state, undefined, { timeout: 15_000 })
    .then(handle => handle.jsonValue()).catch(() => "timeout")
  // Late errors from the first render still count.
  await page.waitForTimeout(500)
  process.stdout.write(JSON.stringify({ ok: state === "ready" && errors.length === 0, state, errors }) + "\n")
} finally {
  await close()
}

function close() {
  if (closing) return closing
  closing = browser.close()
  // Observe signal-handler failures immediately; finally awaits the same outcome.
  void closing.catch(() => {})
  return closing
}
