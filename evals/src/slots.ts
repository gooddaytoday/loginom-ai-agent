import path from "node:path"
import { constants } from "node:fs"
import { lstat, open, readFile, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { acquireResourceLease, acquireResourceSet, globalLockRoot, readLeaseReceipt, readResourceReservation, recoverResourceLease, withResourceReservationGuards, writeLeaseReceipt } from "./lease"
import type { Reservation } from "./lease"

export type SlotDefinition = {
  id: string
  username: string
  profileDir: string
  workspaceRoot: string
  historyDir: string
}

export type ServerIdentity = {
  containerId: string
  startedAt: string
  serverEpoch: string
  studioContainerId: string
  studioStartedAt: string
  configurationHash: string
}

export type SlotLease = {
  slot: SlotDefinition
  identity: ServerIdentity
  receipt: string
  token: string
  recoveryOnly: boolean
  assertHeld(): Promise<void>
  close(): Promise<void>
  release(cleanupReceipt: string): Promise<void>
}

export type SlotFile = {
  version: 2
  server: { container: string; studioContainer: string; url: string; network: string; alias: string; storageRoot: string; backupRoot: string }
  controller: { stateDir: string; adminCredentialsFile: string }
  auth?: { sharedDir: string }
  judge: { codexHome: string }
  slots: SlotDefinition[]
}

export function parseSlots(value: unknown, parallel: number): SlotFile {
  const input = record(value)
  if (input.version !== 2) throw new EvalFailure("SLOTS_VERSION", 2)
  if (!Array.isArray(input.slots) || !Number.isSafeInteger(parallel) || parallel < 1 || parallel > input.slots.length)
    throw new EvalFailure("SLOT_COUNT", 2)
  const server = record(input.server)
  const controller = record(input.controller)
  const judge = record(input.judge)
  const file: SlotFile = {
    version: 2,
    server: {
      container: text(server.container), studioContainer: text(server.studioContainer), url: text(server.url),
      network: text(server.network), alias: text(server.alias), storageRoot: text(server.storageRoot), backupRoot: text(server.backupRoot),
    },
    controller: { stateDir: text(controller.stateDir), adminCredentialsFile: text(controller.adminCredentialsFile) },
    judge: { codexHome: text(judge.codexHome) },
    ...(input.auth === undefined ? {} : { auth: { sharedDir: text(record(input.auth).sharedDir) } }),
    slots: input.slots.map(value => {
      const slot = record(value)
      return { id: identifier(slot.id), username: identifier(slot.username), profileDir: text(slot.profileDir), workspaceRoot: text(slot.workspaceRoot), historyDir: text(slot.historyDir) }
    }),
  }
  if (file.server.storageRoot !== "/workdir/UserStorage" || file.server.backupRoot !== "/workdir/SessionBackup")
    throw new EvalFailure("SLOTS_SERVER_ROOTS", 2)
  const url = URL.parse(file.server.url)
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.search)
    throw new EvalFailure("SLOTS_SERVER_URL", 2)
  if (new Set(file.slots.map(slot => slot.id)).size !== file.slots.length)
    throw new EvalFailure("SLOT_ID_DUPLICATE", 2)
  if (new Set(file.slots.map(slot => slot.username)).size !== file.slots.length)
    throw new EvalFailure("SLOT_USER_DUPLICATE", 2)
  validatePaths(file)
  return file
}

export async function loadSlots(file: string, parallel: number, installRoot?: string): Promise<SlotFile> {
  const input = await readSlotFile(file, parallel)
  const canonical = await canonicalSlots(input)
  validatePaths(canonical, [await canonicalPath(path.resolve(file)), ...(installRoot ? [await canonicalPath(path.resolve(installRoot))] : [])])
  await requirePrivatePath(input.controller.adminCredentialsFile, true)
  await Promise.all([input.controller.stateDir, input.judge.codexHome, ...(input.auth ? [input.auth.sharedDir] : []),
    ...input.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])].map(value => requirePrivatePath(value, false)))
  await Promise.all([canonical.controller.stateDir, canonical.judge.codexHome,
    ...(canonical.auth ? [canonical.auth.sharedDir] : []), ...canonical.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])]
    .map(value => requirePrivatePath(value, false)))
  await requirePrivatePath(canonical.controller.adminCredentialsFile, true)
  return canonical
}

