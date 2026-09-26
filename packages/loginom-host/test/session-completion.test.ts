import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, readFile, chmod, readdir, mkdir, symlink, access } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { recoveryStore } from "../src/connection/recovery-store"
import { readSessionRegistration, sessionCompletion } from "../src/session-completion"
import { createLoginomHost } from "../src/host"
import { connectionService } from "../src/connection/connection-service"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import type { Loginom } from "@loginom-ai-agent/schema/loginom"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const binding: Loginom.SessionCompletionBinding = {
  attemptId: "attempt-1",
  generation: 1,
  chat: "a".repeat(64),
  sessionId: "session-1",
  documentId: "doc-1",
  account: "fresh-user",
  packagePath: "/fresh-user/result.lgp",
  saveOperationId: "save-1",
  mutationRevision: 2,
}
const request = { completionId: "complete-1", binding }
const success: Loginom.SessionCompletionReceipt = {
  version: 1,
  ...request,
  status: "SUCCEEDED",
  packageClosed: true,
  loggedOut: true,
  reason: null,
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "session-completion-test-"))
  roots.push(root)
  const journal = await recoveryStore(join(root, "recovery"), { strict: true })
  const calls: string[] = []
  const state: {
    reply: unknown
    observed: unknown
    actual: unknown
    available: boolean
    idle: boolean
    lost: boolean
  } = {
    reply: success,
    observed: success,
    actual: binding,
    available: true,
    idle: true,
    lost: false,
  }
  const runtime = {
    async request(operation: string) {
      calls.push(operation)
      if (operation === "session-completion-options") return state.actual
      if (operation === "session-completion-status") return state.observed
      expect(journal.pending()).toHaveLength(1)
      if (state.lost) throw Error("lost reply")
      return state.reply
    },
  }
  const create = () =>
    sessionCompletion({
      root,
      journal,
      registration: { attemptId: binding.attemptId },
      idle: () => state.idle,
      runtime: async () => (state.available ? runtime : undefined),
    })
  return { root, journal, calls, state, create, api: await create() }
}

test("completion is bound to a trusted private registration, not supplied authority", async () => {
  const f = await fixture()
  expect(await readSessionRegistration(f.root)).toBeUndefined()
  const file = join(f.root, "session-registration.json")
  await writeFile(file, JSON.stringify({ version: 1, attemptId: "attempt-1" }), { mode: 0o600 })
  expect(await readSessionRegistration(f.root)).toEqual({ version: 1, attemptId: "attempt-1" })
  await writeFile(file, JSON.stringify({ version: 1, attemptId: "attempt-1", extra: true }))
  await expect(readSessionRegistration(f.root)).rejects.toThrow("LOGINOM_SESSION_STORE_INVALID")
  await writeFile(file, JSON.stringify({ version: 1, attemptId: "attempt-1" }))
  await chmod(file, 0o644)
  if (process.platform !== "win32")
    await expect(readSessionRegistration(f.root)).rejects.toThrow("LOGINOM_SESSION_STORE_INVALID")
  const unregistered = await sessionCompletion({
    root: f.root,
    journal: f.journal,
    idle: () => true,
    runtime: async () => undefined,
  })
  await expect(unregistered.options(binding)).rejects.toThrow("LOGINOM_SESSION_UNREGISTERED")
  await expect(f.api.finish({ ...request, binding: { ...binding, attemptId: "forged" } })).rejects.toThrow(
    "LOGINOM_SESSION_BINDING_INVALID",
  )
  expect(f.calls).toEqual([])
})

test("observed options and exact durable receipt replay release only own intent", async () => {
  const f = await fixture()
  expect(await f.api.options(binding)).toEqual(binding)
  expect(await f.api.finish(request)).toEqual(success)
  expect(f.journal.pending()).toEqual([])
  expect(f.api.blocked()).toBe(false)
  expect(await (await f.create()).finish(request)).toEqual(success)
  expect(f.calls.filter((call) => call === "session-finish")).toHaveLength(1)
  for (const key of Object.keys(binding) as (keyof typeof binding)[]) {
    const changed = {
      ...binding,
      [key]: typeof binding[key] === "number" ? Number(binding[key]) + 1 : binding[key] + "x",
    }
    await expect(f.api.finish({ ...request, binding: changed })).rejects.toThrow()
  }
})

