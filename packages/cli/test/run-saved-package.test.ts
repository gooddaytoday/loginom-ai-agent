import { afterAll, beforeAll, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ServiceHost } from "@loginom-ai-agent/loginom-agent/host"
import { Standalone } from "../src/standalone"

// B6.1-C: 0.4.2 passed `closeSavedPackageOnShutdown: mode === "run"` to its Host (`standalone-run.ts`), so the runtime wrote
// `saved-package-cleanup.json`. Here the run's private server starts the Host with that flag; the Host is a stand-in that
// records the `start` it received, so nothing needs Loginom, a browser or a model.
const fixture = { directory: "", resources: "" }
beforeAll(async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  fixture.directory = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-run-close-"))
  fixture.resources = path.join(fixture.directory, "resources")
  await fs.mkdir(path.join(fixture.resources, "bin"), { recursive: true })
  await fs.mkdir(path.join(fixture.resources, "host"), { recursive: true })
  await fs.symlink(node, path.join(fixture.resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
  await Bun.write(
    path.join(fixture.resources, "host", "node-host.mjs"),
    `import { appendFileSync } from 'node:fs'
process.on('message', (m) => {
  if (m.method === 'start') {
    appendFileSync(${JSON.stringify(path.join(fixture.directory, "starts.jsonl"))}, JSON.stringify(m.input) + '\\n')
    process.send({ id: m.id, result: { protocol: 1, ready: true, pid: process.pid } })
  }
  if (m.method === 'close') process.send({ id: m.id, result: { closed: true } }, () => process.disconnect())
})
`,
  )
})
afterAll(() => fs.rm(fixture.directory, { recursive: true, force: true }))

async function started(args: string[]) {
  const saved = { ...process.env }
  await fs.rm(path.join(fixture.directory, "starts.jsonl"), { force: true })
  // The state of a product CLI process: `forward` records the run's mode in the environment its private server inherits.
  process.env.LOGINOM_AI_AGENT_CLI_ROOT = path.join(fixture.directory, "profile")
  Standalone.forward(args, fixture.directory, process.env)
  try {
    const data = path.join(fixture.directory, "profile")
    await ServiceHost.start({ data, resources: fixture.resources })
    await ServiceHost.close()
    return (await fs.readFile(path.join(fixture.directory, "starts.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
}

test("the Host of a run closes the saved package at shutdown; the Host of serve does not", async () => {
  expect(await started(["run", "hi"])).toMatchObject([{ closeSavedPackageOnShutdown: true }])
  expect(await started(["run", "--headless", "hi"])).toMatchObject([{ closeSavedPackageOnShutdown: true }])
  expect(await started(["serve", "--stdio"])).toMatchObject([{ closeSavedPackageOnShutdown: false }])
}, 30_000)
