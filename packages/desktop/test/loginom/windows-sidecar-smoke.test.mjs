import assert from "node:assert/strict"
import test from "node:test"
import { checkBundledSkills, checkHelpResult } from "./windows-sidecar-smoke.mjs"

const names = ["loginom-automation", "package-docs"]
const manifest = { files: names.map(name => ({ path: `skills/${name}/SKILL.md` })) }
const catalog = names.map(name => ({ name, source: "bundled", digest: "a".repeat(64) }))
test("catalog checks bundled names and count against the installed manifest", () => {
  assert.deepEqual(checkBundledSkills(manifest, [...catalog].reverse()), { expected: names, actual: names })
  assert.throws(() => checkBundledSkills(manifest, []))
  assert.throws(() => checkBundledSkills(manifest, catalog.slice(0, 1)))
  assert.throws(() => checkBundledSkills(manifest, [catalog[0], catalog[0]]))
  assert.throws(() => checkBundledSkills(manifest, [...catalog, { ...catalog[0], name: "unexpected" }]))
  assert.throws(() => checkBundledSkills({ files: manifest.files.slice(1) }, catalog.slice(1)))
})
test("user and builtin lookalikes cannot stand in for bundled skills", () => {
  for (const source of ["user", "builtin", undefined]) {
    assert.throws(() => checkBundledSkills(manifest, catalog.map(skill => ({ ...skill, source }))))
  }
  assert.throws(() => checkBundledSkills(manifest, catalog.map(skill => ({ ...skill, digest: "" }))))
  assert.deepEqual(checkBundledSkills(manifest, [...catalog, { name: "user-skill", source: "user" }]).actual, names)
})
const uri = "viking://resources/loginom-dock/sources/loginom-help/data/README.md"
const source = "# Loginom Help\nA real bundled page."
const message = (output, status = "completed", tool = "loginom_read") => [{ parts: [{ type: "tool", tool, state: { status, output } }] }]
test("Help requires a completed loginom_read with the requested URI and real content", () => {
  assert.equal(checkHelpResult(message(`=== ${uri} ===\n${source}`), uri, source).tool, "loginom_read")
  for (const output of ["", "  ", "Nothing found", uri, source, `${uri}\nFile not found.`]) {
    assert.throws(() => checkHelpResult(message(output), uri, source))
  }
  assert.throws(() => checkHelpResult(message(`${uri}\n${source}`, "error"), uri, source))
  assert.throws(() => checkHelpResult(message(`${uri}\n${source}`, "completed", "read"), uri, source))
  assert.throws(() => checkHelpResult([{ parts: [{ type: "text", text: `${uri}\n${source}` }] }], uri, source))
})
