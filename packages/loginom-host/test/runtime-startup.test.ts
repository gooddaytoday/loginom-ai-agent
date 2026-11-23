import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import { RuntimeStartupError, supervise, superviseKnowledge } from "../src/supervisor"
import { writeHelp } from "../../loginom-runtime/client/test/support/help-fixture.mjs"

const fixture = { directory: "", supervisor: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-startup-supervisor-"))
  const built = await Bun.build({ entrypoints: [join(import.meta.dir, "../src/supervisor.ts")], target: "node" })
  if (!built.success) throw new AggregateError(built.logs, "Supervisor test bundle failed")
  fixture.supervisor = join(fixture.directory, "supervisor.mjs")
  await Bun.write(fixture.supervisor, built.outputs[0])
})
afterAll(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

async function runSupervisor(source: string) {
  // The shipped Host owns runtime IPC from Node. Bun's Windows fork can lose
  // replies before disconnect; keep filesystem/redaction assertions in Bun.
  const child = Bun.spawn([fixture.node, "--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    import { supervise, superviseKnowledge } from ${JSON.stringify(pathToFileURL(fixture.supervisor).href)};
    ${source}
  `], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "", stderr: "" })
}

for (const scenario of [
  { failure: "LOGINOM_BROWSER_START_FAILED", knowledge: false, validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", knowledge: false, validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", knowledge: false, validation: true, closed: true },
  { failure: "LOGINOM_KNOWLEDGE_UNAVAILABLE", knowledge: true, validation: false, closed: false },
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
        helpRoot: join(directory, "help"),
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
      helpRoot: join(directory, "help"), environment: {},
      connection: { apiKey: "PRIVATE-KEY", password: "p", username: "user", url: "https://example.test" } }
    await runSupervisor(`
      const input = ${JSON.stringify(input)};
      if (${knowledge}) {
        const runtime = await superviseKnowledge(input);
        try {
          await assert.rejects(runtime.request('list'), /LOGINOM_KNOWLEDGE_UNAVAILABLE/);
        } finally { await runtime.close(); }
      } else await assert.rejects(supervise(input), /LOGINOM_KNOWLEDGE_UNAVAILABLE/);
    `)
    const hostLog = await readFile(join(directory, "startup-failures.jsonl"), "utf8")
    const [id] = await readdir(join(directory, "diagnostics"))
    const diagnostic = await readFile(join(directory, "diagnostics", id, "events.jsonl"), "utf8")
    for (const text of [hostLog, diagnostic]) {
      expect(text).toContain("ECONNRESET"); expect(text).toContain("TLS EOF")
      // The knowledge child never receives the connection key, so only the browser runtime names it as a secret.
      for (const secret of ["unknown-password", "hidden-query", "u:p", ...(knowledge ? [] : ["PRIVATE-KEY"])])
        expect(text).not.toContain(secret)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 15000)

for (const phase of ["ready", "failure"]) test(`knowledge shutdown diagnostics: ${phase}`, async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE")
  const directory = await mkdtemp(join(tmpdir(), "knowledge-shutdown-diagnostic-"))
  const help = await mkdtemp(join(tmpdir(), "knowledge-shutdown-help-"))
  try {
    const input = { node,
      entry: fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      stateDir: directory, generation: 1, environment: {},
      helpRoot: await writeHelp(help, phase === "failure" ? { tamper: "data/README.md" } : {}),
    }
    await runSupervisor(`
      const runtime = await superviseKnowledge(${JSON.stringify(input)});
      try {
        assert.equal(runtime.ready.started, true);
        const catalog = runtime.request('list');
        void catalog.catch(() => {});
        if (${JSON.stringify(phase)} === 'ready') assert.ok('tools' in await catalog);
        else await assert.rejects(catalog, /LOGINOM_KNOWLEDGE_UNAVAILABLE/);
        await runtime.close();
        assert.deepEqual(await runtime.exited, { code: 0, signal: null });
      } finally { await runtime.close(); }
    `)
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
      expect(log).toContain("LOGINOM_HELP_INTEGRITY")
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
    await rm(help, { recursive: true, force: true })
  }
}, 15000)
