import path from "node:path"
import { lstat, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { qualifyClosedProcessEvidence } from "./closed-process-evidence"
import { superviseProcess } from "./process-supervisor"
import type { ServerIdentity, SlotLease } from "./slots"
import type { AdminConnection } from "./loginom-admin"

export type ManagementProcessEvidence = { file: string; lease: SlotLease; admin?: AdminConnection }
type InventoryInput = { file: string; journal: string; commandId: string; identity: ServerIdentity; leaseToken: string;
  slotId: string; profileDir: string; producerPid: number }
const active = new Set<string>()
const operations = new Set(["loginom setup", "loginom status", "loginom check", "loginom recover", "providers status"])

export async function superviseManagementProcess(input: Parameters<typeof superviseProcess>[0], evidence: ManagementProcessEvidence & { directory: string; operation: string[] }) {
  await evidence.lease.assertHeld()
  if (evidence.lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  if (evidence.operation.length !== 2 || !operations.has(evidence.operation.join(" "))) throw new EvalFailure("MANAGEMENT_OPERATION_INVALID", 2)
  if (input.profileDir !== evidence.lease.slot.profileDir || path.dirname(evidence.file) !== path.dirname(evidence.lease.receipt) ||
    evidence.directory === input.profileDir || evidence.directory.startsWith(input.profileDir + path.sep)) throw new EvalFailure("MANAGEMENT_PROCESS_SCOPE_INVALID", 2)
  if (active.has(evidence.file)) throw new EvalFailure("MANAGEMENT_PROCESS_BUSY", 2)
  active.add(evidence.file)
  try {
    const origin = await readLeaseReceipt(evidence.lease.receipt)
    if (!object(origin) || typeof origin.journal !== "string" || typeof origin.commandId !== "string") throw new EvalFailure("MANAGEMENT_PROCESS_SCOPE_INVALID", 2)
    const command = await readLeaseReceipt(origin.journal)
    if (!object(command) || command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted")
      throw new EvalFailure("MANAGEMENT_ADMISSION_UNCONFIRMED", 2)
    const expected = { file: evidence.file, journal: origin.journal, commandId: origin.commandId, identity: evidence.lease.identity,
      leaseToken: evidence.lease.token, slotId: evidence.lease.slot.id, profileDir: evidence.lease.slot.profileDir, producerPid: process.pid }
    const previous = await readManagementProcessInventory(expected)
    const inventory = await readInventory(expected)
    if (hash(inventory) !== previous.source.sha256) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
    await privateDirectory(evidence.directory)
    const owner = { kind: "slot" as const, id: `${expected.commandId}:${expected.slotId}:${crypto.randomUUID()}` }
    if (evidence.admin && JSON.stringify(evidence.admin.identity) !== JSON.stringify(expected.identity)) throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
    const before = await evidence.admin?.inspectSessionInventory()
    const entry = { owner, directory: evidence.directory, operation: evidence.operation, state: "planned",
      ...(before ? { sessions: { before: before.source } } : {}) }
    await evidence.lease.assertHeld()
    await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, entry] })
    const result = await superviseProcess({ ...input, owner })
    const proof = path.join(evidence.directory, "process-cleanup.json")
    await writeLeaseReceipt(proof, result.processCleanup)
    await evidence.lease.assertHeld()
    const qualified = qualifyClosedProcessEvidence(result.processCleanup, { owner, producerPid: process.pid })
    const after = qualified ? await evidence.admin?.inspectSessionInventory() : undefined
    await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, { ...entry,
      state: qualified ? "confirmed" : "unconfirmed", proof: { path: proof, sha256: hash(result.processCleanup) },
      ...(before && after ? { sessions: { before: before.source, after: after.source } } : {}) }] })
    if (!qualified) throw new EvalFailure("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED", 2)
    return result
  } finally { active.delete(evidence.file) }
}

