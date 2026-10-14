// Original private IPC births only. Wire evidence is never the physical parent signal.
const roots=new WeakMap(),calls=new WeakMap(),replays=new WeakMap(),cancelled=new WeakMap();
const data=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return d.value};
function snapshot(o,seen=new Set()){if(seen.has(o))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');seen.add(o);const prototype=Object.getPrototypeOf(o),keys=Reflect.ownKeys(o),entries=keys.map(k=>[k,Object.getOwnPropertyDescriptor(o,k)]);if(entries.some(([,d])=>!('value'in d)))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');const children=entries.filter(([,d])=>d.value&&typeof d.value==='object').map(([,d])=>snapshot(d.value,seen));return()=>{children.forEach(check=>check());if(Object.getPrototypeOf(o)!==prototype||Reflect.ownKeys(o).length!==keys.length||entries.some(([k,d])=>{const v=Object.getOwnPropertyDescriptor(o,k);return !v||!('value'in v)||v.value!==d.value||v.writable!==d.writable||v.configurable!==d.configurable||v.enumerable!==d.enumerable}))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')}}
export function receiveManagedRootStart(message,state,parentPid=process.ppid,childPid=process.pid){
 if(!Object.hasOwn(message,'rootOrigin'))return;
 if(roots.has(state))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');const wire=data(message,'rootOrigin'),input=data(message,'input');
 if(data(message,'operation')!=='start'||data(wire,'hostPid')!==parentPid||data(wire,'childPid')!==childPid||data(wire,'generation')!==data(input,'generation')||data(wire,'chat')!==data(input,'chat')||!Number.isSafeInteger(data(wire,'deadline'))||typeof data(wire,'originId')!=='string')throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');
 const checkMessage=snapshot(message),checkWire=snapshot(wire),peer=Object.freeze({message,wire,guard(){checkMessage();checkWire();if(roots.get(state)!==peer)throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')}});roots.set(state,peer);replays.set(peer,new Set());return peer;
}
export function receiveManagedRootCall(message,state){
 const peer=roots.get(state);if(!peer){if(Object.hasOwn(message,'rootOrigin'))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return}
 peer.guard();const wire=data(message,'rootOrigin');
 if(['originId','deadline','parentPid','hostPid','childPid','generation','chat'].some(k=>data(wire,k)!==data(peer.wire,k))||data(wire,'requestId')!==data(message,'id')||typeof data(wire,'parentRequestId')!=='string')throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');
 const operation=data(message,'operation'),seen=replays.get(peer);if(seen.has(wire.parentRequestId)||seen.has(wire.requestId))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');seen.add(wire.parentRequestId);seen.add(wire.requestId);
 if(operation==='interrupt'&&wire.aborted)cancelled.set(peer,{value:decodeRootRejection(wire.rejection)});
 const checkMessage=snapshot(message),checkWire=snapshot(wire),record=Object.freeze({peer,wire,guard(){if(operation==='call'&&cancelled.has(peer))throw cancelled.get(peer).value;peer.guard();checkMessage();checkWire();if(calls.get(message)!==record)throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');if(data(message,'operation')==='call'&&Date.now()>=wire.deadline)throw Error('LOGINOM_ORIGINAL_RUN_EXPIRED')}});calls.set(message,record);record.guard();return record;
}
export function managedRootCall(message){return calls.get(message)}
export function decodeRootRejection(value){if(value.kind==='Error'){const e=new Error(value.message,'cause'in value?{cause:decodeRootRejection(value.cause)}:undefined);e.name=value.name;return e}return value.is_undefined?undefined:value.value}
