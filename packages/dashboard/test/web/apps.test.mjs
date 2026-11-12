import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { appHost } from "../../src/web/apps.ts"

const dash = "http://dashboards.localhost:32769"
const host = "dashboards.localhost:32769"
// Literal header values from the isolation plan «Заголовки» section, with this test's origins substituted.
const securityHeaders = {
  "content-security-policy":
    "default-src 'none'; script-src http://dashboards.localhost:32769; style-src http://dashboards.localhost:32769; " +
    "img-src http://dashboards.localhost:32769 data: blob:; font-src http://dashboards.localhost:32769; " +
    "connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; " +
    "media-src 'none'; base-uri 'none'; form-action 'none'; " +
    "frame-ancestors http://127.0.0.1:32768 http://localhost:32768; sandbox allow-scripts; report-to dashboard",
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
    buildsRoot,
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
  const { server, root, buildsRoot, key, hash, dir } = await listen(t)
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

test("app host logs report bodies without request secrets and limits them to 64 KiB", async (t) => {
  const { server, lines } = await listen(t)
  const options = await send(server, "OPTIONS", "/_reports")
  assert.equal(options.status, 204)
  assert.equal(options.headers["access-control-allow-origin"], "*")
  assert.equal(options.headers["access-control-allow-methods"], "POST")
  assert.equal(options.headers["access-control-allow-headers"], "content-type")
  assert.deepEqual(lines, [])
  assertSecurity(options, "no-store")
  const body = "csp-violation-body"
  const posted = await send(server, "POST", "/_reports", {
    headers: { cookie: "secret=1", authorization: "Bearer secret" },
    body,
  })
  assert.equal(posted.status, 204)
  assert.equal(posted.headers["access-control-allow-origin"], "*")
  assert.equal(lines.length, 1)
  assert.equal(lines[0].includes(body), true)
  assert.equal(/secret/i.test(lines[0]), false)
  assertSecurity(posted, "no-store")

  const limited = await listen(t)
  const over = await send(limited.server, "POST", "/_reports", { body: Buffer.alloc(64 * 1024 + 1, 97) })
  assert.equal(over.status, 413)
  assert.deepEqual(limited.lines, [])
  assertSecurity(over, "no-store")
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
  const { server } = await listen(t)
  const response = await send(server, "GET", "/apps/", { omitHost: true })
  assert.equal(response.status, 403)
  assertSecurity(response, "no-store")
})

test("asset links cannot expose a disallowed file inside the same build", async (t) => {
  const { server, dir, key, hash } = await listen(t)
  await symlink("map.js.map", join(dir, "assets", "aliased.js"))
  const response = await send(server, "GET", `/apps/${key}/${hash}/assets/aliased.js`)
  assert.equal(response.status, 404)
  assert.equal(response.body.includes("fixture map.js.map"), false)
  assertSecurity(response, "no-store")
})
