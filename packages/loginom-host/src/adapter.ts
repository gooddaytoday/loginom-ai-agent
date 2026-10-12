import type { InputFile } from "./inputs"
export * as LoginomHost from "./adapter"

import { randomUUID } from "node:crypto"
import { transport, type Port } from "./transport"

type Owner = { deferRelease: boolean; leases: Set<{ release(): Promise<void> }>; audit?: { authorization: string; phase: "ordinary" | "capture" } }
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
  const queue = { tail: Promise.resolve(), released: false, audited: false }
  const lease = {
    generation: value.generation,
    async admit(userMessage: string, files: InputFile[]) {
      return connection.request("admit", { run, userMessage, files })
    },
    async tools() {
      return connection.request("tools", { run })
    },
    async call(name: string, args: unknown, userMessage: string, signal?: AbortSignal) {
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
      if (owner?.deferRelease) {
        if (owner.audit?.phase !== "capture") return
        await queue.tail
        if (queue.released || queue.audited) throw Error("LOGINOM_SORTING_AUDIT_REPLAY")
        queue.audited = true
        const result = await connection.request("acceptance.capture", {run, authorization: owner.audit.authorization})
        if (!result || typeof result !== "object" || !("cleanupComplete" in result) || result.cleanupComplete !== true)
          throw Object.assign(new Error("LOGINOM_SORTING_AUDIT_REFUSED"), {failed:true, rejectedValue:result})
        return
      }
      queue.released = true
      await connection.request("release", { run }).catch(() => undefined)
      owner?.leases.delete(lease)
    },
  }
  owner?.leases.add(lease)
  return lease
}
