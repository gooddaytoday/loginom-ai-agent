import assert from "node:assert/strict"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { fixture } from "./fixture.mjs"
import { buildDashboard } from "../../src/agent/build.ts"

const roi = "roi"
const channels = ["Поиск", "Соцсети", "Email", "Видео", "Партнёры"]
const table = {
  schema: ["channel", "total_budget", "total_revenue", "roi_pct", "campaigns"].map((name, index) => ({ name, type: index ? 3 : 2 })),
  rows: channels.map((name, index) => [name, 1000 * (index + 1), 3000 * (index + 1), 200, 100]),
}

async function screens(t, compiled, key) {
  const app = await fixture(t, { published: true, app: compiled, table })
  const initial = { type: "state", parameters: [{ name: "MinBudget", value: 7 }], table: { ...table, truncated: false, totalRows: 5 }, busy: true, error: null }
  // A real parent/port supplies contract states independently of Loginom calculation timing.
  await app.page.evaluate(initial => {
    function listen(event) {
      const frame = document.querySelector('iframe[title="Dashboard"]')
      if (event.source !== frame?.contentWindow || event.data?.type !== "loginom-dashboard/ready") return
      event.stopImmediatePropagation()
      removeEventListener("message", listen, true)
      const channel = new MessageChannel()
      window.examplePort = channel.port1
      frame.contentWindow.postMessage({ type: "loginom-dashboard/init", version: 1 }, "*", [channel.port2])
      channel.port1.postMessage(initial)
    }
    addEventListener("message", listen, true)
  }, initial)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.locator('iframe[title="Dashboard"]').waitFor()
  const frame = app.frame() ?? await app.page.waitForEvent("framenavigated", { predicate: frame => frame.url().startsWith(app.appOrigin + "/apps/") })
  await frame.getByText(/Идёт расчёт/).waitFor()
  await frame.getByRole("table").waitFor()
  assert.equal(await frame.getByText("Идёт расчёт…", { exact: true }).count(), 1)
  assert.equal(await frame.locator("tbody tr").count(), 5)
  await app.page.evaluate(state => window.examplePort.postMessage(state), { ...initial, busy: false, table: null })
  await frame.waitForFunction(() => !document.querySelector("table") && !document.querySelector("svg.recharts-surface"))
  await app.page.evaluate(state => window.examplePort.postMessage(state), {
    ...initial, busy: false, table: null, error: "Initial failure", parameters: [{ name: "MinBudget", value: 17 }],
  })
  await frame.getByRole("alert").filter({ hasText: "Initial failure" }).waitFor()
  await frame.getByText("Расчёт при пороге MinBudget = 17", { exact: false }).waitFor()
  await app.page.evaluate(state => window.examplePort.postMessage(state), { ...initial, busy: false, table: { ...initial.table, truncated: true, totalRows: 9 } })
  await frame.getByText("показана часть: 5 из 9", { exact: false }).waitFor()
  assert.equal(await frame.locator("tbody tr").count(), 5)

  const sample = {
    schema: ["extra", "campaigns", "roi_pct", "total_revenue", "channel", "total_budget"]
      .map((name, index) => ({ name, type: index === 0 || index === 4 ? 2 : 3 })),
    rows: [["x", 11, 50, 150, "A", 100], ["y", 26, 125, 450, "B", 200]],
    truncated: false, totalRows: 2,
  }
  const send = table => app.page.evaluate(state => window.examplePort.postMessage(state), { ...initial, busy: false, table })
  await send(sample)
  const totals = frame.getByRole("region", { name: /Итог/ })
  await totals.getByText("37", { exact: true }).waitFor()
  await send({ ...sample, schema: sample.schema.map(column => column.name === "campaigns" ? { ...column, name: "count" } : column) })
  const schemaError = frame.getByRole("alert")
  await schemaError.waitFor()
  assert.match(await schemaError.innerText(), /Структура данных изменилась\. Отсутствующие поля: campaigns\..*Изменить в чате/)
  assert.equal(await app.page.getByRole("button", { name: "Изменить в чате", exact: true }).isEnabled(), true)
  assert.equal(await frame.getByText("37", { exact: true }).count(), 0)
  assert.equal(await frame.getByRole("table").count(), 0)
  assert.equal(await frame.locator("svg.recharts-surface").count(), 0)

  await send({ ...sample, rows: [], totalRows: 0 })
  const empty = frame.getByText(/нет кампаний|кампании не найдены|нет каналов/i)
  await empty.waitFor()
  assert.equal(await schemaError.count(), 0)

  await send({ ...sample, rows: sample.rows.slice(0, 1), truncated: true })
  const partialTotals = frame.getByRole("region", { name: /Итог.*по полученным строкам/ })
  await partialTotals.waitFor({ timeout: 3000 })
  const metric = (value, label) => partialTotals.getByText(value, { exact: true }).locator("..").getByText(label)
  await metric("11", /кампани.*по полученным строкам/i).waitFor()
  if (key !== "channel-summary") {
    await metric("100", /бюджет по полученным строкам/i).waitFor()
    await metric("150", /выручка по полученным строкам/i).waitFor()
  }
  if (key === roi) {
    await metric(/50,00\s%/, /общий ROI по полученным строкам/i).waitFor()
  } else {
    const totalRow = frame.locator("tfoot").getByRole("row", { name: /Итого по полученным строкам/ })
    await totalRow.getByRole("cell", { name: "11", exact: true }).waitFor()
    if (key === "campaign-summary") {
      await totalRow.getByRole("cell", { name: /50,00\s%/ }).waitFor()
      const chart = frame.getByRole("region", { name: /Распределение бюджета.*по полученным строкам/ })
      const legend = chart.getByRole("list", { name: /доли по полученным строкам/ })
      assert.match(await legend.getByRole("listitem").innerText(), /100,00\s%\s+по полученным строкам/)
    }
  }

  await send({ ...sample, rows: [["x", 11, 50, 150, "Назв…", 100], sample.rows[1]], truncated: true })
  const cropped = frame.getByText("Содержимое некоторых ячеек сокращено", { exact: true })
  await cropped.waitFor()
  await partialTotals.getByText("37", { exact: true }).waitFor()
  assert.equal(await frame.getByText("показана часть: 2 из 2", { exact: true }).count(), 0)

  await send({ ...sample, rows: [], truncated: true })
  const unavailable = frame.getByText("Итоги недоступны", { exact: true })
  await unavailable.waitFor()
  await frame.getByText("показана часть: 0 из 2", { exact: true }).waitFor()
  assert.equal(await empty.count(), 0)
  assert.equal(await totals.count(), 0)
  assert.equal(await frame.locator("tfoot").count(), 0)

  await send(sample)
  await totals.getByText("37", { exact: true }).waitFor()
  assert.equal(await partialTotals.count(), 0)
  assert.equal(await unavailable.count(), 0)

  await send({ ...sample, rows: [["x", "не число", 50, 150, "A", 100], sample.rows[1]] })
  if (key === roi) {
    await totals.getByText("—", { exact: true }).waitFor()
    assert.equal(await schemaError.count(), 0)
  } else {
    await schemaError.filter({ hasText: /неотрицательное целое число|неотрицательный целый счётчик/ }).waitFor()
  }
  await app.page.evaluate(() => window.examplePort.close())
  for (const frame of app.page.frames()) assert.deepEqual(await frame.evaluate(() => window.violations), [])
  await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()
  assert.deepEqual(app.errors, [])
}

