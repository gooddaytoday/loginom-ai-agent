import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireSlotLease } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { claimUserOwnership, readServerSession, readUserActivation, readUserOwnership, readUserPreparation, recordServerSession, recordServerSessionClosed, stageUserActivation, stageUserPreparation } from "../src/user-environment"
import { parallelFixture } from "./helpers/parallel-fixture"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test("user ownership publishes a private generation-bound claim from a confirmed creation journal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-claim-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const prepared = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const reply = { v: 1 as const, id: "create-a", outcome: "confirmed" as const,
      data: { created: true, user: { objectId: "native-user-41", name: "eval-a", userKind: 0, blocked: true } } }
    const payload = { phase: "blocked", slot: lease.slot, secretFile: prepared.secretFile, preparationNonce: prepared.nonce,
      desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: null }
    const source = path.join(fixture.slots.controller.stateDir, "create-a.json")
    // Data-only evidence codec fixture; no Loginom operation is simulated.
    await writeLeaseReceipt(source, { version: 1, kind: "loginom-admin-command", id: reply.id, op: "reconcile-user", expectedIdentity: identity,
      desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex"), state: "confirmed", at: new Date().toISOString(),
      replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex"), settledAt: new Date().toISOString() })
    const renamed = path.join(fixture.slots.controller.stateDir, "renamed.json")
    await writeLeaseReceipt(renamed, await Bun.file(source).json())
    await expect(claimUserOwnership(fixture.slots, lease, prepared.secretFile, renamed, reply)).rejects.toThrow("USER_OWNERSHIP_CONFLICT")
    expect(await Bun.file(path.join(fixture.slots.controller.stateDir, "user-a.json")).exists()).toBe(false)
    const claimed = await claimUserOwnership(fixture.slots, lease, prepared.secretFile, source, reply)
    expect(claimed).toMatchObject({ version: 2, kind: "owned-loginom-user", preparationNonce: prepared.nonce, slotId: "a",
      username: "eval-a", userKind: 0, objectId: "native-user-41", identity, everActivated: false })
    expect(claimed.userKey).toMatch(/^[0-9a-f]{64}$/)
    expect(await readUserOwnership(fixture.slots, lease, prepared.secretFile)).toEqual(claimed)
    expect((await stat(path.join(fixture.slots.controller.stateDir, "user-a.json"))).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(claimed)).not.toContain((await Bun.file(prepared.secretFile).json()).password)
    const target = path.join(fixture.slots.controller.stateDir, "user-a.json")
    const before = await stat(target)
    expect(await claimUserOwnership(fixture.slots, lease, prepared.secretFile, source, reply)).toEqual(claimed)
    expect((await stat(target)).ino).toBe(before.ino)
    const activation = await stageUserActivation(fixture.slots, lease, prepared.secretFile)
    expect(activation).toMatchObject({ kind: "user-activation-intent", state: "planned", slotId: "a", username: "eval-a",
      preparationNonce: prepared.nonce, userKey: claimed.userKey, objectId: claimed.objectId, identity })
    const activationFile = path.join(fixture.slots.controller.stateDir, "activation-a.json")
    const activationBefore = await stat(activationFile)
    const activationBytes = await Bun.file(activationFile).text()
    expect(activationBefore.mode & 0o777).toBe(0o600)
    expect(await stageUserActivation(fixture.slots, lease, prepared.secretFile)).toEqual(activation)
    expect(await Bun.file(activationFile).text()).toBe(activationBytes)
    expect((await stat(activationFile)).ino).toBe(activationBefore.ino)
    expect(JSON.stringify(activation)).not.toContain((await Bun.file(prepared.secretFile).json()).password)
    expect(await readUserActivation(fixture.slots, lease, prepared.secretFile)).toEqual(activation)
    expect((await readUserOwnership(fixture.slots, lease, prepared.secretFile)).everActivated).toBe(true)
    await writeLeaseReceipt(activationFile, { ...activation, objectId: "foreign-user" })
    const foreignActivation = await Bun.file(activationFile).text()
    await expect(readUserActivation(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("USER_ACTIVATION_CONFLICT")
    await expect(stageUserActivation(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("USER_ACTIVATION_CONFLICT")
    expect(await Bun.file(activationFile).text()).toBe(foreignActivation)
    await writeLeaseReceipt(activationFile, activation)
    const row = { objectId: "managed-session-73", name: "eval-a:2", createdAt: "2026-10-15T00:00:00.000Z", pendingDisconnect: false, packageCount: 0 }
    const binding = { remoteKey: row.objectId, userKey: claimed.userKey, username: "eval-a", serverEpoch: identity.serverEpoch,
      name: row.name, createdAt: row.createdAt }
    const observed = { v: 1 as const, id: "probe-a", outcome: "confirmed" as const, data: {
      ownSession: { guid: "11111111-1111-1111-1111-111111111111", objectId: "session-proxy-73", userObjectId: claimed.objectId,
        username: "eval-a", isAdmin: false, isDesigner: true }, baseline: [], opened: [row], withPackage: [{ ...row, packageCount: 1 }],
      afterPackage: [row], sessionIdentityQualified: false, afterDisconnect: [{ ...row, pendingDisconnect: true }], binding } }
    const probePayload = { phase: "session-probe", slot: lease.slot, secretFile: prepared.secretFile, preparationNonce: prepared.nonce,
      desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: { objectId: claimed.objectId, name: "eval-a", userKind: 0,
        preparationNonce: prepared.nonce, secretHash: prepared.secretHash }, expectedPolicy: [] }
    const probeSource = path.join(fixture.slots.controller.stateDir, "probe-a.json")
    await writeLeaseReceipt(probeSource, { version: 1, kind: "loginom-admin-command", id: observed.id, op: "reconcile-user", expectedIdentity: identity,
      desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(probePayload)).digest("hex"), state: "confirmed", at: new Date().toISOString(),
      replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(observed)).digest("hex"), settledAt: new Date().toISOString() })
    const session = await recordServerSession(fixture.slots, lease, prepared.secretFile, probeSource, probePayload, observed)
    expect(session).toMatchObject({ kind: "owned-server-session", slotId: "a", identity, preparationNonce: prepared.nonce,
      binding, state: "observed", sessionGuid: observed.data.ownSession.guid })
    const sessionFile = path.join(fixture.slots.controller.stateDir, "session-probe-a.json")
    expect((await stat(sessionFile)).mode & 0o777).toBe(0o600)
    expect(await recordServerSession(fixture.slots, lease, prepared.secretFile, probeSource, probePayload, observed)).toEqual(session)
    expect(await readServerSession(fixture.slots, lease, prepared.secretFile, observed.id)).toEqual(session)
    const originalProbe = await Bun.file(probeSource).json()
    await writeLeaseReceipt(probeSource, { ...originalProbe, settledAt: new Date(Date.parse(originalProbe.settledAt) + 1).toISOString() })
    await expect(readServerSession(fixture.slots, lease, prepared.secretFile, observed.id)).rejects.toThrow("SESSION_SOURCE_UNCONFIRMED")
    await writeLeaseReceipt(probeSource, originalProbe)
    const leaseManifest = await Bun.file(lease.receipt).json()
    await writeLeaseReceipt(lease.receipt, { ...leaseManifest, token: "foreign-lease" })
    await expect(readServerSession(fixture.slots, lease, prepared.secretFile, observed.id)).rejects.toThrow("LEASE_NOT_HELD")
    await writeLeaseReceipt(lease.receipt, leaseManifest)
    const closeReply = { v: 1 as const, id: "close-a", outcome: "confirmed" as const, data: { closed: true, disposition: "rpc_closed" } }
    const closePayload = { proofId: observed.id, session: binding }
    const closeSource = path.join(fixture.slots.controller.stateDir, "close-a.json")
    await writeLeaseReceipt(closeSource, { version: 1, kind: "loginom-admin-command", id: closeReply.id, op: "close-session", expectedIdentity: identity,
      desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(closePayload)).digest("hex"), state: "confirmed", at: new Date().toISOString(),
      replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(closeReply)).digest("hex"), settledAt: new Date().toISOString() })
    expect(await recordServerSessionClosed(fixture.slots, lease, prepared.secretFile, observed.id, closeSource, closeReply)).toMatchObject({ state: "closed", binding })
    expect(await readServerSession(fixture.slots, lease, prepared.secretFile, observed.id)).toMatchObject({ state: "closed", binding })
    const closureFile = path.join(fixture.slots.controller.stateDir, "session-probe-a.closed.json")
    const originalClosure = await Bun.file(closureFile).json()
    await Bun.write(closureFile, "null")
    await expect(readServerSession(fixture.slots, lease, prepared.secretFile, observed.id)).rejects.toThrow("SESSION_CLOSE_UNCONFIRMED")
    expect(await Bun.file(closureFile).text()).toBe("null")
    await writeLeaseReceipt(closureFile, { valueOf: false })
    await expect(readServerSession(fixture.slots, lease, prepared.secretFile, observed.id)).rejects.toThrow()
    await writeLeaseReceipt(closureFile, originalClosure)
    const originalCloseSource = await Bun.file(closeSource).json()
    await writeLeaseReceipt(closeSource, { ...originalCloseSource, settledAt: new Date(Date.parse(originalCloseSource.settledAt) + 1).toISOString() })
    await expect(readServerSession(fixture.slots, lease, prepared.secretFile, observed.id)).rejects.toThrow("SESSION_CLOSE_UNCONFIRMED")
    await writeLeaseReceipt(closeSource, originalCloseSource)
    const originalSource = await Bun.file(source).json()
    await writeLeaseReceipt(source, { ...originalSource, settledAt: new Date(Date.parse(originalSource.settledAt) + 1).toISOString() })
    await expect(readUserOwnership(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("USER_OWNERSHIP_CONFLICT")
    await writeLeaseReceipt(source, originalSource)
    await writeLeaseReceipt(target, { ...claimed, preparationNonce: crypto.randomUUID() })
    const foreign = await Bun.file(target).text()
    await expect(claimUserOwnership(fixture.slots, lease, prepared.secretFile, source, reply)).rejects.toThrow("USER_OWNERSHIP_CONFLICT")
    expect(await Bun.file(target).text()).toBe(foreign)
    await lease.close()
    await expect(readUserOwnership(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("LEASE_NOT_HELD")
    await expect(readUserActivation(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("LEASE_NOT_HELD")
    await expect(stageUserActivation(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("LEASE_NOT_HELD")
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation reader rejects a malformed durable nonce without changing the files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const staged = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const journal = path.join(fixture.slots.controller.stateDir, "prepare-a.json")
    await writeLeaseReceipt(journal, { ...staged, nonce: "f".repeat(36) })
    const before = await Bun.file(journal).text()
    const secret = await Bun.file(staged.secretFile).text()
    await expect(readUserPreparation(fixture.slots, lease, staged.secretFile)).rejects.toThrow("USER_PREPARATION_CONFLICT")
    expect(await Bun.file(journal).text()).toBe(before)
    expect(await Bun.file(staged.secretFile).text()).toBe(secret)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation durably stages one nonce and private credential before use", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const first = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const secret = await Bun.file(first.secretFile).text()
    const before = await stat(first.secretFile)
    expect(first).toMatchObject({ state: "staged", slotId: "a", username: "eval-a", desiredHash: "e".repeat(64) })
    expect(first.nonce).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.stringify(first)).not.toContain(JSON.parse(secret).password)
    expect(before.mode & 0o777).toBe(0o600)
    expect(before.nlink).toBe(1)
    const second = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    expect(second).toEqual(first)
    expect(await Bun.file(second.secretFile).text()).toBe(secret)
    expect((await stat(second.secretFile)).ino).toBe(before.ino)
    expect(await readUserPreparation(fixture.slots, lease, first.secretFile)).toEqual(first)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation refuses a closed lease before creating an intent or secret", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    await lease.close()
    const before = await readdir(fixture.slots.controller.stateDir)
    await expect(stageUserPreparation(fixture.slots, lease, "e".repeat(64))).rejects.toThrow("LEASE_NOT_HELD")
    await expect(readUserPreparation(fixture.slots, lease, path.join(fixture.slots.controller.stateDir, "prepare-a.secret.json"))).rejects.toThrow("LEASE_NOT_HELD")
    expect(await readdir(fixture.slots.controller.stateDir)).toEqual(before)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation preserves its existing intent and secret when desired state changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const first = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const journal = path.join(fixture.slots.controller.stateDir, "prepare-a.json")
    const before = await Bun.file(journal).text()
    const secret = await Bun.file(first.secretFile).text()
    const info = await stat(first.secretFile)
    await expect(stageUserPreparation(fixture.slots, lease, "f".repeat(64))).rejects.toThrow("USER_PREPARATION_CONFLICT")
    expect(await Bun.file(journal).text()).toBe(before)
    expect(await Bun.file(first.secretFile).text()).toBe(secret)
    expect((await stat(first.secretFile)).ino).toBe(info.ino)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation refuses an existing secret without its durable intent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const secretFile = path.join(fixture.slots.controller.stateDir, "prepare-a.secret.json")
    await writeLeaseReceipt(secretFile, { username: "eval-a", password: "foreign-credential" })
    const before = await Bun.file(secretFile).text()
    const files = await readdir(fixture.slots.controller.stateDir)
    await expect(stageUserPreparation(fixture.slots, lease, "e".repeat(64))).rejects.toThrow("USER_PREPARATION_CONFLICT")
    expect(await Bun.file(secretFile).text()).toBe(before)
    expect(await readdir(fixture.slots.controller.stateDir)).toEqual(files)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation resumes a planned intent using the already saved credential", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const journal = path.join(fixture.slots.controller.stateDir, "prepare-a.json")
    const secretFile = path.join(fixture.slots.controller.stateDir, "prepare-a.secret.json")
    const nonce = crypto.randomUUID()
    await writeLeaseReceipt(journal, { version: 2, kind: "user-preparation", nonce, slotId: "a", username: "eval-a",
      endpoint: fixture.slots.server.url, identity, desiredHash: "e".repeat(64), secretFile, state: "planned", secretHash: null })
    await writeLeaseReceipt(secretFile, { username: "eval-a", password: "persisted-before-crash" })
    const before = await Bun.file(secretFile).text()
    const info = await stat(secretFile)
    const resumed = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    expect(resumed.nonce).toBe(nonce)
    expect(resumed.state).toBe("staged")
    expect(await Bun.file(secretFile).text()).toBe(before)
    expect((await stat(secretFile)).ino).toBe(info.ino)
    expect(await Bun.file(journal).json()).toEqual(resumed)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation returns only safe metadata from an existing private journal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const journal = path.join(fixture.slots.controller.stateDir, "prepare-a.json")
    await writeLeaseReceipt(journal, { ...await Bun.file(journal).json(), privateDiagnostic: "credential-canary" })
    const staged = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    expect(JSON.stringify(staged)).not.toContain("credential-canary")
    expect(staged.state).toBe("staged")
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation does not regenerate a missing staged credential", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const staged = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const journal = path.join(fixture.slots.controller.stateDir, "prepare-a.json")
    const before = await Bun.file(journal).text()
    await rm(staged.secretFile)
    await expect(stageUserPreparation(fixture.slots, lease, "e".repeat(64))).rejects.toThrow("USER_PREPARATION_UNCONFIRMED")
    expect(await Bun.file(journal).text()).toBe(before)
    expect(await Bun.file(staged.secretFile).exists()).toBe(false)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user preparation refuses credential drift without replacing either durable file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-prepare-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const staged = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const journal = path.join(fixture.slots.controller.stateDir, "prepare-a.json")
    const before = await Bun.file(journal).text()
    await writeLeaseReceipt(staged.secretFile, { username: "eval-a", password: "changed-after-staging" })
    const altered = await Bun.file(staged.secretFile).text()
    await expect(stageUserPreparation(fixture.slots, lease, "e".repeat(64))).rejects.toThrow("USER_PREPARATION_CONFLICT")
    expect(await Bun.file(journal).text()).toBe(before)
    expect(await Bun.file(staged.secretFile).text()).toBe(altered)
    await expect(readUserPreparation(fixture.slots, lease, staged.secretFile)).rejects.toThrow("USER_PREPARATION_CONFLICT")
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})