for (const [label, reply] of [
  ["transport ACK only", { closed: true }],
  ["wrong session", { ...success, binding: { ...binding, sessionId: "foreign" } }],
  ["package closed without logout", { ...success, loggedOut: false }],
  ["no reply", undefined],
  [
    "foreign state blocked",
    { ...success, status: "BLOCKED", packageClosed: false, loggedOut: false, reason: "FOREIGN_STATE" },
  ],
] as const)
  test(`unsafe completion retains durable barrier: ${label}`, async () => {
    const f = await fixture()
    f.state.reply = reply
    f.state.observed = undefined
    const result = await f.api.finish(request)
    expect(result.status).toBe(label === "foreign state blocked" ? "BLOCKED" : "UNKNOWN")
    expect(f.api.blocked()).toBe(true)
    await expect(f.journal.acknowledge(f.journal.pending())).rejects.toThrow("LOGINOM_RECOVERY_BUSY")
    f.state.available = false
    const restarted = await f.create()
    expect(await restarted.finish(request)).toEqual(result)
    expect(restarted.blocked()).toBe(true)
    expect(f.calls.filter((call) => call === "session-finish")).toHaveLength(1)
    expect((await recoveryStore(join(f.root, "recovery"), { strict: false })).pending()).toHaveLength(1)
  })

test("lost finish reply is reconciled only by observation, never another gesture", async () => {
  const f = await fixture()
  f.state.lost = true
  expect((await f.api.finish(request)).status).toBe("UNKNOWN")
  expect(await f.api.finish(request)).toEqual(success)
  expect(f.calls).toEqual(["session-completion-options", "session-finish", "session-completion-status"])
  expect(f.journal.pending()).toEqual([])
})

test("changed save binding, busy owner and preexisting uncertain work cannot dispatch", async () => {
  const f = await fixture()
  f.state.actual = { ...binding, mutationRevision: 3 }
  await expect(f.api.finish(request)).rejects.toThrow("LOGINOM_SESSION_COMPLETION_CONFLICT")
  f.state.actual = binding
  f.state.idle = false
  await expect(f.api.finish(request)).rejects.toThrow("LOGINOM_SESSION_BUSY")
  f.state.idle = true
  const id = await f.journal.begin(binding.chat, 1)
  await f.journal.settle(id, false)
  await expect(f.api.finish(request)).rejects.toThrow("LOGINOM_RECOVERY_REQUIRED")
  expect(f.calls).toEqual(["session-completion-options"])
})

test("corrupt or rebound completion receipts fail closed during recreation", async () => {
  const f = await fixture()
  await f.api.finish(request)
  const directory = join(f.root, "session-completions")
  const file = join(directory, (await readdir(directory))[0]!)
  const stored = JSON.parse(await readFile(file, "utf8"))
  stored.receipt.binding.attemptId = "other-attempt"
  await writeFile(file, JSON.stringify(stored))
  await expect(f.create()).rejects.toThrow("LOGINOM_SESSION_STORE_INVALID")
})

test("orphan completion intent cannot be downgraded or acknowledged as transport recovery", async () => {
  const f = await fixture()
  const id = await f.journal.begin(binding.chat, 1, "session-completion")
  await f.journal.settle(id, false)
  const restarted = await recoveryStore(join(f.root, "recovery"))
  expect(restarted.mode).toBe("strict")
  await expect(restarted.acknowledge([id])).rejects.toThrow("LOGINOM_RECOVERY_BUSY")
})

test("concurrent completion IDs cannot dispatch a second cleanup", async () => {
  const f = await fixture()
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  let effects = 0
  const api = await sessionCompletion({
    root: f.root,
    registration: { attemptId: binding.attemptId },
    journal: f.journal,
    idle: () => true,
    runtime: async () => ({
      async request(operation: string) {
        if (operation === "session-completion-options") return binding
        effects++
        entered.resolve()
        await release.promise
        return success
      },
    }),
  })
  const first = api.finish(request)
  await entered.promise
  try {
    await expect(api.finish({ ...request, completionId: "other" })).rejects.toThrow("LOGINOM_SESSION_BUSY")
    expect(api.blocked()).toBe(true)
  } finally {
    release.resolve()
  }
  expect(await first).toEqual(success)
  expect(effects).toBe(1)
})

test("terminal completion prevents a new completion ID even with otherwise valid runtime options", async () => {
  const f = await fixture()
  await f.api.finish(request)
  expect(f.api.completed()).toBe(true)
  await expect(f.api.finish({ ...request, completionId: "new-id" })).rejects.toThrow("LOGINOM_SESSION_COMPLETED")
  expect(f.calls.filter((call) => call === "session-finish")).toHaveLength(1)
})

