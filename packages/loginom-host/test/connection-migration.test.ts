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
    test(`${name}: preserves explicitly saved ${url}, credentials and history after restart`, async () => {
      const f = await fixture(codec)
      try {
        await f.store.stage({ ...original, url })
        await f.store.activate(1)
        const history = await f.history()
        const first = await f.start()
        expect(await f.store.read()).toEqual({ ...original, url })
        expect(await f.history()).toBe(history)
        expect(await f.store.pending()).toBeUndefined()
        expect(first.acquire("run")?.generation).toBe(1)
        expect(f.prepared).toEqual([url])
        await first.close()
        await f.start()
        expect((await f.store.read())?.generation).toBe(1)
        expect(await f.store.latestGeneration()).toBe(1)
        expect(f.prepared).toEqual([url, url])
      } finally {
        await f.close()
      }
    })
  }

  test(`${name}: keeps custom URLs, including old-origin custom paths and queries`, async () => {
    for (const url of [
      "https://private.example/app/",
      Product.connection.url,
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

  for (const query of ["?testable=true", "?custom=1&testable=true"]) {
    test(`${name}: setup then restart retains the selected LAN endpoint (${query})`, async () => {
      const f = await fixture(codec)
      try {
        const service = await f.start()
        const validation = await service.api.check({
          revision: 0,
          url: original.url + query,
          username: original.username,
          apiKey: { operation: "replace", value: original.apiKey },
          password: { operation: "replace", value: original.password },
        })
        await service.api.save({ revision: 0, validationId: validation.validationId })
        await service.settled()
        const saved = await f.store.read()
        const url = original.url + (query.includes("custom") ? "?custom=1" : "")
        expect(saved).toMatchObject({ url, username: original.username, apiKey: original.apiKey, password: original.password })
        const history = await f.history()
        await service.close()
        await f.start()
        expect(f.prepared).toEqual([url, url])
        expect(await f.store.read()).toEqual(saved)
        expect(await f.store.pending()).toBeUndefined()
        expect(await f.history()).toBe(history)
      } finally {
        await f.close()
      }
    })
  }

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
        expect(await f.store.read()).toEqual(pending)
        expect(f.prepared).toEqual([url])
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
      })
      expect(failed.acquire("run")).toBeUndefined()
      expect(await f.store.read()).toEqual(original)
      expect(await f.store.pending()).toBeUndefined()
      await failed.close()
      f.runtime.prepare = prepare
      await f.start()
      expect(await f.store.read()).toEqual(original)
      expect(f.prepared).toEqual([original.url])
    } finally {
      await f.close()
    }
  })

  test(`${name}: failed pending connection stays pending without contacting the previous endpoint`, async () => {
    const f = await fixture(codec)
    try {
      const active = { ...original, url: "https://previous.example/app/" }
      const pending = { ...original, generation: 2, revision: 2 }
      await f.store.stage(active)
      await f.store.activate(1)
      await f.store.savePending(pending)
      const prepare = f.runtime.prepare
      f.runtime.prepare = async (record) => {
        f.prepared.push(record.url)
        throw new Error("unavailable")
      }
      const failed = await f.start()
      expect(await failed.api.status()).toMatchObject({ state: "recoverable-error", failure: "LOGINOM_RUNTIME_START_FAILED" })
      expect(await f.store.read()).toEqual(active)
      expect(await f.store.pending()).toEqual(pending)
      expect(f.prepared).toEqual([pending.url])
      await failed.close()
      f.runtime.prepare = prepare
      await f.start()
      expect(await f.store.read()).toEqual(pending)
      expect(await f.store.pending()).toBeUndefined()
      expect(f.prepared).toEqual([pending.url, pending.url])
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
