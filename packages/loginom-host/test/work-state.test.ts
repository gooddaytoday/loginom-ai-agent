import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventEmitter, once } from "node:events"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import type { WindowList } from "../src/windows"
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
    expect(await host.updateWorkState()).toEqual({ activeWork: false, unsettledWork: false, dispatching: false })
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
      if (message.operation === 'start' && message.input.validation)
        return send({ protocol: 1, generation: message.input.generation, checked: true });
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
      if (message.operation === 'start' && message.input.observeWindow)
        process.send({ windowSnapshot: { openedAt: 123, state: 'open',
          package: { name: 'Sales', path: '/user/Sales.lgp' } } });
      if (message.operation === 'fixture.window') {
        process.send({ windowSnapshot: message.input });
        send(true);
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

test("headed conversation windows are listed and invalidated when the window closes or its generation retires", async () => {
  const f = await fixture()
  const changes = new EventEmitter()
  const unsubscribe = f.host.onWindowsChanged(() => changes.emit("changed"))
  const nextChange = () => once(changes, "changed", { signal: AbortSignal.timeout(5000) })
  const chat = (sessionID: string) => createHash("sha256").update(sessionID).digest("hex")
  try {
    expect(await f.host.listWindows()).toEqual([])
    const firstOpened = nextChange()
    const first = await f.host.runtime(1, chat("ses_one"), undefined, "ses_one")
    await firstOpened
    const firstRow = {
      sessionID: "ses_one", generation: 1, openedAt: 123, state: "open",
      package: { name: "Sales", path: "/user/Sales.lgp" },
    } satisfies typeof WindowList.Type[number]
    expect(await f.host.listWindows()).toEqual([firstRow])

    const secondOpened = nextChange()
    await f.host.runtime(1, chat("ses_two"), undefined, "ses_two")
    await secondOpened
    const secondRow = { ...firstRow, sessionID: "ses_two" }
    expect(await f.host.listWindows()).toEqual([firstRow, secondRow])

    const closed = nextChange()
    await first.request("fixture.window", null)
    await closed
    expect(await f.host.listWindows()).toEqual([secondRow])

    const checked = await f.host.api.check({
      revision: 1,
      url: "http://127.0.0.1:1/app/",
      username: "user",
      password: { operation: "empty" },
    })
    const retired = nextChange()
    await f.host.api.save({ revision: 1, validationId: checked.validationId })
    await retired
    expect(await f.host.api.status()).toMatchObject({ generation: 2 })
    expect(await f.host.listWindows()).toEqual([])
    await f.host.settled()
  } finally {
    unsubscribe()
    await f.close()
  }
}, 15_000)

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
      expect(await f.host.updateWorkState()).toEqual(work)
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
      await expect(f.host.updateWorkState()).rejects.toThrow("LOGINOM_REPLY_INVALID")
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
    await expect(f.host.updateWorkState()).rejects.toThrow("LOGINOM_RUNTIME_UNAVAILABLE")
    expect((await readFile(f.launches, "utf8")).trim().split("\n")).toHaveLength(1)
  } finally {
    await f.close()
  }
})
