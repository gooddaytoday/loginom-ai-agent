import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { EventEmitter } from "node:events"
import { superviseKnowledge } from "../src/supervisor"
import { writeHelp } from "../../loginom-runtime/client/test/support/help-fixture.mjs"
import { stageHeldKnowledge } from "./fixtures/knowledge"
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
  const helpRoot = join(directory, "Справка help")
  try {
    await writeFile(
      entry,
      `process.on('message', message => {
      if (message.operation === 'start') {
        const valid = Object.keys(message.input).sort().join(',') === 'generation,helpRoot,protocol'
          && message.input.helpRoot === ${JSON.stringify(helpRoot)}
          && !process.argv.join(' ').includes('PRIVATE-NONSECRET')
          && !Object.values(process.env).some(value => value.includes('PRIVATE-NONSECRET'))
          && !process.env.OPENAI_API_KEY && !process.env.PATH;
        process.send({id:message.id,result:{protocol:1,generation:valid?message.input.generation:-1,
          started:!message.input.helpRoot.endsWith('no-start')}});
      }
      if (message.operation === 'list') process.send({id:message.id,result:{tools:[]}});
      if (message.operation === 'malformed-diagnostic') process.send({id:message.id,error:'LOGINOM_KNOWLEDGE_UNAVAILABLE',
        startupFailure:{stage:['catalog'],error_class:'Error',code:null,cause_codes:[],aborted:false,timeout:false,
          elapsed_ms:1,body:'PRIVATE-NONSECRET-DIAGNOSTIC'}});
      if (message.operation === 'close') process.send({id:message.id,result:{closed:true}},()=>process.disconnect());
    });`,
    )
    // A structurally compatible object may have browser fields: the supervisor must pick its payload explicitly.
    const input = {
      node,
      entry,
      stateDir: join(directory, "private state"),
      generation: 17,
      helpRoot,
      connection: { apiKey: "PRIVATE-NONSECRET-KEY", password: "PRIVATE-NONSECRET-PASSWORD" },
      resources: directory,
      environment: { OPENAI_API_KEY: "PRIVATE-NONSECRET-PROVIDER", PATH: "/foreign/global" },
    }
    const runtime = await superviseKnowledge(input)
    try {
      expect(runtime.ready).toEqual({ protocol: 1, generation: 17, started: true })
      expect(await runtime.request("list")).toEqual({ tools: [] })
      await expect(runtime.request("malformed-diagnostic")).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
    } finally {
      await runtime.close()
    }
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    const receipt = await Bun.file(join(input.stateDir,
      (await readdir(input.stateDir)).find(name => name.startsWith("runtime-close-"))!)).text()
    expect(receipt).not.toContain("startup_failure")
    expect(receipt).not.toContain("PRIVATE-NONSECRET-DIAGNOSTIC")
    await runtime.close()
    await expect(runtime.request("list")).rejects.toThrow("LOGINOM_RUNTIME_DISCONNECTED")
    await expect(superviseKnowledge({ ...input, helpRoot: join(directory, "other help") })).rejects.toThrow(
      "LOGINOM_HANDSHAKE_INVALID",
    )
    await expect(superviseKnowledge({ ...input, helpRoot: join(directory, "no-start") })).rejects.toThrow(
      "LOGINOM_HANDSHAKE_INVALID",
    )
    for (const field of ["node", "entry", "stateDir", "helpRoot"])
      await expect(superviseKnowledge({ ...input, [field]: "relative" })).rejects.toThrow(
        "LOGINOM_ABSOLUTE_PATH_REQUIRED",
      )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("restored Host starts only knowledge and local settled does not wait for the Help catalog", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "host-knowledge-startup-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const marker = join(directory, "forbidden-browser")
  await mkdir(join(resources, "bin"), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  const catalog = await stageHeldKnowledge(
    join(resources, "runtime/src/knowledge-entry.mjs"),
    join(directory, "catalog-gate"),
  )
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser startup is forbidden');`,
  )
  const store = connectionStore(join(root, "connection"), credentials("linux"))
  await store.stage({
    generation: 1,
    revision: 1,
    // A connection saved by an older build keeps its own key; shipped Help never uses it.
    apiKey: "LEGACY-NONSECRET",
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
    await catalog.entered()
    expect(await client.request("acquire", { run: "before-ready", session: "local-chat" })).toEqual({ generation: 1 })
    expect(await client.request("tools", { run: "before-ready" })).toMatchObject({
      tools: [expect.objectContaining({ name: "dock_diagnostics" })],
    })
    expect(
      await client.request("call", {
        run: "before-ready",
        name: "dock_diagnostics",
        args: {},
        userMessage: "original",
      }),
    ).toMatchObject({ structuredContent: { state: "starting", generation: 1 } })
    await expect(
      client.request("call", {
        run: "before-ready",
        name: "read",
        args: { uri: "Help/node.md" },
        userMessage: "original",
      }),
    ).rejects.toThrow("LOGINOM_CONNECTION_NOT_READY")
    await client.request("release", { run: "before-ready" })
    await catalog.release()
    await host.catalog(1)
    expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
    expect(await client.request("tools", { run: "one" })).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "read",
          inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] },
        }),
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
    ).toMatchObject({ structuredContent: { state: "ready", generation: 1 } })
    // Help calls finish synchronously; interruption still reaches the knowledge child without failing.
    expect(await client.request("interrupt", { run: "one", all: true })).toBe(true)
    expect(await catalog.lists()).toBe(1)
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(host.journal.pending()).toEqual([])
    expect(await readdir(join(root, "recovery"))).toEqual([])
    await client.request("release", { run: "one" })
  } finally {
    await catalog.release()
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("supervised real knowledge entry acknowledges start and serves shipped Help", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "knowledge actual-"))
  try {
    const runtime = await superviseKnowledge({
      node,
      entry: fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      stateDir: directory,
      generation: 20,
      helpRoot: await writeHelp(join(directory, "help")),
      environment: {},
    })
    try {
      expect(runtime.ready).toEqual({ protocol: 1, generation: 20, started: true })
      expect(await runtime.request("list")).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "read", inputSchema: expect.objectContaining({ required: ["uris"] }) }),
        ]),
        catalogSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(
        await runtime.request("call", {
          run: "run",
          id: "request",
          name: "read",
          arguments: { uris: "data/processors/integration/rest-request.md" },
        }),
      ).toMatchObject({ content: [{ type: "text", text: expect.stringContaining("# REST-запрос") }] })
      await expect(
        runtime.request("call", { run: "run", id: "write", name: "write", arguments: { uri: "README.md" } }),
      ).rejects.toThrow("LOGINOM_KNOWLEDGE_TOOL_DENIED")
    } finally {
      await runtime.close()
    }
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    expect(await readdir(directory)).not.toContain("startup-failures.jsonl")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
