import path from "node:path"
import { EvalFailure } from "./fail"
import { readAgentProcess, readAgentProcessBoundary } from "./agent-process-evidence"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { archiveProfileEvidence } from "./profile-archive"
import { readUserActivation, readUserOwnership, readUserPreparation } from "./user-environment"
import type { AdminReply } from "./loginom-admin"
import type { SlotFile, SlotLease } from "./slots"

type Reference = { path: string; sha256: string }
type Session = Pick<Awaited<ReturnType<typeof agentSessions>>[number], "id" | "actor" | "source" | "binding">
export type AgentSessionSource = { process: Reference & { id: string }; before: Reference; during: Reference[]; after: Reference }

/** Records causal agent sessions; filesystem cleanup requires separate fences. */
export async function recordAgentSessions(file: SlotFile, lease: SlotLease, secretFile: string, source: AgentSessionSource) {
  const sessions = await agentSessions(file, lease, secretFile, source)
  for (const session of sessions) {
    const target = path.join(file.controller.stateDir, `agent-session-${session.id}.json`)
    const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(session)) throw new EvalFailure("AGENT_SESSION_SOURCE_CHANGED", 2)
    await lease.assertHeld()
    if (existing === undefined) await writeLeaseReceipt(target, session)
  }
  return Promise.all(sessions.map(session => readAgentSession(file, lease, secretFile, session.id)))
}

/** Requires an observation window for every invocation in a frozen slot boundary. */
export async function readAgentSessionInventory(file: SlotFile, lease: SlotLease, secretFile: string, inventoryFile: string, observations: AgentSessionSource[]) {
  await lease.assertHeld()
  if (lease.recoveryOnly || path.dirname(inventoryFile) !== file.controller.stateDir) throw new EvalFailure("AGENT_SESSION_INVENTORY_UNCONFIRMED", 2)
  const origin = object(await readLeaseReceipt(lease.receipt))
  if (typeof origin.commandId !== "string") throw new EvalFailure("AGENT_SESSION_INVENTORY_UNCONFIRMED", 2)
  const inventory = await readAgentProcessBoundary({ file: inventoryFile, commandId: origin.commandId, slotId: lease.slot.id, producerPid: process.pid })
  if (!Array.isArray(observations) || observations.length !== inventory.processes.length ||
    new Set(observations.map(source => source.process.id)).size !== observations.length ||
    observations.some(source => source.process.path !== inventoryFile)) throw new EvalFailure("AGENT_SESSION_INVENTORY_INCOMPLETE", 2)
  const sessions = (await Promise.all(observations.map(source => recordAgentSessions(file, lease, secretFile, source)))).flat()
  const { readAdminSessionInventory } = await import("./loginom-admin")
  const snapshots = await Promise.all(observations.flatMap(source => [source.before, ...source.during, source.after])
    .map(source => readAdminSessionInventory(file, lease.identity, source)))
  await lease.assertHeld()
  if (hash(await readLeaseReceipt(inventory.current.path)) !== inventory.current.sha256 ||
    hash(await readLeaseReceipt(inventory.source.path)) !== inventory.source.sha256) throw new EvalFailure("AGENT_PROCESS_INVENTORY_CHANGED", 2)
  return { sessions, snapshots, processes: inventory.processes, source: inventory.source, current: inventory.current }
}

