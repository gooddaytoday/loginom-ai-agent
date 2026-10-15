import path from "node:path"
import { readdir, readFile } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, recoverResourceLease, writeLeaseReceipt } from "./lease"
import { acquireEnvironmentLeases, loadSlots, parseSlots, recoverSlotLease, type ServerIdentity, type SlotFile, type SlotLease } from "./slots"
import { openLoginomAdmin, readAdminProcessInventory } from "./loginom-admin"
import { readServerIdentity, verifyParallelPair } from "./parallel-pair"

export async function recoverUnactivatedPreparation(input: { slotsFile: string; incident: string }, lockRoot = globalLockRoot) {
  const file = await loadSlots(input.slotsFile, 1)
  const identity = await readServerIdentity(file)
  await verifyParallelPair(file, identity)
  const environment = await recoverPreparationLeases(file, identity, input.incident, lockRoot)
  const receipt = `${environment.journal}.result.json`
  try {
    const command = await readLeaseReceipt(environment.journal)
    if (!object(command) || typeof command.processInventory !== "string") throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
    const admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, processInventory: command.processInventory })
    try {
      const { finalizeUnactivatedEnvironment } = await import("./environment-finalization")
      const finalization = await finalizeUnactivatedEnvironment(file, environment, admin)
      const result = { version: 2, kind: "preparation-recovery", status: "released", ready: false, identity,
        incident: input.incident, journal: environment.journal, receipt, finalization }
      await writeLeaseReceipt(receipt, result)
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
  const position = server.reservation.lineage.findIndex(entry => entry.journal === incidentPath && entry.commandId === original.commandId)
  if (position < 0) throw new EvalFailure("PREPARATION_RECOVERY_LINEAGE_INVALID", 2)
  const sources = []
  for (const [index, entry] of server.reservation.lineage.slice(position).entries()) {
    const prior = await readLeaseReceipt(entry.journal)
    if (!object(prior) || prior.commandId !== entry.commandId || JSON.stringify(prior.identity) !== JSON.stringify(identity) ||
      typeof prior.processInventory !== "string" || index === 0 && hash(prior) !== command.incident.sha256 ||
      index > 0 && (prior.kind !== "unactivated-recovery" || JSON.stringify(prior.incident) !== JSON.stringify(command.incident)))
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
