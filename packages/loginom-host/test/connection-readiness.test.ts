import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { connectionStore } from "../src/connection/connection-store"
import { connectionService } from "../src/connection/connection-service"
import { credentials } from "../src/connection/credentials"
import { superviseKnowledge } from "../src/supervisor"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

async function readinessFixture(options: Parameters<typeof knowledgeServer>[1]) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "connection-knowledge-ready-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const server = await knowledgeServer({ after: (callback) => cleanup.push(callback) }, options)
  const store = connectionStore(join(directory, "connection"), credentials("linux"))
  const original = { generation: 1, revision: 1, url: "http://unavailable.example/app/?custom=1",
    username: "user", apiKey: "UNIT-NONSECRET", password: "PRIVATE-NONSECRET-PASSWORD" }
  const processes: Awaited<ReturnType<typeof superviseKnowledge>>[] = []
  const readiness: Promise<void>[] = []
  await store.stage(original)
  await store.activate(1)
  const service = await connectionService(store, {
    async check() {},
    async prepare(connection) {
      const child = await superviseKnowledge({
        node, entry: fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
        stateDir: directory, generation: connection.generation, endpoint: server.endpoint,
        apiKey: connection.apiKey, environment: {},
      })
      processes.push(child)
      const ready = child.request("list").then(() => undefined)
      readiness.push(ready)
      void ready.catch(() => {})
      return { ready, close: () => child.close() }
    },
  })
  return { service, store, original, readiness, processes, server,
    async close() {
      await service.close()
      for (const child of processes) expect(await child.exited).toEqual({ code: 0, signal: null })
      for (const callback of cleanup) await callback()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test("local connection startup settles before Help readiness and becomes ready only after its catalog", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await readinessFixture({
    list: async () => { entered.resolve(); await release.promise; return { tools: f.server.tools } },
  })
  try {
    await f.service.settled()
    await entered.promise
    expect(await f.service.api.status()).toMatchObject({ state: "starting", generation: 1 })
    expect(f.service.acquire("before-ready")).toBeUndefined()
    expect(await f.store.read()).toEqual(f.original)
    release.resolve()
    await f.readiness[0]
    expect(await f.service.api.status()).toMatchObject({ state: "ready", url: f.original.url })
    const lease = f.service.acquire("after-ready")
    expect(lease?.generation).toBe(1)
    lease?.release()
    expect(f.server.calls).toHaveLength(0)
  } finally {
    release.resolve()
    await f.close()
  }
})

test("background Help failure updates readiness without changing the durable connection", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await readinessFixture({ list: async () => { entered.resolve(); await release.promise; return { tools: [] } } })
  try {
    await f.service.settled()
    await entered.promise
    expect(await f.service.api.status()).toMatchObject({ state: "starting" })
    release.resolve()
    await expect(f.readiness[0]).rejects.toThrow("LOGINOM_KNOWLEDGE_CATALOG_INVALID")
    expect(await f.service.api.status()).toMatchObject({ state: "recoverable-error", failure: "LOGINOM_RUNTIME_START_FAILED" })
    expect(f.service.acquire("failed-ready")).toBeUndefined()
    expect(await f.store.read()).toEqual(f.original)
  } finally { release.resolve(); await f.close() }
})

test("shutdown cancels background readiness instead of waiting for the server", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await readinessFixture({
    list: async () => { entered.resolve(); await release.promise; return { tools: f.server.tools } },
  })
  try {
    await f.service.settled()
    await entered.promise
    await f.service.close()
    await expect(f.readiness[0]).rejects.toThrow("LOGINOM_KNOWLEDGE_CLOSED")
    expect(await f.service.api.status()).toMatchObject({ state: "recoverable-error" })
    expect(await f.processes[0].exited).toEqual({ code: 0, signal: null })
    release.resolve()
    expect(await f.service.api.status()).toMatchObject({ state: "recoverable-error" })
  } finally { release.resolve(); await f.close() }
})

test("a new generation closes pending old readiness and only its own catalog can publish ready", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const count = { lists: 0 }
  const f = await readinessFixture({ list: async () => {
    if (++count.lists === 1) { entered.resolve(); await release.promise }
    return { tools: f.server.tools }
  } })
  try {
    await f.service.settled()
    await entered.promise
    const candidate = { revision: 1, url: "http://next-unavailable.example/app/?custom=2", username: "user",
      apiKey: { operation: "preserve" as const }, password: { operation: "preserve" as const } }
    const validation = await f.service.api.check(candidate)
    await f.service.api.save({ revision: 1, validationId: validation.validationId })
    await f.service.settled()
    await f.readiness[1]
    await expect(f.readiness[0]).rejects.toThrow("LOGINOM_KNOWLEDGE_CLOSED")
    expect(await f.processes[0].exited).toEqual({ code: 0, signal: null })
    expect(await f.service.api.status()).toMatchObject({ generation: 2, state: "ready", url: candidate.url })
    release.resolve()
    expect((await f.store.read())?.generation).toBe(2)
    expect(await f.service.api.status()).toMatchObject({ generation: 2, state: "ready" })
  } finally { release.resolve(); await f.close() }
})
