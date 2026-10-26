import { rootTerminalityForSlot, type RootRecovery, type RootTerminalityProof } from "./root-terminality"
import { observeTerminalPreparation, type TerminalPreparationProof } from "./terminal-preparation"
import { readStartupArchive } from "./startup-archive"
import { EvalFailure } from "./fail"
import path from "node:path"
import { lstat, readdir, unlink } from "node:fs/promises"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, writeLeaseReceipt } from "./lease"
import { closeUserSessions, openLoginomAdmin } from "./loginom-admin"
import { inspectAbsentUserStorage, verifyParallelPair } from "./parallel-pair"
import { assertProfileClean, waitProfileIdle } from "./profile"
import { observeUnitExit, registrationIdentity, type ProcessCleanup, type UnitBinding } from "./process-supervisor"
import { assertSessionBackupEmpty, cleanupSlotStorage } from "./slot-storage"
import { reopenEnvironmentLeases, type ServerIdentity, type SlotFile, type SlotLease } from "./slots"

type StartupRecovery = {
  unitBinding: UnitBinding; owner: UnitBinding["producer"] & { bootId: string }; lease: SlotLease
  server: NonNullable<Awaited<ReturnType<typeof reopenEnvironmentLeases>>>["server"]
}

export async function releaseClosedEnvironment(file: SlotFile, identity: ServerIdentity, lockRoot = globalLockRoot) {
  const environment = await reopenEnvironmentLeases(file, identity, lockRoot)
  try {
    if (environment?.slots.length) throw new EvalFailure("STARTUP_FINAL_PROOFS_UNCONFIRMED", 2)
    const keys = [...file.slots.map(slot => `profile:${slot.profileDir}`), ...(environment ? [] : [`server:${identity.containerId}`])]
    for (const key of keys) {
      const reservation = await readResourceReservation({ key, lockRoot })
      if (reservation?.state !== "released" || JSON.stringify(reservation.identity) !== JSON.stringify(identity))
        throw new EvalFailure("STARTUP_FINAL_PROOFS_UNCONFIRMED", 2)
      const proof = await readLeaseReceipt(reservation.releaseEvidence!.path)
      if (new Bun.CryptoHasher("sha256").update(JSON.stringify(proof)).digest("hex") !== reservation.releaseEvidence!.sha256)
        throw new EvalFailure("STARTUP_FINAL_PROOFS_UNCONFIRMED", 2)
    }
    if (!environment) return
    const reservation = environment.server.reservation
    const proofs = [
      { file: path.join(file.controller.stateDir, `cleanup-${reservation.commandId}-server.json`), reasons: ["run-slots-clean", "prepared-environment-clean"] },
      { file: path.join(file.controller.stateDir, `startup-${reservation.token}-server.json`), reasons: ["startup-slots-clean"] },
    ]
    for (const proof of proofs) {
      if (!await Bun.file(proof.file).exists()) continue
      const evidence = await readLeaseReceipt(proof.file) as { reason?: string }
      if (!evidence || !proof.reasons.includes(evidence.reason ?? "")) throw new EvalFailure("STARTUP_FINAL_PROOFS_UNCONFIRMED", 2)
      await environment.server.release(proof.file)
      return
    }
    throw new EvalFailure("STARTUP_FINAL_PROOFS_UNCONFIRMED", 2)
  } finally { if (environment) await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]) }
}

