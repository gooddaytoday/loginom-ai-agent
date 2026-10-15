import path from "node:path"
import { readdir, readFile } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, recoverResourceLease, withResourceReservationGuards, writeLeaseReceipt } from "./lease"
import { acquireEnvironmentLeases, finalizeReleasedSlot, loadSlots, parseSlots, recoverSlotLease, type ServerIdentity, type SlotFile, type SlotLease } from "./slots"
import { openLoginomAdmin, readAdminProcessInventory, sealAdminProcessInventory } from "./loginom-admin"
import { readServerIdentity, verifyParallelPair } from "./parallel-pair"
import type { finalizeUnactivatedEnvironment } from "./environment-finalization"

type PreparationRecoveryResult = { version: 2; kind: "preparation-recovery"; status: "released" | "already_released"; ready: false;
  identity: ServerIdentity; incident: string; journal: string; receipt: string; finalization: Awaited<ReturnType<typeof finalizeUnactivatedEnvironment>> }

export async function recoverUnactivatedPreparation(input: { slotsFile: string; incident: string }, lockRoot = globalLockRoot) {
  const file = await loadSlots(input.slotsFile, 1)
  const identity = await readServerIdentity(file)
  await verifyParallelPair(file, identity)
  const completed = await readPreparationCompletion(file, identity, input.incident)
  if (completed) return completed
  const reconciled = await reconcilePreparationCompletion(file, identity, input.incident, lockRoot)
  if (reconciled) return reconciled
  const finalized = await finishReleasedPreparation(file, identity, input.incident, lockRoot)
  if (finalized) return finalized
  const environment = await recoverPreparationLeases(file, identity, input.incident, lockRoot)
  const receipt = `${environment.journal}.result.json`
  try {
    const command = await readLeaseReceipt(environment.journal)
    if (!object(command) || typeof command.processInventory !== "string") throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    const admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, processInventory: command.processInventory })
    try {
      const { finalizeUnactivatedEnvironment } = await import("./environment-finalization")
      const finalization = await finalizeUnactivatedEnvironment(file, environment, admin)
      const result: PreparationRecoveryResult = { version: 2, kind: "preparation-recovery", status: "released", ready: false, identity,
        incident: input.incident, journal: environment.journal, receipt, finalization }
      await writePreparationCompletion(file, result, command.incident)
      return result
    } finally { await admin.dispose() }
  } catch (error) {
    const { EnvironmentFailure } = await import("./environment-preparation")
    const reason = error instanceof EvalFailure ? error.message : "PREPARATION_RECOVERY_FAILED"
    await writeLeaseReceipt(receipt, { version: 2, kind: "preparation-recovery", status: "failed", ready: false, identity,
      incident: input.incident, journal: environment.journal, receipt, reason, finalization: { status: "unconfirmed" } })
    throw new EnvironmentFailure(reason, receipt)
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]) }
}

