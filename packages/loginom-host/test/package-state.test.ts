import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { createLoginomHost } from "../src/host"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

test("reads only the ready runtime owned by the conversation", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "package-state-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const gate = join(directory, "release-startup")
  const snapshot = {
    open: true,
    path: "/user/result.lgp",
    modified: true,
    modifiedDetectedAt: 100,
    lastSave: null,
    staleForSeconds: 2,
  }
  await mkdir(join(resources, "bin"), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  await stageKnowledgeFixture(resources)
  await Bun.write(join(resources, "resource-manifest.json"), "{}")
  await Bun.write(join(resources, "runtime/src/managed-entry.mjs"), `
    import { existsSync } from 'node:fs';
    process.on('disconnect', () => process.exit(0));
    process.on('message', m => {
      if (m.operation === 'start') {
        const ready = setInterval(() => {
          if (!existsSync(${JSON.stringify(gate)})) return;
          clearInterval(ready);
          process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        }, 10);
      }
      if (m.operation === 'packageState') process.send({id:m.id,result:${JSON.stringify(snapshot)}});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });
  `)
  const codec = credentials("linux")
  const store = connectionStore(join(root, "connection"), codec)
  await store.stage({
    generation: 1,
    revision: 1,
    url: "http://example.test",
    username: "user",
    apiKey: "UNIT-NONSECRET",
    password: "",
  })
  await store.activate(1)
  const host = await createLoginomHost({ root, resources, codec, environment: {} })
  try {
    await waitForKnowledge(host)
    const sessionID = "ses_package"
    const chat = createHash("sha256").update(sessionID).digest("hex")
    const closed = { ...snapshot, open: false, path: null, modified: null, modifiedDetectedAt: null, staleForSeconds: null }
    expect(await host.packageState(sessionID)).toEqual(closed)

    const starting = host.runtime(1, chat)
    try {
      expect(await Promise.race([host.packageState(sessionID), Bun.sleep(1000).then(() => "startup still pending")]))
        .toBeNull()
    } finally {
      await Bun.write(gate, "")
    }
    const runtime = await starting
    expect(await host.packageState(sessionID)).toEqual(snapshot)
    expect(await host.packageState(chat)).toEqual(closed)

    await runtime.close()
    await runtime.exited
    expect(await host.packageState(sessionID)).toBeNull()

    await host.runtime(1, chat)
    expect(await host.packageState(sessionID)).toEqual(snapshot)
    host.markRuntimeStale(chat)
    expect(await host.packageState(sessionID)).toBeNull()
  } finally {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)
