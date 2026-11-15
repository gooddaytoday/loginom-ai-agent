import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createEventLog } from "../../src/log.ts"
import { appHost } from "../../src/web/apps.ts"
import { dashboardServer } from "../../src/web/server.ts"

const dash = "http://dashboards.localhost:32769"
const host = "dashboards.localhost:32769"
// Literal header values from the isolation plan «Заголовки» section, with this test's origins substituted.
const securityHeaders = {
  "content-security-policy":
    "default-src 'none'; script-src http://dashboards.localhost:32769; style-src http://dashboards.localhost:32769; " +
    "img-src http://dashboards.localhost:32769 data: blob:; font-src http://dashboards.localhost:32769; " +
    "connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; " +
    "media-src 'none'; base-uri 'none'; form-action 'none'; " +
    "frame-ancestors http://127.0.0.1:32768 http://localhost:32768; sandbox allow-scripts; report-uri http://dashboards.localhost:32769/_reports",
  "connection-allowlist": "(response-origin); report-to=dashboard",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), display-capture=(), " +
    "fullscreen=(), payment=(), publickey-credentials-get=(), identity-credentials-get=(), usb=(), serial=(), hid=(), bluetooth=()",
  "x-dns-prefetch-control": "off",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "reporting-endpoints": 'dashboard="http://dashboards.localhost:32769/_reports"',
}

function assertSecurity(response, cache, allowlist = true) {
  assert.equal(response.status >= 300 && response.status < 400, false, String(response.status))
  assert.equal(response.headers.location, undefined)
  for (const [name, value] of Object.entries(securityHeaders)) {
    const expected = name === "connection-allowlist" && !allowlist ? undefined : value
    assert.equal(response.headers[name], expected, name)
  }
  assert.equal(response.headers["cache-control"], cache)
}

test("only strict app hosts serve the platform probe with document security headers", async t => {
  for (const mode of ["normal", "strict"]) {
    const { server } = await listen(t, { mode })
    for (const [path, type] of [["/_probe/", "text/html; charset=utf-8"], ["/_probe/probe.js", "text/javascript; charset=utf-8"]]) {
      const response = await send(server, "GET", path)
      assert.equal(response.status, mode === "strict" ? 200 : 404, `${mode} ${path}`)
      assertSecurity(response, "no-store")
      if (mode === "strict") assert.equal(response.headers["content-type"], type)
    }
  }
})

async function listen(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-apps-"))
  const buildsRoot = join(root, "builds")
  const key = "a".repeat(64)
  const hash = "b".repeat(64)
  const dir = join(buildsRoot, key, hash)
  await mkdir(join(dir, "assets"), { recursive: true })
  await writeFile(join(dir, "index.html"), "index-html")
  const assets = ["app.js", "app.css", "icon.svg", "icon.png", "photo.jpg", "icon.webp", "font.woff2", "map.js.map"]
  for (const name of assets) await writeFile(join(dir, "assets", name), "fixture " + name)
  await writeFile(join(dir, "binding.json"), "binding-secret")
  await writeFile(join(dir, "sample.json"), "sample-secret")
  const lines = []
  const server = appHost({
    builds: key => join(buildsRoot, key),
    appOrigin: dash,
    clientOrigins: ["http://127.0.0.1:32768", "http://localhost:32768"],
    mode: "normal",
    log: (line) => lines.push(line),
    ...options,
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  return { server, lines, root, buildsRoot, key, hash, dir }
}

function send(server, method, path, { headers = {}, body, omitHost = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        path,
        method,
        setHost: false,
        headers: { ...(!omitHost && { host }), ...headers },
      },
      (response) => {
        const chunks = []
        response.on("data", (chunk) => chunks.push(chunk))
        response.on("end", () =>
          resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }),
        )
      },
    )
    req.on("error", reject)
    req.end(body)
  })
}

