import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { draftServer } from "../../src/draft/server.ts"
import { chromium } from "../../../loginom-runtime/client/node_modules/playwright-core/index.mjs"

const key = "a".repeat(64)
const hash = "b".repeat(64)
const data = {
  nodeName: "Fixture node", created: "2026-11-12T12:00:00.000Z",
  parameters: [{ name: "MinBudget", value: 7 }, { name: "Empty", value: null }],
  sample: { schema: [{ name: "n", type: 3 }], rows: [[1], [2]] },
}
const sdk = execFileSync("bun", ["build", resolve(import.meta.dirname, "../../src/sdk/loginom.ts"), "--target=browser", "--format=esm"])

async function fixture(t, app = "recorder", initial = data, childMode = false) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-draft-browser-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const builds = join(root, "control/draft")
  await mkdir(builds, { recursive: true })
  await cp(resolve(import.meta.dirname, "apps", app), join(builds, hash), { recursive: true })
  if (app === "recorder") await writeFile(join(builds, hash, "assets/loginom.js"), sdk)
  const entry = { key, hash, builds, data: initial }
  const backend = childMode ? spawn(process.env.LOGINOM_AI_AGENT_TEST_NODE ?? process.execPath, ["--input-type=module", "--eval", `
import { draftServer } from ${JSON.stringify(new URL("../../src/draft/server.ts", import.meta.url).href)};
const server = await draftServer(${JSON.stringify(resolve(import.meta.dirname, "../../dist/draft.js"))});
server.publish(${JSON.stringify(entry)});
console.log(JSON.stringify({pageOrigin:server.pageOrigin,appOrigin:server.appOrigin}));
process.stdin.resume();
`], { stdio: ["pipe", "pipe", "pipe"] }) : undefined
  const server = await (async () => {
    if (!backend) {
      const server = await draftServer(resolve(import.meta.dirname, "../../dist/draft.js"))
      t.after(() => server.close())
      return server
    }
    const exited = once(backend, "exit")
    t.after(async () => {
      if (backend.exitCode === null && backend.signalCode === null) { backend.kill("SIGCONT"); backend.kill() }
      await exited
    })
    const lines = createInterface({ input: backend.stdout })
    t.after(() => lines.close())
    const [line] = await once(lines, "line", { signal: AbortSignal.timeout(5_000) })
    return JSON.parse(line)
  })()
  const browser = await chromium.launch({ channel: "chromium", headless: true, chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  const dialogs = []
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss() })
  const url = backend ? `${server.pageOrigin}/${key}/` : server.publish(entry)
  if (childMode === "data") await page.route(`**/${key}/data`, async route => {
    backend.kill("SIGSTOP")
    await route.continue()
  })
  await page.goto(url)
  return { root, server, page, entry, url, dialogs, backend }
}

test("the draft shows its sample and disabled parameters through the real sandbox handshake", async t => {
  const { page, server, dialogs } = await fixture(t)
  await page.waitForFunction(() => document.body.dataset.state === "ready")
  assert.equal(await page.locator("header strong").textContent(), data.nodeName)
  const stamp = await page.evaluate(created => new Date(created).toLocaleString("ru-RU"), data.created)
  await page.getByText(`Черновик — доступен только с этого компьютера. Данные: пример из 2 строк от ${stamp}`, { exact: true }).waitFor()
  await page.getByText("Пересчёт доступен после публикации", { exact: true }).waitFor()
  const fields = page.locator("input")
  assert.equal(await fields.count(), 2)
  for (const field of await fields.all()) assert.equal(await field.isDisabled(), true)
  assert.equal(await fields.nth(0).inputValue(), "7")
  assert.equal(await fields.nth(1).inputValue(), "")
  const iframe = page.locator("iframe")
  assert.equal(await iframe.getAttribute("sandbox"), "allow-scripts")
  assert.equal(await iframe.getAttribute("src"), `${server.appOrigin}/apps/${key}/${hash}/`)
  const frame = page.frames().find(frame => frame.url().startsWith(server.appOrigin + "/apps/"))
  assert.ok(frame)
  await frame.waitForFunction(() => window.states?.length === 1)
  assert.deepEqual(await frame.evaluate(() => window.states), [{ parameters: data.parameters, table: { ...data.sample, truncated: false, totalRows: 2 }, error: null, busy: false }])
  assert.deepEqual(dialogs, [])
})

