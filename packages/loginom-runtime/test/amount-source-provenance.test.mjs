import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash,randomUUID} from 'node:crypto';
const root=process.argv[2]??new URL('..',import.meta.url).pathname,load=p=>import(pathToFileURL(resolve(root,p)).href);
const {retainAmountManagedStartup}=await load('src/fp-managed-startup.mjs');
const {retainCaptureOwner,bindCaptureRuntime}=await load('src/retained-capture.mjs');
const {retainAmountCaptureProxy}=await load('src/amount-capture-proxy.mjs');
const {retainAmountSource}=await load('src/amount-source-provenance.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
function fixture(accepted=true){
 const controller=new AbortController(),deadline=Date.now()+10000;
 const acquired={revision:1,harness:'amount-import-type-v1',owner:'owner',run:'run',lease:'owner:run',generation:39,chat:'chat',account:'account',packagePath:'/account/package.lgp',admission:'admission',expires:deadline-1000};
 const input={protocol:1,generation:39,chat:'chat',stateDir:'/labelled-state',connection:{username:'account'},acceptanceCapture:acquired,amountStartup:{purpose:'amount-import-type-v1',requestId:'outer-start',authorization:'a'.repeat(64),deadline,operation:randomUUID(),request:randomUUID(),phase:'capture',binding:{...acquired}}},message={id:'managed-start',deadline,input};
 const state={startupController:controller};const startup=retainAmountManagedStartup(message,input,state,controller);state.controlledStartup=startup;
 const page={isClosed(){return false}},context={pages(){return[page]}},owner={id:'owner-original',directory:'/labelled-session',generation:39,chat:'chat',account:'account',origin:'https://labelled.invalid',page,context,signal:controller.signal,deadline};state.startupOwner=owner;startup.bindOwner(owner);
 const session={directory:'/labelled-session',metadata:{sessionId:'session-original',clientRevision:'client-original'}};state.session=session;state.captureStartupBinding={owner,id:owner.id,generation:39,chat:'chat',account:owner.account,origin:owner.origin,page,context};
 const binding=Object.freeze({...acquired,session:session.metadata.sessionId}),retained=retainCaptureOwner(state,binding,Object.freeze({sha256:'b'.repeat(64)})),proxy=retainAmountCaptureProxy(state,retained);state.bridge={};state.client={};bindCaptureRuntime(retained,state.bridge,state.client);
 if(accepted)startup.accept();startup.settle();return{controller,state,startup,session,input,binding,proxy,retained,page,context};
}

const modes=['positive','copy-retry','pending-copy','lost-false','lost-undefined','lost-error','equal-false','equal-undefined','record-false','record-undefined','foreign-path','foreign-hash','unverified','method-drift','source-drift','metadata-drift','late-abort','late-expiry','local-byte-drift'];
const rows=[];
for(const mode of modes){
 const directory=await mkdtemp(join(tmpdir(),'amount-source-'));const f=fixture();
 try{
  const raw=Buffer.from('Key,Amount\nA,1\n'),path=join(directory,'input.csv');await writeFile(path,raw);
  const directories={inputs:'/account/inputs',packages:'/account',exports:'/account/exports'};
  f.session.metadata.storageDirectories=directories;
  const store=await createArtifactStore({directory:join(directory,'artifacts'),sessionId:f.sessionId,storageDirectories:directories});f.session.artifactStore=store;
  const source=await store.admit({sourcePath:path,name:'input.csv',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),upload:{directory:directories.inputs,overwrite:'reject'}});
  const journal=createExecutionJournal({directory,metadata:f.session.metadata});let dispatches=0,records=0,release;
  const failure=mode==='lost-undefined'||mode==='record-undefined'||mode==='equal-undefined'?undefined:mode==='lost-error'?Error('lost',{cause:0}):false;
  const runtime={async deliverArtifact(request,{signal}){
   dispatches++;assert.equal(signal,f.controller.signal);assert(request.budget_ms<=f.binding.expires-Date.now()+5);
   assert.equal(request.artifact_id,source.artifact_id);assert.equal(request.upload_grant_id,source.upload.grant_id);
   if(mode==='pending-copy')await new Promise(r=>{release=r});
   if(mode.startsWith('lost-'))throw failure;
   if(mode.startsWith('equal-')){if(mode==='equal-undefined')f.startup.propagate(undefined);else f.controller.abort(failure);throw failure;}
   if(mode==='method-drift')runtime.deliverArtifact=()=>{};
   if(mode==='source-drift')source.sha256='0'.repeat(64);
   if(mode==='metadata-drift')f.session.metadata.storageDirectories={...directories};
   if(mode==='late-abort')f.controller.abort(false);
   if(mode==='late-expiry')Date.now=()=>f.binding.expires+1;
   return {state:'settled',phase:'completed',outcome:{status:'SUCCEEDED',destination:mode==='foreign-path'?'/account/inputs/foreign.csv':source.upload.destination,
    bytes:source.bytes,sha256:mode==='foreign-hash'?'0'.repeat(64):source.sha256,cleanup_complete:true,upload_completion_verified:mode!=='unverified',
    verification_id:'verified-original',upload_operation_id:request.operation_id+':upload'}};
  }};
  const record=async event=>{records++;if(mode.startsWith('record-'))return failure;return journal(event)};
  const args={guard:()=>{},signal:f.controller.signal,runtime,record};
  const provider=retainAmountSource(f.retained,source,args);
  assert.throws(()=>provider.assert(undefined),/SOURCE_UNAVAILABLE/);
  assert.throws(()=>retainAmountSource(f.retained,null,args),/SOURCE_UNAVAILABLE/);
  if(mode==='local-byte-drift')await writeFile(join(directory,'artifacts',source.artifact_id),'changed');
  let originalNow=Date.now;
  let value,caught,present=false;
  try{
   const work=provider.deliver();
   if(mode==='pending-copy'){
    while(!release)await new Promise(r=>setTimeout(r,1));assert(provider.unsettled());
    const duplicate=retainAmountSource(f.retained,{...source,upload:{...source.upload}},args);
    await assert.rejects(duplicate.deliver(),/SOURCE_CONSUMED/);assert.equal(dispatches,1);release();
   }
   value=await work;
  }catch(e){present=true;caught=e}finally{Date.now=originalNow}
  if(['positive','copy-retry','pending-copy'].includes(mode)){
   assert.equal(present,false);assert.equal(dispatches,1);assert.equal(records,1);assert.equal(provider.unsettled(),false);provider.assert(value);assert.throws(()=>provider.assert({...value}));
   const recorded=JSON.parse((await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim());assert.equal(recorded.receipt.sha256,source.sha256);
   const duplicate=retainAmountSource(f.retained,{...source,upload:{...source.upload}},args);await assert.rejects(duplicate.deliver(),/SOURCE_CONSUMED/);assert.equal(dispatches,1);
  }else{
   assert.equal(present,true);assert(records<=1);assert(dispatches<=1);
   if(mode.startsWith('lost-')||mode.startsWith('record-')||mode.startsWith('equal-')){assert.equal(caught,failure);assert.equal(provider.unsettled(),true)}
   if(mode==='late-abort')assert.equal(caught,false);
   if(mode.startsWith('equal-')){assert.equal(f.startup.secondary.value,failure);assert.equal(f.startup.rejectionOrigin,mode==='equal-undefined'?'guard':'control');}
   assert.throws(()=>provider.assert({}));
   let again=false;try{await provider.deliver()}catch{again=true}assert(again);assert(dispatches<=1);
  }
  rows.push({mode,status:'PASS',dispatches,records,scope:'real artifact store/FS/journal/branded startup; delivery/Page/native are labelled doubles'});
 }finally{await rm(directory,{recursive:true,force:true})}
}
console.log(JSON.stringify({pass:rows.length,rows},null,2));
