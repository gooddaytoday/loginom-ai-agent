import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { closeUserSessions, createAdminChannel, createJournaledAdminChannel, openLoginomAdmin, readAdminSessionInventory, readAdminPoolPolicy, requireSlotUserPolicy } from "../src/loginom-admin"
import { acquireResourceLease, writeLeaseReceipt } from "../src/lease"

import { parallelFixture } from "./helpers/parallel-fixture"

const owned = { remoteKey: "session-41", userKey: "user-a", username: "eval-a", serverEpoch: "epoch-1", pendingDisconnect: true, activeOperations: 0 }
const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test("fresh slot policy refuses missing users and rights drift without changing the observation", () => {
  const user = Object.freeze({ objectId: "fresh-proxy", name: "eval-a", userKind: 0, authMode: 1,
    isAdmin: false, isDesigner: true, isViewer: false, blocked: false, useGlobalFileStorage: false,
    schedulerFullAccess: false, allowPublish: false })
  const observed = Object.freeze({ users: Object.freeze([user]), sharedDirectories: Object.freeze([]) })
  expect(requireSlotUserPolicy(observed, "eval-a")).toEqual(user)
  expect(() => requireSlotUserPolicy(observed, "eval-b")).toThrow("SLOT_USER_MISSING")
  for (const drift of [{ isAdmin: true }, { isDesigner: false }, { isViewer: true }, { blocked: true },
    { useGlobalFileStorage: true }, { schedulerFullAccess: true }, { allowPublish: true }, { authMode: 0 }])
    expect(() => requireSlotUserPolicy({ ...observed, users: [{ ...user, ...drift }] }, "eval-a")).toThrow("SLOT_USER_POLICY_DRIFT")
  expect(() => requireSlotUserPolicy({ ...observed, sharedDirectories: [{ permissions: [{ name: "Everyone" }] }] }, "eval-a"))
    .toThrow("SLOT_ACL_DRIFT")
  expect(() => requireSlotUserPolicy({ ...observed, users: [user, { ...user, name: "Eval-a" }] }, "eval-a"))
    .toThrow("SLOT_USER_IDENTITY_AMBIGUOUS")
  expect(observed.users[0]).toBe(user)
})

test("the admin driver rejects research operations even with the retired flag before starting a browser", async () => {
  const child = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")], {
    env: { PATH: "/usr/bin:/bin", LOGINOM_EVALS_ADMIN_RESEARCH: "1" }, stdin: "pipe", stdout: "pipe", stderr: "pipe",
  })
  child.stdin.write(JSON.stringify({ v: 1, id: "research-refused", op: "reconcile-user", expectedIdentity: identity,
    deadline: Date.now() + 5000, payload: { phase: "session-backup-probe" } }) + "\n")
  child.stdin.end()
  expect(JSON.parse(await new Response(child.stdout).text())).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_CAPABILITY_UNSUPPORTED" } })
  expect(await child.exited).toBe(0)
  expect(await new Response(child.stderr).text()).toBe("")
})

test("preparation without a diagnostic inventory reaches runtime verification under its server guard", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-admin-direct-")), fixture = await parallelFixture(root)
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "direct", identity, phase: "unactivated" })
  const server = await acquireResourceLease({ key: `server:${identity.containerId}`, identity, journal, commandId: "direct", lockRoot: fixture.lockRoot })
  try {
    await expect(openLoginomAdmin(fixture.slots, identity, { serverLease: server, binary: path.join(root, "missing-runtime") }))
      .rejects.toMatchObject({ code: "ENOENT" })
    await server.assertHeld()
  } finally { await server.close(); await rm(root, { recursive: true }) }
})

test("slot closure uses exact native names, preserves peers and verifies fresh absence", async () => {
  // The native service boundary owns these rows; no actor inventory qualifies them.
  const sessions = ["admin:1", "eval-a:2", "eval-a:3", "eval-ab:4", "eval-b:5"].map(name => ({ name }))
  const closed: string[] = []
  const admin = {
    async inspectSessionInventory() { return { sessions: sessions.filter(row => !closed.includes(row.name)) } },
    async closeUserSession(username: string, name: string) {
      expect(username).toBe("eval-a")
      closed.push(name)
    },
  }
  expect(await closeUserSessions(admin, "eval-a")).toEqual(["eval-a:2", "eval-a:3"])
  expect((await admin.inspectSessionInventory()).sessions.map(row => row.name)).toEqual(["admin:1", "eval-ab:4", "eval-b:5"])
  expect(await closeUserSessions(admin, "eval-a")).toEqual([])
})

