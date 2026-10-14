import {types} from "node:util"
import { originalUnionInvocation, registerUnionInvocationCarrier } from "../../loginom-runtime/client/lib/union-invocation.mjs"
import { originalSDKCarrierInvocation } from "../../agent/src/session/union-invocation"
import {hasOriginalNodeHostPort,acquireOriginalNodeHostOwner,assertOriginalNodeHostOwner,disposeOriginalNodeHostOwner,retainedOriginalNodeHostOwner} from "./node-client"
import type { InputFile } from "./inputs"
export * as LoginomHost from "./adapter"

import { randomUUID } from "node:crypto"
import { transport, type Port } from "./transport"

const state: { connection?: ReturnType<typeof transport>; port?:Port } = {}
const originalLeases=new WeakMap<object,{capability:object;connection:ReturnType<typeof transport>;port:Port;generation:number;guard():void}>()
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
export async function acquire(session: string) {
  const connection = state.connection
  if (!connection) return
  const run = randomUUID(),port=state.port
  const acquired=port && hasOriginalNodeHostPort(port)?await acquireOriginalNodeHostOwner(port,run,session):undefined
  const value=acquired?{generation:acquired.generation}:await connection.request("acquire", { session, run })
  if(acquired && (state.connection!==connection || state.port!==port))throw Error('LOGINOM_ORIGINAL_HOST_OWNER_CHANGED')
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
    async call(name: string, args: unknown, userMessage: string, signal?: AbortSignal, packet?: object) {
      // Serialize before transport admission so waiting does not consume the IPC timeout
      // or create durable recovery records for calls that have not started.
      const hasPacket=packet!==undefined
      const snapshot=name==='dock_node_apply'?nodeApplySnapshot(args):undefined
      const bytes=snapshot===undefined?undefined:JSON.stringify(snapshot)
      if(name==='dock_node_apply' && snapshot?.target?.type==='transform.union_data' && !hasPacket)throw Error('UNION_INVOCATION_UNOWNED')
      const bound=hasPacket?originalSDKCarrierInvocation(packet!,lease):undefined
      const invocation=hasPacket?originalUnionInvocation(packet!,lease):undefined
      if(hasPacket && (!bound || !invocation || name!=='dock_node_apply' || invocation.request!==args || invocation.signal!==signal || invocation.userMessage!==userMessage))throw Error('UNION_INVOCATION_BINDING_CHANGED')
      const previous = queue.tail
      const next = Promise.withResolvers<void>()
      queue.tail = next.promise
      await previous
      const abort = () => {
        void connection.request("interrupt", { run }).catch(() => undefined)
      }
      try {
        if (queue.released) throw new Error("LOGINOM_RUN_ABORTED")
        if(!hasPacket && signal?.aborted)throw new Error("LOGINOM_RUN_ABORTED")
        if(name==='dock_node_apply' && JSON.stringify(nodeApplySnapshot(args))!==bytes)throw Error('UNION_INVOCATION_BINDING_CHANGED')
        if(hasPacket) {
          originalSDKCarrierInvocation(packet!,lease)
          await assertOriginalAdapterOwner(lease)
          originalSDKCarrierInvocation(packet!,lease)
          throw Error('UNION_ORIGINAL_PER_CALL_RELAY_UNAVAILABLE')
        }
        signal?.addEventListener("abort", abort, { once: true })
        return await connection.request("call", { run, name, args:name==='dock_node_apply'?snapshot:args, userMessage })
      } finally {
        signal?.removeEventListener("abort", abort)
        next.resolve()
      }
    },
    async release() {
      queue.released = true
      if(acquired)disposeOriginalNodeHostOwner(acquired.capability)
      await connection.request("release", { run }).catch(() => undefined)
    },
  }
  if(acquired && port) {
    const generation=lease.generation,methods=Object.freeze({...lease})
    const guard=()=>{
      if(queue.released || state.connection!==connection || state.port!==port || lease.generation!==generation
          || Object.keys(methods).some(k=>{const d=Object.getOwnPropertyDescriptor(lease,k);return !d || !Object.hasOwn(d,'value') || d.value!==(methods as any)[k]}))throw Error('LOGINOM_ORIGINAL_HOST_OWNER_CHANGED')
    }
    guard();retainedOriginalNodeHostOwner(acquired.capability);originalLeases.set(lease,{capability:acquired.capability,connection,port,generation,guard});registerUnionInvocationCarrier(lease)
  }
  return lease
}
export async function assertOriginalAdapterOwner(lease:object) {
  const original=originalLeases.get(lease)
  if(!original)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
  original.guard();const tuple=await assertOriginalNodeHostOwner(original.capability);original.guard();return tuple
}


export function originalAdapterOwnerBinding(lease:object) {
 const original=originalLeases.get(lease)
 if(!original)throw Error('LOGINOM_ORIGINAL_HOST_PROVIDER_UNAVAILABLE')
 original.guard();return retainedOriginalNodeHostOwner(original.capability)
}

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
