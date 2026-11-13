import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { dashboardServer, startDashboard } from "../../src/web/server.ts"

const binding = {
  packagePath: "/user/dashboard/A.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
}
const other = { ...binding, packagePath: "/user/dashboard/B.lgp" }

async function stand(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "dashboard checkout's test-"))
  const server = dashboardServer({
    buildsRoot: join(root, "builds"),
    appOrigin: options.appOrigin ?? "http://dashboards.localhost:32769",
    mode: options.mode ?? "normal",
    maxSnapshots: options.maxSnapshots,
    clientOrigins: ["http://127.0.0.1:32768"],
    ...options,
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

const snapshot = {
  binding, nodeName: "Узел", sample: { schema: [{ name: "count", type: 1 }], rows: [[42]] },
  parameters: [{ name: "MinBudget", value: 0 }], published: false,
}

test("snapshots are returned once by ID without paths or commands", async t => {
  const server = await stand(t)
  const created = await fetch(server.base + "/snapshots", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot),
  })
  assert.equal(created.status, 201)
  const result = await created.json()
  assert.deepEqual(Object.keys(result), ["id"])
  assert.match(result.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  const saved = await server.request("snapshots/" + result.id)
  assert.deepEqual(saved, { id: result.id, created: saved.created, ...snapshot })
  assert.equal(new Date(saved.created).toISOString(), saved.created)
  assert.equal((await fetch(server.base + "/snapshots/" + result.id)).status, 404)
  assert.equal((await fetch(server.base + "/snapshots/00000000-0000-0000-0000-000000000000")).status, 404)
  assert.equal((await fetch(server.base + "/snapshots/not-a-uuid")).status, 404)
})

test("expired snapshots disappear and capacity evicts the oldest snapshot", async t => {
  const short = await stand(t, { ttlMs: 50 })
  const expired = await short.request("snapshots", snapshot)
  await setTimeout(100)
  assert.equal((await fetch(short.base + "/snapshots/" + expired.id)).status, 404)
  const server = await stand(t, { maxSnapshots: 2 })
  const first = await server.request("snapshots", snapshot)
  const second = await server.request("snapshots", snapshot)
  const third = await server.request("snapshots", snapshot)
  assert.equal((await fetch(server.base + "/snapshots/" + first.id)).status, 404)
  assert.equal((await server.request("snapshots/" + second.id)).id, second.id)
  assert.equal((await server.request("snapshots/" + third.id)).id, third.id)
})

test("snapshot creation rejects a foreign Origin and accepts configured or absent Origin", async t => {
  const server = await stand(t)
  for (const [origin, status] of [["http://evil.test", 403], ["http://127.0.0.1:32768", 201], [undefined, 201]]) {
    const response = await fetch(server.base + "/snapshots", {
      method: "POST", body: JSON.stringify(snapshot),
      headers: { "content-type": "application/json", ...(origin && { origin }) },
    })
    assert.equal(response.status, status, String(origin))
  }
})

test("snapshot bodies are limited to 640 KiB and samples to 512 KiB of UTF-8", async t => {
  const server = await stand(t)
  const empty = { schema: [{ name: "v", type: 1 }], rows: [[""]] }
  const sized = bytes => ({ ...empty, rows: [["x".repeat(bytes - Buffer.byteLength(JSON.stringify(empty)))]] })
  const sample = sized(524_289)
  assert.equal(Buffer.byteLength(JSON.stringify(sample)), 524_289)
  const valid = JSON.stringify({ ...snapshot, sample: sized(524_288) })
  for (const body of [
    valid + " ".repeat(655_361 - Buffer.byteLength(valid)),
    JSON.stringify({ ...snapshot, sample }),
    JSON.stringify({ ...snapshot, sample: { schema: snapshot.sample.schema, rows: [["ю".repeat(300_000)]] } }),
  ]) {
    const response = await fetch(server.base + "/snapshots", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    })
    assert.equal(response.status, 400)
  }
  const boundary = sized(524_288)
  assert.equal(Buffer.byteLength(JSON.stringify(boundary)), 524_288)
  assert.equal((await fetch(server.base + "/snapshots", {
    method: "POST", headers: { "content-type": "application/json" }, body: valid + " ".repeat(655_360 - Buffer.byteLength(valid)),
  })).status, 201)
})

test("snapshots validate the complete contract and reject legacy metadata", async t => {
  const server = await stand(t)
  for (const payload of [
    { ...snapshot, sample: { schema: snapshot.sample.schema, rows: Array.from({ length: 101 }, () => [42]) } },
    { ...snapshot, extra: true }, { ...snapshot, binding: { ...binding, extra: true } },
    { ...snapshot, binding: { ...binding, server: "http://localhost:32768" } },
    { ...snapshot, binding: { ...binding, port: 0 } },
    { ...snapshot, binding: { ...binding, packagePath: "relative.lgp" } },
    { ...snapshot, binding: { ...binding, packagePath: "/nul\0.lgp" } },
    { ...snapshot, binding: { ...binding, workflowGuid: "wrong" } },
    { ...snapshot, binding: { ...binding, nodeGuid: "wrong" } },
    { ...snapshot, sample: { schema: snapshot.sample.schema, rows: [[42, 3]] } },
    { ...snapshot, sample: { schema: [{ ...snapshot.sample.schema[0], extra: 1 }], rows: [[42]] } },
    { ...snapshot, parameters: [{ name: "n", value: {}, extra: 1 }] },
    { ...snapshot, sample: null }, { ...snapshot, nodeName: "" }, { ...snapshot, published: "true" },
  ]) {
    assert.equal((await fetch(server.base + "/snapshots", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    })).status, 400, JSON.stringify(payload).slice(0, 120))
  }
  assert.equal((await fetch(server.base + "/snapshots", {
    method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(snapshot),
  })).status, 400)
  assert.ok((await server.request("snapshots", {
    ...snapshot, sample: { schema: snapshot.sample.schema, rows: Array.from({ length: 100 }, () => [42]) },
  })).id)
})

test("lookup uses the three-field binding key and advertises the CLI button", async t => {
  const roi = { ...binding, packagePath: "/user/dashboard-roi/campaign.lgp" }
  const expected = createHash("sha256").update(JSON.stringify([
    roi.packagePath, roi.workflowGuid, roi.nodeGuid,
  ])).digest("hex")
  const server = await stand(t)
  const result = await server.request("lookup", roi)
  assert.equal(result.key, expected)
  assert.equal(result.cliButton, false)
  assert.equal((await server.request("lookup", {
    ...roi, workflowGuid: roi.workflowGuid.toUpperCase(), nodeGuid: roi.nodeGuid.toUpperCase(),
  })).key, expected)
  const enabled = await stand(t, { cliButton: true })
  assert.equal((await enabled.request("lookup", roi)).cliButton, true)
  for (const payload of [{ ...roi, server: "http://localhost:32768" }, { ...roi, port: 0 }, {}, { ...roi, nodeGuid: "x" }]) {
    assert.equal((await fetch(server.base + "/lookup", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    })).status, 400)
  }
  const { bindingKey } = await import("../../src/web/server.ts")
  assert.equal(await bindingKey(roi), expected)
})

test("legacy targets and current routes stay unavailable", async t => {
  const server = await stand(t)
  for (const [path, method] of [["targets", "POST"], ["targets/00000000-0000-0000-0000-000000000000", "GET"], ["current", "GET"]]) {
    assert.equal((await fetch(server.base + "/" + path, { method })).status, 404)
  }
})

test("the snapshot service listens on loopback unless the stand opts in", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-listen-"))
  const base = {
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