test("ambiguous slot names refuse closure and a remaining session refuses completion", async () => {
  const closed: string[] = []
  const admin = {
    async inspectSessionInventory() { return { sessions: [{ name: "eval-a:1" }, { name: "eval-a:1" }] } },
    async closeUserSession(_username: string, name: string) { closed.push(name) },
  }
  await expect(closeUserSessions(admin, "eval-a")).rejects.toThrow("SESSION_IDENTITY_AMBIGUOUS")
  expect(closed).toEqual([])
  await expect(closeUserSessions({ ...admin, async inspectSessionInventory() {
    return { sessions: [{ name: "eval-a:1" }] }
  } }, "eval-a")).rejects.toThrow("SESSION_STILL_PRESENT")
  expect(closed).toEqual(["eval-a:1"])
})

test("session inventory reader preserves unqualified snapshots and refuses changed sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-session-inventory-")), fixture = await parallelFixture(root)
  const directory = path.join(fixture.slots.controller.stateDir, "admin-codec")
  await mkdir(path.join(directory, "commands"), { recursive: true, mode: 0o700 })
  const hash = (value: unknown) => new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
  // Data-only native codec; no Loginom ownership, server mutation or cleanup claim.
  const command = { version: 1, kind: "loginom-admin-command", id: "baseline", op: "inspect", expectedIdentity: identity,
    desiredHash: hash({}), replyHash: "e".repeat(64), state: "confirmed", at: "2026-10-15T07:00:00Z", settledAt: "2026-10-15T07:00:01Z" }
  const commandFile = path.join(directory, "commands/baseline.json"), target = path.join(directory, "session-inventory-baseline.json")
  const receipt = { version: 2, kind: "admin-session-inventory", identity, sessionIdentityQualified: false,
    sessions: [{ objectId: "managed-1", sessionGuid: null, name: "eval-a:1", createdAt: "2026-10-15T06:59:00Z",
      pendingDisconnect: false, packageCount: 0, activeOperations: null }],
    command: { path: commandFile, sha256: hash(command) }, reply: { id: command.id, sha256: command.replyHash } }
  await writeLeaseReceipt(commandFile, command)
  await writeLeaseReceipt(target, receipt)
  const source = { path: target, sha256: hash(receipt) }
  try {
    expect(await readAdminSessionInventory(fixture.slots, identity, source)).toEqual({ identity, sessionIdentityQualified: false, sessions: receipt.sessions,
      observation: { startedAt: command.at, finishedAt: command.settledAt }, source })
    await writeLeaseReceipt(target, { ...receipt, sessions: [] })
    await expect(readAdminSessionInventory(fixture.slots, identity, source)).rejects.toThrow("SESSION_INVENTORY_UNCONFIRMED")
    await writeLeaseReceipt(target, receipt)
    await writeLeaseReceipt(commandFile, { ...command, state: "unknown" })
    await expect(readAdminSessionInventory(fixture.slots, identity, source)).rejects.toThrow("SESSION_INVENTORY_UNCONFIRMED")
    await writeLeaseReceipt(commandFile, command)
    await expect(readAdminSessionInventory(fixture.slots, { ...identity, serverEpoch: "f".repeat(64) }, source)).rejects.toThrow("SESSION_INVENTORY_UNCONFIRMED")
    const invalid = { ...receipt, sessions: [{ ...receipt.sessions[0]!, packageCount: -1 }] }
    await writeLeaseReceipt(target, invalid)
    await expect(readAdminSessionInventory(fixture.slots, identity, { ...source, sha256: hash(invalid) })).rejects.toThrow("SESSION_INVENTORY_UNCONFIRMED")
  } finally { await rm(root, { recursive: true, force: true }) }
})

async function pipe(program: string, fragmented = false, journalDir?: string) {
  // A protocol peer exercises real OS pipes; it implements no Loginom operation.
  const child = Bun.spawn([process.execPath, "-e", `const {createInterface}=await import("node:readline");for await(const line of createInterface({input:process.stdin})){const request=JSON.parse(line);${program}}`],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH } })
  const events: string[] = []
  const input = fragmented ? child.stdout.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { chunk.forEach(byte => controller.enqueue(Uint8Array.of(byte))) },
  })) : child.stdout
  const output = new WritableStream<Uint8Array>({
    async write(chunk) { events.push(`write-${JSON.parse(new TextDecoder().decode(chunk)).id}`); child.stdin.write(chunk); await child.stdin.flush() }, close() { child.stdin.end() },
  })
  const channel = journalDir ? createJournaledAdminChannel(input, output, journalDir) : createAdminChannel(input, output)
  return { channel, events, async close() { await channel.close(); child.kill(); await child.exited } }
}