test("node and parameter names in a draft stay literal text", async t => {
  const name = "<img src=x onerror=alert(1)>"
  const { page, dialogs } = await fixture(t, "recorder", { ...data, nodeName: name, parameters: [{ name, value: 7 }] })
  await page.waitForFunction(() => document.body.dataset.state === "ready")
  assert.equal(await page.locator("header strong").textContent(), name)
  assert.equal(await page.locator("header label").textContent(), name + " ")
  assert.equal(await page.locator("header img").count(), 0)
  assert.deepEqual(dialogs, [])
})

test("a new published draft hash reloads the page and shows the new app", async t => {
  const { page, server, entry } = await fixture(t)
  await page.waitForFunction(() => document.body.dataset.state === "ready")
  const next = "c".repeat(64)
  await cp(join(entry.builds, hash), join(entry.builds, next), { recursive: true })
  await writeFile(join(entry.builds, next, "assets/recorder.js"), 'import { onState } from "./loginom.js"; onState(state => { document.body.textContent = "Updated app: " + state.table.rows[0][0] })')
  const loaded = page.waitForEvent("framenavigated", { predicate: frame => frame.url() === `${server.appOrigin}/apps/${key}/${next}/`, timeout: 3_000 })
  server.publish({ ...entry, hash: next, data: { ...data, nodeName: "Updated node", sample: { ...data.sample, rows: [[3]] } } })
  const frame = await loaded
  await frame.getByText("Updated app: 3", { exact: true }).waitFor()
  assert.equal(await page.locator("header strong").textContent(), "Updated node")
})

test("a stopped draft replaces the page within one polling interval", async t => {
  const { page, server } = await fixture(t)
  await page.waitForFunction(() => document.body.dataset.state === "ready")
  await server.close()
  await page.getByText("Черновик остановлен. Попросите агента показать его снова", { exact: true }).waitFor({ timeout: 3_000 })
  assert.equal(await page.locator("iframe").count(), 0)
})

test("a silent app reports its existing ten-second handshake timeout", async t => {
  const { page } = await fixture(t, "silent")
  await page.getByText("Dashboard не ответил", { exact: true }).waitFor({ timeout: 12_000 })
  assert.equal(await page.evaluate(() => document.body.dataset.state), "silent")
  assert.equal(await page.locator("iframe").count(), 0)
})


test("an unresponsive backend stops the draft without overlapping hash requests", async t => {
  if (process.platform === "win32") return t.skip("SIGSTOP is unavailable on Windows")
  const { page, backend } = await fixture(t, "recorder", data, true)
  await page.waitForFunction(() => document.body.dataset.state === "ready")
  let requests = 0
  page.on("request", request => { if (new URL(request.url()).pathname === `/${key}/hash`) requests++ })
  backend.kill("SIGSTOP")
  await page.getByText("Черновик остановлен. Попросите агента показать его снова", { exact: true }).waitFor({ timeout: 5_000 })
  assert.equal(requests, 1)
  assert.equal(await page.locator("iframe").count(), 0)
})


test("a stalled initial data request shows the stopped message instead of a blank page", async t => {
  if (process.platform === "win32") return t.skip("SIGSTOP is unavailable on Windows")
  const { page } = await fixture(t, "recorder", data, "data")
  await page.getByText("Черновик остановлен. Попросите агента показать его снова", { exact: true }).waitFor({ timeout: 3_000 })
  assert.equal(await page.locator("iframe").count(), 0)
})
