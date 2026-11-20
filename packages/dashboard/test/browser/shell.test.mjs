import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"
import { dashboardServer } from "../../src/web/server.ts"
import { fixture } from "./fixture.mjs"

test("trusted node data displays the rows already delivered to the dashboard", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  const frame = app.frame()
  await app.page.evaluate(() => { window.fixture.rows = [[99]] })
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  const table = app.page.getByRole("table", { name: "Данные узла" })
  await table.getByRole("columnheader", { name: "count", exact: true }).waitFor()
  await table.getByRole("cell", { name: "42", exact: true }).waitFor()
  assert.equal(await app.page.locator('iframe[title="Dashboard"]').isVisible(), false)
  await app.page.getByRole("button", { name: "К dashboard", exact: true }).click()
  await app.page.locator('iframe[title="Dashboard"]').waitFor()
  assert.equal(app.frame(), frame)
  assert.equal(await app.page.evaluate(() => window.channels), 1)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  assert.deepEqual(app.snapshots, [])
})

test("trusted node data supports keyboard paging and closing with only the current page rendered", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "count", type: 1 }], rows: Array.from({ length: 101 }, (_, index) => [index + 1]),
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  const table = app.page.getByRole("table", { name: "Данные узла" })
  assert.equal(await table.getByRole("cell").count(), 100)
  assert.equal(await table.getByRole("cell", { name: "101", exact: true }).count(), 0)
  const previous = app.page.getByRole("button", { name: "Назад", exact: true })
  const next = app.page.getByRole("button", { name: "Далее", exact: true })
  await next.focus()
  await app.page.keyboard.press("Enter")
  assert.deepEqual(await table.getByRole("cell").allTextContents(), ["101"])
  assert.equal(await previous.evaluate(button => button === document.activeElement), true)
  await app.page.keyboard.press("Enter")
  assert.equal(await table.getByRole("cell", { name: "1", exact: true }).count(), 1)
  assert.equal(await table.getByRole("cell").count(), 100)
  assert.equal(await next.evaluate(button => button === document.activeElement), true)
  await app.page.keyboard.press("Escape")
  assert.equal(await app.page.locator('iframe[title="Dashboard"]').count(), 0)
  assert.equal(await table.count(), 0)
})

test("Escape closes the dashboard after a version label click during queued calculations", async t => {
  const app = await fixture(t, { published: true })
  app.page.setDefaultTimeout(30_000)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  const input = app.page.getByLabel("MinBudget", { exact: true })
  await app.page.evaluate(() => { window.fixture.wait = true })
  await input.fill("100000")
  await input.press("Enter")
  await app.page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish)
  await input.fill("10000")
  await app.page.getByText("Версия 20261115T120000Z", { exact: true }).click()
  assert.equal(await app.page.evaluate(() => document.activeElement === document.body), true)
  await app.page.keyboard.press("Escape")
  assert.equal(await app.page.locator("#dashboard-tab-overlay").count(), 0)
  await app.page.evaluate(() => { window.fixture.wait = false; window.fixture.finish() })
  await app.page.waitForFunction(() => window.fixture.writes.includes(10000))
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  assert.equal(await app.page.getByLabel("MinBudget", { exact: true }).inputValue(), "10000")
  await app.page.keyboard.press("Escape")
  const prevented = await app.page.evaluate(() => !document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })))
  assert.equal(prevented, false)
})

test("trusted node data distinguishes an empty result from an absent result", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "count", type: 1 }], rows: [],
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  await app.page.getByRole("table", { name: "Данные узла" }).getByRole("columnheader", { name: "count" }).waitFor()
  assert.equal(await app.page.getByRole("status").filter({ hasText: "Нет строк" }).count(), 1)
  await app.page.evaluate(() => {
    const node = window.Ext.ComponentQuery.query("panel#pnlModelForm")[0].Controller.GetOneSelectedNode().GetData()
    // The result disappears after execution succeeds, before the shell reads it.
    let active = true
    node.get_Status = async () => {
      const status = active ? "active" : "inactive"
      active = false
      return status
    }
  })
  const input = app.page.getByLabel("MinBudget", { exact: true })
  await input.fill("17")
  await input.press("Enter")
  await app.page.getByRole("status").filter({ hasText: "Нет данных узла" }).waitFor()
  assert.equal(await app.page.getByRole("table", { name: "Данные узла" }).count(), 0)
  assert.equal(await app.page.getByRole("status").filter({ hasText: "Нет строк" }).count(), 0)
})

test("trusted node data hides prior results until queued calculations settle and recovers from errors", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "count", type: 1 }], rows: Array.from({ length: 101 }, (_, index) => [index + 1]),
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  await app.page.getByRole("button", { name: "Далее", exact: true }).click()
  const data = app.page.getByRole("table", { name: "Данные узла" })
  assert.deepEqual(await data.getByRole("cell").allTextContents(), ["101"])
  const input = app.page.getByLabel("MinBudget", { exact: true })
  const change = async value => {
    await input.fill(value)
    await input.press("Enter")
  }
  const calculating = app.page.getByRole("status").filter({ hasText: "Идёт расчёт" })
  await app.page.evaluate(() => { window.fixture.wait = true })
  await change("17")
  await app.page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish)
  await calculating.waitFor()
  assert.equal(await data.isVisible(), false)
  await change("29")
  await app.page.evaluate(() => {
    window.fixture.rows = [[170]]
    const finish = window.fixture.finish
    delete window.fixture.finish
    finish()
  })
  await app.page.waitForFunction(() => window.fixture.calls === 2 && window.fixture.finish)
  await calculating.waitFor()
  assert.equal(await data.isVisible(), false)
  await app.page.evaluate(() => {
    window.fixture.rows = Array.from({ length: 101 }, (_, index) => [290 + index])
    window.fixture.wait = false
    window.fixture.finish()
  })
  await data.getByRole("cell", { name: "290", exact: true }).waitFor()
  await app.page.getByRole("button", { name: "Далее", exact: true }).click()
  assert.deepEqual(await data.getByRole("cell").allTextContents(), ["390"])
  await app.page.evaluate(() => { window.fixture.executeError = Error("Calculation failed") })
  await change("31")
  await app.page.getByRole("status").filter({ hasText: "Calculation failed" }).waitFor()
  assert.equal(await data.isVisible(), false)
  await app.page.evaluate(() => { delete window.fixture.executeError })
  await change("32")
  await data.getByRole("cell", { name: "290", exact: true }).waitFor()
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [17, 29, 31, 32])
  assert.deepEqual(app.errors, [])
})

