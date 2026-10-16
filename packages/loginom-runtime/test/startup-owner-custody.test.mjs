import test from 'node:test';import assert from 'node:assert/strict';
import {fork} from 'node:child_process';import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
const entry=process.env.MANAGED_DRAIN_ENTRY??fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
for(const mode of ['error','undefined','null','false','zero','empty','pending-error'])test('actual checkConnection/managed start retains owner before explicit Close: '+mode,async()=>{
 const label=mode==='pending-error'?'error':mode;
 const directory=await mkdtemp(join(tmpdir(),'calculator-start-custody-')),messages=[],logs=[];
 const child=fork(fileURLToPath(new URL('./fixtures/managed/startup-linked-child.mjs',import.meta.url)),[],{
  execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,MANAGED_DRAIN_ENTRY:entry,LINKED_SCENARIO:'native-'+mode}});
 child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 let exited;const exit=new Promise(resolve=>child.on('exit',(code,signal)=>{exited={code,signal};resolve()}));
 const wait=async predicate=>{const end=Date.now()+7000;while(!predicate()){if(Date.now()>end)throw Error('fixture timeout '+JSON.stringify({messages,logs,exited}));await new Promise(r=>setTimeout(r,10))}};
 const probe=async()=>{const count=messages.filter(m=>m.fixture==='linked-probe').length;child.send({fixture:'probe'});await wait(()=>messages.filter(m=>m.fixture==='linked-probe').length>count);return messages.filter(m=>m.fixture==='linked-probe').at(-1)};
 try {
  await wait(()=>messages.some(m=>m.fixture==='ready'));
  child.send({id:'start',operation:'start',input:{validation:true,resources:'/fixture',stateDir:directory,generation:1,chat:'own',
   connection:{url:'https://fixture.invalid/app/',username:'own',password:'',apiKey:'fixture'},endpoint:'https://fixture.invalid'}});
  if(mode==='pending-error'){
    let pending;const end=Date.now()+5000;
    do{pending=await probe();if(pending.logoutCalls===1)break;assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,10))}while(true);
    assert.equal(pending.ownerContextSame,true);assert.equal(pending.ownerPageSame,true);
    assert.equal(pending.trackedRequests,1);assert.equal(messages.some(m=>m.id==='start'),false);
    child.send({id:'early-close',operation:'close'});await new Promise(r=>setTimeout(r,30));
    pending=await probe();assert.equal(pending.ownerCalls,1);assert.equal(pending.logoutCalls,1);assert.equal(pending.contextCalls,0);
    assert.equal(messages.some(m=>m.id==='early-close'),false);assert.equal(messages.some(m=>m.id==='start'),false);
    child.send({fixture:'unblock-native'});await wait(()=>messages.some(m=>m.id==='early-close'));
    assert.ok(messages.find(m=>m.id==='early-close').error);
  }
  await wait(()=>messages.some(m=>m.id==='start'));assert.ok(messages.find(m=>m.id==='start').error);
  const before=await probe();
  if(process.env.CUSTODY_RESULTS){await mkdir(process.env.CUSTODY_RESULTS,{recursive:true});await writeFile(join(process.env.CUSTODY_RESULTS,mode+'-before.json'),JSON.stringify({before,messages,logs},null,2))}
  assert.equal(before.ownerRetained,true);assert.equal(before.contextRetained,true);
  assert.equal(before.ownerCalls,mode==='pending-error'?2:1);assert.equal(before.logoutCalls,1);assert.equal(before.contextCalls,0);
  assert.equal(before.trackedRequests,0);if(mode!=='pending-error')assert.equal(before.shutdown,undefined);
  assert.equal(before.ownerPrimary.kind,label==='error'?'Error':'value');
  if(label==='error')assert.equal(before.ownerPrimary.cause.value,0);
  if(label==='undefined')assert.equal(before.ownerPrimary.is_undefined,true);
  child.send({id:'close',operation:'close'});await wait(()=>messages.some(m=>m.id==='close'));
  assert.ok(messages.find(m=>m.id==='close').error);
  const after=await probe();assert.equal(after.ownerRetained,true);assert.equal(after.contextRetained,true);
  assert.equal(after.ownerCalls,mode==='pending-error'?3:2);assert.equal(after.logoutCalls,1);assert.equal(after.contextCalls,0);
  assert.equal(after.ownerCleanup.kind,label==='error'?'Error':'value');
  if(process.env.CUSTODY_RESULTS){await mkdir(process.env.CUSTODY_RESULTS,{recursive:true});await writeFile(join(process.env.CUSTODY_RESULTS,mode+'.json'),JSON.stringify({entry,wholeHelper:true,wholeManaged:true,PageNativeDoubles:true,realFSIPC:true,before,after,messages},null,2))}
 } finally {
  // Only our native-free VM/IPC fixture is forcibly stopped. A native owner
  // would remain retained on this refusal; this is not a cleanup receipt.
  if(!exited){child.kill('SIGKILL');await exit}await rm(directory,{recursive:true,force:true});
 }
});
