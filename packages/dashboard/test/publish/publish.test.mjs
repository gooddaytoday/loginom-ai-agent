import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { once } from "node:events"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { dashboardServer } from "../../src/web/server.ts"

const execute = promisify(execFile)
const script = resolve(import.meta.dirname, "../../script/publish.mjs")
const binding = {
  server: "http://127.0.0.1:32768",
  packagePath: "/user/dashboard/publish.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
  port: 0,
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-publish-"))
  const buildsRoot = join(root, "builds")
  const server = dashboardServer({ projectRoot: root, buildsRoot, appOrigin: "http://dashboards.localhost:32769", mode: "normal" })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const sample = { schema: [{ name: "value", type: 1 }], rows: [[42]] }
  const response = await fetch(base + "/dashboard/targets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ binding, nodeName: "Publish test", sample, parameters: [] }),
  })
  assert.equal(response.status, 201)
  const snapshot = await response.json()
  await mkdir(join(snapshot.sourceDir, "src"), { recursive: true })
  await writeFile(join(snapshot.sourceDir, "src/text.txt"), "first build")
  await writeFile(join(snapshot.sourceDir, "package.json"), JSON.stringify({
    type: "module", scripts: { typecheck: 'node -e ""', build: "node build.mjs" },
  }))
  await writeFile(join(snapshot.sourceDir, "build.mjs"), `
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
if (existsSync("src/fail")) process.exit(1)
await mkdir("dist/assets", { recursive: true })
const text = await readFile("src/text.txt", "utf8")
await writeFile("dist/index.html", "<p>" + text + "</p>")
await writeFile("dist/assets/app.js", "console.log(" + JSON.stringify(text) + ")")
`)
  const publish = (args = []) => execute(process.execPath, [...args, script, snapshot.id], {
    env: {
      ...process.env,
      PATH: dirname(process.execPath) + ":" + process.env.PATH,
      DASHBOARD_BASE: base,
      DASHBOARD_APPS: join(root, "dashboard/apps"),
      DASHBOARD_BUILDS: buildsRoot,
    },
  })
  return { snapshot, sample, publish, keyDir: join(buildsRoot, snapshot.key) }
}

test("publishing creates a complete hashed build with private metadata and current last", async t => {
  const { snapshot, sample, publish, keyDir } = await fixture(t)
  await publish()
  const current = await readFile(join(keyDir, "current"), "utf8")
  assert.match(current, /^[a-f0-9]{64}\n$/)
  const hash = current.trim()
  for (const file of ["index.html", "assets/app.js"]) {
    assert.deepEqual(await readFile(join(keyDir, hash, file)), await readFile(join(snapshot.sourceDir, "dist", file)))
  }
  assert.deepEqual(JSON.parse(await readFile(join(keyDir, "binding.json"), "utf8")), snapshot.binding)
  assert.deepEqual(JSON.parse(await readFile(join(keyDir, "sample.json"), "utf8")), sample)
  assert.deepEqual((await readdir(keyDir)).sort(), [hash, "binding.json", "current", "sample.json"].sort())
  assert.deepEqual((await readdir(join(keyDir, hash))).sort(), ["assets", "index.html"])
})

test("publishing identical bytes reuses the same build directory", async t => {
  const { publish, keyDir } = await fixture(t)
  await publish()
  const current = await readFile(join(keyDir, "current"), "utf8")
  await publish()
  assert.equal(await readFile(join(keyDir, "current"), "utf8"), current)
  assert.deepEqual((await readdir(keyDir)).filter(name => /^[a-f0-9]{64}$/.test(name)), [current.trim()])
  assert.equal((await readdir(keyDir)).some(name => name.startsWith(".build-") || name.endsWith(".tmp")), false)
})

test("publishing changed bytes switches current and preserves the old build", async t => {
  const { snapshot, publish, keyDir } = await fixture(t)
  await publish()
  const previous = (await readFile(join(keyDir, "current"), "utf8")).trim()
  await writeFile(join(snapshot.sourceDir, "src/text.txt"), "second build")
  await publish()
  const current = (await readFile(join(keyDir, "current"), "utf8")).trim()
  assert.notEqual(current, previous)
  assert.equal(await readFile(join(keyDir, previous, "index.html"), "utf8"), "<p>first build</p>")
  assert.equal(await readFile(join(keyDir, current, "index.html"), "utf8"), "<p>second build</p>")
  assert.deepEqual((await readdir(keyDir)).filter(name => /^[a-f0-9]{64}$/.test(name)).sort(), [previous, current].sort())
})

test("a failed build leaves current, metadata and build directories unchanged", async t => {
  const { snapshot, publish, keyDir } = await fixture(t)
  await publish()
  const names = ["current", "binding.json", "sample.json"]
  const before = await Promise.all(names.map(name => readFile(join(keyDir, name))))
  const directories = await readdir(keyDir)
  await writeFile(join(snapshot.sourceDir, "src/text.txt"), "broken build")
  await writeFile(join(snapshot.sourceDir, "src/fail"), "")
  await assert.rejects(publish(), { code: 1 })
  assert.deepEqual(await Promise.all(names.map(name => readFile(join(keyDir, name)))), before)
  assert.deepEqual(await readdir(keyDir), directories)
})

test("the version hash matches copied bytes when another build changes dist", async t => {
  const { snapshot, publish, keyDir } = await fixture(t)
  const preloader = join(snapshot.sourceDir, "concurrent-build.mjs")
  // Schedule a concurrent file replacement at the copy boundary, retaining real filesystem I/O.
  await writeFile(preloader, `
import { promises } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
const copy = promises.cp
promises.cp = async (...args) => {
  await promises.writeFile(${JSON.stringify(join(snapshot.sourceDir, "dist/index.html"))}, "<p>changed during publication</p>")
  return copy(...args)
}
syncBuiltinESMExports()
`)
  await publish(["--import", pathToFileURL(preloader).href])
  const hash = (await readFile(join(keyDir, "current"), "utf8")).trim()
  assert.equal(await readFile(join(keyDir, hash, "index.html"), "utf8"), "<p>changed during publication</p>")
  // Independent SHA-256 oracle over the two known files, using the documented path/NUL/length/NUL/bytes format.
  assert.equal(hash, "2278031d36dab9835118e5948a179ed6286460ca608e050acf9994b884899db0")
})
