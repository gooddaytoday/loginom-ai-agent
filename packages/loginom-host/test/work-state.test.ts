import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

test("work state of an unconfigured chat is local and never creates a runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-work-local-"))
  const root = join(directory, "profile")
  const host = await createLoginomHost({
    root,
    resources: join(directory, "absent"),
    codec: credentials("linux"),
    environment: {},
  })
  try {
    await host.settled()
    expect(await host.workState(0, "chat")).toEqual({ activeWork: false, unsettledWork: false, dispatching: false })
    expect(await readdir(root)).not.toContain("runtime")
    expect(await readdir(root)).not.toContain("inputs")
    expect(host.journal.pending()).toEqual([])
  } finally {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
})

async function fixture() {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-work-state-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const launches = join(directory, "launches.jsonl")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await stageKnowledgeFixture(resources)
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  // Control the external browser/bridge boundary, keeping real Host supervision and private IPC.
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    let work = { activeWork: false, unsettledWork: false, dispatching: false };
    process.on('disconnect', () => process.exit(0));
    process.on('message', message => {
      const send = result => process.send({ id: message.id, result });
      if (message.operation === 'start') {
        appendFileSync(${JSON.stringify(launches)}, JSON.stringify({ pid: process.pid }) + '\\n');
        send({ protocol: 1, generation: message.input.generation, chat: message.input.chat, ready: true });
      }
      if (message.operation === 'work') send(work);
      if (message.operation === 'fixture.state') { work = message.input; send(true); }
      if (message.operation === 'fixture.exit') {
        process.send({ id: message.id, result: true }, () => process.disconnect());
      }
      if (message.operation === 'close') {
        process.send({ id: message.id, result: { closed: true } }, () => process.disconnect());
      }
    });
  `,
  )
  const store = connectionStore(join(root, "connection"), credentials("linux"))
  await store.stage({
    generation: 1,
    revision: 1,
    url: "http://example.test",
    username: "user",
    apiKey: "fixture",
    password: "",
  })
  await store.activate(1)
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  await host.settled()
  await waitForKnowledge(host)
  return {
    host,
    root,
    launches,
    async close() {
      await host.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test("work state rereads the existing child after asynchronous changes and never creates another chat", async () => {
  const f = await fixture()
  try {
    expect(await f.host.workState(1, "chat")).toEqual({ activeWork: false, unsettledWork: false, dispatching: false })
    await expect(access(f.launches)).rejects.toMatchObject({ code: "ENOENT" })
    const runtime = await f.host.runtime(1, "chat")
    for (const work of [
      { activeWork: true, unsettledWork: true, dispatching: false },
      { activeWork: false, unsettledWork: true, dispatching: false },
      { activeWork: false, unsettledWork: false, dispatching: true },
      { activeWork: false, unsettledWork: false, dispatching: false },
    ]) {
      await runtime.request("fixture.state", work)
      expect(await f.host.workState(1, "chat")).toEqual(work)
    }
    expect(await f.host.workState(1, "other-chat")).toEqual({
      activeWork: false,
      unsettledWork: false,
      dispatching: false,
    })
    expect((await readFile(f.launches, "utf8")).trim().split("\n")).toHaveLength(1)
    expect(f.host.journal.pending()).toEqual([])
    expect(await readdir(join(f.root, "recovery"))).toEqual([])
    expect(await readdir(f.root)).not.toContain("inputs")
  } finally {
    await f.close()
  }
})

test("malformed work status is rejected instead of authorizing an idle transition", async () => {
  const f = await fixture()
  try {
    const runtime = await f.host.runtime(1, "chat")
    for (const invalid of [
      null,
      {},
      { activeWork: false, unsettledWork: false },
      { activeWork: "false", unsettledWork: false, dispatching: false },
    ]) {
      await runtime.request("fixture.state", invalid)
      await expect(f.host.workState(1, "chat")).rejects.toThrow("LOGINOM_REPLY_INVALID")
    }
    expect(f.host.journal.pending()).toEqual([])
  } finally {
    await f.close()
  }
})

test.each(["lost", "stale"])("%s runtime cannot report idle or be restarted by a work query", async (kind) => {
  const f = await fixture()
  try {
    const runtime = await f.host.runtime(1, "chat")
    if (kind === "lost") {
      await runtime.request("fixture.exit")
      await runtime.exited
    }
    if (kind === "stale") f.host.markRuntimeStale("chat")
    await expect(f.host.workState(1, "chat")).rejects.toThrow("LOGINOM_RUNTIME_UNAVAILABLE")
    expect((await readFile(f.launches, "utf8")).trim().split("\n")).toHaveLength(1)
  } finally {
    await f.close()
  }
})
