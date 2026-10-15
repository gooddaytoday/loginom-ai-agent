// Real fsync completion and IPC ACK; Page/auth/native/bridge remain explicit doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=process.env.MANAGED_DRAIN_ENTRY??fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
for(const scenario of ['no-start','saved','primary-error','sync-confirmed-error'])test('real fsync before managed release/ACK '+scenario,async()=>{
 const linked=scenario.includes('error'),directory=await mkdtemp(join(tmpdir(),'receiving-fsync-')),messages=[],logs=[];
 const child=fork(fileURLToPath(new URL('./fixtures/managed/'+(linked?'startup-linked-child.mjs':'startup-receiving-child.mjs'),import.meta.url)),[],{execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,MANAGED_DRAIN_ENTRY:entry,MANAGED_DRAIN_SCENARIO:scenario,MANAGED_DRAIN_DIRECTORY:directory,LINKED_SCENARIO:scenario}});
 child.on('message',m=>messages.push(m));child.stderr.on('data',b=>logs.push(String(b)));
 let exited;const exit=new Promise(r=>child.on('exit',(code,signal)=>{exited={code,signal};r()}));
 const wait=async pred=>{const end=Date.now()+6000;while(!pred()){if(Date.now()>end)throw Error(JSON.stringify({messages,logs,exited}));await new Promise(r=>setTimeout(r,10))}};
 try {
  await wait(()=>messages.some(m=>m.fixture==='ready'));
  if(linked){child.send({id:'start',operation:'start',input:{validation:true,resources:'/fixture',stateDir:directory,generation:1,chat:'fixture',connection:{url:'https://fixture.invalid/app/',username:'own',password:'',apiKey:'fixture'},endpoint:'https://fixture.invalid'}});await wait(()=>messages.some(m=>m.id==='start'));assert.ok(messages.find(m=>m.id==='start').error)}
  if(scenario==='sync-confirmed-error'){
   child.send({id:'blocked',operation:'close'});await wait(()=>messages.some(m=>m.id==='blocked'));assert.ok(messages.find(m=>m.id==='blocked').error);assert.equal(exited,undefined);
   child.send({fixture:'probe'});await wait(()=>messages.some(m=>m.fixture==='linked-probe'));const probe=messages.find(m=>m.fixture==='linked-probe');assert.equal(probe.ownerCalls,1);assert.equal(probe.logoutCalls,1);assert.equal(probe.contextCalls,1);child.send({fixture:'unblock'});
  }
  child.send({id:'close',operation:'close'});await wait(()=>!!exited);assert.equal(exited.code,0);
  const ack=messages.find(m=>m.id==='close');assert.equal(ack.result.closed,true);const trace=ack.fsTrace;assert.ok(Array.isArray(trace));
  if(scenario==='no-start')assert.equal(trace.length,0);
  else {
   assert.equal(trace.at(-1).event,'fsync-completed');assert.equal(trace.at(-1).receipt.stage,'outer_acknowledgement');assert.equal(trace.at(-1).receipt.status,'allowed');
   const stage=linked?'startup_owner':'bridge',sync=trace.findIndex(e=>e.event==='fsync-completed'&&e.receipt.stage===stage&&e.receipt.status==='returned');assert.ok(sync>=0);
   if(!linked){const release=trace.findIndex(e=>e.event==='client-close');assert.ok(release>sync);assert.ok(trace.findIndex(e=>e.event==='context-close')>release)}
  }
 } finally {
  if(!exited){child.kill('SIGKILL');await exit}
  if(process.env.FSYNC_RESULTS){await mkdir(process.env.FSYNC_RESULTS,{recursive:true});await writeFile(join(process.env.FSYNC_RESULTS,scenario+'.json'),JSON.stringify({scenario,entry,messages,logs,exit:exited,doubles:true},null,2)+'\n')}
  await rm(directory,{recursive:true,force:true});
 }
});
