import test from "node:test"
import assert from "node:assert/strict"
import { loginomAddress, loginPage } from "../src/connection-check.mjs"

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
        clicks = []
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
        },
        async click() {
          clicks.push(selector)
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

function barrierPage(events, identity = "own-user") {
  const locator = {
    or() {
      return this
    },
    first() {
      return this
    },
    async waitFor() {},
    async isVisible() {
      return true
    },
  }
  return {
    async goto() {
      events.push("navigate")
    },
    locator() {
      return locator
    },
    async evaluate() {
      events.push("identity")
      return identity
    },
  }
}
test("managed login awaits begin before navigation and authenticated ACK after actual identity", async () => {
  const events = [],
    begin = Promise.withResolvers(),
    authenticated = Promise.withResolvers(),
    reached = Promise.withResolvers()
  const candidate = { url: "http://fixture.test/app/", username: "own-user", password: "" }
  const result = loginPage(barrierPage(events), candidate, async (phase) => {
    events.push(phase)
    if (phase === "begin") await begin.promise
    else {
      reached.resolve()
      await authenticated.promise
    }
  })
  assert.deepEqual(events, ["begin"])
  begin.resolve()
  await reached.promise
  assert.deepEqual(events, ["begin", "navigate", "identity", "authenticated"])
  let done = false
  void result.then(() => {
    done = true
  })
  await Promise.resolve()
  assert.equal(done, false)
  authenticated.resolve()
  assert.deepEqual(await result, { authenticated: true })
})
test("managed refusal never navigates; identity mismatch never emits authenticated; non-ACK rejected", async () => {
  const candidate = { url: "http://fixture.test/app/", username: "own-user", password: "" }
  const events = []
  await assert.rejects(
    loginPage(barrierPage(events), candidate, async () => {
      throw Error("private-value")
    }),
    /LOGINOM_LOGIN_BARRIER_UNKNOWN/,
  )
  assert.deepEqual(events, [])
  await assert.rejects(
    loginPage(barrierPage(events, "foreign"), candidate, async (phase) => {
      events.push(phase)
    }),
    /LOGINOM_ACCOUNT_MISMATCH/,
  )
  assert.deepEqual(events, ["begin", "navigate", "identity"])
  await assert.rejects(
    loginPage(barrierPage([]), candidate, async () => true),
    /LOGINOM_LOGIN_BARRIER_UNKNOWN/,
  )
})
