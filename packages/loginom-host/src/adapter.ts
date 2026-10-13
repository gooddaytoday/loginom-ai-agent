import type { InputFile } from "./inputs"
export * as LoginomHost from "./adapter"

import { originalUnionInvocation } from "../../loginom-runtime/client/lib/union-invocation.mjs"

import { randomUUID } from "node:crypto"
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
      const target = args && typeof args === "object" ? Object.getOwnPropertyDescriptor(args, "target") : undefined
      const kind = target && "value" in target && target.value && typeof target.value === "object"
        ? Object.getOwnPropertyDescriptor(target.value, "type") : undefined
      const union = name === "dock_node_apply" && kind && "value" in kind && kind.value === "transform.union_data"
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
        return await connection.request("call", { run, name, args, userMessage })
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