export async function loadJudgeEnvironment(file: string) {
  const input = await readSlotFile(file, 1)
  const canonical = await canonicalSlots(input)
  validatePaths(canonical, [await canonicalPath(path.resolve(file))])
  await Promise.all([input.controller.stateDir, input.judge.codexHome, canonical.controller.stateDir, canonical.judge.codexHome]
    .map(value => requirePrivatePath(value, false)))
  return { codexHome: canonical.judge.codexHome, stateDir: canonical.controller.stateDir }
}

// Resource observation reads configuration metadata; it never admits users or reads their credentials.
export async function loadResourceSlots(file: string) {
  const input = await readSlotFile(file, 1)
  const canonical = await canonicalSlots(input)
  validatePaths(canonical, [await canonicalPath(path.resolve(file))])
  await Promise.all([input.controller.stateDir, canonical.controller.stateDir].map(value => requirePrivatePath(value, false)))
  return canonical
}

export async function acquireEnvironmentLeases(file: SlotFile, parallel: number, identity: ServerIdentity, journal: string, lockRoot = globalLockRoot) {
  const canonical = await canonicalSlots(parseSlots(file, parallel))
  if (JSON.stringify(canonical) !== JSON.stringify(file)) throw new EvalFailure("SLOT_PATH_CANONICAL", 2)
  if (!journal.startsWith(file.controller.stateDir + path.sep) || path.resolve(journal) !== journal || await canonicalPath(journal) !== journal)
    throw new EvalFailure("LEASE_JOURNAL", 2)
  const commandId = text(record(await readLeaseReceipt(journal)).commandId)
  const selected = file.slots.slice(0, parallel)
  const resources = await acquireResourceSet([`server:${identity.containerId}`,
    ...selected.flatMap(slot => [`user:${identity.containerId}:${slot.username}:0`, `profile:${slot.profileDir}`])]
    .map(key => ({ key, lockRoot, journal, commandId, identity })), requireFinalizedSlotRelease)
  try {
    const slots: SlotLease[] = []
    for (const slot of selected) {
      const owned = resources.filter(resource => resource.reservation.key === `user:${identity.containerId}:${slot.username}:0` ||
        resource.reservation.key === `profile:${slot.profileDir}`)
      const token = crypto.randomUUID()
      const receipt = path.join(file.controller.stateDir, `slot-${slot.id}-${token}.lease.json`)
      const manifest = { version: 2, token, slot, identity, commandId, journal, resources: owned.map(resource => ({ receipt: resource.receipt,
        key: resource.reservation.key, token: resource.reservation.token, revision: resource.reservation.revision })) }
      await writeLeaseReceipt(receipt, { ...manifest, state: "retained" })
      slots.push(slotLease(receipt, manifest, owned))
    }
    return { server: resources.find(resource => resource.reservation.key === `server:${identity.containerId}`)!, slots }
  } catch (error) {
    await Promise.all(resources.map(resource => resource.close()))
    throw error
  }
}

