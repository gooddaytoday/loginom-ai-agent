import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
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
      await expect(client.request("acquire", { run: "duplicate", session: "chat" })).rejects.toThrow(
        "LOGINOM_CALL_BUSY",
      )
      expect(await call("wait")).toEqual({ action: "wait" })
      expect(host.journal.pending()).toEqual([])
      expect((await recoveryStore(join(root, "recovery"), { strict: true })).pending()).toHaveLength(2)
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
      expect((await recoveryStore(join(root, "recovery"), { strict: true })).pending().sort()).toEqual(
        host.journal.pending().sort(),
      )
      if (ending !== "close")
        await expect(client.request("acquire", { run: "next", session: "chat" })).rejects.toThrow(
          "LOGINOM_RECOVERY_REQUIRED",
        )
    } finally {
      client.close()
      await port.close()
      // Disconnect leaves the runtime process owned. Exit drops it, so shutdown
      // only has to close runtimes that are still alive.
      if (ending === "disconnect") await expect(host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
      if (ending !== "disconnect") await host.close()
      if (ending !== "finish") {
        const calls = await readFile(join(directory, "calls.jsonl"), "utf8")
        expect(
          calls
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line).action),
        ).toEqual(ending === "release" || ending === "close" ? ["start", "wait"] : ["start", "wait", ending])
        const pending = (await recoveryStore(join(root, "recovery"), { strict: true })).pending().sort()
        const reopened = await createLoginomHost({
          root,
          resources,
          codec: credentials("linux"),
          environment: {},
          strictRecovery: true,
        })
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

test("an uncertain call leaves the same run free to continue", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-advisory-call-"))
  const resources = join(directory, "resources")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      if (m.operation !== 'call') return;
      const action = m.input.arguments.action;
      appendFileSync(${JSON.stringify(join(directory, "calls.jsonl"))}, JSON.stringify({ action }) + '\\n');
      process.send({id:m.id,result:{result:{action},recoveryPending:action!=='finish',activeWork:false}});
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
    expect(await call("uncertain")).toEqual({ action: "uncertain" })
    expect(await call("finish")).toEqual({ action: "finish" })
    expect(
      (await readFile(join(directory, "calls.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).action),
    ).toEqual(["uncertain", "finish"])
  } finally {
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("an uncertain run releases the chat and applies connection changes saved during it", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-advisory-release-"))
  const resources = join(directory, "resources")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true,checked:true}});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      if (m.operation !== 'call') return;
      const action = m.input.arguments.action;
      process.send({id:m.id,result:{result:{action},recoveryPending:action!=='finish',activeWork:false}});
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
  try {
    await host.settled()
    expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
    const validation = await host.api.check({
      revision: 1,
      url: "http://example.test",
      username: "other",
      apiKey: { operation: "preserve" },
      password: { operation: "preserve" },
    })
    expect(
      await host.api.save({ revision: 1, validationId: validation.validationId }),
    ).toMatchObject({ state: "pending", generation: 1, username: "user" })
    expect(
      await client.request("call", { run: "one", name: "dock_node_wait", args: { action: "uncertain" }, userMessage: "original" }),
    ).toEqual({ action: "uncertain" })
    await client.request("release", { run: "one" })
    await host.settled()
    const status = await host.api.status()
    expect(status.recoveries).toBeUndefined()
    expect(status).toMatchObject({ state: "ready", generation: 2, username: "other" })
    expect(await client.request("acquire", { run: "next", session: "chat" })).toEqual({ generation: 2 })
  } finally {
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("restarting the host drops an uncertain record without replaying it", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-advisory-restart-"))
  const resources = join(directory, "resources")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      if (m.operation !== 'call') return;
      appendFileSync(${JSON.stringify(join(directory, "calls.jsonl"))}, JSON.stringify({ action: m.input.arguments.action }) + '\\n');
      process.send({id:m.id,result:{result:{action:m.input.arguments.action},recoveryPending:false,activeWork:false}});
    });
  `,
  )
  const root = join(directory, "profile")
  const calls = join(directory, "calls.jsonl")
  await Bun.write(calls, "")
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
  const planted = await recoveryStore(join(root, "recovery"), { strict: true })
  const id = await planted.begin("a".repeat(64), 1)
  await planted.settle(id, false)
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
  try {
    await host.settled()
    const status = await host.api.status()
    expect(status.recoveries).toBeUndefined()
    expect(status.state).toBe("ready")
    expect(await client.request("acquire", { run: "next", session: "chat" })).toEqual({ generation: 1 })
    expect(await readFile(calls, "utf8")).toBe("")
    expect((await readdir(join(root, "recovery"))).filter((name) => name.endsWith(".json"))).toEqual([])
  } finally {
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("a killed runtime is replaced for the next call in the same run", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-advisory-restart-runtime-"))
  const resources = join(directory, "resources")
  const launches = join(directory, "launches.jsonl")
  const calls = join(directory, "calls.jsonl")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') {
        appendFileSync(${JSON.stringify(launches)}, JSON.stringify({ pid: process.pid, chat: m.input.chat }) + '\\n');
        process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        return;
      }
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      if (m.operation !== 'call') return;
      const action = m.input.arguments.action;
      appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ action }) + '\\n');
      if (action === 'kill') { process.kill(process.pid, 'SIGKILL'); return; }
      process.send({id:m.id,result:{result:{action},recoveryPending:false,activeWork:false}});
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
    await expect(call("kill")).rejects.toThrow("LOGINOM_CALL_UNCERTAIN")
    expect(await call("finish")).toEqual({ action: "finish" })
    const started = (await readFile(launches, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { pid: number; chat: string })
    const chat = createHash("sha256").update("chat").digest("hex")
    const session = started.filter((item) => item.chat === chat)
    expect(session).toHaveLength(2)
    expect(session[0]?.pid).not.toBe(session[1]?.pid)
    expect(
      (await readFile(calls, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).action),
    ).toEqual(["kill", "finish"])
  } finally {
    client.close()
    await port.close()
    await host.close().catch((error: Error) => {
      if (error.message !== "LOGINOM_RUNTIME_CLEANUP_FAILED") throw error
    })
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("a chat runtime restarts at most twice in one turn", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-advisory-relaunch-limit-"))
  const resources = join(directory, "resources")
  const calls = join(directory, "calls.jsonl")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') {
        process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        return;
      }
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      if (m.operation !== 'call') return;
      const action = m.input.arguments.action;
      appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ action }) + '\\n');
      if (action === 'kill') { process.kill(process.pid, 'SIGKILL'); return; }
      process.send({id:m.id,result:{result:{action},recoveryPending:false,activeWork:false}});
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
  const call = (run: string, action: string) =>
    client.request("call", { run, name: "dock_node_wait", args: { action }, userMessage: "original" })
  try {
    await host.settled()
    expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
    await expect(call("one", "kill")).rejects.toThrow("LOGINOM_CALL_UNCERTAIN")
    await expect(call("one", "kill")).rejects.toThrow("LOGINOM_CALL_UNCERTAIN")
    await expect(call("one", "kill")).rejects.toThrow("LOGINOM_CALL_UNCERTAIN")
    await expect(call("one", "finish")).rejects.toThrow("LOGINOM_RUNTIME_UNAVAILABLE")
    expect(
      (await readFile(calls, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).action),
    ).toEqual(["kill", "kill", "kill"])
    expect((await readdir(join(root, "recovery"))).filter((name) => name.endsWith(".json"))).toEqual([])
    await client.request("release", { run: "one" })
    expect(await client.request("acquire", { run: "two", session: "chat" })).toEqual({ generation: 1 })
    expect(await call("two", "finish")).toEqual({ action: "finish" })
  } finally {
    client.close()
    await port.close()
    await host.close().catch((error: Error) => {
      if (error.message !== "LOGINOM_RUNTIME_CLEANUP_FAILED") throw error
    })
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("the next turn replaces a runtime that cannot continue", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-advisory-stale-runtime-"))
  const resources = join(directory, "resources")
  const launches = join(directory, "launches.jsonl")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') {
        appendFileSync(${JSON.stringify(launches)}, JSON.stringify({ pid: process.pid, chat: m.input.chat }) + '\\n');
        process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        return;
      }
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      if (m.operation !== 'call') return;
      const action = m.input.arguments.action;
      process.send({id:m.id,result:{result:{action},recoveryPending:action!=='finish',activeWork:false}});
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
  const call = (run: string, action: string) =>
    client.request("call", { run, name: "dock_node_wait", args: { action }, userMessage: "original" })
  try {
    await host.settled()
    expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
    expect(await call("one", "uncertain")).toEqual({ action: "uncertain" })
    await client.request("release", { run: "one" })
    expect(await client.request("acquire", { run: "two", session: "chat" })).toEqual({ generation: 1 })
    expect(await call("two", "finish")).toEqual({ action: "finish" })
    const chat = createHash("sha256").update("chat").digest("hex")
    const session = (await readFile(launches, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { pid: number; chat: string })
      .filter((item) => item.chat === chat)
    expect(session).toHaveLength(2)
    expect(session[0]?.pid).not.toBe(session[1]?.pid)
  } finally {
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("the next turn keeps a runtime that still has active work", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-advisory-active-runtime-"))
  const resources = join(directory, "resources")
  const launches = join(directory, "launches.jsonl")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') {
        appendFileSync(${JSON.stringify(launches)}, JSON.stringify({ pid: process.pid, chat: m.input.chat }) + '\\n');
        process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        return;
      }
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      if (m.operation !== 'call') return;
      const action = m.input.arguments.action;
      const active = action === 'pending';
      process.send({id:m.id,result:{result:{action},recoveryPending:active,activeWork:active}});
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
  const call = (run: string, action: string) =>
    client.request("call", { run, name: "dock_node_wait", args: { action }, userMessage: "original" })
  try {
    await host.settled()
    expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
    expect(await call("one", "pending")).toEqual({ action: "pending" })
    await client.request("release", { run: "one" })
    expect(await client.request("acquire", { run: "two", session: "chat" })).toEqual({ generation: 1 })
    expect(await call("two", "finish")).toEqual({ action: "finish" })
    const chat = createHash("sha256").update("chat").digest("hex")
    const session = (await readFile(launches, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { pid: number; chat: string })
      .filter((item) => item.chat === chat)
    expect(session).toHaveLength(1)
  } finally {
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)
