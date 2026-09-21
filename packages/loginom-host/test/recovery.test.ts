import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { connectionStore } from "../src/connection/connection-store"
import { connectionService } from "../src/connection/connection-service"
import { recoveryStore } from "../src/connection/recovery-store"
import { credentials } from "../src/connection/credentials"

test.each([false, true])("recovery resets only idle runtimes; shutdown race = %s", async (shutdown) => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-recovery-idle-"))
  const reset = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  // Recovery exercises generation ownership; use the explicit plaintext test
  // codec rather than requesting the host OS's unavailable desktop safeStorage.
  const store = connectionStore(join(directory, "connection"), credentials("linux"))
  const journal = await recoveryStore(join(directory, "recovery"))
  await store.stage({
    generation: 1,
    revision: 1,
    url: "http://example.test",
    username: "user",
    apiKey: "test",
    password: "",
  })
  await store.activate(1)
  const service = await connectionService(
    store,
    {
      async check() {},
      async prepare() {
        return {
          async reset() {
            entered.resolve()
            await reset.promise
          },
          async close() {},
        }
      },
    },
    journal,
  )
  try {
    await service.settled()
    const lease = service.acquire("one")!
    const id = await journal.begin("a".repeat(64), 1)
    await journal.settle(id, false)
    lease.holdRecovery()
    expect(await service.api.status()).toMatchObject({ state: "recoverable-error", recoveries: [id] })
    await expect(service.api.acknowledgeRecovery({ revision: 1, ids: [id] })).rejects.toThrow("LOGINOM_RECOVERY_BUSY")
    lease.release()
    expect(service.acquire("two")).toBeUndefined()
    const acknowledgement = service.api.acknowledgeRecovery({ revision: 1, ids: [id] })
    const outcome = acknowledgement.then(
      () => "ok",
      (error: Error) => error.message,
    )
    await entered.promise
    expect(journal.pending()).toEqual([id])
    expect(service.acquire("two")).toBeUndefined()
    const closing = shutdown ? service.close() : undefined
    reset.resolve()
    expect(await outcome).toBe(shutdown ? "LOGINOM_HOST_CLOSED" : "ok")
    await closing
    expect(journal.pending()).toEqual(shutdown ? [id] : [])
    if (!shutdown) {
      const next = service.acquire("two")
      expect(next).toBeDefined()
      next?.release()
    }
  } finally {
    reset.resolve()
    await service.close()
    await rm(directory, { recursive: true, force: true })
  }
})
