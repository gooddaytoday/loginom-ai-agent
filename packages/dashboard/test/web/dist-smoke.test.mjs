import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { setTimeout } from "node:timers/promises"
import test from "node:test"

const binding = {
  server: "http://127.0.0.1:32768",
  packagePath: "/user/dashboard/A.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
  port: 0,
}

async function ephemeral() {
  const listener = createServer().listen(0, "127.0.0.1")
  await once(listener, "listening")
  const chosen = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  return chosen
}

async function launch(t, root, artifact, projectRoot) {
  // Choose ephemeral ports before launching the real standalone entry point.
  const apiPort = await ephemeral()
  const appPort = await ephemeral()
  const appOrigin = `http://127.0.0.1:${appPort}`
  const child = spawn(process.env.LOGINOM_AI_AGENT_TEST_NODE ?? process.execPath, [artifact], {
    cwd: root,
    env: {
      ...process.env,
      DASHBOARD_PORT: String(apiPort),
      DASHBOARD_APP_PORT: String(appPort),
      DASHBOARD_HOST: "127.0.0.1",
      DASHBOARD_BUILDS: join(root, "builds"),
      DASHBOARD_APP_ORIGIN: appOrigin,
      DASHBOARD_CLIENT_ORIGINS: `http://127.0.0.1:${apiPort}`,
      DASHBOARD_PROJECT_ROOT: projectRoot,
      DASHBOARD_PUBLISH_ROOT: undefined,
      DASHBOARD_PUBLIC_HOSTS: undefined,
      DASHBOARD_ALLOW_CURRENT: undefined,
      DASHBOARD_MODE: undefined,
    },
    stdio: ["ignore", "ignore", "pipe"],
  })
  let stderr = ""
  child.stderr.setEncoding("utf8").on("data", (data) => {
    stderr += data
  })
  const exited = once(child, "exit")
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await exited
  })
  const base = `http://127.0.0.1:${apiPort}/dashboard`
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, stderr)
    try {
      await fetch(base + "/current")
      await fetch(appOrigin + "/")
      return { base, appOrigin }
    } catch (error) {
      if (attempt === 99) throw error
      await setTimeout(25)
    }
  }
}

test("the standalone Node bundle preserves snapshot HTTP and an existing publication", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-dist-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  // Copy only the artifact: its new directory has no workspace or node_modules.
  const artifact = join(root, "server.mjs")
  await copyFile(new URL("../../dist/server.mjs", import.meta.url), artifact)
  const key = "a".repeat(64)
  const hash = "b".repeat(64)
  await mkdir(join(root, "builds", key, hash), { recursive: true })
  await writeFile(join(root, "builds", key, hash, "index.html"), "Existing dashboard")
  const { base, appOrigin } = await launch(t, root, artifact, root)
  const response = await fetch(base + "/targets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      binding,
      nodeName: "Standalone snapshot",
      schema: [{ name: "n", type: 3 }],
      rows: [[42]],
      parameters: [],
    }),
  })
  assert.equal(response.status, 201)
  const target = await response.json()
  assert.equal(target.sourceDir, join(root, "dashboard/apps", target.key))
  assert.deepEqual(target.rows, [[42]])
  assert.deepEqual(target.binding, binding)
  const saved = await fetch(base + "/targets/" + target.id)
  assert.equal(saved.status, 200)
  assert.deepEqual(await saved.json(), target)
  const app = await fetch(base + "/apps/" + key + "/")
  assert.equal(app.status, 404)
  const page = await fetch(`${appOrigin}/apps/${key}/${hash}/`)
  assert.equal(page.status, 200)
  assert.ok(page.headers.get("content-security-policy"))
  assert.equal(await page.text(), "Existing dashboard")
})

test("the bundled entry point derives its checkout while launched from another directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-dist-root-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { base } = await launch(t, root, resolve(import.meta.dirname, "../../dist/server.mjs"))
  const response = await fetch(base + "/targets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ binding, nodeName: "Bundle checkout", sample: null, parameters: [] }),
  })
  assert.equal(response.status, 201)
  const target = await response.json()
  const checkout = resolve(import.meta.dirname, "../../../..")
  assert.equal(target.sourceDir, join(checkout, "dashboard/apps", target.key))
  assert.equal(target.commands.publish, `node '${join(checkout, "packages/dashboard/script/publish.mjs")}' ${target.id}`)
})