test("journaled admin: durable private intent is visible before dispatch and contains hashes only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-admin-journal-"))
  const peer = await pipe(`const row=await Bun.file(${JSON.stringify(root)}+"/"+request.id+".json").json();process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:row.state==="intent"?"confirmed":"not_applied",data:{desiredHash:row.desiredHash}})+"\\n")`, false, root)
  try {
    const payload = { password: "secret-canary-journal" }
    const reply = await peer.channel.request({ v: 1, id: "intent-1", op: "reconcile-user", expectedIdentity: identity, deadline: Date.now() + 2000, payload })
    expect(reply).toMatchObject({ outcome: "confirmed", data: { desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex") } })
    const bytes = await Bun.file(path.join(root, "intent-1.json")).text()
    expect(JSON.parse(bytes)).toMatchObject({ version: 1, kind: "loginom-admin-command", id: "intent-1", op: "reconcile-user", expectedIdentity: identity, state: "confirmed" })
    expect(bytes).not.toContain("secret-canary")
    expect((await stat(path.join(root, "intent-1.json"))).mode & 0o777).toBe(0o600)
  } finally { await peer.close(); await rm(root, { recursive: true, force: true }) }
})

test("journaled admin: an unknown mutation forbids replay while permitting read-back", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-admin-unknown-"))
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:request.id==="lost"?"unknown":"confirmed",data:{}})+"\\n")', false, root)
  try {
    const request = { v: 1 as const, id: "lost", op: "close-session" as const, expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }
    expect((await peer.channel.request(request)).outcome).toBe("unknown")
    expect(await peer.channel.request({ ...request, id: "replay" })).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_RECONCILIATION_REQUIRED" } })
    expect((await peer.channel.request({ ...request, id: "read-back", op: "inspect", deadline: Date.now() + 2000 })).outcome).toBe("confirmed")
    expect((await peer.channel.request({ ...request, id: "read-again", op: "inspect", deadline: Date.now() + 2000 })).outcome).toBe("confirmed")
    expect(await peer.channel.request({ ...request, id: "still-forbidden" })).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_RECONCILIATION_REQUIRED" } })
    expect(peer.events).toEqual(["write-lost", "write-read-back", "write-read-again"])
    expect((await Bun.file(path.join(root, "read-again.json")).json()).op).toBe("inspect")
    expect((await Bun.file(path.join(root, "lost.json")).json()).state).toBe("unknown")
  } finally { await peer.close(); await rm(root, { recursive: true, force: true }) }
})

test("journaled admin: failed result persistence retains intent and forbids another mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-admin-journal-failure-"))
  const peer = await pipe(`const {chmod}=await import("node:fs/promises");await chmod(${JSON.stringify(root)},0o500);process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{}})+"\\n")`, false, root)
  try {
    const request = { v: 1 as const, id: "write-failed", op: "reconcile-user" as const, expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }
    expect(await peer.channel.request(request)).toMatchObject({ outcome: "unknown", data: { code: "ADMIN_JOURNAL_UNAVAILABLE" } })
    expect((await Bun.file(path.join(root, "write-failed.json")).json()).state).toBe("intent")
    expect(await peer.channel.request({ ...request, id: "next" })).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_RECONCILIATION_REQUIRED" } })
    expect(peer.events).toEqual(["write-write-failed"])
  } finally { await chmod(root, 0o700); await peer.close(); await rm(root, { recursive: true, force: true }) }
})

test("journaled admin: reopening cannot bypass a retained durable intent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-admin-retained-"))
  await writeFile(path.join(root, "previous.json"), JSON.stringify({ version: 1, kind: "loginom-admin-command", id: "previous", op: "close-session",
    expectedIdentity: identity, desiredHash: "a".repeat(64), state: "intent", at: new Date().toISOString() }), { mode: 0o600 })
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{}})+"\\n")', false, root)
  try {
    expect(await peer.channel.request({ v: 1, id: "next", op: "reconcile-user", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }))
      .toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_RECONCILIATION_REQUIRED" } })
    expect(peer.events).toEqual([])
    expect((await Bun.file(path.join(root, "previous.json")).json()).state).toBe("intent")
  } finally { await peer.close(); await rm(root, { recursive: true, force: true }) }
})

