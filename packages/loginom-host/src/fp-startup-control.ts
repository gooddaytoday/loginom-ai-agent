// Private FP startup only. This retains the accepted IPC tuple; it does not
// mint a run, lease, storage binding or native cancellation confirmation.
export function retainFPStartup(message: { id: string; deadline?: unknown }, input: {
  root: string; resources: string; headless: boolean; strictRecovery?: unknown;
  acceptanceCleanupPackage?: unknown;
  acceptanceCapture: {authorization: string; packagePath: string; harness?: string}
}) {
  const id = message.id, rawDeadline = message.deadline, capture = input.acceptanceCapture
  const authorization = capture.authorization, packagePath = capture.packagePath, harness = capture.harness
  const root = input.root, resources = input.resources, headless = input.headless
  const strictRecovery = input.strictRecovery, cleanupPackage = input.acceptanceCleanupPackage
  if (harness !== 'field-parameters-preservation-v1' || !Number.isSafeInteger(rawDeadline)
      || typeof rawDeadline !== 'number' || Date.now() >= rawDeadline || rawDeadline - Date.now() > 180_000)
    throw Error('LOGINOM_PRE_READY_READ_EXPIRED')
  const deadline = rawDeadline
  const controller = new AbortController()
  const state: {pending: boolean; disposed: boolean; accepted?: boolean; refusal?: {value: unknown}} = { pending: true, disposed: false }
  function refuse(value: unknown) {
    if (state.refusal) return
    state.refusal = {value}
    controller.abort(value)
  }
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
    guard,
    get pending() { return state.pending },
    get accepted() { return state.accepted === true },
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