for (const key of [
  roi,
  "campaign-summary",
  "channel-summary",
]) test(`SDK example typechecks/builds${key === roi ? " and passes S5" : ""}: ${key}`, async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-example-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const work = join(root, "work")
  await cp(resolve(import.meta.dirname, "../../examples", key, "src"), join(work, "src"), { recursive: true })
  const build = await buildDashboard({ work, out: join(root, "builds"), template: resolve(import.meta.dirname, "../../template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? process.execPath })
  assert.equal(build.ok, true, build.output)
  await screens(t, build.dir, key)
  if (key !== roi) return
  const app = await fixture(t, { published: true, app: build.dir, table })
  const refused = []
  app.page.on("console", message => { if (/refused/i.test(message.text())) refused.push(message.text()) })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.locator('iframe[title="Dashboard"]').waitFor()
  const frame = app.frame() ?? await app.page.waitForEvent("framenavigated", { predicate: frame => frame.url().startsWith(app.appOrigin + "/apps/") })
  await frame.locator("svg.recharts-surface").waitFor()
  for (const channel of channels) await frame.locator("svg.recharts-surface").getByText(channel, { exact: true }).waitFor()
  await frame.getByText("Расчёт при пороге MinBudget = 0", { exact: false }).waitFor()
  assert.equal(await frame.locator("input").count(), 0)
  await app.page.getByLabel("MinBudget", { exact: true }).fill("10000")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await frame.getByText(/Расчёт при пороге MinBudget = 10\s000/).waitFor()
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [10000])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  for (const frame of app.page.frames()) assert.deepEqual(await frame.evaluate(() => window.violations), [])
  assert.deepEqual(refused, [])
  assert.deepEqual(app.errors, [])
})
