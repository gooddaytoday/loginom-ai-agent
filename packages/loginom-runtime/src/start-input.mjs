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
  if (
    input.trustedAttempt !== undefined &&
    (!input.trustedAttempt ||
      typeof input.trustedAttempt !== "object" ||
      Object.keys(input.trustedAttempt).join() !== "attemptId" ||
      typeof input.trustedAttempt.attemptId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(input.trustedAttempt.attemptId))
  )
    throw Error("LOGINOM_START_INVALID")
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
  let loginBinding
  if (input.loginBarrier !== undefined || input.loginBinding !== undefined) {
    const b = input.loginBinding
    const uuid = (v) =>
      typeof v === "string" &&
      v.length === 36 &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
    if (
      input.loginBarrier !== 2 ||
      !b ||
      typeof b !== "object" ||
      Object.keys(b).sort().join() !== "account,attemptId,chat,generation,loginId,purpose" ||
      typeof b.attemptId !== "string" ||
      !b.attemptId.length ||
      b.attemptId.length > 160 ||
      /[^A-Za-z0-9_-]/.test(b.attemptId) ||
      b.attemptId !== input.trustedAttempt?.attemptId ||
      !uuid(b.loginId) ||
      b.generation !== input.generation ||
      b.chat !== input.chat ||
      b.account !== input.connection?.username ||
      typeof b.account !== "string" ||
      !b.account.length ||
      b.account.length > 128 ||
      /[\x00-\x1f\x7f]/.test(b.account) ||
      !(input.validation === true
        ? b.purpose === "validation" && uuid(b.chat)
        : b.chat === "readiness"
          ? b.purpose === "readiness"
          : b.purpose === "chat" && b.chat.length === 64 && !/[^a-f0-9]/.test(b.chat))
    )
      throw Error("LOGINOM_LOGIN_BARRIER_INVALID")
    loginBinding = Object.freeze({ ...b })
  }
  return { acceptanceCleanupPackage: cleanup, ...(loginBinding ? { loginBinding } : {}) }
}
