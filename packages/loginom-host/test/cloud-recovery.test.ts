import { EventEmitter } from "node:events"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createLoginomHost } from "../src/host"
import { createCloudAuth, type CallBudget } from "../src/cloud-auth"
import { createKnowledgeSession } from "../src/knowledge-session"
import { cloudStore } from "../src/connection/cloud-store"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

async function fixture(primaryOptions: Parameters<typeof knowledgeServer>[1] = {}, reserveOptions: Parameters<typeof knowledgeServer>[1] = {}, siteRoute?: (request: Request) => Response | Promise<Response>, entry?: string) {
  const directory = await mkdtemp(join(tmpdir(), "cloud-recovery-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const primary = await knowledgeServer({ after: callback => cleanup.push(callback) }, { apiKey: "p-secret", ...primaryOptions })
  const reserve = await knowledgeServer({ after: callback => cleanup.push(callback) }, { apiKey: "r-secret", ...reserveOptions })
  const site = siteRoute ? Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: siteRoute }) : undefined
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(resources, "bin/node"))
  if (entry) await writeFile(join(resources, "runtime/src/knowledge-entry.mjs"), entry.replace("GATE_URL", JSON.stringify(site?.url.origin)))
  else await symlink(fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)), join(resources, "runtime/src/knowledge-entry.mjs"))
  await writeFile(join(resources, "resource-manifest.json"), "{}")
  const store = connectionStore(join(root, "connection"), credentials("linux"))
  await store.stage({ mode: "cloud", generation: 1, revision: 1, url: "http://stand.test/app/", username: "user", password: "", apiKey: "" })
  await store.activate(1)
  await cloudStore(join(root, "connection"), credentials("linux")).write({ kind: "loginom-cloud-v1", installationKey: "site-secret", email: "a@example.test", dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } } })
  const options = { root, resources, codec: credentials("linux"), environment: {}, cloudEndpoints: { site: site?.url.origin ?? "http://127.0.0.1:1", primary: primary.endpoint, reserve: reserve.endpoint } }
  const host = await createLoginomHost(options)
  return { host, primary, reserve, options, async close() {
    await host.close()
    site?.stop(true)
    for (const close of cleanup) await close()
    await rm(directory, { recursive: true, force: true })
  } }
}

test("one HostPort read shares its refresh allowance across catalog recovery and the read", async () => {
  let boot = true
  let refreshes = 0
  let reads = 0
  const f = await fixture({ async request(body, _request, response) {
    if (boot) { response.writeHead(503); response.end(); return true }
    if (!body || typeof body !== "object" || !("method" in body)) return false
    if ((body.method === "initialize" && !refreshes) || (body.method === "tools/call" && ++reads === 1)) {
      response.writeHead(401); response.end(); return true
    }
    return false
  } }, { async request(_body, _request, response) {
    response.writeHead(503); response.end(); return true
  } }, (request) => {
    if (request.method !== "GET" || new URL(request.url).pathname !== "/api/agent/dock-credentials")
      return new Response(null, { status: 404 })
    refreshes++
    return Response.json({ dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: `rotated-reserve-${refreshes}` } } })
  })
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  const port = loginomHostPort({ postMessage: value => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} }, f.host)
  const client = transport({ postMessage: value => requests.emit("message", { data: value }), on: replies.on.bind(replies), start() {} })
  try {
    await f.host.settled()
    await expect(f.host.catalog(1)).rejects.toThrow()
    expect((await f.host.api.status()).help.state).toBe("recoverable-error")
    boot = false
    await client.request("acquire", { run: "first", session: "first" })
    await expect(client.request("call", { run: "first", name: "read", userMessage: "first",
      args: { uris: ["viking://resources/loginom-dock/help"] } })).rejects.toThrow("LOGINOM_KNOWLEDGE_FAILED")
    expect(refreshes).toBe(1)
    expect(reads).toBe(1)
    expect((await f.host.api.status()).cloud.connected).toBe(true)
    await client.request("release", { run: "first" })
    // A new operation has its own allowance, even on the same Host/generation.
    reads = 0
    await client.request("acquire", { run: "second", session: "second" })
    expect(await client.request("call", { run: "second", name: "read", userMessage: "second",
      args: { uris: ["viking://resources/loginom-dock/help"] } })).toMatchObject({ content: expect.any(Array) })
    expect(refreshes).toBe(2)
    expect(reads).toBe(2)
  } finally { client.close(); await port.close(); await f.close() }
}, 240000)

