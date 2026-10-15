import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { acquireSlotLease, parseSlots } from "../../src/slots"
import { acquireResourceLease, writeLeaseReceipt } from "../../src/lease"
import { createPair, destroyPair } from "../../src/parallel-pair"
import { claimUserOwnership, stageUserPreparation } from "../../src/user-environment"
import { parallelFixture } from "./parallel-fixture"

// Actual Docker filesystem, data-only protected account authority; no Loginom login.
export async function storageCodecFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "evals-user-storage-"))
  const fixture = await parallelFixture(root)
  const name = `evals-storage-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url } }, 2)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: fixture.lockRoot }
  const pair = await createPair(file, options)
  const journal = path.join(file.controller.stateDir, "run-journal.json")
  await writeLeaseReceipt(journal, { commandId: "storage-codec-control" })
  const server = await acquireResourceLease({ key: `server:${pair.identity.containerId}`, identity: pair.identity, journal, commandId: "storage-codec-control", lockRoot: fixture.lockRoot })
  const lease = await acquireSlotLease(file, file.slots[0]!, pair.identity, fixture.lockRoot)
  const prepared = await stageUserPreparation(file, lease, "e".repeat(64))
  // Data-only protected ownership codec. No native user or session is simulated.
  const reply = { v: 1 as const, id: "storage-create", outcome: "confirmed" as const,
    data: { created: true, user: { objectId: "storage-codec-user", name: lease.slot.username, userKind: 0, blocked: true } } }
  const payload = { phase: "blocked", slot: lease.slot, secretFile: prepared.secretFile, preparationNonce: prepared.nonce,
    desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: null }
  const command = path.join(file.controller.stateDir, `${reply.id}.json`)
  await writeLeaseReceipt(command, { version: 1, kind: "loginom-admin-command", id: reply.id, op: "reconcile-user", expectedIdentity: pair.identity,
    desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex"), state: "confirmed", at: new Date().toISOString(),
    replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex"), settledAt: new Date().toISOString() })
  await claimUserOwnership(file, lease, prepared.secretFile, command, reply)
  return { root, file, pair, lease, server, prepared, async dispose() {
    // Only codec authority is exercised here; the pair has no admitted Loginom actors.
    // These receipts do not qualify production server/session/backup cleanup.
    const proof = path.join(root, "codec-cleanup.json")
    await writeLeaseReceipt(proof, { status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: pair.identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true })
    await lease.release(proof)
    const released = path.join(root, "codec-server-release.json")
    await writeLeaseReceipt(released, { version: 2, status: "confirmed", key: server.reservation.key, token: server.reservation.token, revision: server.reservation.revision, serverEpoch: pair.identity.serverEpoch })
    await server.release(released)
    await destroyPair(file, options)
    await rm(root, { recursive: true, force: true })
  } }
}
