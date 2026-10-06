import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { EventEmitter } from "node:events"
import { superviseKnowledge } from "../src/supervisor"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"

test("knowledge supervision sends only its own private payload and filters provider credentials", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "knowledge supervision Проба "))
  const entry = join(directory, "private knowledge.mjs")
  try {
    await writeFile(
      entry,
      `process.on('message', message => {
      if (message.operation === 'start') {
        const valid = Object.keys(message.input).sort().join(',') === 'apiKey,endpoint,generation,protocol'
          && message.input.apiKey === 'PRIVATE-NONSECRET-KEY'
          && !process.argv.join(' ').includes('PRIVATE-NONSECRET')
          && !Object.values(process.env).some(value => value.includes('PRIVATE-NONSECRET'))
          && !process.env.OPENAI_API_KEY && !process.env.PATH;
        process.send({id:message.id,result:{protocol:1,generation:valid?message.input.generation:-1,
          started:message.input.endpoint !== 'https://example.test/no-start'}});
      }
      if (message.operation === 'list') process.send({id:message.id,result:{tools:[]}});
      if (message.operation === 'close') process.send({id:message.id,result:{closed:true}},()=>process.disconnect());
    });`,
    )
    // A structurally compatible object may have browser fields: the supervisor must pick its payload explicitly.
    const input = {
      node,
      entry,
      stateDir: join(directory, "private state"),
      generation: 17,
      endpoint: "https://example.test/mcp",
      apiKey: "PRIVATE-NONSECRET-KEY",
      connection: { password: "PRIVATE-NONSECRET-PASSWORD" },
      resources: directory,
      environment: { OPENAI_API_KEY: "PRIVATE-NONSECRET-PROVIDER", PATH: "/foreign/global" },
    }
    const runtime = await superviseKnowledge(input)
    try {
      expect(runtime.ready).toEqual({ protocol: 1, generation: 17, started: true })
      expect(await runtime.request("list")).toEqual({ tools: [] })
    } finally {
      await runtime.close()
    }
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    await runtime.close()
    await expect(runtime.request("list")).rejects.toThrow("LOGINOM_RUNTIME_DISCONNECTED")
    await expect(superviseKnowledge({ ...input, apiKey: "wrong-key" })).rejects.toThrow("LOGINOM_HANDSHAKE_INVALID")
    await expect(superviseKnowledge({ ...input, endpoint: "https://example.test/no-start" })).rejects.toThrow(
      "LOGINOM_HANDSHAKE_INVALID",
    )
    for (const field of ["node", "entry", "stateDir"])
      await expect(superviseKnowledge({ ...input, [field]: "relative" })).rejects.toThrow(
        "LOGINOM_ABSOLUTE_PATH_REQUIRED",
      )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("restored Host starts only knowledge and local settled does not wait for the remote catalog", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "host-knowledge-startup-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const held = new Map(
    ["A", "B"].map((run) => [run, Promise.withResolvers<{ content: { type: "text"; text: string }[] }>()]),
  )
  const both = Promise.withResolvers<void>()
  const count = { held: 0 }
  const server = await knowledgeServer(
    { after: (callback) => cleanup.push(callback) },
    {
      list: async () => {
        entered.resolve()
        await release.promise
        return { tools: server.tools }
      },
      call: async (params) => {
        const gate = typeof params.arguments?.uri === "string" ? held.get(params.arguments.uri) : undefined
        if (gate) {
          if (++count.held === 2) both.resolve()
          return gate.promise
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(params) }] }
      },
    },
  )
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const marker = join(directory, "forbidden-browser")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  await symlink(
    fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
    join(resources, "runtime/src/knowledge-entry.mjs"),
  )
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser startup is forbidden');`,
  )
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: server.endpoint }))
  const store = connectionStore(join(root, "connection"), credentials("linux"))
  await store.stage({
    generation: 1,
    revision: 1,
    apiKey: "UNIT-NONSECRET",
    password: "PRIVATE-NONSECRET-PASSWORD",
    username: "user",
    url: "http://unavailable.example/app/?custom=1",
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
    expect(await host.api.status()).toMatchObject({ state: "starting", generation: 1 })
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
    await entered.promise
    expect(await client.request("acquire", { run: "before-ready", session: "local-chat" })).toEqual({ generation: 1 })
    expect(await client.request("tools", { run: "before-ready" })).toMatchObject({
      tools: [expect.objectContaining({ name: "dock_prepare" }), expect.objectContaining({ name: "dock_diagnostics" })],
    })
    expect(
      await client.request("call", {
        run: "before-ready",
        name: "dock_diagnostics",
        args: {},
        userMessage: "original",
      }),
    ).toMatchObject({ structuredContent: { state: "starting", generation: 1, hasApiKey: true } })
    await expect(
      client.request("call", {
        run: "before-ready",
        name: "read",
        args: { uri: "Help/node.md" },
        userMessage: "original",
      }),
    ).rejects.toThrow("LOGINOM_CONNECTION_NOT_READY")
    await client.request("release", { run: "before-ready" })
    release.resolve()
    await host.catalog(1)
    expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
    const catalog = await client.request("tools", { run: "one" })
    expect(catalog).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "read",
          inputSchema: server.tools.find((tool) => tool.name === "read")?.inputSchema,
        }),
        expect.objectContaining({ name: "dock_prepare" }),
        expect.objectContaining({ name: "dock_diagnostics" }),
      ]),
    })
    expect(
      await client.request("call", {
        run: "one",
        name: "read",
        args: { uri: "Help/node.md" },
        userMessage: "original",
      }),
    ).toEqual({
      content: [{ type: "text", text: JSON.stringify({ name: "read", arguments: { uri: "Help/node.md" } }) }],
    })
    expect(
      await client.request("call", { run: "one", name: "dock_diagnostics", args: {}, userMessage: "original" }),
    ).toMatchObject({ structuredContent: { state: "ready", generation: 1, hasApiKey: true } })
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(host.journal.pending()).toEqual([])
    expect(await readdir(join(root, "recovery"))).toEqual([])
    expect(await client.request("acquire", { run: "other", session: "other-chat" })).toEqual({ generation: 1 })
    const first = client.request("call", { run: "one", name: "read", args: { uri: "A" }, userMessage: "original" })
    const other = client.request("call", {
      run: "other",
      name: "read",
      args: { uri: "B" },
      userMessage: "other-original",
    })
    ;[first, other].forEach((call) => call.catch(() => {}))
    await both.promise
    expect(await client.request("interrupt", { run: "one", all: true })).toBe(true)
    await expect(first).rejects.toThrow("LOGINOM_KNOWLEDGE_INTERRUPTED")
    held.get("B")?.resolve({ content: [{ type: "text", text: "other chat survived" }] })
    expect(await other).toEqual({ content: [{ type: "text", text: "other chat survived" }] })
    expect(host.journal.pending()).toEqual([])
    expect(await readdir(join(root, "recovery"))).toEqual([])
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
    await client.request("release", { run: "other" })
    await client.request("release", { run: "one" })
  } finally {
    release.resolve()
    for (const gate of held.values()) gate.resolve({ content: [] })
    client.close()
    await port.close()
    await host.close()
    for (const callback of cleanup) await callback()
    await rm(directory, { recursive: true, force: true })
  }
})