test("reserve recovers primary initialize HTTP 503 with its distinct key", async () => {
  const f = await fixture({ async request(body, _request, response) {
    if ((!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize")) return false
    response.writeHead(503); response.end(); return true
  } })
  try {
    await f.host.settled()
    expect(await f.host.catalog(1)).toMatchObject({ tools: expect.any(Array) })
    expect(await f.host.api.status()).toMatchObject({ server: "reserve", help: { state: "ready" } })
    expect(f.primary.requests.length).toBeGreaterThan(0)
    expect(f.reserve.requests.length).toBeGreaterThan(0)
    expect(f.primary.requests.every(item => item.authorization === "Bearer p-secret")).toBe(true)
    expect(f.reserve.requests.every(item => item.authorization === "Bearer r-secret")).toBe(true)
  } finally { await f.close() }
}, 240000)

test("reserve stays selected across custom and cloud generations; a new Host starts primary", async () => {
  let unavailable = true
  const f = await fixture({ async request(body, _request, response) {
    if (!unavailable || (!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize")) return false
    response.writeHead(503); response.end(); return true
  } })
  try {
    await f.host.settled()
    await f.host.catalog(1)
    for (const mode of ["custom", "cloud"] as const) {
      const status = await f.host.api.status()
      const checked = await f.host.api.check({ revision: status.revision, mode, endpoint: f.reserve.endpoint,
        apiKey: { operation: "replace", value: "r-secret" }, url: status.url, username: status.username,
        password: { operation: "preserve" }, verifyBrowser: false })
      await f.host.api.save({ revision: status.revision, validationId: checked.validationId })
      await f.host.settled()
      await f.host.catalog((await f.host.api.status()).generation)
    }
    expect(await f.host.api.status()).toMatchObject({ server: "reserve", help: { state: "ready" } })
    unavailable = false
    await f.host.close()
    const restarted = await createLoginomHost(f.options)
    try {
      await restarted.settled()
      await restarted.catalog((await restarted.api.status()).generation)
      expect(await restarted.api.status()).toMatchObject({ server: "primary", help: { state: "ready" } })
    } finally { await restarted.close() }
  } finally { await f.close() }
}, 240000)

test("a Host call deadline cancels its child request within the original budget", async () => {
  const cancelled = Promise.withResolvers<void>()
  const release = Promise.withResolvers<{ content: [] }>()
  const f = await fixture({ call(_params, extra) {
    extra.signal.addEventListener("abort", () => cancelled.resolve(), { once: true })
    return release.promise
  } })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await f.host.settled()
    await f.host.catalog(1)
    const started = Date.now()
    await expect(f.host.callKnowledge(1, { run: "run", id: "read", name: "read",
      arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: started + 600, signal: new AbortController().signal })).rejects.toThrow("LOGINOM_RUNTIME_TIMEOUT")
    expect(Date.now() - started).toBeLessThan(1200)
    await Promise.race([cancelled.promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("CHILD_REQUEST_NOT_CANCELLED")), 600)
    })])
    expect(f.reserve.requests).toHaveLength(0)
  } finally { clearTimeout(timer); release.resolve({ content: [] }); await f.close() }
}, 240000)

