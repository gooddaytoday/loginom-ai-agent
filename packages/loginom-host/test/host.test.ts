import { expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { credentials } from "../src/connection/credentials"
import { connectionStore } from "../src/connection/connection-store"

test("shared host can manage an unconfigured profile without Electron or starting a runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-host-"))
  try {
    const host = await createLoginomHost({
      root: directory,
      resources: join(directory, "absent-resources"),
      codec: credentials("linux"),
      environment: {},
      headless: true,
    })
    expect(await host.api.status()).toMatchObject({ state: "unconfigured" })
    expect(host.acquire("test-run")).toBeUndefined()
    expect(await readdir(directory)).not.toContain("runtime")
    await host.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("failed readiness cleanup cannot acknowledge host shutdown", async () => {
  const fixture = await startupFixture(false)
  try {
    await fixture.host.settled()
    expect(await fixture.host.api.status()).toMatchObject({ state: "recoverable-error" })
    await expect(fixture.host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
  } finally {
    await fixture.host.close().catch(() => undefined)
    await rm(fixture.directory, { recursive: true, force: true })
  }
}, 15000)

test("clean readiness failure remains recoverable and permits host shutdown", async () => {
  const fixture = await startupFixture(true)
  try {
    await fixture.host.settled()
    expect(await fixture.host.api.status()).toMatchObject({ state: "recoverable-error" })
    expect(fixture.host.acquire("unavailable-run")).toBeUndefined()
    await fixture.host.close()
  } finally {
    await fixture.host.close().catch(() => undefined)
    await rm(fixture.directory, { recursive: true, force: true })
  }
}, 15000)

async function startupFixture(closed: boolean) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-readiness-cleanup-"))
  const root = join(directory, "profile")
  const resources = join(directory, "resources")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime", "src"), { recursive: true })
  await copyFile(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test/mcp" }))
  await writeFile(
    join(resources, "runtime", "src", "managed-entry.mjs"),
    `process.on('message', message => {
      if (message.operation === 'start') process.send({id:message.id,error:'LOGINOM_BROWSER_START_FAILED'});
      if (message.operation === 'close') process.send({id:message.id,result:{closed:${closed}}},()=>process.disconnect());
    });`,
  )
  const codec = credentials("linux")
  const store = connectionStore(join(root, "connection"), codec)
  await store.stage({
    generation: 1,
    revision: 1,
    url: "https://example.test/app/",
    username: "fixture",
    apiKey: "fixture",
    password: "",
  })
  await store.activate(1)
  const host = await createLoginomHost({ root, resources, codec, environment: {}, headless: true })
  return { directory, host }
}
