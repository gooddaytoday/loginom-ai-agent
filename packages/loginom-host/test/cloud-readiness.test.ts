import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { connectionStore } from "../src/connection/connection-store"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { EventEmitter } from "node:events"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { cloudStore } from "../src/connection/cloud-store"
import { credentials } from "../src/connection/credentials"

test("cloud settings save before login without starting Help", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cloud-readiness-"))
  const resources = join(directory, "resources")
  const marker = join(directory, "forbidden-help")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(resources, "bin/node"))
  await writeFile(join(resources, "resource-manifest.json"), "{}")
  await writeFile(
    join(resources, "runtime/src/knowledge-entry.mjs"),
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('forbidden');`,
  )
  const host = await createLoginomHost({
    root: join(directory, "profile"),
    resources,
    codec: credentials("linux"),
    environment: {},
  })
  try {
    const checked = await host.api.check({
      revision: 0,
      mode: "cloud",
      url: "http://stand.test/app/",
      username: "user",
      password: { operation: "empty" },
      verifyBrowser: false,
    })
    expect(checked.help).toEqual({ state: "connection-required" })
    expect(checked.browser).toEqual({ state: "unknown" })
    await host.api.save({ revision: 0, validationId: checked.validationId })
    await host.settled()
    expect(await host.api.status()).toMatchObject({ state: "connection-required", generation: 1 })
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
  } finally {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 180000)

async function networkFixture(
  options: Parameters<typeof knowledgeServer>[1] = {},
  connected = false,
  entry?: string,
  mode: "cloud" | "custom" = "cloud",
  legacy = false,
) {
  const directory = await mkdtemp(join(tmpdir(), "cloud-login-readiness-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const server = await knowledgeServer(
    { after: (callback) => cleanup.push(callback) },
    { apiKey: "p-secret", ...options },
  )
  const gate = Promise.withResolvers<void>()
  const token = Promise.withResolvers<void>()
  const site = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      const path = new URL(request.url).pathname
      if (path === "/api/auth/device/code")
        return Response.json({
          device_code: "device-secret",
          user_code: "ABCD-EFGH",
          verification_uri_complete: `${site.url.origin}/device?user_code=ABCD-EFGH`,
          expires_in: 600,
          interval: 0.01,
        })
      if (path === "/api/auth/device/token") {
        token.resolve()
        await gate.promise
        return Response.json({ access_token: "bootstrap-secret", token_type: "Bearer", expires_in: 600 })
      }
      if (path === "/api/agent/connections")
        return Response.json({
          installationKey: "site-secret",
          user: { email: "a@example.test" },
          dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } },
        })
      return new Response(null, { status: 404 })
    },
  })
  // These readiness cases recover primary; reserve is independently unavailable.
  const reserve = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status: 503 }) })
  let collected = 0
  const collector = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { collected++; return new Response(null, { status: 500 }) } })
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(resources, "bin/node"))
  if (entry) await writeFile(join(resources, "runtime/src/knowledge-entry.mjs"), entry)
  if (!entry)
    await symlink(
      fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      join(resources, "runtime/src/knowledge-entry.mjs"),
    )
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: collector.url.href }))
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,checked:true,ready:true}});
      if (m.operation === 'pid') process.send({id:m.id,result:process.pid});
      if (m.operation === 'interrupt') process.send({id:m.id,result:true});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });
  `,
  )
  const store = connectionStore(join(root, "connection"), credentials("linux"))
  const saved = {
    mode,
    ...(mode === "custom" ? { endpoint: server.endpoint } : {}),
    generation: 1,
    revision: 1,
    url: "http://stand.test/app/",
    username: "user",
    apiKey: mode === "custom" ? "p-secret" : "",
    password: "",
  }
  await store.stage(saved)
  await store.activate(1)
  if (legacy) {
    const file = Bun.file(join(root, "connection/connection.json"))
    const record = await file.json()
    delete record.mode
    await writeFile(file.name!, JSON.stringify(record))
  }
  if (connected)
    await cloudStore(join(root, "connection"), credentials("linux")).write({
      kind: "loginom-cloud-v1",
      installationKey: "site-secret",
      email: "a@example.test",
      dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } },
    })
  const host = await createLoginomHost({
    root,
    resources,
    codec: credentials("linux"),
    environment: { LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT: collector.url.href },
    cloudEndpoints: { site: site.url.origin, primary: server.endpoint, reserve: reserve.url.origin },
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
  return {
    host,
    root,
    store,
    saved,
    server,
    gate,
    token,
    client,
    async close() {
      expect(collected).toBe(0)
      collector.stop(true)
      gate.resolve()
      client.close()
      await port.close()
      try {
        await host.close()
      } finally {
        site.stop(true)
        reserve.stop(true)
        for (const callback of cleanup) await callback()
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}

test.each([false, true])(
  "cloud login readies the saved generation without changing the connection (legacy: %s)",
  async (legacy) => {
    const f = await networkFixture({}, false, undefined, "cloud", legacy)
    const record = await Bun.file(join(f.root, "connection/connection.json")).text()
    try {
      await f.host.settled()
      const before = await f.host.api.status()
      expect(before).toMatchObject({ state: "connection-required" })
      await f.host.api.cloudStart()
      await f.token.promise
      expect(await f.host.api.status()).toMatchObject({ cloud: { pending: { userCode: "ABCD-EFGH" } } })
      f.gate.resolve()
      while (!(await f.host.api.status()).cloud.connected) await new Promise((resolve) => setTimeout(resolve, 10))
      await f.host.catalog(before.generation)
      expect(await f.host.api.status()).toMatchObject({
        generation: before.generation,
        revision: before.revision,
        state: "ready",
        help: { state: "ready" },
      })
      expect(await f.store.read()).toEqual(f.saved)
      expect(await Bun.file(join(f.root, "connection/connection.json")).text()).toBe(record)
    } finally {
      await f.close()
    }
  },
  180000,
)

test("tools retries an unavailable initial catalog in the same generation", async () => {
  let available = false
  const f = await networkFixture(
    {
      request: async (body, request, response) => {
        if (available) return false
        response.writeHead(503)
        response.end()
        return true
      },
    },
    true,
  )
  try {
    await f.host.settled()
    await expect(f.host.catalog(1)).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
    expect(await f.host.api.status()).toMatchObject({ generation: 1, state: "recoverable-error" })
    await f.client.request("acquire", { run: "one", session: "chat" })
    expect(await f.client.request("tools", { run: "one" })).toMatchObject({
      tools: [expect.objectContaining({ name: "dock_diagnostics" })],
    })
    available = true
    expect(await f.client.request("tools", { run: "one" })).toMatchObject({
      tools: expect.arrayContaining([expect.objectContaining({ name: "read" })]),
    })
    expect(await f.host.api.status()).toMatchObject({ generation: 1, revision: 1, state: "ready" })
    expect(await f.store.read()).toEqual(f.saved)
  } finally {
    await f.close()
  }
}, 180000)

test("Help call retries before acquiring a ready connection lease", async () => {
  let available = false
  const f = await networkFixture(
    {
      request: async (_body, _request, response) => {
        if (available) return false
        response.writeHead(503)
        response.end()
        return true
      },
    },
    true,
  )
  try {
    await f.host.settled()
    await expect(f.host.catalog(1)).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
    await f.client.request("acquire", { run: "one", session: "chat" })
    available = true
    expect(
      await f.client.request("call", {
        run: "one",
        name: "read",
        args: { uris: ["viking://resources/loginom-dock/Help/node.md"] },
        userMessage: "original",
      }),
    ).toMatchObject({ content: [{ type: "text", text: expect.stringContaining("Help/node.md") }] })
    expect(await f.host.api.status()).toMatchObject({ generation: 1, state: "ready" })
  } finally {
    await f.close()
  }
}, 180000)

test("concurrent catalog recovery shares one child and clears only Help failure", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let lists = 0
  const f = await networkFixture(
    {
      async list(): Promise<{ tools: Awaited<ReturnType<typeof knowledgeServer>>["tools"] }> {
        if (++lists === 1) return { tools: [] }
        entered.resolve()
        await release.promise
        return { tools: f.server.tools }
      },
    },
    true,
  )
  try {
    await f.host.settled()
    await expect(f.host.catalog(1)).rejects.toThrow("LOGINOM_KNOWLEDGE_CATALOG_INVALID")
    f.host.browserStatus(1, { state: "failed", failure: "LOGINOM_ACCOUNT_MISMATCH" })
    const first = f.host.catalog(1)
    const second = f.host.catalog(1)
    await entered.promise
    expect(lists).toBe(2)
    release.resolve()
    expect(await first).toEqual(await second)
    expect(await f.host.api.status()).toMatchObject({
      generation: 1,
      state: "ready",
      browser: { state: "failed", failure: "LOGINOM_ACCOUNT_MISMATCH" },
    })
    expect((await f.host.api.status()).failure).toBeUndefined()
  } finally {
    release.resolve()
    await f.close()
  }
}, 180000)

test.each([false, true])(
  "close waits for a Help child still awaiting its start acknowledgement (disconnect: %s)",
  async (disconnect) => {
    const f = await networkFixture(
      {},
      true,
      `
    import {writeFileSync} from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') writeFileSync('start.pid', String(process.pid));
      if (m.operation === 'close') setTimeout(() => process.send({id:m.id,result:{closed:true}}, () => process.disconnect()), 50);
    });
  `,
    )
    let settled = false
    const loading = f.host.catalog(1).finally(() => {
      settled = true
    })
    void loading.catch(() => {})
    try {
      while (!(await Bun.file(join(f.root, "knowledge/1/start.pid")).exists()))
        await new Promise((resolve) => setTimeout(resolve, 5))
      const pid = await Bun.file(join(f.root, "knowledge/1/start.pid")).text()
      if (disconnect) await f.host.api.cloudDisconnect()
      f.host.beginClose()
      await f.host.close()
      expect(settled).toBe(true)
      await expect(access(`/proc/${pid}`)).rejects.toMatchObject({ code: "ENOENT" })
      await expect(f.host.catalog(1)).rejects.toThrow()
      await expect(loading).rejects.toThrow()
    } finally {
      await f.close()
    }
  },
  180000,
)

test("cloud login leaves an in-flight custom catalog and selected mode unchanged", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await networkFixture(
    {
      async list(): Promise<{ tools: Awaited<ReturnType<typeof knowledgeServer>>["tools"] }> {
        entered.resolve()
        await release.promise
        return { tools: f.server.tools }
      },
    },
    false,
    undefined,
    "custom",
  )
  const loading = f.host.catalog(1)
  void loading.catch(() => {})
  try {
    await entered.promise
    await f.host.api.cloudStart()
    await f.token.promise
    f.gate.resolve()
    while (!(await f.host.api.status()).cloud.connected) await new Promise((resolve) => setTimeout(resolve, 10))
    release.resolve()
    expect(await loading).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: "read" })]) })
    expect(await f.host.api.status()).toMatchObject({
      generation: 1,
      revision: 1,
      mode: "custom",
      server: "custom",
      state: "ready",
      hasApiKey: true,
    })
    expect(await f.store.read()).toEqual(f.saved)
  } finally {
    release.resolve()
    await f.close()
  }
}, 180000)

