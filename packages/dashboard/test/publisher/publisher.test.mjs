import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { once } from "node:events"
import { createServer } from "node:http"
import { scanPublications } from "../../src/publisher/index.ts"
import { buildNext } from "../../src/builder/index.ts"
import { dashboardServer } from "../../src/web/server.ts"
import { appHost } from "../../src/web/apps.ts"
import { createEventLog } from "../../src/log.ts"

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

test("publisher logs a verified build once after committing state", async t => {
  const input = await fixture(t)
  const builderImage = "sha256:" + "1".repeat(64)
  const ready = []
  const events = createEventLog("publisher", line => {
    const event = JSON.parse(line)
    if (event.event === "build_ready") ready.push({ event, state: JSON.parse(readFileSync(join(input.builds, "state.json")))[path] })
  })
  await scanPublications({ ...input, events, builderImage })
  const [id] = await readdir(input.jobsOut)
  assert.equal((await stat(join(input.jobsOut, id))).mode & 0o7777, 0o2770)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  for (const path of ["dist", "dist/assets"])
    assert.equal((await stat(join(input.jobsOut, id, path))).mode & 0o7777, 0o2770)
  await scanPublications({ ...input, events, builderImage })
  assert.deepEqual(await readdir(input.jobsOut), [])
  await scanPublications({ ...input, events, builderImage })
  assert.equal(ready.length, 1)
  assert.equal(ready[0].state.status, "ready")
  assert.equal(ready[0].event.publication, path)
  assert.equal(ready[0].event.sourceHash, createHash("sha256").update(content).digest("hex"))
  assert.equal(ready[0].event.key, ready[0].state.key)
  assert.equal(ready[0].event.buildHash, ready[0].state.buildHash)
  assert.equal(ready[0].event.template, 1)
  assert.equal(ready[0].event.builderImage, builderImage)
})

