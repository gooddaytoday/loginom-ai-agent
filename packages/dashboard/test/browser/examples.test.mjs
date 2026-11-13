import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fixture } from "./fixture.mjs"

const roi = "f42521cdeb21bbc3a3b536da85dab3936a512c5228df34864fc060dc71d886be"
const channels = ["Поиск", "Соцсети", "Email", "Видео", "Партнёры"]
const table = {
  schema: ["channel", "total_budget", "total_revenue", "roi_pct", "campaigns"].map((name, index) => ({ name, type: index ? 3 : 2 })),
  rows: channels.map((name, index) => [name, 1000 * (index + 1), 3000 * (index + 1), 200, 100]),
}

async function screens(t, compiled) {
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
  await app.page.evaluate(() => window.examplePort.close())
  for (const frame of app.page.frames()) assert.deepEqual(await frame.evaluate(() => window.violations), [])
  await app.page.getByRole("button", { name: "Вернуться к сценарию", exact: true }).click()
  assert.deepEqual(app.errors, [])
}

for (const key of [
  roi,
  "4760e2021e1c7bd492997a9359f10c6bc021104d00b1d71f02fde9f292569b55",
  "c597ab9c880a2dba087f95b6b8e20c3f78efcc18fd845a73cc4f205e25153248",
]) test(`SDK example typechecks/builds${key === roi ? " and passes S5" : ""}: ${key}`, async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-example-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = resolve(import.meta.dirname, "../../../../dashboard/apps", key)
  if (!existsSync(join(source, "node_modules"))) {
    await symlink(resolve(import.meta.dirname, "../../template/node_modules"), join(source, "node_modules"), "dir")
    t.after(() => rm(join(source, "node_modules")))
  }
  const options = { cwd: source, env: { ...process.env, PATH: dirname(process.execPath) + ":" + process.env.PATH } }
  execFileSync("npm", ["run", "typecheck"], options)
  execFileSync("npm", ["run", "build", "--", "--outDir", join(root, key), "--emptyOutDir"], options)
  assert.ok(existsSync(join(root, key, "index.html")))
  await screens(t, join(root, key))
  if (key !== roi) return
  const app = await fixture(t, { published: true, app: join(root, key), table })
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