test("app host serves the build document and immutable assets", async (t) => {
  const { server, key, hash } = await listen(t)
  const page = await send(server, "GET", `/apps/${key}/${hash}/`)
  assert.equal(page.status, 200)
  assert.equal(page.headers["content-type"], "text/html; charset=utf-8")
  assert.equal(page.body, "index-html")
  assert.equal(page.headers["access-control-allow-origin"], undefined)
  assertSecurity(page, "no-store")
  const assets = [
    ["app.js", "text/javascript; charset=utf-8"],
    ["app.css", "text/css; charset=utf-8"],
    ["icon.svg", "image/svg+xml"],
    ["icon.png", "image/png"],
    ["photo.jpg", "image/jpeg"],
    ["icon.webp", "image/webp"],
    ["font.woff2", "font/woff2"],
  ]
  for (const [name, type] of assets) {
    const response = await send(server, "GET", `/apps/${key}/${hash}/assets/${name}`)
    assert.equal(response.status, 200, name)
    assert.equal(response.headers["content-type"], type, name)
    assert.equal(response.headers["access-control-allow-origin"], "*")
    assert.equal(response.body, "fixture " + name)
    assertSecurity(response, "public, max-age=31536000, immutable")
  }
})

test("app host keeps security headers on forbidden and missing responses", async (t) => {
  const { server, key, hash } = await listen(t)
  const base = `/apps/${key}/${hash}`
  const cases = [
    ["GET", base + "/", "evil.test:32769", 403],
    ["GET", "/", host, 404],
    ["GET", "/apps/", host, 404],
    ["GET", base, host, 404],
    ["GET", base + "/binding.json", host, 404],
    ["GET", base + "/sample.json", host, 404],
    ["GET", base + "/assets/map.js.map", host, 404],
    ["GET", base + "/assets/..", host, 404],
    ["POST", base + "/", host, 404],
    ["GET", `/apps/${"A".repeat(64)}/${hash}/`, host, 404],
  ]
  for (const [method, path, requestHost, status] of cases) {
    const response = await send(server, method, path, { headers: { host: requestHost } })
    assert.equal(response.status, status, `${method} ${path}`)
    assert.equal(response.body.includes("binding-secret"), false, path)
    assert.equal(response.body.includes("sample-secret"), false, path)
    assert.equal(response.body.includes("fixture map.js.map"), false, path)
    assertSecurity(response, "no-store")
  }
})

test("app host refuses links that leave the build and a looping document", async (t) => {
  const { server, root, buildsRoot, key, hash, dir, lines } = await listen(t)
  const outside = join(root, "outside")
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, "index.html"), "OUTSIDE PAGE")
  await writeFile(join(outside, "secret.js"), "OUTSIDE SECRET")
  await symlink(join(outside, "secret.js"), join(dir, "assets", "leak.js"))
  const escapedHash = "c".repeat(64)
  await symlink(outside, join(buildsRoot, key, escapedHash), "dir")
  const loop = "d".repeat(64)
  await mkdir(join(buildsRoot, key, loop), { recursive: true })
  await symlink("index.html", join(buildsRoot, key, loop, "index.html"))
  for (const [path, status] of [
    [`/apps/${key}/${hash}/assets/leak.js`, 404],
    [`/apps/${key}/${escapedHash}/`, 404],
    [`/apps/${key}/${loop}/`, 500],
  ]) {
    const response = await send(server, "GET", path)
    assert.equal(response.status, status, path)
    assert.equal(response.body.includes("OUTSIDE"), false, path)
    assertSecurity(response, "no-store")
  }
  assert.equal(lines.length, 1)
  const { timestamp, ...event } = JSON.parse(lines[0])
  assert.deepEqual(event, { role: "web", event: "request_failed", code: "internal" })
})

test("app host refuses a build directory linked to another publication", async (t) => {
  const { server, buildsRoot, key, hash } = await listen(t)
  const otherKey = "c".repeat(64)
  await mkdir(join(buildsRoot, otherKey))
  await symlink(join(buildsRoot, key, hash), join(buildsRoot, otherKey, hash), "dir")
  const response = await send(server, "GET", `/apps/${otherKey}/${hash}/`)
  assert.equal(response.status, 404)
  assert.equal(response.body.includes("index-html"), false)
  assertSecurity(response, "no-store")
})

