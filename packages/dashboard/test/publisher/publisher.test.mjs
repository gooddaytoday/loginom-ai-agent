import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { scanPublications } from "../../src/publisher/index.ts"
import { buildNext } from "../../src/builder/index.ts"

const binding = { packagePath: "/user/fixture.lgp", workflowGuid: "11111111-1111-4111-8111-111111111111", nodeGuid: "22222222-2222-4222-8222-222222222222" }
const name = "20261115T120000Z.json"
const path = `${binding.packagePath}.dashboards/${binding.nodeGuid}/${name}`
const content = JSON.stringify({ format: 1, template: 1, binding, title: "Fixture", parameters: [], files: [{ path: "src/main.tsx", encoding: "utf8", content: 'document.body.textContent = "Synthetic dashboard"' }] })
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "publisher-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = Object.fromEntries(["storage", "builds", "jobsIn", "jobsOut"].map(key => [key, join(root, key)]))
  for (const dir of Object.values(input)) await mkdir(dir)
  await mkdir(join(input.storage, path, ".."), { recursive: true })
  await writeFile(join(input.storage, path), content)
  return input
}

test("stored publication builds once and activates the same immutable output", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  let state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "building")
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "ready", state[path].error)
  assert.match(await readFile(join(input.builds, state[path].key, state[path].buildHash, "index.html"), "utf8"), /Dashboard/)
  assert.deepEqual(await readdir(input.jobsIn), [])
  assert.deepEqual(await readdir(input.jobsOut), [])
  await scanPublications(input)
  assert.deepEqual(await readdir(input.jobsIn), [])
})

test("publisher refuses a builder output symlink instead of activating it", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  const [id] = await readdir(input.jobsIn)
  const job = JSON.parse(await readFile(join(input.jobsIn, id, "job.json")))
  await mkdir(join(input.jobsOut, id, "dist"))
  const { symlink } = await import("node:fs/promises")
  await symlink(join(input.storage, path), join(input.jobsOut, id, "dist/index.html"))
  await writeFile(join(input.jobsOut, id, "result.json"), JSON.stringify({ id, sourceHash: job.sourceHash, outcome: "ready", output: "" }))
  await scanPublications(input)
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "failed")
})

test("invalid UTF-8 source receives failed at its physical path", async t => {
  const input = await fixture(t)
  await writeFile(join(input.storage, path), Buffer.concat([Buffer.from(content.split("Fixture")[0]), Buffer.from([255]), Buffer.from(content.split("Fixture")[1])]))
  await scanPublications(input)
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "failed")
  assert.match(state[path].error, /encoded|UTF|valid/i)
})

for (const invalid of ["binding", "symlink", "oversize"]) test(`unsafe publication ${invalid} cannot become a build task`, async t => {
  const input = await fixture(t)
  if (invalid === "binding") await writeFile(join(input.storage, path), content.replace("/user/fixture.lgp", "/shared/other.lgp"))
  if (invalid === "oversize") await writeFile(join(input.storage, path), " ".repeat(1_048_577))
  if (invalid === "symlink") {
    const { symlink } = await import("node:fs/promises")
    await rm(join(input.storage, path))
    await writeFile(join(input.storage, "outside.json"), content)
    await symlink(join(input.storage, "outside.json"), join(input.storage, path))
  }
  await writeFile(join(input.storage, path + ".part"), content)
  await scanPublications(input)
  assert.deepEqual(await readdir(input.jobsIn), [])
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.notEqual(state[path]?.status, "ready")
  assert.equal(state[path + ".part"], undefined)
})

test("publisher clears a previous output before issuing the same job ID", async t => {
  const input = await fixture(t)
  const { createHash } = await import("node:crypto")
  const sourceHash = createHash("sha256").update(content).digest("hex")
  const id = createHash("sha256").update(path).update(sourceHash).digest("hex")
  await mkdir(join(input.jobsOut, id, "dist"), { recursive: true })
  await writeFile(join(input.jobsOut, id, "dist/index.html"), "stale")
  await scanPublications(input)
  assert.deepEqual(await readdir(join(input.jobsOut, id)), [])
})

test("output exceeding 20 MiB is failed and never activated", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  const [id] = await readdir(input.jobsIn)
  const job = JSON.parse(await readFile(join(input.jobsIn, id, "job.json")))
  await mkdir(join(input.jobsOut, id, "dist"))
  await writeFile(join(input.jobsOut, id, "dist/index.html"), Buffer.alloc(20 * 1024 * 1024 + 1))
  await writeFile(join(input.jobsOut, id, "result.json"), JSON.stringify({ id, sourceHash: job.sourceHash, outcome: "ready", output: "" }))
  await scanPublications(input)
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "failed")
  assert.match(state[path].error, /LIMIT/)
})

