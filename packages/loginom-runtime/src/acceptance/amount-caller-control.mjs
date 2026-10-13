// Private CHILD consumer registry. A registered signal is a cancellation proxy,
// never the parent's original object or native Page authority. The eventual
// managed provider must bind/relay it through the reviewed LAB-67 IPC seam.
const grants=new WeakMap();
const bindings=new WeakSet();
const keys=['operation','request','owner','run','lease','generation','chat','account'];
const fail=()=>{throw Error('LOGINOM_AMOUNT_CONTROL_REQUIRED');};
export function registerAmountControlProxy({signal,deadline,tuple},binding) {
 if(!binding||typeof binding!=='object'||bindings.has(binding)||!(signal instanceof AbortSignal)||!Number.isSafeInteger(deadline)||deadline<=Date.now()
  ||!tuple||!Number.isSafeInteger(tuple.generation)||tuple.generation<1
  ||!keys.filter(k=>k!=='generation').every(k=>typeof tuple[k]==='string'&&tuple[k])
  ||tuple.lease!==tuple.owner+':'+tuple.run)fail();
 const original=Object.freeze(Object.fromEntries(keys.map(k=>[k,tuple[k]])));
 const grant=Object.freeze({});grants.set(grant,{signal,deadline,tuple,original,binding,used:false});
 assertAmountControl(grant,binding);bindings.add(binding);return grant;
}
export function assertAmountControl(grant,binding) {
 const s=grants.get(grant);
 if(!s||s.binding!==binding||keys.some(k=>s.tuple[k]!==s.original[k])
  ||['owner','run','lease','generation','chat','account'].some(k=>binding?.[k]!==s.original[k]))fail();
 s.signal.throwIfAborted();if(Date.now()>=s.deadline)fail();
 return Object.freeze({signal:s.signal,deadline:s.deadline,operation:s.original.operation,request:s.original.request});
}
export function beginAmountControl(grant,binding) {
 const control=assertAmountControl(grant,binding),s=grants.get(grant);
 if(s.used)fail();s.used=true;return control;
}
