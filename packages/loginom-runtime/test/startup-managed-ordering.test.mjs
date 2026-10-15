// Whole serialized managed entry; IPC real, browser/bridge/auth are labelled doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.env.RECEIVING_IPC_RESULTS)process.env.RECEIVING_IPC_RESULTS=join(process.env.RECEIVING_IPC_RESULTS,'ordering');
const entry=process.env.MANAGED_DRAIN_ENTRY??fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
async function run(scenario,body){
 const directory=await mkdtemp(join(tmpdir(),'lab66-startup-ipc-')),messages=[],logs=[];
 const child=fork(fileURLToPath(new URL('./fixtures/managed/startup-receiving-child.mjs',import.meta.url)),[],{execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,MANAGED_DRAIN_ENTRY:entry,MANAGED_DRAIN_SCENARIO:scenario,MANAGED_DRAIN_DIRECTORY:directory}});
 child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 let exited;const exit=new Promise(resolve=>child.on('exit',(code,signal)=>{exited={code,signal};resolve(exited)}));
 const wait=async predicate=>{const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('IPC timeout '+JSON.stringify({messages,logs,exited}));await new Promise(r=>setTimeout(r,10))}};
 const send=m=>child.send(m);const probe=async()=>{send({fixture:'probe'});await wait(()=>messages.some(m=>m.fixture==='probe'));return messages.find(m=>m.fixture==='probe')};
 try{await wait(()=>messages.some(m=>m.fixture==='ready'));await body({send,wait,probe,messages,directory,get exited(){return exited}})}
 finally{if(!exited){child.kill('SIGKILL');await exit}if(process.env.RECEIVING_IPC_RESULTS){await mkdir(process.env.RECEIVING_IPC_RESULTS,{recursive:true});await writeFile(join(process.env.RECEIVING_IPC_RESULTS,scenario+'.json'),JSON.stringify({entry,scenario,doubles:true,messages,logs,exit:exited,forced_fixture_disposal:exited.signal==='SIGKILL'},null,2))}await rm(directory,{recursive:true,force:true})}
}
// New receiving boundary controls: real fsync/close, whole module IPC; native effects are doubles.
test('real managed sync/close precedes release and successful ACK',()=>run('saved',async f=>{
 f.send({id:'close',operation:'close'});await f.wait(()=>!!f.exited);const m=f.messages.find(m=>m.id==='close');assert.equal(m.result.closed,true);
 const t=m.independentTrace,sync=t.findIndex(x=>x.event==='fsync-completed'),release=t.findIndex(x=>x.event==='native-cleanup-double');assert.ok(sync>=0&&release>sync);assert.equal(t[sync+1].event,'file-close-completed');
 const ack=t.filter(x=>x.event==='fsync-completed').at(-1);assert.equal(ack.receipt.stage,'outer_acknowledgement');assert.equal(ack.receipt.status,'allowed');assert.equal(t.at(-1).event,'file-close-completed');assert.equal(f.exited.code,0);
}));
for(const scenario of ['pending','throw-zero'])test('real managed refused receipt syncs, no release or ACK '+scenario,()=>run(scenario,async f=>{
 f.send({id:'close',operation:'close'});await f.wait(()=>f.messages.some(m=>m.id==='close'));const m=f.messages.find(m=>m.id==='close');assert.ok(m.error);assert.equal(f.exited,undefined);const t=m.independentTrace;assert.equal(t.some(x=>x.event==='client-close'||x.event==='context-close'),false);assert.equal(t.filter(x=>x.event==='fsync-completed').at(-1).receipt.stage,'refused');assert.equal(t.at(-1).event,'file-close-completed');
}));
test('management evidence retry reuses confirmed bridge and syncs before remaining release',()=>run('receipt-failure',async f=>{
 f.send({id:'blocked',operation:'close'});await f.wait(()=>f.messages.some(m=>m.id==='blocked'));const m=f.messages.find(m=>m.id==='blocked');assert.ok(m.error);assert.equal(f.exited,undefined);assert.equal(m.independentTrace.filter(x=>x.event==='bridge-call').length,1);assert.equal(m.independentTrace.some(x=>x.event==='client-close'||x.event==='context-close'),false);
 f.send({fixture:'unblock'});f.send({id:'retry',operation:'close'});await f.wait(()=>!!f.exited);const ack=f.messages.find(m=>m.id==='retry');assert.equal(ack.result.closed,true);assert.equal(ack.independentTrace.filter(x=>x.event==='bridge-call').length,1);assert.equal(ack.independentTrace.filter(x=>x.event==='fsync-completed').at(-1).receipt.stage,'outer_acknowledgement');assert.equal(ack.independentTrace.at(-1).event,'file-close-completed');assert.equal(f.exited.code,0);
}));