test("swapping an output parent cannot copy files outside the captured directory", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  const [id] = await readdir(input.jobsIn)
  const job = JSON.parse(await readFile(join(input.jobsIn, id, "job.json")))
  const output = join(input.jobsOut, id, "dist")
  await mkdir(join(output, "assets"), { recursive: true })
  await writeFile(join(output, "index.html"), "synthetic")
  await writeFile(join(output, "assets/main.js"), "safe")
  const outside = join(input.storage, "private")
  await mkdir(outside)
  await writeFile(join(outside, "main.js"), "synthetic-private")
  await writeFile(join(input.jobsOut, id, "result.json"), JSON.stringify({ id, sourceHash: job.sourceHash, outcome: "ready", output: "" }))
  const fs = (await import("node:fs/promises")).default
  const { syncBuiltinESMExports } = await import("node:module")
  const original = fs.open
  fs.open = async (path, flags) => {
    if (!String(path).endsWith("/main.js")) return original(path, flags)
    await fs.rename(join(output, "assets"), join(output, "held"))
    await fs.symlink(outside, join(output, "assets"))
    try { return await original(path, flags) } finally {
      await fs.unlink(join(output, "assets"))
      await fs.rename(join(output, "held"), join(output, "assets"))
    }
  }
  syncBuiltinESMExports()
  try { await scanPublications(input) } finally { fs.open = original; syncBuiltinESMExports() }
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "ready", state[path].error)
  assert.equal(await readFile(join(input.builds, state[path].key, state[path].buildHash, "assets/main.js"), "utf8"), "safe")
})

for (const character of ["\\", "\0"]) test(`escaped 8 KiB diagnostics (${JSON.stringify(character)}) fail only their job and allow the next publication`, async t => {
  const input = await fixture(t)
  await scanPublications(input)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const failed = path.replace(name, "20261115T120001Z.json")
  const next = path.replace(name, "20261115T120002Z.json")
  await writeFile(join(input.storage, failed), content)
  await writeFile(join(input.storage, next), content)
  await scanPublications(input)
  const [id] = await readdir(input.jobsIn)
  const job = JSON.parse(await readFile(join(input.jobsIn, id, "job.json")))
  const diagnostic = character.repeat(8192)
  await writeFile(join(input.jobsOut, id, "result.json"), JSON.stringify({ id, sourceHash: job.sourceHash, outcome: "failed", output: diagnostic }))
  await scanPublications(input)
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "ready")
  assert.equal(state[failed].status, "failed")
  assert.ok(state[failed].error.includes(character.repeat(8000)))
  assert.ok(Buffer.byteLength(state[failed].error) <= 8192)
  assert.equal(state[next].status, "building")
  const jobs = await readdir(input.jobsIn)
  assert.equal(jobs.length, 1)
  assert.notEqual(jobs[0], id)
  assert.equal(JSON.parse(await readFile(join(input.jobsIn, jobs[0], "job.json"))).path, next)
  await assert.rejects(readFile(join(input.jobsOut, id, "result.json")), { code: "ENOENT" })
})

for (const invalid of ["symlink", "dangling symlink", "directory", "oversize"]) test(`invalid manifest ${invalid} fails its job instead of blocking publisher`, async t => {
  const input = await fixture(t)
  const next = path.replace(name, "20261115T120001Z.json")
  await writeFile(join(input.storage, next), content)
  await scanPublications(input)
  const [id] = await readdir(input.jobsIn)
  await scanPublications(input)
  assert.deepEqual(await readdir(input.jobsIn), [id], "a missing manifest still waits for the builder")
  const manifest = join(input.jobsOut, id, "result.json")
  if (invalid.endsWith("symlink")) {
    const { symlink } = await import("node:fs/promises")
    await symlink(join(input.storage, invalid === "symlink" ? path : "missing"), manifest)
  }
  if (invalid === "directory") await mkdir(manifest)
  if (invalid === "oversize") await writeFile(manifest, "x".repeat(65_537))
  await scanPublications(input)
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.equal(state[path].status, "failed")
  assert.ok(Buffer.byteLength(state[path].error) <= 8192)
  assert.equal(state[next].status, "building")
  assert.equal((await readdir(input.jobsIn)).length, 1)
  assert.notEqual((await readdir(input.jobsIn))[0], id)
})
