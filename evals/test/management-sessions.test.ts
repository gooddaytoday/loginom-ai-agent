import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireEnvironmentLeases } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { collectManagementSessions, collectSlotSessions } from "../src/management-sessions"
import { sealManagementProcessInventory } from "../src/management-process-evidence"
import { parallelFixture } from "./helpers/parallel-fixture"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test.each([["finalizing", "EVAL-A:9"], ["finalizing", "eval-a"], ["finalizing", "eval-a:9"], ["cli_admitted", "EVAL-A:9"]])("management accounting at %s refuses an unowned same-user row %s", async (phase, name) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-accounting-")), fixture = await parallelFixture(root)
  const journal = path.join(fixture.slots.controller.stateDir, "command.json"), inventoryFile = path.join(fixture.slots.controller.stateDir, "management.json")
  const command = { version: 2, kind: "unactivated-preparation", commandId: "accounting", identity, phase, slotIds: ["a"] }
  await writeLeaseReceipt(journal, command)
  const environment = await acquireEnvironmentLeases(fixture.slots, 1, identity, journal, fixture.lockRoot), lease = environment.slots[0]!
  try {
    // Data-only empty producer/native snapshot codecs; no Loginom session or ownership is simulated.
    const inventory = { version: 2, kind: "management-processes", commandId: command.commandId, journal, identity,
      leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] }
    await writeLeaseReceipt(inventoryFile, inventory)
    await writeLeaseReceipt(journal, { ...command, ...(phase === "finalizing"
      ? { managementSources: [{ path: inventoryFile, sha256: hash(inventory) }] }
      : { managementInventories: [{ file: inventoryFile, slotId: lease.slot.id, leaseToken: lease.token, profileDir: lease.slot.profileDir }] }) })
    const directory = path.join(fixture.slots.controller.stateDir, "admin-codec")
    await mkdir(path.join(directory, "commands"), { recursive: true, mode: 0o700 })
    const inspected = { version: 1, kind: "loginom-admin-command", id: "unknown", op: "inspect", expectedIdentity: identity,
      desiredHash: hash({}), replyHash: "e".repeat(64), state: "confirmed", at: new Date().toISOString(), settledAt: new Date().toISOString() }
    const commandFile = path.join(directory, "commands/unknown.json"), target = path.join(directory, "session-inventory-unknown.json")
    await writeLeaseReceipt(commandFile, inspected)
    const snapshot = { version: 2, kind: "admin-session-inventory", identity, sessionIdentityQualified: false,
      sessions: [{ objectId: "unowned", sessionGuid: null, name, createdAt: "2026-10-15T09:00:00Z",
        pendingDisconnect: true, packageCount: 0, activeOperations: null }],
      command: { path: commandFile, sha256: hash(inspected) }, reply: { id: inspected.id, sha256: inspected.replyHash } }
    await writeLeaseReceipt(target, snapshot)
    if (phase === "cli_admitted") {
      await expect(collectManagementSessions(fixture.slots, lease, path.join(root, "unused-secret"), inventoryFile,
        { path: target, sha256: hash(snapshot) })).rejects.toThrow("MANAGEMENT_SESSION_UNCONFIRMED")
      await sealManagementProcessInventory(fixture.slots, environment.server, lease, inventoryFile)
    }
    await expect(collectManagementSessions(fixture.slots, lease, path.join(root, "unused-secret"), inventoryFile,
      { path: target, sha256: hash(snapshot) })).rejects.toThrow("MANAGEMENT_SESSION_UNKNOWN")
    const peer = { ...snapshot, sessions: [{ ...snapshot.sessions[0]!, name: "eval-b:9" }] }
    const agents = path.join(fixture.slots.controller.stateDir, "agents.json")
    await writeLeaseReceipt(agents, { version: 2, kind: "eval-agent-processes", commandId: command.commandId, slotId: lease.slot.id,
      producerPid: process.pid, state: "sealed", processes: [] })
    const inputs = { management: inventoryFile, agents: { file: agents, observations: [] } }
    await expect(collectSlotSessions(fixture.slots, lease, path.join(root, "unused-secret"), inputs,
      { path: target, sha256: hash(snapshot) })).rejects.toThrow("AGENT_SESSION_INVENTORY_UNCONFIRMED")
    await writeLeaseReceipt(journal, { ...await Bun.file(journal).json(), agentInventories: [
      { file: agents, slotId: lease.slot.id, leaseToken: lease.token, profileDir: lease.slot.profileDir }] })
    await expect(collectSlotSessions(fixture.slots, lease, path.join(root, "unused-secret"), inputs,
      { path: target, sha256: hash(snapshot) })).rejects.toThrow("SLOT_SESSION_UNKNOWN")
    await writeLeaseReceipt(target, peer)
    expect((await collectManagementSessions(fixture.slots, lease, path.join(root, "unused-secret"), inventoryFile,
      { path: target, sha256: hash(peer) })).sessions).toEqual([])
    expect(await collectSlotSessions(fixture.slots, lease, path.join(root, "unused-secret"), inputs,
      { path: target, sha256: hash(peer) })).toMatchObject({ management: [], agents: [] })
  } finally {
    await Promise.all([environment.server.close(), lease.close()])
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