test("publisher rebuilds a ready publication after its output is truncated", async t => {
  const input = await fixture(t)
  const job = { ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
  const state = async () => JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  await scanPublications(input)
  await buildNext(job)
  await scanPublications(input)
  const original = await state()
  assert.equal(original.status, "ready")
  const entry = join(input.builds, original.key, original.buildHash, "index.html")
  const originalPage = await readFile(entry)
  await writeFile(entry, originalPage.subarray(0, 16))

  await scanPublications(input)
  assert.equal((await state()).status, "building")
  await buildNext(job)
  await scanPublications(input)
  assert.deepEqual(await state(), original)
  assert.deepEqual(await readFile(entry), originalPage)
})

test("publisher records invalid and oversized publications only once", async t => {
  const input = await fixture(t)
  const lines = []
  const events = createEventLog("publisher", line => lines.push(line))
  const mismatch = path.replace(name, "20261115T120001Z.json")
  const oversized = path.replace(name, "20261115T120002Z.json")
  await writeFile(join(input.storage, path), "{invalid-secret-source")
  await writeFile(join(input.storage, mismatch), content.replace("/user/fixture.lgp", "/user/another.lgp"))
  await writeFile(join(input.storage, oversized), "x".repeat(1_048_577))
  await scanPublications({ ...input, events })
  await scanPublications({ ...input, events })
  await scanPublications({ ...input, events, restart: true })
  assert.deepEqual(lines.map(line => {
    const { event, publication, code, sourceHash, key, buildHash, template, builderImage } = JSON.parse(line)
    assert.equal(event, "publication_rejected")
    assert.deepEqual([key, buildHash, template, builderImage], Array(4).fill(undefined))
    return { publication, code, sourceHash }
  }), [
    { publication: path, code: "DASHBOARD_PUBLICATION_INVALID", sourceHash: createHash("sha256").update("{invalid-secret-source").digest("hex") },
    { publication: mismatch, code: "DASHBOARD_BINDING_MISMATCH", sourceHash: createHash("sha256").update(content.replace("/user/fixture.lgp", "/user/another.lgp")).digest("hex") },
    { publication: oversized, code: "DASHBOARD_FILE_LIMIT", sourceHash: undefined },
  ])
  assert(!lines.some(line => line.includes("invalid-secret-source") || line.includes("/user/another.lgp")))
})

test("publisher logs discovery once and credits the image that was issued the restarted job", async t => {
  const input = await fixture(t)
  const original = "sha256:" + "1".repeat(64)
  const replacement = "sha256:" + "2".repeat(64)
  const lines = []
  const events = createEventLog("publisher", line => lines.push(JSON.parse(line)))
  await scanPublications({ ...input, events, builderImage: original })
  await scanPublications({ ...input, events, builderImage: original })
  await scanPublications({ ...input, events, builderImage: replacement, restart: true })
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications({ ...input, events, builderImage: original })
  await scanPublications({ ...input, events, builderImage: original, restart: true })
  assert.deepEqual(lines.map(event => [event.event, event.builderImage]), [
    ["publication_pending", undefined],
    ["build_started", original],
    ["build_started", replacement],
    ["build_ready", replacement],
  ])
})

test("publisher logs a real failed build once while retaining the previous ready version", async t => {
  const input = await fixture(t)
  const lines = []
  const scan = { ...input, events: createEventLog("publisher", line => lines.push(line)), builderImage: "sha256:" + "1".repeat(64) }
  const build = { ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE }
  await scanPublications(scan)
  await buildNext(build)
  await scanPublications(scan)
  const previous = JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  const failed = path.replace(name, "20261115T120001Z.json")
  const source = content.replace('document.body.textContent', 'const syntheticFailure: number')
  await writeFile(join(input.storage, failed), source)
  await scanPublications(scan)
  await buildNext(build)
  await scanPublications(scan)
  await scanPublications(scan)
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.deepEqual(state[path], previous)
  assert.ok(await readFile(join(input.builds, previous.key, previous.buildHash, "index.html")))
  const [event, ...repeats] = lines.map(line => JSON.parse(line)).filter(event => event.event === "build_failed")
  assert.equal(repeats.length, 0)
  assert.equal(event?.publication, failed)
  assert.equal(event?.code, "DASHBOARD_BUILD_FAILED")
  assert.equal(event?.key, previous.key)
  assert.equal(event?.sourceHash, createHash("sha256").update(source).digest("hex"))
  assert.equal(event?.builderImage, scan.builderImage)
  assert.equal(event?.buildHash, undefined)
  assert(!lines.some(line => line.includes("syntheticFailure") || line.includes("TS2322")))
})

test("an oversized edit made during a build cannot inherit the old source hash or result", async t => {
  const input = await fixture(t)
  const lines = []
  const scan = { ...input, events: createEventLog("publisher", line => lines.push(JSON.parse(line))) }
  await scanPublications(scan)
  await writeFile(join(input.storage, path), "x".repeat(1_048_577))
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(scan)
  await scanPublications(scan)
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  assert.equal(state.status, "failed")
  assert.equal(state.sourceHash, undefined)
  assert.equal(state.buildHash, undefined)
  assert.deepEqual(lines.map(event => event.event), ["publication_pending", "build_started", "publication_rejected"])
  assert.equal(lines.at(-1).sourceHash, undefined)
  assert.deepEqual(await readdir(input.jobsOut), [])
})

test("a throwing event writer cannot change ready or interrupt removal", async t => {
  const input = await fixture(t)
  const emitted = []
  const scan = { ...input, events: (event, fields) => {
    emitted.push([event, fields])
    throw Error("synthetic sink failure")
  } }
  await scanPublications(scan)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(scan)
  const ready = JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  assert.equal(ready.status, "ready")
  assert.ok(await readFile(join(input.builds, ready.key, ready.buildHash, "index.html")))
  await rm(join(input.storage, path))
  await scanPublications(scan)
  await scanPublications(scan)
  assert.deepEqual(emitted.map(([event]) => event), ["publication_pending", "build_started", "build_ready", "publication_removed"])
  assert.equal(emitted.at(-1)[1].publication, path)
  assert.equal(emitted.at(-1)[1].buildHash, ready.buildHash)
  assert.deepEqual(JSON.parse(await readFile(join(input.builds, "state.json"))), {})
  await assert.rejects(readFile(join(input.builds, ready.key, ready.buildHash, "index.html")), { code: "ENOENT" })
})

test("pending backlog keeps bounded payload memory before dispatch", async t => {
  const input = await fixture(t)
  const publication = { ...JSON.parse(content), files: [{ path: "src/main.tsx", encoding: "utf8", content: "/*" + "x".repeat(900 * 1024) + "*/" }] }
  for (let second = 0; second < 24; second++) {
    await writeFile(join(input.storage, path.replace(name, `20261115T1200${String(second).padStart(2, "0")}Z.json`)), JSON.stringify(publication))
  }
  // Isolate GC/resource measurement from the test runner and other compiler tests.
  // V8 frees unreachable ArrayBuffer backing stores on a background sweeper after gc() returns, so a
  // single reading can still count garbage when that thread is starved (CI saw ~12 MB of unswept
  // payloads). Every reading after a full GC is an upper bound on reachable bytes, so the minimum of
  // a few GC passes with yields settles the sweep without hiding payloads that are really retained.
  const output = execFileSync(process.env.LOGINOM_AI_AGENT_TEST_NODE ?? process.execPath, ["--expose-gc", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import fs from "node:fs/promises";
    import { syncBuiltinESMExports } from "node:module";
    import { setTimeout as delay } from "node:timers/promises";
    import { scanPublications } from ${JSON.stringify(new URL("../../src/publisher/index.ts", import.meta.url).href)};
    const input = JSON.parse(process.argv[1]);
    const readdir = fs.readdir;
    const settled = async () => {
      let bytes = Infinity;
      for (let pass = 0; pass < 5; pass++) {
        gc();
        bytes = Math.min(bytes, process.memoryUsage().arrayBuffers);
        await delay(10);
      }
      return bytes;
    };
    const baseline = await settled();
    let retained;
    fs.readdir = async (path, ...options) => {
      if (path === input.jobsIn && retained === undefined) {
        retained = await settled() - baseline;
      }
      return readdir(path, ...options);
    };
    syncBuiltinESMExports();
    await scanPublications(input);
    console.log("retained payload bytes:", retained);
    assert.ok(retained < 8 * 1024 * 1024, "pending payload memory: " + retained);
  `, JSON.stringify(input)], { encoding: "utf8", timeout: 15_000 })
  t.diagnostic(output.trim())
  assert.equal((await readdir(input.jobsIn)).length, 1)
})

test("multiple pending publications complete one at a time", async t => {
  const input = await fixture(t)
  const names = [name, "20261115T120001Z.json", "20261115T120002Z.json"]
  for (const [index, file] of names.entries()) {
    await writeFile(join(input.storage, path.replace(name, file)), content.replace("Synthetic dashboard", `Synthetic dashboard ${index}`))
  }
  await scanPublications(input)
  for (let completed = 0; completed < names.length; completed++) {
    const jobs = await readdir(input.jobsIn)
    assert.equal(jobs.length, 1)
    const job = JSON.parse(await readFile(join(input.jobsIn, jobs[0], "job.json")))
    const bytes = await readFile(join(input.jobsIn, jobs[0], "publication.json"))
    assert.deepEqual(bytes, await readFile(join(input.storage, job.path)))
    assert.equal(job.sourceHash, createHash("sha256").update(bytes).digest("hex"))
    const entries = Object.values(JSON.parse(await readFile(join(input.builds, "state.json"))))
    assert.equal(entries.filter(entry => entry.status === "building").length, 1)
    assert.equal(entries.filter(entry => entry.status === "pending").length, names.length - completed - 1)
    assert.equal(entries.filter(entry => entry.status === "ready").length, completed)
    await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
    await scanPublications(input)
  }
  assert.deepEqual(await readdir(input.jobsIn), [])
  assert.equal(Object.values(JSON.parse(await readFile(join(input.builds, "state.json")))).filter(entry => entry.status === "ready").length, 3)
  const apps = createServer().listen(0, "127.0.0.1")
  await once(apps, "listening")
  t.after(() => apps[Symbol.asyncDispose]())
  const appOrigin = "http://127.0.0.1:" + apps.address().port
  appHost({ server: apps, builds: key => join(input.builds, key), appOrigin, clientOrigins: [], mode: "normal" })
  const web = dashboardServer({ shell: new Uint8Array(), buildsRoot: input.builds, appOrigin, clientOrigins: [], mode: "normal" }).listen(0, "127.0.0.1")
  await once(web, "listening")
  t.after(() => web[Symbol.asyncDispose]())
  const current = await fetch("http://127.0.0.1:" + web.address().port + "/dashboard/lookup", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(binding),
  }).then(response => response.json())
  assert.equal(current.currentVersion.name, names.at(-1))
  const page = await fetch(appOrigin + `/apps/${current.key}/${current.hash}/`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Dashboard/)
})

test("published Vite assets with Unicode names and uppercase extensions are served", async t => {
  const input = await fixture(t)
  const publication = JSON.parse(content)
  const images = { "логотип.png": Buffer.alloc(5000, 1), "Logo.PNG": Buffer.alloc(5000, 2) }
  publication.files[0].content += '\nimport "./style.css"'
  publication.files.push({
    path: "src/style.css",
    encoding: "utf8",
    content: 'body { background-image: url("./логотип.png"), url("./Logo.PNG") }',
  })
  for (const [image, bytes] of Object.entries(images)) {
    publication.files.push({ path: "src/" + image, encoding: "base64", content: bytes.toString("base64") })
  }
  await writeFile(join(input.storage, path), JSON.stringify(publication))
  await scanPublications(input)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const ready = JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  assert.equal(ready.status, "ready", ready.error)

  const apps = createServer().listen(0, "127.0.0.1")
  await once(apps, "listening")
  t.after(() => apps[Symbol.asyncDispose]())
  const appOrigin = "http://127.0.0.1:" + apps.address().port
  appHost({ server: apps, builds: key => join(input.builds, key), appOrigin, clientOrigins: [], mode: "normal" })
  const address = `${appOrigin}/apps/${ready.key}/${ready.buildHash}/assets/`
  const assets = await readdir(join(input.builds, ready.key, ready.buildHash, "assets"))
  for (const [image, bytes] of Object.entries(images)) {
    const stem = image.slice(0, -4)
    const file = assets.find(asset => asset.startsWith(stem + "-") && asset.endsWith(image.slice(-4)))
    assert.ok(file, image)
    const response = await fetch(address + encodeURIComponent(file))
    assert.equal(response.status, 200, file)
    assert.equal(response.headers.get("content-type"), "image/png", file)
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable", file)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes, file)
  }
})

test("failed publications retain the previous dashboard through real files and HTTP", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const apps = createServer().listen(0, "127.0.0.1")
  await once(apps, "listening")
  const appOrigin = "http://127.0.0.1:" + apps.address().port
  appHost({ server: apps, builds: key => join(input.builds, key), appOrigin, clientOrigins: [], mode: "normal" })
  t.after(() => apps[Symbol.asyncDispose]())
  const web = dashboardServer({ shell: new Uint8Array(), buildsRoot: input.builds, appOrigin, clientOrigins: [], mode: "normal" }).listen(0, "127.0.0.1")
  await once(web, "listening")
  t.after(() => web[Symbol.asyncDispose]())
  const lookup = publication => fetch("http://127.0.0.1:" + web.address().port + "/dashboard/lookup", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...binding, ...(publication && { publication }) }),
  }).then(response => response.json())
  const before = await lookup()
  assert.equal(before.currentVersion.name, name)
  const address = appOrigin + `/apps/${before.key}/${before.hash}/`
  const page = await (await fetch(address)).text()
  const invalid = [
    "{broken",
    content.replace("/user/fixture.lgp", "/shared/other.lgp"),
    content.replace('"template":1', '"template":2'),
    content.replace(binding.workflowGuid, "invalid-guid"),
    JSON.stringify({ ...JSON.parse(content), files: [{ path: "src/main.tsx", encoding: "utf8", content: Array.from({ length: 1000 }, (_, i) => `const x${i}: number = "synthetic"`).join("\n") }] }),
    JSON.stringify({ ...JSON.parse(content), files: [{ path: "src/main.tsx", encoding: "utf8", content: 'import "https://synthetic.invalid/module.js"' }] }),
  ]
  for (const [index, source] of invalid.entries()) {
    const failedName = `20261115T12000${index + 1}Z.json`
    await writeFile(join(input.storage, path.replace(name, failedName)), source)
    await scanPublications(input)
    await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
    await scanPublications(input)
    const after = await lookup(failedName)
    assert.equal(after.publication.status, "failed", failedName)
    assert.equal(after.publication.name, failedName)
    assert.ok(Buffer.byteLength(after.publication.error) <= 8192)
    assert.equal(after.key, before.key)
    assert.equal(after.hash, before.hash)
    assert.deepEqual(after.currentVersion, before.currentVersion)
    assert.equal((await fetch(address)).status, 200)
    assert.equal(await (await fetch(address)).text(), page)
  }
  const other = "20261115T120007Z.json"
  await writeFile(join(input.storage, path.replace(name, other)), content.replace(binding.workflowGuid, "33333333-3333-4333-8333-333333333333"))
  await scanPublications(input)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const unchanged = await lookup(other)
  assert.equal(unchanged.key, before.key)
  assert.equal(unchanged.hash, before.hash)
  assert.deepEqual(unchanged.currentVersion, before.currentVersion)
  assert.equal(unchanged.publication.status, "pending")
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.notEqual(state[path.replace(name, other)].key, before.key)
  const oversized = "20261115T120008Z.json"
  await writeFile(join(input.storage, path.replace(name, oversized)), content)
  await scanPublications(input)
  const [id] = await readdir(input.jobsIn)
  const job = JSON.parse(await readFile(join(input.jobsIn, id, "job.json")))
  await mkdir(join(input.jobsOut, id, "dist"))
  await writeFile(join(input.jobsOut, id, "dist/index.html"), Buffer.alloc(20 * 1024 * 1024 + 1))
  await writeFile(join(input.jobsOut, id, "result.json"), JSON.stringify({ id, sourceHash: job.sourceHash, outcome: "ready", output: "" }))
  await scanPublications(input)
  const refused = await lookup(oversized)
  assert.equal(refused.publication.status, "failed")
  assert.match(refused.publication.error, /LIMIT/)
  assert.equal(refused.hash, before.hash)
  assert.equal(await (await fetch(address)).text(), page)
  await rm(join(input.storage, path.replace(name, oversized)))
  await scanPublications(input)
  const missing = await lookup(oversized)
  assert.equal(missing.publication.status, "pending")
  assert.equal(missing.hash, before.hash)
  assert.equal(await (await fetch(address)).text(), page)
})

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

test("publisher clears orphan output before issuing a fresh attempt", async t => {
  const input = await fixture(t)
  const { createHash } = await import("node:crypto")
  const sourceHash = createHash("sha256").update(content).digest("hex")
  const id = createHash("sha256").update(path).update(sourceHash).digest("hex")
  await mkdir(join(input.jobsOut, id, "dist"), { recursive: true })
  await writeFile(join(input.jobsOut, id, "dist/index.html"), "stale")
  await scanPublications(input)
  const [issued] = await readdir(input.jobsIn)
  assert.notEqual(issued, id)
  assert.deepEqual(await readdir(input.jobsOut), [issued])
  assert.deepEqual(await readdir(join(input.jobsOut, issued)), [])
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

test("deleting publications rolls back without rebuilding and retains shared output until its last source is removed", async t => {
  const input = await fixture(t)
  const web = dashboardServer({ shell: new Uint8Array(), buildsRoot: input.builds, appOrigin: "http://apps.test", clientOrigins: [], mode: "normal" }).listen(0, "127.0.0.1")
  await once(web, "listening")
  t.after(() => web[Symbol.asyncDispose]())
  const lookup = () => fetch("http://127.0.0.1:" + web.address().port + "/dashboard/lookup", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(binding),
  }).then(response => response.json())
  const publish = async (file, source) => {
    await writeFile(join(input.storage, path.replace(name, file)), source)
    await scanPublications(input)
    await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
    await scanPublications(input)
    return lookup()
  }
  const a = await publish(name, content)
  const bName = "20261115T120001Z.json"
  await publish(bName, "{broken")
  assert.equal((await lookup()).hash, a.hash)
  await rm(join(input.storage, path.replace(name, bName)))
  await scanPublications(input)
  assert.equal((await lookup()).hash, a.hash)
  const cName = "20261115T120002Z.json"
  const c = await publish(cName, content.replace("Synthetic dashboard", "Synthetic newer dashboard"))
  assert.equal(c.currentVersion.name, cName)
  assert.notEqual(c.hash, a.hash)
  await rm(join(input.storage, path.replace(name, cName)))
  await scanPublications(input)
  assert.equal((await lookup()).hash, a.hash)
  assert.deepEqual(await readdir(input.jobsIn), [], "rollback does not build again")
  await assert.rejects(readFile(join(input.builds, c.key, c.hash, "index.html")), { code: "ENOENT" })
  const shared = await publish(cName, content)
  assert.equal(shared.hash, a.hash)
  await rm(join(input.storage, path))
  await scanPublications(input)
  assert.equal((await lookup()).currentVersion.name, cName)
  assert.ok(await readFile(join(input.builds, a.key, a.hash, "index.html")))
  await mkdir(join(input.builds, "unrelated"))
  await writeFile(join(input.builds, "unrelated/keep"), "synthetic unrelated data")
  await mkdir(join(input.builds, a.key, "unrelated"))
  await writeFile(join(input.builds, a.key, "unrelated/keep"), "synthetic unrelated data")
  await rm(join(input.storage, path, ".."), { recursive: true })
  await scanPublications(input)
  assert.equal((await lookup()).exists, false)
  assert.deepEqual(await readdir(input.jobsIn), [])
  await assert.rejects(readFile(join(input.builds, a.key, a.hash, "index.html")), { code: "ENOENT" })
  assert.equal(await readFile(join(input.builds, "unrelated/keep"), "utf8"), "synthetic unrelated data")
  assert.equal(await readFile(join(input.builds, a.key, "unrelated/keep"), "utf8"), "synthetic unrelated data")
})

test("restart retains verified builds and reissues unfinished work once without trusting old manifests", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const ready = JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  const bytes = await readFile(join(input.builds, ready.key, ready.buildHash, "index.html"))
  const pending = path.replace(name, "20261115T120001Z.json")
  const failed = path.replace(name, "20261115T120002Z.json")
  await writeFile(join(input.storage, pending), content.replace("Synthetic dashboard", "Synthetic restart"))
  await writeFile(join(input.storage, failed), "{broken")
  await scanPublications(input)
  const [old] = await readdir(input.jobsIn)
  const job = JSON.parse(await readFile(join(input.jobsIn, old, "job.json")))
  await writeFile(join(input.jobsOut, old, "result.json"), JSON.stringify({ id: old, sourceHash: job.sourceHash, outcome: "failed", output: "stale failure" }))
  for (const root of [input.jobsIn, input.jobsOut]) await writeFile(join(root, "unrelated"), "keep")
  await scanPublications({ ...input, restart: true })
  const ids = (await readdir(input.jobsIn)).filter(id => id !== "unrelated")
  assert.equal(ids.length, 1)
  assert.notEqual(ids[0], old, "a surviving old builder cannot write into the new attempt")
  assert.deepEqual(await readdir(join(input.jobsOut, ids[0])), [])
  assert.deepEqual((await readdir(input.jobsOut)).sort(), [ids[0], "unrelated"].sort())
  const state = JSON.parse(await readFile(join(input.builds, "state.json")))
  assert.deepEqual(state[path], ready)
  assert.equal(state[failed].status, "failed")
  assert.equal(state[pending].status, "building")
  assert.deepEqual(await readFile(join(input.builds, ready.key, ready.buildHash, "index.html")), bytes)
  // A manifest from the retired attempt arriving after startup cannot affect this job.
  await mkdir(join(input.jobsOut, old))
  await writeFile(join(input.jobsOut, old, "result.json"), JSON.stringify({ id: old, sourceHash: job.sourceHash, outcome: "failed", output: "late failure" }))
  await scanPublications(input)
  assert.deepEqual((await readdir(input.jobsIn)).sort(), [ids[0], "unrelated"].sort())
  assert.deepEqual((await readdir(input.jobsOut)).sort(), [ids[0], "unrelated"].sort())
  assert.equal(JSON.parse(await readFile(join(input.builds, "state.json")))[pending].status, "building")
  // State may survive a lost input job too.
  await rm(join(input.jobsIn, ids[0]), { recursive: true })
  await scanPublications({ ...input, restart: true })
  const next = (await readdir(input.jobsIn)).filter(id => id !== "unrelated")
  assert.equal(next.length, 1)
  assert.notEqual(next[0], ids[0])
  assert.deepEqual(await readdir(join(input.jobsOut, next[0])), [])
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  assert.equal(JSON.parse(await readFile(join(input.builds, "state.json")))[pending].status, "ready")
  await scanPublications(input)
  assert.deepEqual(await readdir(input.jobsIn), ["unrelated"])
  assert.deepEqual(await readdir(input.jobsOut), ["unrelated"])
})

test("deleting an in-flight source discards its completed result", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  await rm(join(input.storage, path))
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  assert.deepEqual(JSON.parse(await readFile(join(input.builds, "state.json"))), {})
  assert.deepEqual(await readdir(input.jobsIn), [])
  assert.deepEqual(await readdir(input.jobsOut), [])
  assert.deepEqual(await readdir(input.builds), ["state.json"])
})

test("changed bytes at the same name invalidate an old result while unchanged failures stay settled", async t => {
  const input = await fixture(t)
  await scanPublications(input)
  const [old] = await readdir(input.jobsIn)
  const hash = JSON.parse(await readFile(join(input.jobsIn, old, "job.json"))).sourceHash
  await writeFile(join(input.storage, path), content.replace("Synthetic dashboard", "Synthetic changed dashboard"))
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const changed = JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  assert.notEqual(changed.sourceHash, hash)
  assert.equal(changed.status, "building")
  assert.equal(changed.buildHash, undefined)
  assert.notEqual((await readdir(input.jobsIn))[0], old)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  assert.equal(JSON.parse(await readFile(join(input.builds, "state.json")))[path].status, "ready")
  await writeFile(join(input.storage, path), "{broken")
  await scanPublications(input)
  const failed = JSON.parse(await readFile(join(input.builds, "state.json")))[path]
  assert.equal(failed.status, "failed")
  assert.equal(failed.buildHash, undefined)
  await scanPublications(input)
  assert.deepEqual(JSON.parse(await readFile(join(input.builds, "state.json")))[path], failed)
  assert.deepEqual(await readdir(input.jobsIn), [])
  await writeFile(join(input.storage, path), content)
  await scanPublications(input)
  assert.equal(JSON.parse(await readFile(join(input.builds, "state.json")))[path].status, "building")
  assert.equal((await readdir(input.jobsIn)).length, 1)
})

test("finishing an older publication cannot roll back a newer ready version", async t => {
  const input = await fixture(t)
  const newer = "20261115T120005Z.json"
  await writeFile(join(input.storage, path.replace(name, newer)), content)
  await rm(join(input.storage, path))
  await scanPublications(input)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const web = dashboardServer({ shell: new Uint8Array(), buildsRoot: input.builds, appOrigin: "http://apps.test", clientOrigins: [], mode: "normal" }).listen(0, "127.0.0.1")
  await once(web, "listening")
  t.after(() => web[Symbol.asyncDispose]())
  const lookup = () => fetch("http://127.0.0.1:" + web.address().port + "/dashboard/lookup", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(binding),
  }).then(response => response.json())
  const before = await lookup()
  await writeFile(join(input.storage, path), content.replace("Synthetic dashboard", "Synthetic older dashboard"))
  await scanPublications(input)
  await buildNext({ ...input, template: resolve("template"), node: process.env.LOGINOM_AI_AGENT_TEST_NODE })
  await scanPublications(input)
  const after = await lookup()
  assert.equal(JSON.parse(await readFile(join(input.builds, "state.json")))[path].status, "ready")
  assert.equal(after.hash, before.hash)
  assert.deepEqual(after.currentVersion, before.currentVersion)
})
