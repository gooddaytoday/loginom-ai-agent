import { expect, test } from "bun:test"
import { MessageChannel } from "node:worker_threads"
import type { MessagePortMain } from "electron"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loginomHostPort } from "./host-port"
import { connectionService } from "./connection-service"
import { connectionStore } from "./connection-store"
import { credentials } from "./credentials"
import type { desktopLoginom } from "./desktop-service"
import { transport } from "@loginom-ai-agent/loginom-host/transport"
import { recoveryStore } from "./recovery-store"
import { inputStore } from "@loginom-ai-agent/loginom-host/inputs"

test.each(["call", "tools", "admit", "interrupt"])(
  "release during %s retains the generation until the actual request finishes",
  async (method) => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-port-"))
    const service = await connectionService(connectionStore(directory, credentials("linux")), {
      async check() {},
      async prepare() {
        return { async close() {} }
      },
    })
    const initial = {
      revision: 0,
      url: "http://example.test/app/",
      username: "user",
      apiKey: { operation: "replace" as const, value: "test-key" },
      password: { operation: "empty" as const },
    }
    const validation = await service.api.check(initial)
    await service.api.save({ revision: 0, validationId: validation.validationId })
    await service.settled()
    const channel = new MessageChannel()
    const launched = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const main = {
      on(event: string, listener: (value: { data: unknown }) => void) {
        channel.port1.on(event, event === "message" ? (data) => listener({ data }) : listener)
      },
      start() {
        channel.port1.start()
      },
      postMessage(value: unknown) {
        channel.port1.postMessage(value)
      },
    }
    const client = transport({
      on(_event, listener) {
        channel.port2.on("message", (data) => listener({ data }))
      },
      start() {
        channel.port2.start()
      },
      postMessage(value) {
        channel.port2.postMessage(value)
      },
    })
    loginomHostPort(
      main as unknown as MessagePortMain,
      {
        ...service,
        journal: await recoveryStore(join(directory, "recovery")),
        recoveries: new Map(),
        async inputs(generation: number, chat: string, message: string, files: []) {
          return inputStore(join(directory, "inputs")).admit(`${generation}:${chat}`, message, files, "/user")
        },
        async runtime() {
          entered.resolve()
          await launched.promise
          return {
            async request() {
              return { result: { content: [] }, recoveryPending: false }
            },
          }
        },
      } as unknown as Awaited<ReturnType<typeof desktopLoginom>>,
    )
    try {
      expect(await client.request("acquire", { run: "first", session: "chat" })).toEqual({ generation: 1 })
      const call = client.request(method, {
        run: "first",
        name: "tool",
        userMessage: "original-user",
        args: {},
        files: [],
      })
      await entered.promise
      await client.request("release", { run: "first" })
      const next = await service.api.check({ ...initial, revision: 1, username: "other" })
      await service.api.save({ revision: 1, validationId: next.validationId })
      expect(await service.api.status()).toMatchObject({ state: "pending", generation: 1 })
      const rejected = await client
        .request("call", { run: "first", name: "tool", userMessage: "original-user", args: {} }, 1000)
        .catch((error: Error) => error.message)
      expect(rejected).toBe("LOGINOM_HOST_REQUEST_FAILED")
      launched.resolve()
      await call
      await service.settled()
      expect(await service.api.status()).toMatchObject({ state: "ready", generation: 2 })
    } finally {
      launched.resolve()
      client.close()
      channel.port1.close()
      channel.port2.close()
      await service.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
