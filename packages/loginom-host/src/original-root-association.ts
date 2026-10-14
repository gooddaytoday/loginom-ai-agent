import {originalRootPort} from './original-root-port'
import {retainOriginalCallArguments} from './original-run-control'
type Purpose=Readonly<{harness:'sorting-terminal-source-v1';authorization:string;packagePath:string}>
type Peer=Readonly<{originId:string;deadline:number;parentPid:number;hostPid:number;loadPurpose?:Purpose}>
const options=new WeakMap<object,Peer>(),peers=new WeakSet<object>(),messages=new WeakMap<object,{peer:Peer;guard():void;wire:any}>(),sequences=new WeakMap<object,number>()
const records=new WeakSet<object>(),relayed=new WeakSet<object>()
const peerGuards=new WeakMap<object,()=>void>(),optionGuards=new WeakMap<object,()=>void>()
const sortingGrants=new WeakSet<object>()
const parentPurposes=new WeakMap<object,{purpose:Purpose;guard():void}>(),loadLaunches=new WeakMap<object,{peer:Peer;capture:any;guard():void}>()
const cancelledPeers=new WeakMap<object,{value:unknown}>()
function read(o:any,k:string){const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return d.value}
function same(peer:Peer,wire:any){return ['originId','deadline','parentPid','hostPid'].every(k=>read(wire,k)===(peer as any)[k])}
// Creates the existing closed Sorting diagnostic grant; copies are not producers.
export function createSortingDiagnosticGrant(authorization:string,packagePath:string){
 if(!/^[a-f0-9]{64}$/.test(authorization)||typeof packagePath!=='string'||packagePath.length>1024||!/^\/[^/\\\x00-\x1f]+\/[^/\\\x00-\x1f]+\.lgp$/.test(packagePath)||packagePath.split('/').some(x=>x==='.'||x==='..'))throw Error('LOGINOM_HANDSHAKE_INVALID')
 const grant=Object.freeze({harness:'sorting-before-close-v1' as const,authorization,packagePath});sortingGrants.add(grant);return grant
}
export function bindSortingLoadPurpose(port:object,grant:object){
 const root=originalRootPort(port);if(!root||!sortingGrants.has(grant)||parentPurposes.has(port)||read(grant,'harness')!=='sorting-before-close-v1')throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE')
 const guard=retainOriginalCallArguments(grant),authorization=read(grant,'authorization'),packagePath=read(grant,'packagePath')
 if(typeof authorization!=='string'||!/^[a-f0-9]{64}$/.test(authorization)||typeof packagePath!=='string')throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE')
 parentPurposes.set(port,{purpose:Object.freeze({harness:'sorting-terminal-source-v1',authorization,packagePath}),guard(){root.guard();guard()}})
}
export function bindRuntimeLoadPurpose(input:any,peer:Peer){
 if(!peers.has(peer)||!peer.loadPurpose||loadLaunches.has(input))throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE')
 const capture=read(input,'acceptanceCapture'),inputGuard=retainOriginalCallArguments(input),startupGuard=peerGuards.get(peer)
 const expires=read(capture,'expires');if(!Number.isSafeInteger(expires))throw Error('LOGINOM_ORIGINAL_LOAD_CHANGED')
 const guard=()=>{const cancelled=cancelledPeers.get(peer);if(cancelled)throw cancelled.value;if(Date.now()>=peer.deadline)throw Error('LOGINOM_ORIGINAL_RUN_EXPIRED');if(Date.now()>=expires)throw Error('LOGINOM_ORIGINAL_LOAD_EXPIRED');startupGuard?.();inputGuard()};guard()
 if(!capture||read(capture,'harness')!=='sorting-before-close-v1'||read(capture,'packagePath')!==peer.loadPurpose.packagePath
   ||read(capture,'generation')!==read(input,'generation')||read(capture,'chat')!==read(input,'chat')||read(capture,'account')!==read(read(input,'connection'),'username'))throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE')
 loadLaunches.set(input,{peer,capture,guard})
}
export function parentRootMessage(port:object,message:any){
 if(Object.hasOwn(message,'rootOrigin'))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')
 const binding=originalRootPort(port),method=read(message,'method');if(!binding||!['start','call','interrupt'].includes(method))return message
 const purpose=parentPurposes.get(port);if(method==='call')binding.guard();if(method==='start')purpose?.guard()
 const seq=(sequences.get(port)??0)+1;sequences.set(port,seq)
 const wire={originId:binding.facts.origin.id,deadline:binding.facts.deadline,parentPid:process.pid,hostPid:binding.facts.pid,seq,requestId:read(message,'id'),method,
   ...(method==='start'&&purpose?{loadPurpose:purpose.purpose}:{}),
   ...(method==='interrupt' && binding.facts.signal.aborted?{aborted:true,rejection:encode(binding.facts.signal.reason)}:{})}
 return {...message,rootOrigin:Object.freeze(wire)}
}
export function receiveHostRootStart(message:any,parentPid=process.ppid,hostPid=process.pid):Peer|undefined{
 if(!Object.hasOwn(message,'rootOrigin'))return
 const wire=read(message,'rootOrigin');if(read(message,'method')!=='start'||read(wire,'method')!=='start'||read(wire,'requestId')!==read(message,'id')||read(wire,'seq')!==1
  ||read(wire,'parentPid')!==parentPid||read(wire,'hostPid')!==hostPid||typeof read(wire,'originId')!=='string'||!Number.isSafeInteger(read(wire,'deadline')))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')
 let loadPurpose:Purpose|undefined
 if(Object.hasOwn(wire,'loadPurpose')){
  const purpose=read(wire,'loadPurpose'),capture=read(read(message,'input'),'acceptanceCapture')
  if(Object.keys(purpose).sort().join(',')!=='authorization,harness,packagePath'||read(purpose,'harness')!=='sorting-terminal-source-v1'
   ||read(capture,'harness')!=='sorting-before-close-v1'||read(purpose,'authorization')!==read(capture,'authorization')||read(purpose,'packagePath')!==read(capture,'packagePath'))throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE')
  loadPurpose=Object.freeze({harness:'sorting-terminal-source-v1',authorization:read(purpose,'authorization'),packagePath:read(purpose,'packagePath')})
 }
 const peer=Object.freeze({originId:read(wire,'originId'),deadline:read(wire,'deadline'),parentPid,hostPid,...(loadPurpose?{loadPurpose}:{})});peers.add(peer);if(loadPurpose)peerGuards.set(peer,retainOriginalCallArguments(message));sequences.set(peer,1);return peer
}
export function bindRootHostOptions(value:object,peer:Peer){
 if(!peers.has(peer)||options.has(value))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')
 if(peer.loadPurpose){const capture=read(value,'acceptanceCapture'),guard=retainOriginalCallArguments(capture),prototype=Object.getPrototypeOf(value),descriptor=Object.getOwnPropertyDescriptor(value,'acceptanceCapture')!
  if(read(capture,'harness')!=='sorting-before-close-v1'||read(capture,'authorization')!==peer.loadPurpose.authorization||read(capture,'packagePath')!==peer.loadPurpose.packagePath)throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE')
  optionGuards.set(value,()=>{peerGuards.get(peer)?.();guard();const now=Object.getOwnPropertyDescriptor(value,'acceptanceCapture');if(Object.getPrototypeOf(value)!==prototype||!now||Reflect.ownKeys(descriptor).some(k=>(now as any)[k]!== (descriptor as any)[k]))throw Error('LOGINOM_ORIGINAL_LOAD_CHANGED')})
 }
 options.set(value,peer)
}
export function rootHostOptions(value:object){optionGuards.get(value)?.();return options.get(value)}
export function guardRuntimeLoadPurpose(input:object,peer:Peer){const record=loadLaunches.get(input);if(record){record.guard();if(record.peer!==peer)throw Error('LOGINOM_ORIGINAL_LOAD_CHANGED')}}
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
export function runtimeRootStart(peer:Peer,childPid:number,generation:number,chat:string,input?:object){
 if(!peers.has(peer))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')
 const retained=input&&loadLaunches.get(input);if(retained){retained.guard();if(retained.peer!==peer)throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE')}
 const {loadPurpose,...base}=peer
 return {...base,hostPid:process.pid,childPid,generation,chat,...(retained?{loadPurpose:{...retained.capture,purpose:loadPurpose!.harness}}:{})}
}
export function runtimeRootCall(peer:Peer,record:ReturnType<typeof rootCallMessage>,childPid:number,generation:number,chat:string,requestId:string){
 if(!record||!records.has(record)||record.peer!==peer||relayed.has(record))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');record.guard();relayed.add(record)
 return {...runtimeRootStart(peer,childPid,generation,chat),parentRequestId:record.wire.requestId,requestId,
  ...(record.wire.aborted?{aborted:true,rejection:record.wire.rejection}:{})}
}
function encode(value:unknown):any {if(value instanceof Error){const cause=Object.getOwnPropertyDescriptor(value,'cause');if(cause&&!('value'in cause))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return {kind:'Error',message:value.message,name:value.name,...(cause?{cause:encode(cause.value)}:{})}}return{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}}

function decode(value:any):unknown {if(value.kind==='Error'){const error=new Error(value.message,'cause'in value?{cause:decode(value.cause)}:undefined);error.name=value.name;return error}return value.is_undefined?undefined:value.value}
