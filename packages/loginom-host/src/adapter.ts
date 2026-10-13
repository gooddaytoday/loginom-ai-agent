import type { InputFile } from "./inputs"
export * as LoginomHost from "./adapter"

import { originalUnionInvocation } from "../../loginom-runtime/client/lib/union-invocation.mjs"

import { randomUUID } from "node:crypto"
import { types } from "node:util"
import { transport, type Port } from "./transport"

type Owner = { deferRelease: boolean; leases: Set<{ release(): Promise<void> }> }
const state: { connection?: ReturnType<typeof transport>; owner?: Owner } = {}
export function connect(port: Port, owner?: Owner) {
  state.connection?.close()
  state.connection = transport(port)
  state.owner = owner
}
export function disconnect() {
  state.connection?.close()
  state.connection = undefined
  state.owner = undefined
}
export async function acquire(session: string) {
  const connection = state.connection
  if (!connection) return
  const run = randomUUID()
  const value = await connection.request("acquire", { session, run })
  if (!value) throw new Error("LOGINOM_HOST_NOT_READY")
  if (typeof value !== "object" || !("generation" in value) || typeof value.generation !== "number")
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  const owner = state.owner
  const queue = { tail: Promise.resolve(), released: false }
  const lease = {
    generation: value.generation,
    async admit(userMessage: string, files: InputFile[]) {
      return connection.request("admit", { run, userMessage, files })
    },
    async tools() {
      return connection.request("tools", { run })
    },
    async call(name: string, args: unknown, userMessage: string, signal?: AbortSignal, packet?: unknown) {
      // Read only plain data descriptors; never let serialization classify a
      // getter/Proxy differently. The snapshot belongs to us, not the caller.
      const snapshot = name === "dock_node_apply" ? nodeApplySnapshot(args) : undefined
      const bytes = snapshot === undefined ? undefined : JSON.stringify(snapshot)
      const union = name === "dock_node_apply" && snapshot?.target?.type === "transform.union_data"
      if (packet !== undefined || union) {
        // Consume the upstream brand before queue admission. IPC's generation-only
        // acquire reply is not the original acquired tuple/currentness provider.
        const invocation = originalUnionInvocation(packet, lease)
        if (queue.released || state.connection !== connection || state.owner !== owner)
          throw Error("UNION_INVOCATION_BINDING_CHANGED")
        if (!union || invocation.purpose !== "union-original-invocation-v1"
            || invocation.request !== args || invocation.signal !== signal
            || invocation.userMessage !== userMessage || invocation.generation !== lease.generation)
          throw Error("UNION_INVOCATION_BINDING_CHANGED")
        throw Error("ORIGINAL_UNION_ACQUIRED_PROVIDER_UNAVAILABLE")
      }
      // Serialize before transport admission so waiting does not consume the IPC timeout
      // or create durable recovery records for calls that have not started.
      const previous = queue.tail
      const next = Promise.withResolvers<void>()
      queue.tail = next.promise
      await previous
      const abort = () => {
        void connection.request("interrupt", { run }).catch(() => undefined)
      }
      try {
        if (queue.released || signal?.aborted) throw new Error("LOGINOM_RUN_ABORTED")
        signal?.addEventListener("abort", abort, { once: true })
        if (name === "dock_node_apply" && JSON.stringify(nodeApplySnapshot(args)) !== bytes)
          throw Error("UNION_INVOCATION_BINDING_CHANGED")
        return await connection.request("call", { run, name, args: name === "dock_node_apply" ? snapshot : args, userMessage })
      } finally {
        signal?.removeEventListener("abort", abort)
        next.resolve()
      }
    },
    async release() {
      if (owner?.deferRelease) return
      queue.released = true
      await connection.request("release", { run }).catch(() => undefined)
      owner?.leases.delete(lease)
    },
  }
  owner?.leases.add(lease)
  return lease
}

// A closed JSON operand for node.apply. Building from descriptors avoids invoking
// caller accessors/toJSON; retained bytes detect queue-time replacement/drift.
function nodeApplySnapshot(value: unknown, ancestors = new Set<object>()): any {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (!value || typeof value !== "object" || types.isProxy(value) || ancestors.has(value))
    throw Error("UNION_INVOCATION_CLASSIFICATION_UNSUPPORTED")
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value)
  if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array))
    throw Error("UNION_INVOCATION_CLASSIFICATION_UNSUPPORTED")
  const keys = Reflect.ownKeys(value), copy: any = array ? [] : Object.create(null)
  const entries = array ? keys.filter(key => key !== "length") : keys
  if (array && (entries.length !== (value as unknown[]).length || entries.some((key, i) => key !== String(i))))
    throw Error("UNION_INVOCATION_CLASSIFICATION_UNSUPPORTED")
  ancestors.add(value)
  try {
    for (const key of entries) {
      const field = Object.getOwnPropertyDescriptor(value, key)
      if (typeof key !== "string" || !field?.enumerable || !Object.hasOwn(field, "value"))
        throw Error("UNION_INVOCATION_CLASSIFICATION_UNSUPPORTED")
      Object.defineProperty(copy, key, { value: nodeApplySnapshot(field.value, ancestors), enumerable: true, writable: true, configurable: true })
    }
  } finally { ancestors.delete(value) }
  return copy
}
