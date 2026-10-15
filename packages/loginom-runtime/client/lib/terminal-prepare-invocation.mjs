// Fixed private original-ref invocation. No public tool/IPC registration or grant.
import {captureTerminalLoadedExports,captureTerminalInitialCustody,
  prepareTerminalOriginalPacket,terminalPacketArguments,checkTerminalInitialCustody} from './terminal-original-packet.mjs';
import {retainTerminalOriginalInterfaces} from './terminal-original-interfaces.mjs';
const entries=new WeakMap();
const refuse=()=>{throw Error('LOGINOM_ORIGINAL_PREPARE_INVOCATION_UNAVAILABLE')};
function data(object,key){
  const descriptor=Object.getOwnPropertyDescriptor(object,key);
  if(!descriptor||!('value' in descriptor))refuse();
  return descriptor.value;
}
function snapshot(object){
  const prototype=Object.getPrototypeOf(object),keys=Reflect.ownKeys(object);
  const descriptors=keys.map(key=>[key,Object.getOwnPropertyDescriptor(object,key)]);
  if(descriptors.some(([,d])=>!('value' in d)))refuse();
  return ()=>{
    const current=Reflect.ownKeys(object);
    if(Object.getPrototypeOf(object)!==prototype||current.length!==keys.length||current.some((k,i)=>k!==keys[i]))refuse();
    for(const [key,original] of descriptors){const d=Object.getOwnPropertyDescriptor(object,key);
      if(!d||!('value' in d)||!Object.is(d.value,original.value)||d.writable!==original.writable
        ||d.enumerable!==original.enumerable||d.configurable!==original.configurable)refuse();}
  };
}
export function retainTerminalPrepareInvocation(source,input,control){
  const signal=data(control,'signal');
  AbortSignal.prototype.throwIfAborted.call(signal);
  const deadline=data(control,'deadline');
  if(!Number.isSafeInteger(deadline)||Date.now()>=deadline)refuse();
  const custody=data(source,'custody'),native=data(source,'native'),loaded=data(source,'loaded'),preparation=data(source,'preparation');
  // Absolute caller deadline is retained verbatim, never derived from timeout_ms.
  if(data(custody,'signal')!==signal||data(custody,'deadline')!==deadline)refuse();
  const checks=[snapshot(source),snapshot(input),snapshot(control)];
  const load=captureTerminalLoadedExports(loaded);
  const initial=captureTerminalInitialCustody({custody,native,loaded:load,preparation,invocation:{source,input,control}});
  const check=()=>{AbortSignal.prototype.throwIfAborted.call(signal);if(Date.now()>=deadline)refuse();
    for(const fn of checks)fn();checkTerminalInitialCustody(initial,data(custody,'page'));};
  check();const token=Object.freeze({});entries.set(token,{initial,input,check});return token;
}
export function invokeTerminalPrepareInvocation(token){
  const entry=entries.get(token);if(!entry)refuse();
  // Return the original pending/rejected Promise; never re-enter a reader or creation.
  if(entry.work){
    try{entry.check()}catch(error){if(entry.failed)return entry.work;throw error}
    return entry.work;
  }
  entry.check();
  entry.work=Promise.resolve().then(async()=>{
    entry.check();const packet=await prepareTerminalOriginalPacket(entry.initial,entry.input);entry.check();
    const component=retainTerminalOriginalInterfaces({...terminalPacketArguments(packet),
      record:async()=>{throw Error('TERMINAL_EVIDENCE_WRITER_NOT_BOUND')}});
    const receipt=await component.read();entry.check();const facts=component.inspect(receipt);
    return Object.freeze({packet,component,facts});
  }).catch(error=>{entry.failed=true;throw error});
  return entry.work;
}
