import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { dashboardServer } from "./server.mjs"

const binding = {
  server: "http://127.0.0.1:32768",
  packagePath: "/user/dashboard/A.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
  port: 0,
}
const other = { ...binding, packagePath: "/user/dashboard/B.lgp" }

async function stand(t) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-test-"))
  const server = dashboardServer({ projectRoot: root, publishRoot: join(root, "published") })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  return async (path, body) => {
    const options = body && {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)}
    const response = await fetch(`http://127.0.0.1:${server.address().port}/dashboard/${path}`, options)
    assert.ok(response.ok, `${path} returned ${response.status}`)
    return response.json()
  }
}

test("a package path separates applications even when node GUIDs match", async t => {
  const request = await stand(t)
  const a = await request("lookup", binding)
  const b = await request("lookup", other)
  assert.notEqual(a.key, b.key)
  assert.deepEqual(await request("lookup", binding), a)
  assert.equal(a.exists, false)
})

test("the first snapshot stays available by ID after opening another node", async t => {
  const request = await stand(t)
  const data = {
    binding, nodeName: "По убыванию ROI", schema: [{name: "budget", type: 3}], rows: [[500]],
    parameters: [{name: "MinBudget", value: 0}],
  }
  const a = await request("targets", data)
  await request("lookup", other)
  assert.deepEqual(await request("current"), a)
  const b = await request("targets", {...data, binding: other, rows: [[245]]})
  assert.notEqual(a.id, b.id)
  assert.notEqual(a.sourceDir, b.sourceDir)
  assert.deepEqual(a.binding, binding)
  assert.deepEqual(a.rows, data.rows)
  assert.deepEqual(await request("targets/" + a.id), a)
  assert.deepEqual(await request("current"), b)
})