test("rebound journal IDs never settle unrelated recovery records", async () => {
  const f = await fixture()
  await f.api.finish(request)
  const unrelated = await f.journal.begin("b".repeat(64), 2)
  await f.journal.settle(unrelated, false)
  const directory = join(f.root, "session-completions"),
    file = join(directory, (await readdir(directory))[0]!)
  const stored = JSON.parse(await readFile(file, "utf8"))
  stored.recoveryId = unrelated
  await writeFile(file, JSON.stringify(stored))
  await expect(f.create()).rejects.toThrow("LOGINOM_SESSION_STORE_INVALID")
  expect(f.journal.pending()).toEqual([unrelated])
})

for (const outcome of ["orphan", "UNKNOWN", "SUCCEEDED"] as const)
  test(`Host restart cannot log in or admit work after completion ${outcome}`, async () => {
    const f = await fixture()
    if (outcome === "orphan") {
      const id = await f.journal.begin(binding.chat, binding.generation, "session-completion")
      await f.journal.settle(id, false)
      expect((await f.create()).blocked()).toBe(true)
    } else {
      f.state.reply = outcome === "SUCCEEDED" ? success : undefined
      await f.api.finish(request)
    }
    await writeFile(
      join(f.root, "session-registration.json"),
      JSON.stringify({ version: 1, attemptId: binding.attemptId }),
      { mode: 0o600 },
    )
    const store = connectionStore(join(f.root, "connection"), credentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      url: "http://fixture.invalid",
      username: binding.account,
      apiKey: "fixture",
      password: "",
    })
    await store.activate(1)
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const resources = join(f.root, "fixture-resources"),
      marker = join(f.root, "UNEXPECTED-LOGIN")
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await mkdir(join(resources, "bin"))
    await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://fixture.invalid" }))
    await writeFile(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
    import {writeFileSync} from 'node:fs';
    process.on('message',m=>{
      if(m.operation==='start'){writeFileSync(${JSON.stringify(marker)},'unexpected');process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}})}
      if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });`,
    )
    const host = await createLoginomHost({
      root: f.root,
      resources,
      codec: credentials("linux"),
      environment: {},
      strictRecovery: false,
    })
    try {
      await host.settled()
      expect(host.acquire("new-work")).toBeUndefined()
      expect(await host.api.status()).toMatchObject({
        recoveryMode: "strict",
        sessionCompletion: outcome === "SUCCEEDED" ? "completed" : "pending",
      })
      await expect(access(marker)).rejects.toThrow()
      if (outcome !== "SUCCEEDED")
        await expect(host.api.acknowledgeRecovery({ revision: 1, ids: host.journal.pending() })).rejects.toThrow(
          "LOGINOM_RECOVERY_BUSY",
        )
      if (outcome === "SUCCEEDED") expect(await host.sessionApi.finishOwnSession(request)).toEqual(success)
    } finally {
      await host.close()
    }
  })

test("in-flight connection validation owns the idle fence and shutdown waits for it", async () => {
  const f = await fixture(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const service = await connectionService(
    connectionStore(join(f.root, "connection"), credentials("linux")),
    {
      async check() {
        entered.resolve()
        await release.promise
      },
      async prepare() {
        return { async close() {} }
      },
    },
    f.journal,
  )
  const api = await sessionCompletion({
    root: f.root,
    registration: { attemptId: binding.attemptId },
    journal: f.journal,
    idle: () => service.idle(),
    runtime: async () => ({
      async request() {
        throw Error("cleanup must not dispatch")
      },
    }),
  })
  const checked = service.api
    .check({
      revision: 0,
      url: "http://fixture.invalid",
      username: binding.account,
      apiKey: { operation: "replace", value: "fixture" },
      password: { operation: "empty" },
    })
    .catch((error: Error) => error.message)
  await entered.promise
  expect(service.idle()).toBe(false)
  await expect(api.finish(request)).rejects.toThrow("LOGINOM_SESSION_BUSY")
  let closed = false
  const closing = service.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  release.resolve()
  expect(await checked).toBe("LOGINOM_HOST_CLOSED")
  await closing
  expect(closed).toBe(true)
})

test("shutdown in the same tick prevents a queued connection validation from starting", async () => {
  const f = await fixture()
  let logins = 0
  const service = await connectionService(connectionStore(join(f.root, "connection"), credentials("linux")), {
    async check() {
      logins++
    },
    async prepare() {
      return { async close() {} }
    },
  })
  const checked = service.api
    .check({
      revision: 0,
      url: "http://fixture.invalid",
      username: binding.account,
      apiKey: { operation: "replace", value: "fixture" },
      password: { operation: "empty" },
    })
    .catch((error: Error) => error.message)
  await service.close()
  expect(await checked).toBe("LOGINOM_HOST_CLOSED")
  expect(logins).toBe(0)
})
