import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,supervisorModule,rawOutput,phase]=process.argv.slice(2),output=resolve(rawOutput),resources=join(resolve(product),'resources/loginom');
await mkdir(output,{recursive:true});
const {supervise}=await import(pathToFileURL(supervisorModule));
const original=cp.fork;let child,events;
cp.fork=(...args)=>{child=original(...args);child.on('message',m=>events.push(m));return child};syncBuiltinESMExports();
const wait=async predicate=>{for(let i=0;i<1000;i++){const found=events.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,5))}throw Error('FIXTURE_TIMEOUT')};
const rejected=async work=>{try{await work;throw Error('EXPECTED_REFUSAL')}catch(e){if(e?.message==='EXPECTED_REFUSAL')throw e;return e}};
const results=[];
try{
 for(const mode of ['packet','preabort','equal-false','equal-undefined']){
  events=[];child=undefined;const controller=new AbortController(),deadline=Date.now()+15000;
  const binding={revision:1,harness:'amount-import-type-v1',owner:'labelled_owner',run:'labelled_run',lease:'labelled_owner:labelled_run',generation:1,chat:'labelled_chat',account:'worker',packagePath:'/worker/amount.lgp',admission:'labelled',expires:deadline};
  let primary,secondary,runtime;
  const startup={signal:controller.signal,deadline,requestId:'original_outer',authorization:'a'.repeat(64),harness:binding.harness,operation:'original_operation',request:'original_request',phase:'capture',binding,
   guard(){if(primary)throw primary.value;controller.signal.throwIfAborted();if(Date.now()>=deadline)throw Error('EXPIRED')},
   reject(value){primary??={value};return primary.value},receive(value,origin,late){if(origin==='control')primary??={value};else if(primary)secondary??={value};else primary={value};if(late)secondary??=late;return primary.value},retain(value){runtime=value}};
  if(mode==='preabort'){primary={value:false};controller.abort(false)}
  const attempt=supervise({node:join(resources,'bin/node'),entry:join(import.meta.dirname,'child.mjs'),resources,stateDir:join(output,mode),generation:1,chat:binding.chat,connection:{username:'worker',apiKey:'labelled',password:'labelled',url:'https://labelled.invalid'},endpoint:'https://labelled.invalid',acceptanceCapture:binding},startup);
  if(mode==='preabort'){assert.equal(await rejected(attempt),false);assert.equal(child,undefined)}
  else{
   const held=await wait(m=>m.fixture==='held');assert.equal(held.packet.input.fpStartup,undefined);assert.equal(held.packet.input.amountStartup.purpose,binding.harness);
   assert.deepEqual(held.packet.input.amountStartup.binding,binding);assert.equal(held.packet.deadline,deadline);assert.equal(held.packet.input.amountStartup.operation,startup.operation);assert.equal(held.packet.input.amountStartup.request,startup.request);
   let settled=false;attempt.then(()=>settled=true,()=>settled=true);
   if(mode!=='packet'){
    const value=mode==='equal-undefined'?undefined:false;primary={value};controller.abort(value);
    const receipt=await wait(m=>m.fixture==='cancel');assert.equal(receipt.accepted,true);assert.equal(receipt.pending,true);
    await new Promise(r=>setTimeout(r,20));assert.equal(settled,false,'original reply stays pending before owned settlement');
    child.send({fixture:'resolve',reject:true,value:value??null,is_undefined:value===undefined});assert.equal(await rejected(attempt),value);assert.deepEqual(secondary,{value});
   }else{child.send({fixture:'resolve'});assert.equal((await attempt).ready.ready,true)}
   await runtime.close();assert.deepEqual(await runtime.exited,{code:0,signal:null});
  }
  results.push({mode,pass:true,providerAuthority:false,nativeAuthority:false,events});console.log(phase,mode,'PASS');
 }
}finally{cp.fork=original;syncBuiltinESMExports()}
await writeFile(join(output,'results.json'),JSON.stringify({phase,cases:results.length,results,fixedLauncherQualified:false,providerAuthority:false,nativeAuthority:false},null,2)+'\n');
