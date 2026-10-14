import { randomUUID } from "node:crypto"
import { hostError } from "./errors"

export type Port = {
  postMessage(value: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
  off?(event: "message", listener: (event: { data: unknown }) => void): void
  start(): void
  onClose?(listener: () => void): void | (() => void)
}
type Control = {signal:AbortSignal;deadline:number}
type OwnedRejection = {primary?:{value:unknown};secondary?:{value:unknown};requestId?:string;pending?:boolean}
export function transport(port:Port){const client=requests(port);return{request:client.request,close:client.close}}
// No owner authority is created here. The genuine factory caller retains it.
export function privateNodeHostTransport(port:Port){
 const client=requests(port);return{request:client.request,close:client.close,requestOwnedAcquire:client.ownedAcquire,requestOwnedCall:client.ownedCall}
}
function encode(value:unknown):unknown{
 if(value instanceof Error)return{kind:'Error',name:value.name,message:value.message,...('cause'in value?{cause:encode(value.cause)}:{})}
 return{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}
}
function decode(value:any):unknown{
 if(value?.kind==='Error'){const error=new Error(value.message,'cause'in value?{cause:decode(value.cause)}:undefined);error.name=value.name;return error}
 return value?.is_undefined?undefined:value?.value
}
function requests(port:Port){
 const state={closed:false}
 const pending=new Map<string,{resolve(value:unknown):void;reject(value:unknown):void;dispose():void;owned?:OwnedRejection;ownedReply?:boolean;cancel?(value:unknown):void}>()
 function settle(id:string,error:boolean,value:unknown){
  const request=pending.get(id);if(!request)return;pending.delete(id);request.dispose()
  if(error)request.reject(value)
  else if(request.ownedReply){try{request.resolve(JSON.parse(JSON.stringify(value)))}catch(error){request.reject(error)}}
  else request.resolve(value)
 }
 function response({data}:{data:unknown}){
  if(!data||typeof data!=='object'||!('id'in data)||typeof data.id!=='string')return
  const request=pending.get(data.id);if(!request)return
  if(request.owned){
   const rejected='rejection'in data||'error'in data
   const value='rejection'in data?decode(data.rejection):'error'in data?new Error(hostError(data.error)):undefined
   if(rejected){if(request.owned.primary)request.owned.secondary??={value};else request.owned.primary={value}}
   if(request.owned.primary){settle(data.id,true,request.owned.primary.value);return}
  }
  if('error'in data){settle(data.id,true,new Error(hostError(data.error)));return}
  settle(data.id,false,'result'in data?data.result:undefined)
 }
 let removeClose:unknown
 function close(){
  if(state.closed)return;state.closed=true
  for(const[id,request]of pending){if(request.cancel)request.cancel(Error('LOGINOM_HOST_CLOSED'));else settle(id,true,Error('LOGINOM_HOST_CLOSED'))}
  port.off?.('message',response);if(typeof removeClose==='function')removeClose()
 }
 port.on('message',response);removeClose=port.onClose?.(close)
 if(state.closed&&typeof removeClose==='function')removeClose()
 port.start()
 // Same eight-argument private send boundary as the donor; only owned acquire
 // is exposed. Optional original control is retained, never reconstructed.
 function send(method:string,input:unknown,timeout:number,control?:Control,_cancellation?:object,_receive?:unknown,ownedReply=false,owned?:OwnedRejection){
  if(state.closed)return Promise.reject(Error('LOGINOM_HOST_CLOSED'))
  if(control){control.signal.throwIfAborted();if(!Number.isSafeInteger(control.deadline)||Date.now()>=control.deadline)return Promise.reject(Error('LOGINOM_PRE_READY_READ_EXPIRED'));timeout=control.deadline-Date.now()}
  if(control)control=Object.freeze({signal:control.signal,deadline:control.deadline})
  const id=randomUUID()
  return new Promise<unknown>((resolve,reject)=>{
   let dispatched=false,cancelled=false
   function cancel(value:unknown){
    if(!pending.has(id)||cancelled&&!state.closed)return
    // Box the original cancellation before its owned send can reject.
    if(owned)owned.primary??={value}
    if(control&&dispatched&&!cancelled&&!state.closed){try{port.postMessage({id:randomUUID(),method:'readonly.preReady.cancel',input:{...(input as object),requestId:id,rejection:encode(value)}})}catch(error){if(owned)owned.secondary??={value:error}}}
    if(owned&&dispatched&&!state.closed){owned.primary??={value};cancelled=true;return}
    if(owned){owned.primary??={value};settle(id,true,owned.primary.value);return}
    settle(id,true,value)
   }
   const abort=()=>cancel(control!.signal.reason)
   const timer=setTimeout(()=>cancel(Error(control?'LOGINOM_PRE_READY_READ_EXPIRED':'LOGINOM_HOST_TIMEOUT')),timeout)
   if(owned){owned.requestId=id;owned.pending=true}
   pending.set(id,{resolve,reject,...(owned?{owned,cancel}:{}),...(ownedReply?{ownedReply:true}:{}),dispose(){clearTimeout(timer);control?.signal.removeEventListener('abort',abort);if(owned?.requestId===id)owned.pending=false}})
   control?.signal.addEventListener('abort',abort,{once:true})
   if(control?.signal.aborted){cancel(control.signal.reason);return}
   try{dispatched=true;port.postMessage({id,method,input,...(control?{deadline:control.deadline}:{})})}
   catch(error){
    // Owned send is a rejected await event even without controlled input.
    // Record it before terminal closure can introduce HOST_CLOSED instead.
    if(owned){
      if(owned.primary)owned.secondary??={value:error};else owned.primary={value:error};
      settle(id,true,owned.primary.value);
    }else if(control)settle(id,true,error);
    close();
   }
  })
 }
 return{request:(method:string,input:unknown,timeout=180_000)=>send(method,input,timeout),
  ownedAcquire:(input:{run:string;session?:string;receiverPurpose:'union-acquired-service-v1';receiverPhase?:'current'},owned:OwnedRejection,control?:Control)=>send('acquire',input,180_000,control,undefined,undefined,true,owned),ownedCall:(input:unknown,owned:OwnedRejection,control:Control)=>send('call',input,180_000,control,undefined,undefined,true,owned),close}
}
