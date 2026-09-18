import { expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { recoveryStore } from "./recovery-store"
import { connectionService } from "./connection-service"
import { connectionStore } from "./connection-store"

const active = {
  generation: 1,
  revision: 1,
  url: "http://example.test/app/",
  username: "user",
  apiKey: "private-key",
  password: "private-password",
}
const runtime = {
  async check() {},
  async prepare() {
    return { async close() {} }
  },
}

test("an unconfirmed dispatch survives process recreation; concurrent calls are not erased", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-recovery-"))
  try {
    const journal = await recoveryStore(directory)
    const first = await journal.begin("a".repeat(64), 1)
    const second = await journal.begin("a".repeat(64), 1)
    await journal.settle(first, true)
    expect((await recoveryStore(directory)).pending()).toEqual([second])
    expect((await stat(join(directory, `${second}.json`))).mode & 0o777).toBe(0o600)
    expect(Object.keys(JSON.parse(await readFile(join(directory, `${second}.json`), "utf8"))).sort()).toEqual([
      "chat",
      "generation",
      "id",
    ])
    await journal.settle(second, false)
    expect(journal.pending()).toEqual([second])
    const third = await journal.begin("a".repeat(64), 1)
    await journal.settle(third, true)
    expect((await recoveryStore(directory)).pending()).toEqual([second])
    await journal.acknowledge([second])
    expect((await recoveryStore(directory)).pending()).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("crash recovery gates a durable pending generation until explicit acknowledgement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-crash-"))
  const store = connectionStore(join(directory, "connection"))
  const location = join(directory, "recovery")
  try {
    await store.stage(active)
    await store.activate(1)
    await store.savePending({ ...active, generation: 2, revision: 2, username: "other" })
    // Covers a crash after staging the new generation but before the active pointer.
    await store.stage({ ...active, generation: 2, revision: 2, username: "other" })
    const marker = await (await recoveryStore(location)).begin("b".repeat(64), 1)
    const recovered = await recoveryStore(location)
    const service = await connectionService(store, runtime, recovered)
    try {
      await service.settled()
      expect(await service.api.status()).toMatchObject({
        state: "recoverable-error",
        generation: 1,
        recoveries: [marker],
      })
      expect(service.acquire("new-run")).toBeUndefined()
      await expect(service.api.acknowledgeRecovery({ revision: 2, ids: [] })).rejects.toThrow(
        "LOGINOM_RECOVERY_CONFLICT",
      )
      await service.api.acknowledgeRecovery({ revision: 2, ids: [marker] })
      await service.settled()
      expect(await service.api.status()).toMatchObject({ state: "ready", generation: 2, username: "other" })
      expect((await store.read())?.generation).toBe(2)
      expect(await store.pending()).toBeUndefined()
      expect(await readdir(location)).toEqual([])
    } finally {
      await service.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("a pending first connection is restored without an existing active pointer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-pending-"))
  try {
    const store = connectionStore(directory)
    await store.savePending(active)
    const service = await connectionService(store, runtime)
    try {
      await service.settled()
      expect(await service.api.status()).toMatchObject({ state: "ready", generation: 1 })
      expect(await store.pending()).toBeUndefined()
    } finally {
      await service.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
