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
    await writeFile(entry, `
process.on('message', message => {
 if (message.operation === 'start') {
  const valid = !process.argv.join(' ').includes('private-key') && !Object.values(process.env).includes('private-key') && message.input.connection.apiKey === 'private-key';
  process.send({id:message.id, result:{protocol:1,generation:valid?message.input.generation:-1,chat:message.input.chat,ready:true}});
 }
 if (message.operation === 'close') { process.send({id:message.id,result:{closed:true}},()=>process.disconnect()); }
});
`)
    const child = await supervise({ node, entry, resources: directory, stateDir: join(directory, "данные"), generation: 7, chat: "one",
      endpoint: "https://example.test/mcp", connection: { apiKey: "private-key", password: "", url: "http://example.test", username: "user" } })
    expect(child.ready).toMatchObject({ generation: 7, ready: true })
    await child.close()
    await expect(child.request("list")).rejects.toThrow("LOGINOM_RUNTIME_DISCONNECTED")
    await expect(supervise({ node, entry, resources: directory, stateDir: directory, generation: 7, chat: "one",
      endpoint: "https://example.test/mcp", connection: { apiKey: "wrong", password: "", url: "http://example.test", username: "user" } })).rejects.toThrow("LOGINOM_HANDSHAKE_INVALID")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
