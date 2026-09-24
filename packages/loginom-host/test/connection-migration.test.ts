import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Product } from "@loginom-ai-agent/product"
import { connectionStore } from "../src/connection/connection-store"
import { connectionService, type ConnectionRuntime } from "../src/connection/connection-service"
import { credentials, type CredentialCodec } from "../src/connection/credentials"
import { cliCredentials } from "../src/connection/cli-credentials"

const original = {
  generation: 1,
  revision: 1,
  url: "http://logi-test-plan.bg.local/app/",
  username: "original-user",
  apiKey: "private-key",
  password: "private-password",
}

async function fixture(codec: CredentialCodec) {
  const directory = await mkdtemp(join(tmpdir(), "loginom-migration-"))
  const store = connectionStore(directory, codec)
  const prepared: string[] = []
  const services: Awaited<ReturnType<typeof connectionService>>[] = []
  const runtime: ConnectionRuntime = {
    async check() {},
    async prepare(record) {
      prepared.push(record.url)
      return { async close() {} }
    },
  }
  return {
    store,
    prepared,
    runtime,
    async start() {
      const service = await connectionService(store, runtime)
      services.push(service)
      await service.settled()
      return service
    },
    async history() {
      return readFile(join(directory, "generations", "1.json"), "utf8")
    },
    async close() {
      await Promise.all(services.map((service) => service.close()))
      await rm(directory, { recursive: true, force: true })
    },
  }
}

for (const [name, codec] of [
  ["Desktop", credentials("linux")],
  ["CLI", cliCredentials("linux")],
] as const) {
  for (const url of [original.url, original.url.slice(0, -1)]) {
    test(`${name}: migrates ${url}, preserves secrets/history and does not repeat after restart`, async () => {
      const f = await fixture(codec)
      try {
        await f.store.stage({ ...original, url })
        await f.store.activate(1)
        const history = await f.history()
        const first = await f.start()
        expect(await f.store.read()).toEqual({ ...original, url: Product.connection.url, generation: 2, revision: 2 })
        expect(await f.history()).toBe(history)
        expect(await f.store.pending()).toBeUndefined()
        expect(first.acquire("run")?.generation).toBe(2)
        expect(f.prepared).toEqual([Product.connection.url])
        await first.close()
        await f.start()
        expect((await f.store.read())?.generation).toBe(2)
        expect(await f.store.latestGeneration()).toBe(2)
      } finally {
        await f.close()
      }
    })
  }

  test(`${name}: keeps custom URLs, including old-origin custom paths and queries`, async () => {
    for (const url of [
      "https://private.example/app/",
      `${original.url}?custom=1`,
      "http://logi-test-plan.bg.local/other/",
    ]) {
      const f = await fixture(codec)
      try {
        await f.store.stage({ ...original, url })
        await f.store.activate(1)
        await f.start()
        expect(await f.store.read()).toEqual({ ...original, url })
      } finally {
        await f.close()
      }
    }
  })

  for (const url of [original.url, "https://pending.example/app/"]) {
    test(`${name}: pending settings take precedence (${url})`, async () => {
      const f = await fixture(codec)
      try {
        await f.store.stage(original)
        await f.store.activate(1)
        const pending = {
          ...original,
          url,
          generation: 2,
          revision: 2,
          username: "pending-user",
          apiKey: "pending-key",
        }
        await f.store.savePending(pending)
        await f.start()
        expect(await f.store.read()).toEqual(
          url === original.url ? { ...pending, url: Product.connection.url, generation: 3, revision: 3 } : pending,
        )
        expect(f.prepared).toEqual([url === original.url ? Product.connection.url : url])
      } finally {
        await f.close()
      }
    })
  }

  test(`${name}: preparation failure preserves durable settings and retries on restart`, async () => {
    const f = await fixture(codec)
    try {
      await f.store.stage(original)
      await f.store.activate(1)
      const prepare = f.runtime.prepare
      f.runtime.prepare = async () => {
        throw new Error("unavailable")
      }
      const failed = await f.start()
      expect(await failed.api.status()).toMatchObject({
        state: "recoverable-error",
        failure: "LOGINOM_RUNTIME_START_FAILED",
      })
      expect(failed.acquire("run")).toBeUndefined()
      expect(await f.store.read()).toEqual(original)
      expect(await f.store.pending()).toEqual({ ...original, url: Product.connection.url, generation: 2, revision: 2 })
      await failed.close()
      f.runtime.prepare = prepare
      await f.start()
      expect(await f.store.read()).toEqual({ ...original, url: Product.connection.url, generation: 2, revision: 2 })
    } finally {
      await f.close()
    }
  })

  test(`${name}: a fresh profile exposes the new default without saving a connection`, async () => {
    const f = await fixture(codec)
    try {
      const service = await f.start()
      expect(await service.api.read()).toMatchObject({
        url: Product.connection.url,
        state: "unconfigured",
        generation: 0,
      })
      expect(await f.store.read()).toBeUndefined()
      expect(f.prepared).toEqual([])
    } finally {
      await f.close()
    }
  })
}
