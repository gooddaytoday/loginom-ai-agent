import assert from "node:assert/strict"
import { once } from "node:events"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { request } from "node:http"
import { networkInterfaces, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { dashboardServer, startDashboard } from "../../src/web/server.ts"

const binding = {
  server: "http://127.0.0.1:32768",
  packagePath: "/user/dashboard/A.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
  port: 0,
}
const other = { ...binding, packagePath: "/user/dashboard/B.lgp" }

async function stand(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "dashboard checkout's test-"))
  const server = dashboardServer({
    projectRoot: root,
    buildsRoot: join(root, "builds"),
    appOrigin: options.appOrigin ?? "http://dashboards.localhost:32769",
    mode: options.mode ?? "normal",
    maxSnapshots: options.maxSnapshots,
    allowCurrent: options.allowCurrent,
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
  return { base, request, projectRoot: root, buildsRoot: join(root, "builds") }
}

test("published dashboard keeps its metadata private", async t => {
  const server = await stand(t)
  const app = await server.request("lookup", binding)
  const dir = join(server.buildsRoot, app.key, "b".repeat(64))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "index.html"), "<p>dashboard</p>")
  await writeFile(join(dir, "binding.json"), JSON.stringify(binding))
  await writeFile(join(dir, "sample.json"), JSON.stringify({ schema: [{ name: "budget", type: "number" }], rows: [[500]] }))
  const page = await fetch(`${server.base}/apps/${app.key}/`)
  assert.equal(page.status, 404)
  assert.equal((await page.text()).includes(binding.packagePath), false)
  const sample = await fetch(`${server.base}/apps/${app.key}/sample.json`)
  assert.equal(sample.status, 404)
  assert.equal((await sample.text()).includes("budget"), false)
})

test("dashboard accepts only configured hosts", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-hosts-"))
  const started = startDashboard({
    DASHBOARD_PROJECT_ROOT: root,
    DASHBOARD_BUILDS: join(root, "builds"),
    DASHBOARD_PORT: "0",
    DASHBOARD_APP_PORT: "0",
    DASHBOARD_CLIENT_ORIGINS: "http://Example.test:32768, http://localhost:32768",
  })
  t.after(async () => {
    await Promise.all([started.api, started.apps].map(server => new Promise(resolve => server.close(resolve))))
    await rm(root, { recursive: true, force: true })
  })
  await Promise.all([once(started.api, "listening"), once(started.apps, "listening")])
  const status = (host, path = "/dashboard/current", method = "GET") => new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: started.api.address().port, path, method, headers: { host } }, response => {
      response.resume()
      resolve(response.statusCode)
    })
    req.on("error", reject)
    req.end()
  })
  assert.equal(await status("eXAMPLE.TEST:32768"), 404)
  assert.equal(await status("LOCALHOST:32768"), 404)
  assert.equal(await status("evil.test:32768"), 403)
  assert.equal(await status("example.test:32769"), 403)
  assert.equal(await status("example.test"), 403)
  assert.equal(await status(`127.0.0.1:${started.api.address().port}`), 403)
  assert.equal(await status("evil.test:32768", "/dashboard/targets", "POST"), 403)
})

