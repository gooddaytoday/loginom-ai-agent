import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { appendFile, cp, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createServer } from "node:http"
import test from "node:test"
import { setTimeout } from "node:timers/promises"
import { selfCheck } from "../../src/agent/check.ts"
import { draftServer } from "../../src/draft/server.ts"
import { chromium } from "../../../loginom-runtime/client/node_modules/playwright-core/index.mjs"

const resources = {
  node: process.env.LOGINOM_AI_AGENT_TEST_NODE,
  template: resolve(import.meta.dirname, "../../template"),
  page: resolve(import.meta.dirname, "../../dist/draft.js"),
  selfcheck: resolve(import.meta.dirname, "../../src/draft/selfcheck.mjs"),
  playwright: resolve(import.meta.dirname, "../../../loginom-runtime/client/node_modules/playwright-core"),
  chromium: chromium.executablePath(),
}
const sdk = execFileSync("bun", ["build", resolve(import.meta.dirname, "../../src/sdk/loginom.ts"), "--target=browser", "--format=esm"])

async function fixture(t, app = "recorder") {
  const root = await mkdtemp(join(tmpdir(), "dashboard-selfcheck-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const hash = "b".repeat(64)
  const dir = join(root, hash)
  await cp(resolve(import.meta.dirname, "apps", app), dir, { recursive: true })
  if (app !== "silent") await writeFile(join(dir, "assets/loginom.js"), sdk)
  const server = await draftServer(resources.page)
  t.after(() => server.close())
  const url = server.publish({
    key: "a".repeat(64), hash, builds: root,
    data: { nodeName: "Fixture node", packagePath: "/user/fixture/campaign.lgp", created: "2026-11-12T12:00:00Z", parameters: [], sample: { schema: [{ name: "n", type: 3 }], rows: [[1]] } },
  })
  return { root, dir, url }
}

test("self-check observes the real recorder handshake", async t => {
  const { url } = await fixture(t)
  assert.deepEqual(await selfCheck({ resources, url }), { ok: true, state: "ready", errors: [] })
})

test("self-check reports an exception after the real handshake", async t => {
  const { url } = await fixture(t, "throws")
  const result = await selfCheck({ resources, url })
  assert.equal(result.ok, false)
  assert.equal(result.state, "ready")
  assert.ok(result.errors.some(error => error.includes("boom")), JSON.stringify(result))
})

test("self-check limits diagnostic length and removes line controls", async t => {
  const { dir, url } = await fixture(t, "throws")
  await appendFile(join(dir, "assets/throws.js"), '\nonState(() => console.error("Render\\tdiagnostic\\n" + "detail".repeat(600)))\n')
  const result = await selfCheck({ resources, url })
  assert.equal(result.state, "ready")
  assert.equal(result.ok, false)
  const diagnostic = result.errors.find(error => error.startsWith("Render"))
  assert.ok(diagnostic)
  assert.equal(diagnostic.length, 2_048)
  assert.match(diagnostic, /^Render diagnostic detail/)
})

test("self-check reports CSP violations after the real handshake", async t => {
  const { url } = await fixture(t, "csp")
  const result = await selfCheck({ resources, url })
  assert.equal(result.ok, false)
  assert.equal(result.state, "ready")
  assert.ok(result.errors.some(error => error.includes("CSP") && error.includes("attacker.localhost")), JSON.stringify(result))
})

async function runningCheck() {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const pids = spawnSync("pgrep", ["-P", String(process.pid)], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean)
    for (const pid of pids) {
      const command = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")
      if (!command.includes(resources.selfcheck)) continue
      const directory = await readlink(`/proc/${pid}/cwd`)
      const browsers = spawnSync("pgrep", ["-f", directory], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean)
      const commands = await Promise.all(browsers.map(pid => readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")))
      if (commands.some(command => command.includes(resources.chromium))) return { directory, commands }
    }
    await setTimeout(50)
  }
  assert.fail("The self-check Chromium did not start")
}

test("a silent app fails and its sandboxed Chromium and temporary profile are removed", async t => {
  const { url } = await fixture(t, "silent")
  const pending = selfCheck({ resources, url })
  const running = process.platform === "linux" ? await runningCheck() : undefined
  if (running) {
    assert.match(running.directory, /dashboard-check-/)
    assert.ok(running.commands.every(command => !command.split("\0").includes("--no-sandbox")))
  }
  const result = await pending
  assert.equal(result.ok, false)
  assert.notEqual(result.state, "ready")
  if (running) {
    assert.equal(spawnSync("pgrep", ["-f", running.directory]).status, 1)
    await assert.rejects(stat(running.directory), { code: "ENOENT" })
  }
})

test("cancelling a check closes its Chromium before removing the profile", async t => {
  if (process.platform !== "linux") return t.skip("Process ownership checks use /proc")
  const { url } = await fixture(t, "silent")
  const controller = new AbortController()
  const pending = selfCheck({ resources, url, signal: controller.signal })
  const running = await runningCheck()
  controller.abort()
  const result = await pending
  assert.equal(result.ok, false)
  assert.equal(result.state, "failed")
  assert.equal(spawnSync("pgrep", ["-f", running.directory]).status, 1)
  await assert.rejects(stat(running.directory), { code: "ENOENT" })
})

test("cancelling after a page request closes Chromium before removing the profile", async t => {
  if (process.platform !== "linux") return t.skip("Process ownership checks use /proc")
  const requested = Promise.withResolvers()
  const server = createServer((_request, response) => {
    response.end("<!doctype html><html><body>silent</body></html>")
    requested.resolve()
  })
  t.after(() => {
    server.closeAllConnections()
    return new Promise(resolve => server.close(resolve))
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const controller = new AbortController()
  const pending = selfCheck({ resources, url: `http://127.0.0.1:${server.address().port}/`, signal: controller.signal })
  t.after(() => {
    controller.abort()
    return pending
  })
  await Promise.race([requested.promise, pending.then(() => assert.fail("The self-check must request the page before cancellation"))])
  const running = await runningCheck()
  controller.abort()
  const result = await pending
  assert.equal(result.ok, false)
  assert.equal(result.state, "failed")
  assert.equal(spawnSync("pgrep", ["-f", running.directory]).status, 1)
  await assert.rejects(stat(running.directory), { code: "ENOENT" })
})

test("a failed checker returns at most the first 2 KiB of stderr", async t => {
  const { root, url } = await fixture(t)
  const script = join(root, "failed.mjs")
  await writeFile(script, 'process.stderr.write("failure".repeat(1000)); process.exitCode = 1')
  const result = await selfCheck({ resources: { ...resources, selfcheck: script }, url })
  assert.deepEqual(result, { ok: false, state: "failed", errors: ["failure".repeat(1000).slice(0, 2048)] })
})

test("malformed checker output fails with stderr diagnostics", async t => {
  const { root, url } = await fixture(t)
  const script = join(root, "invalid.mjs")
  await writeFile(script, 'console.log("not JSON"); process.stderr.write("invalid checker output")')
  assert.deepEqual(await selfCheck({ resources: { ...resources, selfcheck: script }, url }), {
    ok: false, state: "failed", errors: ["invalid checker output"],
  })
})

test("a stalled checker is terminated by the thirty-second limit", async t => {
  const { root, url } = await fixture(t)
  const script = join(root, "stalled.mjs")
  await writeFile(script, 'setInterval(() => {}, 1000)')
  const started = performance.now()
  const result = await selfCheck({ resources: { ...resources, selfcheck: script }, url })
  assert.equal(result.ok, false)
  assert.equal(result.state, "failed")
  assert.ok(performance.now() - started >= 29_000)
  assert.ok(performance.now() - started < 35_000)
})
