import { expect, test } from "bun:test"
import { MessageChannel } from "node:worker_threads"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loginomHostPort } from "./host-port"
import { createLoginomHost } from "@loginom-ai-agent/loginom-host/host"
import { createHash } from "node:crypto"
import { stageKnowledgeFixture, waitForKnowledge } from "../../../../loginom-host/test/fixtures/knowledge"
import { credentials } from "./credentials"
import { transport } from "@loginom-ai-agent/loginom-host/transport"

test.each(["call", "tools", "admit", "interrupt"])(
  "release during %s retains the generation until the actual request finishes",
  async (method) => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-port-"))
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const resources = join(directory, "resources")
    const root = join(directory, "profile")
    await stageKnowledgeFixture(resources)
    await mkdir(join(resources, "bin"))
    await symlink(node, join(resources, "bin/node"))
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test/mcp" }))
    await writeFile(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      let pending, entered;
      const reply = (id, result) => process.send({id,result});
      process.on('message', m => {
        if (m.operation === 'start') return reply(m.id, m.input.validation
          ? {protocol:1,generation:m.input.generation,checked:true}
          : {protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true});
        if (m.operation === 'close') return process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
        if (m.operation === 'entered') {
          if (pending) return reply(m.id, true);
          entered = m.id; return;
        }
        if (m.operation === 'finish') {
          if (pending) reply(pending.id, pending.operation === 'call'
            ? {result:{content:[]},recoveryPending:false}
            : pending.operation === 'list' ? {tools:[]} : true);
          pending = undefined; return reply(m.id, true);
        }
        pending = m;
        if (entered) reply(entered, true);
      });
    `,
    )
    const service = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
    const initial = {
      revision: 0,
      url: "http://example.test/app/",
      username: "user",
      apiKey: { operation: "replace" as const, value: "test-key" },
      password: { operation: "empty" as const },
    }
    const validation = await service.api.check(initial)
    await service.api.save({ revision: 0, validationId: validation.validationId })
    await waitForKnowledge(service)
    const channel = new MessageChannel()
    const main = {
      on(event: string, listener: (value: { data: unknown }) => void) {
        channel.port1.on(event, event === "message" ? (data) => listener({ data }) : listener)
      },
      start() {
        channel.port1.start()
      },
      postMessage(value: unknown) {
        channel.port1.postMessage(value)
      },
    }
    const client = transport({
      on(_event, listener) {
        channel.port2.on("message", (data) => listener({ data }))
      },
      start() {
        channel.port2.start()
      },
      postMessage(value) {
        channel.port2.postMessage(value)
      },
    })
    const port = loginomHostPort(main, service)
    const runtime = await service.runtime(1, createHash("sha256").update("chat").digest("hex"))
    try {
      expect(await client.request("acquire", { run: "first", session: "chat" })).toEqual({ generation: 1 })
      const call = client.request(method, {
        run: "first",
        name: "tool",
        userMessage: "original-user",
        args: {},
        files: [],
      })
      await runtime.request("entered")
      await client.request("release", { run: "first" })
      const next = await service.api.check({ ...initial, revision: 1, username: "other" })
      await service.api.save({ revision: 1, validationId: next.validationId })
      expect(await service.api.status()).toMatchObject({ state: "pending", generation: 1 })
      const rejected = await client
        .request("call", { run: "first", name: "tool", userMessage: "original-user", args: {} }, 1000)
        .catch((error: Error) => error.message)
      expect(rejected).toBe("LOGINOM_HOST_REQUEST_FAILED")
      await runtime.request("finish")
      await call
      await port.close()
      await waitForKnowledge(service)
      expect(await service.api.status()).toMatchObject({ state: "ready", generation: 2 })
    } finally {
      await runtime.request("finish").catch(() => undefined)
      client.close()
      await port.close()
      channel.port1.close()
      channel.port2.close()
      await service.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
