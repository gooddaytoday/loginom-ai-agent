// Private fixed standalone producer/SDK consumer binding. Never serialized authority.
const originals = new WeakMap<object, { signal: AbortSignal; deadline: number }>()
const throwIfAborted = AbortSignal.prototype.throwIfAborted
export function mintOriginalRunControl(signal: AbortSignal, deadline: number) {
  throwIfAborted.call(signal)
  if (!Number.isSafeInteger(deadline) || Date.now() >= deadline) throw Error("LOGINOM_ORIGINAL_RUN_EXPIRED")
  const control = Object.freeze({ signal, deadline })
  originals.set(control, { signal, deadline })
  return control
}
export function retainOriginalRunControl(control: object) {
  const original = originals.get(control)
  if (!original) throw Error("LOGINOM_ORIGINAL_RUN_UNAVAILABLE")
  const guard = () => {
    // Original cancellation precedes deadline; copied/accessor controls are never read.
    throwIfAborted.call(original.signal)
    if (Date.now() >= original.deadline) throw Error("LOGINOM_ORIGINAL_RUN_EXPIRED")
  }
  guard()
  return { signal: original.signal, deadline: original.deadline, guard }
}

// Retain the actual SDK argument tree before queueing. No reader/getter or DTO copy.
export function retainOriginalCallArguments(args: unknown) {
  const nodes: { value: object; prototype: object | null; entries: [PropertyKey, PropertyDescriptor][] }[] = []
  const seen = new Set<object>()
  const visit = (value: unknown) => {
    if (value === null || typeof value !== "object") {
      if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw Error("LOGINOM_ORIGINAL_CALL_INVALID")
      return
    }
    if (seen.has(value)) throw Error("LOGINOM_ORIGINAL_CALL_INVALID")
    seen.add(value)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) throw Error("LOGINOM_ORIGINAL_CALL_INVALID")
    const entries = Reflect.ownKeys(value).map(key => [key, Object.getOwnPropertyDescriptor(value, key)!] as [PropertyKey, PropertyDescriptor])
    nodes.push({ value, prototype, entries })
    for (const [key, descriptor] of entries) {
      if (typeof key === "symbol" || !("value" in descriptor)) throw Error("LOGINOM_ORIGINAL_CALL_INVALID")
      visit(descriptor.value)
    }
  }
  visit(args)
  return () => {
    for (const node of nodes) {
      const keys = Reflect.ownKeys(node.value)
      if (Object.getPrototypeOf(node.value) !== node.prototype || keys.length !== node.entries.length) throw Error("LOGINOM_ORIGINAL_CALL_CHANGED")
      for (let i = 0; i < keys.length; i++) {
        const [key, before] = node.entries[i]!
        const after = Object.getOwnPropertyDescriptor(node.value, key)
        if (keys[i] !== key || !after || !("value" in after) || !Object.is(after.value, before.value)
          || after.writable !== before.writable || after.enumerable !== before.enumerable || after.configurable !== before.configurable)
          throw Error("LOGINOM_ORIGINAL_CALL_CHANGED")
      }
    }
  }
}
