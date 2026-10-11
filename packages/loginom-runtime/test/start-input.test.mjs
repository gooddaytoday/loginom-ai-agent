import test from "node:test"
import assert from "node:assert/strict"
import { validateStartInput } from "../src/start-input.mjs"

const base = { protocol: 1, generation: 1, chat: "chat-1", stateDir: "/tmp/state" }
const capture={revision:1,harness:'calculator-grouped-before-done-v1',owner:'owner',run:'run',lease:'owner:run',
  generation:1,chat:'chat-1',account:'user',packagePath:'/user/draft.lgp',admission:'one-shot',expires:Date.now()+500000}
test('capture start binds the host-derived identity, without treating validation as authorization',()=>{
 assert.deepEqual(validateStartInput({...base,connection:{username:'user'},acceptanceCapture:capture}).acceptanceCapture,capture)
})
for(const patch of [{revision:2},{harness:'code'},{owner:undefined},{lease:'other'},{generation:2},{chat:'foreign'},
 {account:'foreign'},{packagePath:'/foreign/draft.lgp'},{packagePath:'/user/../draft.lgp'},{expires:0},
 {expires:Date.now()+900000},{modulePath:'/evil'},{callback:'evil'},{admission:''}])
 test('capture start rejects '+JSON.stringify(patch),()=>assert.throws(()=>validateStartInput({...base,
   connection:{username:'user'},acceptanceCapture:{...capture,...patch}}),/LOGINOM_START_INVALID/))

test("managed start without cleanup input stays a product launch", () => {
  assert.deepEqual(validateStartInput(base), { acceptanceCleanupPackage: null })
  assert.deepEqual(validateStartInput({ ...base, acceptanceCleanupPackage: undefined }), { acceptanceCleanupPackage: null })
})

test("managed start accepts an exact saved package path for acceptance cleanup", () => {
  const path = "/user/loginom-ai-agent-acceptance-run-A.lgp"
  assert.deepEqual(validateStartInput({ ...base, acceptanceCleanupPackage: path }), { acceptanceCleanupPackage: path })
  assert.equal(validateStartInput({ ...base, acceptanceCleanupPackage: "/a b/пакет.lgp" }).acceptanceCleanupPackage, "/a b/пакет.lgp")
})

for (const [label, value] of [
  ["relative", "user/pkg.lgp"],
  ["wrong extension", "/user/pkg.txt"],
  ["dot segment", "/user/./pkg.lgp"],
  ["parent segment", "/user/../pkg.lgp"],
  ["empty segment", "/user//pkg.lgp"],
  ["control character", "/user/pkg\u0001.lgp"],
  ["backslash", "/user\\pkg.lgp"],
  ["trailing slash", "/user/pkg.lgp/"],
  ["too long", "/" + "a".repeat(1021) + ".lgp"],
  ["not a string", 42],
  ["empty string", ""],
])
  test("managed start rejects an invalid cleanup package: " + label, () => {
    assert.throws(() => validateStartInput({ ...base, acceptanceCleanupPackage: value }), /^Error: LOGINOM_START_INVALID$/)
  })

for (const [label, patch] of [
  ["protocol", { protocol: 2 }],
  ["generation", { generation: 0 }],
  ["chat", { chat: "bad chat" }],
  ["stateDir", { stateDir: "relative" }],
])
  test("managed start rejects invalid " + label, () => {
    assert.throws(() => validateStartInput({ ...base, ...patch }), /^Error: LOGINOM_START_INVALID$/)
  })