test("interrupt cancels a Help call while it is still acquiring its connection lease", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let recovering = false
  const f = await fixture({ async request(body, _request, response) {
    if ((!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize")) return false
    if (recovering) { entered.resolve(); await release.promise; return false }
    response.writeHead(503); response.end(); return true
  } }, { async request(body, _request, response) {
    if ((!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize")) return false
    response.writeHead(503); response.end(); return true
  } })
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  const port = loginomHostPort({ postMessage: value => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} }, f.host)
  const client = transport({ postMessage: value => requests.emit("message", { data: value }), on: replies.on.bind(replies), start() {} })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await f.host.settled()
    await expect(f.host.catalog(1)).rejects.toThrow()
    recovering = true
    await client.request("acquire", { run: "run", session: "chat" })
    const call = client.request("call", { run: "run", name: "read", args: { uris: ["viking://resources/loginom-dock/help"] }, userMessage: "original" })
    void call.catch(() => {})
    await entered.promise
    await client.request("interrupt", { run: "run" })
    await expect(Promise.race([call, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("LEASE_WAIT_NOT_CANCELLED")), 1000)
    })])).rejects.toThrow("LOGINOM_KNOWLEDGE_INTERRUPTED")
  } finally { clearTimeout(timer); release.resolve(); client.close(); await port.close(); await f.close() }
}, 240000)

for (const ending of ["complete", "interrupt-first", "interrupt-second", "release-first", "release-second"])
for (const operation of ["read", "tools"]) test(`a fresh HostPort ${operation} joins another run recovering Help: ${ending}`, async () => {
  const entered = Promise.withResolvers<void>()
  const joined = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let recovering = false
  let initializations = 0
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize") return false
    if (recovering) { initializations++; entered.resolve(); await release.promise; return false }
    response.writeHead(503); response.end(); return true
  } }, { async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize") return false
    response.writeHead(503); response.end(); return true
  } })
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  const budgets: CallBudget[] = []
  const reads: CallBudget[] = []
  const port = loginomHostPort({ postMessage: value => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} }, {
    ...f.host,
    catalog(generation, budget) {
      if (budget) budgets.push(budget)
      if (budgets.length === 2) joined.resolve()
      return f.host.catalog(generation, budget)
    },
    callKnowledge(generation, input, budget) { reads.push(budget); return f.host.callKnowledge(generation, input, budget) },
  })
  const client = transport({ postMessage: value => requests.emit("message", { data: value }), on: replies.on.bind(replies), start() {} })
  try {
    await f.host.settled()
    await expect(f.host.catalog(1)).rejects.toThrow()
    recovering = true
    await client.request("acquire", { run: "first", session: "first" })
    const first = client.request("call", { run: "first", name: "read", userMessage: "first",
      args: { uris: ["viking://resources/loginom-dock/help"] } })
    void first.catch(() => {})
    await entered.promise
    expect((await f.host.api.status()).state).toBe("starting")
    await client.request("acquire", { run: "second", session: "second" })
    const started = Date.now()
    const second = operation === "read"
      ? client.request("call", { run: "second", name: "read", userMessage: "second",
          args: { uris: ["viking://resources/loginom-dock/help"] } })
      : client.request("tools", { run: "second" })
    void second.catch(() => {})
    await Promise.race([joined.promise, second.then(() => { throw Error("HELP_RECOVERY_NOT_JOINED") })])
    expect(budgets[1]!.deadline).toBeGreaterThanOrEqual(started + 120_000)
    expect(budgets[1]!.deadline).toBeLessThanOrEqual(Date.now() + 120_000)
    expect(budgets[1]!.signal).not.toBe(budgets[0]!.signal)
    const cancelled = ending === "complete" ? undefined : ending.endsWith("first") ? "first" : "second"
    if (cancelled) {
      await client.request(ending.startsWith("release") ? "release" : "interrupt", { run: cancelled })
      await expect(cancelled === "first" ? first : second).rejects.toThrow("LOGINOM_KNOWLEDGE_INTERRUPTED")
    }
    release.resolve()
    if (cancelled !== "second") expect(await second).toMatchObject(operation === "read"
      ? { content: expect.any(Array) }
      : { tools: expect.arrayContaining([expect.objectContaining({ name: "read" })]) })
    if (cancelled !== "first") expect(await first).toMatchObject({ content: expect.any(Array) })
    expect(f.primary.calls).toHaveLength((cancelled === "first" ? 0 : 1) + (operation === "read" && cancelled !== "second" ? 1 : 0))
    expect(f.reserve.calls).toHaveLength(0)
    expect(initializations).toBe(1)
    for (const budget of reads) expect(budgets).toContain(budget)
  } finally { release.resolve(); client.close(); await port.close(); await f.close() }
}, 240000)

