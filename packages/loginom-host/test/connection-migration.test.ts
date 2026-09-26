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
    directory,
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
  for (const url of [original.url, original.url.slice(0, -1), `${original.url}?testable=true`]) {
    test(`${name}: explicit old-default URL survives setup, status and a fresh process (${url})`, async () => {
      const f = await fixture(codec)
      try {
        const first = await f.start()
        const validation = await first.api.check({
          revision: 0, url, username: original.username,
          apiKey: { operation: "replace", value: original.apiKey }, password: { operation: "empty" },
        })
        await first.api.save({ revision: 0, validationId: validation.validationId })
        await first.settled()
        const expected = url.includes("?") ? original.url : url
        expect(await first.api.status()).toMatchObject({ url: expected, generation: 1, state: "ready" })
        expect(await f.store.read()).toMatchObject({ url: expected, urlSource: "explicit", generation: 1 })
        expect(await first.api.read()).not.toHaveProperty("urlSource")
        const history = await f.history()
        await first.close()
        // Real process boundary; no Loginom/browser or model invocation. The
        // runtime adapter is the same no-I/O test boundary used by this suite.
        const child = Bun.spawn([process.execPath, "--eval", `
          import { connectionStore } from ${JSON.stringify(new URL("../src/connection/connection-store.ts", import.meta.url).href)};
          import { connectionService } from ${JSON.stringify(new URL("../src/connection/connection-service.ts", import.meta.url).href)};
          import { credentials } from ${JSON.stringify(new URL("../src/connection/credentials.ts", import.meta.url).href)};
          import { cliCredentials } from ${JSON.stringify(new URL("../src/connection/cli-credentials.ts", import.meta.url).href)};
          const store = connectionStore(process.argv[1], ${name === "CLI" ? "cliCredentials" : "credentials"}("linux"));
          const service = await connectionService(store, {async check(){}, async prepare(){return {async close(){}}}});
          await service.settled();
          console.log(JSON.stringify(await service.api.status()));
          await service.close();
        `, f.directory], { stdout: "pipe", stderr: "pipe" })
        const output = await new Response(child.stdout).text()
        const error = await new Response(child.stderr).text()
        expect(await child.exited, error).toBe(0)
        expect(JSON.parse(output)).toMatchObject({ url: expected, generation: 1, state: "ready" })
        expect(await f.history()).toBe(history)
        expect(await f.store.latestGeneration()).toBe(1)
      } finally { await f.close() }
    })
  }

  test(`${name}: explicit pending old-default choice survives failed preparation and restart`, async () => {
    const f = await fixture(codec)
    try {
      await f.store.stage(original)
      await f.store.activate(1)
      const first = await f.start()
      const validation = await first.api.check({
        revision: 2, url: original.url, username: original.username,
        apiKey: { operation: "preserve" }, password: { operation: "preserve" },
      })
      const prepare = f.runtime.prepare
      f.runtime.prepare = async () => { throw Error("unavailable") }
      await first.api.save({ revision: 2, validationId: validation.validationId })
      await first.settled()
      expect(await f.store.pending()).toMatchObject({ url: original.url, urlSource: "explicit", generation: 3 })
      await first.close()
      f.runtime.prepare = prepare
      const restarted = await f.start()
      expect(await restarted.api.status()).toMatchObject({ url: original.url, generation: 3, state: "ready" })
      expect(await f.store.read()).toMatchObject({ url: original.url, urlSource: "explicit", apiKey: original.apiKey, password: original.password })
      expect(await f.store.latestGeneration()).toBe(3)
      expect(await f.store.pending()).toBeUndefined()
    } finally { await f.close() }
  })

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