async function finishReleasedPreparation(file: SlotFile, identity: ServerIdentity, incident: string, lockRoot: string) {
  const key = `server:${identity.containerId}`, current = await readResourceReservation({ key, lockRoot })
  if (!current || current.state === "released") return
  const original = await readLeaseReceipt(incident)
  if (!object(original) || Object.keys(original).length !== 7 || original.version !== 2 || original.kind !== "unactivated-preparation" ||
    typeof original.commandId !== "string" || !original.commandId || !Array.isArray(original.slotIds) || !original.slotIds.length ||
    !["unactivated", "finalizing"].includes(String(original.phase)) || JSON.stringify(original.identity) !== JSON.stringify(identity) ||
    typeof original.processInventory !== "string" || path.dirname(original.processInventory) !== file.controller.stateDir)
    throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_INVALID", 2)
  const selected = parseSlots(file, original.slotIds.length).slots.slice(0, original.slotIds.length)
  if (JSON.stringify(original.slotIds) !== JSON.stringify(selected.map(slot => slot.id))) throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_INVALID", 2)
  const names = await readdir(file.controller.stateDir), slotIncidents = []
  for (const slot of selected) {
    const candidates = []
    for (const name of names.filter(name => name.startsWith(`slot-${slot.id}-`) && name.endsWith(".lease.json"))) {
      const target = path.join(file.controller.stateDir, name), value = await readLeaseReceipt(target)
      if (object(value) && value.journal === incident && value.commandId === original.commandId &&
        JSON.stringify(value.identity) === JSON.stringify(identity) && JSON.stringify(value.slot) === JSON.stringify(slot)) candidates.push({ target, value })
    }
    if (candidates.length !== 1) throw new EvalFailure("PREPARATION_RECOVERY_SLOT_UNCONFIRMED", 2)
    if (candidates[0]!.value.state !== "released") return
    slotIncidents.push(candidates[0]!.target)
  }
  const chain = [...current.lineage, current], position = chain.findIndex(entry => entry.journal === incident && entry.commandId === original.commandId)
  if (position < 0 || chain.slice(position).some(entry => JSON.stringify(entry.identity) !== JSON.stringify(identity)))
    throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  const reference = { path: incident, sha256: hash(original) }, commandId = crypto.randomUUID()
  for (const entry of chain.slice(position + 1)) {
    const prior = await readLeaseReceipt(entry.journal)
    if (!object(prior) || prior.kind !== "unactivated-recovery" || prior.commandId !== entry.commandId ||
      JSON.stringify(prior.incident) !== JSON.stringify(reference) || JSON.stringify(prior.identity) !== JSON.stringify(identity))
      throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  }
  const journal = path.join(file.controller.stateDir, `recover-command-${commandId}.json`), processInventory = path.join(file.controller.stateDir, `processes-${commandId}.json`)
  const command = { version: 2, kind: "unactivated-recovery", commandId, identity, incident: reference, slotIncidents, slotRecoveries: [], phase: "unactivated", processInventory }
  await writeLeaseReceipt(journal, command)
  await writeLeaseReceipt(processInventory, { version: 2, kind: "admin-processes", commandId, journal, identity, connections: [] })
  const server = await recoverResourceLease({ key, identity, journal, commandId, lockRoot },
    { token: current.token, revision: current.revision, incidentToken: chain[position]!.token })
  const receipt = `${journal}.result.json`
  try {
    const sealed = await sealAdminProcessInventory(file, server, hash(command))
    const prior = await preparationProcessSources(file, server, reference, original.commandId)
    const slots = []
    for (const [index, slot] of selected.entries()) {
      const finalized = await finalizeReleasedSlot(file, slot, identity, slotIncidents[index]!, lockRoot)
      const cleanup = await readLeaseReceipt(finalized.cleanupReceipt)
      slots.push({ slotId: slot.id, cleanup: { path: finalized.cleanupReceipt, sha256: hash(cleanup) } })
    }
    if (JSON.stringify(await preparationProcessSources(file, server, reference, original.commandId)) !== JSON.stringify(prior))
      throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_CHANGED", 2)
    await verifyParallelPair(file, identity)
    await server.assertHeld()
    if (JSON.stringify(await readLeaseReceipt(journal)) !== JSON.stringify(sealed)) throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_CHANGED", 2)
    const processes = await readAdminProcessInventory(file, identity, { file: processInventory, journal, commandId, producerPid: process.pid })
    const target = `${journal}.server-finalization.json`
    const proof = { version: 2, kind: "unactivated-server-finalization", status: "confirmed", key, token: server.reservation.token,
      revision: server.reservation.revision, serverEpoch: identity.serverEpoch, processInventory: processes.source, slots,
      command: { path: journal, sha256: hash(sealed) }, recoveryProcessInventories: prior }
    await writeLeaseReceipt(target, proof)
    await server.release(target)
    const result: PreparationRecoveryResult = { version: 2, kind: "preparation-recovery", status: "released", ready: false, identity,
      incident, journal, receipt, finalization: { status: "released", slots, server: { path: target, sha256: hash(proof) } } }
    await writePreparationCompletion(file, result, reference)
    return result
  } catch (error) {
    const { EnvironmentFailure } = await import("./environment-preparation")
    const reason = error instanceof EvalFailure ? error.message : "PREPARATION_RECOVERY_FAILED"
    await writeLeaseReceipt(receipt, { version: 2, kind: "preparation-recovery", status: "failed", ready: false, identity,
      incident, journal, receipt, reason, finalization: { status: "unconfirmed" } })
    throw new EnvironmentFailure(reason, receipt)
  } finally { await server.close() }
}

