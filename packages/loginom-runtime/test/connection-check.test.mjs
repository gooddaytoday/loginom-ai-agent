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
      let passwordFocused = false
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
          if (selector.includes("edtPassword") && (!passwordFocused || (initial === "" && password === "")))
            throw Error("FIELD_READONLY")
          fills.push([selector, value])
        },
        async click() {
          clicks.push(selector)
          if (selector.includes("edtPassword")) passwordFocused = true
          if (selector.includes("btnLogin")) visible = true
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
        async waitForFunction(fn, account, options) {
          assert.ok(options.timeout > 0 && options.timeout <= 30_000)
          if (account !== "User") throw Error("LOGINOM_ACCOUNT_MISMATCH")
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
      assert.deepEqual(clicks, ['[data-tid="LoginForm;Login;edtPassword"]', '[data-tid="LoginForm;Login;btnLogin"]'])
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

// Real serialized readiness predicate; map and connection are native doubles.
for (const mode of ['pending-map', 'pending-account', 'pending-connection', 'foreign', 'disconnected']) {
  test('package tree readiness remains fail closed: ' + mode, async () => {
    const vm = await import('node:vm')
    const native = vm.createContext({bg:{app:{Application:{FInstance:{FMainForm:{}}}}}})
    let calls = 0
    const locator = {first(){return this},async waitFor(){},async isVisible(){return true}}
    const page = {async goto(){},locator(){return locator},async evaluate(){return 'User'},
      async waitForFunction(fn, account, options) {
        calls++; assert.ok(options.timeout > 0 && options.timeout <= 30000)
        const read = () => vm.runInContext('(' + fn.toString() + ')(' + JSON.stringify(account) + ')', native)
        if (mode === 'pending-account') vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree={FServerConnection:{Connected:true}}', native)
        if (mode === 'pending-connection') vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree={FServerConnection:{UserName:"User"}}', native)
        assert.equal(read(), false)
        vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree={FServerConnection:{UserName:"User",Connected:true},FPackagesParentNode:{}}', native)
        if (mode === 'foreign') vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName="Other"', native)
        if (mode === 'disconnected') vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.Connected=false', native)
        assert.equal(read(), true)
      }}
    const action = () => loginPage(page, {url:'https://fixture.invalid/app/', username:'User', password:''})
    if (['foreign','disconnected'].includes(mode)) await assert.rejects(action(), /LOGINOM_ACCOUNT_MISMATCH/)
    else assert.deepEqual(await action(), {authenticated:true})
    assert.equal(calls, 1)
  })
}
