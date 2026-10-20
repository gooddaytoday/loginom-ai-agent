import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

test.each([undefined, false, true])(
  "browser recovery tools follow only the private launch capability: %p",
  async (capability) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-browser-recovery-capability-"))
    const resources = join(directory, "resources")
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await stageKnowledgeFixture(resources)
    await mkdir(join(resources, "bin"))
    await symlink(node, join(resources, "bin/node"))
    await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
    // The controlled runtime always lists recovery tools, so the host gate alone decides.
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      import { appendFileSync } from 'node:fs';
      process.on('message', m => {
        if (m.operation === 'start') {
          appendFileSync(${JSON.stringify(join(directory, "starts.jsonl"))},
            JSON.stringify({ chat: m.input.chat, browserRecovery: m.input.browserRecovery ?? null }) + '\\n');
          process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        }
        if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
        if (m.operation === 'list') process.send({id:m.id,result:{prepared:true,
          tools:['dock_node_wait','dock_browser_recovery','browser_click'].map(name=>({name,inputSchema:{type:'object'}}))}});
        if (m.operation === 'call') process.send({id:m.id,result:{result:{name:m.input.name},recoveryPending:false,activeWork:false}});
      });
    `,
    )
    const root = join(directory, "profile")
    const store = connectionStore(join(root, "connection"), credentials("linux"))
    await store.stage({ generation: 1, revision: 1, url: "http://example.test", username: "user", apiKey: "fixture", password: "" })
    await store.activate(1)
    const host = await createLoginomHost({
      root,
      resources,
      codec: credentials("linux"),
      environment: { LOGINOM_AI_AGENT_BROWSER_RECOVERY: "1" },
      browserRecovery: capability,
    })
    const requests = new EventEmitter()
    const replies = new EventEmitter()
    loginomHostPort(
      { postMessage: (value) => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} },
      host,
    )
    const client = transport({
      postMessage: (value) => requests.emit("message", { data: value }),
      on: replies.on.bind(replies),
      start() {},
    })
    try {
      await waitForKnowledge(host)
      expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
      await client.request("scope", {
        run: "one",
        mode: "bind",
        scope: { taskMessageID: "msg_original", profile: "loginom-automation" },
      })
      await client.request("call", { run: "one", name: "dock_prepare", args: {}, userMessage: "msg_original" })
      const listed = (await client.request("tools", { run: "one" })) as { tools: { name: string }[] }
      const names = listed.tools.map((tool) => tool.name)
      expect(names).toContain("dock_node_wait")
      expect(names.includes("dock_browser_recovery")).toBe(capability === true)
      expect(names.includes("browser_click")).toBe(capability === true)
      const call = client.request("call", { run: "one", name: "browser_click", args: {}, userMessage: "msg_original" })
      if (capability === true) expect(await call).toEqual({ name: "browser_click" })
      if (capability !== true) await expect(call).rejects.toThrow("LOGINOM_SCOPE_DENIED")
      await client.request("release", { run: "one" })
    } finally {
      await host.close()
      const starts = (await readFile(join(directory, "starts.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      // An environment variable never enables the capability.
      expect(starts.filter((value) => value.chat !== "readiness").map((value) => value.browserRecovery)).toEqual([
        capability === true,
      ])
      await rm(directory, { recursive: true, force: true })
    }
  },
  30_000,
)

test("releasing a run during browser recovery stops the attempt in the runtime", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-browser-recovery-release-"))
  const resources = join(directory, "resources")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await stageKnowledgeFixture(resources)
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
      if (m.operation === 'list') process.send({id:m.id,result:{prepared:true,
        tools:['dock_browser_recovery','browser_click'].map(name=>({name,inputSchema:{type:'object'}}))}});
      if (m.operation !== 'call') return;
      appendFileSync(${JSON.stringify(join(directory, "calls.jsonl"))}, JSON.stringify(m.input) + '\\n');
      const action = m.input.arguments?.action;
      const phase = action === 'start' ? 'browser' : action === 'stop' ? 'stopped' : undefined;
      const result = phase ? {content:[{type:'text',text:'{}'}],structuredContent:{phase,operation_id:'op-1'}}
        : {content:[{type:'text',text:'clicked'}]};
      process.send({id:m.id,result:{result,recoveryPending:false,activeWork:false}});
    });
  `,
  )
  const root = join(directory, "profile")
  const store = connectionStore(join(root, "connection"), credentials("linux"))
  await store.stage({ generation: 1, revision: 1, url: "http://example.test", username: "user", apiKey: "fixture", password: "" })
  await store.activate(1)
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {}, browserRecovery: true })
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  loginomHostPort(
    { postMessage: (value) => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} },
    host,
  )
  const client = transport({
    postMessage: (value) => requests.emit("message", { data: value }),
    on: replies.on.bind(replies),
    start() {},
  })
  const calls = async () =>
    (await readFile(join(directory, "calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
  try {
    await waitForKnowledge(host)
    for (const run of ["one", "two"]) {
      await client.request("acquire", { run, session: "chat" })
      await client.request("scope", {
        run,
        mode: "bind",
        scope: { taskMessageID: "msg_" + run, profile: "loginom-automation" },
      })
      await client.request("call", { run, name: "dock_prepare", args: {}, userMessage: "msg_" + run })
      await client.request("tools", { run })
      const start = { action: "start", operation_id: "op-1" }
      await client.request("call", { run, name: "dock_browser_recovery", args: start, userMessage: "msg_" + run })
      await client.request("call", { run, name: "browser_click", args: { target: "e1" }, userMessage: "msg_" + run })
      // The second run stops its attempt itself before ending, so release adds nothing.
      if (run === "two")
        await client.request("call", {
          run,
          name: "dock_browser_recovery",
          args: { action: "stop", operation_id: "op-1" },
          userMessage: "msg_" + run,
        })
      await client.request("release", { run })
    }
    const recovery = (await calls())
      .filter((call) => call.name === "dock_browser_recovery")
      .map((call) => call.arguments.action)
    expect(recovery).toEqual(["start", "stop", "start", "stop"])
    expect((await calls()).find((call) => call.arguments.action === "stop").arguments).toEqual({
      action: "stop",
      operation_id: "op-1",
      reason: "The agent run ended during browser recovery.",
    })
  } finally {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
