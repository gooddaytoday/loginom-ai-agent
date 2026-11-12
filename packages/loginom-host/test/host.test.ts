import { expect, test } from "bun:test"
import { access, copyFile, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createLoginomHost } from "../src/host"
import { writeHelp } from "../../loginom-runtime/client/test/support/help-fixture.mjs"
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

test.each([true, false])(
  "browser startup warning requires confirmed cleanup: %s",
  async (closed) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-validation-cleanup-"))
    const resources = join(directory, "resources")
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime", "src"), { recursive: true })
    await copyFile(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({}))
    await writeFile(
      join(resources, "runtime", "src", "knowledge-entry.mjs"),
      `process.on('message', message => {
        if (message.operation === 'start') process.send({id:message.id,result:{protocol:1,generation:message.input.generation,started:true}});
        if (message.operation === 'list') process.send({id:message.id,result:{tools:[]}});
        if (message.operation === 'close') process.send({id:message.id,result:{closed:true}},()=>process.disconnect());
      });`,
    )
    await writeFile(
      join(resources, "runtime", "src", "managed-entry.mjs"),
      `process.on('message', message => {
        if (message.operation === 'start') process.send({id:message.id,error:'LOGINOM_BROWSER_START_FAILED'});
        if (message.operation === 'close') process.send({id:message.id,result:{closed:${closed}}},()=>process.disconnect());
      });`,
    )
    const host = await createLoginomHost({
      root: join(directory, "profile"),
      resources,
      codec: credentials("linux"),
      environment: {},
      headless: true,
    })
    try {
      const checking = host.api.check({
        revision: 0,
        url: "https://example.test/app/",
        username: "fixture",
        apiKey: { operation: "replace", value: "fixture" },
        password: { operation: "empty" },
      })
      if (closed) {
        expect(await checking).toMatchObject({
          validationId: expect.any(String),
          browser: { state: "failed", failure: "LOGINOM_BROWSER_START_FAILED" },
        })
        await host.close()
        return
      }
      await expect(checking).rejects.toThrow("LOGINOM_CONNECTION_CHECK_FAILED")
      await expect(host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
    } finally {
      await host.close().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  },
  15_000,
)

test.each(["missing", "tampered"])(
  "failed Knowledge validation preserves safe startup evidence after validation cleanup: %s Help",
  async (help) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-knowledge-evidence-"))
    const root = join(directory, "profile")
    const resources = join(directory, "resources")
    const marker = join(directory, "forbidden-browser")
    const secrets = ["PRIVATE-KNOWLEDGE-PASSWORD", "PRIVATE-KNOWLEDGE-USER"]
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await symlink(
      fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      join(resources, "runtime/src/knowledge-entry.mjs"),
    )
    await writeFile(join(resources, "runtime/src/managed-entry.mjs"),
      `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser startup is forbidden');`)
    if (help === "tampered") await writeHelp(join(resources, "help"), { tamper: "data/README.md" })
    const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {}, headless: true })
    try {
      await expect(host.api.check({ revision: 0, url: "https://example.test/app/", username: secrets[1]!,
        password: { operation: "replace", value: secrets[0]! },
      })).rejects.toMatchObject({ message: "LOGINOM_KNOWLEDGE_UNAVAILABLE" })
      await host.close()
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
      expect(await readdir(join(root, "validation/knowledge")).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return []
        throw error
      })).toEqual([])
      const receipts = (await readdir(join(root, "knowledge/1"))).filter(name => name.startsWith("runtime-close-") && name.endsWith(".json"))
      expect(receipts).toHaveLength(1)
      const file = join(root, "knowledge/1", receipts[0]!)
      const text = await Bun.file(file).text()
      // Shipped Help failures are local: the receipt confirms cleanup and carries no remote startup failure.
      expect(JSON.parse(text)).toEqual({ version: 1, pid: expect.any(Number), started_at: expect.any(String),
        completed_at: expect.any(String), request_error: null, closed_ack: true, exit_code: 0, exit_signal: null })
      expect((await stat(file)).mode & 0o777).toBe(0o600)
      const log = await Bun.file(join(root, "knowledge/1/startup-failures.jsonl")).text()
      const [id] = await readdir(join(root, "knowledge/1/diagnostics"))
      const diagnostic = await Bun.file(join(root, "knowledge/1/diagnostics", id!, "events.jsonl")).text()
      for (const evidence of [log, diagnostic]) {
        expect(evidence).toContain('"phase":"knowledge.catalog"')
        expect(evidence).toContain("LOGINOM_KNOWLEDGE_UNAVAILABLE")
        expect(evidence).toContain(help === "missing" ? "ENOENT" : "LOGINOM_HELP_INTEGRITY")
      }
      for (const secret of secrets) for (const evidence of [text, log, diagnostic]) expect(evidence).not.toContain(secret)
    } finally {
      await host.close().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  },
  15_000,
)

async function startupFixture(closed: boolean) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-readiness-cleanup-"))
  const root = join(directory, "profile")
  const resources = join(directory, "resources")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime", "src"), { recursive: true })
  await copyFile(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({}))
  await writeFile(
    join(resources, "runtime", "src", "knowledge-entry.mjs"),
    `process.on('message', message => {
      if (message.operation === 'start') process.send({id:message.id,error:'LOGINOM_KNOWLEDGE_UNAVAILABLE'});
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
