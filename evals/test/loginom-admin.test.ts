import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createAdminChannel, createJournaledAdminChannel, selectOwnedSessions } from "../src/loginom-admin"

const owned = { remoteKey: "session-41", userKey: "user-a", username: "eval-a", serverEpoch: "epoch-1", pendingDisconnect: true, activeOperations: 0 }
const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

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
    expect((await peer.channel.request({ ...request, id: "read-back", op: "inspect" })).outcome).toBe("confirmed")
    expect(peer.events).toEqual(["write-lost", "write-read-back"])
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

test("owned sessions: selection returns a fresh observed row for the recorded identity", () => {
  const observed = { ...owned, pendingDisconnect: false, activeOperations: 1 }
  expect(selectOwnedSessions([observed], [owned])).toEqual([observed])
  expect(selectOwnedSessions([observed], [])).toEqual([])
})

test("owned sessions: equal remote keys do not authorize a changed user or epoch", () => {
  expect(() => selectOwnedSessions([{ ...owned, userKey: "user-b" }], [owned])).toThrow("SESSION_IDENTITY_CHANGED")
  expect(() => selectOwnedSessions([{ ...owned, username: "eval-b" }], [owned])).toThrow("SESSION_IDENTITY_CHANGED")
  expect(() => selectOwnedSessions([{ ...owned, serverEpoch: "epoch-2" }], [owned])).toThrow("SERVER_EPOCH_CHANGED")
})

test("owned sessions: duplicate remote identities are ambiguous in observations and claims", () => {
  expect(() => selectOwnedSessions([owned, owned], [owned])).toThrow("SESSION_IDENTITY_AMBIGUOUS")
  expect(() => selectOwnedSessions([owned], [owned, owned])).toThrow("SESSION_IDENTITY_AMBIGUOUS")
})

test("owned sessions: a username alone cannot substitute a recorded remote identity", () => {
  expect(selectOwnedSessions([{ ...owned, remoteKey: "session-42" }], [owned])).toEqual([])
  expect(selectOwnedSessions([], [owned])).toEqual([])
})
