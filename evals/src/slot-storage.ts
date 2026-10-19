import { EvalFailure } from "./fail"
import path from "node:path"
import { childEnvironment } from "./child-environment"
import { readLeaseReceipt, type acquireResourceLease } from "./lease"
import { closeUserSessions, type AdminConnection } from "./loginom-admin"
import { inspectUserStorage, verifyParallelPair } from "./parallel-pair"
import { archiveProfileHistory, releaseStaleWriter } from "./profile"
import type { ProcessCleanup } from "./process-supervisor"
import { serverFileObservation } from "./server-files"
import type { ServerIdentity, SlotFile, SlotLease } from "./slots"
import { readUserOwnership, readUserPreparation } from "./user-environment"

export async function assertSessionBackupEmpty(file: SlotFile, identity: ServerIdentity) {
  await verifyParallelPair(file, identity)
  if (await storageCommand(identity.containerId, "empty-session-backup.sh", [file.server.backupRoot]) !== 0)
    throw new EvalFailure("SESSION_BACKUP_NOT_EMPTY_OR_UNREADABLE", 2)
}

export async function cleanupSlotStorage(file: SlotFile, server: Awaited<ReturnType<typeof acquireResourceLease>>, lease: SlotLease,
  admin: Pick<AdminConnection, "identity" | "inspectSessionInventory" | "closeUserSession">, processes: ProcessCleanup, prefixes: string[], attemptDirs: string[] = []) {
  if (processes.status !== "confirmed" || !processes.capture_complete || processes.unknownProcesses?.length)
    throw new EvalFailure("SLOT_PROCESS_CLEANUP_UNCONFIRMED", 2)
  await server.assertHeld()
  await lease.assertHeld()
  if (server.reservation.key !== `server:${lease.identity.containerId}` || JSON.stringify(admin.identity) !== JSON.stringify(lease.identity) ||
    JSON.stringify(server.reservation.identity) !== JSON.stringify(lease.identity)) throw new EvalFailure("SERVER_FENCE_UNCONFIRMED", 2)
  const secretFile = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
  const prepared = await readUserPreparation(file, lease, secretFile)
  const owned = await readUserOwnership(file, lease, secretFile)
  const published = await readLeaseReceipt(path.join(file.controller.stateDir, `storage-${lease.slot.id}.json`)) as Record<string, unknown>
  const storage = await inspectUserStorage(file, lease.identity, lease.slot, prepared.nonce)
  const expected = { version: 2, kind: "owned-user-storage", state: "published", slotId: lease.slot.id, username: lease.slot.username,
    identity: lease.identity, preparationNonce: prepared.nonce, userKey: owned.userKey, ownerSource: owned.source.sha256, root: storage.root }
  if (!published || typeof published !== "object" || Array.isArray(published) ||
    Object.entries(expected).some(([key, value]) => JSON.stringify(published[key]) !== JSON.stringify(value)) ||
    ["device", "inode", "uid", "gid"].some(key => published[key] !== storage[key as keyof typeof storage]))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  await releaseStaleWriter(lease.slot.profileDir, processes.writerRefusal ? undefined : processes.writer)
  const archive = await archiveProfileHistory(lease.slot.profileDir, prefixes.at(-1) ?? `startup-${crypto.randomUUID()}`, lease.slot.historyDir)
  const closed = await closeUserSessions(admin, lease.slot.username)
  await assertSessionBackupEmpty(file, lease.identity)
  requireServerFilesClosed(await serverFileObservation(lease.identity.containerId), storage.root)
  await server.assertHeld()
  await lease.assertHeld()
  const delivered = await readDeliveredStorage(attemptDirs, lease.slot.username)
  if (await storageCommand(lease.identity.containerId, "cleanup-slot-storage.sh", [storage.root,
    `${storage.device} ${storage.inode} ${storage.uid} ${storage.gid}`, String(prefixes.length), ...prefixes,
    ...delivered.flatMap(entry => [entry.sha256, String(entry.bytes), entry.name])]) !== 0)
    throw new EvalFailure("SLOT_STORAGE_DELETE_UNCONFIRMED", 2)
  const after = await inspectUserStorage(file, lease.identity, lease.slot, prepared.nonce)
  if (after.entries.length) throw new EvalFailure("SLOT_STORAGE_NOT_EMPTY", 2)
  return { archive, closed, removed: storage.entries.map(entry => entry.name) }
}

export async function readDeliveredStorage(attemptDirs: string[], username: string) {
  return (await Promise.all(attemptDirs.map(async directory => {
    const text = await Bun.file(path.join(directory, "events.jsonl")).text().catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return text.split("\n").filter(line => line.trim()).flatMap(line => {
      const event = JSON.parse(line) as { type?: string; part?: { tool?: string; state?: { status?: string; output?: string } } }
      if (event?.type !== "tool_use" || event.part?.tool !== "loginom_dock_artifact_deliver" ||
        event.part.state?.status !== "completed" || typeof event.part.state.output !== "string") return []
      const receipt = JSON.parse(event.part.state.output) as { state?: string; status?: string; cleanup_complete?: boolean;
        output?: { status?: string; destination?: string; bytes?: number; sha256?: string; upload_completion_verified?: boolean; cleanup_complete?: boolean } }
      const output = receipt?.output
      if (receipt?.state !== "settled" || receipt.status !== "SUCCEEDED" || receipt.cleanup_complete !== true ||
        output?.status !== "SUCCEEDED" || output.cleanup_complete !== true || output.upload_completion_verified !== true ||
        typeof output.destination !== "string" || typeof output.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(output.sha256) ||
        !Number.isSafeInteger(output.bytes) || output.bytes! < 0) return []
      const name = path.posix.basename(output.destination)
      return /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(name) && output.destination === `/${username}/${name}`
        ? [{ name, bytes: output.bytes!, sha256: output.sha256 }] : []
    })
  }))).flat()
}

export function requireServerFilesClosed(observed: {
  complete: boolean; files: { target: string }[]; processes: { maps: string }[]
}, root: string) {
  if (!observed.complete) throw new EvalFailure("SERVER_FILE_SCAN_UNCONFIRMED", 2)
  if (observed.files.some(entry => entry.target === root || entry.target.startsWith(root + "/")))
    throw new EvalFailure("SLOT_SERVER_FILES_ACTIVE", 2)
  if (observed.processes.some(entry => entry.maps.split("\n").some(row => {
    const pathname = row.match(/^(?:\S+\s+){5}(.*)$/s)?.[1]
    return pathname === root || pathname?.startsWith(root + "/")
  }))) throw new EvalFailure("SLOT_SERVER_MAPPINGS_ACTIVE", 2)
}

async function storageCommand(containerId: string, script: string, args: string[]) {
  const child = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "exec", "-i", containerId,
    "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "sh", "-s", "--", ...args], {
    env: childEnvironment(process.env), stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 5000,
  })
  child.stdin.write(await Bun.file(path.resolve(import.meta.dir, "../fixtures", script)).text())
  child.stdin.end()
  return (await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]))[0]
}
