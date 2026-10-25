import path from "node:path"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt } from "./lease"
import type { SlotFile } from "./slots"

// Caller holds the campaign controller lock and has observed inactive batch units.
export async function cancelUnusedVerification(file: SlotFile, scope: { stateRoot: string; campaignId: string }, binary: string, lockRoot = globalLockRoot) {
  const directory = path.join(scope.stateRoot, scope.campaignId)
  const journal = await readLeaseReceipt(path.join(directory, "journal.json")) as { campaignId: string; final: string; published: boolean }
  const owner = await readLeaseReceipt(path.join(scope.stateRoot, "owner.json")) as { campaignId: string }
  if (journal.campaignId !== scope.campaignId || owner.campaignId !== scope.campaignId || journal.final !== "partial" || journal.published !== true)
    throw new EvalFailure("TERMINAL_CAMPAIGN_REQUIRED", 2)
  throw new EvalFailure("TERMINAL_VERIFICATION_UNCONFIRMED", 2)
}
