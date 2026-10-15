import path from "node:path"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { readManagementProcess, readManagementProcessInventory } from "./management-process-evidence"
import { readAgentSessionInventory, type AgentSessionSource } from "./agent-sessions"
import { readUserActivation, readUserOwnership, readUserPreparation } from "./user-environment"
import type { SlotFile, SlotLease } from "./slots"
import type { AdminReply } from "./loginom-admin"

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

/** Accounts for every same-user row without closing sessions or granting cleanup. */
export async function collectManagementSessions(file: SlotFile, lease: SlotLease, secretFile: string, inventoryFile: string, observation: { path: string; sha256: string }) {
  const collected = await collectSlotSessions(file, lease, secretFile, { management: inventoryFile }, observation)
  return { sessions: collected.management, source: collected.sources.management, observation: collected.observation }
}

/** Accounts for all normal producers and same-user rows before any slot close. */
export async function collectSlotSessions(file: SlotFile, lease: SlotLease, secretFile: string,
  sources: { management: string; agents?: { file: string; observations: AgentSessionSource[] } }, observation: { path: string; sha256: string }) {
  const inventoryFile = sources.management
  const input = await managementInput(file, lease, inventoryFile)
  const inventory = await readManagementProcessInventory(input)
  const command = object(await readLeaseReceipt(input.journal))
  if (command.kind !== "unactivated-preparation" || (command.phase === "cli_admitted" ? !inventory.seal :
    command.phase !== "finalizing" || !Array.isArray(command.managementSources) ||
    !command.managementSources.some(value => { const source = object(value); return source.path === inventoryFile && source.sha256 === inventory.source.sha256 })))
    throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const sessions: Awaited<ReturnType<typeof recordManagementSession>>[] = []
  for (const process of inventory.processes) {
    if (!process.result || !process.sessions) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
    if (["loginom setup", "loginom check"].includes(process.operation.join(" "))) {
      sessions.push(await recordManagementSession(file, lease, secretFile, inventoryFile, process.owner.id))
      continue
    }
    if (process.result.exitCode !== 0 || process.result.timedOut || process.result.interrupted)
      throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  }
  if (sources.agents && (!Array.isArray(command.agentInventories) ||
    command.agentInventories.filter(value => object(value).slotId === lease.slot.id).length !== 1 ||
    !command.agentInventories.some(value => {
      const binding = object(value)
      return Object.keys(binding).length === 4 && binding.file === sources.agents!.file && binding.slotId === lease.slot.id &&
        binding.leaseToken === lease.token && binding.profileDir === lease.slot.profileDir
    }))) throw new EvalFailure("AGENT_SESSION_INVENTORY_UNCONFIRMED", 2)
  const agents = sources.agents ? await readAgentSessionInventory(file, lease, secretFile, sources.agents.file, sources.agents.observations) : undefined
  const known = [...sessions, ...agents?.sessions ?? []]
  if (new Set(known.map(session => session.id)).size !== known.length ||
    new Set(known.map(session => JSON.stringify([session.binding.name.toLowerCase(), session.binding.createdAt]))).size !== known.length)
    throw new EvalFailure("SESSION_IDENTITY_AMBIGUOUS", 2)
  const { readAdminSessionInventory } = await import("./loginom-admin")
  const current = await readAdminSessionInventory(file, lease.identity, observation)
  if ([...inventory.processes, ...agents?.processes ?? []].some(process => Date.parse(process.finishedAt) > Date.parse(current.observation.startedAt)))
    throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const username = lease.slot.username.toLowerCase()
  const sameUser = (name: string) => name.toLowerCase() === username || name.toLowerCase().startsWith(username + ":")
  const rows = current.sessions.filter(row => sameUser(row.name))
  const snapshots = [...inventory.processes.flatMap(process => process.sessions ? [process.sessions.before, ...process.sessions.during, process.sessions.after] : []),
    ...agents?.snapshots ?? []]
  if (new Set(rows.map(row => JSON.stringify([row.name.toLowerCase(), row.createdAt]))).size !== rows.length ||
    // Proxy IDs are local to each admin context, including historical observations after reconnect.
    snapshots.some(snapshot => {
      const observed = snapshot.sessions.filter(row => sameUser(row.name))
      return new Set(observed.map(row => JSON.stringify([row.name.toLowerCase(), row.createdAt]))).size !== observed.length ||
        observed.some(row => !known.some(session => session.binding.name === row.name &&
          session.binding.createdAt === row.createdAt && (session.actor.kind === "agent" || row.packageCount === 0)))
    }) ||
    rows.some(row => !known.some(session => session.state !== "closed" &&
      session.binding.name === row.name && session.binding.createdAt === row.createdAt && (session.actor.kind === "agent" || row.packageCount === 0))))
    throw new EvalFailure(sources.agents ? "SLOT_SESSION_UNKNOWN" : "MANAGEMENT_SESSION_UNKNOWN", 2)
  await lease.assertHeld()
  if (hash(await readLeaseReceipt(inventoryFile)) !== inventory.source.sha256 || hash(await readLeaseReceipt(input.journal)) !== hash(command) ||
    inventory.seal && hash(await readLeaseReceipt(inventory.seal.path)) !== inventory.seal.sha256 ||
    agents && hash(await readLeaseReceipt(agents.source.path)) !== agents.source.sha256)
    throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
  return { management: sessions, agents: agents?.sessions ?? [], sources: { management: inventory.source, agents: agents?.source ?? null }, observation: current.source }
}

