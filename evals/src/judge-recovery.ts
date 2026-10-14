import path from "node:path"
import { lstat, mkdtemp, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, recoverResourceLease, writeLeaseReceipt } from "./lease"
import { loadJudgeEnvironment } from "./slots"
import { readJudgeProcessInventory } from "./judge-process-evidence"

export async function recoverOfflineJudge(input: { slotsFile: string; journal: string; token: string; revision: number; incidentToken?: string }, lockRoot = globalLockRoot) {
  const environment = await loadJudgeEnvironment(input.slotsFile)
  const root = path.dirname(input.journal), info = await lstat(root)
  if (input.journal !== path.join(root, "journal.json") || path.dirname(root) !== environment.stateDir || !path.basename(root).startsWith("judge-command-") ||
    await realpath(root) !== root || !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
    throw new EvalFailure("JUDGE_RECOVERY_JOURNAL_INVALID", 2)
  const original = recoveryObject(await readLeaseReceipt(input.journal))
  if (original.version !== 2 || original.kind !== "offline-judge-command" || typeof original.commandId !== "string" || !original.commandId ||
    original.processInventory !== path.join(root, "processes.json")) throw new EvalFailure("JUDGE_RECOVERY_JOURNAL_INVALID", 2)
  const key = `judge:${environment.codexHome}`, incidentToken = input.incidentToken ?? input.token
  const persisted = recoveryObject(original.recovery)
  const completed = persisted.status === "released" ? persisted : await releasedRecoveryMarker({ key, incidentToken, journal: input.journal,
    commandId: original.commandId, stateDir: environment.stateDir, token: input.token, revision: input.revision }, lockRoot)
  const reference = recoveryObject(completed.proof), released = recoveryObject(completed.released)
  if (completed.status === "released") {
    if (typeof released.token !== "string" || !released.token || !Number.isSafeInteger(released.revision) || Number(released.revision) < 1 ||
      completed.key !== key || completed.incidentToken !== incidentToken || typeof completed.journal !== "string" ||
      path.dirname(path.dirname(completed.journal)) !== environment.stateDir || !path.basename(path.dirname(completed.journal)).startsWith("judge-recovery-") ||
      reference.path !== path.join(path.dirname(completed.journal), "cleanup.json") || typeof reference.sha256 !== "string" ||
      ![completed.previous, completed.incident, completed.released].map(recoveryObject).some(value => value.token === input.token && value.revision === input.revision))
      throw new EvalFailure("JUDGE_RECOVERY_PROOF_INVALID", 2)
    const proof = recoveryObject(await readLeaseReceipt(reference.path))
    if (new Bun.CryptoHasher("sha256").update(JSON.stringify(proof)).digest("hex") !== reference.sha256 ||
      proof.version !== 2 || proof.status !== "confirmed" || proof.reason !== "qualified-closed-judge-proofs" ||
      proof.key !== key || proof.incidentToken !== incidentToken || proof.incidentJournal !== input.journal || proof.commandId !== original.commandId ||
      proof.token !== released.token || proof.revision !== released.revision)
      throw new EvalFailure("JUDGE_RECOVERY_PROOF_INVALID", 2)
    if (persisted.status !== "released") {
      await writeLeaseReceipt(input.journal, { ...original, state: "recovered", recovery: completed })
      await writeLeaseReceipt(completed.journal, { ...recoveryObject(await readLeaseReceipt(completed.journal)), state: "released", proof: reference.path })
    }
    return { status: "already_released" as const, journal: completed.journal, proof: reference.path }
  }
  const directory = await mkdtemp(path.join(environment.stateDir, "judge-recovery-")), journal = path.join(directory, "journal.json")
  const commandId = crypto.randomUUID()
  const record = { version: 2, kind: "offline-judge-recovery", commandId, incidentToken, incidentJournal: input.journal }
  await writeLeaseReceipt(journal, { ...record, state: "intent" })
  const lease = await recoverResourceLease({ key, lockRoot, journal, commandId },
    { token: input.token, revision: input.revision, incidentToken })
  try {
    const position = lease.reservation.lineage.findIndex(entry => entry.token === incidentToken)
    const incident = lease.reservation.lineage[position]
    if (!incident || incident.journal !== input.journal || incident.commandId !== original.commandId)
      throw new EvalFailure("JUDGE_RECOVERY_LINEAGE_INVALID", 2)
    for (const entry of lease.reservation.lineage.slice(position + 1)) {
      const previous = recoveryObject(await readLeaseReceipt(entry.journal))
      if (previous.kind !== "offline-judge-recovery" || previous.commandId !== entry.commandId ||
        previous.incidentToken !== incidentToken || previous.incidentJournal !== input.journal)
        throw new EvalFailure("JUDGE_RECOVERY_LINEAGE_INVALID", 2)
    }
    const inventory = await readJudgeProcessInventory({ file: original.processInventory, commandId: original.commandId, producerPid: incident.owner.pid })
    if ((await Bun.file("/proc/sys/kernel/random/boot_id").text()).trim() === incident.owner.bootId) {
      for (const identity of inventory.processes.flatMap(entry => entry.identities)) {
        const raw = await Bun.file(`/proc/${identity.pid}/stat`).text().catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null
          throw new EvalFailure("JUDGE_PROCESS_LIVENESS_UNVERIFIED", 2)
        })
        if (raw === null) continue
        const fields = raw.slice(raw.lastIndexOf(")") + 2).trim().split(/\s+/)
        if (fields.length < 20) throw new EvalFailure("JUDGE_PROCESS_LIVENESS_UNVERIFIED", 2)
        if (fields[19] === identity.starttime && !["Z", "X"].includes(fields[0]!))
          throw new EvalFailure("JUDGE_PROCESS_STILL_LIVE", 2)
      }
    }
    const proof = path.join(directory, "cleanup.json")
    const receipt = { version: 2, status: "confirmed", reason: "qualified-closed-judge-proofs",
      key: lease.reservation.key, token: lease.reservation.token, revision: lease.reservation.revision, incidentToken, incidentJournal: input.journal,
      commandId: original.commandId, sources: inventory.processes.map(entry => entry.source) }
    await writeLeaseReceipt(proof, receipt)
    await lease.release(proof)
    await writeLeaseReceipt(input.journal, { ...original, state: "recovered", recovery: { status: "released", key, incidentToken, journal,
      previous: { token: input.token, revision: input.revision }, incident: { token: incident.token, revision: incident.revision },
      released: { token: lease.reservation.token, revision: lease.reservation.revision },
      proof: { path: proof, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex") } } })
    await writeLeaseReceipt(journal, { ...record, state: "released", proof })
    return { status: "released" as const, journal, proof }
  } finally { await lease.close() }
}

function recoveryObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function releasedRecoveryMarker(input: { key: string; incidentToken: string; journal: string; commandId: string; stateDir: string; token: string; revision: number }, lockRoot: string): Promise<Record<string, unknown>> {
  const reservation = await readResourceReservation({ key: input.key, lockRoot })
  if (!reservation || reservation.state !== "released") return {}
  const incident = reservation.lineage.find(entry => entry.token === input.incidentToken && entry.journal === input.journal && entry.commandId === input.commandId)
  if (!incident || ![{ token: reservation.token, revision: reservation.revision }, ...reservation.lineage]
    .some(entry => entry.token === input.token && entry.revision === input.revision)) return {}
  if (path.dirname(path.dirname(reservation.journal)) !== input.stateDir || !path.basename(path.dirname(reservation.journal)).startsWith("judge-recovery-"))
    throw new EvalFailure("JUDGE_RECOVERY_PROOF_INVALID", 2)
  const journal = recoveryObject(await readLeaseReceipt(reservation.journal))
  if (journal.kind !== "offline-judge-recovery" || journal.commandId !== reservation.commandId ||
    journal.incidentToken !== input.incidentToken || journal.incidentJournal !== input.journal)
    throw new EvalFailure("JUDGE_RECOVERY_PROOF_INVALID", 2)
  return { status: "released", key: input.key, incidentToken: input.incidentToken, journal: reservation.journal,
    previous: { token: reservation.lineage.at(-1)!.token, revision: reservation.lineage.at(-1)!.revision },
    incident: { token: incident.token, revision: incident.revision },
    released: { token: reservation.token, revision: reservation.revision }, proof: reservation.releaseEvidence }
}
