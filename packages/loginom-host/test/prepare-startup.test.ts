import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

test.each(["ready", "deadline", "release", "interrupt", "close", "generation", "host-close"])(
  "prepare waits for the existing MCP catalog without late admission: %s",
  async (ending) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "prepare-startup-"))
    const resources = join(directory, "resources")
    const root = join(directory, "profile")
    const calls = join(directory, "calls.json")
    const cleanup: (() => void | Promise<void>)[] = []
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let lists = 0
    const server = await knowledgeServer(
      { after: (callback) => cleanup.push(callback) },
      {
        list: async () => {
          if (++lists === 1) {
            entered.resolve()
            await release.promise
          }
          return { tools: server.tools }
        },
      },
    )
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(node, join(resources, "bin/node"))
    await symlink(
      fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      join(resources, "runtime/src/knowledge-entry.mjs"),
    )
    await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: server.endpoint }))
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      import { appendFileSync } from 'node:fs';
      process.on('message', m => {
        if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true,checked:true}});
        if (m.operation === 'call') {
          appendFileSync(${JSON.stringify(calls)}, JSON.stringify(m.input) + '\\n');
          process.send({id:m.id,result:{result:{prepared:true},recoveryPending:false}});
        }
        if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      });
    `,
    )
    const store = connectionStore(join(root, "connection"), credentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      url: "http://example.test",
      username: "user",
      apiKey: "UNIT-NONSECRET",
      password: "",
    })
    await store.activate(1)
    const host = await createLoginomHost({
      root,
      resources,
      codec: credentials("linux"),
      environment: {},
      strictRecovery: true,
    })
    const requests = new EventEmitter()
    const replies = new EventEmitter()
    const port = loginomHostPort(
      { postMessage: (value) => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} },
      host,
    )
    const client = transport({
      postMessage: (value) => requests.emit("message", { data: value }),
      on: replies.on.bind(replies),
      start() {},
    })
    try {
      await host.settled()
      await entered.promise
      expect(await host.api.status()).toMatchObject({ state: "starting", generation: 1 })
      expect(host.acquire("ordinary")).toBeUndefined()
      await client.request("acquire", { run: "one", session: "chat" })
      await client.request("acquire", { run: "local", session: "local-chat" })
      await client.request("scope", {
        run: "one",
        mode: "bind",
        scope: { taskMessageID: "msg_original", profile: "loginom-automation" },
      })
      const budget = ending === "deadline" ? 200 : 2000
      let early: unknown
      const pending = client
        .request("call", {
          run: "one",
          name: "dock_prepare",
          args: { intent: "new_draft", timeout_ms: budget },
          userMessage: "msg_original",
        })
        .then(
          (result) => ({ result }),
          (error: Error) => ({ error: error.message }),
        )
        .then((outcome) => {
          early = outcome
          return outcome
        })
      await Bun.sleep(30)
      expect(early).toBeUndefined()
      expect(await readdir(join(root, "recovery"))).toEqual([])
      expect(await Bun.file(calls).exists()).toBe(false)
      // Both local operations stay responsive while the remote listTools is held.
      expect(await client.request("tools", { run: "local" })).toMatchObject({ tools: expect.any(Array) })
      expect(
        await client.request("call", { run: "local", name: "dock_diagnostics", userMessage: "msg_original" }),
      ).toMatchObject({ structuredContent: { state: "starting" } })
      if (ending === "release") await client.request("release", { run: "one" })
      if (ending === "interrupt") await client.request("interrupt", { run: "one" })
      if (ending === "close") {
        await port.close()
        client.close()
      }
      if (ending === "host-close") await host.close()
      if (ending === "generation") {
        const checked = await host.api.check({
          revision: 1,
          url: "http://replacement.test",
          username: "user",
          apiKey: { operation: "preserve" },
          password: { operation: "preserve" },
        })
        await host.api.save({ revision: 1, validationId: checked.validationId })
        await host.settled()
        expect((await host.api.status()).generation).toBe(2)
      }
      if (ending === "deadline") {
        expect(await pending).toEqual({ error: "LOGINOM_CONNECTION_NOT_READY" })
        expect(await readdir(join(root, "recovery"))).toEqual([])
      }
      release.resolve()
      if (!["host-close", "generation"].includes(ending)) await host.catalog(1)
      const outcome = await pending
      if (ending === "ready") {
        expect(outcome).toEqual({ result: { prepared: true } })
        const dispatches = (await readFile(calls, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        expect(dispatches).toHaveLength(1)
        const [dispatched] = dispatches
        expect(dispatched.name).toBe("dock_prepare")
        expect(dispatched.arguments.timeout_ms).toBeGreaterThan(0)
        expect(dispatched.arguments.timeout_ms).toBeLessThan(budget - 20)
        expect(lists).toBe(1)
      } else {
        if (ending !== "close") expect(outcome).toHaveProperty("error")
        expect(await Bun.file(calls).exists()).toBe(false)
      }
      expect(await readdir(join(root, "recovery"))).toEqual([])
    } finally {
      release.resolve()
      client.close()
      await port.close()
      await host.close()
      for (const close of cleanup.reverse()) await close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  10_000,
)
