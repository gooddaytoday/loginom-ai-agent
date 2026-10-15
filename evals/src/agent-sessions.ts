import path from "node:path"
import { EvalFailure } from "./fail"
import { readAgentProcess } from "./agent-process-evidence"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { readUserActivation, readUserOwnership, readUserPreparation } from "./user-environment"
import type { SlotFile, SlotLease } from "./slots"

type Reference = { path: string; sha256: string }
export type AgentSessionSource = { process: Reference & { id: string }; before: Reference; during: Reference[]; after: Reference }

/** Records causal agent sessions; closing and filesystem cleanup require separate fences. */
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
  return sessions
}

export async function readAgentSession(file: SlotFile, lease: SlotLease, secretFile: string, id: string) {
  await lease.assertHeld()
  if (!/^[a-f0-9]{64}$/.test(id)) throw new EvalFailure("AGENT_SESSION_SOURCE_INVALID", 2)
  const saved = object(await readLeaseReceipt(path.join(file.controller.stateDir, `agent-session-${id}.json`)))
  const expected = (await agentSessions(file, lease, secretFile, saved.source)).find(session => session.id === id)
  if (!expected || JSON.stringify(saved) !== JSON.stringify(expected)) throw new EvalFailure("AGENT_SESSION_SOURCE_CHANGED", 2)
  return expected
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
  requireBrowserProof(await readLeaseReceipt(processEntry.source.path), lease.slot.profileDir, processEntry)
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
  if (!rows.length || new Set(rows.map(row => JSON.stringify([row.name.toLowerCase(), row.createdAt]))).size !== rows.length ||
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
    actor: { kind: "agent", runId: origin.commandId, attemptId: processEntry.entrySource.id, owner: processEntry.owner },
    binding: { remoteKey: row.objectId, userKey: owned.userKey, username: owned.username, serverEpoch: lease.identity.serverEpoch, name: row.name, createdAt: row.createdAt },
    source: { process: processEntry.entrySource, before: snapshots.before.source, during: snapshots.during.map(snapshot => snapshot.source), after: snapshots.after.source } }))
}

function requireBrowserProof(value: unknown, profile: string, window: { startedAt: string; finishedAt: string }) {
  const proof = object(value), bindings = proof.browserBindings, directories = proof.runtimeDirectories, processes = proof.processes
  if (!Array.isArray(bindings) || !bindings.length || !Array.isArray(directories) || !directories.length || !Array.isArray(processes) ||
    directories.some(dir => typeof dir !== "string" || path.resolve(dir) !== dir || !dir.startsWith(profile + path.sep)) || bindings.some(value => {
      const binding = object(value)
      return Object.keys(binding).length !== 3 || !directories.includes(binding.runtimeDirectory) ||
        !processes.some(process => JSON.stringify(process) === JSON.stringify(binding.process)) ||
        typeof binding.observed_at !== "string" || !Number.isFinite(Date.parse(binding.observed_at)) ||
        Date.parse(binding.observed_at) < Date.parse(window.startedAt) || Date.parse(binding.observed_at) > Date.parse(window.finishedAt)
    })) throw new EvalFailure("AGENT_SESSION_BROWSER_UNCONFIRMED", 2)
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
