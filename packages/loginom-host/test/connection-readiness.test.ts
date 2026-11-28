import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { connectionStore } from "../src/connection/connection-store"
import { connectionService } from "../src/connection/connection-service"
import { credentials } from "../src/connection/credentials"
import { superviseKnowledge } from "../src/supervisor"
import { writeHelp } from "../../loginom-runtime/client/test/support/help-fixture.mjs"
import { stageHeldKnowledge } from "./fixtures/knowledge"
import type { Loginom } from "../src/loginom"

// "held" keeps the first catalog pending in a stub entry; "shipped" and "tampered"
// run the real entry over a Help fixture.
async function readinessFixture(help: "held" | "shipped" | "tampered", holdNext = false) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "connection-knowledge-ready-"))
  const helpRoot = await writeHelp(join(directory, "help"), help === "tampered" ? { tamper: "data/README.md" } : {})
  const entry = join(directory, "held-knowledge.mjs")
  const catalog = await stageHeldKnowledge(entry, join(directory, "catalog-gate"))
  const nextEntry = join(directory, "next-knowledge.mjs")
  const nextCatalog = holdNext ? await stageHeldKnowledge(nextEntry, join(directory, "next-catalog-gate")) : undefined
  const store = connectionStore(join(directory, "connection"), credentials("linux"))
  const original = { generation: 1, revision: 1, url: "http://unavailable.example/app/?custom=1",
    username: "user", apiKey: "UNIT-NONSECRET", password: "PRIVATE-NONSECRET-PASSWORD" }
  const processes: Awaited<ReturnType<typeof superviseKnowledge>>[] = []
  const readiness: Promise<void>[] = []
  const outcomes: Parameters<Loginom.ConnectionApplicationListener>[] = []
  await store.stage(original)
  await store.activate(1)
  const service = await connectionService(store, {
    async check() {
      return { state: "verified" }
    },
    async prepare(connection) {
      const knowledgeEntry = help === "held"
        ? entry
        : fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url))
      const child = await superviseKnowledge({
        node,
        entry: connection.generation === 2 && holdNext ? nextEntry : knowledgeEntry,
        stateDir: directory, generation: connection.generation, helpRoot, environment: {},
      })
      processes.push(child)
      const ready = child.request("list").then(() => undefined)
      readiness.push(ready)
      void ready.catch(() => {})
      return { ready, close: () => child.close() }
    },
  }, undefined, (...event) => outcomes.push(event))
  return { service, store, original, readiness, processes, catalog, nextCatalog, outcomes,
    async close() {
      await catalog.release()
      await nextCatalog?.release()
      await service.close()
      for (const child of processes) expect(await child.exited).toEqual({ code: 0, signal: null })
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test("local connection startup settles before Help readiness and becomes ready only after its catalog", async () => {
  const f = await readinessFixture("held")
  try {
    await f.service.settled()
    await f.catalog.entered()
    expect(await f.service.api.status()).toMatchObject({ state: "starting", generation: 1 })
    expect(f.service.acquire("before-ready")).toBeUndefined()
    expect(await f.store.read()).toEqual(f.original)
    await f.catalog.release()
    await f.readiness[0]
    expect(await f.service.api.status()).toMatchObject({ state: "ready", url: f.original.url })
    const lease = f.service.acquire("after-ready")
    expect(lease?.generation).toBe(1)
    lease?.release()
  } finally {
    await f.close()
  }
})

test.each(["shipped", "tampered"] as const)(
  "shipped Help decides background readiness without changing the durable connection: %s",
  async (help) => {
    const f = await readinessFixture(help)
    try {
      await f.service.settled()
      if (help === "shipped") {
        await f.readiness[0]
        expect(await f.service.api.status()).toMatchObject({ state: "ready", generation: 1 })
        f.service.acquire("ready")?.release()
      }
      if (help === "tampered") {
        await expect(f.readiness[0]).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
        expect(await f.service.api.status()).toMatchObject({
          state: "recoverable-error",
          failure: "LOGINOM_RUNTIME_START_FAILED",
        })
        expect(f.service.acquire("failed-ready")).toBeUndefined()
      }
      expect(await f.store.read()).toEqual(f.original)
    } finally {
      await f.close()
    }
  },
)

test("shutdown closes pending background readiness", async () => {
  const f = await readinessFixture("held")
  try {
    await f.service.settled()
    await f.catalog.entered()
    await f.service.close()
    await expect(f.readiness[0]).rejects.toThrow("LOGINOM_KNOWLEDGE_CLOSED")
    expect(await f.service.api.status()).toMatchObject({ state: "recoverable-error" })
    expect(await f.processes[0].exited).toEqual({ code: 0, signal: null })
    await f.catalog.release()
    expect(await f.service.api.status()).toMatchObject({ state: "recoverable-error" })
  } finally { await f.close() }
})

test("a new generation closes pending old readiness and only its own catalog can publish ready", async () => {
  const f = await readinessFixture("held")
  try {
    await f.service.settled()
    await f.catalog.entered()
    const candidate = { revision: 1, url: "http://next-unavailable.example/app/?custom=2", username: "user",
      apiKey: { operation: "preserve" as const }, password: { operation: "preserve" as const } }
    const validation = await f.service.api.check(candidate)
    await f.service.api.save({ revision: 1, validationId: validation.validationId })
    await f.service.settled()
    await f.readiness[1]
    await expect(f.readiness[0]).rejects.toThrow("LOGINOM_KNOWLEDGE_CLOSED")
    expect(await f.processes[0].exited).toEqual({ code: 0, signal: null })
    expect(await f.service.api.status()).toMatchObject({ generation: 2, state: "ready", url: candidate.url })
    await f.catalog.release()
    expect((await f.store.read())?.generation).toBe(2)
    expect(await f.service.api.status()).toMatchObject({ generation: 2, state: "ready" })
  } finally { await f.close() }
})

test.each(["applied", "failed"] as const)("settings drain both old-generation tasks and report catalog outcome: %s", async (outcome) => {
  const f = await readinessFixture("held", true)
  try {
    const nextCatalog = f.nextCatalog!
    await f.service.settled()
    await f.catalog.release()
    await f.readiness[0]

    const tasks = ["first", "second"].map((task) => {
      f.service.turn(task, task, true)
      const lease = f.service.acquire("lease-" + task, task)
      if (!lease) throw Error("Expected a ready connection")
      return { task, lease }
    })
    const url = "https://next.example/app/"
    const validation = await f.service.api.check(
      { revision: 1, url, username: "analyst", password: { operation: "empty" } },
      true,
    )
    expect(await f.service.api.save({ revision: 1, validationId: validation.validationId }, true)).toMatchObject({
      revision: 2,
      generation: 1,
      application: { state: "pending", tasks: 2 },
    })
    expect(f.service.acquire("new")).toBeUndefined()

    for (const [index, { task, lease }] of tasks.entries()) {
      expect(lease.generation).toBe(1)
      expect(await f.store.read()).toEqual(f.original)
      expect(await f.processes[0].request("list")).toHaveProperty("tools")
      lease.release()
      expect(await f.service.api.status()).toMatchObject({
        generation: 1,
        application: { state: "pending", tasks: 2 - index },
      })
      expect(f.outcomes).toEqual([])
      f.service.turn(task, task, false)
    }

    await f.service.settled()
    expect(await f.service.api.status()).toMatchObject({ generation: 2, state: "starting" })
    expect((await f.service.api.status()).application).toBeUndefined()
    expect(f.service.acquire("third")).toBeUndefined()
    expect(f.outcomes).toEqual([])

    await nextCatalog.entered()
    await nextCatalog.release(outcome === "failed" ? "fail" : undefined)
    if (outcome === "failed") {
      await expect(f.readiness[1]).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
      expect(f.outcomes).toEqual([["failed", { revision: 2, generation: 2 }]])
      const status = await f.service.api.status()
      expect(status).toMatchObject({ generation: 2, state: "recoverable-error", failure: "LOGINOM_RUNTIME_START_FAILED" })
      expect(status.application).toBeUndefined()
      expect(f.service.acquire("third")).toBeUndefined()
      return
    }

    await f.readiness[1]
    expect(f.outcomes).toEqual([["applied", { revision: 2, generation: 2 }]])
    expect(await f.service.api.status()).toMatchObject({
      generation: 2,
      url,
      state: "ready",
      application: { state: "applied" },
    })
    expect(await f.store.read()).toMatchObject({ generation: 2, url })
    expect(await f.processes[0].exited).toEqual({ code: 0, signal: null })
    const third = f.service.acquire("third")
    expect(third?.generation).toBe(2)
    expect(await f.processes[1].request("list")).toHaveProperty("tools")
    third?.release()
  } finally {
    await f.close()
  }
}, 30_000)
