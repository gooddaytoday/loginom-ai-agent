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
  const fpStartup=input.fpStartup
  if(fpStartup!==undefined && (!fpStartup || typeof fpStartup!=="object" || Object.keys(fpStartup).sort().join(",")!=="authorization,deadline,harness,requestId"
      || fpStartup.harness!=="field-parameters-preservation-v1" || typeof fpStartup.authorization!=="string" || !/^[a-f0-9]{64}$/.test(fpStartup.authorization)
      || typeof fpStartup.requestId!=="string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(fpStartup.requestId)
      || !Number.isSafeInteger(fpStartup.deadline) || fpStartup.deadline<=Date.now() || fpStartup.deadline>Date.now()+180000
      || input.validation===true || input.chat!=="readiness" || input.acceptanceCapture!==undefined)) throw Error("LOGINOM_START_INVALID")
  const capture = input.acceptanceCapture
  if (capture !== undefined) {
    const keys = 'account,admission,chat,expires,generation,harness,lease,owner,packagePath,revision,run'
    if (!capture || typeof capture !== 'object' || Object.keys(capture).sort().join(',') !== keys
        || capture.revision !== 1 || !['calculator-grouped-before-done-v1','amount-import-type-v1','field-parameters-preservation-v1'].includes(capture.harness)
        || !['owner','run','lease','chat','account','admission'].every(key =>
          typeof capture[key] === 'string' && /^[a-zA-Z0-9_:-]{1,200}$/.test(capture[key]))
        || capture.generation !== input.generation || capture.chat !== input.chat
        || capture.account !== input.connection?.username || capture.lease !== `${capture.owner}:${capture.run}`
        || !Number.isSafeInteger(capture.expires) || capture.expires <= Date.now() || capture.expires > Date.now()+600000
        || typeof capture.packagePath !== 'string' || capture.packagePath.length > 1024
        || !packagePath.test(capture.packagePath) || !capture.packagePath.startsWith(`/${capture.account}/`)
        || capture.packagePath.split('/').some(x => x === '.' || x === '..'))
      throw Error('LOGINOM_START_INVALID')
  }
  return { ...(fpStartup?{fpStartup}:{}), acceptanceCleanupPackage: cleanup, ...(capture ? {acceptanceCapture:capture} : {}) }
}
