import {originalRootPort} from './original-root-port'
import {retainOriginalCallArguments} from './original-run-control'
type Peer=Readonly<{originId:string;deadline:number;parentPid:number;hostPid:number}>
const options=new WeakMap<object,Peer>(),peers=new WeakSet<object>(),messages=new WeakMap<object,{peer:Peer;guard():void;wire:any}>(),sequences=new WeakMap<object,number>()
const records=new WeakSet<object>(),relayed=new WeakSet<object>()
const cancelledPeers=new WeakMap<object,{value:unknown}>()
function read(o:any,k:string){const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return d.value}
function same(peer:Peer,wire:any){return ['originId','deadline','parentPid','hostPid'].every(k=>read(wire,k)===(peer as any)[k])}
export function parentRootMessage(port:object,message:any){
 if(Object.hasOwn(message,'rootOrigin'))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')
 const binding=originalRootPort(port),method=read(message,'method');if(!binding||!['start','call','interrupt'].includes(method))return message
 if(method==='call')binding.guard()
 const seq=(sequences.get(port)??0)+1;sequences.set(port,seq)
 const wire={originId:binding.facts.origin.id,deadline:binding.facts.deadline,parentPid:process.pid,hostPid:binding.facts.pid,seq,requestId:read(message,'id'),method,
   ...(method==='interrupt' && binding.facts.signal.aborted?{aborted:true,rejection:encode(binding.facts.signal.reason)}:{})}
 return {...message,rootOrigin:Object.freeze(wire)}
}
export function receiveHostRootStart(message:any,parentPid=process.ppid,hostPid=process.pid):Peer|undefined{
 if(!Object.hasOwn(message,'rootOrigin'))return
 const wire=read(message,'rootOrigin');if(read(message,'method')!=='start'||read(wire,'method')!=='start'||read(wire,'requestId')!==read(message,'id')||read(wire,'seq')!==1
  ||read(wire,'parentPid')!==parentPid||read(wire,'hostPid')!==hostPid||typeof read(wire,'originId')!=='string'||!Number.isSafeInteger(read(wire,'deadline')))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')
 const peer=Object.freeze({originId:read(wire,'originId'),deadline:read(wire,'deadline'),parentPid,hostPid});peers.add(peer);sequences.set(peer,1);return peer
}
export function bindRootHostOptions(value:object,peer:Peer){if(!peers.has(peer)||options.has(value))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');options.set(value,peer)}
export function rootHostOptions(value:object){return options.get(value)}
export function receiveHostRootCall(message:any,peer?:Peer){
 const method=read(message,'method');if(!['call','interrupt'].includes(method))return
 if(!peer){if(Object.hasOwn(message,'rootOrigin'))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return}
 const wire=read(message,'rootOrigin'),snapshot=retainOriginalCallArguments(message)
 if(!same(peer,wire)||read(wire,'method')!==method||read(wire,'requestId')!==read(message,'id')||!Number.isSafeInteger(read(wire,'seq'))||wire.seq<=(sequences.get(peer)??0))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')
 sequences.set(peer,wire.seq)
 if(method==='interrupt' && wire.aborted)cancelledPeers.set(peer,{value:decode(wire.rejection)})
 const record=Object.freeze({peer,wire,guard(){const cancelled=cancelledPeers.get(peer);if(cancelled&&method==='call')throw cancelled.value;snapshot();if(!same(peer,wire)||messages.get(message)!==record)throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');if(method==='call'&&Date.now()>=peer.deadline)throw Error('LOGINOM_ORIGINAL_RUN_EXPIRED')}})
 records.add(record);messages.set(message,record);record.guard();return record
}
export function rootCallMessage(message:object){return messages.get(message)}
export function runtimeRootStart(peer:Peer,childPid:number,generation:number,chat:string){if(!peers.has(peer))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return {...peer,hostPid:process.pid,childPid,generation,chat}}
export function runtimeRootCall(peer:Peer,record:ReturnType<typeof rootCallMessage>,childPid:number,generation:number,chat:string,requestId:string){
 if(!record||!records.has(record)||record.peer!==peer||relayed.has(record))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');record.guard();relayed.add(record)
 return {...runtimeRootStart(peer,childPid,generation,chat),parentRequestId:record.wire.requestId,requestId,
  ...(record.wire.aborted?{aborted:true,rejection:record.wire.rejection}:{})}
}
function encode(value:unknown):any {if(value instanceof Error){const cause=Object.getOwnPropertyDescriptor(value,'cause');if(cause&&!('value'in cause))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return {kind:'Error',message:value.message,name:value.name,...(cause?{cause:encode(cause.value)}:{})}}return{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}}

function decode(value:any):unknown {if(value.kind==='Error'){const error=new Error(value.message,'cause'in value?{cause:decode(value.cause)}:undefined);error.name=value.name;return error}return value.is_undefined?undefined:value.value}