export async function reconcileEnvironment(file: SlotFile, identity: ServerIdentity, binary: string, lockRoot = globalLockRoot, rootRecovery?: RootRecovery) {
  const environment = await reopenEnvironmentLeases(file, identity, lockRoot)
  if (!environment) return
  try {
    const reservation = environment.server.reservation
    const command = await readLeaseReceipt(reservation.journal) as { runDir?: string; unitBinding?: UnitBinding; attempts?: { slotId: string; taskId: string; attempt: number }[] }
    const admins = (await readdir(file.controller.stateDir)).filter(name => /^admin-[a-zA-Z0-9_-]+$/.test(name))
    let observed = false
    for (const name of admins) {
      const receipt = await readLeaseReceipt(path.join(file.controller.stateDir, name, "connection.json")) as
        { status: string; transportDisconnect: string; identity: ServerIdentity; processes: ProcessCleanup }
      if (JSON.stringify(receipt.identity) !== JSON.stringify(identity) || receipt.status !== "disposed" ||
        receipt.transportDisconnect !== "confirmed") throw new EvalFailure("STARTUP_ADMIN_CLEANUP_UNCONFIRMED", 2)
      await readStartupCleanup(path.join(file.controller.stateDir, name, "connection.json"), receipt.processes.lifetime!.producer_pid)
      observed ||= receipt.processes.lifetime!.producer_pid === reservation.owner.pid
    }
    if (!observed) throw new EvalFailure("STARTUP_ADMIN_CLEANUP_UNCONFIRMED", 2)
    const reconciled = []
    for (const lease of environment.slots) {
      const recovery = command.unitBinding ? { unitBinding: command.unitBinding, owner: reservation.owner, server: environment.server, lease } : undefined
      let processes: ProcessCleanup | TerminalPreparationProof | RootTerminalityProof | undefined = rootRecovery
        ? await rootTerminalityForSlot(rootRecovery, environment.server, lease) : await readStartupManagement({ stateDir: file.controller.stateDir, commandId: reservation.commandId,
        slotId: lease.slot.id, producerPid: reservation.owner.pid, runDir: command.runDir, recovery })
      const prefixes: string[] = [], attemptDirs: string[] = []
      for (const attempt of command.attempts?.filter(attempt => attempt.slotId === lease.slot.id) ?? []) {
        if (!command.runDir || !path.isAbsolute(command.runDir) || !/^[a-z0-9_-]+$/i.test(attempt.taskId) || !Number.isSafeInteger(attempt.attempt) || attempt.attempt < 1)
          throw new EvalFailure("STARTUP_OWNERSHIP_UNCONFIRMED", 2)
        const directory = path.join(command.runDir, attempt.taskId, String(attempt.attempt))
        processes = await reconcileStartupCleanup(path.join(directory, "cleanup.json"), reservation.owner.pid, recovery)
        prefixes.push(`eval-${path.basename(command.runDir)}-${attempt.taskId}-${attempt.attempt}`)
        attemptDirs.push(directory)
      }
      if (!processes && command.unitBinding) {
        processes = await observeTerminalPreparation(environment.server, lease)
        await writeLeaseReceipt(path.join(file.controller.stateDir, `terminal-preparation-${lease.token}-${crypto.randomUUID()}.json`), processes)
      }
      if (!await waitProfileIdle(lease.slot.profileDir, 1000)) throw new EvalFailure("STARTUP_PROCESS_CLEANUP_UNCONFIRMED", 2)
      reconciled.push({ lease, processes, prefixes, attemptDirs })
    }
    await verifyParallelPair(file, identity)
    const admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, binary })
    const cleanups: { lease: typeof environment.slots[number]; proof: string }[] = []
    try {
      await assertSessionBackupEmpty(file, identity)
      await admin.inspectPoolPolicy()
      for (const entry of reconciled) {
        const lease = entry.lease
        const prepared = await lstat(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined; throw error
        })
        const originalProof = path.join(file.controller.stateDir, `startup-${lease.token}.json`)
        const zeroAttempt = entry.attemptDirs.length === 0
        // The new reader proves only zero-attempt archives. Admitted attempts keep
        // their existing process/storage recovery contract and original receipts.
        const prior = prepared && zeroAttempt ? await readStartupArchive(originalProof, environment.server, lease) : undefined
        const originalBytes = await Bun.file(originalProof).text().catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })
        const cleanup = prepared ? entry.processes && await cleanupSlotStorage(file, environment.server, lease, admin, entry.processes, entry.prefixes, entry.attemptDirs, prior, zeroAttempt) : undefined
        if (prepared && !cleanup) throw new EvalFailure("STARTUP_PROCESS_CLEANUP_UNCONFIRMED", 2)
        if (!prepared) {
          await assertProfileClean(lease.slot.profileDir)
          await closeUserSessions(admin, lease.slot.username)
          await inspectAbsentUserStorage(file, identity, lease.slot)
        }
        const proof = originalBytes !== undefined ? path.join(file.controller.stateDir, `startup-${lease.token}-revalidated-${crypto.randomUUID()}.json`) : originalProof
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
          processes: "confirmed", serverSessions: "confirmed", archive: "committed", profileArchive: cleanup?.archive ?? null,
          ...(cleanup?.archiveInventory ? { archiveInventory: cleanup.archiveInventory } : {}),
          ...(originalBytes !== undefined ? { priorStartup: { file: originalProof, sha256: new Bun.CryptoHasher("sha256").update(originalBytes).digest("hex") } } : {}),
          ...(prior ? { priorArchive: prior } : {}),
          closed: cleanup?.closed ?? [], removed: cleanup?.removed ?? [], attemptDirs: entry.attemptDirs, unused: !prepared, storageDeletionAllowed: true, nextAdmissionAllowed: true })
        cleanups.push({ lease, proof })
      }
    } finally { await admin.dispose() }
    for (const cleanup of cleanups) await cleanup.lease.release(cleanup.proof)
    const proof = path.join(file.controller.stateDir, `startup-${reservation.token}-server.json`)
    await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "startup-slots-clean", key: reservation.key,
      token: reservation.token, revision: reservation.revision, serverEpoch: identity.serverEpoch })
    await environment.server.release(proof)
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]) }
}

