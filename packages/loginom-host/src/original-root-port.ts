import { retainOriginalRunOrigin } from "./original-run-control"
import type { Port } from "./transport"
type Child = {pid?:number;connected:boolean}
type Facts = Readonly<{origin:ReturnType<typeof retainOriginalRunOrigin>["origin"];control:object;signal:AbortSignal;deadline:number;port:Port;child:Child;pid:number}>
type Binding = Readonly<{facts:Facts;guard():void;parentOriginQualified:true;nativeAuthority:false}>
const ports = new WeakMap<object, Binding>()
function connectedCustody(child: Child) {
  const chain: {owner: object; prototype: object | null; descriptor?: PropertyDescriptor}[] = []
  for (let owner: object | null = child; owner; owner = Object.getPrototypeOf(owner)) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, "connected")
    chain.push({owner, prototype: Object.getPrototypeOf(owner), descriptor})
    if (descriptor) return chain
  }
  throw Error("LOGINOM_ORIGINAL_OWNER_CHANGED")
}
function sameDescriptor(a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined) {
  if (!a || !b) return a === b
  return a.value === b.value && a.get === b.get && a.set === b.set
    && a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable
}
export function bindOriginalRootPort(port: Port, control: object, child: Child): Binding {
  // Bind identity only after fork; live admission is checked before fork and by SDK.
  // Expiry here must not orphan a newly born child before its handle reaches cleanup.
  const retained = retainOriginalRunOrigin(control), origin = retained.origin
  const descriptor = Object.getOwnPropertyDescriptor(port,"postMessage"), pidDescriptor=Object.getOwnPropertyDescriptor(child,"pid")
  if (ports.has(port) || !descriptor || !("value" in descriptor) || typeof descriptor.value!=="function"
    || !pidDescriptor || !("value" in pidDescriptor) || !Number.isSafeInteger(pidDescriptor.value))
    throw Error("LOGINOM_ORIGINAL_OWNER_CHANGED")
  const pid=pidDescriptor.value as number, connected = connectedCustody(child)
  const facts:Facts=Object.freeze({origin,control,signal:origin.signal,deadline:origin.deadline,port,child,pid})
  const binding:Binding={facts,guard(){
    retained.guard()
    const current=Object.getOwnPropertyDescriptor(port,"postMessage"),currentPid=Object.getOwnPropertyDescriptor(child,"pid")
    // Node uses a data slot; Bun exposes an inherited native accessor. Retain its
    // exact descriptor/chain without executing it. Transport owns liveness.
    const connectionDrift = connected.some(item => Object.getPrototypeOf(item.owner) !== item.prototype
      || !sameDescriptor(Object.getOwnPropertyDescriptor(item.owner, "connected"), item.descriptor))
    const connection = connected.at(-1)!.descriptor!
    if(connectionDrift || ("value" in connection && connection.value!==true) || !currentPid || !("value" in currentPid) || currentPid.value!==pid
      || currentPid.writable!==pidDescriptor.writable || currentPid.enumerable!==pidDescriptor.enumerable || currentPid.configurable!==pidDescriptor.configurable
      || !current || !("value" in current) || current.value!==descriptor.value
      || current.writable!==descriptor.writable || current.enumerable!==descriptor.enumerable || current.configurable!==descriptor.configurable)
      throw Error("LOGINOM_ORIGINAL_OWNER_CHANGED")
  },parentOriginQualified:true,nativeAuthority:false}
  ports.set(port,binding);return Object.freeze(binding)
}
export function originalRootPort(port: object) {return ports.get(port)}