test("primary 401 refreshes the full pair once and retries the same Dock", async () => {
  let refreshes = 0
  const f = await fixture({ apiKey: "new-primary" }, {}, request => {
    expect(request.method).toBe("GET")
    expect(request.headers.get("x-api-key")).toBe("site-secret")
    refreshes++
    return Response.json({ dock: { primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } } })
  })
  try {
    await f.host.settled()
    expect(await f.host.catalog(1)).toMatchObject({ tools: expect.any(Array) })
    expect(await f.host.api.status()).toMatchObject({ server: "primary", help: { state: "ready" } })
    expect(refreshes).toBe(1)
    expect(f.reserve.requests).toHaveLength(0)
    expect((await cloudStore(join(f.options.root, "connection"), credentials("linux")).read())?.dock).toEqual({ primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } })
  } finally { await f.close() }
}, 240000)

test("reserve retries an unavailable Help read without replaying browser work", async () => {
  const f = await fixture({ async request(body, _request, response) {
    if ((!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call")) return false
    response.writeHead(503); response.end(); return true
  } })
  try {
    await f.host.settled(); await f.host.catalog(1)
    expect(await f.host.callKnowledge(1, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: Date.now() + 3000, signal: new AbortController().signal })).toMatchObject({ content: expect.any(Array) })
    expect(await f.host.api.status()).toMatchObject({ server: "reserve", help: { state: "ready" } })
    expect(f.reserve.calls).toHaveLength(1)
    expect(f.host.journal.pending()).toEqual([])
  } finally { await f.close() }
}, 240000)

test("catalog demand joins a read recovering on reserve without reopening primary", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let primaryInitializes = 0
  let primaryCalls = 0
  let reserveInitializes = 0
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body)) return false
    if (body.method === "initialize") primaryInitializes++
    if (body.method !== "tools/call") return false
    primaryCalls++
    response.writeHead(503); response.end(); return true
  } }, { async initialize() { reserveInitializes++; entered.resolve(); await release.promise } })
  try {
    await f.host.settled(); await f.host.catalog(1)
    const budget = { deadline: Date.now() + 4000, signal: new AbortController().signal }
    const read = f.host.callKnowledge(1, { run: "read", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } }, budget)
    void read.catch(() => {})
    await entered.promise
    const catalog = f.host.catalog(1, budget)
    void catalog.catch(() => {})
    release.resolve()
    const outcomes = await Promise.allSettled([read, catalog])
    expect(primaryInitializes).toBe(1)
    expect(reserveInitializes).toBe(1)
    expect(outcomes.map(outcome => outcome.status)).toEqual(["fulfilled", "fulfilled"])
    expect(primaryCalls).toBe(1)
    expect(f.reserve.calls).toHaveLength(1)
    expect(await f.host.api.status()).toMatchObject({ server: "reserve", help: { state: "ready" } })
    await f.host.catalog(1)
    expect(primaryInitializes).toBe(1)
    expect(reserveInitializes).toBe(1)
  } finally { release.resolve(); await f.close() }
}, 240000)

