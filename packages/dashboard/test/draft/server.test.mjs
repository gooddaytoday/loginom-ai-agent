import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { Agent, request } from "node:http"
import { networkInterfaces, tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createInterface } from "node:readline"
import { appHeaders } from "../../src/web/apps.ts"
import { draftServer } from "../../src/draft/server.ts"

const key = "a".repeat(64)
const hash = "b".repeat(64)
const data = {
  nodeName: "Fixture node", created: "2026-11-12T12:00:00.000Z",
  parameters: [{ name: "MinBudget", value: 7 }],
  sample: { schema: [{ name: "n", type: 3 }], rows: [[1], [2]] },
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-draft-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const script = join(root, "draft.js")
  await writeFile(script, "fixture-script")
  const builds = join(root, "control/draft")
  await mkdir(join(builds, hash), { recursive: true })
  await writeFile(join(builds, hash, "index.html"), "fixture-app")
  const server = await draftServer(script)
  t.after(() => server.close())
  const entry = { key, hash, builds, data }
  return { server, entry, root }
}

function send(origin, path, method = "GET", host = new URL(origin).host, body, agent) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: new URL(origin).port, path, method, agent, headers: { host } }, response => {
      const chunks = []
      response.on("data", chunk => chunks.push(chunk))
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }))
    })
    req.on("error", reject)
    req.end(body)
  })
}

test("a draft entry is served by separate loopback page and app sockets", async t => {
  const { server, entry } = await fixture(t)
  const url = server.publish(entry)
  assert.equal(url, `${server.pageOrigin}/${key}/`)
  assert.equal(new URL(url).hostname, "localhost")
  assert.equal(new URL(server.appOrigin).hostname, "dashboards.localhost")
  assert.notEqual(new URL(url).port, new URL(server.appOrigin).port)
  const page = await send(server.pageOrigin, `/${key}/`)
  assert.equal(page.status, 200)
  assert.match(page.body, /<script src="\/draft.js"><\/script>/)
  assert.equal((await send(server.appOrigin, `/apps/${key}/${hash}/`)).body, "fixture-app")
})

test("draft data contains the captured sample and the platform app URL", async t => {
  const { server, entry } = await fixture(t)
  server.publish(entry)
  const response = await send(server.pageOrigin, `/${key}/data`)
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.body), { ...data, hash, appUrl: `${server.appOrigin}/apps/${key}/${hash}/` })
  assert.equal(response.headers["content-type"], "application/json")
  const script = await send(server.pageOrigin, "/draft.js")
  assert.equal(script.status, 200)
  assert.equal(script.body, "fixture-script")
  assert.equal(script.headers["content-type"], "text/javascript; charset=utf-8")
})

test("republishing an entry updates the hash endpoint", async t => {
  const { server, entry } = await fixture(t)
  server.publish(entry)
  assert.deepEqual(JSON.parse((await send(server.pageOrigin, `/${key}/hash`)).body), { hash })
  const next = "c".repeat(64)
  assert.equal(server.publish({ ...entry, hash: next }), `${server.pageOrigin}/${key}/`)
  assert.deepEqual(JSON.parse((await send(server.pageOrigin, `/${key}/hash`)).body), { hash: next })
})

function assertPageHeaders(response, server) {
  assert.equal(response.headers["content-security-policy"], `frame-src ${server.appOrigin}; object-src 'none'; frame-ancestors 'none'`)
  assert.equal(response.headers["content-security-policy-report-only"], undefined)
  assert.equal(response.headers["x-content-type-options"], "nosniff")
  assert.equal(response.headers["referrer-policy"], "same-origin")
  assert.equal(response.headers["cache-control"], "no-store")
}

