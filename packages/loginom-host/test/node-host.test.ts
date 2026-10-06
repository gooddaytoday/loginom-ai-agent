import { afterAll, beforeAll, expect, test } from "bun:test"
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildNodeHost } from "../script/build-node-host"
import { launchNodeHost } from "../src/node-client"
import { connectionStore } from "../src/connection/connection-store"
import { cliCredentials } from "../src/connection/cli-credentials"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-node-host-"))
  fixture.entry = await buildNodeHost(fixture.directory)
})
afterAll(async () => {
  if (fixture.directory) await rm(fixture.directory, { recursive: true, force: true })
})

test("bundled Node host handshakes without Electron, manages its profile and closes completely", async () => {
  const host = await launchNodeHost({
    node: fixture.node,
    entry: fixture.entry,
    root: join(fixture.directory, "profile"),
    resources: join(fixture.directory, "absent-runtime"),
    headless: true,
    environment: { ...process.env, OPENAI_API_KEY: "must-not-be-forwarded" },
  })
  try {
    expect(host.alive).toBe(true)
    expect(await host.request("connection.status", {})).toMatchObject({ state: "unconfigured", hasApiKey: false })
    const error = await host
      .request("connection.check", { apiKey: "private-sentinel" })
      .catch((error: Error) => error.message)
    expect(error).not.toContain("private-sentinel")
    expect(error).toBe("LOGINOM_CANDIDATE_INVALID")
    expect(await host.request("acquire", { run: "test", session: "chat" })).toBeNull()
  } finally {
    await host.close()
  }
  expect(host.alive).toBe(false)
  expect(await host.exited).toEqual({ code: 0, signal: null })
  await expect(host.request("connection.status", {})).rejects.toThrow("LOGINOM_HOST_CLOSED")
}, 15_000)

test("a non-boolean recovery mode is rejected before the host starts", async () => {
  await expect(
    launchNodeHost({
      node: fixture.node,
      entry: fixture.entry,
      root: join(fixture.directory, "bad-recovery"),
      resources: join(fixture.directory, "absent-runtime"),
      headless: true,
      strictRecovery: "yes" as unknown as boolean,
    }),
  ).rejects.toThrow("LOGINOM_HANDSHAKE_INVALID")
}, 15_000)

test.each(["ready", "close"])(
  "private Help preflight waits for the catalog or cancels on shutdown: %s",
  async (mode) => {
    const cleanup: (() => void | Promise<void>)[] = []
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const server = await knowledgeServer(
      { after: (callback) => cleanup.push(callback) },
      {
        list: async () => {
          entered.resolve()
          await release.promise
          return { tools: server.tools }
        },
      },
    )
    const resources = join(fixture.directory, "knowledge-resources-" + mode)
    const root = join(fixture.directory, "knowledge-profile-" + mode)
    const marker = join(root, "forbidden-browser")
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(fixture.node, join(resources, "bin/node"))
    await symlink(
      join(import.meta.dir, "../../loginom-runtime/src/knowledge-entry.mjs"),
      join(resources, "runtime/src/knowledge-entry.mjs"),
    )
    await writeFile(
      join(resources, "runtime/src/managed-entry.mjs"),
      `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser forbidden');`,
    )
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: server.endpoint }))
    const store = connectionStore(join(root, "connection"), cliCredentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      apiKey: "UNIT-NONSECRET",
      password: "PRIVATE-NONSECRET",
      username: "user",
      url: "http://127.0.0.1:1/app/?custom=preserve",
    })
    await store.activate(1)
    const host = await launchNodeHost({
      node: fixture.node,
      entry: fixture.entry,
      root,
      resources,
      headless: true,
      environment: {},
    })
    try {
      expect(await host.request("connection.status", {})).toMatchObject({
        state: "starting",
        generation: 1,
        url: "http://127.0.0.1:1/app/?custom=preserve",
      })
      await entered.promise
      const settled = { value: false }
      const readiness = host.request("connection.ready", {}).finally(() => {
        settled.value = true
      })
      void readiness.catch(() => {})
      await host.request("connection.status", {})
      expect(settled.value).toBe(false)
      if (mode === "ready") {
        release.resolve()
        expect(await readiness).toMatchObject({ state: "ready", generation: 1, hasApiKey: true })
      } else {
        await host.close()
        await expect(readiness).rejects.toThrow("LOGINOM_HOST_CLOSED")
        expect(await host.exited).toEqual({ code: 0, signal: null })
      }
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      release.resolve()
      await host.close().catch(() => {})
      for (const callback of cleanup) await callback()
    }
  },
  45_000,
)

test("private host handshake retains its upper budget beyond the former 30s deadline", async () => {
  const entry = join(fixture.directory, "slow-readiness.mjs")
  await writeFile(
    entry,
    `
    process.on('message', m => {
      if (m.method === 'start') setTimeout(() => process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}}), 31_000);
      if (m.method === 'close') process.send({id:m.id,result:{closed:true}}, () => process.exit(0));
    });
  `,
  )
  const host = await launchNodeHost({
    node: fixture.node,
    entry,
    root: fixture.directory,
    resources: fixture.directory,
    headless: true,
  })
  await host.close()
  expect(await host.exited).toEqual({ code: 0, signal: null })
}, 40_000)

test.each(["ack-without-exit", "disconnect-without-exit", "bad-ack"])(
  "host shutdown is bounded and never accepts incomplete cleanup: %s",
  async (mode) => {
    const entry = join(fixture.directory, mode + ".mjs")
    await writeFile(
      entry,
      `
      setInterval(() => {}, 1000);
      process.on('message', m => {
        if (m.method === 'start') process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
        if (m.method !== 'close') return;
        if (${JSON.stringify(mode)} === 'disconnect-without-exit') { process.disconnect(); return; }
        process.send({id:m.id,result:{closed:${mode !== "bad-ack"}}});
      });
    `,
    )
    const host = await launchNodeHost({
      node: fixture.node,
      entry,
      root: fixture.directory,
      resources: fixture.directory,
      headless: true,
    })
    await expect(host.close()).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
    await expect(host.close()).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
    expect(host.alive).toBe(false)
    const outcome = await host.exited
    expect(outcome.code !== 0 || outcome.signal !== null).toBe(true)
    await expect(host.request("connection.status", {})).rejects.toThrow("LOGINOM_HOST_CLOSED")
  },
  10000,
)
