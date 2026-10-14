import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';import{resolve}from'node:path';import{writeFile}from'node:fs/promises';
const[root,out]=process.argv.slice(2),load=p=>import(pathToFileURL(resolve(root,p)).href);
const{retainAmountManagedStartup,retainAmountManagedCapture}=await load('src/fp-managed-startup.mjs'),{retainCaptureOwner,bindCaptureRuntime}=await load('src/retained-capture.mjs'),{retainAmountCaptureProxy,assertAmountCaptureProxy}=await load('src/amount-capture-proxy.mjs');
function fixture(accepted=true){
 const controller=new AbortController(),deadline=Date.now()+10000;
 const acquired={revision:1,harness:'amount-import-type-v1',owner:'owner',run:'run',lease:'owner:run',generation:39,chat:'chat',account:'account',packagePath:'/account/package.lgp',admission:'admission',expires:deadline-1000};
 const input={protocol:1,generation:39,chat:'chat',stateDir:'/labelled-state',connection:{username:'account'},acceptanceCapture:acquired,amountStartup:{purpose:'amount-import-type-v1',requestId:'outer-start',authorization:'a'.repeat(64),deadline,operation:'original-operation',request:'original-request',phase:'capture',binding:{...acquired}}},message={id:'managed-start',deadline,input};
 const state={startupController:controller};const startup=retainAmountManagedStartup(message,input,state,controller);state.controlledStartup=startup;
 const page={isClosed(){return false}},context={pages(){return[page]}},owner={id:'owner-original',directory:'/labelled-session',generation:39,chat:'chat',account:'account',origin:'https://labelled.invalid',page,context,signal:controller.signal,deadline};state.startupOwner=owner;startup.bindOwner(owner);
 const session={directory:'/labelled-session',metadata:{sessionId:'session-original',clientRevision:'client-original'}};state.session=session;state.captureStartupBinding={owner,id:owner.id,generation:39,chat:'chat',account:owner.account,origin:owner.origin,page,context};
 const binding=Object.freeze({...acquired,session:session.metadata.sessionId}),retained=retainCaptureOwner(state,binding,Object.freeze({sha256:'b'.repeat(64)})),proxy=retainAmountCaptureProxy(state,retained);state.bridge={};state.client={};bindCaptureRuntime(retained,state.bridge,state.client);
 if(accepted)startup.accept();startup.settle();return{controller,state,startup,session,input,binding,proxy,retained,page,context};
}
const rows=[];const encoded=value=>({kind:'value',value:value===undefined?null:value,is_undefined:value===undefined});
for(const mode of ['valid','copied-startup','outerID','captureID','managedID','authorization','operation','request','deadline','purpose','late-binding-copy','late-extra','foreign-cancel','settled-cancel','first-false-equal','first-undefined-equal']){
 const f=fixture(),original=f.input.amountStartup,frame={revision:1,purpose:original.purpose,outerRequestId:'10000000-0000-0000-0000-000000000000',captureRequestId:'10000000-0000-0000-0000-000000000000',managedRequestId:'20000000-0000-0000-0000-000000000000',startupRequestId:original.requestId,authorization:original.authorization,operation:original.operation,request:original.request,deadline:original.deadline,binding:{...original.binding}},message={id:frame.managedRequestId,amountCapture:frame};
 const valid=()=>assertAmountCaptureProxy(f.proxy,f.binding,f.controller.signal);
 if(['outerID','captureID','managedID','authorization','operation','request','deadline','purpose'].includes(mode)){
  const key={outerID:'outerRequestId',captureID:'captureRequestId',managedID:'managedRequestId'}[mode]??mode;frame[key]=mode==='deadline'?frame.deadline+1:'foreign';
  assert.throws(()=>retainAmountManagedCapture(f.startup,f.state,message));assert.equal(f.state.amountCaptureRequest,undefined);
 }else if(mode==='copied-startup')assert.throws(()=>retainAmountManagedCapture({...f.startup},f.state,message));
 else{
  const h=retainAmountManagedCapture(f.startup,f.state,message);h.guard();valid();assert.equal(h.signal,f.controller.signal);assert.equal(h.pending,true);assert.throws(()=>retainAmountManagedCapture(f.startup,f.state,message));
  const cancellation={phase:'amount-capture',requestId:message.id,amountCapture:{...h.frame,binding:{...h.frame.binding}},rejection:encoded(false)};
  if(mode==='late-binding-copy'){frame.binding={...frame.binding};assert.throws(h.guard)}
  else if(mode==='late-extra'){frame.extra=true;assert.throws(h.guard)}
  else if(mode==='foreign-cancel'){cancellation.requestId='foreign';assert.equal(h.cancel(cancellation),false);h.guard();assert.equal(h.pending,true)}
  else if(mode==='settled-cancel'){h.settle();assert.equal(h.cancel(cancellation),false);assert.equal(h.pending,false)}
  else if(mode.startsWith('first-')){
   const value=mode==='first-undefined-equal'?undefined:false;cancellation.rejection=encoded(value);assert.equal(h.cancel(cancellation),true);assert.equal(h.pending,true);
   let refused=false,raw;try{h.guard()}catch(v){refused=true;raw=v}assert(refused);assert.equal(raw,value);f.startup.reject(value);assert.deepEqual(f.startup.secondary,{value});h.settle();assert.equal(h.cancel(cancellation),false);
  }else h.settle();
 }
 rows.push({mode,pass:true,native:false});
}
await writeFile(out,JSON.stringify({pass:rows.length,rows,limits:'Genuine private managed brand/controller constructor; labelled Page/state/tuple fixture. No host/provider/native execution.'},null,2));console.log(rows.length,'strict managed capture frame controls PASS');
