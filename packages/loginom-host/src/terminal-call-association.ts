import {rootCallMessage} from './original-root-association'
import { retainOriginalCallArguments } from "./original-run-control"
const mapGet = Map.prototype.get

// Fixed host-port dock_prepare producer. Original host refs, not root/native authority.
export function retainTerminalCallAssociation(request: object, input: object, run: any, runs: Map<string, unknown>, state: {closed:boolean}, owner: string) {
  const failures = new WeakSet<object>()
  const refused = () => { const error = Error("LOGINOM_HANDSHAKE_INVALID"); failures.add(error); throw error }
  function data(object: object, key: string) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    if (!descriptor || !("value" in descriptor)) refused()
    return descriptor!.value
  }
  const inputGuard = retainOriginalCallArguments(request)
  const runId = data(input,"run"), lease = data(run,"lease"), chat = data(run,"chat"), generation = data(lease,"generation")
  const originalMapPrototype = Object.getPrototypeOf(runs), reader = Object.getOwnPropertyDescriptor(originalMapPrototype,"get")
  if (originalMapPrototype !== Map.prototype || !reader || reader.value !== mapGet || Object.hasOwn(runs,"get")) refused()
  const tuple = Object.freeze({owner,requestId:data(request,"id"),runId,chat,generation,lease,input,request,
    name:data(input,"name"),args:Object.hasOwn(input,"args")?data(input,"args"):undefined})
  const fields = [[run,"lease"],[run,"chat"],[lease,"generation"]] as const
  const descriptors = fields.map(([object,key])=>Object.getOwnPropertyDescriptor(object,key)!)
  const rootAssociation=rootCallMessage(request)
  function guard() {
    try {
      rootAssociation?.guard()
      inputGuard()
      const currentReader = Object.getOwnPropertyDescriptor(originalMapPrototype,"get")
      if (state.closed || Object.getPrototypeOf(runs)!==originalMapPrototype || Object.hasOwn(runs,"get")
        || !currentReader || !("value" in currentReader) || currentReader.value!==reader!.value
        || currentReader.writable!==reader!.writable || currentReader.enumerable!==reader!.enumerable
        || currentReader.configurable!==reader!.configurable || data(request,"input")!==input || mapGet.call(runs,runId)!==run) refused()
      fields.forEach(([object,key],i)=>{const current=Object.getOwnPropertyDescriptor(object,key),before=descriptors[i]!
        if(!current || !("value" in current) || current.value!==before.value || current.writable!==before.writable
          || current.enumerable!==before.enumerable || current.configurable!==before.configurable) refused()})
    } catch(error) { if(error && typeof error==='object')failures.add(error); throw error }
  }
  guard()
  return Object.freeze({tuple,guard,isRefusal:(error:unknown)=>!!error && typeof error==='object' && failures.has(error),
    rootControlQualified:false,nativeAuthority:false})
}
