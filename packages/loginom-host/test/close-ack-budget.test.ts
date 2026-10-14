import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { supervise } from "../src/supervisor"
import { launchNodeHost } from "../src/node-client"

test("runtime and host retain the original close through a 31s receipt, without another dispatch", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-slow-close-"))
  try {
    await Promise.all(["runtime", "host"].map(async kind => {
      const entry = join(directory, kind + ".mjs"), marker = join(directory, kind + ".json")
      // Native/context work is a double; child IPC, time and durable file are real.
      await writeFile(entry, `
import fs from 'node:fs/promises';
let closes=0;
process.on('message', async m => {
 const operation=m.operation??m.method;
 if(operation==='start') return process.send({id:m.id,result:{protocol:1,generation:m.input?.generation,chat:m.input?.chat,ready:true,pid:process.pid}});
 if(operation==='close') {
  closes++;
  await new Promise(r=>setTimeout(r,31000));
  const h=await fs.open(${JSON.stringify(marker)},'wx',0o600);
  try{await h.writeFile(JSON.stringify({closes}));await h.sync()}finally{await h.close()}
  process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
 }
});
`)
      const child = kind === "runtime"
        ? await supervise({ node, entry, resources: directory, stateDir: directory, generation: 1, chat: "slow-close", endpoint: "https://example.test", connection: { apiKey: "fixture", password: "", url: "https://example.test", username: "fixture" } })
        : await launchNodeHost({ node, entry, resources: directory, root: directory, headless: true })
      try {
        const first = child.close()
        expect(child.close()).toBe(first)
        await first
        expect(await child.exited).toEqual({ code: 0, signal: null })
        expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({ closes: 1 })
      } finally {
        // Collect the original child even on the old timeout counterexample.
        await child.exited
      }
    }))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 45_000)

test("original close ACK after six seconds completes once and requires clean child exit", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-close-budget-"))
  const entry = join(directory, "child.mjs")
  const marker = join(directory, "count.json")
  try {
    // Real child message IPC/timer/file; native completion is a labelled double.
    await writeFile(entry, `
import fs from 'node:fs/promises';
let closes=0;
process.on('message', async m => {
 if(m.operation==='start') return process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
 if(m.operation==='close') {
  closes++;
  await fs.writeFile(${JSON.stringify(marker)},JSON.stringify({closes}),{mode:0o600});
  setTimeout(()=>process.send({id:m.id,result:{closed:true}},()=>process.disconnect()),6000);
 }
});
`)
    const child = await supervise({ node, entry, resources: directory, stateDir: directory, generation: 1, chat: "close-budget", endpoint: "https://example.test", connection: { apiKey: "fixture", password: "", url: "https://example.test", username: "fixture" } })
    const start = performance.now()
    const first = child.close()
    expect(child.close()).toBe(first)
    await first
    expect(performance.now() - start).toBeGreaterThanOrEqual(5900)
    expect(await child.exited).toEqual({ code: 0, signal: null })
    expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({ closes: 1 })
    await expect(child.request("call", {})).rejects.toThrow("LOGINOM_RUNTIME_DISCONNECTED")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
