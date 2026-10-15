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

// Real login function and serialized readiness predicate; native/Page doubles.
for(const scenario of ['ready-after-avatar','foreign-account','foreign-document','changed-page','expired'])test('managed login native initialization '+scenario,async()=>{
 const {default:vm}=await import('node:vm');let clicks=0,waits=0;
 const native=vm.createContext({document:{},location:{origin:'https://fixture.invalid'},bg:{app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'User',Connected:true}}}}}}}});
 const owner={evidence:{},id:'original',account:'User',origin:'https://fixture.invalid',deadline:Date.now()+(scenario==='expired'?-1:6000)};
 const locator={or(){return this},first(){return this},async waitFor(){},async isVisible(){return true},async click(){clicks++}};
 const page={async goto(){},locator(){return locator},async evaluate(fn,arg){return vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',native)},
  async waitForFunction(fn,arg,opts){waits++;assert.ok(opts.timeout>0&&opts.timeout<=6000);
   const run=()=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',native);
   assert.equal(run(),false);
   vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FPackagesParentNode={};',native);
   if(scenario==='foreign-account')vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName="foreign"',native);
   if(scenario==='foreign-document')vm.runInContext('globalThis.document={}',native);
   assert.equal(run(),true);if(scenario==='changed-page')owner.page={};
  }};owner.page=page;
 if(scenario==='ready-after-avatar')assert.deepEqual(await loginPage(page,{url:'https://fixture.invalid/app/',username:'User',password:''},owner),{authenticated:true});
 else await assert.rejects(loginPage(page,{url:'https://fixture.invalid/app/',username:'User',password:''},owner));
 assert.equal(clicks,0);assert.equal(waits,scenario==='expired'?0:1);
});

for(const scenario of ['missing-map','missing-connection','missing-account','missing-connected','never-ready','late-foreign','disconnected'])test('readiness incomplete native initialization '+scenario,async()=>{
 const {default:vm}=await import('node:vm');let polls=0;
 const native=vm.createContext({document:{},location:{origin:'https://fixture.invalid'},bg:{app:{Application:{FInstance:{FMainForm:{}}}}}});
 const owner={evidence:{},id:'original',account:'User',origin:'https://fixture.invalid',deadline:Date.now()+6000};
 const locator={or(){return this},first(){return this},async waitFor(){},async isVisible(){return true}};
 const execute=(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',native);
 if(scenario!=='missing-map'&&scenario!=='never-ready')vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree={}',native);
 if(['missing-account','missing-connected','disconnected'].includes(scenario))vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection={}',native);
 if(scenario==='missing-connected')vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName="User"',native);
 const page={async goto(){},locator(){return locator},async evaluate(fn,arg){return execute(fn,arg)},async waitForFunction(fn,arg,options){
  assert.ok(options.timeout>0&&options.timeout<=6000);polls++;assert.equal(execute(fn,arg),false);
  if(scenario==='never-ready')throw Error('original readiness timeout');
  vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree={FServerConnection:{UserName:"User",Connected:true},FPackagesParentNode:{}}',native);
  if(scenario==='late-foreign')vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName="foreign"',native);
  if(scenario==='disconnected')vm.runInContext('bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.Connected=false',native);
  assert.equal(execute(fn,arg),true);
 }};owner.page=page;
 if(['never-ready','late-foreign','disconnected'].includes(scenario))await assert.rejects(loginPage(page,{url:'https://fixture.invalid/app/',username:'User',password:''},owner),scenario==='never-ready'?/original readiness timeout/:/LOGINOM_ACCOUNT_MISMATCH/);
 else assert.deepEqual(await loginPage(page,{url:'https://fixture.invalid/app/',username:'User',password:''},owner),{authenticated:true});
 assert.equal(polls,1);
});
