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
  if(input.fpStartup!==undefined)throw Error("LOGINOM_START_INVALID")
  const amountStartup=input.amountStartup
  if(amountStartup!==undefined) validateAmountStartup(input,amountStartup)
  const capture = input.acceptanceCapture
  if (capture !== undefined) {
    const keys = 'account,admission,chat,expires,generation,harness,lease,owner,packagePath,revision,run'
    if (!capture || typeof capture !== 'object' || Object.keys(capture).sort().join(',') !== keys
        || capture.revision !== 1 || !['calculator-grouped-before-done-v1','amount-import-type-v1'].includes(capture.harness)
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
  return { ...(amountStartup?{amountStartup}:{}), acceptanceCleanupPackage: cleanup, ...(capture ? {acceptanceCapture:capture} : {}) }
}

// A separate closed Amount packet. Scalar IPC claims are cancellation/routing
// bindings only; they cannot establish an acquired parent lease/native owner.
function validateAmountStartup(input,tuple) {
  const fixed='authorization,deadline,operation,purpose,request,requestId'
  if(!tuple || typeof tuple!=='object' || tuple.purpose!=='amount-import-type-v1'
      || typeof tuple.authorization!=='string' || !/^[a-f0-9]{64}$/.test(tuple.authorization)
      || !['requestId','operation','request'].every(k=>typeof tuple[k]==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(tuple[k]))
      || !Number.isSafeInteger(tuple.deadline) || tuple.deadline<=Date.now() || tuple.deadline>Date.now()+180000
      || input.validation===true)throw Error('LOGINOM_START_INVALID')
  const keys=Object.keys(tuple).sort().join(',')
  if(keys===fixed) {
    if(input.chat!=='readiness' || input.acceptanceCapture!==undefined)throw Error('LOGINOM_START_INVALID')
  } else if(keys==='authorization,binding,deadline,operation,phase,purpose,request,requestId' && tuple.phase==='capture') {
    const capture=input.acceptanceCapture,binding=tuple.binding
    if(input.chat==='readiness' || !capture || capture.harness!=='amount-import-type-v1'
        || !binding || typeof binding!=='object'
        || Object.keys(binding).sort().join(',')!==Object.keys(capture).sort().join(',')
        || Object.keys(capture).some(k=>binding[k]!==capture[k]) || capture.expires>tuple.deadline)
      throw Error('LOGINOM_START_INVALID')
  } else throw Error('LOGINOM_START_INVALID')
}
