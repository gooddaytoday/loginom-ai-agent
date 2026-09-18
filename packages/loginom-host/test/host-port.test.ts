import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { recoveryStore } from "../src/connection/recovery-store"

test.each(["finish", "release", "close", "uncertain", "disconnect", "kill"])(
  "async operation journal retains ownership through waits: %s",
  async (ending) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-async-journal-"))
    const resources = join(directory, "resources")
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await mkdir(join(resources, "bin"))
    await symlink(node, join(resources, "bin/node"))
    await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
    // A real supervised IPC process supplies controlled runtime states. No browser or business operation is run.
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      import { appendFileSync } from 'node:fs';
      process.on('message', m => {
        if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
        if (m.operation === 'list') process.send({id:m.id,result:{tools:[]}});
        if (m.operation !== 'call') return;
        const action = m.input.arguments.action;
        appendFileSync(${JSON.stringify(join(directory, "calls.jsonl"))}, JSON.stringify({ action }) + '\\n');
        if (action === 'disconnect') { process.disconnect(); return; }
        if (action === 'kill') { process.kill(process.pid, 'SIGKILL'); return; }
        process.send({id:m.id,result:{result:{action},recoveryPending:action!=='finish',activeWork:action!=='uncertain'&&action!=='finish'}});
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
    const client = transport({
      postMessage: (value) => requests.emit("message", { data: value }),
      on: replies.on.bind(replies),
      start() {},
    })
    const call = (action: string) =>
      client.request("call", { run: "one", name: "dock_node_wait", args: { action }, userMessage: "original" })
    try {
      await host.settled()
      expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
      expect(await call("start")).toEqual({ action: "start" })
      expect(host.journal.pending()).toEqual([])
      expect((await readdir(join(root, "recovery"))).filter((name) => name.endsWith(".json"))).toHaveLength(1)
      expect(await client.request("acquire", { run: "duplicate", session: "chat" })).toBeNull()
      expect(await call("wait")).toEqual({ action: "wait" })
      expect(host.journal.pending()).toEqual([])
      expect((await recoveryStore(join(root, "recovery"))).pending()).toHaveLength(2)
      if (ending === "finish") {
        expect(await call("finish")).toEqual({ action: "finish" })
        expect(await readdir(join(root, "recovery"))).toEqual([])
        await client.request("release", { run: "one" })
        expect(await client.request("acquire", { run: "next", session: "chat" })).toEqual({ generation: 1 })
        await client.request("release", { run: "next" })
        return
      }
      if (ending === "release") await client.request("release", { run: "one" })
      if (ending === "close") await port.close()
      if (ending === "uncertain") {
        expect(await call("uncertain")).toEqual({ action: "uncertain" })
        await expect(call("finish")).rejects.toThrow("LOGINOM_RECOVERY_REQUIRED")
      }
      if (ending === "disconnect" || ending === "kill")
        await expect(call(ending)).rejects.toThrow("LOGINOM_CALL_UNCERTAIN")
      expect(host.journal.pending().length).toBeGreaterThanOrEqual(2)
      expect((await recoveryStore(join(root, "recovery"))).pending().sort()).toEqual(host.journal.pending().sort())
      if (ending !== "close") expect(await client.request("acquire", { run: "next", session: "chat" })).toBeNull()
    } finally {
      client.close()
      await port.close()
      // A disconnected or killed runtime cannot acknowledge successful cleanup.
      if (ending === "disconnect" || ending === "kill")
        await expect(host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
      if (ending !== "disconnect" && ending !== "kill") await host.close()
      if (ending !== "finish") {
        const calls = await readFile(join(directory, "calls.jsonl"), "utf8")
        expect(
          calls
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line).action),
        ).toEqual(ending === "release" || ending === "close" ? ["start", "wait"] : ["start", "wait", ending])
        const pending = (await recoveryStore(join(root, "recovery"))).pending().sort()
        const reopened = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
        try {
          await reopened.settled()
          const status = await reopened.api.status()
          expect(status.state).toBe("recoverable-error")
          expect(status.recoveries?.slice().sort()).toEqual(pending)
          expect(reopened.acquire("after-restart")).toBeUndefined()
          expect(await readFile(join(directory, "calls.jsonl"), "utf8")).toBe(calls)
          await expect(
            reopened.api.acknowledgeRecovery({ revision: status.revision, ids: pending.slice(1) }),
          ).rejects.toThrow("LOGINOM_RECOVERY_CONFLICT")
          expect(reopened.journal.pending().sort()).toEqual(pending)
          await reopened.api.acknowledgeRecovery({ revision: status.revision, ids: pending })
          expect(reopened.journal.pending()).toEqual([])
          const lease = reopened.acquire("after-acknowledgement")
          expect(lease).toBeDefined()
          lease?.release()
          // Neither restoring nor acknowledging uncertainty may dispatch the old calls.
          expect(await readFile(join(directory, "calls.jsonl"), "utf8")).toBe(calls)
        } finally {
          await reopened.close()
        }
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)
