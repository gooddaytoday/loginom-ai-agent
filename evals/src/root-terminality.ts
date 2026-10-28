import path from "node:path"
import { lstat, unlink } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { readRootWitnessFile } from "./root-witness-file"
import { assertFixedSources, assertStandalonePolicy, assertWitnessHost, digest, loadRootPolicy, parseRootWitness, witnessRoot, type RootPolicy, type RootWitness } from "./root-terminality-policy"
import { validateWitnessSource } from "./witness-source"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt, type acquireResourceLease, type Reservation } from "./lease"
import { loadResourceSlots, type SlotLease } from "./slots"
import { tryCampaignLock } from "./campaign-lock"
import { assertRecoveryInvocation, requireInactiveUnits } from "./root-terminality-publisher"
import { assertProfileSettled } from "./profile"

type ServerLease = Awaited<ReturnType<typeof acquireResourceLease>>
export type RootRecovery = { readonly commandId: string }
export type RootTerminalityProof = { version: 1; kind: "root-terminality"; commandId: string; slotId: string; witnessSha256: string }
type Context = { policy: RootPolicy; policySha256: string; witness: RootWitness; witnessSha256: string }
const contexts = new WeakMap<RootRecovery, Context>()
const observed = new WeakMap<RootTerminalityProof, { recovery: RootRecovery; server: ServerLease; lease: SlotLease; bytes: string }>()

/** Explicit zero-attempt entrypoint; never called by campaign admission or normal prepare. */
export async function recoverRootPreparation(commandId: string) {
  await assertRecoveryInvocation()
  const loaded = loadRootPolicy(commandId), policy = loaded.policy
  if (process.getuid?.() !== policy.owner.uid) throw Error("ROOT_RECOVERY_UID")
  assertWitnessHost(policy)
  validateWitnessSource(policy.controllerLock)
  const release = await tryCampaignLock(policy.controllerLock.file)
  if (!release) throw Error("ROOT_WITNESS_LOCK_BUSY")
  const recovery: RootRecovery = Object.freeze({ commandId })
  try {
    validateWitnessSource(policy.controllerLock)
    await requireInactiveUnits(policy)
    if (digest(readFileSync(policy.binary)) !== policy.cliSha256) throw Error("ROOT_RECOVERY_BINARY_CHANGED")
    assertFixedSources(policy)
    const file = await loadResourceSlots(policy.slotsFile)
    if (file.controller.stateDir !== policy.stateDir || file.slots.length !== policy.slots.length || file.slots.some(s =>
      !policy.slots.some(p => p.id === s.id && p.profile === s.profileDir))) throw Error("ROOT_RECOVERY_SCOPE")
    const current = await readLeaseReceipt(policy.server.file) as Reservation
    const { reconcileEnvironment, releaseClosedEnvironment } = await import("./startup-reconciliation")
    // Replay after complete native release is a validation-only terminal path.
    if (current.state === "released") {
      requireReleasedOrigin(current, policy.server.sha256)
      for (const slot of policy.slots) {
        requireReleasedOrigin(await readLeaseReceipt(slot.reservation.file) as Reservation, slot.reservation.sha256)
      }
      await releaseClosedEnvironment(file, current.identity!, globalLockRoot)
      return { status: "already-released" as const, commandId }
    }
    assertStandalonePolicy(policy)
    // A partially released cohort is refused rather than interpreting missing rows
    // or registrations as success. Native archive replay before release is supported.
    for (const slot of policy.slots) { validateWitnessSource(slot.reservation); validateWitnessSource(slot.composite) }
    const bytes = readRootWitnessFile(path.join(witnessRoot, `${commandId}.json`), 65536)
    const witness = parseRootWitness(JSON.parse(bytes.toString()))
    if (witness.policySha256 !== loaded.policySha256 || witness.observer.pid === policy.owner.pid ||
      BigInt(witness.observer.starttime) < BigInt(policy.owner.starttime)) throw Error("ROOT_WITNESS_BINDING")
    contexts.set(recovery, { ...loaded, witness, witnessSha256: digest(bytes) })
    await reconcileEnvironment(file, current.identity!, policy.binary, globalLockRoot, recovery)
    await releaseClosedEnvironment(file, current.identity!, globalLockRoot)
    return { status: "released" as const, commandId }
  } finally { contexts.delete(recovery); await release() }
}


