import test from "node:test"
import assert from "node:assert/strict"
import { loginBrowser, loginomAddress, loginPage, trackLoginNetwork } from "../src/connection-check.mjs"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("login network diagnostics are bounded numeric timings without request identifiers or secrets", () => {
  const page = new EventEmitter(), trace = trackLoginNetwork(page)
  const sensitive = () => { throw Error("PRIVATE_REQUEST_URL_HEADERS_BODY") }
  const request = (type = "script") => ({ resourceType: () => type,
    timing: () => ({ domainLookupStart: 0, domainLookupEnd: 2, connectStart: 2, secureConnectionStart: 3,
      connectEnd: 6, requestStart: 7, responseStart: 17, responseEnd: 22 }),
    url: sensitive, headers: sensitive, postData: sensitive, failure: sensitive, response: sensitive })
  const ok = request(), failed = request("fetch"), pending = request("PRIVATE-UNEXPECTED-TYPE")
  for (const r of [ok, failed, pending]) page.emit("request", r)
  page.emit("requestfinished", ok)
  page.emit("requestfailed", failed)
  const event = trace.snapshot()
  assert.equal(event.requests, 3)
  assert.equal(event.completed.length, 2)
  assert.equal(event.completed[0].server_ms, 10)
  assert.equal(event.completed[0].transfer_ms, 5)
  assert.equal(event.completed[1].failed, true)
  assert.equal(event.pending[0].type, "other")
  assert.equal(JSON.stringify(event).includes("PRIVATE"), false)
  for (let i = 0; i < 600; i++) { const r = request(); page.emit("request", r); page.emit("requestfinished", r) }
  const bounded = trace.snapshot()
  assert.equal(bounded.completed.length + bounded.pending.length, 256)
  assert.equal(bounded.dropped, 347)
  trace.close()
  assert.equal(page.listenerCount("request"), 0)
  assert.equal(page.listenerCount("requestfinished"), 0)
  assert.equal(page.listenerCount("requestfailed"), 0)
  assert.equal(event.completed.length, 2)
})

test("browser launch retains a sanitized cause and phase before normalizing the error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-launch-failure-"))
  const phases = []
  const secret = "PRIVATE-LAUNCH-PASSWORD"
  try {
    await assert.rejects(loginBrowser({ browserPath: join(directory, secret, "missing-browser"),
      profile: join(directory, "profile"), candidate: { url: `https://example.test/?key=${secret}`,
        username: "PRIVATE-LAUNCH-USER", password: secret }, onPhase: async event => { phases.push(event) },
    }), error => {
      assert.equal(error.message, "LOGINOM_BROWSER_START_FAILED")
      assert.match(error.cause.message, /[Ee]xecutable doesn't exist/)
      assert.equal(JSON.stringify(error.cause).includes(secret), false)
      return true
    })
    assert.deepEqual(phases.filter(event=>event.status==='starting').map(event=>event.phase),[
      "browser.dependencies","browser.profile","browser.launch",
    ])
    assert.equal(phases.at(-1).status, "failed")
    assert.ok(phases.at(-1).duration_ms >= 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("public Loginom root bypasses the redirect that drops testable", () => {
  assert.equal(loginomAddress("https://app.loginom.ai"), "https://app.loginom.ai/app/?testable=true")
  assert.equal(loginomAddress("https://app.loginom.ai/?lang=ru"), "https://app.loginom.ai/app/?lang=ru&testable=true")
  assert.equal(loginomAddress("https://app.loginom.ai/custom/"), "https://app.loginom.ai/custom/?testable=true")
  assert.equal(loginomAddress("https://private.example/"), "https://private.example/?testable=true")
})

test("Loginom URL preserves parameters and replaces testable without credentials", () => {
  assert.equal(
    loginomAddress("http://example.test/app/?a=b&testable=false"),
    "http://example.test/app/?a=b&testable=true",
  )
  assert.throws(() => loginomAddress("file:///tmp/app"))
  assert.throws(() => loginomAddress("http://user:secret@example.test/app/"))
})

for (const [initial, password, expected] of [
  ["", "", []],
  ["stale", "", [""]],
  ["", "secret", ["secret"]],
]) {
  test(
    "private login uses only login controls and verifies account: " +
      (password ? "password" : initial ? "clear stale" : "empty readonly"),
    async () => {
      const fills = [],
        clicks = [],
        calls = []
      let visible = false
      const account = "User"
      const locator = (selector) => ({
        locator(child) {
          assert.equal(child, "input")
          return this
        },
        async inputValue() {
          return initial
        },
        async fill(value) {
          if (selector.includes("edtPassword") && initial === "" && password === "") throw Error("FIELD_READONLY")
          fills.push([selector, value])
          calls.push(["fill", value])
        },
        async press(key) {
          assert.ok(selector.includes("edtUsername"))
          assert.equal(key, "Tab")
          calls.push(["press", key])
        },
        async click() {
          clicks.push(selector)
          calls.push(["click"])
          visible = true
        },
        async isVisible() {
          return visible
        },
        or(other) {
          return this
        },
        first() {
          return this
        },
        async waitFor() {},
      })
      const page = {
        async goto(url) {
          assert.equal(url, "http://example.test/app/?testable=true")
        },
        locator(selector) {
          assert.ok(selector.includes("LoginForm;Login;") || selector.includes("btnAvatar"))
          return locator(selector)
        },
        async evaluate() {
          return account
        },
      }
      assert.deepEqual(await loginPage(page, { url: "http://example.test/app/", username: account, password }), {
        authenticated: true,
      })
      assert.deepEqual(
        fills.map((row) => row[1]),
        [account, ...expected],
      )
      assert.equal(clicks.length, 1)
      assert.deepEqual(calls, [
        ["fill", account],
        ["press", "Tab"],
        ...expected.map((value) => ["fill", value]),
        ["click"],
      ])
      await assert.rejects(
        loginPage(page, { url: "http://example.test/app/", username: "Other", password: "secret" }),
        /LOGINOM_ACCOUNT_MISMATCH/,
      )
      assert.equal(
        fills.length,
        1 + expected.length,
        "an already authenticated foreign session is never silently reused",
      )
    },
  )
}
