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
import { readManagementProcessInventory, sealManagementProcessInventory } from "./management-process-evidence"
import { assertProfileSettled } from "./profile"
import { collectManagementSessions } from "./management-sessions"

/** Quiesces normal management sessions; backup/storage qualification still owns release. */
export async function finalizeManagementEnvironment(file: SlotFile, environment: Awaited<ReturnType<typeof acquireEnvironmentLeases>>, admin: AdminConnection) {
  const server = environment.server, identity = server.reservation.identity, journal = server.reservation.journal
  await server.assertHeld()
  const admitted = await readLeaseReceipt(journal)
  if (!identity || JSON.stringify(admin.identity) !== JSON.stringify(identity) || !object(admitted) ||
    !["cli_admitted", "finalizing"].includes(String(admitted.phase)) || typeof admitted.processInventory !== "string" ||
    path.dirname(admitted.processInventory) !== file.controller.stateDir) throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
  if (admitted.phase === "cli_admitted") await sealAdminProcessInventory(file, server, hash(admitted), environment.slots)
  const archived = await archiveManagementEnvironment(file, environment)
  const command = await readLeaseReceipt(journal)
  if (!object(command) || !Array.isArray(command.managementInventories)) throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
  const before = await admin.inspectSessionInventory()
  const prepared: { lease: SlotLease; secretFile: string; inventoryFile: string; accounted: Awaited<ReturnType<typeof collectManagementSessions>> }[] = []
  for (const lease of environment.slots) {
    const binding = command.managementInventories.find(entry => object(entry) && entry.slotId === lease.slot.id)
    if (!object(binding) || typeof binding.file !== "string") throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
    const secretFile = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
    prepared.push({ lease, secretFile, inventoryFile: binding.file,
      accounted: await collectManagementSessions(file, lease, secretFile, binding.file, before.source) })
  }
  await server.assertHeld()
  if (hash(await readLeaseReceipt(journal)) !== hash(command) || hash(await readLeaseReceipt(archived.source.path)) !== archived.source.sha256)
    throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
  // Every slot is accounted before the first destructive server operation.
  for (const entry of prepared) for (const session of entry.accounted.sessions) await admin.closeManagementSession(entry.lease, entry.secretFile, session.id)
  const after = await admin.inspectSessionInventory()
  const slots = await Promise.all(prepared.map(async entry => {
    const accounted = await collectManagementSessions(file, entry.lease, entry.secretFile, entry.inventoryFile, after.source)
    return { slotId: entry.lease.slot.id, leaseToken: entry.lease.token, sessions: await Promise.all(accounted.sessions.map(async session => {
      if (session.state !== "closed") throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
      const observed = path.join(file.controller.stateDir, `management-session-${session.id}.json`)
      const closed = path.join(file.controller.stateDir, `management-session-${session.id}.closed.json`)
      return { id: session.id, state: session.state, observed: { path: observed, sha256: hash(await readLeaseReceipt(observed)) },
        closed: { path: closed, sha256: hash(await readLeaseReceipt(closed)) } }
    })) }
  }))
  await admin.dispose()
  const processes = await readAdminProcessInventory(file, identity, { file: admitted.processInventory, journal,
    commandId: server.reservation.commandId, producerPid: process.pid })
  if ([before, after].some(snapshot => !processes.connections.some(connection => path.dirname(connection.source.path) === path.dirname(snapshot.source.path))))
    throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
  await verifyParallelPair(file, identity)
  if (hash(await archiveManagementEnvironment(file, environment)) !== hash(archived) || hash(await readLeaseReceipt(journal)) !== hash(command))
    throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
  const receipt = { version: 2, kind: "management-environment-finalization", status: "sessions_closed" as const, identity,
    command: { path: journal, sha256: hash(command) }, archive: archived.source, processInventory: processes.source,
    before: before.source, after: after.source, slots, storageDeletionAllowed: false, nextAdmissionAllowed: false }
  const target = `${journal}.management-finalization.json`
  await writeLeaseReceipt(target, receipt)
  return { status: receipt.status, slots, after: after.source, source: { path: target, sha256: hash(receipt) } }
}

