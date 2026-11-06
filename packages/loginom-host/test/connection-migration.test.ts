import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
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
    async legacy(url = original.url, pendingUrl?: string) {
      await mkdir(join(directory, "generations"), { mode: 0o700 })
      const record = {
        generation: 1, revision: 1, url, urlSource: "explicit", username: original.username,
        secrets: await codec.encode(original),
      }
      await writeFile(join(directory, "connection.json"), JSON.stringify(record), { mode: 0o600 })
      await writeFile(join(directory, "generations", "1.json"), JSON.stringify(record), { mode: 0o600 })
      if (pendingUrl) {
        const pending = { ...record, url: pendingUrl, generation: 2, revision: 2 }
        await writeFile(join(directory, "pending.json"), JSON.stringify(pending), { mode: 0o600 })
        await writeFile(join(directory, "generations", "2.json"), JSON.stringify(pending), { mode: 0o600 })
      }
    },
    async marker() {
      return readFile(join(directory, "v040-migration.json"), "utf8")
    },
    async start() {
      const service = await connectionService(connectionStore(directory, codec), runtime)
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
  test(`${name}: v0.4.0 resets a legacy foreign host before preparing any runtime and removes stored secrets`, async () => {
    const f = await fixture(codec)
    try {
      await f.legacy("http://10.200.11.224/app/", "https://pending.example/app/")
      const service = await f.start()
      expect(await service.api.status()).toMatchObject({
        url: Product.connection.url, username: "user", hasPassword: false, state: "unconfigured", generation: 0,
      })
      expect(f.prepared).toEqual([])
      expect(service.acquire("run")).toBeUndefined()
      expect(await f.store.read()).toBeUndefined()
      expect(await f.store.pending()).toBeUndefined()
      expect(await readdir(join(f.directory, "generations"))).toEqual([])
      expect(JSON.parse(await f.marker())).toEqual({ state: "complete" })
      expect((await stat(join(f.directory, "v040-migration.json"))).mode & 0o777).toBe(0o600)
      await service.close()
      const restarted = await f.start()
      expect(await restarted.api.status()).toMatchObject({ state: "unconfigured", hasPassword: false })
      expect(f.prepared).toEqual([])
    } finally { await f.close() }
  })

  for (const url of ["https://app.loginom.ai", "https://app.loginom.ai/app/", "https://app.loginom.ai/app/?testable=true"]) {
    test(`${name}: v0.4.0 preserves a legacy public host and its credentials (${url})`, async () => {
      const f = await fixture(codec)
      try {
        await f.legacy(url)
        const before = await readFile(join(f.directory, "connection.json"), "utf8")
        const history = await f.history()
        await f.start()
        expect(await readFile(join(f.directory, "connection.json"), "utf8")).toBe(before)
        expect(await f.history()).toBe(history)
        expect(await f.store.read()).toMatchObject({ url, password: original.password, username: original.username })
        expect(f.prepared).toEqual([url])
        expect(JSON.parse(await f.marker())).toEqual({ state: "complete" })
      } finally { await f.close() }
    })
  }

  test(`${name}: v0.4.0 is one-shot and permits another host to be saved afterwards`, async () => {
    const f = await fixture(codec)
    try {
      await f.legacy()
      const first = await f.start()
      const current = await first.api.status()
      const validation = await first.api.check({
        revision: current.revision, url: original.url, username: original.username,
        password: { operation: "replace", value: "new-password" },
      })
      await first.api.save({ revision: current.revision, validationId: validation.validationId })
      await first.settled()
      const saved = await readFile(join(f.directory, "connection.json"), "utf8")
      const marker = await f.marker()
      await first.close()
      const second = await f.start()
      expect(await second.api.status()).toMatchObject({ url: original.url, hasPassword: true, state: "ready" })
      expect(await f.store.read()).toMatchObject({ password: "new-password" })
      expect(await readFile(join(f.directory, "connection.json"), "utf8")).toBe(saved)
      expect(await f.marker()).toBe(marker)
    } finally { await f.close() }
  })

  test(`${name}: v0.4.0 marks a new profile without creating or resetting a connection`, async () => {
    const f = await fixture(codec)
    try {
      const service = await f.start()
      expect(await service.api.status()).toMatchObject({ state: "unconfigured", url: Product.connection.url })
      expect(await f.store.read()).toBeUndefined()
      expect(await f.store.pending()).toBeUndefined()
      expect(await readdir(join(f.directory, "generations"))).toEqual([])
      expect(JSON.parse(await f.marker())).toEqual({ state: "complete" })
      expect(f.prepared).toEqual([])
    } finally { await f.close() }
  })

  test(`${name}: v0.4.0 resumes interrupted removal before recording completion`, async () => {
    const f = await fixture(codec)
    try {
      await f.legacy()
      await writeFile(join(f.directory, "v040-migration.json"), JSON.stringify({ state: "resetting" }), { mode: 0o600 })
      await rm(join(f.directory, "connection.json"))
      const service = await f.start()
      expect(await service.api.status()).toMatchObject({ state: "unconfigured" })
      expect(await readdir(join(f.directory, "generations"))).toEqual([])
      expect(JSON.parse(await f.marker())).toEqual({ state: "complete" })
    } finally { await f.close() }
  })

  for (const publicPending of [false, true]) {
    test(`${name}: v0.4.0 preserves the public connection when only ${publicPending ? "active" : "pending"} is foreign`, async () => {
      const f = await fixture(codec)
      try {
        await f.legacy(
          publicPending ? original.url : Product.connection.url,
          publicPending ? Product.connection.url : original.url,
        )
        const service = await f.start()
        expect(await service.api.status()).toMatchObject({ url: Product.connection.url, username: original.username, hasPassword: true, state: "ready" })
        expect(await f.store.read()).toMatchObject({ url: Product.connection.url, password: original.password })
        expect(f.prepared).toEqual([Product.connection.url])
        expect(await readdir(join(f.directory, "generations"))).toEqual([publicPending ? "2.json" : "1.json"])
        expect(await f.store.pending()).toBeUndefined()
      } finally { await f.close() }
    })
  }

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
        revision: 1, url: original.url, username: original.username,
        apiKey: { operation: "preserve" }, password: { operation: "preserve" },
      })
      const prepare = f.runtime.prepare
      f.runtime.prepare = async () => { throw Error("unavailable") }
      await first.api.save({ revision: 1, validationId: validation.validationId })
      await first.settled()
      expect(await f.store.pending()).toMatchObject({ url: original.url, urlSource: "explicit", generation: 2 })
      await first.close()
      f.runtime.prepare = prepare
      const restarted = await f.start()
      expect(await restarted.api.status()).toMatchObject({ url: original.url, generation: 2, state: "ready" })
      // The new generation does not carry the saved key forward; Help uses the built-in key.
      expect(await f.store.read()).toMatchObject({ url: original.url, urlSource: "explicit", apiKey: "", password: original.password })
      expect(await f.store.latestGeneration()).toBe(2)
      expect(await f.store.pending()).toBeUndefined()
    } finally { await f.close() }
  })

  test(`${name}: preserves current-version stand URLs and secrets across restarts`, async () => {
    for (const url of [
      original.url,
      original.url.slice(0, -1),
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
        expect(f.prepared).toEqual([url])
        await f.start()
        expect(await f.store.read()).toEqual({ ...original, url })
        expect(await f.store.latestGeneration()).toBe(1)
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
        expect(await f.store.read()).toEqual(pending)
        expect(f.prepared).toEqual([original.url, url])
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
