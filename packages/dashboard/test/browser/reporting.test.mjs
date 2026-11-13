import assert from "node:assert/strict"
import test from "node:test"
import { attacker, fixture } from "./fixture.mjs"

test("opaque dashboard sends a native CSP report to the app host", async t => {
  const target = await attacker(t)
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  const frame = app.frame()
  const document = frame.url()
  assert.equal(await frame.evaluate(() => self.origin), "null")
  assert.equal(await frame.evaluate(async url => {
    try { await fetch(url); return "allowed" }
    catch (error) { return error.name }
  }, target.origin + "/"), "TypeError")
  const deadline = Date.now() + 5_000
  while (!app.reports.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(app.reports.length, 1, "actual POST /_reports from the browser")
  const report = JSON.parse(JSON.parse(app.reports[0].slice("dashboard report ".length)))["csp-report"]
  assert.equal(report["document-uri"], document)
  assert.equal(report["effective-directive"], "connect-src")
  assert.equal(new URL(report["blocked-uri"]).origin, target.origin)
  assert.equal(report.disposition, "enforce")
  assert.equal(target.connections(), 0)
  assert.equal(target.requests(), 0)
})
