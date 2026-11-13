import assert from "node:assert/strict"
import test from "node:test"
import { fixture } from "./fixture.mjs"

const unsupported = "Dashboard открывается в Chrome, Edge или Яндекс Браузере на Chromium 152 и новее"

test("strict mode opens a protected host and caches support before calculation and snapshot", async t => {
  const app = await fixture(t, { published: true, status: "inactive", mode: "strict" })
  let probes = 0
  app.page.context().on("request", request => { if (request.url() === app.appOrigin + "/_probe/") probes++ })
  for (let attempt = 0; attempt < 2; attempt++) {
    await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
    const state = await app.settled()
    assert.equal(state.table.rows[0][0], 42)
    assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
    assert.equal(app.snapshots.length, 0)
    assert.equal(probes, 1)
    assert.equal(await app.page.locator("iframe").count(), 1)
    await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()
  }
  assert.deepEqual(app.errors, [])
})

test("strict mode refuses a headerless host before calculation or snapshot and caches refusal", async t => {
  const app = await fixture(t, { published: true, status: "inactive", mode: "strict", connectionAllowlist: false })
  let probes = 0
  app.page.context().on("request", request => { if (request.url() === app.appOrigin + "/_probe/") probes++ })
  for (let attempt = 0; attempt < 2; attempt++) {
    await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
    await app.page.getByRole("status").filter({ hasText: unsupported }).waitFor()
    assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
    assert.equal(app.snapshots.length, 0)
    assert.equal(probes, 1)
    assert.equal(await app.page.locator("iframe").count(), 0)
    await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()
  }
  assert.deepEqual(app.errors, [])
})

test("an unanswered strict probe times out and is retried on reopening", async t => {
  const app = await fixture(t, { published: true, status: "inactive", mode: "normal", lookupMode: "strict" })
  let probes = 0
  app.page.context().on("request", request => { if (request.url() === app.appOrigin + "/_probe/") probes++ })
  for (let attempt = 0; attempt < 2; attempt++) {
    await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
    await app.page.getByRole("status").filter({ hasText: "Хост dashboard недоступен" }).waitFor({ timeout: 7_000 })
    assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
    assert.equal(app.snapshots.length, 0)
    assert.equal(probes, attempt + 1)
    assert.equal(await app.page.locator("iframe").count(), 0)
    await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()
  }
  assert.deepEqual(app.errors, [])
})

test("strict mode lets creation reach Desktop without probing an unpublished app", async t => {
  const app = await fixture(t, { status: "inactive", mode: "strict" })
  const probes = []
  app.page.context().on("request", request => { if (request.url().startsWith(app.appOrigin + "/_probe/")) probes.push(request.url()) })
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.waitFor()
  assert.equal(app.snapshots.length, 1)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.equal(await app.page.evaluate(() => window.blockedDesktopLinks), 1)
  const url = new URL(await link.getAttribute("href"))
  assert.equal(url.protocol, "loginom-ai-agent:")
  assert.equal(url.searchParams.get("action"), "create")
  assert.ok(url.searchParams.get("id"))
  assert.deepEqual(probes, [])
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.deepEqual(app.errors, [])
})

test("a missing WebRTC API cannot make the strict probe report support", async t => {
  const app = await fixture(t, { published: true, status: "inactive", mode: "strict" })
  await app.page.context().addInitScript(() => { Object.defineProperty(window, "RTCPeerConnection", { value: undefined }) })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: unsupported }).waitFor()
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  assert.equal(app.snapshots.length, 0)
  assert.deepEqual(app.errors, [])
})
