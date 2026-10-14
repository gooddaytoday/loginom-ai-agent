import type { InputFile } from "./inputs"
export * as LoginomHost from "./adapter"

import { retainOriginalRunControl, retainOriginalCallArguments } from "./original-run-control"

import { randomUUID } from "node:crypto"
import { transport, type Port } from "./transport"

type Owner = { deferRelease: boolean; leases: Set<{ release(): Promise<void> }>; audit?: { authorization: string; phase: "ordinary" | "capture" } }
const state: { connection?: ReturnType<typeof transport>; owner?: Owner; control?: ReturnType<typeof retainOriginalRunControl> } = {}
export function connect(port: Port, owner?: Owner, originalControl?: object) {
  const control = originalControl ? retainOriginalRunControl(originalControl) : undefined
  if (control && !owner) throw Error("LOGINOM_ORIGINAL_OWNER_UNAVAILABLE")
  state.connection?.close()
  state.connection = transport(port)
  state.control = control
  state.owner = owner
}
export function disconnect() {
  state.connection?.close()
  state.connection = undefined
  state.owner = undefined
  state.control = undefined
}
export async function acquire(session: string) {
  const connection = state.connection
  if (!connection) return
  const owner = state.owner, control = state.control
  const leasesDescriptor = control && owner ? Object.getOwnPropertyDescriptor(owner, "leases") : undefined
  if (control && (!leasesDescriptor || !("value" in leasesDescriptor) || !(leasesDescriptor.value instanceof Set)))
    throw Error("LOGINOM_ORIGINAL_OWNER_UNAVAILABLE")
  const originalLeases = leasesDescriptor?.value
  const guard = () => {
    control?.guard()
    if (control && (state.connection !== connection || state.owner !== owner || state.control !== control))
      throw Error("LOGINOM_ORIGINAL_OWNER_CHANGED")
    if (control) {
      const current = Object.getOwnPropertyDescriptor(owner!, "leases")
      if (!current || !("value" in current) || current.value !== originalLeases
        || current.writable !== leasesDescriptor!.writable || current.enumerable !== leasesDescriptor!.enumerable
        || current.configurable !== leasesDescriptor!.configurable) throw Error("LOGINOM_ORIGINAL_OWNER_CHANGED")
    }
  }
  guard()
  const run = randomUUID()
  const value = await connection.request("acquire", { session, run })
  guard()
  if (!value) throw new Error("LOGINOM_HOST_NOT_READY")
  if (typeof value !== "object" || !("generation" in value) || typeof value.generation !== "number")
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  const queue = { tail: Promise.resolve(), released: false, audited: false }
  const lease = {
    generation: value.generation,
    async admit(userMessage: string, files: InputFile[]) {
      guard()
      const result = await connection.request("admit", { run, userMessage, files })
      guard()
      return result
    },
    async tools() {
      guard()
      const result = await connection.request("tools", { run })
      guard()
      return result
    },
    async call(name: string, args: unknown, userMessage: string, signal?: AbortSignal) {
      // Serialize before transport admission so waiting does not consume the IPC timeout
      // or create durable recovery records for calls that have not started.
      guard()
      const argumentsGuard = control ? retainOriginalCallArguments(args) : undefined
      const previous = queue.tail
      const next = Promise.withResolvers<void>()
      queue.tail = next.promise
      await previous
      let interrupted = false
      const abort = () => {
        if (interrupted) return
        interrupted = true
        void connection.request("interrupt", { run }).catch(() => undefined)
      }
      try {
        guard()
        argumentsGuard?.()
        if (queue.released || signal?.aborted) throw new Error("LOGINOM_RUN_ABORTED")
        signal?.addEventListener("abort", abort, { once: true })
        control?.signal.addEventListener("abort", abort, { once: true })
        const result = await connection.request("call", { run, name, args, userMessage })
        guard()
        argumentsGuard?.()
        return result
      } finally {
        signal?.removeEventListener("abort", abort)
        control?.signal.removeEventListener("abort", abort)
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
  if (control) Set.prototype.add.call(originalLeases, lease)
  else owner?.leases.add(lease)
  return lease
}
