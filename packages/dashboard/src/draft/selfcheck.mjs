import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [playwright, executablePath, url] = process.argv.slice(2)
const { chromium } = await import(pathToFileURL(join(playwright, "index.mjs")).href)
// Model-written code runs in a fresh profile with the Chromium sandbox enabled.
const browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true, args: ["--no-proxy-server"] })
try {
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
  await browser.close()
}