test("trusted node data renders values and headers literally with distinct placeholders", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [1, 4, 2, 2, 2, 2, 2].map((type, index) => ({ name: `<field ${index}>`, type })),
    rows: [[0, false, null, "", "Нет значения", "Пустая строка", "<img src=x>"]],
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  const table = app.page.getByRole("table", { name: "Данные узла" })
  assert.deepEqual(await table.getByRole("cell").allTextContents(), ["0", "false", "Нет значения", "Пустая строка", "Нет значения", "Пустая строка", "<img src=x>"])
  assert.deepEqual(await table.getByRole("emphasis").allTextContents(), ["Нет значения", "Пустая строка"])
  assert.equal(await table.getByRole("columnheader", { name: "<field 6>", exact: true }).count(), 1)
  assert.equal(await table.locator("img").count(), 0)
  assert.deepEqual(app.errors, [])
})

test("a failed newer publication reports its error while the previous dashboard still opens", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "text", type: 2 }], rows: [["x".repeat(10_001)]],
  } })
  const latest = { name: "20261115T120001Z.json", sourceHash: "c".repeat(64), status: "failed", error: "TS2322 <synthetic> " + "Synthetic compiler diagnostic ".repeat(250) }
  await app.page.route("**/dashboard/lookup", async route => route.fulfill({ json: {
    exists: true, key: "a".repeat(64), hash: "b".repeat(64), appOrigin: app.appOrigin,
    mode: "normal", cliButton: false,
    currentVersion: { name: "20261115T120000Z.json", sourceHash: "a".repeat(64) },
    latest,
  } }))
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  const header = app.page.locator("#dashboard-tab-overlay header")
  await header.getByText("Версия 20261115T120000Z", { exact: true }).waitFor({ timeout: 2_000 })
  assert.doesNotMatch(await header.textContent(), /20261115T120001Z/)
  assert.match(await app.page.locator("#dashboard-tab-overlay").textContent(), /Новая публикация.*20261115T120001Z.json.*не собрана/)
  assert.match(await app.page.locator("#dashboard-tab-overlay").textContent(), /Открыта предыдущая версия/)
  assert.match(await app.page.locator("#dashboard-tab-overlay").textContent(), /TS2322 <synthetic>/)
  assert.equal(await app.page.locator("synthetic").count(), 0)
  assert.equal(await app.page.locator('iframe[title="Dashboard"]').getAttribute("src"), `${app.appOrigin}/apps/${"a".repeat(64)}/${"b".repeat(64)}/`)
  const truncated = app.page.getByRole("status").filter({ hasText: "Некоторые значения укорочены" })
  await truncated.waitFor()
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  await truncated.waitFor()
  await app.page.getByRole("status").filter({ hasText: "Открыта предыдущая версия" }).waitFor()
  await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()

  latest.status = "building"
  delete latest.error
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await header.getByText("Версия 20261115T120000Z", { exact: true }).waitFor()
  assert.doesNotMatch(await app.page.locator("#dashboard-tab-overlay").textContent(), /20261115T120001Z/)
  assert.deepEqual(app.errors, [])
})

test("a first publication failure appears while the create link stays available", async t => {
  const app = await fixture(t)
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.waitFor()
  await app.page.route(`${app.origin}/dashboard/lookup`, route => route.fulfill({ json: {
    exists: false, key: "a".repeat(64), hash: null, appOrigin: app.appOrigin, mode: "normal", cliButton: false,
    currentVersion: null, latest: { name: "20261115T120000Z.json", status: "failed", error: "Compiler error before first build" },
  } }))
  await app.page.getByRole("status").filter({ hasText: "Compiler error before first build" }).waitFor({ timeout: 7_000 })
  assert.equal(await link.isVisible(), true)
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(app.snapshots.length, 1)
})

test("an unchanged failed publication preserves the selected diagnostic text", async t => {
  const app = await fixture(t, { published: true })
  const lookup = `${app.origin}/dashboard/lookup`
  await app.page.route(lookup, route => route.fulfill({ json: {
    exists: true, key: "a".repeat(64), hash: "b".repeat(64), appOrigin: app.appOrigin, mode: "normal", cliButton: false,
    currentVersion: { name: "20261115T120000Z.json" },
    latest: { name: "20261115T120001Z.json", status: "failed", error: "Compiler error in the update" },
  } }))
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  const diagnostic = app.page.getByRole("status").filter({ hasText: "Compiler error in the update" })
  const selected = await diagnostic.evaluate(element => {
    const selection = document.getSelection()
    selection.selectAllChildren(element)
    return selection.toString()
  })
  assert.match(selected, /Compiler error in the update/)
  const lookupResponse = () => app.page.waitForResponse(response => response.url() === lookup, { timeout: 7_000 })
  await lookupResponse()
  await lookupResponse()
  assert.equal(await app.page.evaluate(() => document.getSelection().toString()), selected)
})

test("an open dashboard follows ready publications and keeps its live header parameters", async t => {
  const app = await fixture(t)
  const key = "a".repeat(64)
  const hash = "c".repeat(64)
  const next = `${app.appOrigin}/apps/${key}/${hash}/`
  const lookup = `${app.origin}/dashboard/lookup`
  let response
  await app.page.route(lookup, route => response ? route.fulfill(response) : route.fallback())
  await app.page.route(`${next}**`, async route => {
    const asset = route.request().url().slice(next.length)
    await route.fulfill({ response: await route.fetch({ url: `${app.appOrigin}/apps/${key}/${"b".repeat(64)}/${asset}` }) })
  })

  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.waitFor()
  const overlay = await app.page.locator("#dashboard-tab-overlay").elementHandle()
  app.publish()
  await app.page.getByText("Версия 20261115T120000Z", { exact: true }).waitFor({ timeout: 7_000 })
  assert.deepEqual((await app.settled()).parameters, [{ name: "MinBudget", value: 0 }])
  assert.equal(await link.count(), 0)

  const input = app.page.getByLabel("MinBudget", { exact: true })
  await app.page.evaluate(() => { window.fixture.rows = [[99]] })
  await input.fill("17")
  await input.press("Enter")
  assert.deepEqual((await app.settled(1)).parameters, [{ name: "MinBudget", value: 17 }])
  const oldFrame = app.frame()
  const focusedInput = await input.elementHandle()
  await input.fill("29")

  response = { status: 503 }
  await app.page.waitForResponse(result => result.url() === lookup && result.status() === 503, { timeout: 7_000 })
  assert.equal(app.frame(), oldFrame)
  response = { json: {
    exists: true, key, hash, appOrigin: app.appOrigin, mode: "normal", cliButton: false,
    currentVersion: { name: "20261115T120001Z.json", sourceHash: hash }, latest: null,
  } }
  await app.page.locator(`iframe[src="${next}"]`).waitFor({ timeout: 7_000 })
  const state = await app.settled()
  assert.notEqual(app.frame(), oldFrame)
  assert.deepEqual(state.parameters, [{ name: "MinBudget", value: 17 }])
  assert.deepEqual(state.table.rows, [[99]])
  assert.equal(await overlay.evaluate(element => element.isConnected), true)
  assert.equal(await focusedInput.evaluate(element => document.activeElement === element && element.value === "29"), true)
  await app.page.getByText("Версия 20261115T120001Z", { exact: true }).waitFor()
  assert.equal(await app.page.evaluate(() => window.channels), 2)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.equal(app.snapshots.length, 1)
  assert.deepEqual(app.errors, [])
})