test("joining a failed reserve startup does not grant another failover attempt", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let primaryInitializes = 0
  let reserveInitializes = 0
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body)) return false
    if (body.method === "initialize") primaryInitializes++
    if (body.method !== "tools/call") return false
    response.writeHead(503); response.end(); return true
  } }, { async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize") return false
    reserveInitializes++; entered.resolve(); await release.promise
    response.writeHead(503); response.end(); return true
  } })
  try {
    await f.host.settled(); await f.host.catalog(1)
    const budget = { deadline: Date.now() + 4000, signal: new AbortController().signal }
    const read = f.host.callKnowledge(1, { run: "read", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } }, budget)
    void read.catch(() => {})
    await entered.promise
    const catalog = f.host.catalog(1, budget)
    void catalog.catch(() => {})
    release.resolve()
    expect((await Promise.allSettled([read, catalog])).map(outcome => outcome.status)).toEqual(["rejected", "rejected"])
    expect(primaryInitializes).toBe(1)
    expect(reserveInitializes).toBe(1)
    expect(await f.host.api.status()).toMatchObject({ server: "primary", help: { state: "recoverable-error" } })
  } finally { release.resolve(); await f.close() }
}, 240000)

test("two concurrent Help 401 responses share refresh and both retry within their budget", async () => {
  const both = Promise.withResolvers<void>()
  let failures = 0
  let refreshes = 0
  const f = await fixture({ async request(body, _request, response) {
    if ((!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") || refreshes) return false
    if (++failures === 2) both.resolve()
    await both.promise
    response.writeHead(401, { "content-type": "application/json" })
    response.end(JSON.stringify({ jsonrpc: "2.0", id: "id" in body ? body.id : null, error: { code: -32001, message: "denied" } })); return true
  } }, {}, () => { refreshes++; return Response.json({ dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } } }) })
  try {
    await f.host.settled(); await f.host.catalog(1)
    const budget = { deadline: Date.now() + 4000, signal: new AbortController().signal }
    const reads = ["first", "second"].map(id => f.host.callKnowledge(1, { run: id, id, name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } }, budget))
    expect(await Promise.all(reads)).toHaveLength(2)
    expect(refreshes).toBe(1)
    expect(failures).toBe(2)
    expect(f.reserve.requests).toHaveLength(0)
  } finally { both.resolve(); await f.close() }
}, 240000)

test("late 401 from the same failed child reuses its completed refresh outcome", async () => {
  let revoked = false
  let failures = 0
  let refreshes = 0
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call" || (refreshes && !revoked)) return false
    failures++
    response.writeHead(401); response.end(); return true
  } }, {}, () => { refreshes++; return Response.json({ dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } } }) }, `
    // Gate only IPC delivery; both replies come from the real HTTP client below.
    const send = process.send.bind(process);
    const denied = [];
    const held = new Set();
    process.send = (message, ...args) => {
      if (message.knowledgeFailure?.kind !== 'unauthorized' || !held.has(message.id)) return send(message, ...args);
      denied.push([message, ...args]);
      if (denied.length === 2) send(...denied[0]);
      return true;
    };
    process.on('message', message => {
      if (message.operation === 'call' && ['first', 'second'].includes(message.input.run)) held.add(message.id);
      if (message.operation === 'close' && denied.length === 2) send(...denied[1]);
    });
    await import(${JSON.stringify(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url).href)});
  `)
  try {
    await f.host.settled(); await f.host.catalog(1)
    const budget = { deadline: Date.now() + 4000, signal: new AbortController().signal }
    const reads = ["first", "second"].map(id => f.host.callKnowledge(1, { run: id, id, name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } }, budget))
    expect(await Promise.all(reads)).toHaveLength(2)
    expect(refreshes).toBe(1)
    expect(failures).toBe(2)
    expect(f.reserve.requests).toHaveLength(0)
    revoked = true
    await expect(f.host.callKnowledge(1, { run: "next", id: "next", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } }, budget)).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(refreshes).toBe(1)
    expect(failures).toBe(3)
  } finally { await f.close() }
}, 240000)

