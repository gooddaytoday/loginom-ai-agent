import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const entry=process.env.MANAGED_DRAIN_ENTRY??fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
const labels=['error','undefined','null','false','zero','empty'];
async function fixture(scenario,body){
 const directory=await mkdtemp(join(tmpdir(),'linked-lifecycle-')),messages=[],logs=[];
 const child=fork(fileURLToPath(new URL('./fixtures/managed/evidence-policy-child.mjs',import.meta.url)),[],{execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,MANAGED_DRAIN_ENTRY:entry,LINKED_SCENARIO:scenario}});
 child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 let exited;const exit=new Promise(r=>child.on('exit',(code,signal)=>{exited={code,signal};r()}));
 const wait=async predicate=>{const end=Date.now()+6000;while(!predicate()){if(Date.now()>end)throw Error('linked fixture timeout '+JSON.stringify({messages,logs,exited}));await new Promise(r=>setTimeout(r,10))}};
 const send=m=>child.send(m),probe=async()=>{const count=messages.filter(m=>m.fixture==='linked-probe').length;send({fixture:'probe'});await wait(()=>messages.filter(m=>m.fixture==='linked-probe').length>count);return messages.filter(m=>m.fixture==='linked-probe').at(-1)};
 const input={validation:true,resources:'/fixture',stateDir:directory,generation:1,chat:'fixture',connection:{url:'https://fixture.invalid/app/',username:'own',password:'',apiKey:'fixture'},endpoint:'https://fixture.invalid'};
 try{await wait(()=>messages.some(m=>m.fixture==='ready'));send({id:'start',operation:'start',input});await wait(()=>messages.some(m=>m.id==='start'));assert.ok(messages.find(m=>m.id==='start').error);await body({send,wait,probe,messages,directory,child,get exited(){return exited}})}
 finally{let receipts=[];try{const attempts=await fsPaths(directory);for(const path of attempts)receipts.push({path,value:JSON.parse(await readFile(path,'utf8'))})}catch{}if(!exited){child.kill('SIGKILL');await exit}if(process.env.LINKED_RESULTS){await mkdir(process.env.LINKED_RESULTS,{recursive:true});await writeFile(join(process.env.LINKED_RESULTS,scenario+'.json'),JSON.stringify({scenario,entry,wholeManaged:true,wholeHelper:true,nativeDoubles:true,messages,logs,receipts,exit:exited,forced_fixture_disposal:exited.signal==='SIGKILL'},null,2)+'\n')}await rm(directory,{recursive:true,force:true})}
}
async function fsPaths(root){const {readdir}=await import('node:fs/promises');const files=[];for(const x of await readdir(root,{withFileTypes:true})){const p=join(root,x.name);if(x.isDirectory())files.push(...await fsPaths(p));else if(x.name.endsWith('.json'))files.push(p)}return files}

for(const scenario of ['primary-error','primary-zero'])test('whole callback managed IO preserves separate atomic producer '+scenario,()=>fixture(scenario,async f=>{
 const p=await f.probe();assert.equal(p.logoutCalls,1);assert.equal(p.contextCalls,1);assert.equal(p.ownerClosed,true);
 const e=p.events;assert.ok(e.some(x=>x.startsWith('atomic-exclusive-flags:')&&x.endsWith(':384')));
 assert.ok(e.indexOf('producer-directory_close')<e.indexOf('context-close-double'));
 assert.ok(e.includes('producer-rename-complete'));assert.ok(e.includes('managed-file-sync-callback'));assert.ok(e.includes('managed-directory-sync-callback'));assert.ok(e.includes('managed-directory-close-callback'));
 const paths=await fsPaths(f.directory);const atomic=paths.find(p=>p.endsWith('startup-cleanup.json'));
 const {stat}=await import('node:fs/promises');assert.equal((await stat(atomic)).mode&0o777,0o600);
 assert.equal(JSON.parse(await readFile(atomic,'utf8')).cleanup_complete,true);
 const managed=JSON.parse(await readFile(paths.find(p=>p.endsWith('managed-shutdown.json')),'utf8'));assert.equal(managed.stages.at(-1).stage,'outer_acknowledgement');assert.equal(managed.stages.at(-1).status,'allowed');
 f.send({id:'close',operation:'close'});await f.wait(()=>!!f.exited);assert.equal(f.messages.find(m=>m.id==='close').result.closed,true);assert.equal(f.exited.code,0);
}));