export async function acquireSlotLease(file: SlotFile, slot: SlotDefinition, identity: ServerIdentity, lockRoot: string): Promise<SlotLease> {
  if (!file.slots.some(candidate => candidate.id === slot.id && candidate.username === slot.username && candidate.profileDir === slot.profileDir &&
    candidate.workspaceRoot === slot.workspaceRoot && candidate.historyDir === slot.historyDir)) throw new EvalFailure("SLOT_NOT_CONFIGURED", 2)
  const journal = path.join(file.controller.stateDir, "run-journal.json")
  const commandId = text(record(await Bun.file(journal).json()).commandId)
  const resources = [] as Awaited<ReturnType<typeof acquireResourceLease>>[]
  try {
    for (const key of [`user:${identity.containerId}:${slot.username}:0`, `profile:${await canonicalPath(slot.profileDir)}`].sort())
      resources.push(await acquireResourceLease({ key, lockRoot, journal, commandId, identity }, requireFinalizedSlotRelease))
    const token = crypto.randomUUID()
    const receipt = path.join(file.controller.stateDir, `slot-${slot.id}-${token}.lease.json`)
    const manifest = { version: 2, token, slot, identity, commandId, resources: resources.map(resource => ({ receipt: resource.receipt,
      key: resource.reservation.key, token: resource.reservation.token, revision: resource.reservation.revision })) }
    await writeLeaseReceipt(receipt, { ...manifest, state: "retained" })
    return slotLease(receipt, manifest, resources)
  } catch (error) {
    // No session, process or user storage has been admitted by this function.
    try {
      for (const resource of resources) {
        const proof = path.join(file.controller.stateDir, `unused-${resource.reservation.token}.json`)
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "not-used", key: resource.reservation.key,
          token: resource.reservation.token, revision: resource.reservation.revision, serverEpoch: identity.serverEpoch })
        await resource.release(proof)
      }
    } finally { await Promise.all(resources.map(resource => resource.close())) }
    throw error
  }
}

async function requireFinalizedSlotRelease(previous: Reservation | undefined) {
  if (previous?.state !== "released") return
  const proof = record(await readLeaseReceipt(previous.releaseEvidence!.path))
  if (new Bun.CryptoHasher("sha256").update(JSON.stringify(proof)).digest("hex") !== previous.releaseEvidence!.sha256)
    throw new EvalFailure("RECOVERY_FINALIZATION_REQUIRED", 2)
  if (proof.kind !== "slot-resource-release") return
  if (typeof proof.slotReceipt !== "string" || typeof proof.cleanupReceipt !== "string" || typeof proof.cleanupReceiptHash !== "string")
    throw new EvalFailure("RECOVERY_FINALIZATION_REQUIRED", 2)
  const composite = record(await readLeaseReceipt(proof.slotReceipt))
  if (composite.version !== 2 || composite.state !== "released" || composite.cleanupReceipt !== proof.cleanupReceipt ||
    composite.commandId !== previous.commandId || JSON.stringify(composite.identity) !== JSON.stringify(previous.identity) ||
    !Array.isArray(composite.resources) || !composite.resources.some(value => {
      const resource = record(value)
      return resource.key === previous.key && resource.token === previous.token && resource.revision === previous.revision
    }) || new Bun.CryptoHasher("sha256").update(JSON.stringify(await readLeaseReceipt(proof.cleanupReceipt))).digest("hex") !== proof.cleanupReceiptHash)
    throw new EvalFailure("RECOVERY_FINALIZATION_REQUIRED", 2)
  if (composite.kind === "slot-recovery") {
    if (typeof composite.incident !== "string") throw new EvalFailure("RECOVERY_FINALIZATION_REQUIRED", 2)
    const incident = record(await readLeaseReceipt(composite.incident))
    if (incident.state !== "released" || incident.token !== composite.incidentToken || incident.releaseReceipt !== proof.slotReceipt ||
      incident.cleanupReceipt !== proof.cleanupReceipt || JSON.stringify(incident.identity) !== JSON.stringify(composite.identity) ||
      JSON.stringify(incident.slot) !== JSON.stringify(composite.slot)) throw new EvalFailure("RECOVERY_FINALIZATION_REQUIRED", 2)
  }
}