test("connected cloud validation checks Help with browser verification disabled", async () => {
  const f = await networkFixture({}, true)
  try {
    await f.host.settled()
    await f.host.catalog(1)
    const checked = await f.host.api.check({
      revision: 1,
      mode: "cloud",
      url: f.saved.url,
      username: f.saved.username,
      password: { operation: "preserve" },
      verifyBrowser: false,
    })
    expect(checked).toMatchObject({
      help: { state: "ready" },
      browser: { state: "unknown" },
      validationId: expect.any(String),
    })
    expect(f.server.requests.length).toBeGreaterThan(0)
  } finally {
    await f.close()
  }
}, 180000)

test("cloud check without credentials verifies the browser without contacting Help", async () => {
  const f = await networkFixture()
  try {
    await f.host.settled()
    const checked = await f.host.api.check({
      revision: 1,
      mode: "cloud",
      url: f.saved.url,
      username: f.saved.username,
      password: { operation: "preserve" },
    })
    expect(checked).toMatchObject({
      help: { state: "connection-required" },
      browser: { state: "verified" },
      validationId: expect.any(String),
    })
    expect(f.server.requests).toHaveLength(0)
    await f.client.request("acquire", { run: "local", session: "chat" })
    expect(await f.client.request("tools", { run: "local" })).toMatchObject({
      tools: [expect.objectContaining({ name: "dock_diagnostics" })],
    })
    await f.host.api.cloudStart()
    await f.host.api.cloudCancel()
    expect(await f.host.api.status()).toMatchObject({
      generation: 1,
      revision: 1,
      cloud: { connected: false },
      help: { state: "connection-required" },
    })
    expect((await f.host.api.status()).cloud.pending).toBeUndefined()
    expect(f.server.requests).toHaveLength(0)
  } finally {
    await f.close()
  }
}, 180000)

