import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { once } from "node:events"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { buildDashboard } from "../../src/agent/build.ts"
import { NO_SAMPLE } from "../../src/agent/draft.ts"
import { prepareDashboard, readDashboardSnapshot } from "../../src/agent/folder.ts"
import { embeddedValues, preparePublish, finishPublish } from "../../src/agent/publish.ts"
import { dashboardServer } from "../../src/web/server.ts"

const resources = { template: resolve(import.meta.dirname, "../../template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
const confirmed = prepared => ({ timeoutMs: 0, expected: null, publish: async () => ({ status: "written", version: { name: "20261115T120000Z.json", sourceHash: prepared.publication.sourceHash } }) })

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "publish-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const builds = join(root, "builds")
  await mkdir(builds)
  const server = dashboardServer({ buildsRoot: builds, appOrigin: "http://dashboards.localhost:8101", mode: "normal", clientOrigins: [] })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => server[Symbol.asyncDispose]())
  const origin = "http://127.0.0.1:" + server.address().port
  const binding = { packagePath: "/fixture/orders.lgp", workflowGuid: crypto.randomUUID(), nodeGuid: crypto.randomUUID() }
  const post = (route, data) => fetch(origin + "/dashboard/" + route, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  })
  async function refresh() {
    const response = await post("snapshots", {
      binding, nodeName: "Заказы", published: false, parameters: [{ name: "Budget", value: 100 }],
      sample: { schema: [{ name: "region", type: "string" }, { name: "total", type: "number" }], rows: [["Москва-Север", 123456], ["Юг", 7]] },
    })
    assert.equal(response.status, 201)
    const { id } = await response.json()
    return prepareDashboard({ readPublication: async () => null, id, origin, dashboards: join(root, "dashboards"), template: resources.template })
  }
  const work = (await refresh()).directory
  const operation = await mkdtemp(join(work, "../control/.publish-"))
  return { work, resources, operation, builds, refresh, lookup: () => post("lookup", binding).then(response => response.json()) }
}

async function tree(dir) {
  const result = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) result[join(entry.parentPath.slice(dir.length + 1), entry.name)] = await readFile(join(entry.parentPath, entry.name))
  }
  return result
}

test("prepare retains checked sources and serializes trusted metadata without sample", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), '\uFEFFdocument.body.textContent = "Привет 🟢"')
  const image = Buffer.from([0, 128, 255, 1])
  await writeFile(join(input.work, "src/logo.png"), image)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true, prepared.text)
  const content = JSON.parse(prepared.publication.content)
  assert.deepEqual(content.binding, prepared.control.binding)
  assert.equal(content.title, "Заказы")
  assert.deepEqual(content.parameters, [{ name: "Budget", label: "Budget" }])
  assert.deepEqual(Buffer.from(content.files.find(file => file.path === "src/logo.png").content, "base64"), image)
  assert.equal(content.sample, undefined)
  assert.deepEqual(await tree(join(input.operation, "src")), await tree(join(input.work, "src")))
  assert.equal(content.files.find(file => file.path === "src/main.tsx").content, await readFile(join(input.work, "src/main.tsx"), "utf8"))
  assert.equal(prepared.publication.sourceHash, createHash("sha256").update(prepared.publication.content).digest("hex"))
})

test("publication checks sample values in every captured file including binary assets", async t => {
  const input = await fixture(t)
  const main = join(input.work, "src/main.tsx")
  await writeFile(main, 'document.body.textContent = "Москва-Север" + 123456 + "Юг"')
  const result = await preparePublish(input)
  assert.equal(result.ok, false)
  assert.match(result.text, /Москва-Север/)
  assert.match(result.text, /123456/)
  assert.doesNotMatch(result.text, /Юг/)
  assert.match(result.text, /публичн/)
  await writeFile(main, 'document.body.textContent = "Юг"')
  await writeFile(join(input.work, "src/logo.png"), Buffer.from("binary\0Москва-Север"))
  const binary = await preparePublish(input)
  assert.equal(binary.ok, false)
  assert.match(binary.text, /Москва-Север/)
  assert.doesNotMatch(binary.text, /123456/)
  await rm(join(input.work, "src/logo.png"))
  assert.equal((await preparePublish(input)).ok, true)
})

