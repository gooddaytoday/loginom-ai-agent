import path from "node:path"
import { lstat, mkdir, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { readAdminProcessInventory, sealAdminProcessInventory, type AdminConnection } from "./loginom-admin"
import { inspectAbsentUserStorage, inspectUserStorage, verifyParallelPair } from "./parallel-pair"
import { archiveProfileEvidence } from "./profile-archive"
import { acquireEnvironmentLeases, finalizeReleasedSlot, type SlotFile, type SlotLease } from "./slots"
import { readUnactivatedUserObservation, readUserOwnership, readUserPreparation } from "./user-environment"
import { readPreparationRecoverySources } from "./preparation-recovery"

/** Only the pre-CLI, never-activated preparation path can use this finalizer. */
export async function finalizeUnactivatedEnvironment(file: SlotFile, environment: Awaited<ReturnType<typeof acquireEnvironmentLeases>>, admin: AdminConnection) {
  const server = environment.server, identity = server.reservation.identity
  await server.assertHeld()
  if (!identity || server.reservation.key !== `server:${identity.containerId}` || !["retained", "recovery-only"].includes(server.reservation.state) ||
    server.reservation.owner.pid !== process.pid || !environment.slots.length ||
    JSON.stringify(admin.identity) !== JSON.stringify(identity)) throw new EvalFailure("ENVIRONMENT_FINALIZATION_UNCONFIRMED", 2)
  const journal = server.reservation.journal
  const command = await readLeaseReceipt(journal)
  const recovered = server.reservation.state === "recovery-only"
  if (!object(command) || Object.keys(command).length !== (recovered ? command.completedSlots === undefined ? 9 : 10 : 7) || command.version !== 2 ||
    command.kind !== (recovered ? "unactivated-recovery" : "unactivated-preparation") ||
    command.commandId !== server.reservation.commandId || JSON.stringify(command.identity) !== JSON.stringify(identity) || command.phase !== "unactivated" ||
    !recovered && JSON.stringify(command.slotIds) !== JSON.stringify(environment.slots.map(lease => lease.slot.id)) || typeof command.processInventory !== "string" ||
    path.dirname(command.processInventory) !== file.controller.stateDir) throw new EvalFailure("ENVIRONMENT_FINALIZATION_UNCONFIRMED", 2)
  const recoveryProcessInventories = recovered ? await readPreparationRecoverySources(file, environment) : []
  const completedSlots = recovered && Array.isArray(command.completedSlots) ? command.completedSlots.map(entry => {
    if (!object(entry) || typeof entry.slotId !== "string" || !object(entry.cleanup) || typeof entry.cleanup.path !== "string" || typeof entry.cleanup.sha256 !== "string")
      throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    return { slotId: entry.slotId, cleanup: { path: entry.cleanup.path, sha256: entry.cleanup.sha256 } }
  }) : []
  for (const lease of environment.slots) {
    await lease.assertHeld()
    const source = await readLeaseReceipt(lease.receipt)
    if (lease.recoveryOnly !== recovered || JSON.stringify(lease.identity) !== JSON.stringify(identity) || !object(source) ||
      !recovered && (source.journal !== journal || source.commandId !== command.commandId)) throw new EvalFailure("ENVIRONMENT_FINALIZATION_UNCONFIRMED", 2)
  }
  const sealed = await sealAdminProcessInventory(file, server, hash(command))
  const prepared = []
  for (const lease of environment.slots) {
    const secretFile = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
    const observation = await admin.inspectUnactivatedUser(lease, secretFile)
    const archived = await archivePreparationProfile(lease)
    prepared.push({ lease, secretFile, observation, archived })
  }
  // Archive commits precede the native transport disconnect and process settlement.
  await admin.dispose()
  const processes = await readAdminProcessInventory(file, identity, { file: command.processInventory, journal,
    commandId: server.reservation.commandId, producerPid: server.reservation.owner.pid })
  if (prepared.some(entry => !processes.connections.some(connection => path.dirname(connection.source.path) === path.dirname(entry.observation.source.path))))
    throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
  await verifyParallelPair(file, identity)
  if (recovered && JSON.stringify(await readPreparationRecoverySources(file, environment)) !== JSON.stringify(recoveryProcessInventories))
    throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_CHANGED", 2)
  const slots = [...completedSlots]
  for (const entry of prepared) {
    const lease = entry.lease
    await lease.assertHeld()
    const preparation = await readUserPreparation(file, lease, entry.secretFile)
    await readUnactivatedUserObservation(file, lease, entry.secretFile, entry.observation.source)
    const source = path.join(file.controller.stateDir, `storage-${lease.slot.id}.json`)
    const observed = entry.observation.account ? await inspectPublishedStorage(file, lease, entry.secretFile, source, preparation.nonce) :
      await inspectUnusedStorage(file, lease)
    const archive = await archiveProfileEvidence(lease.slot.profileDir, entry.archived.archive, entry.archived.journal)
    await server.assertHeld()
    await lease.assertHeld()
    if (JSON.stringify(await readLeaseReceipt(journal)) !== JSON.stringify(sealed)) throw new EvalFailure("ENVIRONMENT_FINALIZATION_UNCONFIRMED", 2)
    const cleanup = `${lease.receipt}.cleanup.json`
    const receipt = { version: 2, kind: "unactivated-environment-finalization", status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token,
      serverEpoch: identity.serverEpoch, processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true,
      nextAdmissionAllowed: true, command: { path: journal, sha256: hash(sealed) }, processInventory: processes.source,
      observation: entry.observation.source, profileArchive: { ...archive, sha256: hash(await readLeaseReceipt(archive.journal)) }, storage: observed }
    const completed = { ...receipt, ...(recovered ? { recoveryProcessInventories } : {}) }
    await writeLeaseReceipt(cleanup, completed)
    await lease.release(cleanup)
    if (recovered) {
      const source = await readLeaseReceipt(lease.receipt)
      if (!object(source) || typeof source.incident !== "string") throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
      await finalizeReleasedSlot(file, lease.slot, identity, source.incident, path.dirname(server.receipt))
    }
    slots.push({ slotId: lease.slot.id, cleanup: { path: cleanup, sha256: hash(completed) } })
  }
  await server.assertHeld()
  const released = file.slots.flatMap(slot => slots.filter(entry => entry.slotId === slot.id))
  const target = `${journal}.server-finalization.json`
  const receipt = { version: 2, kind: "unactivated-server-finalization", status: "confirmed", key: server.reservation.key,
    token: server.reservation.token, revision: server.reservation.revision, serverEpoch: identity.serverEpoch, processInventory: processes.source, slots: released }
  await writeLeaseReceipt(target, receipt)
  await server.release(target)
  return { status: "released" as const, slots: released, server: { path: target, sha256: hash(receipt) } }
}

async function archivePreparationProfile(lease: SlotLease) {
  await lease.assertHeld()
  const history = await lstat(lease.slot.historyDir)
  if (!history.isDirectory() || history.isSymbolicLink() || history.uid !== process.getuid?.() || (history.mode & 0o777) !== 0o700 ||
    await realpath(lease.slot.historyDir) !== lease.slot.historyDir) throw new EvalFailure("ARCHIVE_ROOT_PRIVATE", 2)
  const previous = []
  if (lease.recoveryOnly) {
    const manifest = await readLeaseReceipt(lease.receipt)
    if (!object(manifest) || typeof manifest.incident !== "string" || !Array.isArray(manifest.resources)) throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    const profile = manifest.resources.find(entry => object(entry) && entry.key === `profile:${lease.slot.profileDir}`)
    if (!object(profile) || typeof profile.receipt !== "string") throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    const reservation = await readLeaseReceipt(profile.receipt)
    if (!object(reservation) || !Array.isArray(reservation.lineage)) throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    const sources = [manifest.incident, ...reservation.lineage.filter(object).flatMap(entry => typeof entry.journal === "string" && entry.journal.endsWith(".recovery.json") ? [entry.journal] : [])]
    for (const source of new Set(sources)) {
      const journal = `${source}.archive.json`
      const saved = await readLeaseReceipt(journal).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (saved === undefined) continue
      if (!object(saved) || saved.kind !== "profile-archive" || saved.profile !== lease.slot.profileDir || typeof saved.archive !== "string" ||
        path.dirname(saved.archive) !== lease.slot.historyDir) throw new EvalFailure("ARCHIVE_MANIFEST_INVALID", 2)
      previous.push({ archive: saved.archive, journal })
    }
  }
  if (previous.length > 1) throw new EvalFailure("ARCHIVE_SOURCE_AMBIGUOUS", 2)
  const target = previous[0] ?? { archive: path.join(lease.slot.historyDir, `unactivated-${lease.token}`), journal: `${lease.receipt}.archive.json` }
  if (!previous.length) await mkdir(target.archive, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error })
  await lease.assertHeld()
  return archiveProfileEvidence(lease.slot.profileDir, target.archive, target.journal)
}

