import path from "node:path"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt } from "./lease"
import { reopenEnvironmentLeases, type ServerIdentity, type SlotFile } from "./slots"

// Caller holds the campaign controller lock and has observed inactive batch units.
export async function cancelUnusedVerification(file: SlotFile, scope: { stateRoot: string; campaignId: string }, binary: string, lockRoot = globalLockRoot) {
  const directory = path.join(scope.stateRoot, scope.campaignId)
  const journal = await readLeaseReceipt(path.join(directory, "journal.json")) as { campaignId: string; final: string; published: boolean; verificationDir: string }
  const owner = await readLeaseReceipt(path.join(scope.stateRoot, "owner.json")) as { campaignId: string }
  if (journal.campaignId !== scope.campaignId || owner.campaignId !== scope.campaignId || journal.final !== "partial" || journal.published !== true)
    throw new EvalFailure("TERMINAL_CAMPAIGN_REQUIRED", 2)
  if (typeof journal.verificationDir !== "string" || path.dirname(journal.verificationDir) !== path.join(directory, "verification"))
    throw new EvalFailure("TERMINAL_VERIFICATION_UNCONFIRMED", 2)
  const verification = await readLeaseReceipt(path.join(journal.verificationDir, "receipt.json")) as {
    version: number; commandId: string; identity: ServerIdentity; journal: string; receipt: string; status: string; ready: boolean; reason: string
  }
  if (verification.version !== 2 || !/^[a-zA-Z0-9-]+$/.test(verification.commandId) || verification.status !== "quarantined" ||
    verification.ready !== false || verification.reason !== "USER_PREPARATION_CONFLICT" ||
    verification.journal !== path.join(file.controller.stateDir, `verify-command-${verification.commandId}.json`) ||
    verification.receipt !== path.join(file.controller.stateDir, `verification-${verification.commandId}.json`) ||
    JSON.stringify(await readLeaseReceipt(verification.receipt)) !== JSON.stringify(verification))
    throw new EvalFailure("TERMINAL_VERIFICATION_UNCONFIRMED", 2)
  const environment = await reopenEnvironmentLeases(file, verification.identity, lockRoot)
  if (!environment) throw new EvalFailure("TERMINAL_VERIFICATION_UNCONFIRMED", 2)
  try {
    const command = await readLeaseReceipt(verification.journal)
    if (JSON.stringify(command) !== JSON.stringify({ version: 2, kind: "unactivated-preparation", commandId: verification.commandId,
      identity: verification.identity, slotIds: [file.slots[0]!.id], phase: "unactivated" }) || environment.server.reservation.commandId !== verification.commandId)
      throw new EvalFailure("TERMINAL_VERIFY_USED", 2)
    throw new EvalFailure("TERMINAL_OBSERVATION_REQUIRED", 2)
  } finally { await environment.server.close(); await Promise.all(environment.slots.map(slot => slot.close())) }
}
