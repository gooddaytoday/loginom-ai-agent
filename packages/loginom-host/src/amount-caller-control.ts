// Amount-only parent retention component. The stock launcher is not wired to
// this component yet: shared forwarding is owned by LAB-67. Nothing here mints
// a lease, child, operation, deadline or native authority.
type Tuple = { operation: string; request: string; owner: string; run: string; lease: string; generation: number; chat: string; account: string }
export type AmountCallerControl = Tuple & { signal: AbortSignal; deadline: number }
const keys = ["operation", "request", "owner", "run", "lease", "generation", "chat", "account", "signal", "deadline"] as const
const retained = new WeakMap<object, { input: AmountCallerControl; original: AmountCallerControl; attempted: boolean; dispatchSettled: boolean; settled: boolean }>()
const inputs = new WeakMap<object, object>()
// Fence the original identity, not its replaceable JS carrier. Keep only the
// operation/request tombstone after settlement: neither UNKNOWN nor a copied
// carrier can restore attempted=false. Different original requests stay valid.
const originalRequests = new Set<string>()
const refuse = () => { throw Error("LOGINOM_AMOUNT_CALLER_CONTROL") }

export function retainAmountCaller(input: AmountCallerControl) {
  if (input && inputs.has(input)) { const grant = inputs.get(input)!; assertAmountCaller(grant, input); return grant }
  if (!input || !(input.signal instanceof AbortSignal) || !Number.isSafeInteger(input.deadline) || input.deadline <= Date.now()
    || !Number.isSafeInteger(input.generation) || input.generation < 1 || input.lease !== input.owner + ":" + input.run
    || ![input.operation, input.request, input.owner, input.run, input.chat, input.account].every(v => typeof v === "string" && v.length > 0)) refuse()
  input.signal.throwIfAborted()
  // Own scalar values are captured before any await. Signal is the ACTUAL
  // parent object, deliberately retained by reference and never serialized.
  const original = Object.freeze(Object.fromEntries(keys.map(k => [k, input[k]]))) as AmountCallerControl
  const requestKey = JSON.stringify([original.operation, original.request])
  if (originalRequests.has(requestKey)) refuse()
  originalRequests.add(requestKey)
  const grant = Object.freeze({})
  retained.set(grant, { input, original, attempted: false, dispatchSettled: false, settled: false })
  inputs.set(input, grant)
  return grant
}

export function assertAmountCaller(grant: object, input: AmountCallerControl) {
  const state = retained.get(grant)
  if (!state || state.input !== input || state.settled || keys.some(k => input[k] !== state.original[k])) refuse()
  state.original.signal.throwIfAborted()
  if (Date.now() >= state.original.deadline) refuse()
  return state.original
}

export async function runAmountCaller<T>(grant: object, input: AmountCallerControl, dispatch: (original: Readonly<AmountCallerControl>) => Promise<T>) {
  const original = assertAmountCaller(grant, input), state = retained.get(grant)!
  if (state.attempted) refuse()
  state.attempted = true
  // A rejected/lost reply remains attempted and retained. Never retry dispatch.
  try {
    const result = await dispatch(original)
    assertAmountCaller(grant, input)
    return result
  } finally { state.dispatchSettled = true }
}

// Settlement is separate from dispatch success. The integrating owner must
// confirm both its evidence IO and cleanup; this is not a native verifier.
export function settleAmountCaller(grant: object, evidenceSettled: boolean, cleanupSettled: boolean) {
  const state = retained.get(grant)
  if (!state || !state.attempted || !state.dispatchSettled || state.settled || evidenceSettled !== true || cleanupSettled !== true) refuse()
  state.settled = true
  retained.delete(grant)
}
