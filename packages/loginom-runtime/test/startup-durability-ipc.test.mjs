import test from 'node:test';import assert from 'node:assert/strict';
import {fork} from 'node:child_process';import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const source=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url).pathname;
const managed=process.env.STARTUP_MANAGED??new URL('../src/managed-entry.mjs',import.meta.url).pathname;
// Actual Node/kernel IPC and actual lifecycle functions. Child Page/connection
// are doubles, without browser, server Loginom, model or profile acquisition.
for(const scenario of ['normal','persistence-refusal','lost-reply'])test('real message IPC producer durability '+scenario,async()=>{
 const results=process.env.REVIEW_RESULTS??await mkdtemp(join(tmpdir(),'startup-ipc-results-'));
 const child=fork(new URL('./startup-durability-ipc-child.mjs',import.meta.url),[scenario],{execPath:process.execPath,env:{...process.env,STARTUP_SOURCE:source,STARTUP_MANAGED:managed,REVIEW_RESULTS:results},stdio:['ignore','ignore','pipe','ipc']});
 let sequence=0;const waits=new Map();let stderr='';child.stderr.on('data',b=>stderr+=b.toString());child.on('message',m=>{waits.get(m.id)?.(m.result);waits.delete(m.id)});
 const exit=once(child,'exit');
 const send=operation=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{waits.delete(id);reject(Error('FIXTURE_REPLY_LOST'))},1000);waits.set(id,v=>{clearTimeout(timer);resolve(v)});child.send({id,operation})});
 try{
  const ready=await send('start');assert.equal(ready.ready,true);
  if(scenario==='persistence-refusal') {const refusal=await send('close');assert.equal(refusal.closed,false);assert.equal(refusal.retained,true);assert.equal(refusal.rejection.message,'LOGINOM_RUNTIME_CLEANUP_FAILED');assert.equal(refusal.rejection.cause.value,0);assert.equal(refusal.context,0);assert.equal(refusal.native,1);assert.equal(refusal.owner,ready.owner)}
  if(scenario==='lost-reply')await assert.rejects(send('close'),/FIXTURE_REPLY_LOST/);
  const complete=await send('close');assert.equal(complete.closed,true);assert.equal(complete.owner,ready.owner);assert.equal(complete.native,1);assert.equal(complete.context,1);
  const [code,signal]=await exit;assert.equal(code,0,stderr);assert.equal(signal,null);
  assert.equal(JSON.parse(await readFile(join(results,scenario+'.json'),'utf8')).evidence.cleanup_complete,true);
 }finally{if(child.connected)child.disconnect();if(child.exitCode===null)await exit;if(!process.env.REVIEW_RESULTS)await rm(results,{recursive:true,force:true})}
});