export async function readManagementSession(file: SlotFile, lease: SlotLease, secretFile: string, id: string) {
  await lease.assertHeld()
  if (!/^[a-f0-9]{64}$/.test(id)) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const saved = object(await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${id}.json`)))
  const source = object(saved.source)
  if (typeof source.inventoryFile !== "string" || Object.keys(source).length !== 3) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const expected = await managementSession(file, lease, secretFile, { inventoryFile: source.inventoryFile, command: source.command, connection: source.connection })
  if (expected.id !== id || JSON.stringify(saved) !== JSON.stringify(expected)) throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const terminal = await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${id}.closed.json`)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (terminal === undefined) return expected
  const closed = object(terminal), sourceClosed = object(closed.source)
  if (typeof sourceClosed.path !== "string") throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  const closure = await managementClosure(file, lease, expected, sourceClosed.path, closed.reply as AdminReply)
  if (JSON.stringify(closed) !== JSON.stringify(closure)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  return { ...expected, state: "closed" as const, close: closure.source }
}

export async function recordManagementSessionClosed(file: SlotFile, lease: SlotLease, secretFile: string, id: string, commandFile: string, reply: AdminReply) {
  const entry = await readManagementSession(file, lease, secretFile, id)
  const closure = await managementClosure(file, lease, entry, commandFile, reply)
  const target = path.join(file.controller.stateDir, `management-session-${id}.closed.json`)
  const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(closure)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  await lease.assertHeld()
  if (existing === undefined) await writeLeaseReceipt(target, closure)
  return readManagementSession(file, lease, secretFile, id)
}

async function managementClosure(file: SlotFile, lease: SlotLease, entry: Pick<Awaited<ReturnType<typeof managementSession>>, "id" | "binding">, commandFile: string, reply: AdminReply) {
  const data = object(reply.data), directory = path.dirname(path.dirname(commandFile))
  if (Object.keys(reply).length !== 4 || reply.v !== 1 || reply.outcome !== "confirmed" || !/^[a-zA-Z0-9_-]{1,128}$/.test(reply.id) ||
    path.dirname(directory) !== file.controller.stateDir || !/^admin-[a-zA-Z0-9_-]+$/.test(path.basename(directory)) ||
    commandFile !== path.join(directory, "commands", `${reply.id}.json`) || Object.keys(data).length !== 2 || data.closed !== true ||
    !["rpc_closed", "observed_absent"].includes(String(data.disposition))) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  const authority = { receipt: path.join(file.controller.stateDir, `management-session-${entry.id}.json`),
    sha256: hash(await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${entry.id}.json`))) }
  const source = object(await readLeaseReceipt(commandFile))
  if (Object.keys(source).length !== 10 || source.version !== 1 || source.kind !== "loginom-admin-command" || source.id !== reply.id ||
    source.op !== "close-session" || source.state !== "confirmed" || JSON.stringify(source.expectedIdentity) !== JSON.stringify(lease.identity) ||
    source.desiredHash !== hash({ proofId: entry.id, session: entry.binding, adopt: authority }) || source.replyHash !== hash(reply) ||
    typeof source.at !== "string" || typeof source.settledAt !== "string" || !Number.isFinite(Date.parse(source.at)) ||
    !Number.isFinite(Date.parse(source.settledAt)) || Date.parse(source.at) > Date.parse(source.settledAt)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  await lease.assertHeld()
  return { version: 2, kind: "management-session-close", id: entry.id, slotId: lease.slot.id, identity: lease.identity,
    binding: entry.binding, authority, source: { path: commandFile, id: reply.id, sha256: hash(source) }, reply }
}

async function managementSession(file: SlotFile, lease: SlotLease, secretFile: string, source: { inventoryFile: string; command: unknown; connection: unknown }) {
  const input = await managementInput(file, lease, source.inventoryFile)
  const prepared = await readUserPreparation(file, lease, secretFile), owned = await readUserOwnership(file, lease, secretFile)
  const activation = await readUserActivation(file, lease, secretFile)
  if (!activation) throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
  const command = await readManagementProcess(input, source.command), connection = await readManagementProcess(input, source.connection)
  // A cancelled check can still leave an owned server session; it does not attest readiness.
  const interruptedCheck = command.operation.join(" ") === "loginom check" && command.result?.interrupted === true && command.result.timedOut === false
  if (connection.operation.join(" ") !== "loginom setup" || connection.result?.exitCode !== 0 || connection.result.timedOut || connection.result.interrupted ||
    connection.result.reply?.browser !== "verified" || connection.result.reply.url !== prepared.endpoint || connection.result.reply.username !== owned.username ||
    connection.result.reply.hasApiKey !== true || !command.sessions?.during.length || !command.result ||
    !interruptedCheck && (command.result.exitCode !== 0 || command.result.timedOut || command.result.interrupted || command.result.reply?.browser !== "verified") ||
    !["loginom setup", "loginom check"].includes(command.operation.join(" ")) ||
    command.operation[1] === "setup" && JSON.stringify(command.source) !== JSON.stringify(connection.source) ||
    command.operation[1] === "check" && Date.parse(connection.finishedAt) > Date.parse(command.startedAt) || command.operation[1] === "check" &&
      !interruptedCheck && (command.result.reply?.code !== "LOGINOM_CONNECTION_VALID" || command.result.reply.ok !== true))
    throw new EvalFailure("MANAGEMENT_SESSION_UNCONFIRMED", 2)
  const rows = command.sessions.during.flatMap(snapshot => snapshot.sessions.filter(row => row.name.startsWith(owned.username + ":") &&
    !command.sessions!.before.sessions.some(previous => previous.objectId === row.objectId)))
  const row = rows[0]
  if (!row || new Set(rows.map(row => row.objectId)).size !== 1 || typeof row.createdAt !== "string" ||
    !/^[1-9]\d*$/.test(row.name.slice(owned.username.length + 1)) || rows.some(current => current.name !== row.name || current.createdAt !== row.createdAt || current.packageCount !== 0) ||
    command.sessions.after.sessions.some(current => current.objectId === row.objectId && (current.name !== row.name || current.createdAt !== row.createdAt)))
    throw new EvalFailure("SESSION_IDENTITY_AMBIGUOUS", 2)
  await lease.assertHeld()
  return { version: 2, kind: "owned-management-session", id: hash({ owner: command.owner, remoteKey: row.objectId }), state: "observed" as const,
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
