import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"

test("unreachable primary moves knowledge and chat runtimes of the generation to the reserve", async () => {
  const fixture = await reserveFixture()
  try {
    const reserve = await knowledgeServer({ after: (callback) => fixture.cleanup.push(callback) })
    const host = await fixture.host({ endpoint: await closedEndpoint(), reserveEndpoint: reserve.endpoint })
    await host.settled()
    expect(await host.catalog(1)).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: "read" })]) })
    await host.runtime(1, "chat")
    expect(await fixture.started()).toEqual([reserve.endpoint])
    const diagnostics = join(fixture.root, "knowledge", "1", "diagnostics")
    const [session] = await readdir(diagnostics)
    expect(await readFile(join(diagnostics, session, "events.jsonl"), "utf8")).toContain(
      `"event":"knowledge.endpoint_reserve"`,
    )
    await host.close()
  } finally {
    await fixture.close()
  }
}, 30_000)

test("silent primary moves to the reserve within the bounded primary budget", async () => {
  const fixture = await reserveFixture()
  const sockets = new Set<Socket>()
  const silent = createServer((socket) => sockets.add(socket))
  fixture.cleanup.push(async () => {
    sockets.forEach((socket) => socket.destroy())
    await new Promise((resolve) => silent.close(resolve))
  })
  try {
    const reserve = await knowledgeServer({ after: (callback) => fixture.cleanup.push(callback) })
    const host = await fixture.host({ endpoint: `${await listening(silent)}/mcp`, reserveEndpoint: reserve.endpoint })
    await host.settled()
    const started = Date.now()
    await host.catalog(1)
    expect(Date.now() - started).toBeLessThan(40_000)
    await host.runtime(1, "chat")
    expect(await fixture.started()).toEqual([reserve.endpoint])
    await host.close()
  } finally {
    await fixture.close()
  }
}, 60_000)

test("refused key stays on the reachable primary", async () => {
  const fixture = await reserveFixture()
  try {
    const primary = await knowledgeServer(
      { after: (callback) => fixture.cleanup.push(callback) },
      { apiKey: "ANOTHER-NONSECRET" },
    )
    const reserve = await knowledgeServer({ after: (callback) => fixture.cleanup.push(callback) })
    const host = await fixture.host({ endpoint: primary.endpoint, reserveEndpoint: reserve.endpoint })
    await host.settled()
    await expect(host.catalog(1)).rejects.toThrow("LOGINOM_KNOWLEDGE_AUTH_FAILED")
    await host.runtime(1, "chat")
    expect(await fixture.started()).toEqual([primary.endpoint])
    expect(primary.requests.length).toBeGreaterThan(0)
    expect(reserve.requests).toEqual([])
    await host.close()
  } finally {
    await fixture.close()
  }
}, 30_000)

test("explicit knowledge endpoint never moves to the reserve", async () => {
  const fixture = await reserveFixture()
  try {
    const reserve = await knowledgeServer({ after: (callback) => fixture.cleanup.push(callback) })
    const override = await closedEndpoint()
    const host = await fixture.host(
      { endpoint: "https://example.test/mcp", reserveEndpoint: reserve.endpoint },
      { LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT: override },
    )
    await host.settled()
    await expect(host.catalog(1)).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
    await host.runtime(1, "chat")
    expect(await fixture.started()).toEqual([override])
    expect(reserve.requests).toEqual([])
    await host.close()
  } finally {
    await fixture.close()
  }
}, 30_000)

test("connection check validates the browser against the service it selected", async () => {
  const fixture = await reserveFixture(false)
  try {
    const reserve = await knowledgeServer({ after: (callback) => fixture.cleanup.push(callback) })
    const host = await fixture.host({ endpoint: await closedEndpoint(), reserveEndpoint: reserve.endpoint })
    expect(
      await host.api.check({
        revision: 0,
        url: "https://example.test/app/",
        username: "user",
        apiKey: { operation: "replace", value: "UNIT-NONSECRET" },
        password: { operation: "empty" },
      }),
    ).toMatchObject({ browser: { state: "verified" } })
    expect(await fixture.started()).toEqual([reserve.endpoint])
    await host.close()
  } finally {
    await fixture.close()
  }
}, 30_000)

async function reserveFixture(active = true) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "host-knowledge-reserve-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const started = join(directory, "runtime-endpoints")
  const cleanup: (() => void | Promise<void>)[] = []
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  await symlink(
    fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
    join(resources, "runtime/src/knowledge-entry.mjs"),
  )
  // The browser runtime only records the knowledge service it was given.
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `import {appendFileSync} from 'node:fs';
    process.on('message', message => {
      if (message.operation === 'start') {
        appendFileSync(${JSON.stringify(started)}, message.input.endpoint + '\\n');
        process.send({id:message.id,result:message.input.validation
          ? {checked:true,protocol:1,generation:message.input.generation}
          : {ready:true,chat:message.input.chat,protocol:1,generation:message.input.generation}});
      }
      if (message.operation === 'close') process.send({id:message.id,result:{closed:true}},()=>process.disconnect());
    });`,
  )
  if (active) {
    const store = connectionStore(join(root, "connection"), credentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      apiKey: "UNIT-NONSECRET",
      password: "UNIT-NONSECRET-PASSWORD",
      username: "user",
      url: "https://example.test/app/",
    })
    await store.activate(1)
  }
  return {
    root,
    cleanup,
    async host(manifest: { endpoint: string; reserveEndpoint: string }, environment: NodeJS.ProcessEnv = {}) {
      await writeFile(join(resources, "resource-manifest.json"), JSON.stringify(manifest))
      const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment, headless: true })
      cleanup.unshift(() => host.close().catch(() => undefined))
      return host
    },
    async started() {
      return (await readFile(started, "utf8")).trim().split("\n")
    },
    async close() {
      for (const callback of cleanup) await callback()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

// A port that was just released refuses connections without waiting for a timeout.
async function closedEndpoint() {
  const server = createServer()
  const address = await listening(server)
  await new Promise((resolve) => server.close(resolve))
  return `${address}/mcp`
}

async function listening(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("TCP address expected")
  return `http://127.0.0.1:${address.port}`
}
