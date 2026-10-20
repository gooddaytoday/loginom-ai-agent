import test from "node:test"
import assert from "node:assert/strict"
import { loginPage } from "../src/connection-check.mjs"

const candidate = { url: "https://example.test/app/?opaque=private-query#private-fragment",
  username: "private-user", password: 'tiny"pass', apiKey: "private-key" }

function fixture(failure, error, authenticated = false) {
  const calls = []
  let loggedIn = authenticated
  const run = async (phase, action, value) => {
    calls.push({ phase, action, value })
    if (failure === phase + ":" + action) throw error
  }
  const field = selector => ({
    locator: () => field(selector),
    fill: value => run("submit", "fill", value),
    press: value => run("submit", "press", value),
    inputValue: async () => { await run("submit", "password"); return "" },
    click: async () => { await run("submit", "click"); loggedIn = true },
  })
  const avatar = {
    or: () => ({ first: () => ({ waitFor: async options => {
      assert.deepEqual(options, {state:"visible",timeout:60000}); await run("form", "wait")
    } }) }),
    isVisible: async () => { await run("form", "visible"); return loggedIn },
    waitFor: async options => { assert.deepEqual(options, {state:"visible",timeout:30000}); await run("submit", "wait") },
  }
  const page = {
    goto: async (url, options) => { assert.equal(url, "https://example.test/app/?opaque=private-query&testable=true#private-fragment")
      assert.deepEqual(options, {waitUntil:"domcontentloaded",timeout:60000}); await run("goto", "navigate") },
    locator: selector => selector.includes("btnAvatar") ? avatar : field(selector),
    evaluate: async () => { await run("identity", "read"); return failure === "identity:mismatch" ? "other" : candidate.username },
  }
  return { calls, page }
}

for (const [failure, code] of [
  ["goto:navigate", "LOGINOM_LOGIN_UNAVAILABLE"], ["form:wait", "LOGINOM_LOGIN_UNAVAILABLE"],
  ["form:visible", "LOGINOM_LOGIN_UNAVAILABLE"], ["submit:fill", "LOGINOM_LOGIN_UNAVAILABLE"],
  ["submit:click", "LOGINOM_LOGIN_UNAVAILABLE"], ["submit:wait", "LOGINOM_LOGIN_REJECTED"],
  ["identity:read", "LOGINOM_LOGIN_UNAVAILABLE"], ["identity:mismatch", "LOGINOM_ACCOUNT_MISMATCH"],
]) test("login diagnostic retains the failed phase without retry: " + failure, async () => {
  const original = Object.assign(Error("socket failed net::ERR_CONNECTION_RESET"), { name:"TimeoutError", code:"ECONNRESET" })
  const f = fixture(failure, original)
  const before = performance.now()
  await assert.rejects(loginPage(f.page, candidate), error => {
    assert.equal(error.message, code)
    const diagnostic = error.cause.login
    assert.equal(diagnostic.phase, failure.split(":")[0])
    assert.ok(Number.isInteger(diagnostic.duration_ms) && diagnostic.duration_ms >= 0)
    assert.ok(diagnostic.elapsed_ms >= diagnostic.duration_ms && diagnostic.elapsed_ms <= performance.now() - before + 2)
    assert.equal(diagnostic.url, "https://example.test/app/")
    assert.equal(diagnostic.original_code, failure.endsWith("mismatch") ? null : "ECONNRESET")
    assert.equal(diagnostic.original_name, failure.endsWith("mismatch") ? "Error" : "TimeoutError")
    assert.equal(diagnostic.original_message, failure.endsWith("mismatch") ? code : original.message)
    assert.ok(!("stack" in diagnostic))
    return true
  })
  assert.equal(f.calls.filter(call => call.phase === "goto").length, 1)
  assert.ok(f.calls.filter(call => call.action === "click").length <= 1)
  assert.ok(f.calls.every(call => ["goto","form","submit","identity"].indexOf(call.phase) <= ["goto","form","submit","identity"].indexOf(failure.split(":")[0])))
})

test("login failure strips query, fragment, userinfo, credentials and authorization before retaining text", async () => {
  const message = `page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://url-user:url-pass@example.test/app/?unknown=not-a-known-secret#fragment-token
encoded ${encodeURIComponent("https://example.test/app/?unknown=encoded-query#encoded-fragment")}; relative /app/?opaque=relative-query#relative-fragment
candidate ${candidate.url}; username ${candidate.username}; password ${candidate.password}; encoded ${encodeURIComponent(candidate.password)}; escaped ${JSON.stringify(candidate.password)}
api_key=${candidate.apiKey}
Authorization: Bearer unknown-header-secret
Cookie: session=unknown-cookie-secret`
  const f = fixture("goto:navigate", Error(message))
  await assert.rejects(loginPage(f.page, candidate), error => {
    const diagnostic = error.cause.login, serialized = JSON.stringify(error.cause)
    assert.equal(error.message, "LOGINOM_LOGIN_UNAVAILABLE")
    assert.equal(diagnostic.original_code, "net::ERR_CERT_AUTHORITY_INVALID")
    assert.match(diagnostic.original_message, /https:\/\/example.test\/app\//)
    for (const secret of [candidate.username,candidate.password,encodeURIComponent(candidate.password),candidate.apiKey,
      "private-query","private-fragment","url-user","url-pass","not-a-known-secret","fragment-token","encoded-query","encoded-fragment",
      "relative-query","relative-fragment","unknown-header-secret","unknown-cookie-secret"])
      assert.ok(!serialized.includes(secret),secret)
    assert.ok(!diagnostic.original_message.includes("?"))
    return true
  })
})

test("failed-phase duration excludes earlier successful navigation", async () => {
  const f = fixture("identity:read", Error("identity failed"))
  const goto = f.page.goto
  f.page.goto = async (...args) => { await new Promise(resolve=>setTimeout(resolve,25)); return goto(...args) }
  await assert.rejects(loginPage(f.page,candidate), error => {
    assert.equal(error.cause.login.phase,"identity")
    assert.ok(error.cause.login.elapsed_ms >= error.cause.login.duration_ms + 15)
    return true
  })
})

test("structured error messages cannot retain unknown cookie or token fields", async () => {
  const f = fixture("form:wait", Error(JSON.stringify({error:"form failed",cookie:"unknown-cookie",token:"unknown-token"})))
  await assert.rejects(loginPage(f.page,candidate), error => {
    const message=error.cause.login.original_message
    assert.match(message,/form failed/)
    assert.ok(!message.includes("unknown-cookie")); assert.ok(!message.includes("unknown-token"))
    return true
  })
})

test("login redacts short credentials and bounds arbitrary error fields", async () => {
  for (const password of ["z!", "ab"]) {
    const f = fixture("submit:click", Object.assign(Error((password + " ").repeat(3000)), {code:password,name:password}))
    await assert.rejects(loginPage(f.page, {...candidate,password}), error => {
      const diagnostic = error.cause.login
      for (const value of [diagnostic.original_message,diagnostic.original_code,diagnostic.original_name]) {
        assert.ok(!value.includes(password)); assert.ok(value.length <= 1024)
      }
      return true
    })
  }
})

test("successful and already authenticated logins keep the original gestures and result", async () => {
  for (const authenticated of [false,true]) {
    const f = fixture(null, null, authenticated)
    assert.deepEqual(await loginPage(f.page, candidate), {authenticated:true})
    assert.equal(f.calls.filter(call => call.action === "click").length, authenticated ? 0 : 1)
    assert.equal(f.calls.filter(call => call.phase === "identity").length, 1)
  }
})