test("a first ready publication recalculates an inactive node and keeps Escape available", async t => {
  const app = await fixture(t)
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.focus()
  assert.equal(await link.evaluate(element => document.activeElement === element), true)
  await app.page.evaluate(() => {
    window.fixture.status = "inactive"
    window.fixture.wait = true
  })
  app.publish()
  await app.page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish, undefined, { timeout: 7_000 })
  await app.page.evaluate(() => {
    window.fixture.rows = [[99]]
    window.fixture.wait = false
    window.fixture.finish()
  })
  assert.deepEqual((await app.settled()).table.rows, [[99]])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.equal(app.snapshots.length, 1)
  await app.page.keyboard.press("Escape")
  await app.page.locator("#dashboard-tab-overlay").waitFor({ state: "detached" })
})

async function nextPublication(app, firstDocument) {
  const key = "a".repeat(64)
  const previous = `${app.appOrigin}/apps/${key}/${"b".repeat(64)}/`
  const hash = "c".repeat(64)
  const next = `${app.appOrigin}/apps/${key}/${hash}/`
  let published = false
  await app.page.route(`${app.origin}/dashboard/lookup`, route => published ? route.fulfill({ json: {
    exists: true, key, hash, appOrigin: app.appOrigin, mode: "normal", cliButton: false,
    currentVersion: { name: "20261115T120001Z.json" }, latest: null,
  } }) : route.fallback())
  await app.page.route(`${next}**`, async route => {
    const asset = route.request().url().slice(next.length)
    if (!asset && firstDocument) {
      const body = firstDocument
      firstDocument = undefined
      return route.fulfill({ contentType: "text/html", body })
    }
    await route.fulfill({ response: await route.fetch({ url: previous + asset }) })
  })
  return { previous, next, publish: () => { published = true }, revert: () => { published = false } }
}

test("a replacement without SDK ready leaves the old dashboard usable and retries", async t => {
  const app = await fixture(t, { published: true })
  await app.page.clock.install()
  const revision = await nextPublication(app, "<!doctype html><title>Silent replacement</title>")
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  const old = app.page.locator(`iframe[src="${revision.previous}"]`)
  const candidate = app.page.locator(`iframe[src="${revision.next}"]`)
  const oldFrame = app.frame()
  revision.publish()
  await candidate.waitFor({ state: "attached", timeout: 7_000 })
  assert.equal(await candidate.isVisible(), false)
  assert.equal(await old.isVisible(), true)
  assert.equal(await app.page.getByText("Версия 20261115T120000Z", { exact: true }).isVisible(), true)

  const input = app.page.getByLabel("MinBudget", { exact: true })
  await input.fill("17")
  await input.press("Enter")
  await oldFrame.waitForFunction(() => window.states?.at(-1).parameters[0].value === 17)

  await app.page.clock.runFor(10_000)
  await candidate.waitFor({ state: "detached" })
  assert.equal(await old.isVisible(), true)
  await candidate.waitFor({ timeout: 7_000 })
  await old.waitFor({ state: "detached" })
  assert.deepEqual((await app.settled()).parameters, [{ name: "MinBudget", value: 17 }])
  await app.page.getByText("Версия 20261115T120001Z", { exact: true }).waitFor()
  assert.deepEqual(app.errors, [])
})

test("Escape works immediately after replacing a focused dashboard", async t => {
  const app = await fixture(t, { published: true })
  const revision = await nextPublication(app)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.frame().locator("body").evaluate(body => {
    body.tabIndex = 0
    body.focus()
  })
  const old = app.page.locator(`iframe[src="${revision.previous}"]`)
  assert.equal(await old.evaluate(frame => document.activeElement === frame), true)
  revision.publish()
  await app.page.locator(`iframe[src="${revision.next}"]`).waitFor({ timeout: 7_000 })
  await old.waitFor({ state: "detached" })
  await app.settled()
  await app.page.keyboard.press("Escape")
  await app.page.locator("#dashboard-tab-overlay").waitFor({ state: "detached" })
})

test("dashboard tables retain at most ten thousand rows and report the full count", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "count", type: 1 }], rows: Array.from({ length: 10_001 }, (_, index) => [index]),
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const { table } = await app.settled()
  assert.equal(table.rows.length, 10_000)
  assert.equal(table.totalRows, 10_001)
  assert.equal(table.truncated, true)
  assert.deepEqual(table.rows.at(-1), [9999])
  await app.page.getByRole("status").filter({ hasText: "Строк получено 10000 из 10001" }).waitFor()
})

test("dashboard tables crop long string cells and mark the result as truncated", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "text", type: 2 }], rows: [["x".repeat(10_000) + "y"]],
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const { table } = await app.settled()
  assert.equal(table.rows[0][0].length, 10_000)
  assert.equal(table.rows[0][0].at(-1), "x")
  assert.equal(table.totalRows, 1)
  assert.equal(table.truncated, true)
  await app.page.getByRole("status").filter({ hasText: "Некоторые значения укорочены" }).waitFor({ timeout: 2_000 })
  assert.equal(await app.page.locator('iframe[title="Dashboard"]').isVisible(), true)
  const created = app.page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots"))
  await app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click()
  await created
  assert.equal(app.snapshots[0].sample.rows[0][0].length, 10_001)
  assert.equal(app.snapshots[0].sample.rows[0][0].at(-1), "y")
})