/** Closes one normal management slot after its archive; shared admin and peer admission remain live. */
export async function finalizeManagementSlot(file: SlotFile, server: Awaited<ReturnType<typeof acquireEnvironmentLeases>>["server"], lease: SlotLease, inventoryFile: string, admin: AdminConnection) {
  if (JSON.stringify(admin.identity) !== JSON.stringify(lease.identity)) throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
  const archived = await archiveManagementSlot(file, server, lease, inventoryFile)
  const secretFile = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
  const before = await admin.inspectSessionInventory()
  const accounted = await collectManagementSessions(file, lease, secretFile, inventoryFile, before.source)
  await server.assertHeld()
  if (hash(await readLeaseReceipt(archived.source.path)) !== archived.source.sha256) throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
  for (const session of accounted.sessions) await admin.closeManagementSession(lease, secretFile, session.id)
  const after = await admin.inspectSessionInventory()
  const closed = await collectManagementSessions(file, lease, secretFile, inventoryFile, after.source)
  const sessions = await Promise.all(closed.sessions.map(async session => {
    if (session.state !== "closed") throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
    const observed = path.join(file.controller.stateDir, `management-session-${session.id}.json`)
    const terminal = path.join(file.controller.stateDir, `management-session-${session.id}.closed.json`)
    return { id: session.id, state: session.state, observed: { path: observed, sha256: hash(await readLeaseReceipt(observed)) },
      closed: { path: terminal, sha256: hash(await readLeaseReceipt(terminal)) } }
  }))
  if (hash(await archiveManagementSlot(file, server, lease, inventoryFile)) !== hash(archived))
    throw new EvalFailure("MANAGEMENT_FINALIZATION_UNCONFIRMED", 2)
  const receipt = { version: 2, kind: "management-slot-finalization", status: "sessions_closed" as const, identity: lease.identity,
    slotId: lease.slot.id, leaseToken: lease.token, archive: archived.source, processInventory: accounted.source,
    before: before.source, after: after.source, sessions, storageDeletionAllowed: false, nextAdmissionAllowed: false }
  const target = `${lease.receipt}.management-finalization.json`
  await writeLeaseReceipt(target, receipt)
  return { status: receipt.status, sessions, archived, before: before.source, after: after.source, source: { path: target, sha256: hash(receipt) } }
}

/** Archives one closed management producer while peer slots continue. */
export async function archiveManagementSlot(file: SlotFile, server: Awaited<ReturnType<typeof acquireEnvironmentLeases>>["server"], lease: SlotLease, inventoryFile: string) {
  const sealed = await sealManagementProcessInventory(file, server, lease, inventoryFile)
  await assertProfileSettled(lease.slot.profileDir)
  const profile = await archiveEnvironmentProfile(lease, "management")
  if (hash(await sealManagementProcessInventory(file, server, lease, inventoryFile)) !== hash(sealed))
    throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  const receipt = { version: 2, kind: "management-slot-archive", status: "committed", identity: lease.identity,
    slotId: lease.slot.id, leaseToken: lease.token, producerSeal: sealed.source, processInventory: sealed.inventory,
    profile: { ...profile, sha256: hash(await readLeaseReceipt(profile.journal)) }, storageDeletionAllowed: false, nextAdmissionAllowed: false }
  const target = `${lease.receipt}.management-archive.json`
  const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing !== undefined && hash(existing) !== hash(receipt)) throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  if (existing === undefined) await writeLeaseReceipt(target, receipt)
  return { profile, source: { path: target, sha256: hash(receipt) } }
}