test("refresh and retried Help read share one real deadline", async () => {
  let refreshes = 0
  let retries = 0
  const release = Promise.withResolvers<void>()
  const f = await fixture({ async request(body, _request, response) {
    if ((!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call")) return false
    if (!refreshes) { response.writeHead(401); response.end(); return true }
    retries++; await release.promise; return false
  } }, {}, async () => {
    refreshes++
    await new Promise(resolve => setTimeout(resolve, 200))
    return Response.json({ dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } } })
  })
  try {
    await f.host.settled(); await f.host.catalog(1)
    const started = Date.now()
    await expect(f.host.callKnowledge(1, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: started + 1200, signal: new AbortController().signal })).rejects.toThrow("LOGINOM_RUNTIME_TIMEOUT")
    expect(Date.now() - started).toBeLessThan(1800)
    expect(retries).toBe(1)
    expect(refreshes).toBe(1)
    expect(f.reserve.requests).toHaveLength(0)
  } finally { release.resolve(); await f.close() }
}, 240000)

test("recovery cleanup cannot extend the original Help call deadline", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") return false
    response.writeHead(503); response.end(); return true
  } }, {}, async () => { entered.resolve(); await release.promise; return new Response() }, `
    const emit = process.emit.bind(process);
    process.emit = (event, ...args) => {
      if (event !== 'message') return emit(event, ...args);
      if (args[0].operation !== 'close') return emit(event, ...args);
      void fetch(GATE_URL).then(() => emit(event, ...args));
      return true;
    };
    await import(${JSON.stringify(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url).href)});
  `)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await f.host.settled(); await f.host.catalog(1)
    const started = Date.now()
    const call = f.host.callKnowledge(1, { run: "read", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: started + 600, signal: new AbortController().signal })
    void call.catch(() => {})
    await entered.promise
    await expect(Promise.race([call, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("CLEANUP_EXTENDED_CALL_BUDGET")), 1000)
    })])).rejects.toThrow("LOGINOM_RUNTIME_TIMEOUT")
    expect(Date.now() - started).toBeLessThan(1000)
    expect(f.reserve.requests).toHaveLength(0)
  } finally { clearTimeout(timer); release.resolve(); await f.close() }
}, 240000)

test("failed startup cleanup remains owned after its caller deadline", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let held = false
  const unavailable = { async request(body: unknown, _request: unknown, response: { writeHead(status: number): void; end(): void }) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize") return false
    response.writeHead(503); response.end(); return true
  } }
  const f = await fixture(unavailable, unavailable, async () => {
    if (held) { entered.resolve(); await release.promise }
    return new Response()
  }, `
    const emit = process.emit.bind(process);
    process.emit = (event, ...args) => {
      if (event !== 'message' || args[0].operation !== 'close') return emit(event, ...args);
      void fetch(GATE_URL).then(() => emit(event, ...args));
      return true;
    };
    await import(${JSON.stringify(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url).href)});
  `)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await f.host.settled(); await expect(f.host.catalog(1)).rejects.toThrow()
    held = true
    const reserveRequests = f.reserve.requests.length
    const started = Date.now()
    const catalog = f.host.catalog(1, { deadline: started + 600, signal: new AbortController().signal })
    void catalog.catch(() => {})
    await entered.promise
    await expect(Promise.race([catalog, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("STARTUP_CLEANUP_EXTENDED_BUDGET")), 1000)
    })])).rejects.toThrow("LOGINOM_RUNTIME_TIMEOUT")
    expect(Date.now() - started).toBeLessThan(1000)
    expect(f.reserve.requests).toHaveLength(reserveRequests)
  } finally { clearTimeout(timer); release.resolve(); await f.close() }
}, 240000)