test("startup returns a canonical app origin when the configured host uses uppercase", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-origin-"))
  const started = startDashboard({
    DASHBOARD_PROJECT_ROOT: root,
    DASHBOARD_BUILDS: join(root, "builds"),
    DASHBOARD_PORT: "0",
    DASHBOARD_APP_PORT: "0",
    DASHBOARD_APP_ORIGIN: "http://DASHBOARDS.LOCALHOST:32769",
  })
  t.after(async () => {
    await Promise.all([started.api, started.apps].map(server => new Promise(resolve => server.close(resolve))))
    await rm(root, { recursive: true, force: true })
  })
  await Promise.all([once(started.api, "listening"), once(started.apps, "listening")])
  const response = await fetch(`http://127.0.0.1:${started.api.address().port}/dashboard/lookup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(binding),
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).appOrigin, "http://dashboards.localhost:32769")
})

test("startup rejects an unknown mode and an origin with a path", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-startup-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const base = {
    DASHBOARD_PROJECT_ROOT: root,
    DASHBOARD_BUILDS: join(root, "builds"),
    DASHBOARD_PORT: "0",
    DASHBOARD_APP_PORT: "0",
  }
  assert.throws(() => startDashboard({ ...base, DASHBOARD_MODE: "fast" }))
  assert.throws(() => startDashboard({ ...base, DASHBOARD_APP_ORIGIN: "http://dashboards.localhost:32769/path" }))
  assert.throws(() => startDashboard({ ...base, DASHBOARD_CLIENT_ORIGINS: "http://127.0.0.1:32768/studio" }))
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

test("lookup reports the current build hash, app origin and mode", async t => {
  const server = await stand(t)
  const missing = await server.request("lookup", binding)
  assert.deepEqual(
    { exists: missing.exists, hash: missing.hash, appOrigin: missing.appOrigin, mode: missing.mode },
    { exists: false, hash: null, appOrigin: "http://dashboards.localhost:32769", mode: "normal" },
  )
  assert.equal(missing.exists, missing.hash !== null)
  const hash = "b".repeat(64)
  await mkdir(join(server.buildsRoot, missing.key), { recursive: true })
  await writeFile(join(server.buildsRoot, missing.key, "current"), hash + "\n")
  const published = await server.request("lookup", binding)
  assert.equal(published.exists, true)
  assert.equal(published.hash, hash)
  assert.equal(published.exists, published.hash !== null)
  await writeFile(join(server.buildsRoot, missing.key, "current"), "not-a-build\n")
  const garbage = await server.request("lookup", binding)
  assert.equal(garbage.hash, null)
  assert.equal(garbage.exists, false)
  const strict = await stand(t, { mode: "strict", appOrigin: "https://dashboards.example:8443" })
  const strictLookup = await strict.request("lookup", binding)
  assert.equal(strictLookup.mode, "strict")
  assert.equal(strictLookup.appOrigin, "https://dashboards.example:8443")
  assert.equal(strictLookup.hash, null)
  assert.equal(strictLookup.exists, false)
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
  assert.deepEqual(await request("targets/" + a.id), a)
  const b = await request("targets", {...data, binding: other, rows: [[245]]})
  assert.notEqual(a.id, b.id)
  assert.notEqual(a.sourceDir, b.sourceDir)
  assert.deepEqual(a.binding, binding)
  assert.deepEqual(a.rows, data.rows)
  assert.match(a.adapter, /onState/)
  assert.doesNotMatch(a.adapter, /frameElement/)
  assert.equal(a.sourceDir, join(server.projectRoot, "dashboard/apps", a.key))
  const script = join(server.projectRoot, "packages/dashboard/script/publish.mjs").replaceAll("'", "'\\''")
  assert.deepEqual(a.commands, {
    init: `node '${script}' ${a.id} --init`,
    typecheck: "npm run typecheck",
    build: "npm run build",
    publish: `node '${script}' ${a.id}`,
  })
  assert.deepEqual(await request("targets/" + a.id), a)
  assert.equal((await fetch(server.base + "/current")).status, 404)

  // A fresh session has no live result; the example is scoped to the published binding.
  await mkdir(join(server.buildsRoot, a.key), { recursive: true })
  await writeFile(join(server.buildsRoot, a.key, "binding.json"), JSON.stringify(binding))
  await writeFile(join(server.buildsRoot, a.key, "sample.json"), JSON.stringify({ schema: data.schema, rows: data.rows }))
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
  await writeFile(join(server.buildsRoot, a.key, "sample.json"), JSON.stringify({ schema: data.schema, rows: [[999]] }))
  await assert.rejects(request("targets", { ...data, sample: 42 }), /returned 400/)
  await assert.rejects(request("targets", { ...data, sample: {} }), /returned 400/)
  await writeFile(join(server.buildsRoot, a.key, "binding.json"), JSON.stringify(other))
  await assert.rejects(request("targets", { ...data, sample: null }), /returned 400/)
  assert.deepEqual(await request("targets/" + fresh.id), fresh)
  assert.deepEqual(await request("targets/" + a.id), a)
})

test("the snapshot service listens on loopback unless the stand opts in", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-listen-"))
  const base = {
    DASHBOARD_PROJECT_ROOT: root,
    DASHBOARD_BUILDS: join(root, "builds"),
    DASHBOARD_PORT: "0",
    DASHBOARD_APP_PORT: "0",
  }
  const loopback = startDashboard(base)
  const open = startDashboard({ ...base, DASHBOARD_HOST: "0.0.0.0" })
  t.after(async () => {
    await Promise.all([loopback.api, loopback.apps, open.api, open.apps].map(server => new Promise(resolve => server.close(resolve))))
    await rm(root, { recursive: true, force: true })
  })
  await Promise.all([
    once(loopback.api, "listening"), once(loopback.apps, "listening"),
    once(open.api, "listening"), once(open.apps, "listening"),
  ])
  assert.equal(loopback.api.address().address, "127.0.0.1")
  assert.equal(loopback.apps.address().address, "127.0.0.1")
  assert.equal(open.api.address().address, "0.0.0.0")
  assert.equal(open.apps.address().address, "0.0.0.0")
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
  assert.equal((await fetch(server.base + "/current")).status, 404)
})

test("current is explicit local debugging through startDashboard", async t => {
  for (const connection of [
    { name: "IPv4", host: "127.0.0.1", client: "127.0.0.1", peer: "127.0.0.1", flag: "1", status: 200 },
    { name: "IPv6", host: "::", client: "[::1]", peer: "::1", flag: "1", status: 200 },
    { name: "mapped IPv4", host: "::", client: "127.0.0.1", peer: "::ffff:127.0.0.1", flag: "1", status: 200 },
    { name: "only the literal 1 enables debugging", host: "127.0.0.1", client: "127.0.0.1", peer: "127.0.0.1", flag: "true", status: 404 },
  ]) await t.test(connection.name, async t => {
    const root = await mkdtemp(join(tmpdir(), "dashboard-current-"))
    const started = startDashboard({
      DASHBOARD_PROJECT_ROOT: root, DASHBOARD_BUILDS: join(root, "builds"),
      DASHBOARD_PORT: "0", DASHBOARD_APP_PORT: "0", DASHBOARD_HOST: connection.host, DASHBOARD_ALLOW_CURRENT: connection.flag,
    })
    t.after(async () => {
      await Promise.all([started.api, started.apps].map(server => new Promise(resolve => server.close(resolve))))
      await rm(root, { recursive: true, force: true })
    })
    await Promise.all([once(started.api, "listening"), once(started.apps, "listening")])
    const peers = []
    started.api.on("request", request => peers.push(request.socket.remoteAddress))
    const base = `http://${connection.client}:${started.api.address().port}/dashboard`
    const created = await fetch(base + "/targets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ binding, nodeName: "Synthetic debug target", sample: null, parameters: [] }),
    })
    assert.equal(created.status, 201)
    const target = await created.json()
    const current = await fetch(base + "/current")
    assert.equal(current.status, connection.status)
    if (current.ok) assert.equal((await current.json()).id, target.id)
    assert.deepEqual(peers, [connection.peer, connection.peer])
  })
})

