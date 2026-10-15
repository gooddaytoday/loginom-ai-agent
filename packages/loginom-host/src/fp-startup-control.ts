// Private FP startup only. This retains the accepted IPC tuple; it does not
// mint a run, lease, storage binding or native cancellation confirmation.
export function retainFPStartup(message: { id: string; deadline?: unknown }, input: {
  root: string; resources: string; headless: boolean; strictRecovery?: unknown;
  acceptanceCleanupPackage?: unknown;
  acceptanceCapture: {authorization: string; packagePath: string; harness?: string}
}) {
  return retainStartup(message, input, 'field-parameters-preservation-v1')
}

function retainStartup<H extends 'field-parameters-preservation-v1'>(
  message: Parameters<typeof retainFPStartup>[0], input: Parameters<typeof retainFPStartup>[1],
  purpose: H,
) {
  const id = message.id, rawDeadline = message.deadline, capture = input.acceptanceCapture
  const authorization = capture.authorization, packagePath = capture.packagePath, harness = capture.harness
  const root = input.root, resources = input.resources, headless = input.headless
  const strictRecovery = input.strictRecovery, cleanupPackage = input.acceptanceCleanupPackage
  if (harness !== purpose || !Number.isSafeInteger(rawDeadline)
      || typeof rawDeadline !== 'number' || Date.now() >= rawDeadline || rawDeadline - Date.now() > 180_000)
    throw Error('LOGINOM_PRE_READY_READ_EXPIRED')
  const deadline = rawDeadline
  const controller = new AbortController()
  const state: {pending: boolean; disposed: boolean; accepted?: boolean; refusal?: {value: unknown}; secondary?: {value: unknown}} = { pending: true, disposed: false }
  function refuse(value: unknown) {
    if (state.refusal) return
    state.refusal = {value}
    controller.abort(value)
  }
  const propagated=new WeakSet<object>()
  const timer = setTimeout(() => refuse(Error('LOGINOM_PRE_READY_READ_EXPIRED')), deadline - Date.now())
  function guard() {
    // Original refusal wins over secondary tuple drift, including falsy causes.
    if (state.refusal) throw state.refusal.value
    if (Date.now() >= deadline) { refuse(Error('LOGINOM_PRE_READY_READ_EXPIRED')); throw state.refusal!.value }
    if (message.id !== id || message.deadline !== deadline || input.acceptanceCapture !== capture
        || capture.authorization !== authorization || capture.packagePath !== packagePath || capture.harness !== harness
        || input.root !== root || input.resources !== resources || input.headless !== headless
        || input.strictRecovery !== strictRecovery || input.acceptanceCleanupPackage !== cleanupPackage)
      throw Error('LOGINOM_HANDSHAKE_INVALID')
  }
  return {
    control: {signal: controller.signal, deadline},
    tuple: Object.freeze({requestId:id, authorization, harness:purpose, deadline,}),
    guard,
    get pending() { return state.pending },
    get accepted() { return state.accepted === true },
    get secondary() { return state.secondary },
    forward(value:unknown) {
      state.refusal ??= {value}
      const carrier={};propagated.add(carrier);return carrier
    },
    propagate(value:unknown) {
      state.refusal ??= {value}
      return state.refusal.value
    },
    // One response for the original pending managed request. A control receipt
    // carries the already accepted cancellation; an await/guard receipt records
    // a native event. Equal values are deliberately not compared.
    receive(value:unknown, origin:unknown, secondary?:{value:unknown}) {
      if(!["control","await","guard"].includes(origin as string))throw Error("LOGINOM_STARTUP_RECEIPT_INVALID")
      if(origin==="control")state.refusal??={value}
      else if(!state.refusal)state.refusal={value}
      else state.secondary??={value}
      if(secondary)state.secondary??=secondary
      return state.refusal!.value
    },
    reject(value: unknown) {
      if(value!==null && typeof value==="object" && propagated.has(value))return state.refusal!.value
      if (!state.refusal) state.refusal = {value}
      else state.secondary ??= {value}
      return state.refusal.value
    },
    cancel(value: unknown) {
      if (state.disposed || !state.pending || !value || typeof value !== 'object') return false
      const tuple = value as Record<string, unknown>
      if (tuple.phase !== 'startup' || tuple.requestId !== id || tuple.authorization !== authorization
          || tuple.deadline !== deadline || tuple.harness !== harness || !('rejection' in tuple)) return false
      guard()
      refuse(decode(tuple.rejection))
      return true
    },
    settle(accepted: boolean) { state.accepted = accepted; state.pending = false; state.disposed = true; clearTimeout(timer) },
  }
}
function decode(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('kind' in value)) throw Error('LOGINOM_HANDSHAKE_INVALID')
  const rejection = value as Record<string, unknown>
  if (rejection.kind === 'Error' && typeof rejection.message === 'string' && typeof rejection.name === 'string') {
    const error = new Error(rejection.message, 'cause' in rejection ? {cause: decode(rejection.cause)} : undefined)
    error.name = rejection.name
    return error
  }
  if (rejection.kind === 'value' && typeof rejection.is_undefined === 'boolean' && 'value' in rejection)
    return rejection.is_undefined ? undefined : rejection.value
  throw Error('LOGINOM_HANDSHAKE_INVALID')
}

// Only the trusted early receiver binds an existing startup object to its host
// options. Serialized caller fields cannot create this retained capability.
const hostStarts = new WeakMap<object, ReturnType<typeof retainFPStartup>>()
export function bindFPHostStartup(options: object, startup: ReturnType<typeof retainFPStartup>) { hostStarts.set(options,startup) }
export function getFPHostStartup(options: object) { return hostStarts.get(options) }

export type HostStartup = ReturnType<typeof retainFPStartup>
