export { retainUnionInvocation, bindUnionInvocationProcessor } from "../../../loginom-runtime/client/lib/union-invocation.mjs"
import { retainUnionInvocation, originalUnionInvocation } from "../../../loginom-runtime/client/lib/union-invocation.mjs"
import { assertSDKInvocation } from "../cli/private-admission.mjs"
import { originalAdapterOwnerBinding } from "../../../loginom-host/src/adapter"
const sdkCarriers=new WeakMap<object,{source:any;token:object;tuple:object;deadline:bigint;runSignal:AbortSignal;sdkSignal:AbortSignal}>()
// Fixed same-module assertions, never caller-supplied facts/callback authority.
export function retainOriginalSDKCarrier(source:any,token:object) {
 const facts=assertSDKInvocation(token,source.request,source.options)
 const tuple=originalAdapterOwnerBinding(source.owner)
 const packet=retainUnionInvocation(source)
 if(!packet)throw Error('ORIGINAL_SDK_PURPOSE_CARRIER_UNAVAILABLE')
 const old=sdkCarriers.get(packet)
 if(old) {
  if(old.token!==token || old.tuple!==tuple || old.source.request!==source.request || old.source.options!==source.options)throw Error('UNION_INVOCATION_BINDING_CHANGED')
 }else sdkCarriers.set(packet,{source,token,tuple,deadline:facts.deadline,runSignal:facts.runCommandSignal,sdkSignal:facts.sdkSignal})
 originalSDKCarrierInvocation(packet,source.owner);return packet
}
export function originalSDKCarrierInvocation(packet:object,owner:object) {
 const r=sdkCarriers.get(packet)
 if(!r || r.source.owner!==owner)throw Error('UNION_INVOCATION_UNOWNED')
 const facts=assertSDKInvocation(r.token,r.source.request,r.source.options)
 if(facts.deadline!==r.deadline || facts.runCommandSignal!==r.runSignal || facts.sdkSignal!==r.sdkSignal
   || originalAdapterOwnerBinding(owner)!==r.tuple)throw Error('UNION_INVOCATION_BINDING_CHANGED')
 originalUnionInvocation(packet,owner);return facts
}
