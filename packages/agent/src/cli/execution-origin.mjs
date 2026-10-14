import { AsyncLocalStorage } from 'node:async_hooks'
const storage = new AsyncLocalStorage()
const records = new WeakMap()
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get
const reason = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'reason').get
const signalOf = Object.getOwnPropertyDescriptor(AbortController.prototype, 'signal').get
const abort = AbortController.prototype.abort
const wall = Date.now.bind(Date), mono = performance.now.bind(performance)
const LIMIT = 7200_000
export function currentExecutionOrigin() { return storage.getStore() }
export function assertExecutionOrigin(origin) {
  const record = records.get(origin)
  if (!record) throw Error('LOGINOM_EXECUTION_ORIGIN_UNOWNED')
  if (aborted.call(origin.signal)) throw reason.call(origin.signal)
  if (record.first) throw record.first.value
  if (record.closed || wall() >= record.deadline || mono() - record.bornMono >= record.limit) {
    record.first = { value: Error('LOGINOM_EXECUTION_ORIGIN_EXPIRED') }
    throw record.first.value
  }
  return origin
}
// The fixed standalone entry is the admission point for a NEW invocation.
// Continuations keep this same opaque origin; projections/copies are unowned.
export function withExecutionOrigin(controller, run) {
  const inherited = storage.getStore()
  if (inherited) { assertExecutionOrigin(inherited); return run(inherited.signal) }
  const signal = signalOf.call(controller)
  if (aborted.call(signal)) throw reason.call(signal)
  const born = wall(), deadline = born + LIMIT
  const record = { bornMono: mono(), localBorn: born, born: BigInt(born)*1000000n, deadline, deadlineNs: BigInt(deadline)*1000000n, limit: LIMIT, closed: false, first: undefined, timer: undefined }
  const origin = Object.freeze({ signal, get born(){return record.born}, get deadline(){return record.deadlineNs} })
  records.set(origin, record)
  record.controller = controller
  record.timer = setTimeout(() => abort.call(controller, Error('LOGINOM_EXECUTION_ORIGIN_EXPIRED')), LIMIT)
  record.timer.unref()
  return storage.run(origin, async () => {
    try { return await run(signal) }
    finally { clearTimeout(record.timer); record.closed = true }
  })
}

// Only the already validated existing receiver calls this before publishing a
// RunCommand creation. Adopt its original absolute operand, never now()+budget.
export function adoptExecutionOrigin(born, deadline) {
  const origin = storage.getStore()
  if (!origin) return
  assertExecutionOrigin(origin)
  const record = records.get(origin)
  if (record.adopted) {
    if (record.born !== born || origin.deadline !== deadline) throw Error('LOGINOM_EXECUTION_ORIGIN_CHANGED')
    return
  }
  if (record.sealed) throw Error('LOGINOM_EXECUTION_ORIGIN_CHANGED')
  if (typeof born !== 'bigint' || typeof deadline !== 'bigint' || deadline <= born || deadline-born > BigInt(LIMIT)*1000000n) throw Error('LOGINOM_EXECUTION_ORIGIN_INVALID')
  if (deadline > origin.deadline) throw Error('LOGINOM_EXECUTION_ORIGIN_EXTENSION_REFUSED')
  record.adopted = true
  record.born = born
  record.deadlineNs = deadline
  record.deadline = Number(deadline/1000000n)
  record.limit = Math.min(LIMIT, record.deadline-record.localBorn)
  clearTimeout(record.timer)
  assertExecutionOrigin(origin)
  record.timer = setTimeout(() => abort.call(record.controller, Error('LOGINOM_EXECUTION_ORIGIN_EXPIRED')), Math.max(0,record.deadline-wall()))
  record.timer.unref()
}

export function sealExecutionOrigin(origin){assertExecutionOrigin(origin);records.get(origin).sealed=true}
