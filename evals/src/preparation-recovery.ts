import path from "node:path"
import { readdir } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, recoverResourceLease, writeLeaseReceipt } from "./lease"
import { parseSlots, recoverSlotLease, type ServerIdentity, type SlotFile, type SlotLease } from "./slots"

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

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
