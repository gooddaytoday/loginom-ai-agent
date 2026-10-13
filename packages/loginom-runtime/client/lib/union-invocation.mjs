import {createHash} from 'node:crypto';
const records=new WeakMap(),owners=new WeakMap(),carriers=new WeakMap(),processors=new WeakMap(),creations=new WeakMap(),sdkCalls=new WeakMap();
const descriptor=Object.getOwnPropertyDescriptor;
const aborted=descriptor(AbortSignal.prototype,'aborted').get,reason=descriptor(AbortSignal.prototype,'reason').get;
const wall=Date.now,mono=performance.now.bind(performance);
const need=(ok,code)=>{if(!ok)throw Error(code)};
const data=(o,k)=>{const d=o&&descriptor(o,k);need(d&&Object.hasOwn(d,'value'),'UNION_INVOCATION_DATA_REQUIRED');return d.value};
function digest(value){
 const seen=new Set();const visit=v=>{
  if(v===null||typeof v==='string'||typeof v==='boolean')return;
  if(typeof v==='number'){need(Number.isFinite(v)&&!Object.is(v,-0),'UNION_INVOCATION_LOSSLESS_REQUIRED');return;}
  need(v&&typeof v==='object'&&!seen.has(v),'UNION_INVOCATION_LOSSLESS_REQUIRED');seen.add(v);
  const a=Array.isArray(v),keys=Reflect.ownKeys(v);need(Object.getPrototypeOf(v)===(a?Array.prototype:Object.prototype),'UNION_INVOCATION_LOSSLESS_REQUIRED');
  const entries=a?keys.filter(k=>k!=='length'):keys;
  if(a)need(entries.length===v.length&&entries.every((k,i)=>k===String(i)),'UNION_INVOCATION_LOSSLESS_REQUIRED');
  for(const k of entries){need(typeof k==='string','UNION_INVOCATION_LOSSLESS_REQUIRED');const d=descriptor(v,k);need(d?.enumerable&&Object.hasOwn(d,'value'),'UNION_INVOCATION_LOSSLESS_REQUIRED');visit(d.value)}
  seen.delete(v);
 };visit(value);return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
// Fixed SessionProcessor creation registers its original getter/message before
// the handle is published. Unknown accessors are never invoked.
export function bindUnionInvocationProcessor(processor,message){
 const d=descriptor(processor,'message');need(!processors.has(processor)&&d?.get&&typeof d.get==='function'&&!d.set&&!Object.hasOwn(d,'value'),'UNION_INVOCATION_PROCESSOR_UNKNOWN');
 processors.set(processor,{get:d.get,message});
}
function processorMessage(processor){
 const d=descriptor(processor,'message');
 const original=processors.get(processor);need(original&&d?.get===original.get&&!d.set,'UNION_INVOCATION_PROCESSOR_UNKNOWN');
 const current=original.get.call(processor);need(current===original.message,'UNION_INVOCATION_BINDING_CHANGED');return current;
}
// Fixed private registration for the future qualified67 carrier. Not a public
// tool/config flag or an arbitrary callback: retain the existing owner method.
export function registerUnionInvocationCarrier(owner){
 need(!carriers.has(owner),'UNION_INVOCATION_CARRIER_ALREADY_BOUND');const call=data(owner,'call');need(typeof call==='function','UNION_INVOCATION_CARRIER_UNAVAILABLE');carriers.set(owner,call);
}
export function retainUnionInvocation(source){
 const options=data(source,'options'),owner=data(source,'owner');
 // Known SDK creation must guard before mutable name/kind classification can
 // select the packetless ordinary fallback. Fresh ordinary creation stays ordinary.
 const prior=creations.get(options)||sdkCalls.get(owner)?.get(data(options,'toolCallId'));
 if(prior){prior.guard();need(prior.facts.owner===owner&&prior.options===options&&prior.request===data(source,'request')&&prior.definition===data(source,'definition')&&prior.user===data(source,'user')&&prior.sessionInput===data(source,'sessionInput'),'UNION_INVOCATION_DUPLICATE_CHANGED');return prior.packet;}
 const definition=data(source,'definition');if(data(definition,'name')!=='dock_node_apply')return;
 const request=data(source,'request'),target=data(request,'target');if(data(target,'type')!=='transform.union_data')return;
 const signal=data(options,'abortSignal');if(aborted.call(signal))throw reason.call(signal);
 const sessionInput=data(source,'sessionInput'),session=data(sessionInput,'session'),processor=data(sessionInput,'processor'),message=processorMessage(processor),user=data(source,'user');
 const generation=data(owner,'generation'),call=data(owner,'call'),callId=data(options,'toolCallId');
 need(Number.isSafeInteger(generation)&&generation>0&&typeof call==='function'&&typeof callId==='string'&&callId.length>0,'UNION_INVOCATION_OWNER_UNKNOWN');
 const operation=data(request,'operation_id'),sessionId=data(session,'id'),messageId=data(message,'id'),userMessage=data(user,'id');
 need([operation,sessionId,messageId,userMessage].every(x=>typeof x==='string'&&x.length>0),'UNION_INVOCATION_CREATION_UNKNOWN');
 const schema=data(definition,'inputSchema'),required=data(schema,'required'),schemaDigest=digest(required),signature=digest(request);
 const hasBudgets=descriptor(request,'budgets');let budget;
 if(!hasBudgets){need(!required.includes('budgets'),'UNION_INVOCATION_BUDGET_REQUIRED');budget=600000;}
 else{
  const b=data(request,'budgets'),present=k=>descriptor(b,k),get=(k,d)=>present(k)?data(b,k):d;
  const configure=get('configure_ms',600000),execute=get('execute_ms',120000);budget=get('total_ms',Math.max(600000,configure,execute));
  if(required.includes('budgets'))need(['configure_ms','execute_ms','total_ms'].every(k=>present(k)),'UNION_INVOCATION_BUDGET_REQUIRED');
  need([configure,execute,budget].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1800000)&&budget>=Math.max(configure,execute),'UNION_INVOCATION_BUDGET_INVALID');
 }
 let calls=owners.get(owner);if(!calls){calls=new Map();owners.set(owner,calls)}
 const old=calls.get(operation);if(old){old.guard();need(old.source===source||old.request===request&&old.options===options&&old.definition===definition&&old.user===user&&old.sessionInput===sessionInput,'UNION_INVOCATION_DUPLICATE_CHANGED');return old.packet;}
 // The existing business operation budget becomes absolute HERE, before the
 // tool's plugin/permission/host awaits. Queue time consumes it; no IPC timer,
 // startup expiry, worker controller or downstream now()+budget is a source.
 const born=wall(),elapsed=mono(),deadline=born+budget;need(Number.isSafeInteger(deadline),'UNION_INVOCATION_DEADLINE_INVALID');
 const originalCarrier=carriers.get(owner);let promise,first,settled=false;const secondary=[];const facts=Object.freeze({purpose:'union-original-invocation-v1',owner,generation,request,operation,signature,signal,deadline,callId,session:sessionId,message:messageId,userMessage});
 function guard(){
  if(aborted.call(signal))throw reason.call(signal);
  need(wall()<deadline&&mono()-elapsed<budget,'UNION_INVOCATION_EXPIRED');
  need(data(source,'definition')===definition&&data(source,'request')===request&&data(source,'options')===options&&data(source,'owner')===owner&&data(source,'sessionInput')===sessionInput&&data(source,'user')===user
   &&data(sessionInput,'loginom')===owner&&data(sessionInput,'session')===session&&data(sessionInput,'processor')===processor&&processorMessage(processor)===message
   &&data(owner,'generation')===generation&&data(owner,'call')===call&&data(options,'abortSignal')===signal&&data(options,'toolCallId')===callId
   &&data(session,'id')===sessionId&&data(message,'id')===messageId&&data(user,'id')===userMessage&&data(definition,'name')==='dock_node_apply'
   &&data(definition,'inputSchema')===schema&&data(schema,'required')===required&&digest(required)===schemaDigest&&digest(request)===signature,'UNION_INVOCATION_BINDING_CHANGED');
 }
 const packet=Object.freeze({guard,
  invoke(){
   // Repeat admission checks remain secondary; they cannot replace a pending
   // original call's Error/falsy primary or create a replacement call.
   try{guard()}catch(error){if(promise)secondary.push(error);throw error}if(promise)return promise;
   need(originalCarrier===call&&carriers.get(owner)===originalCarrier,'UNION_INVOCATION_CARRIER_UNAVAILABLE');
   promise=Promise.resolve().then(()=>{guard();return call.call(owner,'dock_node_apply',request,userMessage,signal,packet)}).then(
    value=>{settled=true;guard();return value},error=>{settled=true;first={value:error};throw error}).catch(error=>{first??={value:error};throw first.value});return promise;
  },
  facts(){return {deadline,budget_ms:budget,pending:!!promise&&!settled,failed:!!first,first,secondary:[...secondary],nativeAuthority:false,creationAuthority:false,releaseAuthority:false}}
 });
 const record={source,request,options,definition,user,sessionInput,guard,packet,facts};guard();records.set(packet,record);calls.set(operation,record);creations.set(options,record);let sdk=sdkCalls.get(owner);if(!sdk){sdk=new Map();sdkCalls.set(owner,sdk)}sdk.set(callId,record);return packet;
}
export function originalUnionInvocation(packet,owner){const record=records.get(packet);need(record&&record.facts.owner===owner,'UNION_INVOCATION_UNOWNED');record.guard();return record.facts;}