test("Help replacement preserves the browser process and active generation lease", async () => {
  const f = await networkFixture({}, true)
  try {
    await f.host.settled()
    await f.host.catalog(1)
    const lease = f.host.acquire("retained")!
    expect(lease.generation).toBe(1)
    const runtime = await f.host.runtime(1, "retained-browser")
    const pid = await runtime.request("pid")
    await f.host.api.cloudDisconnect()
    while ((await f.host.api.status()).help.state !== "connection-required")
      await new Promise((resolve) => setTimeout(resolve, 5))
    expect(f.host.acquire("retained")).toBeUndefined()
    expect(await (await f.host.runtime(1, "retained-browser")).request("pid")).toBe(pid)
    await expect(f.host.catalog(1)).rejects.toThrow("LOGINOM_CONNECTION_REQUIRED")
    await f.host.api.cloudStart()
    f.gate.resolve()
    while (!(await f.host.api.status()).cloud.connected) await new Promise((resolve) => setTimeout(resolve, 10))
    await f.host.catalog(1)
    expect(await f.host.api.status()).toMatchObject({
      generation: 1,
      revision: 1,
      state: "ready",
      browser: { state: "verified" },
    })
    expect(f.host.acquire("retained")).toBeUndefined()
    expect(await (await f.host.runtime(1, "retained-browser")).request("pid")).toBe(pid)
    lease.release()
  } finally {
    await f.close()
  }
}, 180000)

