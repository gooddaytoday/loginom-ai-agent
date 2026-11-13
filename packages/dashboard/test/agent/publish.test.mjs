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
const published = { status: "published", text: "Dashboard опубликован. Откройте узел в Studio и нажмите Dashboard" }

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
      binding, nodeName: "Заказы", published: false, parameters: [],
      sample: { schema: [{ name: "region", type: "string" }, { name: "total", type: "number" }], rows: [["Москва-Север", 123456], ["Юг", 7]] },
    })
    assert.equal(response.status, 201)
    const { id } = await response.json()
    return prepareDashboard({ id, origin, dashboards: join(root, "dashboards"), template: resources.template })
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

test("the stand serves the exact build retained for confirmation", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true, prepared.text)
  const { build, control } = prepared
  assert.equal(build.dir, join(input.operation, "dist"))
  const expected = await tree(build.dir)
  assert.ok(expected["index.html"])
  assert.deepEqual(await tree(join(input.work, "../control/draft", build.hash)), expected)
  assert.deepEqual(await finishPublish({ ...input, ...prepared }), published)
  const key = join(input.builds, control.key)
  assert.deepEqual(await tree(join(key, build.hash)), expected)
  assert.equal(await readFile(join(key, "current"), "utf8"), build.hash + "\n")
  assert.equal((await input.lookup()).hash, build.hash)
  await assert.rejects(readFile(join(input.work, "sample.json")), { code: "ENOENT" })
  assert.ok(await readFile(join(input.work, "snapshot.json")))
  assert.ok(await readFile(join(input.work, "../control/binding.json")))
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

test("remote stands and absent local builds directories are left untouched", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const unavailable = { status: "failed", text: "Публикация на этот стенд появится в следующей версии" }
  const noNetwork = () => { throw Error("Unexpected lookup") }
  assert.deepEqual(await finishPublish({ ...input, ...prepared, control: { ...prepared.control, origin: "http://192.0.2.1:32768" }, fetch: noNetwork }), unavailable)
  assert.deepEqual(await readdir(input.builds), [])
  await rm(input.builds, { recursive: true })
  assert.deepEqual(await finishPublish({ ...input, ...prepared, fetch: noNetwork }), unavailable)
  await assert.rejects(readdir(input.builds), { code: "ENOENT" })
})

test("an accepted publication leaves a newer sample with identical rows intact", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  await input.refresh()
  const current = JSON.parse(await readFile(join(input.work, "../control/binding.json"), "utf8"))
  assert.notEqual(current.snapshotId, prepared.control.snapshotId)
  assert.deepEqual(await finishPublish({ ...input, ...prepared }), published)
  const sample = JSON.parse(await readFile(join(input.work, "sample.json"), "utf8"))
  assert.deepEqual(sample.rows, [["Москва-Север", 123456], ["Юг", 7]])
})

test("a concurrent publisher is busy until the full lookup body is read and can retry", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const request = { ...input, ...prepared }
  const reading = Promise.withResolvers()
  const release = Promise.withResolvers()
  const first = finishPublish({
    ...request,
    fetch: async (url, options) => {
      const response = await fetch(url, options)
      return new Response(new ReadableStream({
        async pull(controller) {
          reading.resolve()
          await release.promise
          controller.enqueue(new Uint8Array(await response.arrayBuffer()))
          controller.close()
        },
      }))
    },
  })
  try {
    await reading.promise
    const concurrent = await finishPublish(request)
    assert.equal(concurrent.status, "failed")
    assert.match(concurrent.text, /занят/)
    assert.ok(await readFile(join(input.work, "sample.json")))
    const other = await fixture(t)
    const independent = await preparePublish(other)
    assert.equal(independent.ok, true)
    // Use a second binding on the same stand while the original lookup is still reading.
    assert.deepEqual(await finishPublish({
      ...other, ...independent, builds: input.builds, control: { ...independent.control, origin: prepared.control.origin },
    }), published)
  } finally {
    release.resolve()
    assert.deepEqual(await first, published)
  }
  assert.deepEqual(await finishPublish(request), published)
  assert.deepEqual((await readdir(join(input.builds, prepared.control.key))).filter(name => /^[a-f0-9]{64}$/.test(name)), [prepared.build.hash])
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

test("two subsequent draft builds cannot prune a build awaiting confirmation", async t => {
  const input = await fixture(t)
  const approved = await preparePublish(input)
  assert.equal(approved.ok, true)
  const expected = await tree(approved.build.dir)
  const out = join(input.work, "../control/draft")
  for (const text of ["second", "third"]) {
    await writeFile(join(input.work, "src/main.tsx"), "document.body.textContent = " + JSON.stringify(text))
    const next = await buildDashboard({ work: input.work, ...resources, out })
    assert.equal(next.ok, true, next.output)
  }
  await assert.rejects(readdir(join(out, approved.build.hash)), { code: "ENOENT" })
  assert.deepEqual(await finishPublish({ ...input, ...approved }), published)
  assert.deepEqual(await tree(join(input.builds, approved.control.key, approved.build.hash)), expected)
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

test("a different hash in lookup preserves the sample", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  const result = await finishPublish({
    ...input, ...prepared,
    fetch: async () => Response.json({ ...await input.lookup(), hash: "f".repeat(64) }),
  })
  assert.equal(result.status, "failed")
  assert.ok(await readFile(join(input.work, "sample.json")))
})

test("an unusable stand key directory reports failure and retains the sample", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  await writeFile(join(input.builds, prepared.control.key), "occupied")
  const result = await finishPublish({ ...input, ...prepared })
  assert.equal(result.status, "failed")
  assert.ok(await readFile(join(input.work, "sample.json")))
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

test("confirmed publication survives loss of the local work folder", async t => {
  const input = await fixture(t)
  const prepared = await preparePublish(input)
  assert.equal(prepared.ok, true)
  await rm(input.work, { recursive: true })
  const result = await finishPublish({ ...input, ...prepared })
  assert.equal((await input.lookup()).hash, prepared.build.hash)
  assert.equal(await readFile(join(input.builds, prepared.control.key, "current"), "utf8"), prepared.build.hash + "\n")
  assert.equal(result.status, "published")
  assert.ok(result.text.startsWith(published.text))
  assert.match(result.text, /локального образца.*Изменить в чате/)
})

test("the embedded value threshold counts six Unicode code points", () => {
  const short = "🟢".repeat(3)
  const boundary = "🟢".repeat(6)
  assert.deepEqual(embeddedValues({ rows: [[short, boundary]] }, [Buffer.from(boundary)]), [boundary])
})
