import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { prepareDashboard } from "../../src/agent/folder.ts"
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

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-draft-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const id = crypto.randomUUID()
  const prepared = await prepareDashboard({
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
  assert.deepEqual(data.sample.rows, [[42], [43]])
  assert.deepEqual(data.parameters, [{ name: "Count", value: 2 }, { name: "Label", value: null }])
  const again = await draftDashboard({ work: prepared.directory, resources })
  assert.equal(again.match(/http:\/\/localhost:\d+\/[a-f0-9]{64}\//)?.[0], url)
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