test("an accepted publication leaves a newer sample with identical rows intact", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  await input.refresh()
  const current = JSON.parse(await readFile(join(input.work, "../control/binding.json"), "utf8"))
  assert.notEqual(current.snapshotId, prepared.control.snapshotId)
  const name = "20261115T120000Z.json"
  const key = (await input.lookup()).key
  await writeFile(join(input.builds, "state.json"), JSON.stringify({ [`${prepared.control.binding.packagePath}.dashboards/${prepared.control.binding.nodeGuid}/${name}`]: {
    key, sourceHash: prepared.publication.sourceHash, status: "ready", buildHash: prepared.build.hash,
  } }))
  assert.equal((await finishPublish({ ...input, ...prepared, ...confirmed(prepared), timeoutMs: 1000 })).status, "published")
  const sample = JSON.parse(await readFile(join(input.work, "sample.json"), "utf8"))
  assert.deepEqual(sample.rows, [["Москва-Север", 123456], ["Юг", 7]])
})

test("edits to live src cannot conceal a sample value in the captured build", async t => {
  const input = await fixture(t)
  const source = join(input.work, "src")
  const main = join(source, "main.tsx")
  const clean = await readFile(main)
  // Simulate an editor changing src during the real recursive copy.
  const copy = fs.cp
  t.mock.method(fs, "cp", async (from, to, options) => {
    if (from !== source) return copy(from, to, options)
    await writeFile(main, 'document.body.textContent = "Москва-Север"')
    await copy(from, to, options)
    await writeFile(main, clean)
  })
  syncBuiltinESMExports()
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports() })
  const result = await preparePublish(input)
  assert.deepEqual(await readFile(main), clean)
  assert.equal(result.ok, false, result.text)
  assert.match(result.text, /Москва-Север/)
  assert.deepEqual(await readdir(input.builds), [])
})

test("approved sources survive edits and draft pruning", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const out = join(input.work, "../control/draft")
  for (const text of ["second", "third"]) {
    await writeFile(join(input.work, "src/main.tsx"), "document.body.textContent = " + JSON.stringify(text))
    const next = await buildDashboard({ work: input.work, ...resources, out })
    assert.equal(next.ok, true, next.output)
  }
  await assert.rejects(readdir(join(out, prepared.build.hash)), { code: "ENOENT" })
  let transferredContent
  const result = await finishPublish({ ...input, ...prepared, timeoutMs: 0, expected: null, publish: async request => {
    transferredContent = request.content
    assert.deepEqual(request.binding, prepared.control.binding)
    assert.equal(request.expected, null)
    return { status: "written", version: { name: "20261115T120000Z.json", sourceHash: prepared.publication.sourceHash } }
  } })
  assert.equal(transferredContent, prepared.publication.content)
  assert.equal(result.status, "pending")
  assert.ok(await readFile(join(input.work, "sample.json")))
})

test("missing sample stops preparation before building", async t => {
  const input = await fixture(t)
  await rm(join(input.work, "sample.json"))
  assert.deepEqual(await preparePublish(input), { ok: false, text: NO_SAMPLE })
  await assert.rejects(readdir(join(input.work, "../control/draft")), { code: "ENOENT" })
})

test("a type error returns compiler diagnostics and leaves the stand current alone", async t => {
  const input = await fixture(t)
  const { key } = await input.lookup()
  await mkdir(join(input.builds, key))
  const current = join(input.builds, key, "current")
  const previous = "f".repeat(64) + "\n"
  await writeFile(current, previous)
  await writeFile(join(input.work, "src/main.tsx"), 'const error: number = "text"; export {}')
  const result = await preparePublish(input)
  assert.equal(result.ok, false)
  assert.match(result.text, /^Сборка не удалась/)
  assert.match(result.text, /error TS/)
  assert.equal(await readFile(current, "utf8"), previous)
})

test("embedded-value diagnostics stay within the builder budget and explain public access", async t => {
  const input = await fixture(t)
  const text = "Ж".repeat(8192)
  const { sample } = readDashboardSnapshot(input.work)
  await writeFile(join(input.work, "sample.json"), JSON.stringify({ ...sample, rows: [[text, 7]] }))
  await writeFile(join(input.work, "src/main.tsx"), "document.body.textContent = " + JSON.stringify(text))
  const result = await preparePublish(input)
  assert.equal(result.ok, false)
  assert.match(result.text, /публичн/)
  assert.ok(Buffer.byteLength(result.text.split("\n").slice(1).join("\n")) <= 8192)
})

test("confirmed transfer survives loss of the local work folder", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const result = await finishPublish({ ...input, ...prepared, timeoutMs: 0, expected: null, publish: async () => {
    await rm(input.work, { recursive: true })
    return { status: "written", version: { name: "20261115T120000Z.json", sourceHash: prepared.publication.sourceHash } }
  } })
  assert.equal(result.status, "pending")
  assert.match(result.text, /Исходники переданы/)
})