test("a late old catalog cannot publish readiness after cloud credentials change", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let lists = 0
  const f = await networkFixture(
    {
      async list(): Promise<{ tools: Awaited<ReturnType<typeof knowledgeServer>>["tools"] }> {
        if (++lists === 1) {
          entered.resolve()
          await release.promise
          return { tools: [] }
        }
        return { tools: f.server.tools }
      },
    },
    true,
  )
  const old = f.host.catalog(1)
  void old.catch(() => {})
  try {
    await entered.promise
    await f.host.api.cloudDisconnect()
    await expect(old).rejects.toThrow()
    await f.host.api.cloudStart()
    f.gate.resolve()
    while (!(await f.host.api.status()).cloud.connected) await new Promise((resolve) => setTimeout(resolve, 10))
    await f.host.catalog(1)
    release.resolve()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(await f.host.api.status()).toMatchObject({
      generation: 1,
      revision: 1,
      state: "ready",
      help: { state: "ready" },
    })
    expect((await f.host.api.status()).failure).toBeUndefined()
    expect(lists).toBe(2)
  } finally {
    release.resolve()
    await f.close()
  }
}, 180000)

test("tools without cloud credentials stays local while the previous Help child is retiring", async () => {
  const f = await networkFixture(
    {},
    true,
    `
    import {existsSync} from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,started:true}});
      if (m.operation === 'list') process.send({id:m.id,result:{tools:['find','search','read','grep','glob','list','tree'].map(name=>({name,inputSchema:{type:'object'}}))}});
      if (m.operation === 'close') {
        const gate = setInterval(() => {
          if (!existsSync('release-close')) return;
          clearInterval(gate);
          process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
        }, 10);
      }
    });
  `,
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  let tools: Promise<unknown> | undefined
  try {
    await f.host.settled()
    await f.host.catalog(1)
    await f.client.request("acquire", { run: "one", session: "chat" })
    expect((await f.host.api.cloudDisconnect()).cloud.connected).toBe(false)
    tools = f.client.request("tools", { run: "one" })
    void tools.catch(() => {})
    expect(
      await Promise.race([
        tools,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("LOCAL_TOOLS_WAITED_FOR_RETIRED_HELP")), 1000)
        }),
      ]),
    ).toMatchObject({ tools: [expect.objectContaining({ name: "dock_diagnostics" })] })
  } finally {
    clearTimeout(timer)
    await writeFile(join(f.root, "knowledge/1/release-close"), "release")
    await tools?.catch(() => {})
    await f.close()
  }
}, 180000)

test("a failed local start ACK after validation preserves the working generation and browser", async () => {
  const f = await networkFixture(
    {},
    false,
    `
    import {existsSync} from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,started:!existsSync('reject-start')}});
      if (m.operation === 'list') process.send({id:m.id,result:{tools:['find','search','read','grep','glob','list','tree'].map(name=>({name,inputSchema:{type:'object'}}))}});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });
  `,
    "custom",
  )
  try {
    await f.host.settled()
    await f.host.catalog(1)
    const browser = await f.host.runtime(1, "working")
    const pid = await browser.request("pid")
    const stored = await Bun.file(join(f.root, "connection/connection.json")).text()
    const checked = await f.host.api.check({
      revision: 1,
      mode: "custom",
      url: "http://next.test/app/",
      username: "next",
      password: { operation: "preserve" },
      verifyBrowser: false,
    })
    expect(checked.help).toEqual({ state: "ready" })
    await writeFile(join(f.root, "knowledge/2/reject-start"), "reject")
    await f.host.api.save({ revision: 1, validationId: checked.validationId })
    await f.host.settled()
    expect(await f.host.api.status()).toMatchObject({
      generation: 1,
      state: "ready",
      url: f.saved.url,
      username: f.saved.username,
      browser: { state: "verified" },
    })
    expect(await f.store.read()).toEqual(f.saved)
    expect(await Bun.file(join(f.root, "connection/connection.json")).text()).toBe(stored)
    expect(await (await f.host.runtime(1, "working")).request("pid")).toBe(pid)
    expect(await f.host.catalog(1)).toMatchObject({ tools: expect.any(Array) })
    await expect(f.host.catalog(2)).rejects.toThrow("LOGINOM_GENERATION_UNAVAILABLE")
  } finally {
    await f.close()
  }
}, 180000)