test("expired selection change cannot start another child after retirement", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let held = false
  const f = await fixture({}, {}, async () => {
    if (held) { entered.resolve(); await release.promise }
    return new Response()
  }, `
    const emit = process.emit.bind(process);
    process.emit = (event, ...args) => {
      if (event !== 'message' || args[0].operation !== 'close') return emit(event, ...args);
      void fetch(GATE_URL).then(() => emit(event, ...args));
      return true;
    };
    await import(${JSON.stringify(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url).href)});
  `)
  await f.host.settled(); await f.host.catalog(1); await f.host.close()
  const cloud = await createCloudAuth({ store: cloudStore(join(f.options.root, "connection"), credentials("linux")), endpoints: f.options.cloudEndpoints, changed() {} })
  let selected: "primary" | "reserve" = "primary"
  const states: string[] = []
  const session = createKnowledgeSession({ generation: 1,
    connection: (await connectionStore(join(f.options.root, "connection"), credentials("linux")).read())!,
    cloud, endpoints: f.options.cloudEndpoints, resources: f.options.resources, stateDir: join(f.options.root, "session"), environment: {},
    signal: new AbortController().signal, changed: status => states.push(status.state), selected: () => selected, selectReserve: () => { selected = "reserve" } })
  try {
    await session.ensure({ deadline: Date.now() + 3000, signal: new AbortController().signal })
    selected = "reserve"
    held = true
    const before = [...states]
    const catalog = session.catalog({ deadline: Date.now() + 600, signal: new AbortController().signal })
    void catalog.catch(() => {})
    await entered.promise
    await expect(catalog).rejects.toThrow("LOGINOM_RUNTIME_TIMEOUT")
    release.resolve()
    await session.close()
    await session.close()
    expect(states).toEqual(before)
    expect(f.reserve.requests).toHaveLength(0)
  } finally { release.resolve(); await session.close(); await cloud.close(); await f.close() }
}, 240000)

test("joining a shared Help startup respects the caller deadline", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await fixture({ async initialize() { entered.resolve(); await release.promise } })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await f.host.settled(); await entered.promise
    const started = Date.now()
    await expect(Promise.race([f.host.catalog(1, { deadline: started + 600, signal: new AbortController().signal }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error("JOIN_DEADLINE_IGNORED")), 1200) })])).rejects.toThrow("LOGINOM_RUNTIME_TIMEOUT")
    expect(Date.now() - started).toBeLessThan(1000)
    release.resolve()
    expect(await f.host.catalog(1)).toMatchObject({ tools: expect.any(Array) })
  } finally { clearTimeout(timer); release.resolve(); await f.close() }
}, 240000)

test("a CallBudget parent abort interrupts its already dispatched child read", async () => {
  const entered = Promise.withResolvers<void>()
  const cancelled = Promise.withResolvers<void>()
  const release = Promise.withResolvers<{ content: [] }>()
  const f = await fixture({ call(_params, extra) { extra.signal.addEventListener("abort", () => cancelled.resolve(), { once: true }); entered.resolve(); return release.promise } })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await f.host.settled(); await f.host.catalog(1)
    const controller = new AbortController()
    const call = f.host.callKnowledge(1, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: Date.now() + 3000, signal: controller.signal })
    void call.catch(() => {})
    await entered.promise
    controller.abort(Error("PARENT_CANCELLED"))
    await expect(Promise.race([call, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("PARENT_ABORT_IGNORED")), 600)
    })])).rejects.toThrow("PARENT_CANCELLED")
    await cancelled.promise
    expect(f.reserve.requests).toHaveLength(0)
  } finally { clearTimeout(timer); release.resolve({ content: [] }); await f.close() }
}, 240000)

test("a selected reserve outage stays reserve and the next demand restores readiness", async () => {
  let unavailable = false
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "initialize") return false
    response.writeHead(503); response.end(); return true
  } }, { async request(body, _request, response) {
    if (!unavailable || !body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") return false
    response.writeHead(503); response.end(); return true
  } })
  try {
    await f.host.settled(); await f.host.catalog(1)
    const primaryRequests = f.primary.requests.length
    unavailable = true
    await expect(f.host.callKnowledge(1, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: Date.now() + 3000, signal: new AbortController().signal })).rejects.toThrow()
    expect(await f.host.api.status()).toMatchObject({ server: "reserve", help: { state: "recoverable-error" } })
    unavailable = false
    await f.host.catalog(1)
    expect(await f.host.api.status()).toMatchObject({ server: "reserve", help: { state: "ready" } })
    expect(f.primary.requests).toHaveLength(primaryRequests)
  } finally { await f.close() }
}, 240000)

