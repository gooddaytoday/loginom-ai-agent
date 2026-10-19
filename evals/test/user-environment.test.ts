import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireFixtureSlot } from "./helpers/parallel-fixture"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { claimUserOwnership, readUnactivatedUserObservation, readUserActivation, readUserConfiguration, readUserOwnership, readUserPreparation, recordUserConfiguration, stageUserActivation, stageUserPreparation } from "../src/user-environment"
import { parallelFixture } from "./helpers/parallel-fixture"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test("unactivated observation reader binds private native reply and command sources without changing them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-unactivated-read-")), fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const prepared = await stageUserPreparation(fixture.slots, lease, "e".repeat(64))
    const directory = path.join(fixture.slots.controller.stateDir, "admin-codec")
    await mkdir(directory, { mode: 0o700 }); await mkdir(path.join(directory, "commands"), { mode: 0o700 })
    // Data-only source codec fixture; this test makes no Loginom or admin readiness claim.
    const reply = { v: 1, id: "inspect-a", outcome: "confirmed", data: { identity, sessionIdentityQualified: false,
      ownSession: { isAdmin: true }, users: [], rawSessions: [] } }
    const command = { version: 1, kind: "loginom-admin-command", id: reply.id, op: "inspect", expectedIdentity: identity,
      desiredHash: new Bun.CryptoHasher("sha256").update("{}").digest("hex"), state: "confirmed", at: new Date().toISOString(),
      replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex"), settledAt: new Date().toISOString() }
    const commandFile = path.join(directory, "commands", `${reply.id}.json`)
    await writeLeaseReceipt(commandFile, command)
    const receipt = { version: 2, kind: "unactivated-user-observation", identity, username: lease.slot.username, account: null,
      serverSessions: "absent", slotId: lease.slot.id, leaseToken: lease.token, preparationNonce: prepared.nonce, ownership: null,
      observation: reply, command: { path: commandFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(command)).digest("hex") } }
    const target = path.join(directory, `unactivated-${lease.slot.id}-${reply.id}.json`)
    await writeLeaseReceipt(target, receipt)
    const source = { path: target, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex") }
    const bytes = await Bun.file(target).text(), commandBytes = await Bun.file(commandFile).text()
    expect(await readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, source))
      .toEqual({ identity, username: lease.slot.username, account: null, serverSessions: "absent", source })
    expect(await Bun.file(target).text()).toBe(bytes)
    expect(await Bun.file(commandFile).text()).toBe(commandBytes)
    await chmod(directory, 0o755)
    await expect(readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, source)).rejects.toThrow("UNACTIVATED_SOURCE_UNCONFIRMED")
    await chmod(directory, 0o700)
    await writeLeaseReceipt(commandFile, { ...command, settledAt: new Date(Date.parse(command.settledAt) + 1).toISOString() })
    await expect(readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, source)).rejects.toThrow("UNACTIVATED_SOURCE_UNCONFIRMED")
    await writeLeaseReceipt(commandFile, command)
    for (const data of [
      { ...reply.data, rawSessions: [{ name: lease.slot.username.toUpperCase() + ":2" }] },
      { ...reply.data, ownSession: { isAdmin: false } },
      { ...reply.data, users: [{ objectId: "foreign-user", name: lease.slot.username, userKind: 0, blocked: true }] },
    ]) {
      const observation = { ...reply, data }
      const changedCommand = { ...command, replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(observation)).digest("hex") }
      await writeLeaseReceipt(commandFile, changedCommand)
      const changedReceipt = { ...receipt, observation, command: { path: commandFile,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(changedCommand)).digest("hex") } }
      await writeLeaseReceipt(target, changedReceipt)
      await expect(readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, { path: target,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(changedReceipt)).digest("hex") }))
        .rejects.toThrow("UNACTIVATED_SOURCE_UNCONFIRMED")
    }
    const unknown = { ...command, state: "unknown" }
    await writeLeaseReceipt(commandFile, unknown)
    const unresolved = { ...receipt, command: { path: commandFile,
      sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(unknown)).digest("hex") } }
    await writeLeaseReceipt(target, unresolved)
    await expect(readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, { path: target,
      sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(unresolved)).digest("hex") }))
      .rejects.toThrow("UNACTIVATED_SOURCE_UNCONFIRMED")
    await writeLeaseReceipt(commandFile, command)
    await writeLeaseReceipt(target, { ...receipt, leaseToken: "foreign" })
    const changed = { path: target, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(await readLeaseReceipt(target))).digest("hex") }
    await expect(readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, changed)).rejects.toThrow("UNACTIVATED_SOURCE_UNCONFIRMED")
    await writeLeaseReceipt(target, receipt)
    await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "activation-a.json"), { kind: "negative-canary" })
    await expect(readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, source)).rejects.toThrow("USER_IDLE_UNCONFIRMED")
    expect(await Bun.file(target).text()).toBe(bytes)
    await rm(path.join(fixture.slots.controller.stateDir, "activation-a.json"))
    await lease.close()
    await expect(readUnactivatedUserObservation(fixture.slots, lease, prepared.secretFile, source)).rejects.toThrow("LEASE_NOT_HELD")
    expect(await Bun.file(target).text()).toBe(bytes)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("user ownership publishes a private generation-bound claim from a confirmed creation journal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-user-claim-"))
  const fixture = await parallelFixture(root)
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
    expect(await readUserConfiguration(fixture.slots, lease, prepared.secretFile)).toBeUndefined()
    const configuredReply = { v: 1 as const, id: "configure-a", outcome: "confirmed" as const, data: { authModeChanged: true, passwordChanged: true,
      secretHash: prepared.secretHash, user: { objectId: claimed.objectId, name: "eval-a", userKind: 0, blocked: true, authMode: 1,
        isAdmin: false, isDesigner: true, isViewer: false, useGlobalFileStorage: false, schedulerFullAccess: false, allowPublish: false } } }
    const configurePayload = { ...payload, phase: "configure", owned: { objectId: claimed.objectId, name: claimed.username,
      userKind: 0, preparationNonce: prepared.nonce, secretHash: null } }
    const configureSource = path.join(fixture.slots.controller.stateDir, "configure-a.json")
    await writeLeaseReceipt(configureSource, { version: 1, kind: "loginom-admin-command", id: configuredReply.id, op: "reconcile-user", expectedIdentity: identity,
      desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(configurePayload)).digest("hex"), state: "confirmed", at: new Date().toISOString(),
      replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(configuredReply)).digest("hex"), settledAt: new Date().toISOString() })
    const configured = await recordUserConfiguration(fixture.slots, lease, prepared.secretFile, configureSource, configurePayload, configuredReply)
    expect(configured).toMatchObject({ kind: "owned-user-configuration", slotId: "a", preparationNonce: prepared.nonce, identity,
      userKey: claimed.userKey, objectId: claimed.objectId, secretHash: prepared.secretHash })
    expect(await readUserConfiguration(fixture.slots, lease, prepared.secretFile)).toEqual(configured)
    const originalConfigure = await Bun.file(configureSource).json()
    await writeLeaseReceipt(configureSource, { ...originalConfigure, settledAt: new Date(Date.parse(originalConfigure.settledAt) + 1).toISOString() })
    await expect(readUserConfiguration(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("USER_CONFIGURATION_UNCONFIRMED")
    await writeLeaseReceipt(configureSource, originalConfigure)
    expect((await stat(path.join(fixture.slots.controller.stateDir, "configure-a.receipt.json"))).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(configured)).not.toContain((await Bun.file(prepared.secretFile).json()).password)
    const skippedPassword = { ...configuredReply, id: "configure-no-write", data: { ...configuredReply.data, authModeChanged: false, passwordChanged: false } }
    const skippedSource = path.join(fixture.slots.controller.stateDir, `${skippedPassword.id}.json`)
    await writeLeaseReceipt(skippedSource, { ...await Bun.file(configureSource).json(), id: skippedPassword.id,
      replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(skippedPassword)).digest("hex") })
    await expect(recordUserConfiguration(fixture.slots, lease, prepared.secretFile, skippedSource, configurePayload, skippedPassword))
      .rejects.toThrow("USER_CONFIGURATION_UNCONFIRMED")
    expect(await readUserConfiguration(fixture.slots, lease, prepared.secretFile)).toEqual(configured)
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
    await expect(recordUserConfiguration(fixture.slots, lease, prepared.secretFile, configureSource, configurePayload, configuredReply))
      .rejects.toThrow("USER_IDLE_UNCONFIRMED")
    await writeLeaseReceipt(activationFile, { ...activation, objectId: "foreign-user" })
    const foreignActivation = await Bun.file(activationFile).text()
    await expect(readUserActivation(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("USER_ACTIVATION_CONFLICT")
    await expect(stageUserActivation(fixture.slots, lease, prepared.secretFile)).rejects.toThrow("USER_ACTIVATION_CONFLICT")
    expect(await Bun.file(activationFile).text()).toBe(foreignActivation)
    await writeLeaseReceipt(activationFile, activation)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
  const lease = await acquireFixtureSlot(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
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