test("journaled admin: a claimed completion without its durable reply evidence cannot admit mutations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-admin-journal-invalid-"))
  await writeFile(path.join(root, "previous.json"), JSON.stringify({ version: 1, kind: "loginom-admin-command", id: "previous", op: "close-session",
    expectedIdentity: identity, desiredHash: "a".repeat(64), state: "confirmed", at: new Date().toISOString() }), { mode: 0o600 })
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{}})+"\\n")', false, root)
  try {
    await expect(peer.channel.request({ v: 1, id: "next", op: "reconcile-user", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }))
      .rejects.toThrow("ADMIN_JOURNAL_INVALID")
    expect(peer.events).toEqual([])
  } finally { await peer.close(); await rm(root, { recursive: true, force: true }) }
})

test("journaled admin: replaced journal directory is preserved after dispatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-admin-journal-replaced-"))
  const peer = await pipe(`const {rename,mkdir,writeFile}=await import("node:fs/promises");await rename(${JSON.stringify(root)},${JSON.stringify(root + ".old")});await mkdir(${JSON.stringify(root)},{mode:0o700});await writeFile(${JSON.stringify(root)}+"/"+request.id+".json","foreign-preserve",{mode:0o600});process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{}})+"\\n")`, false, root)
  try {
    expect(await peer.channel.request({ v: 1, id: "replaced", op: "reconcile-user", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }))
      .toMatchObject({ outcome: "unknown", data: { code: "ADMIN_JOURNAL_UNAVAILABLE" } })
    expect(await Bun.file(path.join(root, "replaced.json")).text()).toBe("foreign-preserve")
    expect((await Bun.file(path.join(root + ".old", "replaced.json")).json()).state).toBe("intent")
  } finally { await peer.close(); await rm(root, { recursive: true, force: true }); await rm(root + ".old", { recursive: true, force: true }) }
})

test("admin channel: correlates a JSONL reply received through real process pipes", async () => {
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{marker:"pipe"}})+"\\n")')
  try {
    expect(await peer.channel.request({ v: 1, id: "request-1", op: "inspect", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }))
      .toEqual({ v: 1, id: "request-1", outcome: "confirmed", data: { marker: "pipe" } })
  } finally { await peer.close() }
})

test("admin channel: a mismatched response id is unknown and cannot be replayed", async () => {
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:"foreign",outcome:"confirmed",data:{}})+"\\n")')
  try {
    const request = { v: 1 as const, id: "request-1", op: "inspect" as const, expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }
    expect(await peer.channel.request(request)).toEqual({ v: 1, id: request.id, outcome: "unknown", data: { code: "ADMIN_PROTOCOL" } })
    expect((await peer.channel.request({ ...request, id: "request-2" })).data).toEqual({ code: "ADMIN_RECONCILIATION_REQUIRED" })
  } finally { await peer.close() }
})

test("admin channel: rejects generic execution and malformed identity before sending", async () => {
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{}})+"\\n")')
  try {
    const request = { v: 1 as const, id: "request-1", op: "inspect" as const, expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }
    await expect(peer.channel.request({ ...request, op: "evaluate" })).rejects.toThrow("ADMIN_REQUEST_INVALID")
    await expect(peer.channel.request({ ...request, expectedIdentity: { ...identity, containerId: "short" } })).rejects.toThrow("ADMIN_REQUEST_INVALID")
    expect((await peer.channel.request(request)).outcome).toBe("confirmed")
  } finally { await peer.close() }
})

test("admin channel: malformed replies return a bounded diagnostic without raw secrets", async () => {
  const peer = await pipe('process.stdout.write("secret-canary-invalid-json\\n");process.exit(0)')
  try {
    const result = await peer.channel.request({ v: 1, id: "request-1", op: "inspect", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} })
    expect(result).toEqual({ v: 1, id: "request-1", outcome: "unknown", data: { code: "ADMIN_PROTOCOL" } })
    expect(peer.events).toEqual(["write-request-1"])
    expect(JSON.stringify(result)).not.toContain("secret-canary")
  } finally { await peer.close() }
})

test("admin channel: EOF after dispatch keeps the operation outcome unknown", async () => {
  const peer = await pipe('process.exit(0)')
  try {
    expect(await peer.channel.request({ v: 1, id: "request-1", op: "inspect", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }))
      .toEqual({ v: 1, id: "request-1", outcome: "unknown", data: { code: "ADMIN_EOF" } })
  } finally { await peer.close() }
})