test("debug current rejects a non-loopback TCP peer despite forwarded headers", async t => {
  const address = Object.values(networkInterfaces()).flat().find(ip => ip.family === "IPv4" && !ip.internal)?.address
  if (!address) return t.skip("No non-loopback IPv4 interface; verify this case on the dev stand")
  const root = await mkdtemp(join(tmpdir(), "dashboard-current-network-"))
  const started = startDashboard({
    DASHBOARD_PROJECT_ROOT: root, DASHBOARD_BUILDS: join(root, "builds"),
    DASHBOARD_PORT: "0", DASHBOARD_APP_PORT: "0", DASHBOARD_HOST: "0.0.0.0", DASHBOARD_ALLOW_CURRENT: "1",
  })
  t.after(async () => {
    await Promise.all([started.api, started.apps].map(server => new Promise(resolve => server.close(resolve))))
    await rm(root, { recursive: true, force: true })
  })
  await Promise.all([once(started.api, "listening"), once(started.apps, "listening")])
  const peers = []
  started.api.on("request", request => peers.push(request.socket.remoteAddress))
  const base = `http://${address}:${started.api.address().port}/dashboard`
  const headers = {
    host: `127.0.0.1:${started.api.address().port}`, "content-type": "application/json",
    "x-forwarded-for": "127.0.0.1", "x-real-ip": "::1", forwarded: 'for="[::1]"',
  }
  const send = (path, data) => new Promise((resolve, reject) => {
    const req = request(base + path, { method: data ? "POST" : "GET", headers }, response => {
      const chunks = []
      response.on("data", chunk => chunks.push(chunk))
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks)) }))
    })
    req.on("error", reject)
    req.end(data && JSON.stringify(data))
  })
  const created = await send("/targets", { binding, nodeName: "Synthetic network target", sample: null, parameters: [] })
  assert.equal(created.status, 201)
  const byID = await send("/targets/" + created.data.id)
  assert.equal(byID.status, 200)
  assert.equal(byID.data.id, created.data.id)
  assert.equal((await send("/current")).status, 404)
  assert.deepEqual(peers, [address, address, address])
})

