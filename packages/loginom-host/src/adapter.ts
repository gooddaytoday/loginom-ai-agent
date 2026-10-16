import { assertSDKInvocation, currentRunCommandControl, originalPromptControl } from "../../agent/src/cli/private-admission.mjs"
import { hasOriginalNodeHostPort, acquireOriginalNodeHostOwner, assertOriginalNodeHostOwner, retainedOriginalNodeHostOwner, callOriginalNodeHostOwner, disposeOriginalNodeHostOwner } from "./node-client"
import type { InputFile } from "./inputs"
export * as LoginomHost from "./adapter"

import { randomUUID } from "node:crypto"
import { transport, type Port } from "./transport"

const state: { connection?: ReturnType<typeof transport>; port?: Port } = {}
export function connect(port: Port) {
  state.connection?.close()
  state.connection = transport(port)
  state.port = port
}
export function disconnect() {
  state.connection?.close()
  state.connection = undefined
  state.port = undefined
}
export async function acquire(session: string, originalContext?: object) {
  const connection = state.connection
  if (!connection) return
  const original = originalContext ? originalPromptControl(originalContext) : currentRunCommandControl()
  const control = original ? Object.freeze({ signal: original.signal, deadline: Number(original.deadline / 1000000n) }) : undefined
  const run = randomUUID(), port = state.port
  const acquired = port && hasOriginalNodeHostPort(port) ? await acquireOriginalNodeHostOwner(port, run, session, control) : undefined
  const value = acquired ? { generation: acquired.generation } : await connection.request("acquire", { session, run })
  if (original && (originalContext ? originalPromptControl(originalContext) : currentRunCommandControl())?.origin !== original.origin) throw Error('LOGINOM_SDK_BINDING_CHANGED')
  if (state.connection !== connection || state.port !== port) throw Error('LOGINOM_ORIGINAL_HOST_OWNER_CHANGED')
  if (!value) throw new Error("LOGINOM_HOST_NOT_READY")
  if (typeof value !== "object" || !("generation" in value) || typeof value.generation !== "number")
    throw new Error("LOGINOM_HANDSHAKE_INVALID")
  const queue = { tail: Promise.resolve(), released: false }
  const lease = {
    generation: value.generation,
    async admit(userMessage: string, files: InputFile[]) {
      return connection.request("admit", { run, userMessage, files })
    },
    async tools() {
      return connection.request("tools", { run })
    },
    call(name: string, args: unknown, userMessage: string, signal?: AbortSignal, packet?: object): Promise<unknown> {
      const bound = packet ? sdkPackets.get(packet) : undefined
      if (packet) {
        if (!bound || bound.lease !== lease || name !== 'dock_node_apply' || bound.args !== args || bound.userMessage !== userMessage || bound.signal !== signal) throw Error('LOGINOM_SDK_BINDING_CHANGED')
        bound.guard()
        if (bound.promise) return bound.promise
      }
      const work = (async () => {
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
        if (signal?.aborted) throw signal.reason
        if (queue.released) throw new Error("LOGINOM_RUN_ABORTED")
        if (bound) {
          bound.guard()
          await assertOriginalNodeHostOwner(bound.capability)
          bound.guard()
          return await callOriginalNodeHostOwner(bound.capability, { name, args, userMessage }, { signal: bound.signal, deadline: bound.deadline })
        }
        signal?.addEventListener("abort", abort, { once: true })
        return await connection.request("call", { run, name, args, userMessage })
      } finally {
        signal?.removeEventListener("abort", abort)
        next.resolve()
      }
      })()
      if (bound) bound.promise = work
      return work
    },
    async release() {
      queue.released = true
      if (acquired) disposeOriginalNodeHostOwner(acquired.capability)
      await connection.request("release", { run }).catch(() => undefined)
    },
  }
  if (acquired && port) {
    const generation = lease.generation, methods = Object.getOwnPropertyDescriptors(lease)
    const guard = () => {
      if (queue.released || state.connection !== connection || state.port !== port || lease.generation !== generation
          || Object.keys(methods).some(k => { const d = Object.getOwnPropertyDescriptor(lease,k); return !d || !('value' in d) || d.value !== methods[k].value })) throw Error('LOGINOM_ORIGINAL_HOST_OWNER_CHANGED')
      retainedOriginalNodeHostOwner(acquired.capability)
    }
    owners.set(lease, { capability: acquired.capability, guard })
    guard()
  }
  return lease
}

type BoundSDK = { lease: object; capability: object; args: unknown; options: object; userMessage: string; signal: AbortSignal; deadline: number; guard(): void; promise?: Promise<unknown> }
const owners = new WeakMap<object, { capability: object; guard(): void }>()
const sdkPackets = new WeakMap<object, BoundSDK>(), tokens = new WeakMap<object, object>()
export function bindOriginalSDKCall(lease: object, token: object, args: unknown, options: object, userMessage: string) {
  const facts = assertSDKInvocation(token, args, options), owner = owners.get(lease)
  if (!owner) throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
  owner.guard()
  const deadline = Number(facts.deadline / 1000000n)
  if (!Number.isSafeInteger(deadline)) throw Error('LOGINOM_EXECUTION_ORIGIN_EXPIRED')
  const old = tokens.get(token)
  if (old) {
    const r = sdkPackets.get(old)!
    r.guard()
    if (r.lease !== lease || r.args !== args || r.options !== options || r.userMessage !== userMessage) throw Error('LOGINOM_SDK_BINDING_CHANGED')
    return old
  }
  const tuple = retainedOriginalNodeHostOwner(owner.capability), packet = Object.freeze({})
  const guard = () => {
    const current = assertSDKInvocation(token, args, options)
    owner.guard()
    if (current.origin !== facts.origin || current.deadline !== facts.deadline || current.sdkSignal !== facts.sdkSignal || current.runCommandSignal !== facts.runCommandSignal
        || retainedOriginalNodeHostOwner(owner.capability) !== tuple) throw Error('LOGINOM_SDK_BINDING_CHANGED')
  }
  guard()
  sdkPackets.set(packet, { lease, capability: owner.capability, args, options, userMessage, signal: facts.sdkSignal, deadline, guard })
  tokens.set(token, packet)
  return packet
}
