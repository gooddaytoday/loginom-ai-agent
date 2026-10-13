import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {MessageChannel} from 'node:worker_threads';
const lib=process.env.INVOCATION_LIB||new URL('../lib/',import.meta.url).pathname;
const {retainUnionInvocation,originalUnionInvocation,registerUnionInvocationCarrier,bindUnionInvocationProcessor}=await import(pathToFileURL(join(lib,'union-invocation.mjs')));
const source=await readFile(new URL('../../../agent/src/session/tools.ts',import.meta.url),'utf8');
const line=source.split('\n').find(l=>l.includes('const invocation = retainUnionInvocation('));assert(line);assert(source.indexOf(line)<source.indexOf('await (invocation ? invocation.invoke()'));
// Exact production acquisition statement; surrounding services are labelled doubles.
const acquire=Function('retainUnionInvocation','definition','loginom','input','user','args','options',line.trim()+';return invocation');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function fixture(full=false){
 const controller=new AbortController(),done=deferred(),started=deferred(),ipc=new MessageChannel();let calls=0,delivered;
 ipc.port2.on('message',()=>started.resolve());const owner={generation:3,call(...args){calls++;delivered=args;ipc.port1.postMessage('host-call');return done.promise}};
 const request={operation_id:'original',target:{type:'transform.union_data'},document_id:'document',...(full?{budgets:{configure_ms:10000,execute_ms:1000,total_ms:10000}}:{})};
 const definition={name:'dock_node_apply',inputSchema:{required:['operation_id',...(full?['budgets']:[])]}},options={toolCallId:'call',abortSignal:controller.signal};
 const user={info:{id:'user'}},message={id:'message'},processor={get message(){return message}};bindUnionInvocationProcessor(processor,message);const input={loginom:owner,session:{id:'chat'},processor};
 return {controller,done,started,owner,request,definition,options,input,user,get calls(){return calls},get delivered(){return delivered},
  acquire(){return acquire(retainUnionInvocation,definition,owner,input,user,request,options)},close(){ipc.port1.close();ipc.port2.close()}};
}
test('upstream statement retains compact absolute budget before await; unavailable carrier no IO',()=>{
 const f=fixture();try{const before=Date.now(),p=f.acquire(),r=originalUnionInvocation(p,f.owner);assert.equal(r.request,f.request);assert.equal(r.signal,f.controller.signal);assert.equal(r.owner,f.owner);
  assert.equal(p.facts().budget_ms,600000);assert(r.deadline>=before+600000&&r.deadline<=Date.now()+600000);assert.throws(()=>p.invoke(),/CARRIER_UNAVAILABLE/);assert.equal(f.calls,0);
 }finally{f.close()}
});
test('explicit budget nonextension, exact controls forwarded, pending joins',async()=>{
 const f=fixture(true);try{registerUnionInvocationCarrier(f.owner);const p=f.acquire(),r=originalUnionInvocation(p,f.owner),work=p.invoke();assert.equal(p.invoke(),work);await f.started.promise;
  assert.equal(p.facts().budget_ms,10000);assert.equal(f.delivered[1],f.request);assert.equal(f.delivered[3],f.controller.signal);assert.equal(f.delivered[4],p);assert.equal(originalUnionInvocation(f.delivered[4],f.owner),r);
  assert.equal(f.acquire(),p);f.done.resolve('reply');assert.equal(await work,'reply');assert.equal(p.invoke(),work);assert.equal(f.calls,1);assert.equal(p.facts().releaseAuthority,false);
 }finally{f.close()}
});
for(const primary of [Error('original',{cause:0}),undefined,null,false,0,''])test('raw primary and secondary/restoration '+String(primary),async()=>{
 const f=fixture();try{registerUnionInvocationCarrier(f.owner);const p=f.acquire(),work=p.invoke(),seen=work.catch(e=>({error:e}));await f.started.promise;f.owner.generation=4;assert.throws(()=>p.invoke(),/BINDING/);
  f.done.reject(primary);assert.equal((await seen).error,primary);f.owner.generation=3;assert.equal(p.invoke(),work);await assert.rejects(work,e=>e===primary);assert.equal(f.calls,1);
 }finally{f.close()}
});
for(const reason of [Error('abort',{cause:0}),null,false,0,''])test('preabort exact/no shadow getter '+String(reason),()=>{
 const f=fixture();try{let gets=0;Object.defineProperty(f.controller.signal,'throwIfAborted',{get(){gets++;throw Error('shadow')}});f.controller.abort(reason);assert.throws(()=>f.acquire(),e=>e===reason);assert.equal(gets,0);assert.equal(f.calls,0)}finally{f.close()}
});
for(const mutation of ['request','signal','call','owner','generation','creation','budget'])test('awaited binding drift '+mutation,async()=>{
 const f=fixture(true);try{registerUnionInvocationCarrier(f.owner);const p=f.acquire(),work=p.invoke(),seen=work.catch(e=>e);await f.started.promise;
  if(mutation==='request')f.request.target.type='foreign';if(mutation==='signal')f.options.abortSignal=new AbortController().signal;if(mutation==='call')f.owner.call=()=>{};
  if(mutation==='owner')f.input.loginom={...f.owner};if(mutation==='generation')f.owner.generation=4;if(mutation==='creation')f.input.processor={message:{id:'message'}};if(mutation==='budget')f.request.budgets.total_ms=20000;
  f.done.resolve('old reply');assert.match((await seen).message,/BINDING/);assert.equal(f.calls,1);
 }finally{f.close()}
});
test('copy/accessor/unknown/negative-zero refuse',()=>{
 const f=fixture();try{const p=f.acquire();assert.throws(()=>originalUnionInvocation({...p},f.owner),/UNOWNED/);assert.throws(()=>originalUnionInvocation(p,{...f.owner}),/UNOWNED/);
  let gets=0;Object.defineProperty(f.owner,'generation',{get(){gets++;return 3}});assert.throws(()=>p.guard());assert.equal(gets,0);assert.equal(f.calls,0)
 }finally{f.close()}
 const g=fixture();try{g.owner.generation=0;assert.throws(()=>g.acquire(),/UNKNOWN/)}finally{g.close()}
 const h=fixture(true);try{h.request.budgets.total_ms=-0;assert.throws(()=>h.acquire(),/LOSSLESS/)}finally{h.close()}
});
test('original business budget expires before host; duplicate cannot reset',async()=>{
 const f=fixture(true);try{f.request.budgets={configure_ms:1,execute_ms:1,total_ms:1};const p=f.acquire();await new Promise(r=>setTimeout(r,5));assert.throws(()=>p.invoke(),/EXPIRED/);assert.equal(f.calls,0);assert.throws(()=>f.acquire(),/EXPIRED/)}finally{f.close()}
});