test("M0 application keys normalize GUID case and preserve the package path", async t => {
  const server = await stand(t)
  // SHA-256 of the M0 JSON tuple [server, packagePath, lowercase workflow/node GUIDs, 0].
  const expected = "c6942c09050b00fa713cd36efa108198ae1e5a58a8fea55962212b3f52b0effb"
  assert.equal((await server.request("lookup", binding)).key, expected)
  assert.equal((await server.request("lookup", {
    ...binding, workflowGuid: binding.workflowGuid.toUpperCase(), nodeGuid: binding.nodeGuid.toUpperCase(),
  })).key, expected)
  assert.notEqual((await server.request("lookup", { ...binding, packagePath: binding.packagePath.toLowerCase() })).key, expected)
  assert.notEqual((await server.request("lookup", { ...binding, server: "http://localhost:32768" })).key, expected)
  await assert.rejects(server.request("lookup", { ...binding, port: 1 }), /returned 400/)
})

test("lookup leaves current unchanged and default retention evicts only the oldest of 101 snapshots", async t => {
  const server = await stand(t, { allowCurrent: true })
  const data = { binding, nodeName: "Retained target", schema: [{ name: "n", type: 1 }], parameters: [] }
  const first = await server.request("targets", { ...data, rows: [[0]] })
  await server.request("lookup", other)
  assert.deepEqual(await server.request("current"), first)
  const snapshots = [first]
  for (let i = 1; i < 100; i++) snapshots.push(await server.request("targets", { ...data, binding: other, rows: [[i]] }))
  assert.deepEqual(await server.request("targets/" + first.id), first)
  assert.deepEqual(await server.request("current"), snapshots[99])
  const last = await server.request("targets", { ...data, rows: [[100]] })
  assert.equal((await fetch(server.base + "/targets/" + first.id)).status, 404)
  for (const snapshot of snapshots.slice(1)) assert.deepEqual(await server.request("targets/" + snapshot.id), snapshot)
  assert.deepEqual(await server.request("targets/" + last.id), last)
  await server.request("lookup", other)
  assert.deepEqual(await server.request("current"), last)
})

test("sample replaces legacy schema and rows while omitted sample retains their meaning", async t => {
  const server = await stand(t)
  const legacy = { schema: [{ name: "legacy", type: "number" }], rows: [[12]] }
  const sample = { schema: [{ name: "sample", type: 3 }], rows: [[34]] }
  const data = { binding, nodeName: "Payload compatibility", parameters: [] }
  const top = await server.request("targets", { ...data, ...legacy })
  assert.deepEqual({ schema: top.schema, rows: top.rows, tableSource: top.tableSource }, { ...legacy, tableSource: "live" })
  const nested = await server.request("targets", { ...data, sample })
  assert.deepEqual({ schema: nested.schema, rows: nested.rows, tableSource: nested.tableSource }, { ...sample, tableSource: "live" })
  const both = await server.request("targets", { ...data, ...legacy, sample })
  assert.deepEqual({ schema: both.schema, rows: both.rows }, sample)
  const ignoredLegacy = await server.request("targets", { ...data, schema: "invalid ignored legacy", rows: null, sample })
  assert.deepEqual({ schema: ignoredLegacy.schema, rows: ignoredLegacy.rows }, sample)
  const absent = await server.request("targets", { ...data, ...legacy, sample: null })
  assert.equal(absent.tableSource, "unavailable")
  assert.deepEqual(absent.schema, [])
  assert.deepEqual(absent.rows, [])
})

test("known fields are validated while unknown nested metadata survives the snapshot", async t => {
  const server = await stand(t)
  const data = {
    binding: { ...binding, extra: { label: "binding extension" } }, nodeName: "Metadata",
    schema: [{ name: "budget", type: 3, extra: { unit: "RUB" } }], rows: [[500]],
    parameters: [{ name: "MinBudget", value: 0, extra: { precision: 2 } }],
    extra: { ignored: true },
  }
  const target = await server.request("targets", data)
  assert.deepEqual(target.binding, data.binding)
  assert.deepEqual(target.schema, data.schema)
  assert.deepEqual(target.parameters, data.parameters)
  assert.equal(Object.hasOwn(target, "extra"), false)
  assert.deepEqual(await server.request("targets/" + target.id), target)
  for (const invalid of [
    { nodeName: 42 }, { binding: { ...binding, port: "0" } },
    { schema: [{ name: 42, type: 3 }] }, { schema: [{ name: "budget", type: {} }] },
    { rows: [[500, 600]] }, { rows: [[{}]] }, { parameters: [{ name: 42, value: 0 }] },
    { parameters: [{ name: "MinBudget", value: {} }] },
  ]) await assert.rejects(server.request("targets", { ...data, ...invalid }), /returned 400/)
})

