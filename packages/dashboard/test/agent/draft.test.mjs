import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import test from "node:test"
import { createRequire, syncBuiltinESMExports } from "node:module"
import { prepareDashboard, readDashboardBinding, removeDashboard } from "../../src/agent/folder.ts"
import { dashboardResources } from "../../src/agent/resources.ts"
import { draftDashboard, NO_SAMPLE } from "../../src/agent/draft.ts"

const template = resolve(import.meta.dirname, "../../template")
const resources = {
  node: process.env.LOGINOM_AI_AGENT_TEST_NODE,
  template,
  page: resolve(import.meta.dirname, "../../dist/draft.js"),
  selfcheck: resolve(import.meta.dirname, "../../src/draft/selfcheck.mjs"),
  playwright: resolve(import.meta.dirname, "../../../loginom-runtime/client/node_modules/playwright-core"),
  chromium: createRequire(import.meta.url)(resolve(import.meta.dirname, "../../../loginom-runtime/client/node_modules/playwright-core")).chromium.executablePath(),
}

async function fixture(t, root) {
  if (!root) {
    root = await mkdtemp(join(tmpdir(), "dashboard-draft-"))
    t.after(() => rm(root, { recursive: true, force: true }))
  }
  const id = crypto.randomUUID()
  const prepared = await prepareDashboard({ readPublication: async () => null,
    id, origin: "http://localhost:32768", dashboards: root, template,
    fetch: async () => Response.json({
      id, created: new Date().toISOString(), published: false, nodeName: "Узел",
      binding: { packagePath: "/user/fixture/campaign.lgp", workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7", nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930" },
      parameters: [{ name: "Count", value: 2 }, { name: "Label", value: "text" }],
      sample: { schema: [{ name: "count", type: 1 }], rows: [[42], [43]] },
    }),
  })
  return prepared
}

