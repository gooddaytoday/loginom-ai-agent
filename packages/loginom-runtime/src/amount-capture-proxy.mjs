import {assertAmountManagedStartup} from './fp-managed-startup.mjs';
import {assertCaptureOwner} from './retained-capture.mjs';
import {registerAmountControlProxy,assertAmountControl} from './acceptance/amount-caller-control.mjs';
const proxies=new WeakMap();
const keys=['owner','run','lease','generation','chat','account'];
// Fixed managed constructor only. Retain before bridge creation; do not mint
// the consumer grant until an accepted original capture invocation is bound.
export function retainAmountCaptureProxy(state,retained) {
 const startup=state.controlledStartup,original=assertAmountManagedStartup(startup,state),binding=retained.binding;
 if(binding.harness!=='amount-import-type-v1'||keys.some(k=>original.binding[k]!==binding[k]))throw Error('LOGINOM_AMOUNT_CAPTURE_BINDING_CHANGED');
 assertCaptureOwner(retained);
 const metadata=retained.session.metadata,directory=retained.session.directory;
 const tuple=Object.freeze({...Object.fromEntries(keys.map(k=>[k,binding[k]])),operation:original.operation,request:original.request});
 const deadline=Math.min(original.deadline,binding.expires),proxy=Object.freeze({});
 proxies.set(proxy,{state,startup,retained,binding,original,metadata,directory,tuple,deadline,grant:undefined});return proxy;
}
export function assertAmountCaptureProxy(proxy,binding,signal) {
 const p=proxies.get(proxy);
 if(!p||p.binding!==binding||signal!==p.original.signal)throw Error('LOGINOM_AMOUNT_CAPTURE_PROXY_UNAVAILABLE');
 const current=assertAmountManagedStartup(p.startup,p.state);
 assertCaptureOwner(p.retained);
 if(!p.startup.accepted || p.startup.pending || p.state.closing || !Object.isFrozen(p.retained.runtime) || p.retained.session.metadata!==p.metadata
  ||p.retained.session.directory!==p.directory||current.signal!==signal||current.deadline!==p.original.deadline
  ||current.operation!==p.original.operation||current.request!==p.original.request||current.binding!==p.original.binding
  || keys.some(k=>binding[k]!==p.tuple[k]||current.binding[k]!==p.tuple[k]))throw Error('LOGINOM_AMOUNT_CAPTURE_BINDING_CHANGED');
 signal.throwIfAborted();if(Date.now()>=p.deadline)throw Error('LOGINOM_AMOUNT_CAPTURE_EXPIRED');
 if(p.grant)assertAmountControl(p.grant,binding);
 return p;
}
export function beginAmountCaptureProxy(proxy,binding,signal) {
 const p=assertAmountCaptureProxy(proxy,binding,signal);
 if(p.grant)throw Error('LOGINOM_AMOUNT_CAPTURE_CONSUMED');
 p.grant=registerAmountControlProxy({signal,deadline:p.deadline,tuple:p.tuple},binding);
 return p.grant;
}

// A rejected owned browser/record await is a new event. A control/guard refusal
// already accepted by the original startup remains primary, even when equal.
export function rejectAmountCaptureAwait(proxy,value) {
 const p=proxies.get(proxy);
 if(!p||!p.grant)throw Error('LOGINOM_AMOUNT_CAPTURE_PROXY_UNAVAILABLE');
 try {assertAmountCaptureProxy(proxy,p.binding,p.original.signal)}
 catch(reason){p.startup.propagate(reason)}
 return p.startup.reject(value);
}