test("the embedded value threshold counts six Unicode code points", () => {
  const short = "🟢".repeat(3)
  const boundary = "🟢".repeat(6)
  assert.deepEqual(embeddedValues({ rows: [[short, boundary]] }, [Buffer.from(boundary)]), [boundary])
})

test("a locally valid source tree exceeding the JSON budget is refused before confirmation", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/large.png"), Buffer.alloc(786432))
  const result = await preparePublish(input)
  assert.equal(result.ok, false)
  assert.match(result.text, /1 МБ/)
  assert.ok(await readFile(join(input.work, "sample.json")))
})

test("changed, cancelled and invalid host replies retain the draft without retry", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const before = readDashboardSnapshot(input.work).control
  let writes = 0
  const request = { ...input, ...prepared, timeoutMs: 0, expected: null, publish: async () => {
    writes++
    return { status: "changed", latest: null }
  } }
  assert.equal((await finishPublish(request)).status, "needs-confirmation")
  assert.equal(writes, 1)
  await assert.rejects(finishPublish({ ...request, signal: AbortSignal.abort() }))
  assert.equal(writes, 1)
  for (const reply of [
    { status: "written", version: { name: "20261115T120000Z.json", sourceHash: "f".repeat(64) } },
    { status: "written", version: { name: "20261115T120000Z.json", sourceHash: prepared.publication.sourceHash }, extra: true },
  ]) await assert.rejects(finishPublish({ ...request, publish: async () => reply }), /DASHBOARD_WRITE_UNKNOWN/)
  assert.ok(await readFile(join(input.work, "sample.json")))
  assert.ok(await readFile(join(input.work, "src/main.tsx")))
  assert.deepEqual(readDashboardSnapshot(input.work).control, before)
})

test("finish confirms its own ready A even when B is current", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true, prepared.text)
  const name = "20261115T120000Z.json"
  const key = (await input.lookup()).key
  const folder = `${prepared.control.binding.packagePath}.dashboards/${prepared.control.binding.nodeGuid}/`
  await writeFile(join(input.builds, "state.json"), JSON.stringify({
    [folder + name]: { key, sourceHash: prepared.publication.sourceHash, status: "ready", buildHash: prepared.build.hash },
    [folder + "20261115T120001Z.json"]: { key, sourceHash: "b".repeat(64), status: "ready", buildHash: "c".repeat(64) },
  }))
  const result = await finishPublish({ ...input, ...prepared, ...confirmed(prepared), timeoutMs: 1000 })
  assert.equal(result.status, "published")
  assert.equal(result.version.name, name)
  assert.match(result.text, /новая|новее/)
  await assert.rejects(readFile(join(input.work, "sample.json")), { code: "ENOENT" })
})

test("ready with a different source hash stays pending without a second write", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const name = "20261115T120000Z.json"
  const key = (await input.lookup()).key
  const folder = `${prepared.control.binding.packagePath}.dashboards/${prepared.control.binding.nodeGuid}/`
  await writeFile(join(input.builds, "state.json"), JSON.stringify({ [folder + name]: { key, sourceHash: "b".repeat(64), status: "ready", buildHash: prepared.build.hash } }))
  let writes = 0
  const result = await finishPublish({ ...input, ...prepared, expected: null, timeoutMs: 50, publish: async () => {
    writes++
    return { status: "written", version: { name, sourceHash: prepared.publication.sourceHash } }
  } })
  assert.equal(result.status, "pending")
  assert.equal(writes, 1)
  assert.ok(await readFile(join(input.work, "sample.json")))
})

test("two own writes from A keep base C in either completion order and preserve a newer snapshot", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const file = join(input.work, "../control/binding.json")
  const base = { name: "20261115T110000Z.json", sourceHash: "a".repeat(64) }
  const versions = ["20261115T120000Z.json", "20261115T130000Z.json"].map(name => ({ name, sourceHash: prepared.publication.sourceHash }))
  for (const order of [versions, [...versions].reverse()]) {
    await writeFile(file, JSON.stringify({ ...prepared.control, base }))
    await input.refresh()
    const refreshed = JSON.parse(await readFile(file, "utf8"))
    for (const version of order) await finishPublish({ ...input, ...prepared, control: { ...prepared.control, base }, expected: base, timeoutMs: 0, publish: async () => ({ status: "written", version }) })
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { ...refreshed, base: versions[1] })
    assert.ok(await readFile(join(input.work, "sample.json")))
  }
})
