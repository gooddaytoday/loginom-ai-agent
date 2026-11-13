import assert from "node:assert/strict"
import test from "node:test"
import { attacker, fixture } from "./fixture.mjs"

async function open(app) {
  if (await app.page.locator("#dashboard-tab-overlay").count())
    await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()
  await app.page.evaluate(() => { window.channels = 0 })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.locator('iframe[title="Dashboard"]').waitFor()
  const frame = app.frame() ?? await app.page.waitForEvent("framenavigated", { predicate: frame => frame.url().startsWith(app.appOrigin + "/apps/") })
  await frame.waitForFunction(() => window.port && window.state)
  await frame.waitForLoadState("load")
  return frame
}

test("the headerless WebRTC control does not prohibit ICE candidates", async t => {
  const target = await attacker(t)
  const app = await fixture(t, { published: true, app: "malicious", connectionAllowlist: false })
  const frame = await open(app)
  assert.equal(await frame.evaluate(origin => window.attacks.webrtc(origin), target.origin), "leaked")
})

for (const connectionAllowlist of [true, false]) {
  test(`malicious app attempts are blocked (Connection-Allowlist=${connectionAllowlist})`, async t => {
    const target = await attacker(t)
    const app = await fixture(t, { published: true, app: "malicious", connectionAllowlist })
    const popups = []
    app.page.on("popup", page => popups.push(page))
    const cases = [
      ...["parent", "bg", "frameElement", "credentials", "storage", "cookie", "modal", "sibling",
        "forgedState", "secondReady", "flood", "huge", "uncloneable", "foreignReady", "foreignClose"].map(name => [name]),
      ...["fetch", "beacon", "websocket", "image", "navigate", "top", "open", "form"]
        .flatMap(name => [target.origin, app.origin].map(origin => [name, origin])),
      ...(connectionAllowlist ? [["webrtc", target.origin], ["webrtc", app.origin]] : []),
    ]
    for (const [name, origin] of cases) {
      const label = `${name} ${origin ?? ""}`
      await t.test(label, async () => {
        const before = { connections: target.connections(), requests: target.requests(), clientHits: app.clientHits(), violations: await app.page.evaluate(() => window.violations.length) }
        const frame = await open(app)
        const url = frame.url()
        const result = name.startsWith("foreign")
          ? await app.page.evaluate(name => {
              window.postMessage({ type: name === "foreignReady" ? "loginom-dashboard/ready" : "loginom-dashboard/close", version: 1 }, "*")
              return "blocked"
            }, name)
          : await frame.evaluate(({ name, origin }) => window.attacks[name](origin), { name, origin }).catch(error => {
              if (["navigate", "sibling"].includes(name) && /Execution context was destroyed|Frame was detached/.test(error.message)) return "blocked"
              throw error
            })
        await new Promise(resolve => setTimeout(resolve, 1000))
        assert.equal(target.requests() - before.requests, 0, label)
        assert.equal(app.clientHits() - before.clientHits, 0, label)
        assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [], label)
        assert.equal(await app.page.evaluate(() => window.fixture.calls), 0, label)
        assert.deepEqual(app.dialogs, [], label)
        assert.equal(popups.length, 0, label)
        assert.equal(app.page.url(), app.origin + "/app/", label)
        if (["beacon", "websocket"].includes(name)) assert.ok(await frame.evaluate(() => window.violations.some(event => event.directive === "connect-src")), label)
        assert.equal(result, name === "uncloneable" ? "DataCloneError" : "blocked", label)
        assert.equal(await app.page.evaluate(() => window.channels), 1, label)
        if (name.startsWith("foreign")) assert.equal(await app.page.locator('iframe[title="Dashboard"]').count(), 1, label)
        if (["secondReady", "flood"].includes(name)) assert.equal(await app.page.locator('iframe[title="Dashboard"]').count(), 0, label)
        if (await app.page.locator('iframe[title="Dashboard"]').count()) assert.equal(app.frame()?.url(), url, label)
        if (!connectionAllowlist && name === "navigate" && origin === target.origin) {
          assert.ok(target.connections() - before.connections <= 1, label)
          assert.equal(await app.page.locator('iframe[title="Dashboard"]').count(), 0, label)
          assert.ok(await app.page.evaluate(({ start, origin }) => window.violations.slice(start).some(event =>
            event.directive === "frame-src" && new URL(event.blockedURI).origin === origin),
          { start: before.violations, origin: target.origin }), label)
        } else assert.equal(target.connections() - before.connections, 0, label)
        t.diagnostic(label + ": blocked")
      })
    }
  })

  test(`app documents have opaque origins and reject foreign embedding (Connection-Allowlist=${connectionAllowlist})`, async t => {
    const target = await attacker(t)
    const app = await fixture(t, { published: true, app: "malicious", connectionAllowlist })
    const frame = await open(app)
    const url = frame.url()
    const standalone = await app.page.context().newPage()
    await standalone.goto(url)
    assert.equal(await standalone.evaluate(() => self.origin), "null")
    assert.equal(await standalone.evaluate(() => { try { document.cookie; return false } catch { return true } }), true)
    const foreign = await app.page.context().newPage()
    await foreign.goto(target.origin + "/embed?src=" + encodeURIComponent(url))
    await foreign.locator("iframe").waitFor()
    const child = foreign.frames().find(frame => frame.parentFrame())
    assert.ok(child)
    await child.waitForFunction(() => location.href.startsWith("chrome-error://"))
    assert.equal(await child.evaluate(() => typeof window.attacks), "undefined")
    assert.ok(target.connections() > 0)
    assert.ok(target.requests() > 0)
  })
}