export async function readAgentSession(file: SlotFile, lease: SlotLease, secretFile: string, id: string) {
  await lease.assertHeld()
  if (!/^[a-f0-9]{64}$/.test(id)) throw new EvalFailure("AGENT_SESSION_SOURCE_INVALID", 2)
  const saved = object(await readLeaseReceipt(path.join(file.controller.stateDir, `agent-session-${id}.json`)))
  const expected = (await agentSessions(file, lease, secretFile, saved.source)).find(session => session.id === id)
  if (!expected || JSON.stringify(saved) !== JSON.stringify(expected)) throw new EvalFailure("AGENT_SESSION_SOURCE_CHANGED", 2)
  const terminal = await readLeaseReceipt(path.join(file.controller.stateDir, `agent-session-${id}.closed.json`)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (terminal === undefined) return expected
  const closed = object(terminal), source = object(closed.source)
  if (typeof source.path !== "string") throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  const closure = await agentClosure(file, lease, expected, closed.archive as Reference, source.path, closed.reply as AdminReply)
  if (JSON.stringify(closed) !== JSON.stringify(closure)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  return { ...expected, state: "closed" as const, close: closure.source, archive: closure.authority.archive }
}

export async function readAgentArchive(file: SlotFile, lease: SlotLease, secretFile: string, id: string, source: Reference) {
  const entry = await readAgentSession(file, lease, secretFile, id)
  return readAgentInvocationArchive(file, lease, entry.source.process, source)
}

/** Also qualifies archives for invocations which created no server session. */
export async function readAgentInvocationArchive(file: SlotFile, lease: SlotLease, processSource: AgentSessionSource["process"], source: Reference) {
  const archive = await readArchiveSource(file, lease, processSource, source)
  await archiveProfileEvidence(lease.slot.profileDir, archive.archive, source.path)
  await lease.assertHeld()
  if (hash(await readLeaseReceipt(source.path)) !== source.sha256) throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  return { path: source.path, sha256: source.sha256 }
}

export async function recordAgentSessionClosed(file: SlotFile, lease: SlotLease, secretFile: string, id: string, archive: Reference, commandFile: string, reply: AdminReply) {
  const entry = await readAgentSession(file, lease, secretFile, id)
  const closure = await agentClosure(file, lease, entry, archive, commandFile, reply)
  const target = path.join(file.controller.stateDir, `agent-session-${id}.closed.json`)
  const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(closure)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  await lease.assertHeld()
  if (existing === undefined) await writeLeaseReceipt(target, closure)
  return readAgentSession(file, lease, secretFile, id)
}

async function readArchiveSource(file: SlotFile, lease: SlotLease, processSource: AgentSessionSource["process"], source: Reference) {
  await lease.assertHeld()
  if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  const origin = object(await readLeaseReceipt(lease.receipt))
  if (typeof origin.commandId !== "string" || typeof origin.journal !== "string" || path.dirname(processSource.path) !== file.controller.stateDir)
    throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  const command = object(await readLeaseReceipt(origin.journal))
  if (command.kind !== "unactivated-preparation" || command.commandId !== origin.commandId ||
    !["cli_admitted", "finalizing"].includes(String(command.phase)) || JSON.stringify(command.identity) !== JSON.stringify(lease.identity) ||
    !Array.isArray(command.slotIds) || !command.slotIds.includes(lease.slot.id)) throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  if (!source || source.path !== path.join(file.controller.stateDir, `agent-archive-${processSource.id}.json`) ||
    !/^[a-f0-9]{64}$/.test(source.sha256)) throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  const saved = await readLeaseReceipt(source.path).catch(() => null)
  if (!saved || hash(saved) !== source.sha256) throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  const archive = object(saved)
  const processEntry = await readAgentProcess({ file: processSource.path, commandId: origin.commandId,
    slotId: lease.slot.id, producerPid: process.pid }, processSource.id)
  if (JSON.stringify(processEntry.entrySource) !== JSON.stringify(processSource)) throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  if (archive.version !== 1 || archive.kind !== "profile-archive" || archive.status !== "committed" || archive.profile !== lease.slot.profileDir ||
    typeof archive.archive !== "string" || path.dirname(archive.archive) !== lease.slot.historyDir ||
    typeof archive.at !== "string" || typeof archive.committedAt !== "string" ||
    ![archive.at, archive.committedAt].every(value => Number.isFinite(Date.parse(value))) ||
    Date.parse(archive.at) < Date.parse(processEntry.finishedAt) || Date.parse(archive.committedAt) < Date.parse(archive.at))
    throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  return { archive: archive.archive, at: archive.at, committedAt: archive.committedAt }
}

async function agentClosure(file: SlotFile, lease: SlotLease, entry: Session, archive: Reference, commandFile: string, reply: AdminReply) {
  const savedArchive = await readArchiveSource(file, lease, entry.source.process, archive)
  const data = object(reply.data), directory = path.dirname(path.dirname(commandFile))
  if (Object.keys(reply).length !== 4 || reply.v !== 1 || reply.outcome !== "confirmed" || !/^[a-zA-Z0-9_-]{1,128}$/.test(reply.id) ||
    path.dirname(directory) !== file.controller.stateDir || !/^admin-[a-zA-Z0-9_-]+$/.test(path.basename(directory)) ||
    commandFile !== path.join(directory, "commands", `${reply.id}.json`) || Object.keys(data).length !== 2 || data.closed !== true ||
    !["rpc_closed", "observed_absent"].includes(String(data.disposition))) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  const authority = { receipt: path.join(file.controller.stateDir, `agent-session-${entry.id}.json`),
    sha256: hash(await readLeaseReceipt(path.join(file.controller.stateDir, `agent-session-${entry.id}.json`))), archive }
  const source = object(await readLeaseReceipt(commandFile))
  if (Object.keys(source).length !== 10 || source.version !== 1 || source.kind !== "loginom-admin-command" || source.id !== reply.id ||
    (source.op !== "close-session" && (source.op !== "confirm-session-absent" || data.disposition !== "observed_absent")) || source.state !== "confirmed" || JSON.stringify(source.expectedIdentity) !== JSON.stringify(lease.identity) ||
    source.desiredHash !== hash({ proofId: entry.id, session: entry.binding, adopt: authority }) || source.replyHash !== hash(reply) ||
    typeof source.at !== "string" || typeof source.settledAt !== "string" || !Number.isFinite(Date.parse(source.at)) ||
    !Number.isFinite(Date.parse(source.settledAt)) || Date.parse(source.at) < Date.parse(savedArchive.committedAt) ||
    Date.parse(source.at) > Date.parse(source.settledAt)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  await lease.assertHeld()
  return { version: 2, kind: "agent-session-close", id: entry.id, slotId: lease.slot.id, identity: lease.identity,
    binding: entry.binding, authority, archive, source: { path: commandFile, id: reply.id, sha256: hash(source) }, reply }
}

async function agentSessions(file: SlotFile, lease: SlotLease, secretFile: string, source: unknown) {
  await lease.assertHeld()
  if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  const raw = object(source), reference = object(raw.process), origin = object(await readLeaseReceipt(lease.receipt))
  if (Object.keys(raw).length !== 4 || Object.keys(reference).length !== 3 || typeof reference.path !== "string" ||
    path.dirname(reference.path) !== file.controller.stateDir || typeof reference.id !== "string" ||
    typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(reference.sha256) ||
    typeof origin.journal !== "string" || typeof origin.commandId !== "string") throw new EvalFailure("AGENT_SESSION_SOURCE_INVALID", 2)
  const command = object(await readLeaseReceipt(origin.journal))
  if (command.kind !== "unactivated-preparation" || command.commandId !== origin.commandId ||
    !["cli_admitted", "finalizing"].includes(String(command.phase)) || JSON.stringify(command.identity) !== JSON.stringify(lease.identity) ||
    !Array.isArray(command.slotIds) || !command.slotIds.includes(lease.slot.id)) throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
  const input = { file: reference.path, commandId: origin.commandId, slotId: lease.slot.id, producerPid: process.pid }
  const processEntry = await readAgentProcess(input, reference.id)
  if (JSON.stringify(processEntry.entrySource) !== JSON.stringify(reference)) throw new EvalFailure("AGENT_SESSION_PROCESS_CHANGED", 2)
  const browser = requireBrowserProof(await readLeaseReceipt(processEntry.source.path), lease.slot.profileDir, processEntry)
  const prepared = await readUserPreparation(file, lease, secretFile), owned = await readUserOwnership(file, lease, secretFile)
  const activation = await readUserActivation(file, lease, secretFile)
  if (!activation) throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
  const snapshots = await readObservations(file, lease, raw, processEntry)
  const sameUser = (name: string) => name.toLowerCase() === owned.username.toLowerCase() || name.toLowerCase().startsWith(owned.username.toLowerCase() + ":")
  const fresh = snapshots.during.flatMap(snapshot => snapshot.sessions.filter(row => sameUser(row.name) &&
    !snapshots.before.sessions.some(previous => previous.objectId === row.objectId)))
  const rows = [...new Map(fresh.map(row => [row.objectId, row])).values()]
  if (snapshots.after.sessions.some(row => sameUser(row.name) && !snapshots.before.sessions.some(previous => previous.objectId === row.objectId) &&
    !rows.some(observed => observed.objectId === row.objectId))) throw new EvalFailure("AGENT_SESSION_UNKNOWN", 2)
  if (rows.length && !browser) throw new EvalFailure("AGENT_SESSION_BROWSER_UNCONFIRMED", 2)
  if (new Set(rows.map(row => JSON.stringify([row.name.toLowerCase(), row.createdAt]))).size !== rows.length ||
    fresh.some(row => typeof row.createdAt !== "string" || !/^[1-9]\d*$/.test(row.name.slice(owned.username.length + 1)) ||
      snapshots.before.sessions.some(previous => previous.name.toLowerCase() === row.name.toLowerCase()) ||
      [...fresh, ...snapshots.after.sessions].some(current => current.objectId === row.objectId &&
        (current.name !== row.name || current.createdAt !== row.createdAt)))) throw new EvalFailure("SESSION_IDENTITY_AMBIGUOUS", 2)
  await lease.assertHeld()
  if (JSON.stringify((await readAgentProcess(input, reference.id)).entrySource) !== JSON.stringify(processEntry.entrySource))
    throw new EvalFailure("AGENT_SESSION_PROCESS_CHANGED", 2)
  return rows.map(row => ({ version: 2, kind: "owned-agent-session", id: hash({ process: processEntry.entrySource, remoteKey: row.objectId }),
    state: "observed" as const, slotId: lease.slot.id, identity: lease.identity, leaseToken: lease.token, preparationNonce: prepared.nonce,
    userObjectId: owned.objectId, activationNonce: activation.nonce,
    actor: { kind: "agent", runId: input.commandId, attemptId: processEntry.entrySource.id, owner: processEntry.owner },
    binding: { remoteKey: row.objectId, userKey: owned.userKey, username: owned.username, serverEpoch: lease.identity.serverEpoch, name: row.name, createdAt: row.createdAt },
    source: { process: processEntry.entrySource, before: snapshots.before.source, during: snapshots.during.map(snapshot => snapshot.source), after: snapshots.after.source } }))
}

function requireBrowserProof(value: unknown, profile: string, window: { startedAt: string; finishedAt: string }) {
  const proof = object(value), bindings = proof.browserBindings, directories = proof.runtimeDirectories, processes = proof.processes
  if (Array.isArray(bindings) && !bindings.length && Array.isArray(directories) && !directories.length) return false
  if (!Array.isArray(bindings) || !bindings.length || !Array.isArray(directories) || !directories.length || !Array.isArray(processes) ||
    directories.some(dir => typeof dir !== "string" || path.resolve(dir) !== dir || !dir.startsWith(profile + path.sep)) || bindings.some(value => {
      const binding = object(value)
      return Object.keys(binding).length !== 3 || !directories.includes(binding.runtimeDirectory) ||
        !processes.some(process => JSON.stringify(process) === JSON.stringify(binding.process)) ||
        typeof binding.observed_at !== "string" || !Number.isFinite(Date.parse(binding.observed_at)) ||
        Date.parse(binding.observed_at) < Date.parse(window.startedAt) || Date.parse(binding.observed_at) > Date.parse(window.finishedAt)
    })) throw new EvalFailure("AGENT_SESSION_BROWSER_UNCONFIRMED", 2)
  return true
}

async function readObservations(file: SlotFile, lease: SlotLease, raw: Record<string, unknown>, window: { startedAt: string; finishedAt: string }) {
  if (!Array.isArray(raw.during) || !raw.during.length) throw new EvalFailure("AGENT_SESSION_WINDOW_INVALID", 2)
  const { readAdminSessionInventory } = await import("./loginom-admin")
  const snapshots = await Promise.all([raw.before, ...raw.during, raw.after].map(value => {
    const source = object(value)
    if (Object.keys(source).length !== 2 || typeof source.path !== "string" || typeof source.sha256 !== "string")
      throw new EvalFailure("AGENT_SESSION_WINDOW_INVALID", 2)
    return readAdminSessionInventory(file, lease.identity, { path: source.path, sha256: source.sha256 })
  }))
  const before = snapshots[0]!, after = snapshots.at(-1)!, during = snapshots.slice(1, -1)
  if (new Set(snapshots.map(snapshot => snapshot.source.path)).size !== snapshots.length ||
    snapshots.some(snapshot => path.dirname(snapshot.source.path) !== path.dirname(before.source.path)) ||
    Date.parse(before.observation.finishedAt) > Date.parse(window.startedAt) || Date.parse(after.observation.startedAt) < Date.parse(window.finishedAt) ||
    during.some(snapshot => Date.parse(snapshot.observation.startedAt) > Date.parse(window.finishedAt) || Date.parse(snapshot.observation.finishedAt) < Date.parse(window.startedAt)))
    throw new EvalFailure("AGENT_SESSION_WINDOW_INVALID", 2)
  return { before, during, after }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("AGENT_SESSION_SOURCE_INVALID", 2)
  return value as Record<string, unknown>
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
