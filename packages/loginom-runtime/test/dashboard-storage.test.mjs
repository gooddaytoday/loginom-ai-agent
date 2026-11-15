import test from "node:test"
import assert from "node:assert/strict"
import { publicationName, dashboardRequest } from "../src/dashboard-storage.mjs"

test("UTC publication names advance past latest when the local clock is behind", () => {
  assert.equal(publicationName(null, Date.UTC(2026, 10, 15, 1, 2, 3)), "20261115T010203Z.json")
  assert.equal(publicationName("20261115T010203Z.json", Date.UTC(2026, 10, 14)), "20261115T010204Z.json")
})

const binding = { packagePath: "/user/example.lgp", workflowGuid: "11111111-1111-4111-8111-111111111111", nodeGuid: "22222222-2222-4222-8222-222222222222" }
test("dashboard storage accepts only a bound saved package and node directory", () => {
  assert.equal(dashboardRequest({ binding }).directory, binding.packagePath + ".dashboards/" + binding.nodeGuid)
  for (const packagePath of ["relative.lgp", "/user/../example.lgp", "/user/example.txt", "/user/example\\bad.lgp"])
    assert.throws(() => dashboardRequest({ binding: { ...binding, packagePath } }), /DASHBOARD_INPUT_INVALID/)
  assert.throws(() => dashboardRequest({ binding: { ...binding, nodeGuid: "../escape" } }), /DASHBOARD_INPUT_INVALID/)
})

test("publication input preserves UTF-8 bytes and refuses oversized, malformed or unbound expectations", () => {
  assert.equal(Buffer.byteLength(dashboardRequest({ binding, content: JSON.stringify('x'.repeat(1_048_574)), expected: null }, true).content), 1_048_576)
  const content = '{"title":"Проверка"}'
  assert.equal(dashboardRequest({ binding, content, expected: null }, true).content, content)
  for (const content of ['"\ud800"', 'not json', JSON.stringify('x'.repeat(1_048_575))])
    assert.throws(() => dashboardRequest({ binding, content, expected: null }, true), /DASHBOARD_INPUT_INVALID/)
  assert.throws(() => dashboardRequest({ binding, content, expected: { name: "../escape.json", sourceHash: "0".repeat(64) } }, true), /DASHBOARD_INPUT_INVALID/)
})
