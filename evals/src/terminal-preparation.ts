import path from "node:path"
import { lstat, readFile } from "node:fs/promises"
import { readLeaseReceipt, type acquireResourceLease } from "./lease"
import { assertProfileClean } from "./profile"
import { observeTerminalPreparationUnit, type UnitBinding } from "./process-supervisor"
import type { SlotLease } from "./slots"

type ServerLease = Awaited<ReturnType<typeof acquireResourceLease>>
export type TerminalPreparationProof = {
  version: 1; kind: "terminal-preparation"; source: { file: string; sha256: string }; commandId: string; runDir: string
  slotId: string; profile: string; binding: UnitBinding; server: ServerLease["reservation"]
  composite: unknown; passes: Awaited<ReturnType<typeof observeTerminalPreparationUnit>>
}
const observed = new WeakMap<TerminalPreparationProof, { bytes: string; command: Buffer; composite: string; server: ServerLease; lease: SlotLease }>()
const hash = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
const absent = async (file: string) => {
  if (await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return; throw error }))
    throw Error("TERMINAL_PREPARATION_PATH_PRESENT")
}

export async function observeTerminalPreparation(server: ServerLease, lease: SlotLease): Promise<TerminalPreparationProof> {
  await server.assertHeld(); await lease.assertHeld()
  const reservation = server.reservation, source = reservation.journal
  const command = await readLeaseReceipt(source) as { version?: number; kind?: string; commandId?: string; phase?: string; attempts?: unknown[];
    runDir?: string; slotIds?: unknown[]; unitBinding?: UnitBinding; identity?: unknown }
  const bytes = await readFile(source), composite = await readLeaseReceipt(lease.receipt) as Record<string, unknown>
  if (JSON.stringify(JSON.parse(bytes.toString())) !== JSON.stringify(command) || command.version !== 2 || command.kind !== "unactivated-preparation" ||
    command.phase !== "cli_admitted" || command.commandId !== reservation.commandId || !Array.isArray(command.attempts) || command.attempts.length !== 0 ||
    !command.runDir || !path.isAbsolute(command.runDir) || path.resolve(command.runDir) !== command.runDir || !command.unitBinding ||
    !Array.isArray(command.slotIds) || !command.slotIds.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id)) ||
    new Set(command.slotIds).size !== command.slotIds.length || command.slotIds.filter(id => id === lease.slot.id).length !== 1 ||
    JSON.stringify(command.identity) !== JSON.stringify(lease.identity) || JSON.stringify(reservation.identity) !== JSON.stringify(lease.identity) ||
    reservation.key !== `server:${lease.identity.containerId}` || composite.commandId !== reservation.commandId || composite.journal !== source ||
    composite.token !== lease.token || composite.state !== "retained" || JSON.stringify(composite.identity) !== JSON.stringify(lease.identity) ||
    JSON.stringify(composite.slot) !== JSON.stringify(lease.slot)) throw Error("TERMINAL_PREPARATION_SOURCE_INELIGIBLE")
  await absent(path.join(command.runDir, "preparation", lease.slot.id))
  await absent(`${lease.slot.profileDir}.process-group`)
  await assertProfileClean(lease.slot.profileDir)
  const proof: TerminalPreparationProof = { version: 1, kind: "terminal-preparation", source: { file: source, sha256: hash(bytes) },
    commandId: reservation.commandId, runDir: command.runDir, slotId: lease.slot.id, profile: lease.slot.profileDir,
    binding: command.unitBinding, server: structuredClone(reservation), composite,
    passes: await observeTerminalPreparationUnit(command.unitBinding, reservation.owner) }
  observed.set(proof, { bytes: JSON.stringify(proof), command: bytes, composite: JSON.stringify(composite), server, lease })
  await validateTerminalPreparation(proof, server, lease)
  return proof
}

/** Only an observation made in this process under these still-held leases may authorize the consumer. */
export async function validateTerminalPreparation(proof: TerminalPreparationProof, server: ServerLease, lease: SlotLease) {
  const saved = observed.get(proof)
  if (!saved || saved.server !== server || saved.lease !== lease || saved.bytes !== JSON.stringify(proof)) throw Error("TERMINAL_PREPARATION_UNTRUSTED")
  await server.assertHeld(); await lease.assertHeld()
  if (!(await readFile(proof.source.file)).equals(saved.command) || JSON.stringify(await readLeaseReceipt(lease.receipt)) !== saved.composite ||
    JSON.stringify(server.reservation) !== JSON.stringify(proof.server)) throw Error("TERMINAL_PREPARATION_SOURCE_CHANGED")
  await absent(path.join(proof.runDir, "preparation", lease.slot.id))
  await absent(`${lease.slot.profileDir}.process-group`)
  await assertProfileClean(lease.slot.profileDir)
  await observeTerminalPreparationUnit(proof.binding, proof.server.owner)
  await server.assertHeld(); await lease.assertHeld()
  if (!(await readFile(proof.source.file)).equals(saved.command) || JSON.stringify(await readLeaseReceipt(lease.receipt)) !== saved.composite)
    throw Error("TERMINAL_PREPARATION_SOURCE_CHANGED")
  await absent(`${lease.slot.profileDir}.process-group`)
  await assertProfileClean(lease.slot.profileDir)
}
