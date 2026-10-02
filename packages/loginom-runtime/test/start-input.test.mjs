import test from "node:test"
import assert from "node:assert/strict"
import { validateStartInput } from "../src/start-input.mjs"

const base = { protocol: 1, generation: 1, chat: "chat-1", stateDir: "/tmp/state" }

test("managed start without cleanup input stays a product launch", () => {
  assert.deepEqual(validateStartInput(base), { acceptanceCleanupPackage: null, closeSavedPackageOnShutdown: false })
  assert.deepEqual(validateStartInput({ ...base, acceptanceCleanupPackage: undefined }), { acceptanceCleanupPackage: null, closeSavedPackageOnShutdown: false })
})

test("managed start accepts an exact saved package path for acceptance cleanup", () => {
  const path = "/user/loginom-ai-agent-acceptance-run-A.lgp"
  assert.deepEqual(validateStartInput({ ...base, acceptanceCleanupPackage: path }), { acceptanceCleanupPackage: path, closeSavedPackageOnShutdown: false })
  assert.equal(validateStartInput({ ...base, acceptanceCleanupPackage: "/a b/пакет.lgp" }).acceptanceCleanupPackage, "/a b/пакет.lgp")
})

test("private normal shutdown policy accepts only an explicit boolean", () => {
  for (const value of [undefined, false, true])
    assert.equal(validateStartInput({ ...base, closeSavedPackageOnShutdown: value }).closeSavedPackageOnShutdown, value === true)
  for (const value of [null, "true", 1, {}, []])
    assert.throws(() => validateStartInput({ ...base, closeSavedPackageOnShutdown: value }), /^Error: LOGINOM_START_INVALID$/)
})

test("normal cleanup cannot borrow acceptance identity or run in validation/readiness", () => {
  for (const patch of [{ acceptanceCleanupPackage: "/user/package.lgp" }, { validation: true }, { chat: "readiness" }])
    assert.throws(() => validateStartInput({ ...base, ...patch, closeSavedPackageOnShutdown: true }), /^Error: LOGINOM_START_INVALID$/)
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
