import path from "node:path"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { readManagementProcess, readManagementProcessInventory } from "./management-process-evidence"
import { readUserActivation, readUserOwnership, readUserPreparation } from "./user-environment"
import type { SlotFile, SlotLease } from "./slots"

export async function recordManagementSession(file: SlotFile, lease: SlotLease, secretFile: string, inventoryFile: string, ownerId: string) {
  const input = await managementInput(file, lease, inventoryFile)
  const inventory = await readManagementProcessInventory(input)
  const current = inventory.processes.findIndex(entry => entry.owner.id === ownerId)
  if (current < 0) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const connection = inventory.processes.slice(0, current + 1).findLast(entry => entry.operation.join(" ") === "loginom setup" &&
    entry.result?.reply?.url === file.server.url && entry.result.reply.username === lease.slot.username && entry.result.reply.hasApiKey === true)
  const raw = object(await readLeaseReceipt(inventoryFile))
  if (!Array.isArray(raw.processes) || hash(raw) !== inventory.source.sha256 || !connection) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const source = { inventoryFile, command: raw.processes[current],
    connection: raw.processes[inventory.processes.findIndex(entry => entry.owner.id === connection.owner.id)] }
  const session = await managementSession(file, lease, secretFile, source)
  const target = path.join(file.controller.stateDir, `management-session-${session.id}.json`)
  const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(session)) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  await lease.assertHeld()
  if (hash(await readLeaseReceipt(inventoryFile)) !== inventory.source.sha256) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
  if (existing === undefined) await writeLeaseReceipt(target, session)
  return readManagementSession(file, lease, secretFile, session.id)
}

export async function readManagementSession(file: SlotFile, lease: SlotLease, secretFile: string, id: string) {
  await lease.assertHeld()
  if (!/^[a-f0-9]{64}$/.test(id)) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const saved = object(await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${id}.json`)))
  const source = object(saved.source)
  if (typeof source.inventoryFile !== "string" || Object.keys(source).length !== 3) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const expected = await managementSession(file, lease, secretFile, { inventoryFile: source.inventoryFile, command: source.command, connection: source.connection })
  if (expected.id !== id || JSON.stringify(saved) !== JSON.stringify(expected)) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  return expected
}

async function managementSession(file: SlotFile, lease: SlotLease, secretFile: string, source: { inventoryFile: string; command: unknown; connection: unknown }) {
  const input = await managementInput(file, lease, source.inventoryFile)
  const prepared = await readUserPreparation(file, lease, secretFile), owned = await readUserOwnership(file, lease, secretFile)
  const activation = await readUserActivation(file, lease, secretFile)
  if (!activation) throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
  const command = await readManagementProcess(input, source.command), connection = await readManagementProcess(input, source.connection)
  if (connection.operation.join(" ") !== "loginom setup" || connection.result?.exitCode !== 0 || connection.result.timedOut || connection.result.interrupted ||
    connection.result.reply?.browser !== "verified" || connection.result.reply.url !== prepared.endpoint || connection.result.reply.username !== owned.username ||
    connection.result.reply.hasApiKey !== true || !command.sessions?.during.length || command.result?.exitCode !== 0 || command.result.timedOut ||
    command.result.interrupted || command.result.reply?.browser !== "verified" ||
    !["loginom setup", "loginom check"].includes(command.operation.join(" ")) ||
    command.operation[1] === "setup" && JSON.stringify(command.source) !== JSON.stringify(connection.source) ||
    command.operation[1] === "check" && Date.parse(connection.finishedAt) > Date.parse(command.startedAt) || command.operation[1] === "check" &&
      (command.result.reply.code !== "LOGINOM_CONNECTION_VALID" || command.result.reply.ok !== true))
    throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const rows = command.sessions.during.flatMap(snapshot => snapshot.sessions.filter(row => row.name.startsWith(owned.username + ":") &&
    !command.sessions!.before.sessions.some(previous => previous.objectId === row.objectId)))
  const row = rows[0]
  if (!row || new Set(rows.map(row => row.objectId)).size !== 1 || typeof row.createdAt !== "string" ||
    !/^[1-9]\d*$/.test(row.name.slice(owned.username.length + 1)) || rows.some(current => current.name !== row.name || current.createdAt !== row.createdAt || current.packageCount !== 0) ||
    command.sessions.after.sessions.some(current => current.objectId === row.objectId && (current.name !== row.name || current.createdAt !== row.createdAt)))
    throw new EvalFailure("SESSION_IDENTITY_AMBIGUOUS", 2)
  await lease.assertHeld()
  return { version: 2, kind: "owned-management-session", id: hash({ owner: command.owner, remoteKey: row.objectId }), state: "observed",
    slotId: lease.slot.id, identity: lease.identity, leaseToken: lease.token, preparationNonce: prepared.nonce, userObjectId: owned.objectId,
    activationNonce: activation.nonce, actor: { kind: "management", runId: input.commandId, attemptId: null, owner: command.owner, operation: command.operation },
    binding: { remoteKey: row.objectId, userKey: owned.userKey, username: owned.username, serverEpoch: lease.identity.serverEpoch, name: row.name, createdAt: row.createdAt }, source }
}

async function managementInput(file: SlotFile, lease: SlotLease, inventoryFile: string) {
  await lease.assertHeld()
  if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  if (path.dirname(inventoryFile) !== file.controller.stateDir || path.resolve(inventoryFile) !== inventoryFile)
    throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const origin = object(await readLeaseReceipt(lease.receipt))
  if (typeof origin.journal !== "string" || typeof origin.commandId !== "string") throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  return { file: inventoryFile, journal: origin.journal, commandId: origin.commandId, identity: lease.identity, leaseToken: lease.token,
    slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  return value as Record<string, unknown>
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
