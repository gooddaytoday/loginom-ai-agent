import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { appHost } from "../../dist/server.mjs"
import { chromium } from "../../../loginom-runtime/client/node_modules/playwright-core/index.mjs"
import { fixture } from "./fixture.mjs"

const state = {
  type: "state", parameters: [{ name: "Budget", value: 17 }],
  table: { schema: [{ name: "count", type: 1 }], rows: [[42]], truncated: false, totalRows: 1 },
  error: null, busy: false,
}

async function buildTemplate(t) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-template-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const key = "a".repeat(64)
  const hash = "b".repeat(64)
  execFileSync("npm", ["run", "build", "--", "--outDir", join(root, key, hash), "--emptyOutDir"], {
    cwd: resolve(import.meta.dirname, "../../template"),
    env: { ...process.env, PATH: dirname(process.execPath) + ":" + process.env.PATH },
  })
  return { root, key, hash }
}

async function template(t) {
  const { root, key, hash } = await buildTemplate(t)
  const reservation = createServer().listen(0, "127.0.0.1")
  await once(reservation, "listening")
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const appOrigin = `http://dashboards.localhost:${port}`
  const csp = (await readFile(new URL("../../deploy/studio.csp", import.meta.url), "utf8")).trim().replace("<DASH>", appOrigin)
  const studio = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html", "content-security-policy": csp })
    response.end(`<!doctype html><iframe sandbox="allow-scripts" src="${appOrigin}/apps/${key}/${hash}/"></iframe>
<script>
addEventListener("message", event => {
  const frame = document.querySelector("iframe")
  if (event.source !== frame.contentWindow || event.data?.type !== "loginom-dashboard/ready") return
  const channel = new MessageChannel()
  window.port = channel.port1
  frame.contentWindow.postMessage({type: "loginom-dashboard/init", version: 1}, "*", [channel.port2])
  window.ready = true
})
</script>`)
  })
  studio.listen(0, "127.0.0.1")
  await once(studio, "listening")
  t.after(() => new Promise(resolve => studio.close(resolve)))
  const origin = `http://127.0.0.1:${studio.address().port}`
  const server = appHost({ buildsRoot: root, appOrigin, clientOrigins: [origin], mode: "normal", log() {} })
  server.listen(port, "127.0.0.1")
  await once(server, "listening")
  t.after(() => new Promise(resolve => server.close(resolve)))
  const browser = await chromium.launch({ channel: "chromium", headless: true, chromiumSandbox: true })
  t.after(() => browser.close())
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
  page.on("pageerror", error => errors.push(error.message))
  page.on("requestfailed", request => errors.push(request.url() + ": " + request.failure()?.errorText))
  page.setDefaultTimeout(3_000)
  await page.goto(origin + "/app/")
  await page.waitForFunction(() => window.ready).catch(error => { throw Error(error.message + "\n" + errors.join("\n")) })
  const frame = page.frames().find(frame => frame.url().startsWith(appOrigin + "/apps/"))
  assert.ok(frame)
  return { page, frame, send: input => page.evaluate(value => window.port.postMessage(value), input) }
}

test("the template distinguishes a truncated empty view from an empty result", async t => {
  const { frame, send } = await template(t)
  await send({ ...state, table: { ...state.table, rows: [], truncated: true, totalRows: 600 } })
  const status = frame.getByRole("status").filter({ hasText: /Нет данных|Строк в результате/ })
  await status.waitFor()
  assert.equal(await status.textContent(), "Строк в результате: 0 из 600: показана часть")
})

test("the template displays parameter names and values as text", async t => {
  const { frame, send } = await template(t)
  await send({ ...state, parameters: [...state.parameters, { name: "Unset", value: null }] })
  await frame.getByRole("status").filter({ hasText: "Строк в результате: 1" }).waitFor()
  const text = await frame.locator("body").textContent()
  assert.match(text, /Budget = 17/)
  assert.match(text, /Unset = не задан/)
  assert.equal(await frame.locator("input").count(), 0)
})

test("the template shows loading, error, empty, data and truncated states", async t => {
  const { frame, send } = await template(t)
  await frame.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  await send(state)
  await frame.getByRole("status").filter({ hasText: "Строк в результате: 1" }).waitFor()
  await send({ ...state, busy: true })
  await frame.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  await send({ ...state, table: null, error: "Fixture calculation failed" })
  await frame.getByRole("alert").filter({ hasText: "Fixture calculation failed" }).waitFor()
  await send({ ...state, table: { ...state.table, rows: [], totalRows: 0 } })
  await frame.getByRole("status").filter({ hasText: "Нет данных" }).waitFor()
  await send(state)
  await frame.getByRole("status").filter({ hasText: "Строк в результате: 1" }).waitFor()
  await send({ ...state, table: { ...state.table, truncated: true, totalRows: 2 } })
  await frame.getByRole("status").filter({ hasText: "Строк в результате: 1 из 2: показана часть" }).waitFor()
})

test("the template changes from data to loading during a header calculation", async t => {
  const { root, key, hash } = await buildTemplate(t)
  const app = await fixture(t, { published: true, app: join(root, key, hash) })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.locator('iframe[title="Dashboard"]').waitFor()
  const frame = app.frame() ?? await app.page.waitForEvent("framenavigated", { predicate: frame => frame.url().startsWith(app.appOrigin + "/apps/") })
  await frame.getByRole("status").filter({ hasText: "Строк в результате: 1" }).waitFor()
  await app.page.evaluate(() => { window.fixture.wait = true })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await app.page.waitForFunction(() => window.fixture.finish)
  await frame.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  await app.page.evaluate(() => { window.fixture.wait = false; window.fixture.finish() })
  await frame.getByRole("status").filter({ hasText: "Строк в результате: 1" }).waitFor()
  assert.match(await frame.locator("body").textContent(), /MinBudget = 17/)
  assert.deepEqual(app.errors, [])
})

test("the template opened outside a frame explains how to open it from Studio", async t => {
  const { page, frame } = await template(t)
  const standalone = await page.context().newPage()
  await standalone.goto(frame.url())
  await standalone.getByRole("status").filter({ hasText: "Откройте dashboard кнопкой Dashboard в Studio" }).waitFor()
})
