import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { superviseKnowledge } from "../src/supervisor"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

test("knowledge supervision sends only its own private payload and filters provider credentials", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "knowledge supervision Проба "))
  const entry = join(directory, "private knowledge.mjs")
  try {
    await writeFile(entry, `process.on('message', message => {
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
    });`)
    // A structurally compatible object may have browser fields: the supervisor must pick its payload explicitly.
    const input = {
      node, entry, stateDir: join(directory, "private state"), generation: 17,
      endpoint: "https://example.test/mcp", apiKey: "PRIVATE-NONSECRET-KEY",
      connection: { password: "PRIVATE-NONSECRET-PASSWORD" }, resources: directory,
      environment: { OPENAI_API_KEY: "PRIVATE-NONSECRET-PROVIDER", PATH: "/foreign/global" },
    }
    const runtime = await superviseKnowledge(input)
    try {
      expect(runtime.ready).toEqual({ protocol: 1, generation: 17, started: true })
      expect(await runtime.request("list")).toEqual({ tools: [] })
    } finally { await runtime.close() }
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    await runtime.close()
    await expect(runtime.request("list")).rejects.toThrow("LOGINOM_RUNTIME_DISCONNECTED")
    await expect(superviseKnowledge({ ...input, apiKey: "wrong-key" })).rejects.toThrow("LOGINOM_HANDSHAKE_INVALID")
    await expect(superviseKnowledge({ ...input, endpoint: "https://example.test/no-start" }))
      .rejects.toThrow("LOGINOM_HANDSHAKE_INVALID")
    for (const field of ["node", "entry", "stateDir"])
      await expect(superviseKnowledge({ ...input, [field]: "relative" }))
        .rejects.toThrow("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("supervised real knowledge entry acknowledges before the server catalog is ready", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "knowledge actual-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const server = await knowledgeServer({ after: (callback) => cleanup.push(callback) }, {
    initialize: async () => { entered.resolve(); await release.promise },
  })
  try {
    const runtime = await superviseKnowledge({
      node, entry: fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      stateDir: directory, generation: 20, endpoint: server.endpoint, apiKey: "UNIT-NONSECRET", environment: {},
    })
    try {
      expect(runtime.ready).toEqual({ protocol: 1, generation: 20, started: true })
      await entered.promise
      release.resolve()
      expect(await runtime.request("list")).toMatchObject({ tools: expect.arrayContaining([
        expect.objectContaining({ name: "read", inputSchema: { type: "object", properties: { uri: { type: "string" } },
          required: ["uri"], additionalProperties: false } }),
      ]) })
      expect(await runtime.request("call", { run: "run", id: "request", name: "read", arguments: { uri: "Help/node.md" } }))
        .toEqual({ content: [{ type: "text", text: JSON.stringify({ name: "read", arguments: { uri: "Help/node.md" } }) }] })
    } finally { release.resolve(); await runtime.close() }
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    expect(server.calls).toHaveLength(1)
    expect(server.requests.every((request) => request.authorization === "Bearer UNIT-NONSECRET")).toBe(true)
  } finally {
    release.resolve()
    for (const callback of cleanup) await callback()
    await rm(directory, { recursive: true, force: true })
  }
})