test("exactly bounded strings do not produce a truncation warning", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "text", type: 2 }], rows: [["short"], ["x".repeat(5_000)], ["y".repeat(10_000)]],
  } })
  app.page.setDefaultTimeout(30_000)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const { table } = await app.settled()
  assert.equal(table.rows.length, 3)
  assert.equal(table.truncated, false)
  assert.deepEqual(table.rows.map(row => row[0].length), [5, 5_000, 10_000])
  assert.equal(await app.page.getByRole("status").filter({ hasText: "Некоторые значения укорочены" }).count(), 0)
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  assert.equal(await app.page.getByRole("table", { name: "Данные узла" }).getByRole("row").count(), 4)
  assert.equal(await app.page.getByRole("status").filter({ hasText: "Некоторые значения укорочены" }).count(), 0)
})

test("the graph keeps its truncation warning during calculation", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "text", type: 2 }], rows: [["x".repeat(10_001)]],
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  const warning = app.page.getByRole("status").filter({ hasText: "Некоторые значения укорочены" })
  await warning.waitFor()

  await app.page.evaluate(() => { window.fixture.wait = true })
  const input = app.page.getByLabel("MinBudget", { exact: true })
  await input.fill("17")
  await input.press("Enter")
  await app.page.waitForFunction(() => window.fixture.finish)
  await app.frame().waitForFunction(() => window.states.at(-1).busy)
  assert.equal(await warning.isVisible(), true)

  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  assert.equal(await app.page.getByRole("table", { name: "Данные узла" }).isVisible(), false)
  assert.equal(await warning.isVisible(), false)
  await app.page.getByRole("button", { name: "К dashboard", exact: true }).click()
  await warning.waitFor()

  await app.page.evaluate(() => {
    window.fixture.rows = [["updated"]]
    window.fixture.finish()
  })
  assert.deepEqual((await app.settled(1)).table.rows, [["updated"]])
  assert.equal(await warning.isVisible(), false)
})

test("dashboard tables fit the serialized row budget without splitting a row", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "text", type: 2 }], rows: Array.from({ length: 600 }, () => ["x".repeat(10_000)]),
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const { table } = await app.settled()
  assert.ok(table.rows.length > 0 && table.rows.length < 600)
  const size = table.rows.reduce((size, row) => size + JSON.stringify(row).length, 0)
  assert.ok(size <= 5_000_000)
  assert.ok(size + JSON.stringify(table.rows[0]).length > 5_000_000)
  assert.equal(table.totalRows, 600)
  assert.equal(table.truncated, true)
})

test("trusted node data distinguishes a result with zero received rows from an empty result", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: Array.from({ length: 500 }, (_, index) => ({ name: `field ${index}`, type: 2 })),
    rows: [Array(500).fill("x".repeat(10_000))],
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.equal((await app.settled()).table.rows.length, 0)
  await app.page.getByRole("button", { name: "Данные узла", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Строк получено 0 из 1" }).waitFor()
  assert.equal(await app.page.getByRole("status").filter({ hasText: "Нет строк" }).count(), 0)
})

test("the shell opens an isolated app and delivers the first SDK state", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const frame = app.page.locator('iframe[title="Dashboard"]')
  await frame.waitFor()
  assert.equal(await frame.getAttribute("sandbox"), "allow-scripts")
  assert.equal(await frame.getAttribute("referrerpolicy"), "no-referrer")
  assert.equal(await frame.getAttribute("allow"),
    "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; " +
    "display-capture 'none'; fullscreen 'none'; payment 'none'; publickey-credentials-get 'none'; " +
    "identity-credentials-get 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'")
  assert.equal(await frame.getAttribute("src"), `${app.appOrigin}/apps/${"a".repeat(64)}/${"b".repeat(64)}/`)
  const state = await app.settled()
  assert.deepEqual(state, {
    parameters: [{ name: "MinBudget", value: 0 }],
    table: { schema: [{ name: "count", type: 1 }], rows: [[42]], truncated: false, totalRows: 1 },
    error: null, busy: false,
  })
  assert.deepEqual(await app.frame().evaluate(() => window.late()), state)
  assert.deepEqual(app.errors, [])
})

test("numeric fields in the trusted header send queued busy and completed states", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const initial = await app.settled()
  const input = app.page.getByLabel("MinBudget", { exact: true })
  await input.waitFor()
  assert.doesNotMatch(await app.page.locator("#dashboard-tab-overlay header").textContent(), /user\/fixture\/campaign\.lgp/)
  await app.page.evaluate(() => { window.fixture.wait = true })
  await input.fill("10")
  await input.press("Enter")
  await app.page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish)
  assert.equal(await input.isEnabled(), true)
  await app.frame().waitForFunction(() => window.states?.at(-1).busy === true)
  const waiting = await app.states()
  assert.equal(waiting.at(-1).busy, true)
  assert.deepEqual(waiting.at(-1).table, initial.table)
  await app.page.evaluate(() => { window.fixture.wait = false; window.fixture.finish() })
  assert.equal((await app.settled(1)).parameters[0].value, 10)
  const count = (await app.states()).length
  await input.fill("-10")
  await input.blur()
  assert.equal((await app.settled(count)).parameters[0].value, -10)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [10, -10])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(app.errors, [])
})

test("the trusted header renders node and parameter names as text", async t => {
  const payload = "<img src=x onerror=alert(1)>"
  const app = await fixture(t, { published: true, variables: [{ name: payload, type: 3, value: 1 }] })
  await app.page.evaluate(payload => {
    const form = window.Ext.ComponentQuery.query("panel#pnlModelForm")[0].Controller
    form.GetOneSelectedNode(false).GetData().get_DisplayName = async () => payload
  }, payload)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  assert.equal(await app.page.locator("header strong").textContent(), payload)
  assert.equal(await app.page.locator("header strong + span").textContent(), "Версия 20261115T120000Z")
  assert.equal(await app.page.getByLabel(payload, { exact: true }).count(), 1)
  assert.equal(await app.page.locator("header img").count(), 0)
  assert.deepEqual(app.dialogs, [])
  assert.deepEqual(app.errors, [])
})

test("a dashboard without ready times out and remains selectable after a successful replacement", async t => {
  const app = await fixture(t, { published: true })
  const revision = await nextPublication(app)
  await app.page.route(revision.previous, route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Silent initial dashboard</title>",
  }), { times: 1 })
  await app.page.clock.install()
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.locator('iframe[title="Dashboard"]').waitFor()
  await app.page.clock.runFor(10_000)
  await app.page.getByRole("status").filter({ hasText: "Dashboard не ответил" }).waitFor({ timeout: 12_000 })
  const lookup = () => app.page.waitForResponse(response => response.url() === `${app.origin}/dashboard/lookup`)
  await lookup()
  await lookup()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.channels), 0)
  assert.equal(await app.page.getByRole("link", { name: "Открыть Studio по HTTPS", exact: true }).count(), 0)

  revision.publish()
  await app.page.locator(`iframe[src="${revision.next}"]`).waitFor({ timeout: 7_000 })
  await app.settled()
  revision.revert()
  await app.page.locator(`iframe[src="${revision.previous}"]`).waitFor({ timeout: 7_000 })
  await app.settled()
  await app.page.getByText("Версия 20261115T120000Z", { exact: true }).waitFor()
  assert.deepEqual(app.errors, [])
})

