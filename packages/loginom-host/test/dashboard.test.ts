import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventEmitter } from "node:events"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { LoginomHost } from "../src/adapter"
import { Schema } from "effect"
import { HostTaskScope } from "../src/task-scope"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

const binding = { packagePath: "/user/example.lgp", workflowGuid: "11111111-1111-4111-8111-111111111111", nodeGuid: "22222222-2222-4222-8222-222222222222" }

async function fixture(hold: boolean | "start" = false, closeFailure = false) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "dashboard-host-"))
  const root = join(directory, "profile")
  const resources = join(directory, "resources")
  await stageKnowledgeFixture(resources)
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(join(resources, "runtime/src/managed-entry.mjs"), `
    import { appendFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    let reading;
    process.on('message', m => {
      appendFileSync(${JSON.stringify(join(directory, 'runtime.jsonl'))}, JSON.stringify({operation:m.operation,pid:process.pid})+'\\n');
      if(m.operation==='start' && ${JSON.stringify(hold)}!=='start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,...(m.input.validation?{checked:true}:{ready:true})}});
      if(m.operation==='dashboardRead') { if(${JSON.stringify(hold)}) reading=m.id; else process.send({id:m.id,result:null}); }
      if(m.operation==='dashboardPublish' && m.input.content==='\"lose-reply\"') {process.send({id:m.id,error:'LOGINOM_RUNTIME_FAILED'});return;}
      if(m.operation==='dashboardPublish') process.send({id:m.id,result:{status:'written',version:{name:'20261115T000000Z.json',sourceHash:createHash('sha256').update(m.input.content).digest('hex')}}});
      if(m.operation==='interrupt') { if(reading) process.send({id:reading,error:'DASHBOARD_CANCELLED'}); process.send({id:m.id,result:true}); }
      if(m.operation==='close') process.send({id:m.id,...(${closeFailure}?{error:'LOGINOM_RUNTIME_CLEANUP_FAILED'}:{result:{closed:true}})},()=>setTimeout(()=>process.exit(${closeFailure}?1:0),25));
    });
  `)
  const store = connectionStore(join(root, "connection"), credentials("linux"))
  await store.stage({ generation: 1, revision: 1, url: "http://example.test/app/", username: "user", password: "", apiKey: "fixture" })
  await store.activate(1)
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  await waitForKnowledge(host)
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  const port = loginomHostPort({ postMessage: value => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} }, host)
  const backendPort = { postMessage: (value: unknown) => requests.emit("message", { data: value }), on: replies.on.bind(replies), start() {} }
  const client = transport(backendPort)
  return { host, root, directory, client, backendPort, async close() { client.close(); await port.close(); try { await host.close() } finally { await rm(directory, { recursive: true, force: true }) } } }
}

test("dashboard read rejects mismatched origin or generation before starting a runtime", async () => {
  const f = await fixture()
  try {
    await expect(f.host.readDashboard({ origin: "http://other.test", generation: 1, binding })).rejects.toThrow("DASHBOARD_ORIGIN_MISMATCH")
    await expect(f.host.readDashboard({ origin: "http://example.test", generation: 2, binding })).rejects.toThrow("LOGINOM_GENERATION_UNAVAILABLE")
    expect(await readdir(join(f.root, "runtime")).catch(() => [])).toEqual([])
  } finally { await f.close() }
})