test("CSP report logs only safe fields", async t => {
  const { server, lines, key, hash } = await listen(t)
  const marker = "synthetic-sensitive-value"
  const response = await send(server, "POST", "/_reports", {
    headers: { "content-type": "application/csp-report", cookie: marker, authorization: marker },
    body: JSON.stringify({
      "csp-report": {
        "document-uri": `${dash}/apps/${key}/${hash}/?token=${marker}`,
        "effective-directive": "connect-src",
        disposition: "enforce",
        "blocked-uri": `https://blocked.invalid/${marker}`,
        "script-sample": marker,
      },
    }),
  })
  assert.equal(response.status, 204)
  assert.equal(response.body, "")
  assert.equal(response.headers["access-control-allow-origin"], "*")
  assertSecurity(response, "no-store")
  assert.equal(lines.length, 1)
  const { timestamp, ...event } = JSON.parse(lines[0])
  assert.equal(new Date(timestamp).toISOString(), timestamp)
  assert.deepEqual(event, { role: "web", event: "csp_violation", key, buildHash: hash, directive: "connect-src", disposition: "enforce" })
  assert.equal(lines[0].includes(marker), false)
})

test("app host allows report preflight and limits report bodies to 64 KiB", async (t) => {
  const { server, lines } = await listen(t)
  const options = await send(server, "OPTIONS", "/_reports")
  assert.equal(options.status, 204)
  assert.equal(options.headers["access-control-allow-origin"], "*")
  assert.equal(options.headers["access-control-allow-methods"], "POST")
  assert.equal(options.headers["access-control-allow-headers"], "content-type")
  assert.deepEqual(lines, [])
  assertSecurity(options, "no-store")
  const limited = await listen(t)
  const over = await send(limited.server, "POST", "/_reports", { body: Buffer.alloc(64 * 1024 + 1, 97) })
  assert.equal(over.status, 413)
  const event = JSON.parse(limited.lines.at(-1))
  assert.equal(event.event, "report_rejected")
  assert.equal(event.code, "body")
  assert.ok(limited.lines[0].length < 512)
  assertSecurity(over, "no-store")
})

test("malformed and unknown reports are rejected without reflecting their contents", async t => {
  const { server, lines } = await listen(t)
  const marker = "synthetic-report-value"
  for (const body of [`{"${marker}":`, JSON.stringify({ unknown: marker })]) {
    const response = await send(server, "POST", "/_reports", {
      headers: { "content-type": "application/csp-report" }, body,
    })
    assert.equal(response.status, 400)
    assert.equal(response.body.includes(marker), false)
    assertSecurity(response, "no-store")
  }
  assert.deepEqual(lines.map(line => {
    const { timestamp, ...event } = JSON.parse(line)
    return event
  }), Array(2).fill({ role: "web", event: "report_rejected", code: "schema" }))
})

test("only exact app-origin document paths can be bound to CSP events", async t => {
  const { server, lines, key, hash } = await listen(t)
  const path = `/apps/${key}/${hash}/`
  const documents = [`https://other.invalid${path}`, `${dash}/other/..${path}`, `${dash}${path}index.html`, `${dash}${path}?q=\t`]
  for (const document of documents) {
    const response = await send(server, "POST", "/_reports", {
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({ "csp-report": {
        "document-uri": document, "effective-directive": "style-src-elem", disposition: "enforce",
      } }),
    })
    assert.equal(response.status, 400)
    assertSecurity(response, "no-store")
  }
  assert.equal(lines.length, documents.length)
  for (const line of lines) {
    const { timestamp, ...event } = JSON.parse(line)
    assert.deepEqual(event, { role: "web", event: "report_rejected", code: "document" })
  }
})

test("Reporting API batches record only the selected CSP and connection fields", async t => {
  const { server, lines, key, hash } = await listen(t)
  const marker = "synthetic-reporting-field"
  const document = `${dash}/apps/${key}/${hash}/?fixture=${marker}`
  const response = await send(server, "POST", "/_reports", {
    headers: { "content-type": "application/reports+json; charset=utf-8" },
    body: JSON.stringify([
      { type: "csp-violation", url: document, body: {
        documentURL: document, effectiveDirective: "style-src-elem", disposition: "enforce", sample: marker,
      } },
      { type: "connection-allowlist", url: document, body: {
        url: document, connection: `https://blocked.invalid/${marker}`, allowlist: [marker], disposition: "report",
      } },
    ]),
  })
  assert.equal(response.status, 204)
  assert.equal(response.body, "")
  assert.equal(response.headers["access-control-allow-origin"], "*")
  assertSecurity(response, "no-store")
  assert.deepEqual(lines.map(line => {
    const { timestamp, ...event } = JSON.parse(line)
    return event
  }), [
    { role: "web", event: "csp_violation", key, buildHash: hash, directive: "style-src-elem", disposition: "enforce" },
    { role: "web", event: "connection_violation", key, buildHash: hash, disposition: "report" },
  ])
  assert.equal(lines.join("\n").includes(marker), false)
})

