import { isAbsolute } from "node:path"

// Mirrors the acceptanceCleanupPackage check in ../client/lib/config.mjs. The
// managed entry builds its config directly, so the guard must be repeated here.
const packagePath = /^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/

export function validateStartInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    input.protocol !== 1 ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1 ||
    typeof input.chat !== "string" ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(input.chat) ||
    typeof input.stateDir !== "string" ||
    !isAbsolute(input.stateDir)
  )
    throw Error("LOGINOM_START_INVALID")
  if (input.trustedAttempt !== undefined && (!input.trustedAttempt || typeof input.trustedAttempt !== 'object'
      || Object.keys(input.trustedAttempt).join() !== 'attemptId'
      || typeof input.trustedAttempt.attemptId !== 'string'
      || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.trustedAttempt.attemptId))) throw Error('LOGINOM_START_INVALID')
  // Acceptance-only: the exact saved package the bridge closes during shutdown.
  const cleanup = input.acceptanceCleanupPackage ?? null
  if (
    cleanup !== null &&
    (typeof cleanup !== "string" ||
      cleanup.length > 1024 ||
      !packagePath.test(cleanup) ||
      cleanup.split("/").some((segment) => segment === "." || segment === ".."))
  )
    throw Error("LOGINOM_START_INVALID")
  return { acceptanceCleanupPackage: cleanup }
}