test("a prepared folder builds and serves its coherent sample using one shared server", async t => {
  const prepared = await fixture(t)
  const output = await draftDashboard({ work: prepared.directory, resources })
  assert.match(output, /Проверка типов и сборка: успешно/)
  assert.match(output, /^Самопроверка страницы: успешно$/m)
  const url = output.match(/http:\/\/localhost:\d+\/[a-f0-9]{64}\//)?.[0]
  assert.ok(url, output)
  assert.equal((await fetch(url)).status, 200)
  const data = await (await fetch(url + "data")).json()
  assert.equal(data.nodeName, "Узел")
  assert.equal(data.packagePath, "/user/fixture/campaign.lgp")
  assert.deepEqual(data.sample.rows, [[42], [43]])
  assert.deepEqual(data.parameters, [{ name: "Count", value: 2 }, { name: "Label", value: null }])
  const again = await draftDashboard({ work: prepared.directory, resources })
  assert.equal(again.match(/http:\/\/localhost:\d+\/[a-f0-9]{64}\//)?.[0], url)
})

test("a request admitted for an earlier draft cannot start a preview for its replacement", async t => {
  const prepared = await fixture(t)
  const selfcheck = join(dirname(prepared.directory), "check.mjs")
  await writeFile(selfcheck, 'console.log(JSON.stringify({ok:true,state:"ready",errors:[]}))')
  const output = await draftDashboard({
    work: prepared.directory, resources: { ...resources, selfcheck }, expectedDraftId: crypto.randomUUID(),
  })
  assert.match(output, /^Черновик остановлен/)
  await assert.rejects(stat(join(prepared.directory, "../control/draft")), { code: "ENOENT" })
})

test("a build that completed before deletion cannot publish after local cleanup", { timeout: 15_000 }, async t => {
  const prepared = await fixture(t)
  const root = dirname(dirname(prepared.directory))
  const captured = await readDashboardBinding(prepared.directory, root)
  const selfcheck = join(root, "selfcheck.mjs")
  await writeFile(selfcheck, 'console.log(JSON.stringify({ ok: true, state: "ready", errors: [] }))')
  const fs = (await import("node:fs/promises")).default
  const rm = fs.rm
  const built = Promise.withResolvers()
  const resume = Promise.withResolvers()
  t.mock.method(fs, "rm", async (path, options) => {
    if (basename(path).startsWith(".stage-")) {
      built.resolve()
      await resume.promise
    }
    return rm(path, options)
  })
  syncBuiltinESMExports()
  t.after(() => { resume.resolve(); t.mock.restoreAll(); syncBuiltinESMExports() })
  const pending = draftDashboard({ work: prepared.directory, resources: { ...resources, selfcheck } })
  await Promise.race([built.promise, pending.then(output => assert.fail(output))])
  removeDashboard(prepared.directory, root, captured)
  resume.resolve()
  const output = await pending
  assert.doesNotMatch(output, /Черновик: http:/)
  await assert.rejects(stat(dirname(prepared.directory)), { code: "ENOENT" })
})

test("a running draft compiler cannot recreate the deleted dashboard folder", { timeout: 15_000 }, async t => {
  const prepared = await fixture(t)
  const root = dirname(dirname(prepared.directory))
  const captured = await readDashboardBinding(prepared.directory, root)
  const fs = (await import("node:fs/promises")).default
  const cp = fs.cp
  const copying = Promise.withResolvers()
  const resume = Promise.withResolvers()
  t.mock.method(fs, "cp", async (from, to, options) => {
    if (from === join(template, "index.html")) {
      copying.resolve()
      await resume.promise
    }
    return cp(from, to, options)
  })
  syncBuiltinESMExports()
  t.after(() => { resume.resolve(); t.mock.restoreAll(); syncBuiltinESMExports() })
  const pending = draftDashboard({ work: prepared.directory, resources })
  await Promise.race([copying.promise, pending.then(output => assert.fail(output))])
  removeDashboard(prepared.directory, root, captured)
  resume.resolve()
  assert.match(await pending, /^Черновик остановлен/)
  await assert.rejects(stat(dirname(prepared.directory)), { code: "ENOENT" })
})

test("a stopped draft cannot install a build into a reopened dashboard", { timeout: 15_000 }, async t => {
  const { directory: work } = await fixture(t)
  const root = dirname(dirname(work))
  const captured = await readDashboardBinding(work, root)
  const selfcheck = join(root, "selfcheck.mjs")
  await writeFile(selfcheck, 'console.log(JSON.stringify({ ok: true, state: "ready", errors: [] }))')
  await writeFile(join(work, "src/main.tsx"), 'document.body.textContent = "before deletion"; export {}')
  const fs = (await import("node:fs/promises")).default
  const rename = fs.rename
  const compiled = Promise.withResolvers()
  const resume = Promise.withResolvers()
  let paused = false
  t.mock.method(fs, "rename", async (from, to) => {
    if (!paused && basename(from) === "dist") {
      paused = true
      compiled.resolve()
      await resume.promise
    }
    return rename(from, to)
  })
  syncBuiltinESMExports()
  t.after(() => { resume.resolve(); t.mock.restoreAll(); syncBuiltinESMExports() })
  const pending = draftDashboard({ work, resources: { ...resources, selfcheck } })
  await Promise.race([compiled.promise, pending.then(output => assert.fail(output))])
  removeDashboard(work, root, captured)
  assert.equal((await fixture(t, root)).directory, work)
  assert.match(await draftDashboard({ work, resources: { ...resources, selfcheck } }), /Черновик: http:/)
  const cache = join(work, "../control/draft")
  const files = await readdir(cache)
  const current = await readFile(join(cache, "current"), "utf8")
  resume.resolve()
  assert.match(await pending, /^Черновик остановлен/)
  assert.deepEqual(await readdir(cache), files)
  assert.equal(await readFile(join(cache, "current"), "utf8"), current)
})

test("type errors return compiler diagnostics without a draft link", async t => {
  const prepared = await fixture(t)
  await writeFile(join(prepared.directory, "src/main.tsx"), 'const invalid: number = "text"; export {}')
  const output = await draftDashboard({ work: prepared.directory, resources })
  assert.match(output, /^Сборка не удалась/)
  assert.match(output, /error TS/)
  assert.doesNotMatch(output, /http:\/\/localhost/)
})

test("a missing sample skips the build and explains how to refresh", async t => {
  const prepared = await fixture(t)
  await rm(join(prepared.directory, "sample.json"))
  assert.equal(await draftDashboard({ work: prepared.directory, resources }), NO_SAMPLE)
  await assert.rejects(stat(join(prepared.directory, "../control/draft")), { code: "ENOENT" })
})

test("draft control paths follow a session alias to its physical dashboard", async t => {
  const prepared = await fixture(t)
  const alias = join(prepared.directory, "../../outside-alias")
  await symlink(prepared.directory, alias, process.platform === "win32" ? "junction" : "dir")
  const output = await draftDashboard({ work: alias, resources })
  assert.match(output, /Проверка типов и сборка: успешно/)
  assert.equal((await (await fetch(output.match(/http:\/\/localhost:\d+\/[a-f0-9]{64}\//)[0] + "data")).json()).nodeName, "Узел")
})

test("installation resources require the manifest, payload and template dependencies", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-resources-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const missing = error => /^DASHBOARD_RESOURCES_MISSING/.test(error.message) && error.message.includes("Переустановите программу")
  assert.throws(() => dashboardResources(undefined), missing)
  assert.throws(() => dashboardResources(root), missing)
  await writeFile(join(root, "resource-manifest.json"), JSON.stringify({ node: "node", browser: "chromium" }))
  const expected = { node: join(root, "node"), template: join(root, "dashboard/template"), page: join(root, "dashboard/draft.js"), selfcheck: join(root, "dashboard/selfcheck.mjs"), playwright: join(root, "runtime/client/node_modules/playwright-core"), chromium: join(root, "chromium") }
  for (const path of [expected.template, expected.playwright]) await mkdir(path, { recursive: true })
  for (const path of [expected.node, expected.page, expected.selfcheck, expected.chromium]) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, "fixture")
  }
  assert.throws(() => dashboardResources(root), missing)
  await mkdir(join(expected.template, "node_modules"))
  assert.deepEqual(dashboardResources(root), expected)
})

test("draft reports at most twenty console errors from the built app", async t => {
  const prepared = await fixture(t)
  await writeFile(join(prepared.directory, "src/main.tsx"), `import { onState } from "./loginom"
onState(() => { for (let index = 0; index < 25; index++) console.error("render error " + index) })`)
  const output = await draftDashboard({ work: prepared.directory, resources })
  assert.match(output, /Черновик: http:\/\/localhost:/)
  assert.match(output, /Самопроверка страницы: ошибка \(ready\)/)
  assert.equal(output.split("\n").filter(line => line.startsWith("render error ")).length, 20)
  assert.match(output, /^render error 19$/m)
  assert.doesNotMatch(output, /^render error 20$/m)
})