/** Archives every sealed normal management profile; server sessions and reservations remain held. */
export async function archiveManagementEnvironment(file: SlotFile, environment: Awaited<ReturnType<typeof acquireEnvironmentLeases>>) {
  const server = environment.server, identity = server.reservation.identity, journal = server.reservation.journal
  await server.assertHeld()
  const command = await readLeaseReceipt(journal)
  if (!identity || server.reservation.state !== "retained" || server.reservation.key !== `server:${identity.containerId}` ||
    server.reservation.owner.pid !== process.pid || !object(command) || command.version !== 2 || command.kind !== "unactivated-preparation" ||
    command.commandId !== server.reservation.commandId || command.phase !== "finalizing" || JSON.stringify(command.identity) !== JSON.stringify(identity) ||
    !environment.slots.length || JSON.stringify(command.slotIds) !== JSON.stringify(environment.slots.map(lease => lease.slot.id)) ||
    new Set(environment.slots.map(lease => lease.slot.id)).size !== environment.slots.length || !Array.isArray(command.managementSources))
    throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  const bindings = command.managementInventories === undefined ? [] : command.managementInventories
  if (!Array.isArray(bindings) || bindings.length !== command.managementSources.length ||
    ["file", "slotId", "leaseToken", "profileDir"].some(key => new Set(bindings.map(entry => object(entry) ? entry[key] : undefined)).size !== bindings.length) ||
    command.managementSources.some(source => !object(source) || Object.keys(source).length !== 2 || typeof source.path !== "string" ||
      typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.sha256)) ||
    new Set(command.managementSources.map(source => source.path)).size !== bindings.length)
    throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  const sources = []
  for (const lease of environment.slots) {
    await lease.assertHeld()
    const origin = await readLeaseReceipt(lease.receipt)
    if (lease.recoveryOnly || JSON.stringify(lease.identity) !== JSON.stringify(identity) || !object(origin) || origin.journal !== journal ||
      origin.commandId !== command.commandId || !file.slots.some(slot => JSON.stringify(slot) === JSON.stringify(lease.slot)))
      throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  }
  for (const binding of bindings) {
    if (!object(binding) || Object.keys(binding).length !== 4 || typeof binding.file !== "string" || path.dirname(binding.file) !== file.controller.stateDir ||
      path.resolve(binding.file) !== binding.file) throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
    const lease = environment.slots.find(lease => lease.slot.id === binding.slotId && lease.token === binding.leaseToken && lease.slot.profileDir === binding.profileDir)
    if (!lease) throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
    const inventory = await readManagementProcessInventory({ file: binding.file, journal, commandId: server.reservation.commandId, identity,
      leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })
    if (!command.managementSources.some(source => source.path === inventory.source.path && source.sha256 === inventory.source.sha256))
      throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
    sources.push(inventory.source)
  }
  if (hash(await readLeaseReceipt(journal)) !== hash(command)) throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  // No profile moves until every slot is free of pending recovery and live writers.
  for (const lease of environment.slots) await assertProfileSettled(lease.slot.profileDir)
  const profiles = []
  for (const lease of environment.slots) {
    const archived = await archiveEnvironmentProfile(lease, "management")
    profiles.push({ slotId: lease.slot.id, leaseToken: lease.token, ...archived, sha256: hash(await readLeaseReceipt(archived.journal)) })
  }
  await server.assertHeld()
  await Promise.all(environment.slots.map(lease => lease.assertHeld()))
  for (const source of sources) {
    if (hash(await readLeaseReceipt(source.path)) !== source.sha256) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
  }
  if (hash(await readLeaseReceipt(journal)) !== hash(command)) throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  const receipt = { version: 2, kind: "management-environment-archive", command: { path: journal, sha256: hash(command) }, identity,
    managementSources: sources, profiles }
  const target = `${journal}.management-archive.json`
  const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing !== undefined && hash(existing) !== hash(receipt)) throw new EvalFailure("MANAGEMENT_ARCHIVE_UNCONFIRMED", 2)
  if (existing === undefined) await writeLeaseReceipt(target, receipt)
  return { profiles, source: { path: target, sha256: hash(receipt) } }
}

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
    const archived = await archiveEnvironmentProfile(lease, "unactivated")
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

async function archiveEnvironmentProfile(lease: SlotLease, kind: "unactivated" | "management") {
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
  const target = previous[0] ?? { archive: path.join(lease.slot.historyDir, `${kind}-${lease.token}`), journal: `${lease.receipt}.archive.json` }
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
