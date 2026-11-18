import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import test from "node:test"
import { buildDashboard } from "../../src/agent/build.ts"
import { buildSources, treeHash } from "../../src/builder/build.ts"
import { buildNext } from "../../src/builder/index.ts"

test("draft and server build the same example without server pruning previous results", async t => {
  const root = await mkdtemp(join(tmpdir(), "shared-build-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = { work: join(root, "work"), template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
  await cp(resolve("examples/channel-summary/src"), join(input.work, "src"), { recursive: true })
  const draft = await buildDashboard({ ...input, out: join(root, "draft") })
  const out = join(root, "server")
  await mkdir(join(out, "previous"), { recursive: true })
  await writeFile(join(out, "previous/index.html"), "previous")
  const server = await buildSources({ ...input, out })
  assert.equal(draft.ok, true, draft.output)
  assert.equal(server.ok, true, server.output)
  assert.equal(draft.hash, server.hash)
  assert.deepEqual((await readdir(out)).sort(), [server.hash, "previous"].sort())
})

test("concurrent different drafts retain both committed outputs", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "concurrent-different-build-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = { out: join(root, "draft"), template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
  for (const name of ["first", "second"]) {
    await mkdir(join(root, name, "src"), { recursive: true })
    await writeFile(join(root, name, "src/main.tsx"), `document.body.textContent = "Synthetic ${name} dashboard"`)
  }
  const fs = (await import("node:fs/promises")).default
  const { syncBuiltinESMExports } = await import("node:module")
  const unlink = fs.unlink
  const built = Promise.withResolvers()
  const resume = Promise.withResolvers()
  let held = false
  t.mock.method(fs, "unlink", async path => {
    if (!held && basename(path) === "node_modules") {
      held = true
      built.resolve()
      await resume.promise
    }
    return unlink(path)
  })
  syncBuiltinESMExports()
  t.after(() => { resume.resolve(); t.mock.restoreAll(); syncBuiltinESMExports() })
  const pending = buildDashboard({ ...input, work: join(root, "first") })
  await built.promise
  const second = await buildDashboard({ ...input, work: join(root, "second") })
  resume.resolve()
  const first = await pending
  assert.equal(first.ok, true, first.output)
  assert.equal(second.ok, true, second.output)
  assert.notEqual(first.hash, second.hash)
  assert.equal(await fs.readFile(join(input.out, "current"), "utf8"), first.hash + "\n")
  for (const build of [first, second]) {
    assert.match(await fs.readFile(join(build.dir, "index.html"), "utf8"), /Dashboard/)
    assert.equal(await treeHash(build.dir), build.hash)
  }
  assert.deepEqual((await readdir(input.out)).sort(), [first.hash, second.hash, "current"].sort())
})

test("concurrent identical drafts both reuse the installed hash", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "concurrent-build-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = { work: join(root, "work"), out: join(root, "draft"), template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
  await mkdir(join(input.work, "src"), { recursive: true })
  await writeFile(join(input.work, "src/main.tsx"), 'document.body.textContent = "Synthetic concurrent dashboard"')
  const fs = (await import("node:fs/promises")).default
  const { syncBuiltinESMExports } = await import("node:module")
  const original = fs.rename
  const gate = Promise.withResolvers()
  let installations = 0
  fs.rename = async (from, to) => {
    if (basename(from) === "dist" && /^[a-f0-9]{64}$/.test(basename(to))) {
      if (++installations === 2) gate.resolve()
      await gate.promise
    }
    return original(from, to)
  }
  syncBuiltinESMExports()
  t.after(() => { gate.resolve(); fs.rename = original; syncBuiltinESMExports() })
  const results = await Promise.allSettled([buildDashboard(input), buildDashboard(input)])
  assert.equal(installations, 2)
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"])
  assert.ok(results.every(result => result.value.ok), JSON.stringify(results))
  assert.equal(results[0].value.hash, results[1].value.hash)
  assert.equal(await fs.readFile(join(input.out, "current"), "utf8"), results[0].value.hash + "\n")
  assert.deepEqual((await readdir(input.out)).sort(), [results[0].value.hash, "current"].sort())
})

test("a restarted builder completes a job with partially copied output", async t => {
  const root = await mkdtemp(join(tmpdir(), "restarted-builder-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const id = "a".repeat(64)
  const input = { jobsIn: join(root, "jobs-in"), jobsOut: join(root, "jobs-out"), template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
  const output = join(input.jobsOut, id)
  await mkdir(join(input.jobsIn, id), { recursive: true })
  await mkdir(join(output, "dist/assets"), { recursive: true })
  await writeFile(join(output, "dist/assets/partial.js"), "incomplete output")
  await writeFile(join(input.jobsIn, id, "publication.json"), JSON.stringify({ format: 1, template: 1,
    binding: { packagePath: "/user/fixture.lgp", workflowGuid: "11111111-1111-4111-8111-111111111111", nodeGuid: "22222222-2222-4222-8222-222222222222" },
    title: "Synthetic restarted job", parameters: [], files: [{ path: "src/main.tsx", encoding: "utf8", content: 'document.body.textContent = "Synthetic restarted job"' }],
  }))

  await buildNext(input)

  const result = JSON.parse(await readFile(join(output, "result.json"), "utf8"))
  assert.equal(result.outcome, "ready", result.output)
  assert.match(await readFile(join(output, "dist/index.html"), "utf8"), /Dashboard/)
  await assert.rejects(readFile(join(output, "dist/assets/partial.js")), { code: "ENOENT" })
})

test("retired builder cannot recreate output removed after it reads the job", async t => {
  const root = await mkdtemp(join(tmpdir(), "retired-builder-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const id = "a".repeat(64)
  const input = { jobsIn: join(root, "jobs-in"), jobsOut: join(root, "jobs-out"), template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
  await mkdir(join(input.jobsIn, id), { recursive: true })
  await mkdir(join(input.jobsOut, id), { recursive: true })
  await writeFile(join(input.jobsIn, id, "publication.json"), JSON.stringify({ format: 1, template: 1,
    binding: { packagePath: "/user/fixture.lgp", workflowGuid: "11111111-1111-4111-8111-111111111111", nodeGuid: "22222222-2222-4222-8222-222222222222" },
    title: "Synthetic retired job", parameters: [], files: [{ path: "src/main.tsx", encoding: "utf8", content: 'document.body.textContent = "Synthetic retired job"' }],
  }))
  const fs = (await import("node:fs/promises")).default
  const { syncBuiltinESMExports } = await import("node:module")
  const original = fs.readFile
  fs.readFile = async (file, ...options) => {
    const bytes = await original(file, ...options)
    if (file === join(input.jobsIn, id, "publication.json")) await rm(join(input.jobsOut, id), { recursive: true })
    return bytes
  }
  syncBuiltinESMExports()
  try {
    await buildNext(input).catch(error => assert.equal(error.code, "ENOENT"))
  } finally {
    fs.readFile = original
    syncBuiltinESMExports()
  }
  await assert.rejects(readdir(join(input.jobsOut, id)), { code: "ENOENT" })
})