test("silent dashboard links to the actual Studio HTTPS port", async t => {
  const app = await fixture(t, { published: true, app: "silent", studioHttpsPort: "18443" })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Dashboard не ответил" }).waitFor({ timeout: 12_000 })
  const link = app.page.getByRole("link", { name: "Открыть Studio по HTTPS", exact: true })
  assert.equal(await link.getAttribute("href"), `https://${new URL(app.origin).hostname}:18443/app/`)
  assert.equal(await app.page.locator("iframe").count(), 0)
  await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()
  assert.equal(await app.page.locator("#dashboard-tab-overlay").count(), 0)
  assert.deepEqual(app.errors, [])
})

test("window and port floods share one limit and cannot submit parameters", async t => {
  const app = await fixture(t, { published: true })
  await app.page.context().addInitScript(() => {
    addEventListener("message", event => {
      if (event.source === parent && event.data?.type === "loginom-dashboard/init") window.testPort = event.ports[0]
    })
  })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.frame().evaluate(() => {
    for (let index = 0; index < 25; index++) parent.postMessage({ type: "ignored" }, "*")
    for (let index = 0; index < 30; index++) window.testPort.postMessage({ type: "state", parameters: [{ name: "MinBudget", value: 999 }] })
  })
  await app.page.locator("#dashboard-tab-overlay").waitFor({ state: "detached" })
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  assert.deepEqual(app.errors, [])
})

test("editing in Desktop captures a fresh snapshot after accepted parameter changes", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  assert.equal(app.snapshots.length, 0)
  await app.page.evaluate(() => { window.fixture.rows = [[99]] })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await app.settled(1)
  const [response, popup] = await Promise.all([
    app.page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots")),
    app.page.waitForEvent("popup", { timeout: 2_000 }),
    app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click(),
  ])
  await popup.waitForLoadState("domcontentloaded")
  const calls = await app.page.evaluate(() => window.desktopOpens)
  const id = (await response.json()).id
  assert.equal(new URL(calls.at(-1).url).searchParams.get("id"), id)
  assert.equal(new URL(calls.at(-1).url).searchParams.get("action"), "edit")
  assert.equal(app.snapshots.length, 1)
  assert.equal(app.snapshots[0].published, true)
  assert.deepEqual(app.snapshots.at(-1).parameters, [{ name: "MinBudget", value: 17 }])
  assert.deepEqual(app.snapshots.at(-1).sample, { schema: [{ name: "count", type: 1 }], rows: [[99]] })
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.equal(await popup.evaluate(() => window.opener), null)
  const again = app.page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots"))
  await app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click()
  assert.notEqual((await (await again).json()).id, id)
  assert.equal(app.snapshots.length, 2)
  assert.deepEqual(app.errors, [])
})

test("editing after a long calculation keeps a clickable Desktop link", async t => {
  const app = await fixture(t, { published: true, popupBlocking: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => { window.fixture.wait = true })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await app.page.waitForFunction(() => window.fixture.finish)
  await app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click()
  await app.page.waitForFunction(() => !navigator.userActivation.isActive, undefined, { timeout: 7_000 })
  assert.equal(app.snapshots.length, 0)
  const refreshed = app.page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots"))
  // Playwright evaluate grants a new user gesture; finish the RPC without changing activation.
  const cdp = await app.page.context().newCDPSession(app.page)
  const resumed = await cdp.send("Runtime.evaluate", {
    expression: `window.fixture.wait = false; window.fixture.finish(); new Promise(resolve => {
      const deadline = setTimeout(() => { clearInterval(poll); resolve(false) }, 5000)
      const poll = setInterval(() => {
        const link = document.querySelector("#dashboard-tab-overlay a")
        if (!link && !window.desktopOpens.length) return
        clearTimeout(deadline); clearInterval(poll); resolve(Boolean(link))
      }, 10)
    })`,
    userGesture: false, awaitPromise: true, returnByValue: true,
  })
  await cdp.detach()
  assert.equal(resumed.result.value, true)
  const freshID = (await (await refreshed).json()).id
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.waitFor()
  assert.equal(new URL(await link.getAttribute("href")).searchParams.get("id"), freshID)
  assert.deepEqual(app.snapshots.at(-1).parameters, [{ name: "MinBudget", value: 17 }])
  await link.evaluate((element, href) => { element.href = href }, app.origin + "/desktop-link")
  const [popup] = await Promise.all([app.page.waitForEvent("popup"), link.click()])
  await popup.waitForLoadState("domcontentloaded")
  assert.equal(await popup.evaluate(() => window.opener), null)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(app.errors, [])
})

test("Desktop chat opens separately and preserves the ordinary unload guard", async (t) => {
  const { page, errors, dialogs, origin, publish } = await fixture(t)
  assert.deepEqual(errors, [])
  await page.getByRole("button", { name: "Создать dashboard" }).click()
  const link = page.getByRole("link", { name: "Открыть чат в Desktop" })
  await link.waitFor()
  const back = page.getByRole("button", { name: "Вернуться к сценарию", exact: true })
  assert.equal(await back.evaluate((element) => getComputedStyle(element).cursor), "pointer")
  const desktop = new URL(await link.getAttribute("href"))
  assert.equal(desktop.protocol, "loginom-ai-agent:")
  assert.equal(desktop.hostname, "dashboard")
  assert.equal(desktop.searchParams.get("action"), "create")
  assert.equal(await page.evaluate(() => window.blockedDesktopLinks), 1)
  await link.evaluate((element, href) => {
    element.href = href
  }, origin + "/desktop-link")
  const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 2_000 }), link.click()])
  await popup.waitForLoadState("domcontentloaded")
  assert.equal(popup.url(), origin + "/desktop-link")
  assert.equal(await popup.evaluate(() => window.opener), null)
  assert.equal(page.url(), origin + "/app/")
  assert.deepEqual(dialogs, [])
  await popup.close()
  const [dialog] = await Promise.all([
    page.waitForEvent("dialog"),
    page.getByRole("link", { name: "Ordinary link" }).click(),
  ])
  assert.equal(dialog.type(), "beforeunload")
  assert.equal(page.url(), origin + "/app/")
  await back.click()
  publish()
  await page.getByRole("button", { name: /^(Создать dashboard|Dashboard)$/ }).click()
  const edit = page.getByText("Изменить в чате", { exact: true })
  await edit.waitFor()
  assert.equal(await edit.evaluate((element) => element.tagName), "BUTTON")
  assert.equal(await edit.getAttribute("type"), "button")
  assert.equal(await edit.evaluate((element) => getComputedStyle(element).cursor), "pointer")
  assert.ok((await edit.evaluate((element) => getComputedStyle(element).textDecorationLine)).includes("underline"))
  const layout = await back.evaluate((button) => {
    const header = button.parentElement
    const reference = button.cloneNode(true)
    reference.removeAttribute("style")
    header.append(reference)
    const originalButtonHeight = reference.getBoundingClientRect().height
    reference.remove()
    const bounds = header.getBoundingClientRect()
    return {
      originalButtonHeight,
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
      buttons: [...header.querySelectorAll("button")].map((element) => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, height: rect.height }
      }),
    }
  })
  // The previous header had an unstyled native button and 8px padding above and below.
  assert.ok(layout.height <= layout.originalButtonHeight + 16, JSON.stringify(layout))
  assert.equal(layout.buttons.length, 3)
  assert.ok(
    layout.buttons.every((button) => button.height > layout.originalButtonHeight),
    JSON.stringify(layout),
  )
  assert.ok(layout.buttons.every((button) => button.top >= layout.top && button.bottom <= layout.bottom))
  dialogs.length = 0
  const [editPopup] = await Promise.all([page.waitForEvent("popup", { timeout: 2_000 }), edit.click()])
  await editPopup.waitForLoadState("domcontentloaded")
  assert.equal(editPopup.url(), origin + "/desktop-link")
  assert.equal(await editPopup.evaluate(() => window.opener), null)
  const calls = await page.evaluate(() => window.desktopOpens)
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).searchParams.get("action"), "edit")
  assert.equal(calls[0].target, "_blank")
  assert.equal(calls[0].features, "noopener")
  assert.equal(page.url(), origin + "/app/")
  assert.deepEqual(dialogs, [])
})

