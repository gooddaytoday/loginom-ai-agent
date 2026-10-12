import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';
const entry=process.env.PHYSICAL_ENTRY??fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
for(const scenario of ['normal','lost-reply','early-fulfilled','missing-callback','directory-lost','callback-error',...['error','undefined','null','false','zero','empty'].map(x=>'sync-'+x)])test('whole managed physical close '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'physical-close-')),messages=[],logs=[];
 const child=fork(fileURLToPath(new URL('./fixtures/managed/physical-close-child.mjs',import.meta.url)),[],{execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,UV_THREADPOOL_SIZE:'1',PHYSICAL_ENTRY:entry,PHYSICAL_SCENARIO:scenario,PHYSICAL_DIRECTORY:directory}});
 child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 let exited;const exit=new Promise(resolve=>child.on('exit',(code,signal)=>{exited={code,signal};resolve(exited)}));
 const wait=async predicate=>{const end=Date.now()+5000;while(!predicate()){if(exited)throw Error('unexpected child exit '+JSON.stringify({exited,messages,logs}));if(Date.now()>end)throw Error('timeout '+JSON.stringify({messages,logs}));await new Promise(r=>setTimeout(r,5))}};
 const send=m=>child.send(m);let n=0;const probe=async()=>{const tag=++n;send({fixture:'probe',tag});await wait(()=>messages.some(m=>m.tag===tag));return messages.find(m=>m.tag===tag)};
 try{
  await wait(()=>messages.some(m=>m.fixture==='ready'));send({id:'first',operation:'close'});
  if(['early-fulfilled','missing-callback'].includes(scenario)){
   await wait(()=>messages.some(m=>m.fixture==='kernel-complete')||messages.some(m=>m.id==='first'));
   if(scenario==='missing-callback'){
    const p=await probe();assert.equal(p.kernelFinished,true);assert.equal(p.physicalOpen,false);assert.equal(p.callbackDelivered,false);assert.equal(p.writers,1);assert.equal(messages.some(m=>m.id==='first'),false);assert.equal(p.events.some(e=>e.event==='client-close'),false);
    send({id:'concurrent',operation:'close'});send({fixture:'deliver-original-callback'});
   }
  }
  if(scenario==='callback-error'){
   await wait(()=>messages.some(m=>m.id==='first'));const before=await probe();assert.equal(before.physicalOpen,true);assert.equal(before.native,1);assert.equal(before.events.some(e=>e.event==='context-close-double'),false);
   send({id:'retry',operation:'close'});await wait(()=>messages.some(m=>m.id==='retry'));assert.ok(messages.find(m=>m.id==='retry').error);assert.equal((await probe()).native,1);
  } else {
   if(['lost-reply','directory-lost'].includes(scenario)||scenario.startsWith('sync-')){
    await wait(()=>messages.some(m=>m.id==='first'));assert.ok(messages.find(m=>m.id==='first').error);const first=await probe();assert.equal(first.native,1);assert.equal(first.events.some(e=>e.event==='client-close'),false);
    if(scenario.startsWith('sync-')){assert.equal(first.evidencePrimary.phase,'file_sync');const v=first.evidencePrimary.rejection;
     if(scenario==='sync-error'){assert.equal(v.kind,'Error');assert.equal(v.cause.value,0)}else assert.equal(v.value,scenario==='sync-undefined'||scenario==='sync-null'?null:scenario==='sync-false'?false:scenario==='sync-zero'?0:'');
     assert.ok(first.shutdown.persistenceFailures.some(x=>x.phase==='file_close'&&x.rejection.value===false));}
    await wait(()=>messages.some(m=>m.fixture==='kernel-complete'));send({id:'retry',operation:'close'});
   }
   await wait(()=>!!exited);assert.equal(exited.code,0);const ack=messages.find(m=>m.id==='retry')??messages.find(m=>m.id==='first');assert.equal(ack.result.closed,true);
   const proof=messages.find(m=>m.fixture==='release-proof');assert.equal(proof.native,1);assert.equal(proof.writers,0);assert.equal(proof.events.some(e=>e.event==='new-open-before-kernel'),false);assert.ok(proof.events.some(e=>e.event==='sync-callback'&&e.kind==='directory'&&e.succeeded));assert.ok(proof.events.some(e=>e.event==='close-callback'&&e.kind==='directory'&&e.succeeded));
   const evidence=JSON.parse(await readFile(join(directory,'managed-shutdown.json'),'utf8'));assert.ok(evidence.stages.some(s=>s.stage==='outer_acknowledgement'&&s.status==='allowed'));
  }
  const reports=messages.filter(m=>m.fixture==='probe');for(const p of reports){assert.equal(p.events.some(e=>e.event==='new-open-before-kernel'),false);assert.equal(p.native,1)}
 }finally{
  if(!exited){send({fixture:'dispose'});await exit}
  if(process.env.PHYSICAL_RESULTS){await mkdir(process.env.PHYSICAL_RESULTS,{recursive:true});await writeFile(join(process.env.PHYSICAL_RESULTS,scenario+'.json'),JSON.stringify({fixture:true,entry,scenario,messages,logs,exit:exited,scope:'whole managed module; genuine Node fs/kernel/child IPC; Page/native/bridge/context and reply faults doubles; no native Loginom'},null,2))}
  await rm(directory,{recursive:true,force:true})
 }
});
