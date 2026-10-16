// Whole serialized managed entry; IPC real, browser/bridge/auth are labelled doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
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
test('receiving IPC no-start Close acknowledges without self-drain',()=>run('no-start',async f=>{f.send({id:'c',operation:'close'});await f.wait(()=>!!f.exited);assert.equal(f.messages.find(m=>m.id==='c').result.closed,true);assert.equal(f.exited.code,0)}));
test('receiving IPC Close waits in-flight ordinary work then acknowledges',()=>run('saved',async f=>{f.send({id:'w',operation:'list'});await f.wait(()=>f.messages.some(m=>m.fixture==='in-flight'));f.send({id:'c',operation:'close'});await new Promise(r=>setTimeout(r,50));assert.equal(f.exited,undefined);f.send({fixture:'release'});await f.wait(()=>!!f.exited);assert.equal(f.messages.find(m=>m.id==='c').result.closed,true);assert.equal(f.exited.code,0)}));
for(const scenario of ['throw-error','throw-undefined','throw-null','throw-false','throw-zero','throw-empty','pending','unknown','missing-cleanup'])test('receiving IPC native refusal denies Close ack '+scenario,()=>run(scenario,async f=>{f.send({id:'c',operation:'close'});await f.wait(()=>f.messages.some(m=>m.id==='c'));assert.ok(f.messages.find(m=>m.id==='c').error);assert.equal(f.exited,undefined);const p=await f.probe();assert.equal(p.native,1);assert.equal(p.events.includes('context-close'),false)}));
test('startup UNKNOWN retains owned context and denies repeated Close without release',()=>run('startup-owner-gap',async f=>{f.send({id:'s',operation:'start',input:{validation:true,resources:'/fixture',stateDir:f.directory,generation:1,chat:'fixture',connection:{username:'own'},endpoint:'https://fixture.invalid'}});await f.wait(()=>f.messages.some(m=>m.id==='s'));assert.equal(f.messages.find(m=>m.id==='s').error,'LOGINOM_LOGIN_UNAVAILABLE');const p=await f.probe();assert.equal(p.startupOwnerRetained,true);f.send({id:'c',operation:'close'});await f.wait(()=>f.messages.some(m=>m.id==='c'));assert.ok(f.messages.find(m=>m.id==='c').error);assert.equal(f.exited,undefined);assert.equal(p.events.includes('startup-context-close'),false)}));
