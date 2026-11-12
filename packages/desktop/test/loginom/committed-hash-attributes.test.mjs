import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../../../..")
const git = (args, input) => execFileSync("git", args, {
  cwd: root, input, maxBuffer: 128 * 1024 * 1024,
  env: { ...process.env, GIT_ATTR_NOSYSTEM: "1" },
})

test("committed Help, catalogs, build pins and fixture hashes have byte-preserving Git attributes", () => {
  const tracked = git(["ls-files", "--stage", "-z"]).toString().split("\0").filter(Boolean).flatMap(row => {
    const match = /^(100644|100755) ([a-f0-9]+) 0\t([\s\S]+)$/.exec(row)
    return match ? [{ oid: match[2], path: match[3] }] : []
  })
  const consumer = path =>
    ["packages/product/loginom-release.json", "packages/product/loginom-catalogs.json", "packages/product/help/help-manifest.json"].includes(path) ||
    path.startsWith("packages/loginom-host/licenses/") && path.endsWith(".json") ||
    /^packages\/loginom-runtime\/executor\/catalog-releases\/[^/]+\/manifest\.json$/.test(path) ||
    (path.startsWith("packages/") && path.includes("/test/") &&
      (/\.(?:ts|mjs|js)$/.test(path) || path.includes("/fixtures/") && path.endsWith(".json"))) ||
    (path.startsWith("docs/node-development/") && path.includes("/fixtures/") && path.endsWith(".json"))
  const candidate = path =>
    path.startsWith("packages/product/help/") ||
    path.startsWith("packages/loginom-runtime/executor/catalog-releases/") ||
    path.startsWith("packages/loginom-host/licenses/") ||
    ["packages/product/models.json", "packages/loginom-runtime/client/package-lock.json"].includes(path) ||
    path.includes("/fixtures/") ||
    path.startsWith("docs/node-development/") && /\/acceptance\/(?:.*\/)?data\//.test(path)
  const relevant = tracked.filter(file => consumer(file.path) || candidate(file.path))
  const ids = [...new Set(relevant.map(file => file.oid))]
  // Hash canonical index blobs. Hashing a Windows working tree would miss the
  // very files whose hashes changed when checkout converted them to CRLF.
  const batch = git(["cat-file", "--batch"], ids.join("\n") + "\n")
  const blobs = new Map()
  let offset = 0
  for (const id of ids) {
    const end = batch.indexOf(10, offset)
    const [oid, kind, length] = batch.subarray(offset, end).toString().split(" ")
    assert.equal(oid, id)
    assert.equal(kind, "blob")
    const size = Number(length)
    blobs.set(id, batch.subarray(end + 1, end + 1 + size))
    offset = end + 1 + size + 1
  }
  const hashes = new Set()
  const licenseHashes = new Set()
  const required = new Set()
  for (const file of relevant.filter(file => consumer(file.path))) {
    const text = blobs.get(file.oid).toString()
    const targetHashes = file.path.startsWith("packages/loginom-host/licenses/") ? licenseHashes : hashes
    for (const match of text.matchAll(/(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])/g)) targetHashes.add(match[0])
    if (file.path === "packages/product/help/help-manifest.json") {
      for (const entry of JSON.parse(text).files) required.add("packages/product/help/loginom-help/" + entry.path)
    }
    if (/\/catalog-releases\/[^/]+\/manifest\.json$/.test(file.path)) {
      required.add(file.path)
      for (const name of Object.keys(JSON.parse(text).files)) required.add(file.path.replace(/manifest\.json$/, name))
    }
  }
  for (const file of relevant.filter(file => candidate(file.path))) {
    const targetHashes = file.path.startsWith("packages/loginom-host/licenses/") ? licenseHashes : hashes
    if (targetHashes.has(createHash("sha256").update(blobs.get(file.oid)).digest("hex"))) required.add(file.path)
  }
  assert.ok(required.has("packages/product/help/loginom-help/data/README.md"), "Help corpus missing from guard")
  assert.ok(required.has("packages/product/models.json"), "Committed model pin missing from guard")
  assert.ok(required.has("packages/desktop/test/loginom/fixtures/standalone-cli/A/sales.csv"), "Fixture manifests missing from guard")
  const paths = [...required].sort()
  const attributes = git(["-c", "core.attributesFile=", "check-attr", "-z", "--stdin", "text", "eol"], paths.join("\0") + "\0").toString().split("\0")
  const values = new Map()
  for (let i = 0; i + 2 < attributes.length; i += 3) {
    const [path, name, value] = attributes.slice(i, i + 3)
    if (!values.has(path)) values.set(path, {})
    values.get(path)[name] = value
  }
  const missing = paths.filter(path => values.get(path)?.text !== "unset" && values.get(path)?.eol !== "lf")
  assert.equal(missing.length, 0,
    `${missing.length} committed-hash inputs need -text or eol=lf in .gitattributes:\n${missing.slice(0, 20).join("\n")}`)
  console.log(`Verified Git attributes for ${paths.length} committed-hash inputs`)
})
