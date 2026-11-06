import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { connectionStore } from "./connection-store"
import { credentials } from "./credentials"
import { connectionService, type ConnectionRuntime } from "./connection-service"
import type { Loginom } from "@opencode-ai/schema/loginom"

const candidate: Loginom.Candidate = {
  mode: "custom",
  endpoint: "http://example.test/mcp",
  revision: 0,
  url: "http://example.test/app/?a=b",
  username: "User",
  apiKey: { operation: "replace", value: "private-api-key" },
  password: { operation: "empty" },
}
async function fixture(runtime?: ConnectionRuntime) {
  const directory = await mkdtemp(join(tmpdir(), "loginom-service-"))
  const closed: number[] = []
  const store = connectionStore(directory, credentials("linux"))
  const service = await connectionService(
    store,
    runtime ?? {
      async check() { return { help: { state: "ready" as const }, browser: { state: "unknown" as const } } },
      async prepare(record) {
        return {
          observeHelp(listener) { listener({ state: "ready" }) },
          async close() {
            closed.push(record.generation)
          },
        }
      },
    },
  )
  return {
    service,
    store,
    closed,
    async close() {
      await service.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
async function save(service: Awaited<ReturnType<typeof connectionService>>, input = candidate) {
  const validation = await service.api.check(input)
  await service.api.save({ validationId: validation.validationId, revision: input.revision })
  await service.settled()
}

test("safe views expose defaults and presence flags only; a successful save survives restart", async () => {
  const f = await fixture()
  try {
    expect(await f.service.api.read()).toMatchObject({
      revision: 0,
      username: "user",
      hasPassword: false,
      folder: "/user",
      state: "unconfigured",
    })
    await save(f.service)
    expect(await f.service.api.read()).toMatchObject({
      generation: 1,
      revision: 1,
      username: "User",
      folder: "/User",
      hasPassword: false,
      state: "ready",
    })
    expect(JSON.stringify(await f.service.api.read())).not.toContain("private-api-key")
    // Explicit custom credentials remain private in the store.
    expect((await f.store.read())?.apiKey).toBe("private-api-key")
  } finally {
    await f.close()
  }
})

test("automation query stays out of saved settings and restored public views", async () => {
  const f = await fixture()
  try {
    await save(f.service, { ...candidate, url: "https://example.test/app/?testable=false&a=b" })
    expect((await f.store.read())?.url).toBe("https://example.test/app/?a=b")
    expect((await f.service.api.read()).url).toBe("https://example.test/app/?a=b")
    await f.service.close()
    const record = (await f.store.read())!
    await f.store.stage({ ...record, generation: 2, revision: 2, url: "https://example.test/app/?a=b&testable=true" })
    await f.store.activate(2)
    const restored = await connectionService(f.store, {
      async check() { return { help: { state: "ready" as const }, browser: { state: "unknown" as const } } },
      async prepare() {
        return { observeHelp(listener) { listener({ state: "ready" }) }, async close() {} }
      },
    })
    try {
      await restored.settled()
      expect((await restored.api.read()).url).toBe("https://example.test/app/?a=b")
      expect((await restored.api.status()).url).toBe("https://example.test/app/?a=b")
      expect((await f.store.read())?.url).toContain("testable=true")
    } finally {
      await restored.close()
    }
  } finally {
    await f.close()
  }
})

test("two active drains and an ambiguous receipt hold the old generation and gate new work", async () => {
  const f = await fixture()
  try {
    await save(f.service)
    const first = f.service.acquire("chat-one/run-one")!
    const second = f.service.acquire("chat-two/run-two")!
    expect(first.generation).toBe(1)
    expect(f.service.acquire("chat-one/run-one")).toBeUndefined()
    second.holdRecovery()
    await save(f.service, { ...candidate, revision: 1, username: "Other", apiKey: { operation: "preserve" } })
    expect(await f.service.api.status()).toMatchObject({ state: "pending", generation: 1 })
    expect(f.service.acquire("chat-three/run-three")).toBeUndefined()
    first.release()
    second.release()
    expect(await f.service.api.status()).toMatchObject({ state: "pending", generation: 1 })
    second.reconciled()
    await f.service.settled()
    expect(await f.service.api.status()).toMatchObject({ state: "ready", generation: 2, username: "Other" })
    expect(f.closed).toEqual([1])
    expect(f.service.acquire("chat-three/run-three")?.generation).toBe(2)
  } finally {
    await f.close()
  }
})

test("cancelling a pending switch keeps the active identity and invalidates stale windows", async () => {
  const f = await fixture()
  try {
    await save(f.service)
    const run = f.service.acquire("run")!
    await save(f.service, { ...candidate, revision: 1, username: "Other" })
    await expect(f.service.api.cancelPending({ revision: 1 })).rejects.toThrow("LOGINOM_REVISION_CONFLICT")
    expect(await f.service.api.cancelPending({ revision: 2 })).toMatchObject({
      state: "ready",
      username: "User",
      generation: 1,
      revision: 3,
    })
    run.release()
    await f.service.settled()
    expect((await f.store.read())?.generation).toBe(1)
  } finally {
    await f.close()
  }
})

test("failed readiness keeps the old runtime and durable connection", async () => {
  const f = await fixture({
    async check() { return { help: { state: "ready" as const }, browser: { state: "unknown" as const } } },
    async prepare(record) {
      if (record.generation === 2) throw new Error("internal failure private-api-key")
      return { observeHelp(listener) { listener({ state: "ready" }) }, async close() {} }
    },
  })
  try {
    await save(f.service)
    await save(f.service, { ...candidate, revision: 1, username: "Other" })
    expect(await f.service.api.status()).toMatchObject({ state: "ready", generation: 1, username: "User" })
    expect((await f.store.read())?.generation).toBe(1)
  } finally {
    await f.close()
  }
})

test("failed authentication returns a bounded error and never saves candidate secrets", async () => {
  const f = await fixture({
    async check() {
      throw new Error("private-api-key password")
    },
    async prepare() {
      throw new Error("unreachable")
    },
  })
  try {
    await expect(f.service.api.check(candidate)).rejects.toThrow(/^LOGINOM_CONNECTION_CHECK_FAILED$/)
    expect(await f.store.read()).toBeUndefined()
    expect((await f.service.api.status()).state).toBe("unconfigured")
  } finally {
    await f.close()
  }
})

test("validation is one-use, revision-bound and cannot silently replace another window's save", async () => {
  const f = await fixture()
  try {
    const validation = await f.service.api.check(candidate)
    await f.service.api.save({ validationId: validation.validationId, revision: 0 })
    await f.service.settled()
    await expect(f.service.api.save({ validationId: validation.validationId, revision: 1 })).rejects.toThrow(
      "LOGINOM_VALIDATION_EXPIRED",
    )
    await expect(f.service.api.check(candidate)).rejects.toThrow("LOGINOM_REVISION_CONFLICT")
    await save(f.service, {
      ...candidate,
      revision: 1,
      apiKey: { operation: "preserve" },
      password: { operation: "replace", value: "new-password" },
    })
    await save(f.service, {
      ...candidate,
      revision: 2,
      apiKey: { operation: "preserve" },
      password: { operation: "preserve" },
    })
    expect((await f.store.read())?.password).toBe("new-password")
    await save(f.service, { ...candidate, revision: 3, apiKey: { operation: "preserve" } })
    expect((await f.store.read())?.password).toBe("")
  } finally {
    await f.close()
  }
})

for (const username of ["", ".", "..", "a/b", "a\\b", "a\nb"]) {
  test(`rejects unsafe username ${JSON.stringify(username)}`, async () => {
    const f = await fixture()
    try {
      await expect(f.service.api.check({ ...candidate, username })).rejects.toThrow("LOGINOM_USERNAME_INVALID")
    } finally {
      await f.close()
    }
  })
}
for (const url of ["file:///tmp/private", "https://user:password@example.test/", "not-a-url"]) {
  test(`rejects invalid Loginom URL`, async () => {
    const f = await fixture()
    try {
      await expect(f.service.api.check({ ...candidate, url })).rejects.toThrow("LOGINOM_URL_INVALID")
    } finally {
      await f.close()
    }
  })
}

test("replacing pending settings commits only the latest candidate", async () => {
  const f = await fixture()
  try {
    await save(f.service)
    const run = f.service.acquire("run")!
    await save(f.service, {
      ...candidate,
      revision: 1,
      apiKey: { operation: "replace", value: "replacement-key" },
      username: "Second",
    })
    await save(f.service, { ...candidate, revision: 2, apiKey: { operation: "preserve" }, username: "Third" })
    expect(await f.service.api.status()).toMatchObject({ state: "pending", generation: 1, revision: 3 })
    run.release()
    await f.service.settled()
    expect(await f.store.read()).toMatchObject({ generation: 3, username: "Third", apiKey: "replacement-key" })
  } finally {
    await f.close()
  }
})

test("released recovery leases cannot resume ordinary execution", async () => {
  const f = await fixture()
  try {
    await save(f.service)
    const run = f.service.acquire("run")!
    run.holdRecovery()
    run.release()
    await save(f.service, { ...candidate, revision: 1, username: "Second" })
    expect(f.service.acquire("new-run")).toBeUndefined()
    expect(Object.hasOwn(run, "resume")).toBe(false)
    expect((await f.service.api.status()).state).toBe("pending")
    run.reconciled()
    await f.service.settled()
    expect((await f.service.api.status()).generation).toBe(2)
  } finally {
    await f.close()
  }
})

test("post-rename durability failure keeps runtime and active file on the same generation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-commit-"))
  const store = connectionStore(directory, credentials("linux"))
  const closed: number[] = []
  const service = await connectionService(
    {
      ...store,
      async activate(generation) {
        await store.activate(generation)
        throw new Error("directory fsync failed")
      },
    },
    {
      async check() { return { help: { state: "ready" as const }, browser: { state: "unknown" as const } } },
      async prepare(record) {
        return {
          observeHelp(listener) { listener({ state: "ready" }) },
          async close() {
            closed.push(record.generation)
          },
        }
      },
    },
  )
  try {
    await save(service)
    expect((await store.read())?.generation).toBe(1)
    expect(await service.api.status()).toMatchObject({
      generation: 1,
      state: "ready",
      failure: "LOGINOM_STORE_WRITE_FAILED",
    })
    expect(service.acquire("after-commit")?.generation).toBe(1)
    expect(closed).toEqual([])
  } finally {
    await service.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("mode switches preserve custom credentials", async () => {
  const f = await fixture()
  try {
    await save(f.service)
    await save(f.service, { ...candidate, revision: 1, mode: "cloud", endpoint: "http://ignored.test", apiKey: { operation: "replace", value: "ignored" } })
    expect(await f.store.read()).toMatchObject({ mode: "cloud", endpoint: candidate.endpoint, apiKey: "private-api-key" })
    await save(f.service, { ...candidate, revision: 2, mode: "custom", apiKey: { operation: "preserve" } })
    expect(await f.store.read()).toMatchObject({ mode: "custom", endpoint: candidate.endpoint, apiKey: "private-api-key" })
    expect(await f.service.api.read()).toMatchObject({ mode: "custom", hasApiKey: true, server: "custom", help: { state: "ready" }, cloud: { connected: false } })
  } finally { await f.close() }
})

test("implicit edits retain custom mode and cannot replace custom credentials", async () => {
  const f = await fixture()
  try {
    await save(f.service)
    await save(f.service, { revision: 1, url: candidate.url, username: candidate.username, password: candidate.password,
      endpoint: "http://ignored.test", apiKey: { operation: "replace", value: "ignored" } })
    expect(await f.store.read()).toMatchObject({ mode: "custom", endpoint: candidate.endpoint, apiKey: "private-api-key" })
  } finally { await f.close() }
})


test("legacy candidate credentials cannot enable custom mode", async () => {
  const checked: string[] = []
  const f = await fixture({
    async check(record) { checked.push(record.apiKey); return { help: { state: "ready" as const }, browser: { state: "unknown" as const } } },
    async prepare() { return { observeHelp(listener) { listener({ state: "ready" }) }, async close() {} } },
  })
  try {
    await save(f.service, { revision: 0, url: candidate.url, username: candidate.username, password: candidate.password,
      endpoint: "http://ignored.test/mcp", apiKey: { operation: "replace", value: "LEGACY-CANARY" } })
    expect(checked).toEqual([""])
    expect(await f.store.read()).toMatchObject({ mode: "cloud", apiKey: "" })
    expect((await f.store.read())?.endpoint).toBeUndefined()
    expect(await f.service.api.read()).toMatchObject({ mode: "cloud", server: "primary", hasApiKey: false })
  } finally { await f.close() }
})

for (const [label, endpoint] of [["empty", ""], ["malformed", "not-a-url"], ["non-HTTP", "file:///private"], ["credential-bearing", "https://user:secret@example.test/mcp"]]) {
  test(`custom rejects ${label} endpoint before starting runtime`, async () => {
    const f = await fixture({ async check() { throw Error("RUNTIME_MUST_NOT_START") }, async prepare() { throw Error("unreachable") } })
    try {
      await expect(f.service.api.check({ ...candidate, endpoint })).rejects.toThrow("LOGINOM_ENDPOINT_INVALID")
      expect(await f.store.read()).toBeUndefined()
    } finally { await f.close() }
  })
}

test("custom requires a nonempty key before starting runtime", async () => {
  const f = await fixture({ async check() { throw Error("RUNTIME_MUST_NOT_START") }, async prepare() { throw Error("unreachable") } })
  try {
    await expect(f.service.api.check({ ...candidate, apiKey: { operation: "empty" } })).rejects.toThrow("LOGINOM_API_KEY_REQUIRED")
  } finally { await f.close() }
})