export async function readStartupManagement(input: { stateDir: string; commandId: string; slotId: string; producerPid: number; runDir?: string; recovery?: StartupRecovery }) {
  const root = input.runDir ? path.join(input.runDir, "preparation", input.slotId)
    : path.join(input.stateDir, `management-${input.commandId}-${input.slotId}`)
  const names = await readdir(root).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error })
  let processes: ProcessCleanup | undefined
  for (const name of names) processes = await reconcileStartupCleanup(path.join(root, name, "cleanup.json"), input.producerPid, input.recovery)
  return processes
}

export async function reconcileStartupCleanup(file: string, producerPid: number, recovery?: StartupRecovery) {
  try { return await readStartupCleanup(file, producerPid) }
  catch (error) {
    if (!recovery || recovery.owner.pid !== producerPid) throw error
    await recovery.server.assertHeld()
    await recovery.lease.assertHeld()
    const proof = await observeUnitExit({ sourceFile: file, profile: recovery.lease.slot.profileDir, binding: recovery.unitBinding, owner: recovery.owner })
    await writeLeaseReceipt(`${file}.unit-exit.json`, proof)
    await recovery.server.assertHeld()
    await recovery.lease.assertHeld()
    const marker = await registrationIdentity(recovery.lease.slot.profileDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (marker && JSON.stringify(marker) !== JSON.stringify(proof.registration)) throw new EvalFailure("STARTUP_REGISTRATION_CHANGED", 2)
    if (marker) await unlink(`${recovery.lease.slot.profileDir}.process-group`)
    return proof.processes
  }
}

export async function readStartupCleanup(file: string, producerPid: number) {
  const receipt = await readLeaseReceipt(file) as { processes?: ProcessCleanup }
  const processes = receipt?.processes
  if (processes?.status !== "confirmed" || !processes.capture_complete || !Array.isArray(processes.unknownProcesses) || processes.unknownProcesses.length ||
    processes.lifetime?.producer_pid !== producerPid) throw new EvalFailure("STARTUP_PROCESS_CLEANUP_UNCONFIRMED", 2)
  return processes
}
