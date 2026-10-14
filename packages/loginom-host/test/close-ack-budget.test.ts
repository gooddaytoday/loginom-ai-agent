import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { supervise } from "../src/supervisor"

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
