import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import test from "node:test"
import { pathToFileURL } from "node:url"

const binding = {
  packagePath: "/user/dashboard/A.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
}

async function ephemeral() {
  const listener = createServer().listen(0, "127.0.0.1")
  await once(listener, "listening")
  const chosen = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  return chosen
}

async function launch(t, root, artifact) {
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
      DASHBOARD_CLI_BUTTON: "1",
      DASHBOARD_PUBLIC_HOSTS: undefined,
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
  const { base, appOrigin } = await launch(t, root, artifact)
  const response = await fetch(base + "/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      binding,
      nodeName: "Standalone snapshot",
      sample: { schema: [{ name: "n", type: 3 }], rows: [[42]] },
      published: false,
      parameters: [],
    }),
  })
  assert.equal(response.status, 201)
  const target = await response.json()
  assert.deepEqual(Object.keys(target), ["id"])
  const saved = await fetch(base + "/snapshots/" + target.id)
  assert.equal(saved.status, 200)
  const snapshot = await saved.json()
  assert.deepEqual(snapshot.sample.rows, [[42]])
  assert.deepEqual(snapshot.binding, binding)
  assert.equal((await fetch(base + "/snapshots/" + target.id)).status, 404)
  const lookup = await fetch(base + "/lookup", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(binding),
  })
  assert.equal((await lookup.json()).cliButton, true)
  const bundle = await import(pathToFileURL(artifact).href)
  assert.equal(typeof bundle.bindingKey, "function")
  assert.match(await bundle.bindingKey(binding), /^[a-f0-9]{64}$/)
  const app = await fetch(base + "/apps/" + key + "/")
  assert.equal(app.status, 404)
  const page = await fetch(`${appOrigin}/apps/${key}/${hash}/`)
  assert.equal(page.status, 200)
  assert.ok(page.headers.get("content-security-policy"))
  assert.equal(await page.text(), "Existing dashboard")
  const outside = join(root, "outside")
  await mkdir(join(outside, hash), { recursive: true })
  await writeFile(join(outside, hash, "index.html"), "Outside dashboard")
  for (const [alias, target] of [["c".repeat(64), outside], ["d".repeat(64), join(root, "builds", key)]]) {
    await symlink(target, join(root, "builds", alias), process.platform === "win32" ? "junction" : "dir")
    const response = await fetch(`${appOrigin}/apps/${alias}/${hash}/`)
    assert.equal(response.status, 404)
    assert.ok(response.headers.get("content-security-policy"))
  }
})

