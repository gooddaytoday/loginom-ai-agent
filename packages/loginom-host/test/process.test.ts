import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { supervise } from "../src/supervisor"

// This child exercises the actual private transport independently of network/browser fixtures.
test("private process transport preserves spaces and Unicode, rejects wrong generation and shuts down", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom transport Проба "))
  const entry = join(directory, "private child.mjs")
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  try {
    await writeFile(
      entry,
      `
process.on('message', message => {
 if (message.operation === 'start') {
  const valid = !process.argv.join(' ').includes('private-key') && !Object.values(process.env).includes('private-key') && message.input.connection.apiKey === 'private-key' && !message.input.environment && !process.env.OPENAI_API_KEY;
  process.send({id:message.id, result:{protocol:1,generation:valid?message.input.generation:-1,chat:message.input.chat,ready:true}});
 }
 if (message.operation === 'close') { process.send({id:message.id,result:{closed:true}},()=>process.disconnect()); }
});
`,
    )
    const child = await supervise({
      node,
      entry,
      resources: directory,
      stateDir: join(directory, "данные"),
      generation: 7,
      chat: "one",
      environment: { ...process.env, OPENAI_API_KEY: "provider-secret-must-not-reach-runtime" },
      endpoint: "https://example.test/mcp",
      connection: { apiKey: "private-key", password: "", url: "http://example.test", username: "user" },
    })
    expect(child.ready).toMatchObject({ generation: 7, ready: true })
    await child.close()
    await expect(child.request("list")).rejects.toThrow("LOGINOM_RUNTIME_DISCONNECTED")
    await expect(
      supervise({
        node,
        entry,
        resources: directory,
        stateDir: directory,
        generation: 7,
        chat: "one",
        endpoint: "https://example.test/mcp",
        connection: { apiKey: "wrong", password: "", url: "http://example.test", username: "user" },
      }),
    ).rejects.toThrow("LOGINOM_HANDSHAKE_INVALID")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("runtime cleanup requires both a close acknowledgement and a clean exit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-cleanup-"))
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  try {
    for (const mode of ["missing-ack", "failed-exit", "never-exits"]) {
      const entry = join(directory, mode + ".mjs")
      await writeFile(
        entry,
        `process.on('message', m => {
        if(m.operation==='start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        if(m.operation==='close') {
          if(${JSON.stringify(mode)}==='missing-ack') { process.disconnect(); return; }
          process.send({id:m.id,result:{closed:true}},()=>{
            if(${JSON.stringify(mode)}==='failed-exit') { process.exitCode=1; process.disconnect(); }
          });
        }
      });`,
      )
      const child = await supervise({
        node,
        entry,
        resources: directory,
        stateDir: directory,
        generation: 1,
        chat: "cleanup",
        endpoint: "https://example.test",
        connection: { apiKey: "fixture", password: "", url: "https://example.test", username: "test" },
      })
      await expect(child.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
      await expect(child.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("IPC disconnect rejects in-flight requests even while the runtime stays alive", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-disconnected-live-"))
  const entry = join(directory, "runtime.mjs")
  await writeFile(
    entry,
    `
    setInterval(() => {}, 1000);
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
      if (m.operation === 'disconnect') process.disconnect();
    });
  `,
  )
  const child = await supervise({
    node,
    entry,
    resources: directory,
    stateDir: directory,
    generation: 1,
    chat: "disconnect",
    endpoint: "https://example.test",
    connection: { apiKey: "fixture", password: "", url: "https://example.test", username: "test" },
  })
  const deadline = Promise.withResolvers<string[]>()
  const timer = setTimeout(() => deadline.resolve(["TIMEOUT"]), 2000)
  try {
    const pending = Promise.all(
      [child.request("pending"), child.request("disconnect")].map((request) =>
        request.then(
          () => "UNEXPECTED_REPLY",
          (error: Error) => error.message,
        ),
      ),
    )
    expect(await Promise.race([pending, deadline.promise])).toEqual([
      "LOGINOM_RUNTIME_DISCONNECTED",
      "LOGINOM_RUNTIME_DISCONNECTED",
    ])
    await expect(child.request("future")).rejects.toThrow("LOGINOM_RUNTIME_DISCONNECTED")
  } finally {
    clearTimeout(timer)
    await expect(child.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
    await rm(directory, { recursive: true, force: true })
  }
}, 12000)