test("pre-chat read closes its runtime and waits for actual exit before returning", async () => {
  const f = await fixture()
  try {
    expect(await f.host.readDashboard({ origin: "http://example.test", generation: 1, binding })).toBeNull()
    expect(await f.host.readDashboard({ origin: "http://example.test", generation: 1, binding })).toBeNull()
    const events = (await readFile(join(f.directory, "runtime.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(events.map(event => event.operation)).toEqual(["start", "dashboardRead", "close", "start", "dashboardRead", "close"])
    for (const pid of new Set(events.map(event => event.pid))) expect(() => process.kill(pid, 0)).toThrow()
  } finally { await f.close() }
})


test("dashboard scope exposes only private read/publication and refuses model browser calls", async () => {
  const f = await fixture()
  try {
    await f.client.request("acquire", { run: "run", session: "session" })
    await f.client.request("scope", { run: "run", mode: "bind", scope: { taskMessageID: "msg_dashboard", profile: "loginom-dashboard" } })
    expect(await f.client.request("dashboardRead", { run: "run", origin: "http://example.test", binding }, 1000)).toBeNull()
    const tools = await f.client.request("tools", { run: "run" })
    expect(tools).toEqual({ tools: [] })
    expect(JSON.stringify(tools)).not.toContain("dashboardRead")
    expect(JSON.stringify(tools)).not.toContain("dashboardPublish")
    await expect(f.client.request("call", { run: "run", name: "dock_prepare", args: {}, userMessage: "msg_dashboard" })).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await expect(f.client.request("admit", { run: "run", userMessage: "msg_dashboard", files: [] })).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await f.client.request("release", { run: "run" })
  } finally { await f.close() }
})


test("pre-chat cancellation interrupts the admitted runtime and awaits its clean exit", async () => {
  const f = await fixture(true)
  const controller = new AbortController()
  try {
    const pending = f.host.readDashboard({ origin: "http://example.test", generation: 1, binding }, controller.signal).then(
      () => "finished", (error: Error) => error.message,
    )
    for (let tries = 0; tries < 100; tries++) {
      if ((await readFile(join(f.directory, "runtime.jsonl"), "utf8").catch(() => "")).includes("dashboardRead")) break
      await Bun.sleep(10)
    }
    controller.abort()
    expect(await Promise.race([pending, Bun.sleep(250).then(() => "not-cancelled")])).toBe("DASHBOARD_CANCELLED")
    const events = (await readFile(join(f.directory, "runtime.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(events.map(event => event.operation)).toEqual(["start", "dashboardRead", "interrupt", "close"])
    expect(() => process.kill(events[0].pid, 0)).toThrow()
  } finally { await f.close() }
})

test("host shutdown cancels a pre-chat read before draining its owned runtime", async () => {
  const f = await fixture(true)
  try {
    const pending = f.host.readDashboard({ origin: "http://example.test", generation: 1, binding }).then(
      () => "finished", (error: Error) => error.message,
    )
    for (let tries = 0; tries < 100; tries++) {
      if ((await readFile(join(f.directory, "runtime.jsonl"), "utf8").catch(() => "")).includes("dashboardRead")) break
      await Bun.sleep(10)
    }
    f.host.beginClose()
    await f.host.close()
    expect(await pending).toBe("DASHBOARD_CANCELLED")
    const events = (await readFile(join(f.directory, "runtime.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(events.map(event => event.operation)).toEqual(["start", "dashboardRead", "interrupt", "close"])
    expect(() => process.kill(events[0].pid, 0)).toThrow()
  } finally { await f.close() }
})


test("acquired private adapter reads and publishes with typed replies", async () => {
  const f = await fixture()
  LoginomHost.connect(f.backendPort)
  try {
    const run = await LoginomHost.acquire("dashboard-adapter")
    if (!run) throw Error("No run")
    await run.scope("bind", Schema.decodeUnknownSync(HostTaskScope.Info)({ taskMessageID: "msg_dashboard", profile: "loginom-dashboard" }))
    expect(await run.dashboardRead({ origin: "http://example.test", binding })).toBeNull()
    expect(await run.dashboardPublish({ origin: "http://example.test", binding, content: "{}", expected: null })).toMatchObject({ status: "written", version: { name: "20261115T000000Z.json" } })
    await run.release()
  } finally { LoginomHost.disconnect(); await f.close() }
})

test("adapter cancellation reaches its private operation and release leaves no runtime", async () => {
  const f = await fixture(true)
  LoginomHost.connect(f.backendPort)
  try {
    const run = await LoginomHost.acquire("dashboard-cancel")
    if (!run) throw Error("No run")
    await run.scope("bind", Schema.decodeUnknownSync(HostTaskScope.Info)({ taskMessageID: "msg_dashboard", profile: "loginom-dashboard" }))
    const controller = new AbortController()
    const pending = run.dashboardRead({ origin: "http://example.test", binding }, controller.signal).catch((error: Error) => error.message)
    for (let tries = 0; tries < 100; tries++) {
      if ((await readFile(join(f.directory, "runtime.jsonl"), "utf8").catch(() => "")).includes("dashboardRead")) break
      await Bun.sleep(10)
    }
    controller.abort()
    expect(await Promise.race([pending, Bun.sleep(250).then(() => "not-cancelled")])).toBe("DASHBOARD_CANCELLED")
    await run.release()
  } finally { LoginomHost.disconnect(); await f.close() }
})


test("connection settings stay pending until the short runtime closes and releases its generation", async () => {
  const f = await fixture(true)
  const controller = new AbortController()
  try {
    const pending = f.host.readDashboard({ origin: "http://example.test", generation: 1, binding }, controller.signal).catch((error: Error) => error.message)
    for (let tries = 0; tries < 100; tries++) {
      if ((await readFile(join(f.directory, "runtime.jsonl"), "utf8").catch(() => "")).includes("dashboardRead")) break
      await Bun.sleep(10)
    }
    const checked = await f.host.api.check({ revision: 1, url: "http://replacement.test", username: "user", apiKey: { operation: "preserve" }, password: { operation: "preserve" } })
    await f.host.api.save({ revision: 1, validationId: checked.validationId })
    expect(await f.host.api.status()).toMatchObject({ generation: 1, state: "pending" })
    controller.abort()
    expect(await pending).toBe("DASHBOARD_CANCELLED")
    await f.host.settled()
    expect(await f.host.api.status()).toMatchObject({ generation: 2 })
  } finally { await f.close() }
})


test("cancellation during runtime login closes startup before releasing the operation", async () => {
  const f = await fixture("start")
  const controller = new AbortController()
  try {
    const pending = f.host.readDashboard({ origin: "http://example.test", generation: 1, binding }, controller.signal).catch((error: Error) => error.message)
    for (let tries = 0; tries < 100; tries++) {
      if ((await readFile(join(f.directory, "runtime.jsonl"), "utf8").catch(() => "")).includes("start")) break
      await Bun.sleep(10)
    }
    controller.abort()
    expect(await pending).toBe("DASHBOARD_CANCELLED")
    const events = (await readFile(join(f.directory, "runtime.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(events.map(event => event.operation)).toEqual(["start", "close"])
    expect(() => process.kill(events[0].pid, 0)).toThrow()
  } finally { await f.close() }
})

test("Node shutdown interrupt does not turn confirmed cancelled login cleanup into failure", async () => {
  const f = await fixture("start")
  try {
    const pending = f.host.readDashboard({ origin: "http://example.test", generation: 1, binding }).catch((error: Error) => error.message)
    for (let tries = 0; tries < 100; tries++) {
      if ((await readFile(join(f.directory, "runtime.jsonl"), "utf8").catch(() => "")).includes("start")) break
      await Bun.sleep(10)
    }
    f.host.beginClose()
    await expect(f.host.interruptAll()).resolves.toBeUndefined()
    expect(await pending).toBe("DASHBOARD_CANCELLED")
    await f.host.close()
  } finally { await f.close() }
})

test("direct pre-chat input failures expose a fixed safe error", async () => {
  const f = await fixture()
  try {
    const error = await f.host.readDashboard({ origin: "private-sentinel", generation: 1, binding: null } as never).catch((error: Error) => error.message)
    expect(error).toBe("DASHBOARD_INPUT_INVALID")
    expect(await readdir(join(f.root, "runtime")).catch(() => [])).toEqual([])
  } finally { await f.close() }
})


test("a failed short-runtime cleanup remains a Host shutdown failure", async () => {
  const f = await fixture(false, true)
  try {
    await expect(f.host.readDashboard({ origin: "http://example.test", generation: 1, binding })).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
    await expect(f.host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
  } finally { await f.close().catch(() => undefined) }
})


test("an unclassified publication transport failure is unknown and is never replayed", async () => {
  const f = await fixture()
  try {
    await expect(f.host.publishDashboard({ origin: "http://example.test", generation: 1, binding, content: '"lose-reply"', expected: null })).rejects.toThrow("DASHBOARD_WRITE_UNKNOWN")
    const events = (await readFile(join(f.directory, "runtime.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(events.map(event => event.operation)).toEqual(["start", "dashboardPublish", "close"])
  } finally { await f.close() }
})
