import path from "node:path"
import { readdir } from "node:fs/promises"
import { openLoginomAdmin } from "./loginom-admin"
import { inspectUserStorage, readServerIdentity, verifyParallelPair } from "./parallel-pair"
import { assertProfileClean } from "./profile"
import { assertSessionBackupEmpty, requireServerFilesClosed } from "./slot-storage"
import { serverFileObservation } from "./server-files"
import { readStartupCleanup } from "./startup-reconciliation"
import { readUserOwnership, readUserPreparation } from "./user-environment"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt, readResourceReservation } from "./lease"
import { reopenEnvironmentLeases, type ServerIdentity, type SlotFile } from "./slots"

// Caller holds the campaign controller lock and has observed inactive batch units.
export async function cancelUnusedVerification(file: SlotFile, scope: { stateRoot: string; campaignId: string }, binary: string, lockRoot = globalLockRoot) {
  const directory = path.join(scope.stateRoot, scope.campaignId)
  const journal = await readLeaseReceipt(path.join(directory, "journal.json")) as { campaignId: string; final: string; published: boolean; verificationDir: string }
  const owner = await readLeaseReceipt(path.join(scope.stateRoot, "owner.json")) as { campaignId: string }
  if (journal.campaignId !== scope.campaignId || owner.campaignId !== scope.campaignId || journal.final !== "partial" || journal.published !== true)
    throw new EvalFailure("TERMINAL_CAMPAIGN_REQUIRED", 2)
  if (typeof journal.verificationDir !== "string" || path.dirname(journal.verificationDir) !== path.join(directory, "verification"))
    throw new EvalFailure("TERMINAL_VERIFICATION_UNCONFIRMED", 2)
  const verification = await readLeaseReceipt(path.join(journal.verificationDir, "receipt.json")) as {
    version: number; commandId: string; identity: ServerIdentity; journal: string; receipt: string; status: string; ready: boolean; reason: string
  }
  if (verification.version !== 2 || !/^[a-zA-Z0-9-]+$/.test(verification.commandId) || verification.status !== "quarantined" ||
    verification.ready !== false || verification.reason !== "USER_PREPARATION_CONFLICT" ||
    verification.journal !== path.join(file.controller.stateDir, `verify-command-${verification.commandId}.json`) ||
    verification.receipt !== path.join(file.controller.stateDir, `verification-${verification.commandId}.json`) ||
    JSON.stringify(await readLeaseReceipt(verification.receipt)) !== JSON.stringify(verification))
    throw new EvalFailure("TERMINAL_VERIFICATION_UNCONFIRMED", 2)
  const environment = await reopenEnvironmentLeases(file, verification.identity, lockRoot)
  if (!environment) return readTerminalRelease(file, verification.identity, verification.commandId, scope.campaignId, lockRoot)
  try {
    const command = await readLeaseReceipt(verification.journal)
    if (JSON.stringify(command) !== JSON.stringify({ version: 2, kind: "unactivated-preparation", commandId: verification.commandId,
      identity: verification.identity, slotIds: [file.slots[0]!.id], phase: "unactivated" }) || environment.server.reservation.commandId !== verification.commandId)
      throw new EvalFailure("TERMINAL_VERIFY_USED", 2)
    const reservation = environment.server.reservation, identity = verification.identity
    if (!environment.slots.length) {
      const proof = await readTerminalRelease(file, identity, reservation.commandId, scope.campaignId, lockRoot, true)
      await environment.server.release(proof.serverProof)
      return readTerminalRelease(file, identity, reservation.commandId, scope.campaignId, lockRoot)
    }
    const lease = environment.slots[0]
    if (environment.slots.length !== 1 || !lease || lease.slot.id !== file.slots[0]!.id)
      throw new EvalFailure("TERMINAL_VERIFICATION_UNCONFIRMED", 2)
    const names = await readdir(file.controller.stateDir)
    if (names.includes(`management-${verification.commandId}-${lease.slot.id}`)) throw new EvalFailure("TERMINAL_VERIFY_USED", 2)
    let matchingAdmins = 0
    for (const name of names.filter(name => /^admin-[a-zA-Z0-9_-]+$/.test(name))) {
      const source = path.join(file.controller.stateDir, name, "connection.json")
      const receipt = await readLeaseReceipt(source) as { status: string; transportDisconnect: string; identity: ServerIdentity;
        processes?: { lifetime?: { producer_pid: number } } }
      if (receipt.processes?.lifetime?.producer_pid !== reservation.owner.pid) continue
      if (receipt.status !== "disposed" || receipt.transportDisconnect !== "confirmed" || JSON.stringify(receipt.identity) !== JSON.stringify(identity))
        throw new EvalFailure("TERMINAL_ADMIN_UNCONFIRMED", 2)
      await readStartupCleanup(source, reservation.owner.pid)
      matchingAdmins++
    }
    if (!matchingAdmins) throw new EvalFailure("TERMINAL_ADMIN_UNCONFIRMED", 2)
    if (JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
    await verifyParallelPair(file, identity)
    await assertProfileClean(lease.slot.profileDir)
    // Validate the historical ownership chain as history, never as current preparation.
    const old = await readLeaseReceipt(path.join(file.controller.stateDir, `prepare-${lease.slot.id}.json`)) as { identity: ServerIdentity }
    if (old.identity?.containerId !== identity.containerId || old.identity.studioContainerId !== identity.studioContainerId)
      throw new EvalFailure("TERMINAL_STORAGE_OWNERSHIP", 2)
    const historical = { ...lease, identity: old.identity }, secret = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
    const prepared = await readUserPreparation(file, historical, secret), owned = await readUserOwnership(file, historical, secret)
    const published = await readLeaseReceipt(path.join(file.controller.stateDir, `storage-${lease.slot.id}.json`)) as Record<string, unknown>
    const expected = { version: 2, kind: "owned-user-storage", state: "published", slotId: lease.slot.id, username: lease.slot.username,
      identity: old.identity, preparationNonce: prepared.nonce, userKey: owned.userKey, ownerSource: owned.source.sha256,
      root: `${file.server.storageRoot}/${lease.slot.username}` }
    if (Object.entries(expected).some(([key, value]) => JSON.stringify(published[key]) !== JSON.stringify(value)))
      throw new EvalFailure("TERMINAL_STORAGE_OWNERSHIP", 2)
    const storage = await inspectUserStorage(file, identity, lease.slot, prepared.nonce)
    if (storage.entries.length) throw new EvalFailure("TERMINAL_STORAGE_NOT_EMPTY", 2)
    const admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, binary })
    let sessions: Awaited<ReturnType<typeof admin.inspectSessionInventory>> | undefined
    try {
      if ((await admin.inspectUserAccount(lease.slot.username)).objectId !== owned.objectId) throw new EvalFailure("TERMINAL_STORAGE_OWNERSHIP", 2)
      sessions = await admin.inspectSessionInventory()
      if (sessions.sessions.some(row => row.name.toLowerCase() === lease.slot.username.toLowerCase() || row.name.toLowerCase().startsWith(lease.slot.username.toLowerCase() + ":")))
        throw new EvalFailure("TERMINAL_SESSIONS_ACTIVE", 2)
      await assertSessionBackupEmpty(file, identity)
      requireServerFilesClosed(await serverFileObservation(identity.containerId), storage.root)
      await assertProfileClean(lease.slot.profileDir)
      if (JSON.stringify(await inspectUserStorage(file, identity, lease.slot, prepared.nonce)) !== JSON.stringify(storage))
        throw new EvalFailure("TERMINAL_STORAGE_CHANGED", 2)
    } finally { await admin.dispose() }
    const adminFile = path.join(path.dirname(sessions!.source.path), "connection.json")
    const disposed = await readLeaseReceipt(adminFile) as { status: string; transportDisconnect: string }
    if (disposed.status !== "disposed" || disposed.transportDisconnect !== "confirmed") throw new EvalFailure("TERMINAL_ADMIN_UNCONFIRMED", 2)
    await readStartupCleanup(adminFile, process.pid)
    await environment.server.assertHeld(); await lease.assertHeld()
    if (JSON.stringify(await readLeaseReceipt(path.join(directory, "journal.json"))) !== JSON.stringify(journal) ||
      JSON.stringify(await readLeaseReceipt(path.join(scope.stateRoot, "owner.json"))) !== JSON.stringify(owner) ||
      JSON.stringify(await readLeaseReceipt(verification.journal)) !== JSON.stringify(command) ||
      JSON.stringify(await readLeaseReceipt(verification.receipt)) !== JSON.stringify(verification) ||
      JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity)) throw new EvalFailure("TERMINAL_INPUT_CHANGED", 2)
    const proof = path.join(file.controller.stateDir, `terminal-${reservation.commandId}-${lease.token}.json`)
    await writeLeaseReceipt(proof, { version: 2, kind: "unused-verify-cancellation", status: "confirmed", commandId: reservation.commandId,
      campaignId: scope.campaignId, slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "unchanged-clean", storageDeletionAllowed: false, nextAdmissionAllowed: false,
      terminalOnly: true, profileClean: true, ownedStorageEmpty: true, serverFilesClosed: true, backupEmpty: true, adminDisposed: true,
      storage, sessions: sessions!.source, adminFile, verification: verification.receipt })
    const serverProof = path.join(file.controller.stateDir, `terminal-${reservation.commandId}-server.json`)
    await writeLeaseReceipt(serverProof, { version: 2, status: "confirmed", reason: "unused-verify-cancelled", campaignId: scope.campaignId,
      key: reservation.key, token: reservation.token, revision: reservation.revision, serverEpoch: identity.serverEpoch, slotProof: proof })
    await lease.release(proof)
    await environment.server.release(serverProof)
    return readTerminalRelease(file, identity, reservation.commandId, scope.campaignId, lockRoot)

  } finally { await environment.server.close(); await Promise.all(environment.slots.map(slot => slot.close())) }
}