export async function readManagementProcessInventory(input: InventoryInput) {
  const inventory = await readInventory(input)
  const processes = []
  for (const entry of inventory.processes) {
    if (!object(entry) || Object.keys(entry).length !== (entry.sessions === undefined ? 5 : 6) || entry.state !== "confirmed" || !object(entry.owner) || entry.owner.kind !== "slot" ||
      typeof entry.owner.id !== "string" || !entry.owner.id.startsWith(`${input.commandId}:${input.slotId}:`) || typeof entry.directory !== "string" ||
      !Array.isArray(entry.operation) || entry.operation.length !== 2 || !entry.operation.every(value => typeof value === "string") ||
      !operations.has(entry.operation.join(" ")) || !object(entry.proof) ||
      entry.proof.path !== path.join(entry.directory, "process-cleanup.json") || typeof entry.proof.sha256 !== "string")
      throw new EvalFailure("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED", 2)
    await privateDirectory(entry.directory)
    const proof = await readLeaseReceipt(entry.proof.path).catch(() => null)
    const qualified = qualifyClosedProcessEvidence(proof, { owner: { kind: "slot", id: entry.owner.id }, producerPid: input.producerPid })
    if (!qualified || hash(proof) !== entry.proof.sha256) throw new EvalFailure("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED", 2)
    const sessions = entry.sessions === undefined ? undefined : await readManagementSessions(input, entry.sessions, qualified)
    processes.push({ owner: qualified.owner, operation: entry.operation, launcher: qualified.launcher, identities: qualified.identities,
      source: { path: entry.proof.path, sha256: entry.proof.sha256 }, ...(sessions ? { sessions } : {}) })
  }
  if (JSON.stringify(await readInventory(input)) !== JSON.stringify(inventory)) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
  return { processes, source: { path: input.file, sha256: hash(inventory) } }
}

async function readManagementSessions(input: InventoryInput, value: unknown, window: { startedAt: string; finishedAt: string }) {
  if (!object(value) || Object.keys(value).length !== 2) throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
  const { readAdminSessionInventory } = await import("./loginom-admin")
  const snapshots = await Promise.all([value.before, value.after].map(source => {
    if (!object(source) || Object.keys(source).length !== 2 || typeof source.path !== "string" || typeof source.sha256 !== "string")
      throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
    return readAdminSessionInventory({ controller: { stateDir: path.dirname(input.file) } }, input.identity, { path: source.path, sha256: source.sha256 })
  }))
  const before = snapshots[0]!, after = snapshots[1]!
  if (before.source.path === after.source.path || Date.parse(before.observation.finishedAt) > Date.parse(window.startedAt) ||
    Date.parse(after.observation.startedAt) < Date.parse(window.finishedAt)) throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
  return { before, after }
}

async function readInventory(input: InventoryInput) {
  await privateDirectory(path.dirname(input.file))
  const inventory = await readLeaseReceipt(input.file).catch(() => null), command = await readLeaseReceipt(input.journal).catch(() => null)
  const expected = { version: 2, kind: "management-processes", commandId: input.commandId, journal: input.journal, identity: input.identity,
    leaseToken: input.leaseToken, slotId: input.slotId, profileDir: input.profileDir }
  if (!object(inventory) || Object.keys(inventory).length !== 9 || !Array.isArray(inventory.processes) ||
    !object(command) || command.commandId !== input.commandId || JSON.stringify(command.identity) !== JSON.stringify(input.identity) ||
    Object.entries(expected).some(([key, value]) => JSON.stringify(inventory[key]) !== JSON.stringify(value)))
    throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_UNCONFIRMED", 2)
  return inventory as Record<string, unknown> & { processes: unknown[] }
}

async function privateDirectory(directory: string) {
  const root = await lstat(directory).catch(() => undefined)
  if (!path.isAbsolute(directory) || await realpath(directory).catch(() => undefined) !== directory || !root?.isDirectory() || root.isSymbolicLink() ||
    root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700) throw new EvalFailure("MANAGEMENT_PROCESS_PRIVATE", 2)
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
