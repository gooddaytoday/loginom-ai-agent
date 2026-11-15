import { execFileSync } from "node:child_process"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { request } from "node:http"
import { createServer } from "node:https"
import { connect } from "node:tls"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { createEventLog } from "../../src/log.ts"
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
    shell: new Uint8Array(),
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

test("health and installed shell respect Host", async t => {
  const installedShell = "console.log('installed shell')\n"
  const lines = []
  const events = createEventLog("web", line => lines.push(JSON.parse(line)))
  const server = await stand(t, { shell: Buffer.from(installedShell), events })
  const foreignStatus = path => new Promise((resolve, reject) => {
    const req = request(server.base + path, { headers: { host: "foreign.test" } }, response => {
      response.resume()
      resolve(response.statusCode)
    })
    req.on("error", reject)
    req.end()
  })
  const foreignHost = { status: await foreignStatus("/health") }
  assert.equal(foreignHost.status, 403)
  const health = await fetch(server.base + "/health")
  assert.deepEqual(await health.json(), { ok: true })
  assert.equal(health.headers.get("cache-control"), "no-store")
  const deliveredShell = await fetch(server.base + "/shell.js")
  assert.equal(await deliveredShell.text(), installedShell)
  assert.equal(deliveredShell.headers.get("content-type"), "text/javascript; charset=utf-8")
  assert.equal(deliveredShell.headers.get("cache-control"), "no-store")
  assert.equal(await foreignStatus("/shell.js"), 403)
  assert.equal((await fetch(server.base + "/health/extra")).status, 404)
  assert.equal((await fetch(server.base + "/shell.js", { method: "POST" })).status, 404)
  assert.deepEqual(lines.map(({ event, code }) => [event, code]), Array(2).fill(["request_rejected", "host"]))
})

test("TLS bytes reach the configured Apache", async t => {
  const { tlsForwarder } = await import("../../src/web/tls.ts")
  const root = await mkdtemp(join(tmpdir(), "dashboard-tls-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
    "-keyout", join(root, "key.pem"), "-out", join(root, "cert.pem")], { stdio: "ignore" })
  const expectedBytes = Buffer.from([0, 255, 17, 42, 13, 10])
  let received
  const upstream = createServer({ key: await readFile(join(root, "key.pem")), cert: await readFile(join(root, "cert.pem")) }, async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    received = Buffer.concat(chunks)
    response.writeHead(200, { connection: "close" })
    response.end("received")
  }).listen(0, "127.0.0.1")
  await once(upstream, "listening")
  t.after(() => new Promise(resolve => upstream.close(resolve)))
  const forwarder = tlsForwarder({ host: "127.0.0.1", port: upstream.address().port }).listen(0, "127.0.0.1")
  await once(forwarder, "listening")
  t.after(() => new Promise(resolve => forwarder.close(resolve)))
  const client = connect({ host: "127.0.0.1", port: forwarder.address().port, servername: "localhost", ca: await readFile(join(root, "cert.pem")) })
  t.after(() => client.destroy())
  const response = []
  client.on("data", chunk => response.push(chunk))
  const ended = once(client, "end")
  await once(client, "secureConnect")
  assert.equal(client.authorized, true)
  client.write(`POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${expectedBytes.length}\r\nConnection: close\r\n\r\n`)
  client.write(expectedBytes)
  await ended
  assert.deepEqual(received, expectedBytes)
  assert.match(Buffer.concat(response).toString(), /200 OK/)
})

test("HTTPS configuration refuses a missing or invalid upstream before listening", () => {
  const base = { DASHBOARD_APP_ORIGIN: "https://apps.test:8101", DASHBOARD_PORT: "0", DASHBOARD_APP_PORT: "0" }
  assert.throws(() => startDashboard(base, new Uint8Array()), /DASHBOARD_TLS_UPSTREAM/)
  for (const upstream of ["studio", "studio:0", "studio:65536", "https://studio:8444", "user:pass@studio:8444", "studio:8444/path"]) {
    assert.throws(() => startDashboard({ ...base, DASHBOARD_TLS_UPSTREAM: upstream }, new Uint8Array()), /DASHBOARD_TLS_UPSTREAM/)
  }
})

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
  }, new Uint8Array())
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
  }, new Uint8Array())
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
  assert.throws(() => startDashboard({ ...base, DASHBOARD_MODE: "fast" }, new Uint8Array()))
  assert.throws(() => startDashboard({ ...base, DASHBOARD_APP_ORIGIN: "http://dashboards.localhost:32769/path" }, new Uint8Array()))
  assert.throws(() => startDashboard({ ...base, DASHBOARD_CLIENT_ORIGINS: "http://127.0.0.1:32768/studio" }, new Uint8Array()))
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
  await writeFile(join(server.buildsRoot, "state.json"), JSON.stringify({ [`${binding.packagePath}.dashboards/${binding.nodeGuid}/20261115T120000Z.json`]: { key: missing.key, sourceHash: "a".repeat(64), status: "ready", buildHash: hash } }))
  const published = await server.request("lookup", binding)
  assert.equal(published.exists, true)
  assert.equal(published.hash, hash)
  assert.equal(published.exists, published.hash !== null)
  await writeFile(join(server.buildsRoot, "state.json"), "{}")
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
  const lines = []
  const events = createEventLog("web", line => lines.push(line))
  const server = await stand(t, { events })
  for (const [origin, status] of [["http://foreign.invalid", 403], ["http://127.0.0.1:32768", 201], [undefined, 201]]) {
    const response = await fetch(server.base + "/snapshots", {
      method: "POST", body: JSON.stringify(snapshot),
      headers: { "content-type": "application/json", ...(origin && { origin }) },
    })
    assert.equal(response.status, status, String(origin))
  }
  const { timestamp, ...event } = JSON.parse(lines[0])
  assert.deepEqual(event, { role: "web", event: "request_rejected", code: "origin" })
  assert.equal(lines.length, 1)
})

