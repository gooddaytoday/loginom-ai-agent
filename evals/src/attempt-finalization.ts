import path from "node:path"
import { mkdtemp } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { pauseAgentProcessInventory, readAgentProcess, readAgentProcessBoundary } from "./agent-process-evidence"
import { readAgentInvocationArchive, type AgentSessionSource } from "./agent-sessions"
import { collectSlotSessions } from "./management-sessions"
import { sealManagementProcessInventory } from "./management-process-evidence"
import { readAdminSessionInventory, type AdminConnection } from "./loginom-admin"
import { verifyParallelPair } from "./parallel-pair"
import { archiveProfileEvidence } from "./profile-archive"
import { releaseStaleWriter } from "./profile"
import type { ProcessCleanup } from "./process-supervisor"
import type { acquireEnvironmentLeases, SlotFile, SlotLease } from "./slots"

/** Archives a normal invocation and closes its accounted slot sessions; cleanup/release remain separate. */
export async function finalizeSlotAttempt(file: SlotFile, server: Awaited<ReturnType<typeof acquireEnvironmentLeases>>["server"], lease: SlotLease,
  sources: { management: string; agents: { file: string; observations: AgentSessionSource[] } }, admin: AdminConnection) {
  if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  await server.assertHeld()
  await lease.assertHeld()
  if (JSON.stringify(admin.identity) !== JSON.stringify(lease.identity)) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  const management = await sealManagementProcessInventory(file, server, lease, sources.management)
  const command = record(await readLeaseReceipt(server.reservation.journal))
  if (command.commandId !== server.reservation.commandId || command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted" ||
    JSON.stringify(command.identity) !== JSON.stringify(lease.identity) || !Array.isArray(command.agentInventories) ||
    command.agentInventories.filter(value => record(value).slotId === lease.slot.id).length !== 1 || !command.agentInventories.some(value => {
      const binding = record(value)
      return Object.keys(binding).length === 4 && binding.file === sources.agents.file && binding.slotId === lease.slot.id &&
        binding.leaseToken === lease.token && binding.profileDir === lease.slot.profileDir
    })) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  await verifyParallelPair(file, lease.identity)
  const evidence = { file: sources.agents.file, commandId: server.reservation.commandId, slotId: lease.slot.id, assertHeld: lease.assertHeld }
  const boundary = await pauseAgentProcessInventory(evidence)
  const secretFile = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
  await collectSlotSessions(file, lease, secretFile, sources, (await admin.inspectSessionInventory()).source)
  const latest = sources.agents.observations.at(-1)
  if (!latest) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  const local = await readAgentProcessBoundary({ ...evidence, producerPid: process.pid })
  const invocation = await readAgentProcess({ ...evidence, producerPid: process.pid }, latest.process.id)
  if (invocation.source.path !== local.processes.at(-1)?.source.path || JSON.stringify(local.source) !== JSON.stringify(boundary))
    throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  const archiveFile = path.join(file.controller.stateDir, `agent-archive-${latest.process.id}.json`)
  const previous = await optional(archiveFile)
  if (previous && (typeof previous.archive !== "string" || path.dirname(previous.archive) !== lease.slot.historyDir || previous.profile !== lease.slot.profileDir))
    throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
  if (!previous) {
    const proof = await readLeaseReceipt(invocation.source.path) as ProcessCleanup
    if (hash(proof) !== invocation.source.sha256) throw new EvalFailure("AGENT_PROCESS_PROOF_HASH_MISMATCH", 2)
    await releaseStaleWriter(lease.slot.profileDir, proof.writer ?? null)
  }
  const archived = await archiveProfileEvidence(lease.slot.profileDir,
    previous ? String(previous.archive) : await mkdtemp(path.join(lease.slot.historyDir, "agent-")), archiveFile)
  const archives = await Promise.all(sources.agents.observations.map(async observation => ({ process: observation.process,
    source: await readAgentInvocationArchive(file, lease, observation.process,
      await reference(path.join(file.controller.stateDir, `agent-archive-${observation.process.id}.json`))) })))
  const before = await admin.inspectSessionInventory()
  const accounted = await collectSlotSessions(file, lease, secretFile, sources, before.source)
  const targets = await Promise.all([...accounted.management, ...accounted.agents].map(async session => {
    const kind = session.actor.kind === "agent" ? "agent" : "management"
    return { kind, id: session.id, observed: await reference(path.join(file.controller.stateDir, `${kind}-session-${session.id}.json`)) }
  }))
  const base = { version: 2, kind: "slot-attempt-close-intent", commandId: server.reservation.commandId, identity: lease.identity,
    slotId: lease.slot.id, leaseToken: lease.token, boundary, management: management.source, inputs: sources, archives, targets }
  const target = path.join(file.controller.stateDir, `agent-finalization-${latest.process.id}.json`), intentFile = `${target}.intent.json`
  const existing = await optional(intentFile), completed = await optional(target)
  if (completed && !existing) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  const intent = existing ?? { ...base, before: before.source, at: new Date().toISOString() }
  if (typeof intent.at !== "string" || !Number.isFinite(Date.parse(intent.at)) ||
    JSON.stringify(intent) !== JSON.stringify({ ...base, before: intent.before, at: intent.at })) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  const first = await readAdminSessionInventory(file, lease.identity, record(intent.before) as { path: string; sha256: string })
  if (Date.parse(first.observation.finishedAt) > Date.parse(intent.at)) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  if (existing && [...accounted.management, ...accounted.agents].some(session => session.state !== "closed"))
    throw new EvalFailure("ATTEMPT_FINALIZATION_PENDING", 2)
  await server.assertHeld()
  await lease.assertHeld()
  if (hash(await readLeaseReceipt(server.reservation.journal)) !== hash(command)) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  if (!existing) await writeLeaseReceipt(intentFile, intent)
  for (const session of accounted.agents) {
    const archive = archives.find(archive => archive.process.id === session.actor.attemptId)
    if (!archive) throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
    await admin.closeAgentSession(lease, secretFile, session.id, archive.source)
  }
  for (const session of accounted.management) await admin.closeManagementSession(lease, secretFile, session.id)
  const after = await admin.inspectSessionInventory()
  const closed = await collectSlotSessions(file, lease, secretFile, sources, after.source)
  const sessions = await Promise.all([...closed.management, ...closed.agents].map(async session => {
    if (session.state !== "closed") throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
    const kind = session.actor.kind === "agent" ? "agent" : "management"
    return { kind, id: session.id, state: session.state, observed: await reference(path.join(file.controller.stateDir, `${kind}-session-${session.id}.json`)),
      closed: await reference(path.join(file.controller.stateDir, `${kind}-session-${session.id}.closed.json`)) }
  }))
  await verifyParallelPair(file, lease.identity)
  for (const archive of archives) await readAgentInvocationArchive(file, lease, archive.process, archive.source)
  if (JSON.stringify(await pauseAgentProcessInventory(evidence)) !== JSON.stringify(boundary) ||
    hash(await readLeaseReceipt(server.reservation.journal)) !== hash(command)) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  const finalAfter = completed ? await readAdminSessionInventory(file, lease.identity, record(completed.after) as { path: string; sha256: string }) : after
  if (completed && (Date.parse(finalAfter.observation.startedAt) < Date.parse(intent.at) || finalAfter.sessions.some(row =>
    row.name.toLowerCase() === lease.slot.username.toLowerCase() || row.name.toLowerCase().startsWith(lease.slot.username.toLowerCase() + ":"))))
    throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  const receipt = { version: 2, kind: "slot-attempt-finalization", status: "sessions_closed" as const, identity: lease.identity,
    slotId: lease.slot.id, leaseToken: lease.token, boundary, intent: await reference(intentFile), archived, archives, sessions,
    after: finalAfter.source, storageDeletionAllowed: false, nextAdmissionAllowed: false }
  if (completed && JSON.stringify(completed) !== JSON.stringify(receipt)) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  if (!completed) await writeLeaseReceipt(target, receipt)
  return { status: receipt.status, sessions, archived, after: receipt.after, source: { path: target, sha256: hash(receipt) } }
}

async function reference(file: string) {
  return { path: file, sha256: hash(await readLeaseReceipt(file)) }
}

async function optional(file: string) {
  const value = await readLeaseReceipt(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })
  return value === undefined ? undefined : record(value)
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("ATTEMPT_FINALIZATION_UNCONFIRMED", 2)
  return value as Record<string, unknown>
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
