import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { requireRuntime, verifyBundle } from "../script/bun-notices"
import source from "../licenses/bun/source.json"

const bundle = resolve(import.meta.dir, "../licenses/bun")
const other = "0".repeat(40)

// Unpacks every packaged Bun source archive and compares it with its inventory.
test("the committed Bun bundle matches the running pinned Bun and its own inventories", async () => {
  expect(await verifyBundle(bundle)).toMatchObject({ commit: source.commit })
}, 30_000)

test("the generator refuses a Bun runtime of another revision or version", () => {
  expect(() => requireRuntime(source.version, source.commit, { version: source.version, revision: other })).toThrow(
    "LOGINOM_BUN_NOTICE_REVISION_MISMATCH",
  )
  expect(() => requireRuntime(source.version, source.commit, { version: "1.3.14", revision: source.commit })).toThrow(
    "LOGINOM_BUN_NOTICE_REVISION_MISMATCH",
  )
})

// Each case below starts Bun children or unpacks the bundle; Windows runners are several times slower.
test("the generator stops before any download when the release tag names another revision", async () => {
  await using dir = await temporary()
  // The cache stores each response under the SHA-256 of its URL, which also makes this run offline.
  const url = `https://api.github.com/repos/oven-sh/bun/git/ref/tags/bun-v${source.version}`
  await mkdir(join(dir.path, "cache/http"), { recursive: true })
  await Bun.write(
    join(dir.path, "cache/http", createHash("sha256").update(url).digest("hex")),
    JSON.stringify({ object: { type: "commit", sha: other } }),
  )
  const result = await run(resolve(import.meta.dir, "../script/bun-notices.ts"), [
    "generate",
    source.version,
    join(dir.path, "cache"),
    join(dir.path, "out"),
  ])
  expect(result.stderr).toContain("LOGINOM_BUN_NOTICE_REVISION_MISMATCH")
  expect(result.exitCode).not.toBe(0)
  expect(await Bun.file(join(dir.path, "out/source.json")).exists()).toBe(false)
}, 30_000)

test("verification refuses a bundle whose files disagree on the Bun revision or a notice", async () => {
  await using dir = await temporary()
  await cp(bundle, join(dir.path, "bun"), { recursive: true })
  const catalog = await Bun.file(join(dir.path, "bun/source-companion.json")).json()
  await Bun.write(join(dir.path, "bun/source-companion.json"), JSON.stringify({ ...catalog, bunCommit: other }))
  await expect(verifyBundle(join(dir.path, "bun"))).rejects.toThrow("LOGINOM_BUN_NOTICE_REVISION_MISMATCH")

  await Bun.write(join(dir.path, "bun/source-companion.json"), JSON.stringify(catalog))
  const native = await Bun.file(join(dir.path, "bun/native/sources.json")).json()
  const notice = native.components.zstd.files[0].file
  await Bun.write(join(dir.path, "bun/native", notice), "changed\n")
  await expect(verifyBundle(join(dir.path, "bun"))).rejects.toThrow("LOGINOM_BUN_NATIVE_NOTICE_HASH_MISMATCH")
}, 30_000)

test("companion builders accept the committed revision and refuse another before creating output", async () => {
  await using dir = await temporary()
  const builders = ["build-bun-source-companion.ts", "build-webkit-source-companion.ts"]
  const files = ["source.json", "source-companion.json", "webkit-source.json", "native/sources.json"]
  await Promise.all([
    ...builders.map((name) => cp(resolve(import.meta.dir, "../script", name), join(dir.path, "script", name))),
    ...files.map((name) => cp(join(bundle, name), join(dir.path, "licenses/bun", name))),
  ])
  const build = (name: string, output: string) =>
    run(join(dir.path, "script", name), [join(dir.path, "missing-input"), join(dir.path, output)])

  // With the committed bundle both builders pass their revision guard and stop at the absent archive.
  for (const [index, name] of builders.entries()) {
    const result = await build(name, `accepted-${index}`)
    expect(result.stderr).toContain("ENOENT")
    expect(result.stderr).not.toContain("REVISION_MISMATCH")
  }

  const catalog = await Bun.file(join(dir.path, "licenses/bun/source-companion.json")).json()
  const webkit = await Bun.file(join(dir.path, "licenses/bun/webkit-source.json")).json()
  await Bun.write(join(dir.path, "licenses/bun/source-companion.json"), JSON.stringify({ ...catalog, bunCommit: other }))
  await Bun.write(join(dir.path, "licenses/bun/webkit-source.json"), JSON.stringify({ ...webkit, bunCommit: other }))
  const refused = await Promise.all(builders.map((name, index) => build(name, `refused-${index}`)))
  expect(refused.map((result) => result.stderr.match(/LOGINOM_\w+_SOURCE_REVISION_MISMATCH/)?.[0])).toEqual([
    "LOGINOM_BUN_SOURCE_REVISION_MISMATCH",
    "LOGINOM_WEBKIT_SOURCE_REVISION_MISMATCH",
  ])
  expect(await Bun.file(join(dir.path, "refused-0/SHA256SUMS")).exists()).toBe(false)
  expect(await Bun.file(join(dir.path, "refused-1/SHA256SUMS")).exists()).toBe(false)
}, 30_000)

async function run(script: string, args: string[]) {
  const child = Bun.spawn([process.execPath, script, ...args], { stdout: "pipe", stderr: "pipe" })
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited])
  return { stderr, exitCode }
}

async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "bun-notices-"))
  return { path, [Symbol.asyncDispose]: () => rm(path, { recursive: true, force: true }) }
}
