import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { dashboardServer, startDashboard } from "./server.mjs"

const binding = {
  server: "http://127.0.0.1:32768",
  packagePath: "/user/dashboard/A.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
  port: 0,
}
const other = { ...binding, packagePath: "/user/dashboard/B.lgp" }

async function stand(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-test-"))
  const server = dashboardServer({
    projectRoot: root,
    publishRoot: join(root, "published"),
    maxSnapshots: options.maxSnapshots,
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${server.address().port}/dashboard`
  const request = async (path, body) => {
    const options = body && {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)}
    const response = await fetch(`${base}/${path}`, options)
    assert.ok(response.ok, `${path} returned ${response.status}`)
    return response.json()
  }
  return { base, request, publishRoot: join(root, "published") }
}

test("published dashboard keeps its metadata private", async t => {
  const server = await stand(t)
  const app = await server.request("lookup", binding)
  const version = join(server.publishRoot, ".versions", "example")
  await mkdir(join(version, "assets"), { recursive: true })
  await writeFile(join(version, "index.html"), '<script src="./assets/app.js"></script>')
  await writeFile(join(version, "assets/app.js"), 'console.log("dashboard")')
  await writeFile(join(version, "binding.json"), JSON.stringify(binding))
  await writeFile(join(version, "sample.json"), JSON.stringify({ schema: [{ name: "budget", type: "number" }], rows: [[500]] }))
  await symlink(version, join(server.publishRoot, app.key), "dir")
  assert.equal((await server.request("lookup", binding)).exists, true)
  const base = `${server.base}/apps/${app.key}/`
  const page = await fetch(base)
  assert.equal(page.status, 200)
  assert.equal(await page.text(), '<script src="./assets/app.js"></script>')
  const script = await fetch(base + "assets/app.js")
  assert.equal(script.status, 200)
  assert.equal(await script.text(), 'console.log("dashboard")')
  for (const name of ["binding.json", "sample.json"]) {
    await symlink(join(version, name), join(version, "assets", name + ".alias"))
    const response = await fetch(base + name)
    assert.equal(response.status, 404)
    const alias = await fetch(base + "assets/" + name + ".alias")
    assert.equal(alias.status, 404)
  }
})

test("a package path separates applications even when node GUIDs match", async t => {
  const server = await stand(t)
  const request = server.request
  const a = await request("lookup", binding)
  const b = await request("lookup", other)
  assert.notEqual(a.key, b.key)
  assert.deepEqual(await request("lookup", binding), a)
  assert.equal(a.exists, false)
})

test("the first snapshot stays available by ID after opening another node", async t => {
  const server = await stand(t)
  const request = server.request
  const data = {
    binding, nodeName: "По убыванию ROI", schema: [{name: "budget", type: 3}], rows: [[500]],
    parameters: [{name: "MinBudget", value: 0}],
  }
  const a = await request("targets", data)
  await request("lookup", other)
  assert.deepEqual(await request("current"), a)
  const b = await request("targets", {...data, binding: other, rows: [[245]]})
  assert.notEqual(a.id, b.id)
  assert.notEqual(a.sourceDir, b.sourceDir)
  assert.deepEqual(a.binding, binding)
  assert.deepEqual(a.rows, data.rows)
  assert.deepEqual(await request("targets/" + a.id), a)
  assert.deepEqual(await request("current"), b)

  // A fresh session has no live result; the example is scoped to the published binding.
  await mkdir(join(server.publishRoot, a.key), { recursive: true })
  await writeFile(join(server.publishRoot, a.key, "binding.json"), JSON.stringify(binding))
  await writeFile(join(server.publishRoot, a.key, "sample.json"), JSON.stringify({ schema: data.schema, rows: data.rows }))
  const fresh = await request("targets", { ...data, schema: [], rows: [], sample: null })
  assert.deepEqual(fresh.schema, data.schema)
  assert.deepEqual(fresh.rows, data.rows)
  assert.equal(fresh.tableSource, "published-example")
  const afterError = await request("targets", { ...data, sample: null })
  assert.equal(afterError.tableSource, "published-example")
  assert.deepEqual(afterError.rows, data.rows)
  const empty = await request("targets", { ...data, sample: { schema: data.schema, rows: [] } })
  assert.equal(empty.tableSource, "live")
  assert.deepEqual(empty.rows, [])
  const absent = await request("targets", { ...data, binding: other, schema: [], rows: [], sample: null })
  assert.equal(absent.tableSource, "unavailable")
  assert.deepEqual(absent.schema, [])
  assert.deepEqual(absent.rows, [])
  await writeFile(join(server.publishRoot, a.key, "sample.json"), JSON.stringify({ schema: data.schema, rows: [[999]] }))
  await assert.rejects(request("targets", { ...data, sample: 42 }), /returned 400/)
  await assert.rejects(request("targets", { ...data, sample: {} }), /returned 400/)
  await writeFile(join(server.publishRoot, a.key, "binding.json"), JSON.stringify(other))
  await assert.rejects(request("targets", { ...data, sample: null }), /returned 400/)
  assert.deepEqual(await request("targets/" + fresh.id), fresh)
  assert.deepEqual(await request("targets/" + a.id), a)
})

test("the snapshot service listens on loopback unless the stand opts in", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-listen-"))
  const base = {
    DASHBOARD_PROJECT_ROOT: root,
    DASHBOARD_PUBLISH_ROOT: join(root, "published"),
    DASHBOARD_PORT: "0",
  }
  const loopback = startDashboard(base)
  const open = startDashboard({ ...base, DASHBOARD_HOST: "0.0.0.0" })
  t.after(async () => {
    await Promise.all([loopback, open].map(server => new Promise(resolve => server.close(resolve))))
    await rm(root, { recursive: true, force: true })
  })
  await Promise.all([once(loopback, "listening"), once(open, "listening")])
  assert.equal(loopback.address().address, "127.0.0.1")
  assert.equal(open.address().address, "0.0.0.0")
})

test("only the newest snapshots stay available", async t => {
  const server = await stand(t, { maxSnapshots: 2 })
  const request = server.request
  const data = {
    binding, nodeName: "По убыванию ROI", schema: [{name: "budget", type: 3}], rows: [[500]],
    parameters: [{name: "MinBudget", value: 0}],
  }
  const first = await request("targets", data)
  const second = await request("targets", data)
  const third = await request("targets", data)
  await assert.rejects(request("targets/" + first.id), /returned 404/)
  assert.deepEqual(await request("targets/" + second.id), second)
  assert.deepEqual(await request("targets/" + third.id), third)
  assert.deepEqual(await request("current"), third)
})