test("API body and schema failures use bounded reasons without echoing request data", async t => {
  const lines = []
  const events = createEventLog("web", line => lines.push(line))
  const server = await stand(t, { events })
  const marker = "synthetic-json-value"
  for (const [path, body, reason] of [
    ["snapshots", marker, "body"], ["lookup", JSON.stringify({ invalid: marker }), "schema"],
  ]) {
    const response = await fetch(`${server.base}/${path}?fixture=${marker}`, {
      method: "POST", headers: { "content-type": "application/json", cookie: marker }, body,
    })
    assert.equal(response.status, 400)
    assert.equal((await response.text()).includes(marker), false)
    const { timestamp, ...event } = JSON.parse(lines.at(-1))
    assert.deepEqual(event, { role: "web", event: "request_rejected", code: reason })
  }
  assert.equal(lines.length, 2)
})

test("unreadable persisted lookup state returns a safe 500 and internal event", async t => {
  const lines = []
  const events = createEventLog("web", line => lines.push(line))
  const server = await stand(t, { events })
  await mkdir(server.buildsRoot, { recursive: true })
  await writeFile(join(server.buildsRoot, "state.json"), "synthetic-invalid-state")
  const response = await fetch(server.base + "/lookup", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(binding),
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Could not serve dashboard" })
  assert.equal(lines.length, 1)
  const { timestamp, ...event } = JSON.parse(lines[0])
  assert.deepEqual(event, { role: "web", event: "request_failed", code: "internal" })
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
  const loopback = startDashboard(base, new Uint8Array())
  const open = startDashboard({ ...base, DASHBOARD_HOST: "0.0.0.0" }, new Uint8Array())
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


test("lookup separates own ready A from newer current B and forgets a deleted file", async t => {
  const server = await stand(t)
  const { key } = await server.request("lookup", binding)
  const a = "20261115T120000Z.json", b = "20261115T120001Z.json"
  const folder = `${binding.packagePath}.dashboards/${binding.nodeGuid}/`
  await mkdir(server.buildsRoot, { recursive: true })
  const state = {
    [folder + a]: { key, sourceHash: "a".repeat(64), status: "ready", buildHash: "c".repeat(64) },
    [folder + b]: { key, sourceHash: "b".repeat(64), status: "ready", buildHash: "d".repeat(64) },
  }
  await writeFile(join(server.buildsRoot, "state.json"), JSON.stringify(state))
  const result = await server.request("lookup", { ...binding, publication: a })
  assert.equal(result.publication.name, a)
  assert.equal(result.publication.buildHash, "c".repeat(64))
  assert.equal(result.currentVersion.name, b)
  assert.equal(result.latest.name, b)
  delete state[folder + a]
  await writeFile(join(server.buildsRoot, "state.json"), JSON.stringify(state))
  assert.equal((await server.request("lookup", { ...binding, publication: a })).publication.status, "pending")
})

test("an unavailable Apache closes the client connection", async t => {
  const { tlsForwarder } = await import("../../src/web/tls.ts")
  const { connect, createServer } = await import("node:net")
  const reservation = createServer().listen(0, "127.0.0.1")
  await once(reservation, "listening")
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const forwarder = tlsForwarder({ host: "127.0.0.1", port }).listen(0, "127.0.0.1")
  await once(forwarder, "listening")
  t.after(() => new Promise(resolve => forwarder.close(resolve)))
  const client = connect({ host: "127.0.0.1", port: forwarder.address().port })
  client.on("error", () => {})
  await once(client, "close")
  assert.equal(client.destroyed, true)
})

test("closing a client closes its Apache connection", async t => {
  const { tlsForwarder } = await import("../../src/web/tls.ts")
  const { connect, createServer } = await import("node:net")
  const accepted = Promise.withResolvers()
  const upstream = createServer(socket => accepted.resolve(socket)).listen(0, "127.0.0.1")
  await once(upstream, "listening")
  t.after(() => new Promise(resolve => upstream.close(resolve)))
  const forwarder = tlsForwarder({ host: "127.0.0.1", port: upstream.address().port }).listen(0, "127.0.0.1")
  await once(forwarder, "listening")
  t.after(() => new Promise(resolve => forwarder.close(resolve)))
  const client = connect({ host: "127.0.0.1", port: forwarder.address().port })
  const peer = await accepted.promise
  peer.resume()
  const closed = once(peer, "close")
  client.destroy()
  await closed
  assert.equal(peer.destroyed, true)
})

test("an idle forward closes both connections within its finite timeout", { timeout: 35_000 }, async t => {
  const { tlsForwarder } = await import("../../src/web/tls.ts")
  const { connect, createServer } = await import("node:net")
  const accepted = Promise.withResolvers()
  const upstream = createServer(socket => accepted.resolve(socket)).listen(0, "127.0.0.1")
  await once(upstream, "listening")
  t.after(() => new Promise(resolve => upstream.close(resolve)))
  const forwarder = tlsForwarder({ host: "127.0.0.1", port: upstream.address().port }).listen(0, "127.0.0.1")
  await once(forwarder, "listening")
  t.after(() => new Promise(resolve => forwarder.close(resolve)))
  const started = Date.now()
  const client = connect({ host: "127.0.0.1", port: forwarder.address().port })
  const peer = await accepted.promise
  peer.resume()
  await Promise.all([once(client, "close"), once(peer, "close")])
  assert.ok(Date.now() - started >= 29_000)
  assert.equal(client.destroyed, true)
  assert.equal(peer.destroyed, true)
})