async function reconcilePreparationCompletion(file: SlotFile, identity: ServerIdentity, incident: string, lockRoot: string) {
  const key = `server:${identity.containerId}`
  return withResourceReservationGuards([key], lockRoot, async rows => {
    const current = rows[0]!.reservation
    if (!current || current.state !== "released") return
    const original = await readLeaseReceipt(incident), command = await readLeaseReceipt(current.journal)
    if (!object(original) || original.version !== 2 || original.kind !== "unactivated-preparation" || Object.keys(original).length !== 7 ||
      !Array.isArray(original.slotIds) || !original.slotIds.length || JSON.stringify(original.identity) !== JSON.stringify(identity) ||
      !["unactivated", "finalizing"].includes(String(original.phase)) ||
      !object(command) || command.phase !== "finalizing" || command.commandId !== current.commandId ||
      JSON.stringify(command.identity) !== JSON.stringify(identity) || JSON.stringify(current.identity) !== JSON.stringify(identity))
      throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    const reference = { path: incident, sha256: hash(original) }, recovery = command.kind === "unactivated-recovery"
    if (recovery ? JSON.stringify(command.incident) !== JSON.stringify(reference) : current.journal !== incident || command.kind !== "unactivated-preparation") return
    if (Object.keys(command).length !== (recovery ? 9 : 7) || typeof command.processInventory !== "string" ||
      recovery && (!Array.isArray(command.slotIncidents) || command.slotIncidents.length !== original.slotIds.length) ||
      recovery && !current.lineage.some(entry => entry.journal === incident && entry.commandId === original.commandId && JSON.stringify(entry.identity) === JSON.stringify(identity)) ||
      !current.releaseEvidence || current.releaseEvidence.path !== `${current.journal}.server-finalization.json`)
      throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    const server = await readLeaseReceipt(current.releaseEvidence.path)
    const selected = parseSlots(file, original.slotIds.length).slots.slice(0, original.slotIds.length)
    if (!object(server) || hash(server) !== current.releaseEvidence.sha256 || server.kind !== "unactivated-server-finalization" || server.status !== "confirmed" ||
      server.key !== key || server.token !== current.token || server.revision !== current.revision || server.serverEpoch !== identity.serverEpoch ||
      JSON.stringify(original.slotIds) !== JSON.stringify(selected.map(slot => slot.id)) || !Array.isArray(server.slots) || server.slots.length !== selected.length)
      throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    const processes = await readAdminProcessInventory(file, identity, { file: command.processInventory, journal: current.journal,
      commandId: current.commandId, producerPid: current.owner.pid })
    if (JSON.stringify(processes.source) !== JSON.stringify(server.processInventory)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    const slots = []
    for (const [index, slot] of selected.entries()) {
      const source = server.slots[index]
      if (!object(source) || source.slotId !== slot.id || !object(source.cleanup) || typeof source.cleanup.path !== "string" ||
        !source.cleanup.path.endsWith(".cleanup.json") || path.dirname(source.cleanup.path) !== file.controller.stateDir || typeof source.cleanup.sha256 !== "string")
        throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
      const slotIncident = recovery ? (command.slotIncidents as unknown[])[index] : source.cleanup.path.slice(0, -".cleanup.json".length)
      if (typeof slotIncident !== "string") throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
      const manifest = await readLeaseReceipt(slotIncident)
      if (!object(manifest) || manifest.journal !== incident || manifest.commandId !== original.commandId)
        throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
      const finalized = await finalizeReleasedSlot(file, slot, identity, slotIncident, lockRoot)
      if (finalized.cleanupReceipt !== source.cleanup.path || hash(await readLeaseReceipt(finalized.cleanupReceipt)) !== source.cleanup.sha256)
        throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
      slots.push({ slotId: slot.id, cleanup: { path: source.cleanup.path, sha256: source.cleanup.sha256 } })
    }
    const result: PreparationRecoveryResult = { version: 2, kind: "preparation-recovery", status: "released", ready: false, identity,
      incident, journal: current.journal, receipt: `${current.journal}.result.json`,
      finalization: { status: "released", slots, server: current.releaseEvidence } }
    await writePreparationCompletion(file, result, reference)
    return { ...result, status: "already_released" as const }
  })
}

async function writePreparationCompletion(file: SlotFile, result: PreparationRecoveryResult, incident: unknown) {
  const proofs = await completionProofs(file, result.finalization)
  await writeLeaseReceipt(result.receipt, result)
  await writeLeaseReceipt(`${result.incident}.completion.json`, { version: 2, kind: "preparation-recovery-completion", identity: result.identity,
    incident, result: { path: result.receipt, sha256: hash(result) }, proofs })
}

async function readPreparationCompletion(file: SlotFile, identity: ServerIdentity, incident: string) {
  if (path.dirname(incident) !== file.controller.stateDir || path.resolve(incident) !== incident)
    throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_INVALID", 2)
  const marker = await readLeaseReceipt(`${incident}.completion.json`).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
  })
  if (marker === undefined) return
  if (!object(marker) || Object.keys(marker).length !== 6 || marker.version !== 2 || marker.kind !== "preparation-recovery-completion" ||
    JSON.stringify(marker.identity) !== JSON.stringify(identity) || !object(marker.incident) || marker.incident.path !== incident ||
    hash(await readLeaseReceipt(incident)) !== marker.incident.sha256 || !object(marker.result) || typeof marker.result.path !== "string" ||
    path.dirname(marker.result.path) !== file.controller.stateDir || !Array.isArray(marker.proofs))
    throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
  const result = await readLeaseReceipt(marker.result.path)
  if (!object(result) || Object.keys(result).length !== 9 || result.version !== 2 || result.kind !== "preparation-recovery" || result.status !== "released" ||
    result.ready !== false || result.incident !== incident || JSON.stringify(result.identity) !== JSON.stringify(identity) ||
    result.receipt !== marker.result.path || typeof result.journal !== "string" || path.dirname(result.journal) !== file.controller.stateDir ||
    result.receipt !== `${result.journal}.result.json` || hash(result) !== marker.result.sha256 ||
    JSON.stringify(await completionProofs(file, result.finalization)) !== JSON.stringify(marker.proofs))
    throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
  return { ...(result as PreparationRecoveryResult), status: "already_released" as const }
}

