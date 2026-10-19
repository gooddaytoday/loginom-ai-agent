import { EvalFailure } from "./fail"
import path from "node:path"
import { lstat, readdir } from "node:fs/promises"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { closeUserSessions, openLoginomAdmin } from "./loginom-admin"
import { inspectAbsentUserStorage, verifyParallelPair } from "./parallel-pair"
import { assertProfileClean, waitProfileIdle } from "./profile"
import type { ProcessCleanup } from "./process-supervisor"
import { assertSessionBackupEmpty, cleanupSlotStorage } from "./slot-storage"
import { reopenEnvironmentLeases, type ServerIdentity, type SlotFile } from "./slots"

export async function reconcileEnvironment(file: SlotFile, identity: ServerIdentity, binary: string, lockRoot = globalLockRoot) {
  const environment = await reopenEnvironmentLeases(file, identity, lockRoot)
  if (!environment) return
  try {
    const reservation = environment.server.reservation
    const command = await readLeaseReceipt(reservation.journal) as { runDir?: string; attempts?: { slotId: string; taskId: string; attempt: number }[] }
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
    await verifyParallelPair(file, identity)
    const admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, binary })
    const cleanups: { lease: typeof environment.slots[number]; proof: string }[] = []
    try {
      await assertSessionBackupEmpty(file, identity)
      await admin.inspectPoolPolicy()
      for (const lease of environment.slots) {
        let processes = await readStartupManagement({ stateDir: file.controller.stateDir, commandId: reservation.commandId,
          slotId: lease.slot.id, producerPid: reservation.owner.pid, runDir: command.runDir })
        const prefixes: string[] = []
        for (const attempt of command.attempts?.filter(attempt => attempt.slotId === lease.slot.id) ?? []) {
          if (!command.runDir || !path.isAbsolute(command.runDir) || !/^[a-z0-9_-]+$/i.test(attempt.taskId) || !Number.isSafeInteger(attempt.attempt) || attempt.attempt < 1)
            throw new EvalFailure("STARTUP_OWNERSHIP_UNCONFIRMED", 2)
          processes = await readStartupCleanup(path.join(command.runDir, attempt.taskId, String(attempt.attempt), "cleanup.json"), reservation.owner.pid)
          prefixes.push(`eval-${path.basename(command.runDir)}-${attempt.taskId}-${attempt.attempt}`)
        }
        if (!await waitProfileIdle(lease.slot.profileDir, 1000)) throw new EvalFailure("STARTUP_PROCESS_CLEANUP_UNCONFIRMED", 2)
        const prepared = await lstat(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined; throw error
        })
        const cleanup = prepared ? processes && await cleanupSlotStorage(file, environment.server, lease, admin, processes, prefixes) : undefined
        if (prepared && !cleanup) throw new EvalFailure("STARTUP_PROCESS_CLEANUP_UNCONFIRMED", 2)
        if (!prepared) {
          await assertProfileClean(lease.slot.profileDir)
          await closeUserSessions(admin, lease.slot.username)
          await inspectAbsentUserStorage(file, identity, lease.slot)
        }
        const proof = path.join(file.controller.stateDir, `startup-${lease.token}.json`)
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
          processes: "confirmed", serverSessions: "confirmed", archive: "committed", profileArchive: cleanup?.archive ?? null,
          closed: cleanup?.closed ?? [], removed: cleanup?.removed ?? [], unused: !prepared, storageDeletionAllowed: true, nextAdmissionAllowed: true })
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

export async function readStartupManagement(input: { stateDir: string; commandId: string; slotId: string; producerPid: number; runDir?: string }) {
  const root = input.runDir ? path.join(input.runDir, "preparation", input.slotId)
    : path.join(input.stateDir, `management-${input.commandId}-${input.slotId}`)
  const names = await readdir(root).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error })
  let processes: ProcessCleanup | undefined
  for (const name of names) processes = await readStartupCleanup(path.join(root, name, "cleanup.json"), input.producerPid)
  return processes
}

export async function readStartupCleanup(file: string, producerPid: number) {
  const receipt = await readLeaseReceipt(file) as { processes?: ProcessCleanup }
  const processes = receipt?.processes
  if (processes?.status !== "confirmed" || !processes.capture_complete || !Array.isArray(processes.unknownProcesses) || processes.unknownProcesses.length ||
    processes.lifetime?.producer_pid !== producerPid) throw new EvalFailure("STARTUP_PROCESS_CLEANUP_UNCONFIRMED", 2)
  return processes
}
