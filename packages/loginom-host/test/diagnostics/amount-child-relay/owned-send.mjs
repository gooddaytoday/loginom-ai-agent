import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [modulePath,childPath,nodePath,rawOut]=process.argv.slice(2),out=resolve(rawOut);await mkdir(out,{recursive:true});
const originalFork=cp.fork;let current;
cp.fork=(entry,args,options)=>{
 assert.equal(entry,resolve(childPath));const child=originalFork(entry,args,options),send=child.send.bind(child);current.child=child;
 child.send=(message,...rest)=>{
  if(message.operation==='acceptance.capture'){
   current.dispatches++;
   if(current.mode!=='canonical'){
    const callback=rest.findLast(x=>typeof x==='function');assert(callback);
    if(current.mode==='first-false-then-send-error')current.controller.abort(false);
    queueMicrotask(()=>{callback(current.fault);current.notifiedResolve()});return false;
   }
  }
  if(message.operation==='readonly.preReady.cancel'&&current.mode!=='canonical'){current.cancelPackets++;return true}
  return send(message,...rest);
 };return child;
};syncBuiltinESMExports();
const {supervise}=await import(pathToFileURL(resolve(modulePath)));const rows=[];
for(const mode of ['canonical','owned-send-error','first-false-then-send-error']){
 const root=await mkdtemp(join(out,'immediate-'+mode+'-')),controller=new AbortController(),deadline=Date.now()+10000;
 current={mode,controller,fault:Error('named owned capture IPC callback failure',{cause:false}),dispatches:0,cancelPackets:0};
 current.notified=new Promise(resolve=>current.notifiedResolve=resolve);
 let primary,secondary;
 const binding={revision:1,harness:'amount-import-type-v1',owner:'labelled',run:'run',lease:'labelled:run',generation:39,chat:'chat',account:'account',packagePath:'/account/a.lgp',admission:'labelled',expires:deadline};
 const startup={signal:controller.signal,deadline,requestId:'original-start',authorization:'a'.repeat(64),harness:'amount-import-type-v1',operation:'original-operation',request:'original-request',phase:'capture',binding,
  guard(){if(primary)throw primary.value;controller.signal.throwIfAborted()},reject(value){if(primary)secondary??={value};else primary={value};return primary.value},receive(value,origin,second){if(primary&&origin==='await')secondary??={value};primary??={value};if(second)secondary??=second;return primary.value},retain(){}};
 const runtime=await supervise({node:resolve(nodePath),entry:resolve(childPath),resources:root,stateDir:root,generation:39,chat:'chat',endpoint:'labelled',connection:{username:'account',apiKey:'labelled',password:'labelled',url:'https://labelled.invalid'},acceptanceCapture:binding},startup);
 let rejected=false,raw,pass=true,assertion;
 const capturing=runtime.captureAmount('10000000-0000-0000-0000-000000000000').then(value=>({value}),error=>({rejected:true,error}));
 if(mode!=='canonical'){
  await current.notified;
  // Driver permits either immediate send-failure refusal or pending until
  // original peer loss. Explicitly finalize only the supplied protocol child.
  current.child.send({id:'fixture-finalization',operation:'close'});
  assert.deepEqual(await runtime.exited,{code:0,signal:null});
 }
 const outcome=await capturing;rejected=outcome.rejected===true;raw=outcome.error;
 try{
  assert(rejected);assert.equal(current.dispatches,1);
  if(mode==='canonical')assert.equal(raw,false);
  else if(mode==='owned-send-error'){assert.equal(raw,current.fault);assert.equal(raw.cause,false);assert.equal(primary.value,current.fault)}
  else{assert.equal(raw,false);assert.deepEqual(primary,{value:false});assert.equal(secondary.value,current.fault);assert.equal(secondary.value.cause,false)}
 }catch(e){pass=false;assertion=e.message}
 // Only the named protocol child is finalized through its existing fixture close.
 if(mode==='canonical')await runtime.close();assert.deepEqual(await runtime.exited,{code:0,signal:null});
 rows.push({mode,pass,rejected,dispatches:current.dispatches,cancelPackets:current.cancelPackets,rawSame:raw===current.fault,raw:raw instanceof Error?{message:raw.message,cause:raw.cause}:raw,rawUndefined:raw===undefined,primaryPresent:!!primary,secondaryPresent:!!secondary,secondarySame:secondary?.value===current.fault,assertion,childExit:{code:0,signal:null}});
}
cp.fork=originalFork;syncBuiltinESMExports();
await writeFile(join(out,'results.json'),JSON.stringify({pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows,limits:'SOURCE_COMPILED or literal ACTUAL_INSTALLED defining supervisor + real Node child/IPC startup/fixture finalization. Allows immediate refusal or pending until original peer loss. Capture send callback/accepted primary are named faults, no native/service grant/factory authority. Startup control and protocol child are explicitly supplied conformance operands.'},null,2));console.log(JSON.stringify(rows));
