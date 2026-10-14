import {assertRouteEffect} from "./lab57-route-host"
import type {RouteContext} from "./lab57-route-host"

// Only this concrete collector can issue a permit. JSON, booleans and no-op callbacks cannot grant it.
const issued=new WeakSet<object>()
type NativePermit={pid:number;at:number;directory:string}
export async function admitClosedNative(ctx:RouteContext,stage:string,proofRoot:string) {
  if(!ctx.once)throw Error("CLOSED_NATIVE_ONCE_REQUIRED")
  await assertRouteEffect(ctx,stage,proofRoot)
  const permit:NativePermit={pid:process.pid,at:Date.now(),directory:proofRoot+"/diagnostic/loginom/runtime/generations/1/chats/owned/attempts/closed-original"}
  issued.add(permit)
  return permit
}
export function assertClosedNativePermit(value:unknown,directory?:string) {
  if(typeof value!=="object"||value===null||!issued.has(value))throw Error("CLOSED_NATIVE_ADMISSION_REQUIRED")
  issued.delete(value)
  const permit=value as NativePermit
  if(permit.pid!==process.pid||Date.now()-permit.at>1000||Date.now()<permit.at||directory!==permit.directory)throw Error("CLOSED_NATIVE_ADMISSION_REQUIRED")
}