async function completionProofs(file: SlotFile, finalization: unknown) {
  const proofs = new Map<string, string>()
  const read = async (reference: unknown): Promise<Record<string, unknown>> => {
    if (!object(reference) || Object.keys(reference).length !== 2 || typeof reference.path !== "string" ||
      !reference.path.startsWith(file.controller.stateDir + path.sep) || path.resolve(reference.path) !== reference.path ||
      typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(reference.sha256)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    const value = await readLeaseReceipt(reference.path)
    if (!object(value) || hash(value) !== reference.sha256 || proofs.has(reference.path) && proofs.get(reference.path) !== reference.sha256)
      throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    proofs.set(reference.path, reference.sha256)
    return value
  }
  if (!object(finalization) || finalization.status !== "released" || !Array.isArray(finalization.slots))
    throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
  const server = await read(finalization.server)
  if (server.kind !== "unactivated-server-finalization" || server.status !== "confirmed" ||
    JSON.stringify(server.slots) !== JSON.stringify(finalization.slots)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
  const inventories = [server.processInventory]
  const previous = async (value: unknown) => {
    if (!Array.isArray(value)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    for (const prior of value) {
      if (!object(prior) || !Array.isArray(prior.connections)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
      await read(prior.command)
      for (const connection of prior.connections) await read(connection)
      inventories.push(prior.processInventory)
    }
  }
  if (server.command !== undefined) await read(server.command)
  await previous(server.recoveryProcessInventories ?? [])
  for (const slot of finalization.slots) {
    if (!object(slot) || !file.slots.some(configured => configured.id === slot.slotId)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    const cleanup = await read(slot.cleanup)
    if (cleanup.kind !== "unactivated-environment-finalization" || cleanup.status !== "confirmed" || cleanup.slotId !== slot.slotId ||
      cleanup.processes !== "confirmed" || cleanup.serverSessions !== "confirmed" || cleanup.archive !== "committed" ||
      cleanup.storageDeletionAllowed !== true || cleanup.nextAdmissionAllowed !== true || !object(cleanup.profileArchive) ||
      cleanup.recoveryProcessInventories !== undefined && !Array.isArray(cleanup.recoveryProcessInventories)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    await read(cleanup.command)
    await read({ path: cleanup.profileArchive.journal, sha256: cleanup.profileArchive.sha256 })
    const observation = await read(cleanup.observation)
    await read(observation.command)
    if (object(observation.ownership)) await read({ path: observation.ownership.path, sha256: observation.ownership.sha256 })
    inventories.push(cleanup.processInventory)
    await previous(cleanup.recoveryProcessInventories ?? [])
  }
  for (const reference of inventories) {
    const inventory = await read(reference)
    if (!Array.isArray(inventory.connections)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
    for (const entry of inventory.connections) {
      if (!object(entry) || typeof entry.directory !== "string" || path.dirname(entry.directory) !== file.controller.stateDir ||
        !/^admin-[a-zA-Z0-9_-]+$/.test(path.basename(entry.directory))) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
      const target = path.join(entry.directory, "connection.json"), value = await readLeaseReceipt(target)
      const receipt = await read({ path: target, sha256: hash(value) })
      if (!object(receipt.finalization)) throw new EvalFailure("PREPARATION_COMPLETION_UNCONFIRMED", 2)
      await read(receipt.finalization.command)
    }
  }
  return [...proofs].sort(([a], [b]) => a < b ? -1 : 1).map(([path, sha256]) => ({ path, sha256 }))
}

/** Adopts reservations only; native/process/archive proof is required before release. */
export async function recoverPreparationLeases(file: SlotFile, identity: ServerIdentity, incident: string, lockRoot = globalLockRoot) {
  if (path.dirname(incident) !== file.controller.stateDir || path.resolve(incident) !== incident)
    throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_INVALID", 2)
  const original = await readLeaseReceipt(incident)
  if (!object(original) || Object.keys(original).length !== 7 || original.version !== 2 || original.kind !== "unactivated-preparation" ||
    typeof original.commandId !== "string" || !original.commandId || !Array.isArray(original.slotIds) || !original.slotIds.length ||
    JSON.stringify(original.identity) !== JSON.stringify(identity) || !["unactivated", "finalizing"].includes(String(original.phase)) ||
    typeof original.processInventory !== "string" || path.dirname(original.processInventory) !== file.controller.stateDir)
    throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_INVALID", 2)
  const selected = parseSlots(file, original.slotIds.length).slots.slice(0, original.slotIds.length)
  if (JSON.stringify(original.slotIds) !== JSON.stringify(selected.map(slot => slot.id))) throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_INVALID", 2)
  const names = await readdir(file.controller.stateDir), slotIncidents = []
  for (const slot of selected) {
    const candidates = []
    for (const name of names.filter(name => name.startsWith(`slot-${slot.id}-`) && name.endsWith(".lease.json"))) {
      const source = path.join(file.controller.stateDir, name), value = await readLeaseReceipt(source)
      if (object(value) && value.commandId === original.commandId && value.journal === incident &&
        JSON.stringify(value.identity) === JSON.stringify(identity) && JSON.stringify(value.slot) === JSON.stringify(slot)) candidates.push({ source, value })
    }
    if (candidates.length !== 1 || candidates[0]!.value.state !== "retained") throw new EvalFailure("PREPARATION_RECOVERY_SLOT_UNCONFIRMED", 2)
    slotIncidents.push(candidates[0]!.source)
  }
  const key = `server:${identity.containerId}`, current = await readResourceReservation({ key, lockRoot })
  const chain = current && [...current.lineage, current]
  const position = chain?.findIndex(entry => entry.journal === incident && entry.commandId === original.commandId)
  if (!current || current.state === "released" || position === undefined || position < 0 ||
    chain!.slice(position).some(entry => JSON.stringify(entry.identity) !== JSON.stringify(identity)))
    throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  const reference = { path: incident, sha256: hash(original) }
  for (const entry of chain!.slice(position + 1)) {
    const recovery = await readLeaseReceipt(entry.journal)
    if (!object(recovery) || recovery.kind !== "unactivated-recovery" || recovery.commandId !== entry.commandId ||
      JSON.stringify(recovery.incident) !== JSON.stringify(reference) || JSON.stringify(recovery.identity) !== JSON.stringify(identity))
      throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  }
  const commandId = crypto.randomUUID(), journal = path.join(file.controller.stateDir, `recover-command-${commandId}.json`)
  const processInventory = path.join(file.controller.stateDir, `processes-${commandId}.json`)
  const command = { version: 2, kind: "unactivated-recovery", commandId, identity, incident: reference, slotIncidents,
    slotRecoveries: [] as string[], phase: "unactivated", processInventory }
  await writeLeaseReceipt(journal, command)
  await writeLeaseReceipt(processInventory, { version: 2, kind: "admin-processes", commandId, journal, identity, connections: [] })
  const server = await recoverResourceLease({ key, identity, journal, commandId, lockRoot },
    { token: current.token, revision: current.revision, incidentToken: chain![position]!.token })
  const slots: SlotLease[] = []
  try {
    if (hash(await readLeaseReceipt(incident)) !== reference.sha256) throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_CHANGED", 2)
    for (const [index, slot] of selected.entries()) {
      await server.assertHeld()
      const lease = await recoverSlotLease(file, slot, identity, slotIncidents[index]!, lockRoot)
      slots.push(lease)
      command.slotRecoveries.push(lease.receipt)
      await writeLeaseReceipt(journal, command)
    }
    await server.assertHeld()
    return { server, slots, journal }
  } catch (error) {
    await Promise.all([server.close(), ...slots.map(lease => lease.close())])
    throw error
  }
}

/** Revalidates every earlier controller's admin closure before archive or release. */
export async function readPreparationRecoverySources(file: SlotFile, environment: Awaited<ReturnType<typeof acquireEnvironmentLeases>>) {
  const server = environment.server, identity = server.reservation.identity
  await server.assertHeld()
  const command = await readLeaseReceipt(server.reservation.journal)
  if (!identity || server.reservation.state !== "recovery-only" || server.reservation.owner.pid !== process.pid ||
    server.reservation.key !== `server:${identity.containerId}` || !object(command) || Object.keys(command).length !== 9 ||
    command.kind !== "unactivated-recovery" || command.commandId !== server.reservation.commandId ||
    !["unactivated", "finalizing"].includes(String(command.phase)) || JSON.stringify(command.identity) !== JSON.stringify(identity) ||
    !object(command.incident) || typeof command.incident.path !== "string" || path.dirname(command.incident.path) !== file.controller.stateDir ||
    !Array.isArray(command.slotIncidents) || JSON.stringify(command.slotRecoveries) !== JSON.stringify(environment.slots.map(lease => lease.receipt)))
    throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  const incidentPath = command.incident.path
  const original = await readLeaseReceipt(incidentPath)
  if (!object(original) || Object.keys(original).length !== 7 || original.kind !== "unactivated-preparation" || original.version !== 2 ||
    typeof original.commandId !== "string" || !original.commandId ||
    hash(original) !== command.incident.sha256 || JSON.stringify(original.identity) !== JSON.stringify(identity) ||
    !["unactivated", "finalizing"].includes(String(original.phase)) ||
    JSON.stringify(original.slotIds) !== JSON.stringify(environment.slots.map(lease => lease.slot.id)) ||
    command.slotIncidents.length !== environment.slots.length)
    throw new EvalFailure("PREPARATION_RECOVERY_INCIDENT_CHANGED", 2)
  for (const [index, lease] of environment.slots.entries()) {
    await lease.assertHeld()
    const source = await readLeaseReceipt(lease.receipt), incident = command.slotIncidents[index]
    if (!lease.recoveryOnly || !object(source) || source.kind !== "slot-recovery" || source.incident !== incident || typeof incident !== "string" ||
      path.dirname(incident) !== file.controller.stateDir || JSON.stringify(lease.identity) !== JSON.stringify(identity))
      throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    const prior = await readLeaseReceipt(incident)
    if (!object(prior) || prior.journal !== command.incident.path || prior.commandId !== original.commandId || prior.token !== source.incidentToken ||
      prior.state !== "retained" || JSON.stringify(prior.slot) !== JSON.stringify(lease.slot) || JSON.stringify(prior.identity) !== JSON.stringify(identity))
      throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  }
  return preparationProcessSources(file, server, { path: incidentPath, sha256: hash(original) }, original.commandId)
}

async function preparationProcessSources(file: SlotFile, server: Awaited<ReturnType<typeof recoverResourceLease>>, incident: { path: string; sha256: string }, commandId: string) {
  await server.assertHeld()
  const identity = server.reservation.identity
  if (!identity || server.reservation.key !== `server:${identity.containerId}` || server.reservation.state !== "recovery-only" || server.reservation.owner.pid !== process.pid)
    throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  const position = server.reservation.lineage.findIndex(entry => entry.journal === incident.path && entry.commandId === commandId)
  if (position < 0) throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  const sources = []
  for (const [index, entry] of server.reservation.lineage.slice(position).entries()) {
    const prior = await readLeaseReceipt(entry.journal)
    if (!object(prior) || prior.commandId !== entry.commandId || JSON.stringify(prior.identity) !== JSON.stringify(identity) ||
      typeof prior.processInventory !== "string" || index === 0 && hash(prior) !== incident.sha256 ||
      index > 0 && (prior.kind !== "unactivated-recovery" || JSON.stringify(prior.incident) !== JSON.stringify(incident)))
      throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    const inventory = await readAdminProcessInventory(file, identity, { file: prior.processInventory, journal: entry.journal,
      commandId: entry.commandId, producerPid: entry.owner.pid })
    if ((await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim() === entry.owner.bootId) {
      for (const identity of inventory.connections.flatMap(connection => connection.identities)) {
        const raw = await readFile(`/proc/${identity.pid}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null
          throw new EvalFailure("PREPARATION_PROCESS_LIVENESS_UNCONFIRMED", 2)
        })
        if (raw === null) continue
        const fields = raw.slice(raw.lastIndexOf(")") + 2).trim().split(/\s+/)
        if (fields.length < 20 || fields[19] === identity.starttime && !["Z", "X"].includes(fields[0]!))
          throw new EvalFailure("PREPARATION_PROCESS_STILL_LIVE", 2)
      }
    }
    sources.push({ command: { path: entry.journal, sha256: hash(prior) }, processInventory: inventory.source,
      connections: inventory.connections.map(connection => connection.source) })
  }
  return sources
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