test('late carrier registration does not upgrade retained unavailable creation',()=>{
 const f=fixture();try{const p=f.acquire();registerUnionInvocationCarrier(f.owner);assert.throws(()=>p.invoke(),/CARRIER_UNAVAILABLE/);assert.equal(f.calls,0)}finally{f.close()}
});

test('replacement toolCallId cannot remint an existing operation or extend its deadline',()=>{
 const f=fixture();try{const p=f.acquire(),deadline=p.facts().deadline;f.options.toolCallId='replacement';assert.throws(()=>f.acquire(),/BINDING/);assert.equal(p.facts().deadline,deadline);assert.equal(f.calls,0)}finally{f.close()}
});

test('actual fixed processor getter source is retained; replaced/unknown getters are refused before invocation',()=>{
 const f=fixture();try{const message=f.input.processor.message;let gets=0;
  const processor={get message(){gets++;return message}};bindUnionInvocationProcessor(processor,message);f.input.processor=processor;const p=f.acquire();assert(gets>0);const before=gets;p.guard();assert.equal(gets,before+1);
  let foreignGets=0;Object.defineProperty(processor,'message',{get(){foreignGets++;return message}});assert.throws(()=>p.guard(),/PROCESSOR/);assert.equal(foreignGets,0);assert.equal(f.calls,0);
 }finally{f.close()}
 const g=fixture();try{let gets=0;g.input.processor={get message(){gets++;return {id:'message'}}};assert.throws(()=>g.acquire(),/PROCESSOR/);assert.equal(gets,0)}finally{g.close()}
});

test('initial copied data-message holder cannot qualify original typed creation',()=>{
 const f=fixture();try{f.input.processor={message:f.input.processor.message};assert.throws(()=>f.acquire(),/PROCESSOR/);assert.equal(f.calls,0)}finally{f.close()}
});

test('SDK creation refuses operation-ID rebirth before packet/deadline mint; distinct creation remains valid',()=>{
 const f=fixture();try{const p=f.acquire(),deadline=p.facts().deadline;f.request.operation_id='replacement';assert.throws(()=>f.acquire(),/BINDING_CHANGED/);assert.equal(p.facts().deadline,deadline);assert.equal(f.calls,0);
  f.request.operation_id='original';assert.equal(f.acquire(),p);
  const nextOptions={toolCallId:'distinct-call',abortSignal:f.controller.signal},nextRequest={...f.request,operation_id:'distinct-operation'};
  const next=acquire(retainUnionInvocation,f.definition,f.owner,f.input,f.user,nextRequest,nextOptions);assert.notEqual(next,p);assert.equal(next.facts().budget_ms,p.facts().budget_ms);
  const copiedOptions={...f.options};assert.throws(()=>acquire(retainUnionInvocation,f.definition,f.owner,f.input,f.user,{...f.request},copiedOptions),/DUPLICATE_CHANGED/);assert.equal(f.calls,0);
 }finally{f.close()}
});
