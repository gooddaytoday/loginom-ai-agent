import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { buildDashboard } from "../../src/agent/build.ts"
import { buildSources } from "../../src/builder/build.ts"

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