test("a failing log sink leaves a valid CSP report accepted", async t => {
  let writes = 0
  const { server, key, hash } = await listen(t, { log: () => {
    writes++
    throw Error("Synthetic sink failure")
  } })
  const response = await send(server, "POST", "/_reports", {
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({ "csp-report": {
      "document-uri": `${dash}/apps/${key}/${hash}/`, "effective-directive": "style-src-elem", disposition: "enforce",
    } }),
  })
  assert.equal(response.status, 204)
  assert.equal(response.body, "")
  assert.equal(writes, 1)
  assertSecurity(response, "no-store")
})

test("the API and app host share a budget without changing repeated HTTP refusals", async t => {
  const events = []
  const writer = createEventLog("web", line => events.push(JSON.parse(line)), () => 0)
  const { server, buildsRoot } = await listen(t, { events: writer })
  const api = dashboardServer({
    shell: new Uint8Array(), buildsRoot, appOrigin: dash, clientOrigins: [], mode: "normal", events: writer,
  }).listen(0, "127.0.0.1")
  await once(api, "listening")
  t.after(() => new Promise(resolve => api.close(resolve)))
  const apiResponse = await fetch(`http://127.0.0.1:${api.address().port}/dashboard/snapshots`, { method: "POST" })
  assert.equal(apiResponse.status, 400)
  await apiResponse.text()
  for (let i = 0; i < 65; i++) {
    const response = await send(server, "POST", "/_reports", {
      headers: { "content-type": "application/csp-report" }, body: "{}",
    })
    assert.equal(response.status, 400)
  }
  assert.deepEqual(events.map(event => event.event), ["request_rejected", ...Array(59).fill("report_rejected")])
})

test("connectionAllowlist false removes only Connection-Allowlist", async (t) => {
  const { server } = await listen(t, { connectionAllowlist: false })
  const response = await send(server, "GET", "/")
  assert.equal(response.status, 404)
  assertSecurity(response, "no-store", false)
})

test("unsupported HTTP expectations keep the app host security headers", async (t) => {
  const { server } = await listen(t)
  const response = await send(server, "GET", "/apps/", { headers: { expect: "unsupported" } })
  assert.equal(response.status, 417)
  assertSecurity(response, "no-store")
})

test("HTTP parser errors close the connection without an unprotected document", async (t) => {
  const { server } = await listen(t)
  await assert.rejects(send(server, "GET", "/apps/", { headers: { cookie: "x".repeat(20_000) } }), {
    code: "ECONNRESET",
  })
})

test("an HTTP/1.1 request without Host gets a protected refusal", async (t) => {
  const { server, lines } = await listen(t)
  const response = await send(server, "GET", "/apps/", { omitHost: true })
  assert.equal(response.status, 403)
  assertSecurity(response, "no-store")
  const { timestamp, ...event } = JSON.parse(lines.at(-1))
  assert.deepEqual(event, { role: "web", event: "request_rejected", code: "host" })
})

test("asset links cannot expose a disallowed file inside the same build", async (t) => {
  const { server, dir, key, hash } = await listen(t)
  await symlink("map.js.map", join(dir, "assets", "aliased.js"))
  const response = await send(server, "GET", `/apps/${key}/${hash}/assets/aliased.js`)
  assert.equal(response.status, 404)
  assert.equal(response.body.includes("fixture map.js.map"), false)
  assertSecurity(response, "no-store")
})

test("an unknown builds mapping returns a protected missing response", async t => {
  const { server, key, hash } = await listen(t, { builds: () => undefined })
  const response = await send(server, "GET", `/apps/${key}/${hash}/`)
  assert.equal(response.status, 404)
  assertSecurity(response, "no-store")
})