test("every page response enforces Host and page isolation headers", async t => {
  const { server, entry } = await fixture(t)
  server.publish(entry)
  const port = new URL(server.pageOrigin).port
  for (const [host, status] of [[`localhost:${port}`, 200], [`127.0.0.1:${port}`, 200], [`evil.test:${port}`, 403], [`dashboards.localhost:${port}`, 403]]) {
    const response = await send(server.pageOrigin, `/${key}/`, "GET", host)
    assert.equal(response.status, status, host)
    assertPageHeaders(response, server)
  }
  for (const [path, method] of [["/", "GET"], [`/${"c".repeat(64)}/`, "GET"], [`/${key}/`, "POST"]]) {
    const response = await send(server.pageOrigin, path, method)
    assert.equal(response.status, 404)
    assertPageHeaders(response, server)
  }
  for (const path of ["/draft.js", `/${key}/data`, `/${key}/hash`]) {
    const response = await send(server.pageOrigin, path)
    assert.equal(response.status, 200)
    assertPageHeaders(response, server)
  }
})

test("the app socket reuses enforced app headers and both page origins", async t => {
  const { server, entry } = await fixture(t)
  server.publish(entry)
  const pagePort = new URL(server.pageOrigin).port
  const expected = appHeaders(server.appOrigin, [server.pageOrigin, `http://127.0.0.1:${pagePort}`])
  for (const [path, host, status] of [[`/apps/${key}/${hash}/`, new URL(server.appOrigin).host, 200], [`/apps/${key}/${"c".repeat(64)}/`, new URL(server.appOrigin).host, 404], [`/apps/${key}/${hash}/`, `localhost:${new URL(server.appOrigin).port}`, 403]]) {
    const response = await send(server.appOrigin, path, "GET", host)
    assert.equal(response.status, status)
    for (const [name, value] of Object.entries(expected)) assert.equal(response.headers[name], value, name)
  }
})

test("both draft sockets refuse a non-loopback interface", async t => {
  const { server } = await fixture(t)
  const address = Object.values(networkInterfaces()).flat().find(item => item?.family === "IPv4" && !item.internal)?.address
  if (!address) return t.skip("No non-loopback IPv4 interface on this host")
  for (const origin of [server.pageOrigin, server.appOrigin]) {
    const target = new URL(origin)
    target.hostname = address
    await assert.rejects(fetch(target, { signal: AbortSignal.timeout(2_000) }))
  }
})

test("draft reports stay off stdout and a keep-alive client cannot keep the backend alive", async t => {
  const { entry, root } = await fixture(t)
  const child = spawn(process.env.LOGINOM_AI_AGENT_TEST_NODE ?? process.execPath, ["--input-type=module", "--eval", `
import { draftServer } from ${JSON.stringify(new URL("../../src/draft/server.ts", import.meta.url).href)};
const server = await draftServer(${JSON.stringify(join(root, "draft.js"))});
server.publish(${JSON.stringify(entry)});
console.log(JSON.stringify({pageOrigin:server.pageOrigin,appOrigin:server.appOrigin}));
process.stdin.once("data", () => process.stdin.pause());
`], { stdio: ["pipe", "pipe", "pipe"] })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill() })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk })
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk })
  const lines = createInterface({ input: child.stdout })
  t.after(() => lines.close())
  const [line] = await once(lines, "line", { signal: AbortSignal.timeout(5_000) })
  const origins = JSON.parse(line)
  const agent = new Agent({ keepAlive: true })
  t.after(() => agent.destroy())
  assert.equal((await send(origins.appOrigin, "/_reports", "POST", new URL(origins.appOrigin).host, "synthetic-report", agent)).status, 204)
  assert.equal((await send(origins.pageOrigin, `/${key}/`, "GET", new URL(origins.pageOrigin).host, undefined, agent)).status, 200)
  const exited = once(child, "exit", { signal: AbortSignal.timeout(3_000) })
  child.stdin.end("finish\n")
  const [code, signal] = await exited
  assert.equal(code, 0, stderr)
  assert.equal(signal, null, stderr)
  assert.equal(stdout, line + "\n")
})