test("admin channel: an absolute deadline bounds a silent peer after dispatch", async () => {
  const peer = await pipe('await new Promise(()=>{})')
  try {
    const result = await Promise.race([
      peer.channel.request({ v: 1, id: "request-1", op: "inspect", expectedIdentity: identity, deadline: Date.now() + 50, payload: {} }),
      Bun.sleep(500).then(() => ({ outcome: "test-watchdog" })),
    ])
    expect(result).toEqual({ v: 1, id: "request-1", outcome: "unknown", data: { code: "ADMIN_DEADLINE" } })
    expect(peer.events).toEqual(["write-request-1"])
  } finally { await peer.close() }
})

test("admin channel: one request is in flight until its correlated reply", async () => {
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{}})+"\\n")')
  try {
    await Promise.all(["1", "2"].map(async id => {
      await peer.channel.request({ v: 1, id, op: "inspect", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} })
      peer.events.push(`reply-${id}`)
    }))
    expect(peer.events).toEqual(["write-1", "reply-1", "write-2", "reply-2"])
  } finally { await peer.close() }
})

test("admin channel: oversized input is not sent and oversized reply remains unknown", async () => {
  const peer = await pipe('process.stdout.write("X".repeat(1048577)+"\\n")')
  try {
    const request = { v: 1 as const, id: "request-1", op: "inspect" as const, expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} }
    await expect(peer.channel.request({ ...request, payload: "X".repeat(1048577) })).rejects.toThrow("ADMIN_REQUEST_INVALID")
    expect(peer.events).toEqual([])
    const result = await peer.channel.request(request)
    expect(result).toEqual({ v: 1, id: request.id, outcome: "unknown", data: { code: "ADMIN_FRAME_TOO_LARGE" } })
  } finally { await peer.close() }
})

test("admin channel: UTF-8 and newline framing survive byte fragments from the actual pipe", async () => {
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:"данные☂"})+"\\n")', true)
  try {
    expect((await peer.channel.request({ v: 1, id: "request-1", op: "inspect", expectedIdentity: identity, deadline: Date.now() + 2000, payload: {} })).data).toBe("данные☂")
  } finally { await peer.close() }
})

test("admin channel: an expired queued request is not applied and never reaches the pipe", async () => {
  const peer = await pipe('process.stdout.write(JSON.stringify({v:1,id:request.id,outcome:"confirmed",data:{}})+"\\n")')
  try {
    expect(await peer.channel.request({ v: 1, id: "expired", op: "inspect", expectedIdentity: identity, deadline: Date.now() - 1, payload: {} }))
      .toEqual({ v: 1, id: "expired", outcome: "not_applied", data: { code: "ADMIN_DEADLINE" } })
    expect(peer.events).toEqual([])
  } finally { await peer.close() }
})


test("pool policy receipt refuses an omitted native observer even with matching source hashes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-pool-policy-")), fixture = await parallelFixture(root)
  const directory = path.join(fixture.slots.controller.stateDir, "admin-policy")
  await mkdir(path.join(directory, "commands"), { recursive: true, mode: 0o700 })
  const hash = (value: unknown) => new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
  const data = { identity, packagePoolSize: 0, before: 10, changed: true, observer: "admin",
    collections: [{ name: "admin:1", sessionType: 1, packageCount: 0 }, { name: "pool", sessionType: 3, packageCount: 0 }] }
  const store = async (value: typeof data) => {
    const reply = { v: 1, id: "policy", outcome: "confirmed", data: value }
    const command = { version: 1, kind: "loginom-admin-command", id: reply.id, op: "configure-pool", expectedIdentity: identity,
      desiredHash: hash({}), replyHash: hash(reply), state: "confirmed", at: "2026-10-16T03:00:00Z", settledAt: "2026-10-16T03:00:01Z" }
    const commandFile = path.join(directory, "commands/policy.json"), target = path.join(directory, "pool-policy-policy.json")
    const receipt = { version: 2, kind: "admin-pool-policy", identity, reply, command: { path: commandFile, sha256: hash(command) } }
    await writeLeaseReceipt(commandFile, command)
    await writeLeaseReceipt(target, receipt)
    return { path: target, sha256: hash(receipt) }
  }
  try {
    expect(await readAdminPoolPolicy(fixture.slots, identity, await store(data))).toMatchObject({ packagePoolSize: 0, before: 10, changed: true })
    await expect(readAdminPoolPolicy(fixture.slots, identity, await store({ ...data, collections: [] }))).rejects.toThrow("POOL_POLICY_UNCONFIRMED")
  } finally { await rm(root, { recursive: true, force: true }) }
})