test("supervised real knowledge entry acknowledges before the server catalog is ready", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "knowledge actual-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const server = await knowledgeServer(
    { after: (callback) => cleanup.push(callback) },
    {
      initialize: async () => {
        entered.resolve()
        await release.promise
      },
    },
  )
  try {
    const runtime = await superviseKnowledge({
      node,
      entry: fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      stateDir: directory,
      generation: 20,
      endpoint: server.endpoint,
      apiKey: "UNIT-NONSECRET",
      environment: {},
    })
    try {
      expect(runtime.ready).toEqual({ protocol: 1, generation: 20, started: true })
      await entered.promise
      release.resolve()
      expect(await runtime.request("list")).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "read",
            inputSchema: {
              type: "object",
              properties: { uri: { type: "string" } },
              required: ["uri"],
              additionalProperties: false,
            },
          }),
        ]),
      })
      expect(
        await runtime.request("call", { run: "run", id: "request", name: "read", arguments: { uri: "Help/node.md" } }),
      ).toEqual({
        content: [{ type: "text", text: JSON.stringify({ name: "read", arguments: { uri: "Help/node.md" } }) }],
      })
    } finally {
      release.resolve()
      await runtime.close()
    }
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    expect(server.calls).toHaveLength(1)
    expect(server.requests.every((request) => request.authorization === "Bearer UNIT-NONSECRET")).toBe(true)
  } finally {
    release.resolve()
    for (const callback of cleanup) await callback()
    await rm(directory, { recursive: true, force: true })
  }
})