function currentContext(recovery: RootRecovery) {
  const saved = contexts.get(recovery)
  if (!saved) throw Error("ROOT_TERMINALITY_UNTRUSTED")
  const current = loadRootPolicy(recovery.commandId)
  if (current.policySha256 !== saved.policySha256 || digest(readRootWitnessFile(path.join(witnessRoot, `${recovery.commandId}.json`), 65536)) !== saved.witnessSha256)
    throw Error("ROOT_WITNESS_CHANGED")
  assertWitnessHost(saved.policy); assertFixedSources(saved.policy); assertStandalonePolicy(saved.policy)
  validateWitnessSource(saved.policy.controllerLock)
  return saved
}

export async function rootTerminalityForSlot(recovery: RootRecovery, server: ServerLease, lease: SlotLease): Promise<RootTerminalityProof> {
  const context = currentContext(recovery), policy = context.policy
  await server.assertHeld(); await lease.assertHeld()
  const slot = policy.slots.find(slot => slot.id === lease.slot.id && slot.profile === lease.slot.profileDir)
  if (!slot || server.receipt !== policy.server.file || lease.receipt !== slot.composite.file ||
    server.reservation.commandId !== policy.commandId || JSON.stringify(server.reservation.owner) !== JSON.stringify(policy.owner)) throw Error("ROOT_SLOT_SCOPE")
  validateWitnessSource(slot.reservation); validateWitnessSource(slot.composite)
  const proof: RootTerminalityProof = { version: 1, kind: "root-terminality", commandId: policy.commandId, slotId: slot.id, witnessSha256: context.witnessSha256 }
  const supplement = path.join(policy.stateDir, `root-terminality-${lease.token}.json`)
  await preserveReceipt(supplement, proof)
  const completed = path.join(policy.stateDir, `root-registration-${lease.token}.json`)
  const completion = { ...proof, kind: "root-registration-release", registration: slot.registration }
  const present = await lstat(`${slot.profile}.process-group`).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return; throw error })
  if (slot.registration && present) {
    validateWitnessSource(slot.registration)
    await server.assertHeld(); await lease.assertHeld()
    validateWitnessSource(slot.registration)
    await unlink(slot.registration.file)
    await preserveReceipt(completed, completion)
  } else if (slot.registration) {
    if (JSON.stringify(await readLeaseReceipt(completed)) !== JSON.stringify(completion)) throw Error("ROOT_REGISTRATION_OUTCOME_UNKNOWN")
  } else if (present) throw Error("ROOT_REGISTRATION_CHANGED")
  observed.set(proof, { recovery, server, lease, bytes: JSON.stringify(proof) })
  await validateRootTerminality(proof, server, lease)
  return proof
}
export async function validateRootTerminality(proof: RootTerminalityProof, server: ServerLease, lease: SlotLease) {
  const saved = observed.get(proof)
  if (!saved || saved.server !== server || saved.lease !== lease || saved.bytes !== JSON.stringify(proof)) throw Error("ROOT_TERMINALITY_UNTRUSTED")
  const context = currentContext(saved.recovery), slot = context.policy.slots.find(s => s.id === lease.slot.id)!
  await server.assertHeld(); await lease.assertHeld()
  validateWitnessSource(slot.composite); validateWitnessSource(slot.reservation)
  if (await lstat(`${slot.profile}.process-group`).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return; throw error }))
    throw Error("ROOT_REGISTRATION_CHANGED")
  // Historical lineage terminality is not profile writer/auth settlement.
  await assertProfileSettled(slot.profile)
  await server.assertHeld(); await lease.assertHeld()
}
async function preserveReceipt(file: string, value: object) {
  if (await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return; throw error })) {
    if (JSON.stringify(await readLeaseReceipt(file)) !== JSON.stringify(value)) throw Error("ROOT_SUPPLEMENT_CHANGED")
    return
  }
  await writeLeaseReceipt(file, value)
}
function requireReleasedOrigin(current: Reservation, originalHash: string) {
  if (current.state !== "released" || !current.releaseEvidence || digest(JSON.stringify({ ...current, state: "retained", releaseEvidence: undefined })) !== originalHash)
    throw Error("ROOT_RELEASE_ORIGIN")
}