export async function recoverSlotLease(file: SlotFile, slot: SlotDefinition, identity: ServerIdentity, incident: string, lockRoot: string): Promise<SlotLease> {
  if (path.dirname(incident) !== file.controller.stateDir || path.resolve(incident) !== incident)
    throw new EvalFailure("SLOT_RECOVERY_INCIDENT_INVALID", 2)
  const original = record(await readLeaseReceipt(incident))
  if (original.version !== 2 || original.state !== "retained" || typeof original.token !== "string" || !original.token ||
    path.basename(incident) !== `slot-${slot.id}-${original.token}.lease.json` ||
    JSON.stringify(original.slot) !== JSON.stringify(slot) || JSON.stringify(original.identity) !== JSON.stringify(identity) ||
    !file.slots.some(candidate => JSON.stringify(candidate) === JSON.stringify(slot)) || !Array.isArray(original.resources) || original.resources.length !== 2)
    throw new EvalFailure("SLOT_RECOVERY_INCIDENT_INVALID", 2)
  const journal = await requireSlotJournal(file, original)
  const keys = [`user:${identity.containerId}:${slot.username}:0`, `profile:${await canonicalPath(slot.profileDir)}`].sort()
  const inventory = await Promise.all(original.resources.map(async (value, index) => {
    const source = record(value)
    if (source.key !== keys[index] || source.receipt !== path.join(lockRoot, `${new Bun.CryptoHasher("sha256").update(keys[index]!).digest("hex")}.reservation.json`) ||
      typeof source.token !== "string" || !source.token || !Number.isSafeInteger(source.revision) || Number(source.revision) < 1)
      throw new EvalFailure("SLOT_RECOVERY_LINEAGE_INVALID", 2)
    const current = await readResourceReservation({ key: keys[index]!, lockRoot })
    const chain = current && [...current.lineage, current]
    const position = chain?.findIndex(entry => entry.token === source.token && entry.revision === source.revision)
    if (!current || position === undefined || position < 0 ||
      chain![position]!.journal !== journal || chain![position]!.commandId !== original.commandId ||
      chain!.slice(position).some(entry => JSON.stringify(entry.identity) !== JSON.stringify(identity)))
      throw new EvalFailure("SLOT_RECOVERY_LINEAGE_INVALID", 2)
    if (current.state === "released") await requireReleasedSlotResource(current, incident, original)
    for (const entry of chain!.slice(position + 1)) {
      const recovery = record(await readLeaseReceipt(entry.journal))
      if (path.dirname(entry.journal) !== file.controller.stateDir || recovery.kind !== "slot-recovery" ||
        recovery.incident !== incident || recovery.incidentToken !== original.token || recovery.commandId !== entry.commandId ||
        JSON.stringify(recovery.identity) !== JSON.stringify(identity) || JSON.stringify(recovery.slot) !== JSON.stringify(slot))
        throw new EvalFailure("SLOT_RECOVERY_LINEAGE_INVALID", 2)
    }
    const bootId = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim()
    if (current.owner.uid !== process.getuid?.()) throw new EvalFailure("LEASE_OWNER_UNVERIFIED", 2)
    const owner = current.owner.bootId === bootId ? await readFile(`/proc/${current.owner.pid}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw new EvalFailure("LEASE_OWNER_UNVERIFIED", 2)
    }) : undefined
    if (owner && owner.slice(owner.lastIndexOf(")") + 2).split(" ")[19] === current.owner.starttime) throw new EvalFailure("BUSY", 2)
    return { current, source }
  }))
  const commandId = crypto.randomUUID(), token = crypto.randomUUID()
  const receipt = path.join(file.controller.stateDir, `slot-${slot.id}-${token}.recovery.json`)
  const manifest = { version: 2, kind: "slot-recovery", token, slot, identity, commandId, incident, incidentToken: original.token,
    resources: [] as { receipt: string; key: string; token: string; revision: number }[] }
  await writeLeaseReceipt(receipt, { ...manifest, state: "intent" })
  const resources = [] as Awaited<ReturnType<typeof acquireResourceLease>>[]
  try {
    for (const entry of inventory) {
      const resource = await recoverResourceLease({ key: entry.current.key, lockRoot, journal: receipt, commandId, identity },
        { token: entry.current.token, revision: entry.current.revision, incidentToken: String(entry.source.token) },
        async current => { await requireReleasedSlotResource(current, incident, original) })
      resources.push(resource)
      manifest.resources.push({ receipt: resource.receipt, key: resource.reservation.key, token: resource.reservation.token, revision: resource.reservation.revision })
      await writeLeaseReceipt(receipt, { ...manifest, state: "recovery-only" })
    }
    return slotLease(receipt, manifest, resources)
  } catch (error) {
    await Promise.all(resources.map(resource => resource.close()))
    throw error
  }
}

async function requireSlotJournal(file: SlotFile, original: Record<string, unknown>) {
  const journal = original.journal === undefined ? path.join(file.controller.stateDir, "run-journal.json") : original.journal
  if (typeof journal !== "string" || !journal.startsWith(file.controller.stateDir + path.sep) || path.resolve(journal) !== journal ||
    await canonicalPath(journal) !== journal || record(await readLeaseReceipt(journal)).commandId !== original.commandId)
    throw new EvalFailure("SLOT_RECOVERY_LINEAGE_INVALID", 2)
  return journal
}

async function requireReleasedSlotResource(current: Reservation, incident: string, original: Record<string, unknown>, mode: "recover" | "finalize" = "recover") {
  if (!current.releaseEvidence) throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
  const proof = record(await readLeaseReceipt(current.releaseEvidence.path))
  if (proof.version !== 2 || proof.kind !== "slot-resource-release" || proof.status !== "confirmed" || proof.key !== current.key ||
    proof.token !== current.token || proof.revision !== current.revision || proof.serverEpoch !== current.identity?.serverEpoch ||
    typeof proof.slotReceipt !== "string" || path.dirname(proof.slotReceipt) !== path.dirname(incident) ||
    current.releaseEvidence.path !== `${proof.slotReceipt}.${new Bun.CryptoHasher("sha256").update(current.key).digest("hex")}.released.json` ||
    typeof proof.cleanupReceipt !== "string" || typeof proof.cleanupReceiptHash !== "string" ||
    new Bun.CryptoHasher("sha256").update(JSON.stringify(proof)).digest("hex") !== current.releaseEvidence.sha256)
    throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
  const composite = record(await readLeaseReceipt(proof.slotReceipt))
  if (composite.version !== 2 || !(mode === "finalize" ? ["retained", "recovery-only", "released"] : ["retained", "recovery-only"]).includes(String(composite.state)) ||
    JSON.stringify(composite.slot) !== JSON.stringify(original.slot) || JSON.stringify(composite.identity) !== JSON.stringify(original.identity) ||
    composite.commandId !== current.commandId || !Array.isArray(composite.resources) || !composite.resources.some(value => {
      const source = record(value)
      return source.key === current.key && source.token === current.token && source.revision === current.revision
    }) || proof.slotReceipt !== incident && (composite.kind !== "slot-recovery" || composite.incident !== incident || composite.incidentToken !== original.token))
    throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
  const cleanup = record(await readLeaseReceipt(proof.cleanupReceipt))
  if (new Bun.CryptoHasher("sha256").update(JSON.stringify(cleanup)).digest("hex") !== proof.cleanupReceiptHash ||
    cleanup.status !== "confirmed" || cleanup.slotId !== record(original.slot).id || cleanup.leaseToken !== composite.token ||
    cleanup.serverEpoch !== current.identity?.serverEpoch || cleanup.processes !== "confirmed" || cleanup.serverSessions !== "confirmed" ||
    cleanup.archive !== "committed" || cleanup.storageDeletionAllowed !== true || cleanup.nextAdmissionAllowed !== true)
    throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
  return { cleanupReceipt: proof.cleanupReceipt, slotReceipt: proof.slotReceipt, composite }
}

export async function finalizeReleasedSlot(file: SlotFile, slot: SlotDefinition, identity: ServerIdentity, incident: string, lockRoot: string) {
  if (path.dirname(incident) !== file.controller.stateDir || path.resolve(incident) !== incident ||
    !file.slots.some(candidate => JSON.stringify(candidate) === JSON.stringify(slot))) throw new EvalFailure("SLOT_RECOVERY_INCIDENT_INVALID", 2)
  const keys = [`user:${identity.containerId}:${slot.username}:0`, `profile:${await canonicalPath(slot.profileDir)}`].sort()
  return withResourceReservationGuards(keys, lockRoot, async rows => {
    const original = record(await readLeaseReceipt(incident))
    if (original.version !== 2 || !["retained", "released"].includes(String(original.state)) || typeof original.token !== "string" ||
      path.basename(incident) !== `slot-${slot.id}-${original.token}.lease.json` || JSON.stringify(original.slot) !== JSON.stringify(slot) ||
      JSON.stringify(original.identity) !== JSON.stringify(identity) || !Array.isArray(original.resources) || original.resources.length !== keys.length)
      throw new EvalFailure("SLOT_RECOVERY_INCIDENT_INVALID", 2)
    const journal = await requireSlotJournal(file, original)
    const proofs = await Promise.all(rows.map(async (row, index) => {
      const source = record((original.resources as unknown[])[index])
      const current = row.reservation
      const chain = current && [...current.lineage, current]
      const position = chain?.findIndex(entry => entry.token === source.token && entry.revision === source.revision)
      if (source.key !== row.key || source.receipt !== path.join(lockRoot, `${new Bun.CryptoHasher("sha256").update(row.key).digest("hex")}.reservation.json`) ||
        !current || current.state !== "released" || position === undefined || position < 0 ||
        chain![position]!.commandId !== original.commandId || chain![position]!.journal !== journal ||
        chain!.slice(position).some(entry => JSON.stringify(entry.identity) !== JSON.stringify(identity)))
        throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
      for (const entry of chain!.slice(position + 1)) {
        const recovery = record(await readLeaseReceipt(entry.journal))
        if (path.dirname(entry.journal) !== file.controller.stateDir || recovery.kind !== "slot-recovery" || recovery.commandId !== entry.commandId ||
          recovery.incident !== incident || recovery.incidentToken !== original.token || JSON.stringify(recovery.slot) !== JSON.stringify(slot) ||
          JSON.stringify(recovery.identity) !== JSON.stringify(identity)) throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
      }
      return requireReleasedSlotResource(current, incident, original, "finalize")
    }))
    const completed = proofs[0]!
    if (proofs.some(proof => proof.slotReceipt !== completed.slotReceipt || proof.cleanupReceipt !== completed.cleanupReceipt) ||
      original.state === "released" && (original.cleanupReceipt !== completed.cleanupReceipt || (original.releaseReceipt ?? incident) !== completed.slotReceipt))
      throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
    if (original.state === "released") return { status: "already_released", cleanupReceipt: completed.cleanupReceipt }
    if (completed.slotReceipt !== incident && completed.composite.state !== "released")
      await writeLeaseReceipt(completed.slotReceipt, { ...completed.composite, state: "released", cleanupReceipt: completed.cleanupReceipt })
    await writeLeaseReceipt(incident, { ...original, state: "released", cleanupReceipt: completed.cleanupReceipt,
      ...(completed.slotReceipt !== incident ? { releaseReceipt: completed.slotReceipt } : {}) })
    return { status: "released", cleanupReceipt: completed.cleanupReceipt }
  })
}

function slotLease(receipt: string, manifest: { version: number; token: string; slot: SlotDefinition; identity: ServerIdentity; commandId: string;
  resources: { receipt: string; key: string; token: string; revision: number }[]; incident?: string }, resources: Awaited<ReturnType<typeof acquireResourceLease>>[]): SlotLease {
  const assertHeld = async () => {
    await Promise.all(resources.map(resource => resource.assertHeld()))
    if (JSON.stringify(await readLeaseReceipt(receipt).catch(() => { throw new EvalFailure("LEASE_NOT_HELD", 2) })) !==
      JSON.stringify({ ...manifest, state: manifest.incident ? "recovery-only" : "retained" })) throw new EvalFailure("LEASE_NOT_HELD", 2)
  }
  return { slot: manifest.slot, identity: manifest.identity, receipt, token: manifest.token, recoveryOnly: Boolean(manifest.incident),
    assertHeld,
    async close() { await Promise.all(resources.map(resource => resource.close())) }, async release(cleanupReceipt: string) {
    await assertHeld()
    const evidence = record(await readLeaseReceipt(cleanupReceipt))
    if (evidence.status !== "confirmed" || evidence.slotId !== manifest.slot.id || evidence.leaseToken !== manifest.token || evidence.serverEpoch !== manifest.identity.serverEpoch ||
      evidence.processes !== "confirmed" || evidence.serverSessions !== "confirmed" || evidence.archive !== "committed" ||
      evidence.storageDeletionAllowed !== true || evidence.nextAdmissionAllowed !== true) throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
    for (const resource of resources) {
      const proof = `${receipt}.${new Bun.CryptoHasher("sha256").update(resource.reservation.key).digest("hex")}.released.json`
      await writeLeaseReceipt(proof, { version: 2, kind: "slot-resource-release", status: "confirmed", key: resource.reservation.key, token: resource.reservation.token,
        revision: resource.reservation.revision, slotReceipt: receipt, cleanupReceipt,
        cleanupReceiptHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(evidence)).digest("hex"), serverEpoch: manifest.identity.serverEpoch })
      await resource.release(proof)
    }
    await writeLeaseReceipt(receipt, { ...manifest, state: "released", cleanupReceipt })
  } }
}

async function requirePrivatePath(value: string, file: boolean): Promise<void> {
  const info = await lstat(value).catch((error: NodeJS.ErrnoException) => {
    if (!file && error.code === "ENOENT") return undefined
    throw new EvalFailure("SLOT_PATH_PRIVATE", 2)
  })
  if (!info) return requirePrivatePath(path.dirname(value), false)
  if (info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== (file ? 0o600 : 0o700) ||
    (file ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())) throw new EvalFailure("SLOT_PATH_PRIVATE", 2)
}

async function canonicalPath(value: string): Promise<string> {
  return realpath(value).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw new EvalFailure("SLOT_PATH_UNREADABLE", 2)
    return canonicalPath(path.dirname(value)).then(parent => path.join(parent, path.basename(value)))
  })
}

function validatePaths(file: SlotFile, protectedPaths: string[] = []) {
  const paths = [file.controller.stateDir, file.controller.adminCredentialsFile, file.judge.codexHome,
    ...(file.auth ? [file.auth.sharedDir] : []), ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir]), globalLockRoot, ...protectedPaths]
  if (paths.some(value => !path.isAbsolute(value))) throw new EvalFailure("SLOT_PATH_ABSOLUTE", 2)
  paths.map(value => path.resolve(value)).forEach((value, index, all) => {
    if (all.slice(index + 1).some(other => value === other || value.startsWith(other.endsWith(path.sep) ? other : other + path.sep) || other.startsWith(value.endsWith(path.sep) ? value : value + path.sep)))
      throw new EvalFailure("SLOT_PATH_OVERLAP", 2)
  })
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("SLOTS_SCHEMA", 2)
  return value as Record<string, unknown>
}

function text(value: unknown) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new EvalFailure("SLOTS_SCHEMA", 2)
  return value
}

function identifier(value: unknown) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(text(value))) throw new EvalFailure("SLOT_IDENTIFIER", 2)
  return text(value)
}

async function readSlotFile(file: string, parallel: number) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => {
    throw new EvalFailure("SLOTS_FILE_PRIVATE", 2)
  })
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600)
      throw new EvalFailure("SLOTS_FILE_PRIVATE", 2)
    return parseSlots(JSON.parse(await handle.readFile("utf8")), parallel)
  } catch (error) {
    if (error instanceof EvalFailure) throw error
    throw new EvalFailure("SLOTS_SCHEMA", 2)
  } finally { await handle.close() }
}

async function canonicalSlots(input: SlotFile): Promise<SlotFile> {
  return {
    ...input,
    controller: { stateDir: await canonicalPath(input.controller.stateDir), adminCredentialsFile: await canonicalPath(input.controller.adminCredentialsFile) },
    judge: { codexHome: await canonicalPath(input.judge.codexHome) },
    ...(input.auth ? { auth: { sharedDir: await canonicalPath(input.auth.sharedDir) } } : {}),
    slots: await Promise.all(input.slots.map(async slot => ({ ...slot,
      profileDir: await canonicalPath(slot.profileDir), workspaceRoot: await canonicalPath(slot.workspaceRoot), historyDir: await canonicalPath(slot.historyDir),
    }))),
  }
}