test("opening a published dashboard executes an inactive node before loading its iframe", async (t) => {
  const app = await fixture(t, { published: true, status: "inactive" })
  await app.page.evaluate(() => { window.fixture.wait = true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  await app.page.evaluate(() => window.fixture.finish())
  const state = await app.settled()
  assert.deepEqual(state.table, { schema: [{ name: "count", type: 1 }], rows: [[42]], truncated: false, totalRows: 1 })
  assert.equal(state.error, null)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(app.errors, [])
})

test("reopening retries a saved error even when the node remains active", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  await app.page.evaluate(() => { window.fixture.executeError = { message: "Ошибка расчёта в Studio" } })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("5")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  const failed = await app.settled(1)
  assert.equal(failed.error, "Ошибка расчёта в Studio")
  assert.equal(failed.table, null)
  await app.page.evaluate(() => { window.fixture.status = "active" })
  assert.equal(await app.page.evaluate(() => window.fixture.status), "active")
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => { window.fixture.executeError = Error("Still failing") })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Still failing" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => { window.fixture.executeError = null })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const recovered = await app.settled()
  assert.equal(recovered.error, null)
  assert.deepEqual(recovered.table.rows, [[42]])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 3)
  assert.deepEqual(app.errors, [])
})

test("active and empty results reopen without another execution", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.deepEqual((await app.settled()).table.rows, [[42]])
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => { window.fixture.rows = [] })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.deepEqual((await app.settled()).table.rows, [])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  assert.deepEqual(app.errors, [])
})

test("closing during a parameter calculation and reopening waits without a duplicate execution", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => { window.fixture.wait = true })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await app.page.waitForFunction(() => window.fixture.finish)
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  await app.page.evaluate(() => window.fixture.finish())
  const state = await app.settled()
  assert.equal(state.parameters[0].value, 17)
  assert.deepEqual(state.table.rows, [[42]])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(app.errors, [])
})

test("an initial calculation error stays visible until a successful reopening", async (t) => {
  const app = await fixture(t, { published: true, status: "inactive" })
  await app.page.evaluate(() => {
    window.fixture.executeError = Error("Source unavailable")
  })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Source unavailable" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => {
    window.fixture.executeError = null
  })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.equal((await app.settled()).error, null)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(app.errors, [])
})

test("creation still calculates its sample and unsupported outputs never execute", async (t) => {
  const { page, errors, snapshots } = await fixture(t, { status: "inactive" })
  await page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await page.getByRole("link", { name: "Открыть чат в Desktop" }).waitFor()
  assert.deepEqual(snapshots[0].sample, { schema: [{ name: "count", type: 1 }], rows: [[42]] })
  assert.deepEqual(snapshots[0].parameters, [{ name: "MinBudget", value: 0 }])
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.evaluate(() => {
    window.fixture.subtype = 2
    window.fixture.status = "inactive"
  })
  await page.getByRole("button", { name: /^(Создать dashboard|Dashboard)$/ }).click()
  await page.getByRole("status").filter({ hasText: "Dashboard для этого узла недоступен" }).waitFor()
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  assert.equal(snapshots.length, 1)
  assert.deepEqual(errors, [])
})

test("queued parameter submissions finish in order after the iframe closes", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => { window.fixture.wait = true; window.fixture.writes = [] })
  const input = app.page.getByLabel("MinBudget", { exact: true })
  await input.fill("17")
  await input.press("Enter")
  await app.page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish)
  await input.fill("29")
  await input.press("Enter")
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [17])
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  assert.equal(await app.page.locator("iframe").count(), 0)
  await app.page.evaluate(() => {
    const finish = window.fixture.finish
    delete window.fixture.finish
    finish()
  })
  await app.page.waitForFunction(() => window.fixture.calls === 2 && window.fixture.finish)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [17, 29])
  await app.page.evaluate(() => window.fixture.finish())
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.equal((await app.settled()).parameters[0].value, 29)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(app.errors, [])
})

