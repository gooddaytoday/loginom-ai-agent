import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LoginomHost } from "../src/adapter"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"

test.each(["complete", "uncertain", "cancel", "interrupt", "release", "disconnect", "other-chat", "direct"])(
  "parallel calls preserve ownership: %s",
  async (ending) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-parallel-"))
    const resources = join(directory, "resources")
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await mkdir(join(resources, "bin"))
    await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
    // Real IPC with a held call reproduces the managed runtime's single-call contract.
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      let active, started, interrupts = 0;
      const calls = [];
      const reply = (id, result) => process.send({ id, result });
      process.on('message', m => {
        if (m.operation === 'start') return reply(m.id, {protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true});
        if (m.operation === 'close') return process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
        if (m.operation === 'started') {
          if (active) return reply(m.id, true);
          started = m.id;
          return;
        }
        if (m.operation === 'inspect') return reply(m.id, calls);
        if (m.operation === 'interrupts') return reply(m.id, interrupts);
        if (m.operation === 'interrupt' || m.operation === 'finish') {
          if (m.operation === 'interrupt') interrupts++;
          if (active) reply(active, {result:{name:'upload'},recoveryPending:m.input?.uncertain===true,activeWork:false});
          active = undefined;
          return reply(m.id, true);
        }
        if (m.operation !== 'call') return;
        if (active) return process.send({id:m.id,error:'LOGINOM_REQUEST_INVALID'});
        calls.push(m.input.name);
        if (m.input.name !== 'upload') return reply(m.id, {result:{name:m.input.name},recoveryPending:false,activeWork:false});
        active = m.id;
        if (started) reply(started, true);
      });
      `,
    )
    const root = join(directory, "profile")
    const store = connectionStore(join(root, "connection"), credentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      url: "http://example.test",
      username: "user",
      apiKey: "fixture",
      password: "",
    })
    await store.activate(1)
    const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
    const requests = new EventEmitter()
    const replies = new EventEmitter()
    const port = loginomHostPort(
      {
        postMessage: (value) => replies.emit("message", { data: value }),
        on: requests.on.bind(requests),
        start() {},
      },
      host,
    )
    const connection = {
      postMessage: (value: unknown) => requests.emit("message", { data: value }),
      on: replies.on.bind(replies),
      start() {},
    }
    const client = transport(connection)
    LoginomHost.connect(connection)
    try {
      await host.settled()
      const run = await LoginomHost.acquire("chat")
      expect(run).toBeDefined()
      if (!run) throw Error("missing run")
      const runtime = await host.runtime(1, createHash("sha256").update("chat").digest("hex"))
      const controller = new AbortController()
      const first = run.call("upload", {}, "original", ending === "interrupt" ? controller.signal : undefined)
      await runtime.request("started")
      if (ending === "direct") {
        // Find the already acquired run from the private request, without opening another owner.
        const acquired = Promise.withResolvers<string>()
        requests.on("message", ({ data }) => {
          if (data.method === "call") acquired.resolve(data.input.run)
        })
        await runtime.request("finish")
        await first
        const held = run.call("upload", {}, "original")
        const id = await acquired.promise
        await runtime.request("started")
        await expect(client.request("call", { run: id, name: "describe", userMessage: "original" })).rejects.toThrow(
          "LOGINOM_CALL_BUSY",
        )
        expect(host.journal.pending()).toEqual([])
        expect(await readdir(join(root, "recovery"))).toHaveLength(1)
        await runtime.request("finish")
        await held
        expect(await run.call("describe", {}, "original")).toEqual({ name: "describe" })
        expect(await readdir(join(root, "recovery"))).toEqual([])
        await run.release()
        return
      }
      const second = run.call("describe", {}, "original", controller.signal).catch((error: Error) => error.message)
      const third = run
        .call("save-description", {}, "original", controller.signal)
        .catch((error: Error) => error.message)
      // Keep upload in flight while the competing requests cross the real IPC boundary.
      await Bun.sleep(100)
      if (ending === "other-chat") {
        const other = await LoginomHost.acquire("other")
        expect(await other?.call("independent", {}, "original")).toEqual({ name: "independent" })
        await other?.release()
      }
      if (ending === "cancel" || ending === "interrupt") controller.abort()
      if (ending === "release") await run.release()
      if (ending === "disconnect") LoginomHost.disconnect()
      // Attach the handler before disconnect rejection is delivered.
      const firstResult = first.catch((error: Error) => error.message)
      await runtime.request("finish", { uncertain: ending === "uncertain" })
      await firstResult
      const results = await Promise.all([second, third])
      expect(await runtime.request("interrupts")).toBe(ending === "interrupt" ? 1 : 0)
      if (["complete", "other-chat"].includes(ending)) {
        expect(results).toEqual([{ name: "describe" }, { name: "save-description" }])
        expect(await runtime.request("inspect")).toEqual(["upload", "describe", "save-description"])
      } else {
        results.forEach((result) =>
          expect(result).toBe(
            ending === "uncertain"
              ? "LOGINOM_RECOVERY_REQUIRED"
              : ending === "disconnect"
                ? "LOGINOM_HOST_CLOSED"
                : "LOGINOM_RUN_ABORTED",
          ),
        )
        expect(await runtime.request("inspect")).toEqual(["upload"])
      }
      expect(host.journal.pending()).toHaveLength(ending === "uncertain" ? 1 : 0)
      expect(await readdir(join(root, "recovery"))).toHaveLength(ending === "uncertain" ? 1 : 0)
      await run.release()
    } finally {
      LoginomHost.disconnect()
      client.close()
      await port.close()
      await host.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)
