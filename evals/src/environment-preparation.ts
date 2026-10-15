import path from "node:path"
import { lstat } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { finalizeUnactivatedEnvironment } from "./environment-finalization"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { openLoginomAdmin } from "./loginom-admin"
import { prepareUserStorage, readServerIdentity, verifyParallelPair } from "./parallel-pair"
import { acquireEnvironmentLeases, loadSlots } from "./slots"
import { readUserConfiguration, readUserOwnership, readUserPreparation, stageUserPreparation } from "./user-environment"

export class EnvironmentFailure extends EvalFailure {
  constructor(message: string, readonly receipt: string) { super(message, 2) }
}

export async function prepareEnvironment(input: { slotsFile: string; parallel: number }, lockRoot = globalLockRoot) {
  return checkEnvironment(input, lockRoot, "prepare")
}

export async function verifyEnvironment(input: { slotsFile: string; parallel: number }, lockRoot = globalLockRoot) {
  return checkEnvironment(input, lockRoot, "verify")
}

async function checkEnvironment(input: { slotsFile: string; parallel: number }, lockRoot: string, operation: "prepare" | "verify") {
  const file = await loadSlots(input.slotsFile, input.parallel)
  const identity = await readServerIdentity(file)
  await verifyParallelPair(file, identity)
  const commandId = crypto.randomUUID(), journal = path.join(file.controller.stateDir, `${operation}-command-${commandId}.json`)
  const processInventory = path.join(file.controller.stateDir, `processes-${commandId}.json`)
  const receipt = path.join(file.controller.stateDir, `${operation === "prepare" ? "preparation" : "verification"}-${commandId}.json`)
  const kind = operation === "prepare" ? "environment-preparation" : "environment-verification"
  const failure = { finalization: { status: "unconfirmed" as const } as { status: "unconfirmed"; reason?: string } |
    Awaited<ReturnType<typeof finalizeUnactivatedEnvironment>> }
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity,
    slotIds: file.slots.slice(0, input.parallel).map(slot => slot.id), phase: "unactivated", processInventory })
  await writeLeaseReceipt(processInventory, { version: 2, kind: "admin-processes", commandId, journal, identity, connections: [] })
  const failed = async (error: unknown): Promise<never> => {
    await writeLeaseReceipt(receipt, { version: 2, kind, commandId, identity, journal, receipt,
      status: "failed", ready: false, reason: error instanceof EvalFailure ? error.message : "PREPARATION_FAILED", finalization: failure.finalization })
    throw new EnvironmentFailure(error instanceof EvalFailure ? error.message : "PREPARATION_FAILED", receipt)
  }
  const environment = await acquireEnvironmentLeases(file, input.parallel, identity, journal, lockRoot).catch(failed)
  try {
    const admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, processInventory })
    try {
      const slots = [], changedUsers = [], changedPasswords = []
      for (const lease of environment.slots) {
        const existing = await lstat(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined
          throw error
        })
        const prepared = operation === "verify" ? await readUserPreparation(file, lease, path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)) :
          await stageUserPreparation(file, lease, new Bun.CryptoHasher("sha256").update(JSON.stringify({ identity, slot: lease.slot,
            authMode: 1, isAdmin: false, isDesigner: true, isViewer: false, useGlobalFileStorage: false, schedulerFullAccess: false, allowPublish: false })).digest("hex"))
        if (operation === "prepare") {
          await admin.reconcileUser(lease, prepared.secretFile)
          await prepareUserStorage(file, lease, prepared.secretFile, environment.server)
        }
        const owned = await readUserOwnership(file, lease, prepared.secretFile)
        const configured = await readUserConfiguration(file, lease, prepared.secretFile)
        if (!configured) throw new EvalFailure("USER_CONFIGURATION_UNCONFIRMED", 2)
        if (operation === "prepare" && !existing) changedUsers.push(lease.slot.username)
        if (operation === "prepare" && (configured.observation.reply.data as { passwordChanged: boolean }).passwordChanged) changedPasswords.push(lease.slot.username)
        slots.push({ id: lease.slot.id, username: lease.slot.username, preparationNonce: prepared.nonce, userKey: owned.userKey, objectId: owned.objectId })
      }
      const reason = await admin.inspect().then(() => "PREPARATION_READINESS_UNPROVEN", error =>
        error instanceof EvalFailure ? error.message : "PREPARATION_CHECK_FAILED")
      // Qualified CLI sessions, effective probes, backup policy and fingerprint are still mandatory.
      const finalization = await finalizeUnactivatedEnvironment(file, environment, admin)
      const result = { version: 2, kind, commandId, identity, journal, status: "blocked" as const, ready: false as const,
        reason, slots, changedUsers, changedPasswords, finalization }
      await writeLeaseReceipt(receipt, result)
      return { ...result, receipt, code: 2 as const }
    } catch (error) {
      const command = await readLeaseReceipt(journal)
      if (command !== null && typeof command === "object" && "phase" in command && command.phase === "unactivated")
        failure.finalization = await finalizeUnactivatedEnvironment(file, environment, admin).catch(error =>
          ({ status: "unconfirmed" as const, reason: error instanceof EvalFailure ? error.message : "ENVIRONMENT_FINALIZATION_FAILED" }))
      throw error
    } finally { await admin.dispose() }
  } catch (error) { return failed(error) }
  finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]) }
}