for (const missingAPI of ["EndOperationEx", "GetOutputPorts", "GetData"]) {
  test(`missing ${missingAPI} preserves native actions without a dashboard button`, async (t) => {
    const { page, errors } = await fixture(t, { missingAPI, lateForm: true })
    await page.evaluate(() => window.fixture.showScenario())
    await page.getByRole("button", { name: "Native action" }).click()
    assert.equal(await page.evaluate(() => window.fixture.native), true)
    assert.deepEqual(errors, [])
    assert.equal(await page.getByRole("button", { name: /^(Dashboard|Создать dashboard)$/ }).count(), 0)
    assert.equal(await page.locator("#dashboard-tab-overlay").count(), 0)
  })
}

test("Escape closes the bundled dashboard and leaves Studio usable", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.frame().press("body", "Escape")
  await app.page.locator("#dashboard-tab-overlay").waitFor({ state: "detached" })
  await app.page.getByRole("button", { name: "Native action" }).click()
  assert.equal(await app.page.evaluate(() => window.fixture.native), true)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.getByLabel("MinBudget", { exact: true }).press("Escape")
  assert.equal(await app.page.locator("#dashboard-tab-overlay").count(), 0)
  assert.deepEqual(app.errors, [])
})

test("invalid lookup fields leave an error instead of loading a published iframe", async (t) => {
  const { page, errors } = await fixture(t, { published: true, malformed: "lookup" })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Некорректный ответ службы dashboard (lookup)" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.deepEqual(errors, [])
})

test("invalid snapshot fields leave an error instead of opening Desktop or an iframe", async (t) => {
  const { page, errors } = await fixture(t, { malformed: "snapshot" })
  await page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Некорректный ответ службы dashboard (snapshot)" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.equal(await page.getByRole("link", { name: "Открыть чат в Desktop" }).count(), 0)
  assert.deepEqual(errors, [])
})

test("missing required Studio enum member preserves native actions without dashboard UI", async (t) => {
  const { page, errors } = await fixture(t, { published: true, missingAPI: "dtInteger" })
  await page.getByRole("button", { name: "Native action" }).click()
  assert.equal(await page.evaluate(() => window.fixture.native), true)
  assert.equal(await page.getByRole("button", { name: /^(Dashboard|Создать dashboard)$/ }).count(), 0)
  assert.equal(await page.locator("#dashboard-tab-overlay, iframe").count(), 0)
  assert.deepEqual(errors, [])
})

test("missing required Studio interface identifier preserves native actions without dashboard UI", async (t) => {
  const { page, errors } = await fixture(t, { published: true, missingAPI: "IBGModelOutputSocket" })
  await page.getByRole("button", { name: "Native action" }).click()
  assert.equal(await page.evaluate(() => window.fixture.native), true)
  assert.equal(await page.getByRole("button", { name: /^(Dashboard|Создать dashboard)$/ }).count(), 0)
  assert.equal(await page.locator("#dashboard-tab-overlay, iframe").count(), 0)
  assert.deepEqual(errors, [])
})

test("Studio loads the shell before login and renders the workflow after login", async (t) => {
  const { page } = await fixture(t, { lateForm: true })
  await page.evaluate(() => window.fixture.showScenario())
  await page.getByRole("button", { name: "Создать dashboard" }).waitFor()
})

test("a workflow tree without a generic form node preserves the ROI binding", async (t) => {
  const { page, snapshots } = await fixture(t, { published: true })
  await page.evaluate(() => {
    const form = window.Ext.ComponentQuery.query("panel#pnlModelForm")[0].Controller
    delete form.FGenericNode
    const tab = window.bg.app.Application.Instance.FMainForm.GetActiveTab()
    const modelUnit = { get_Guid: async () => "{27CB94A9-F6E9-35FF-80B7-BC7D01BA6AA7}" }
    tab.FNode = { data: {}, parentNode: { data: { node: { ModelUnitItem: modelUnit } } } }
    form.GetOneSelectedNode(false).GetData().get_Guid = async () => "{77C145B1-6CE3-458F-AA36-E6AFDAB2A930}"
    window.bg.ScopeFindObject = () => ({ FileName: "user/dashboard-roi/campaign.lgp" })
  })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  const created = page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots"))
  await page.getByRole("button", { name: "Изменить в чате", exact: true }).click()
  await created
  assert.deepEqual(snapshots[0].binding, {
    packagePath: "/user/dashboard-roi/campaign.lgp",
    workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
    nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
  })
})

test("creation sends a strict snapshot and links Desktop to its returned ID", async t => {
  const app = await fixture(t)
  const created = app.page.waitForRequest(request => request.url() === app.origin + "/dashboard/snapshots")
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.waitFor()
  assert.equal(await (await created).headerValue("origin"), app.origin)
  assert.deepEqual(app.snapshots, [{
    binding: { packagePath: "/user/fixture/campaign.lgp", workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7", nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930" },
    nodeName: "Fixture node", sample: { schema: [{ name: "count", type: 1 }], rows: [[42]] },
    parameters: [{ name: "MinBudget", value: 0 }], published: false,
  }])
  const url = new URL(await link.getAttribute("href"))
  assert.equal(url.searchParams.get("id"), "00000000-0000-4000-8000-000000000001")
  assert.equal(url.searchParams.get("action"), "create")
  assert.deepEqual(app.errors, [])
})

test("Desktop samples retain the first hundred original rows", async t => {
  const app = await fixture(t, { table: {
    schema: [{ name: "text", type: 2 }], rows: Array.from({ length: 150 }, (_, i) => [String(i) + "ю".repeat(1_000)]),
  } })
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true }).waitFor()
  assert.equal(app.snapshots[0].sample.rows.length, 100)
  assert.equal(app.snapshots[0].sample.rows[99][0], "99" + "ю".repeat(1_000))
})