test("custom Help failures never use cloud refresh or reserve", async () => {
  let refreshes = 0
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") return false
    response.writeHead(401); response.end(); return true
  } }, {}, () => { refreshes++; return new Response(null, { status: 503 }) })
  try {
    await f.host.settled(); await f.host.catalog(1)
    const status = await f.host.api.status()
    const checked = await f.host.api.check({ revision: status.revision, mode: "custom", endpoint: f.primary.endpoint,
      apiKey: { operation: "replace", value: "p-secret" }, url: status.url, username: status.username,
      password: { operation: "preserve" }, verifyBrowser: false })
    await f.host.api.save({ revision: status.revision, validationId: checked.validationId })
    await f.host.settled()
    await expect(f.host.callKnowledge(2, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: Date.now() + 3000, signal: new AbortController().signal })).rejects.toThrow()
    expect(refreshes).toBe(0)
    expect(f.reserve.requests).toHaveLength(0)
    expect((await f.host.api.status()).server).toBe("custom")
  } finally { await f.close() }
}, 240000)

for (const [status, code] of [[200, -32603], [200, -32001], [429, -32001], [403, -32001]]) {
  test(`cloud read HTTP ${status} RPC ${code} does not fail over`, async () => {
    let refreshes = 0
    const f = await fixture({ async request(body, _request, response) {
      if (!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") return false
      response.writeHead(status!, { "content-type": "application/json" })
      response.end(JSON.stringify({ jsonrpc: "2.0", id: "id" in body ? body.id : null, error: { code, message: "failed" } })); return true
    } }, {}, () => { refreshes++; return new Response(null, { status: 503 }) })
    try {
      await f.host.settled(); await f.host.catalog(1)
      await expect(f.host.callKnowledge(1, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
        { deadline: Date.now() + 3000, signal: new AbortController().signal })).rejects.toThrow()
      expect(refreshes).toBe(0)
      expect(f.reserve.requests).toHaveLength(0)
      expect((await f.host.api.status()).server).toBe("primary")
    } finally { await f.close() }
  }, 240000)
}

test("a failed refresh leaves cloud credentials and recoverable Help for the next demand", async () => {
  let refreshes = 0
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") return false
    response.writeHead(401); response.end(); return true
  } }, {}, () => { refreshes++; return new Response(null, { status: 503 }) })
  try {
    await f.host.settled(); await f.host.catalog(1)
    await expect(f.host.callKnowledge(1, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: Date.now() + 3000, signal: new AbortController().signal })).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(await f.host.api.status()).toMatchObject({ server: "primary", cloud: { connected: true }, help: { state: "recoverable-error" } })
    expect(refreshes).toBe(1)
    expect(f.reserve.requests).toHaveLength(0)
    expect(await cloudStore(join(f.options.root, "connection"), credentials("linux")).read()).toBeDefined()
  } finally { await f.close() }
}, 240000)

test("one Help call cannot refresh again after its one reserve transition", async () => {
  let primaryReads = 0
  let reserveReads = 0
  let refreshes = 0
  const f = await fixture({ async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") return false
    response.writeHead(++primaryReads === 1 ? 401 : 503); response.end(); return true
  } }, { async request(body, _request, response) {
    if (!body || typeof body !== "object" || !("method" in body) || body.method !== "tools/call") return false
    reserveReads++; response.writeHead(401); response.end(); return true
  } }, () => { refreshes++; return Response.json({ dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } } }) })
  try {
    await f.host.settled(); await f.host.catalog(1)
    await expect(f.host.callKnowledge(1, { run: "run", id: "read", name: "read", arguments: { uris: ["viking://resources/loginom-dock/help"] } },
      { deadline: Date.now() + 12_000, signal: new AbortController().signal })).rejects.toThrow()
    expect(refreshes).toBe(1)
    expect(primaryReads).toBe(2)
    expect(reserveReads).toBe(1)
  } finally { await f.close() }
}, 240000)
