import { expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { RuntimeStartupError, supervise, superviseKnowledge } from "../src/supervisor"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

for (const scenario of [
  { failure: "LOGINOM_BROWSER_START_FAILED", knowledge: false, validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", knowledge: false, validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", knowledge: false, validation: true, closed: true },
  { failure: "LOGINOM_KNOWLEDGE_AUTH_FAILED", knowledge: true, validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", knowledge: true, validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", knowledge: true, validation: false, closed: true },
]) {
  test(`runtime startup preserves ${scenario.failure}, knowledge=${scenario.knowledge}, validation=${scenario.validation}, cleanup=${scenario.closed}`, async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-runtime-startup-"))
    const entry = join(directory, "runtime.mjs")
    try {
      await writeFile(
        entry,
        `process.on('message', message => {
          if (message.operation === 'start') process.send({id:message.id,${
            scenario.failure !== "LOGINOM_HANDSHAKE_INVALID"
              ? `error:'${scenario.failure}'`
              : `result:{protocol:1,generation:message.input.generation${scenario.validation || scenario.knowledge ? "" : "+1"},chat:message.input.chat,ready:true}`
          }});
          if (message.operation === 'close') process.send({id:message.id,result:{closed:${scenario.closed}}},()=>process.disconnect());
        });`,
      )
      const input = {
        node,
        entry,
        resources: directory,
        stateDir: directory,
        generation: 1,
        chat: "startup",
        validation: scenario.validation,
        environment: {},
        endpoint: "https://example.test/mcp",
        apiKey: "fixture",
        connection: { apiKey: "fixture", password: "", url: "https://example.test/app/", username: "fixture" },
      }
      const failure = await (scenario.knowledge ? superviseKnowledge(input) : supervise(input)).then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(RuntimeStartupError)
      if (!(failure instanceof RuntimeStartupError)) throw new Error("Expected a runtime startup failure")
      expect(failure.message).toBe(scenario.failure)
      expect(failure.cause).toBeInstanceOf(Error)
      expect(failure.cause).toMatchObject({ message: scenario.failure })
      expect(failure.cleanupConfirmed).toBe(scenario.closed)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)
}

for (const knowledge of [true, false]) test(`startup diagnostic is private, redacted and retained by host: knowledge=${knowledge}`, async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE")
  const directory = await mkdtemp(join(tmpdir(), "startup-diagnostic-"))
  try {
    const entry = join(directory, "entry.mjs")
    await writeFile(entry, `process.on('message', m => {
      if(m.operation==='start' && ${knowledge}) process.send({id:m.id,result:{protocol:1,generation:1,started:true}});
      if(m.operation==='list' || m.operation==='start' && !${knowledge}) process.send({id:m.id,error:'LOGINOM_KNOWLEDGE_UNAVAILABLE',
        startupDiagnostics:[{phase:'initialize',retry:false,error:{name:'TypeError',message:'fetch failed',cause:{code:'ECONNRESET',
          message:'TLS EOF PRIVATE-KEY password=unknown-password https://u:p@example.test/mcp?arbitrary=hidden-query'}}}]});
      if(m.operation==='close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });`)
    const input = { node, entry, resources: directory, stateDir: directory, generation: 1, chat: "diagnostic",
      apiKey: "PRIVATE-KEY", endpoint: "https://example.test/mcp", environment: {},
      connection: { apiKey: "PRIVATE-KEY", password: "p", username: "user", url: "https://example.test" } }
    if (knowledge) {
      const runtime = await superviseKnowledge(input)
      await expect(runtime.request("list")).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
      await runtime.close()
    } else await expect(supervise(input)).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
    const hostLog = await readFile(join(directory, "startup-failures.jsonl"), "utf8")
    const [id] = await readdir(join(directory, "diagnostics"))
    const diagnostic = await readFile(join(directory, "diagnostics", id, "events.jsonl"), "utf8")
    for (const text of [hostLog, diagnostic]) {
      expect(text).toContain("ECONNRESET"); expect(text).toContain("TLS EOF")
      for (const secret of ["PRIVATE-KEY", "unknown-password", "hidden-query", "u:p"]) expect(text).not.toContain(secret)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 15000)

for (const phase of ["initialize", "ready", "failure"]) test(`knowledge shutdown diagnostics: ${phase}`, async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE")
  const directory = await mkdtemp(join(tmpdir(), "knowledge-shutdown-diagnostic-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const server = await knowledgeServer({ after: (callback) => cleanup.push(callback) }, {
    initialize: async () => {
      entered.resolve()
      if (phase === "initialize") await release.promise
    },
  })
  const runtime = await superviseKnowledge({ node,
    entry: fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
    stateDir: directory, generation: 1, endpoint: server.endpoint,
    apiKey: phase === "failure" ? "wrong-key" : "UNIT-NONSECRET", environment: {},
  })
  try {
    expect(runtime.ready).toMatchObject({ started: true })
    const catalog = runtime.request("list")
    void catalog.catch(() => {})
    if (phase === "initialize") {
      await entered.promise
      await runtime.close()
      await expect(catalog).rejects.toThrow("LOGINOM_KNOWLEDGE_CLOSED")
    }
    if (phase === "ready") {
      expect(await catalog).toHaveProperty("tools")
      await runtime.close()
    }
    if (phase === "failure") {
      await expect(catalog).rejects.toThrow("LOGINOM_KNOWLEDGE_AUTH_FAILED")
      await runtime.close()
    }
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    if (phase !== "failure") {
      expect(await readdir(directory)).not.toContain("startup-failures.jsonl")
      expect(await readdir(directory)).not.toContain("diagnostics")
      return
    }
    const hostLog = await readFile(join(directory, "startup-failures.jsonl"), "utf8")
    const [id] = await readdir(join(directory, "diagnostics"))
    const diagnostic = await readFile(join(directory, "diagnostics", id, "events.jsonl"), "utf8")
    for (const log of [hostLog, diagnostic]) {
      expect(log).toContain("runtime.startup_failure")
      expect(log).toContain('"code":"401"')
    }
  } finally {
    release.resolve()
    await runtime.close()
    for (const callback of cleanup) await callback()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)