async function inspectUnusedStorage(file: SlotFile, lease: SlotLease) {
  for (const name of [`storage-${lease.slot.id}.json`, `storage-${lease.slot.id}.reserve.json`]) {
    const saved = await lstat(path.join(file.controller.stateDir, name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (saved) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  }
  return inspectAbsentUserStorage(file, lease.identity, lease.slot)
}

async function inspectPublishedStorage(file: SlotFile, lease: SlotLease, secretFile: string, source: string, nonce: string) {
  const owned = await readUserOwnership(file, lease, secretFile)
  if (owned.everActivated) throw new EvalFailure("USER_IDLE_UNCONFIRMED", 2)
  const storage = await readLeaseReceipt(source)
  const expected = { version: 2, kind: "owned-user-storage", state: "published", slotId: lease.slot.id, username: lease.slot.username,
    identity: lease.identity, preparationNonce: nonce, userKey: owned.userKey, ownerSource: owned.source.sha256,
    root: `${file.server.storageRoot}/${lease.slot.username}` }
  if (!object(storage) || Object.entries(expected).some(([key, value]) => JSON.stringify(storage[key]) !== JSON.stringify(value)))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const observed = await inspectUserStorage(file, lease.identity, lease.slot, nonce)
  if (["device", "inode", "uid", "gid"].some(key => storage[key] !== observed[key as keyof typeof observed]) ||
    JSON.stringify(await readLeaseReceipt(source)) !== JSON.stringify(storage)) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  if (observed.entries.length) throw new EvalFailure("USER_STORAGE_NOT_EMPTY", 2)
  return observed
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
