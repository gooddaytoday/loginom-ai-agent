import assert from "node:assert/strict"
import test from "node:test"
import { fixture } from "./fixture.mjs"

test("opaque dashboard sends a native CSP report to the app host", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  const frame = app.frame()
  const [, , key, buildHash] = new URL(frame.url()).pathname.split("/")
  assert.equal(await frame.evaluate(() => self.origin), "null")
  assert.equal(app.reports.length, 0)
  await frame.evaluate(() => {
    const style = document.createElement("style")
    style.textContent = "body { color: rgb(1, 2, 3); }"
    document.head.append(style)
  })
  await frame.waitForFunction(() => window.violations.some(event => event.directive === "style-src-elem" && event.blockedURI === "inline"))
  const deadline = Date.now() + 5_000
  while (!app.reports.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(app.reports.length, 1, "actual POST /_reports from the browser")
  const { timestamp, ...event } = JSON.parse(app.reports[0])
  assert.equal(new Date(timestamp).toISOString(), timestamp)
  assert.deepEqual(event, {
    role: "web", event: "csp_violation", key, buildHash, directive: "style-src-elem", disposition: "enforce",
  })
})