async function readTerminalRelease(file: SlotFile, identity: ServerIdentity, commandId: string, campaignId: string, lockRoot: string, pendingServer = false) {
  const serverProof = path.join(file.controller.stateDir, `terminal-${commandId}-server.json`)
  const proof = await readLeaseReceipt(serverProof) as { reason: string; campaignId: string; slotProof: string }
  if (proof.reason !== "unused-verify-cancelled" || proof.campaignId !== campaignId ||
    typeof proof.slotProof !== "string" || path.dirname(proof.slotProof) !== file.controller.stateDir)
    throw new EvalFailure("TERMINAL_RELEASE_UNCONFIRMED", 2)
  const slot = await readLeaseReceipt(proof.slotProof) as { kind: string; status: string; commandId: string; campaignId: string; slotId: string }
  if (slot.kind !== "unused-verify-cancellation" || slot.status !== "confirmed" || slot.commandId !== commandId ||
    slot.campaignId !== campaignId || slot.slotId !== file.slots[0]!.id) throw new EvalFailure("TERMINAL_RELEASE_UNCONFIRMED", 2)
  for (const key of [`profile:${file.slots[0]!.profileDir}`, ...pendingServer ? [] : [`server:${identity.containerId}`]]) {
    const resource = await readResourceReservation({ key, lockRoot })
    if (resource?.state !== "released" || resource.commandId !== commandId || JSON.stringify(resource.identity) !== JSON.stringify(identity))
      throw new EvalFailure("TERMINAL_RELEASE_UNCONFIRMED", 2)
    const evidence = await readLeaseReceipt(resource.releaseEvidence!.path) as { cleanupReceipt?: string; cleanupReceiptHash?: string }
    const hash = (value: unknown) => new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
    if (hash(evidence) !== resource.releaseEvidence!.sha256 || (key.startsWith("profile:")
      ? evidence.cleanupReceipt !== proof.slotProof || evidence.cleanupReceiptHash !== hash(slot)
      : resource.releaseEvidence!.path !== serverProof)) throw new EvalFailure("TERMINAL_RELEASE_UNCONFIRMED", 2)
  }
  return { identity, commandId, serverProof, slotProof: proof.slotProof }
}