test("source startup derives the checkout independently of the working directory", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-source-root-"))
  const started = startDashboard({ DASHBOARD_BUILDS: root, DASHBOARD_PORT: "0", DASHBOARD_APP_PORT: "0" })
  t.after(async () => {
    await Promise.all([started.api, started.apps].map(server => new Promise(resolve => server.close(resolve))))
    await rm(root, { recursive: true, force: true })
  })
  await Promise.all([once(started.api, "listening"), once(started.apps, "listening")])
  const response = await fetch(`http://127.0.0.1:${started.api.address().port}/dashboard/targets`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ binding, nodeName: "Source checkout", sample: null, parameters: [] }),
  })
  assert.equal(response.status, 201)
  const target = await response.json()
  const checkout = resolve(import.meta.dirname, "../../../..")
  assert.equal(target.sourceDir, join(checkout, "dashboard/apps", target.key))
  await access(join(checkout, "packages/dashboard/script/publish.mjs"))
  assert.equal(target.commands.publish, `node '${join(checkout, "packages/dashboard/script/publish.mjs")}' ${target.id}`)
})

test("invalid lookup bindings keep M0 error responses", async t => {
  const server = await stand(t)
  for (const payload of [{}, null, [], 42, { ...binding, port: "0" }, { ...binding, nodeGuid: "wrong" }]) {
    const response = await fetch(server.base + "/lookup", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: "Invalid Loginom binding" })
  }
})

test("invalid HTTP JSON keeps the native M0 parser message", async t => {
  const server = await stand(t)
  for (const [body, error] of [
    ["{", "Expected property name or '}' in JSON at position 1 (line 1 column 2)"],
    ["", "Unexpected end of JSON input"],
  ]) for (const path of ["lookup", "targets"]) {
    const response = await fetch(server.base + "/" + path, {
      method: "POST", headers: { "content-type": "application/json" }, body,
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error })
  }
})

test("invalid target fields keep M0 binding and table error precedence", async t => {
  const server = await stand(t)
  const data = { binding, nodeName: "Errors", sample: { schema: [{ name: "n", type: 3 }], rows: [[1]] }, parameters: [] }
  for (const [fields, error] of [
    [{ binding: undefined }, "Invalid Loginom binding"],
    [{ binding: {} }, "Invalid Loginom binding"],
    [{ binding: { ...binding, port: "0" }, parameters: null }, "Invalid Loginom binding"],
    [{ nodeName: "" }, "Invalid node, table or parameters"],
    [{ nodeName: 42 }, "Invalid node, table or parameters"],
    [{ sample: 42 }, "Invalid node, table or parameters"],
    [{ sample: {} }, "Invalid node, table or parameters"],
    [{ sample: undefined, schema: [], rows: [[1]] }, "Invalid node, table or parameters"],
    [{ parameters: null }, "Invalid node, table or parameters"],
    [{ parameters: [{ name: 42, value: 0 }] }, "Invalid node, table or parameters"],
    [{ parameters: [{ name: "n", value: {} }] }, "Invalid node, table or parameters"],
  ]) {
    const response = await fetch(server.base + "/targets", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, ...fields }),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error })
  }
})

test("published example errors keep M0 parser messages and precedence", async t => {
  const server = await stand(t)
  const { key } = await server.request("lookup", binding)
  const dir = join(server.buildsRoot, key)
  await mkdir(dir, { recursive: true })
  const sample = { schema: [{ name: "n", type: 3 }], rows: [[1]] }
  const syntax = "Expected property name or '}' in JSON at position 1 (line 1 column 2)"
  for (const [savedBinding, savedSample, fields, error] of [
    ["{", JSON.stringify(sample), {}, syntax],
    [JSON.stringify({}), JSON.stringify(sample), {}, "Invalid Loginom binding"],
    [JSON.stringify(other), JSON.stringify(sample), { nodeName: "", parameters: null }, "Published example binding differs"],
    [JSON.stringify(binding), "{", {}, syntax],
    [JSON.stringify(binding), "{", { nodeName: "", parameters: null }, syntax],
    [JSON.stringify(binding), JSON.stringify({}), {}, "Invalid node, table or parameters"],
  ]) {
    await writeFile(join(dir, "binding.json"), savedBinding)
    await writeFile(join(dir, "sample.json"), savedSample)
    const response = await fetch(server.base + "/targets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ binding, nodeName: "Saved errors", sample: null, parameters: [], ...fields }),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error })
  }
})
