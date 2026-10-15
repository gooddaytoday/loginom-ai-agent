import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=process.env.MANAGED_DRAIN_ENTRY??fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
const fixture=fileURLToPath(new URL('./fixtures/managed/drain-child.mjs',import.meta.url));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function child(scenario){
 const directory=await mkdtemp(join(tmpdir(),'managed-drain-'));
 const messages=[],logs=[];let exited;
 const c=fork(scenario?fixture:entry,[],{execPath:process.execPath,execArgv:scenario?['--experimental-vm-modules']:[],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,MANAGED_DRAIN_ENTRY:entry,MANAGED_DRAIN_SCENARIO:scenario,MANAGED_DRAIN_DIRECTORY:directory}});
 c.on('message',m=>messages.push(m));c.stdout.on('data',b=>logs.push(b.toString()));c.stderr.on('data',b=>logs.push(b.toString()));
 const exit=new Promise(r=>c.on('exit',(code,signal)=>{exited={code,signal};r(exited)}));
 async function wait(predicate,ms=10000){const end=Date.now()+ms;while(!predicate()){if(Date.now()>end)throw Error('fixture timeout: '+JSON.stringify({messages,logs,exited}));await pause(10)}}
 const send=m=>new Promise((r,reject)=>c.send(m,error=>error?reject(error):r()));
 const cleanup=async()=>{if(!exited){c.kill('SIGKILL');await exit}await rm(directory,{recursive:true,force:true})};
 if(scenario)await wait(()=>messages.some(m=>m.fixture==='ready'));
 return {c,messages,logs,wait,send,exit,cleanup,directory,get exited(){return exited}};
}
test('real IPC Close without start follows NOT_READY control and acknowledges shutdown',async()=>{
 const f=await child();try{await f.send({id:'control',operation:'list'});await f.wait(()=>f.messages.some(m=>m.id==='control'));assert.equal(f.messages.find(m=>m.id==='control').error,'LOGINOM_NOT_READY');
 await f.send({id:'close',operation:'close'});await f.wait(()=>f.messages.some(m=>m.id==='close'),Number(process.env.MANAGED_DRAIN_ASSERT_MS??3000));assert.equal(f.messages.find(m=>m.id==='close').result.closed,true);await f.wait(()=>!!f.exited);assert.equal(f.exited.code,0);
 }finally{await f.cleanup()}
});
async function probe(f){await f.send({fixture:'probe'});await f.wait(()=>f.messages.some(m=>m.fixture==='probe'));return f.messages.findLast(m=>m.fixture==='probe')}
for(const scenario of ['saved','request-rejection'])test('Close drains a real in-flight handler before confirmed cleanup: '+scenario,async()=>{
 const f=await child(scenario);try{await f.send({id:'work',operation:'list'});await f.wait(()=>f.messages.some(m=>m.fixture==='in-flight'));await f.send({id:'close',operation:'close'});await pause(80);
 assert.equal(f.messages.some(m=>m.id==='close'),false);const p=await probe(f);assert.equal(p.native,0);
 await f.send({fixture:'release'});await f.wait(()=>f.messages.some(m=>m.id==='close'),Number(process.env.MANAGED_DRAIN_ASSERT_MS??3000));assert.equal(f.messages.find(m=>m.id==='close').result.closed,true);assert.ok(f.messages.findIndex(m=>m.id==='work')<f.messages.findIndex(m=>m.id==='close'));
 if(scenario==='request-rejection')assert.equal(f.messages.find(m=>m.id==='work').error,'LOGINOM_RUNTIME_FAILED');
 await f.wait(()=>!!f.exited);assert.equal(f.exited.code,0);assert.equal(f.messages.filter(m=>m.fixture==='bridge-close').length,1);assert.ok(f.messages.some(m=>m.fixture==='context-close'));
 }finally{await f.cleanup()}
});
test('concurrent Close and SIGTERM share one drain and cleanup while awaiting real work',async()=>{
 const f=await child('saved');try{await f.send({id:'work',operation:'list'});await f.wait(()=>f.messages.some(m=>m.fixture==='in-flight'));await f.send({id:'close1',operation:'close'});await f.send({id:'close2',operation:'close'});f.c.kill('SIGTERM');await pause(80);assert.equal(f.exited,undefined);const p=await probe(f);assert.equal(p.native,0);await f.send({fixture:'release'});await f.wait(()=>!!f.exited);assert.equal(f.exited.code,0);
 assert.equal(f.messages.filter(m=>m.fixture==='bridge-close').length,1);assert.ok(f.messages.some(m=>m.fixture==='context-close'));
 // A signal may exit before IPC delivery; absent replies are never treated as acknowledgements.
 assert.ok(f.messages.filter(m=>m.id?.startsWith('close')).every(m=>m.result?.closed===true));
 }finally{await f.cleanup()}
});
for(const scenario of ['throw-error','throw-undefined','throw-null','throw-false','throw-zero','throw-empty','pending','unknown','unsaved','missing-cleanup'])test('Close refusal retains owner and denies ack: '+scenario,async()=>{
 const f=await child(scenario);try{await f.send({id:'close',operation:'close'});await f.wait(()=>f.messages.some(m=>m.id==='close'),Number(process.env.MANAGED_DRAIN_ASSERT_MS??3000));assert.ok(f.messages.find(m=>m.id==='close').error);assert.equal(f.exited,undefined);
 const p=await probe(f);assert.equal(p.native,1);assert.equal(p.events.includes('context-close'),false);assert.equal(p.retained,true);assert.equal(p.bridgeCalls,1);
 if(scenario==='throw-error')assert.equal(p.closeFailure.message,'fixture primary');
 if(scenario==='throw-undefined')assert.equal(p.closeFailureUndefined,true);
 if(['throw-zero','throw-null','throw-false','throw-empty'].includes(scenario))assert.equal(p.closeFailure,{'throw-zero':0,'throw-null':null,'throw-false':false,'throw-empty':''}[scenario]);
 // The exact same retained fixture is stopped by its test parent, never an original/native owner.
 }finally{await f.cleanup()}
});
test('lost IPC reply/disconnect does not release an incomplete retained cleanup',async()=>{
 const f=await child('unknown');try{await f.send({id:'close',operation:'close'});f.c.disconnect();await pause(150);assert.equal(f.exited,undefined);
 assert.equal(f.messages.some(m=>m.fixture==='context-close'),false);assert.ok(!f.messages.some(m=>m.id==='close'&&m.result?.closed===true));
 }finally{await f.cleanup()}
});