test("logout settles pre-ACK admission after completed but unconfirmed cleanup", async () => {
  const f = await networkFixture(
    {},
    true,
    `
    import {writeFileSync} from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') writeFileSync('pending-start.pid', String(process.pid));
      if (m.operation === 'close') process.send({id:m.id,result:{closed:false}},()=>process.disconnect());
    });
  `,
  )
  const settled = f.host.settled()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    while (!(await Bun.file(join(f.root, "knowledge/1/pending-start.pid")).exists()))
      await new Promise((resolve) => setTimeout(resolve, 5))
    const pid = await Bun.file(join(f.root, "knowledge/1/pending-start.pid")).text()
    await f.host.api.cloudDisconnect()
    const deadline = Date.now() + 5000
    const receipt = async (): Promise<string> => {
      const name = (await readdir(join(f.root, "knowledge/1"))).find((name) => name.startsWith("runtime-close-"))
      if (name) return name
      if (Date.now() >= deadline) throw Error("NO_TERMINAL_CLEANUP_EVIDENCE")
      await new Promise((resolve) => setTimeout(resolve, 5))
      return receipt()
    }
    expect(await Bun.file(join(f.root, "knowledge/1", await receipt())).json()).toMatchObject({
      closed_ack: false,
      exit_code: 0,
      exit_signal: null,
    })
    await expect(access(`/proc/${pid}`)).rejects.toMatchObject({ code: "ENOENT" })
    await Promise.race([
      settled,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("TERMINAL_ADMISSION_PENDING")), 1000)
      }),
    ])
    expect(await f.host.api.status()).toMatchObject({
      generation: 1,
      state: "recoverable-error",
      help: { state: "recoverable-error" },
    })
    const checked = await f.host.api.check({
      revision: 1,
      mode: "cloud",
      url: f.saved.url,
      username: f.saved.username,
      password: { operation: "preserve" },
      verifyBrowser: false,
    })
    expect(checked.help).toEqual({ state: "connection-required" })
    await expect(f.host.catalog(1)).rejects.toThrow("LOGINOM_GENERATION_UNAVAILABLE")
    await expect(f.host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
  } finally {
    clearTimeout(timer)
    await f.close().catch((error: Error) => {
      if (error.message !== "LOGINOM_RUNTIME_CLEANUP_FAILED") throw error
    })
  }
}, 180000)

test("unavailable custom Help preserves local automation tools without claiming readiness or starting a browser", async () => {
  const f = await networkFixture(
    {
      request: async (_body, _request, response) => {
        response.writeHead(503)
        response.end()
        return true
      },
    },
    false,
    undefined,
    "custom",
  )
  try {
    await f.host.settled()
    await expect(f.host.catalog(1)).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
    await f.client.request("acquire", { run: "one", session: "chat" })
    await f.client.request("scope", {
      run: "one",
      mode: "bind",
      scope: { taskMessageID: "msg_original", profile: "loginom-automation" },
    })
    expect(await f.client.request("tools", { run: "one" })).toMatchObject({
      tools: [{ name: "dock_prepare" }, { name: "dock_diagnostics" }],
    })
    expect(await f.host.api.status()).toMatchObject({
      mode: "custom",
      generation: 1,
      state: "recoverable-error",
      help: { state: "recoverable-error" },
    })
    expect(
      await f.client.request("call", { run: "one", name: "dock_diagnostics", args: {}, userMessage: "msg_original" }),
    ).toMatchObject({ structuredContent: { state: "recoverable-error" } })
    await expect(
      f.client.request("call", { run: "one", name: "dock_prepare", args: {}, userMessage: "msg_original" }),
    ).rejects.toThrow("LOGINOM_CONNECTION_NOT_READY")
    expect(await readdir(f.root)).not.toContain("runtime")
    expect(f.host.journal.pending()).toEqual([])
  } finally {
    await f.close()
  }
}, 30_000)