test("Desktop samples keep whole original rows within the service UTF-8 budget", async t => {
  const text = "ю".repeat(6_000)
  const app = await fixture(t, { table: {
    schema: [{ name: "text", type: 2 }], rows: Array.from({ length: 100 }, () => [text]),
  } })
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true }).waitFor()
  const sample = app.snapshots[0].sample
  assert.ok(Buffer.byteLength(JSON.stringify(sample)) <= 524_288)
  assert.ok(sample.rows.length > 0 && sample.rows.length < 100)
  assert.ok(sample.rows.every(row => row[0] === text))
  const server = dashboardServer({ shell: new Uint8Array(), buildsRoot: process.env.TMPDIR, appOrigin: app.appOrigin, mode: "normal", clientOrigins: [app.origin] })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => new Promise(resolve => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/dashboard/snapshots`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(app.snapshots[0]),
  })
  assert.equal(response.status, 201)
})

test("creation explains a failed node without creating a snapshot", async t => {
  const app = await fixture(t, { status: "inactive" })
  await app.page.evaluate(() => { window.fixture.executeError = Error("Source unavailable") })
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  const note = app.page.getByRole("status")
  await note.filter({ hasText: "Source unavailable" }).waitFor()
  assert.equal(await note.textContent(), "Узел завершился с ошибкой: Source unavailable. Исправьте сценарий и нажмите ещё раз")
  assert.equal(app.snapshots.length, 0)
  assert.equal(await app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true }).count(), 0)
  assert.deepEqual(app.errors, [])
})

test("editing refuses a snapshot after a failed parameter calculation", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => { window.fixture.executeError = Error("Calculation failed") })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  assert.equal((await app.settled(1)).error, "Calculation failed")
  await app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click()
  const note = app.page.getByRole("status")
  await note.filter({ hasText: "Узел завершился с ошибкой: Calculation failed" }).waitFor()
  assert.equal(await note.textContent(), "Узел завершился с ошибкой: Calculation failed. Исправьте сценарий и нажмите ещё раз")
  assert.equal(app.snapshots.length, 0)
  assert.deepEqual(await app.page.evaluate(() => window.desktopOpens), [])
  assert.deepEqual(app.errors, [])
})

test("an oversized schema is refused before snapshot creation", async t => {
  const app = await fixture(t, { table: { schema: [{ name: "ю".repeat(270_000), type: 2 }], rows: [] } })
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Схема данных превышает допустимый размер образца" }).waitFor()
  assert.equal(app.snapshots.length, 0)
  assert.deepEqual(app.errors, [])
})

test("the optional CLI button copies a separate snapshot in both Studio flows", async t => {
  for (const published of [false, true]) await t.test(published ? "published" : "create", async t => {
    const app = await fixture(t, { published, cliButton: true })
    await app.page.getByRole("button", { name: published ? "Dashboard" : "Создать dashboard", exact: true }).click()
    if (published) await app.settled()
    if (!published) await app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true }).waitFor()
    const before = app.snapshots.length
    const cli = app.page.getByRole("button", { name: "Скопировать команду для CLI", exact: true })
    await cli.waitFor()
    const created = app.page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots"))
    await cli.click()
    const id = (await (await created).json()).id
    await app.page.getByRole("status").filter({ hasText: "Команда скопирована" }).waitFor()
    assert.equal(app.snapshots.length, before + 1)
    assert.equal(app.snapshots.at(-1).published, published)
    assert.equal(await app.page.evaluate(() => navigator.clipboard.readText()), `loginom-ai-agent-cli run --dashboard ${id} "<опишите задачу>"`)
    assert.deepEqual(app.errors, [])
  })
})

test("the CLI button is absent when disabled by the stand", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  assert.equal(await app.page.getByRole("button", { name: "Скопировать команду для CLI", exact: true }).count(), 0)
})

for (const clipboard of ["unavailable", "denied"]) test(`the CLI command is selectable when the clipboard is ${clipboard}`, async t => {
  const app = await fixture(t, { cliButton: true, clipboardWrite: false })
  if (clipboard === "unavailable") await app.page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined }))
  const before = await app.page.evaluate(() => navigator.clipboard?.readText())
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.waitFor()
  const href = await link.getAttribute("href")
  const created = app.page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots"))
  await app.page.getByRole("button", { name: "Скопировать команду для CLI", exact: true }).click()
  const id = (await (await created).json()).id
  const command = `loginom-ai-agent-cli run --dashboard ${id} "<опишите задачу>"`
  const note = app.page.getByRole("status").filter({ hasText: command })
  await note.waitFor()
  assert.equal(await note.textContent(), command)
  assert.equal(await note.evaluate(element => getComputedStyle(element).userSelect), "text")
  assert.equal(await app.page.evaluate(() => navigator.clipboard?.readText()), before)
  assert.equal(app.snapshots.length, 2)
  assert.equal(await link.isVisible(), true)
  assert.equal(await link.getAttribute("href"), href)
  assert.deepEqual(app.errors, [])
})

test("a delayed create keeps the CLI result and its own Desktop link", async t => {
  const app = await fixture(t, { cliButton: true })
  const release = Promise.withResolvers()
  let requests = 0
  await app.page.route(app.origin + "/dashboard/snapshots", async route => {
    if (++requests === 1) {
      await release.promise
    }
    await route.fallback()
  })
  try {
    await Promise.all([
      app.page.waitForRequest(request => request.url() === app.origin + "/dashboard/snapshots"),
      app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click(),
    ])
    await app.page.getByRole("button", { name: "Скопировать команду для CLI", exact: true }).click()
    const status = app.page.getByRole("status").filter({ hasText: "Команда скопирована" })
    await status.waitFor()
    const command = await app.page.evaluate(() => navigator.clipboard.readText())
    release.resolve()
    const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
    await link.waitFor()
    assert.equal(await status.isVisible(), true)
    assert.equal(app.snapshots.length, 2)
    assert.notEqual(new URL(await link.getAttribute("href")).searchParams.get("id"), command.split(" ")[3])
    assert.deepEqual(app.errors, [])
  } finally {
    release.resolve()
  }
})

test("editing captures the current name after the Studio node is renamed", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => {
    const form = window.Ext.ComponentQuery.query("panel#pnlModelForm")[0].Controller
    form.GetOneSelectedNode(false).GetData().get_DisplayName = async () => "Changed in Studio"
  })
  const captured = app.page.waitForResponse(response => response.url().endsWith("/dashboard/snapshots"))
  await app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click()
  await captured
  assert.equal(app.snapshots[0].nodeName, "Changed in Studio")
  assert.deepEqual(app.errors, [])
})

test("a wide sample retains the exact whole-row prefix", async t => {
  const text = "ю".repeat(100_000) + "\"\\\n😀"
  const app = await fixture(t, { table: {
    schema: [{ name: "Поле\"😀", type: 2 }], rows: Array.from({ length: 100 }, () => [text]),
  } })
  const started = performance.now()
  await app.page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true }).waitFor()
  const sample = app.snapshots[0].sample
  assert.equal(sample.rows.length, 2)
  assert.equal(sample.rows[0][0], text)
  assert.equal(sample.rows[1][0], text)
  assert.ok(Buffer.byteLength(JSON.stringify(sample)) <= 524_288)
  assert.ok(Buffer.byteLength(JSON.stringify({ ...sample, rows: [...sample.rows, [text]] })) > 524_288)
  t.diagnostic(`Wide-row capture: ${Math.round(performance.now() - started)} ms`)
})
