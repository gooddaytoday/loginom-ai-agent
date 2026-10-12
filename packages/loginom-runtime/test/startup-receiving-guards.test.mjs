import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';
const entry=process.env.STARTUP_MANAGED??fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
for(const scenario of ['cleanup-missing','cleanup-false','logout-missing','logout-false','readiness-empty','browser-no-bridge','foreign-owner','foreign-page','foreign-context'])test('whole receiving refuses release/ACK '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'receiving-guards-'));const messages=[],logs=[];
 const child=fork(new URL('./fixtures/managed/receiving-guards-child.mjs',import.meta.url),[entry,directory,scenario],{execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc']});child.on('message',m=>messages.push(m));child.stderr.on('data',b=>logs.push(String(b)));
 const exit=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));let exited=false;child.once('exit',()=>exited=true);
 const wait=async p=>{const deadline=Date.now()+4000;while(!p()){if(exited||Date.now()>deadline)throw Error(JSON.stringify({messages,logs}));await new Promise(r=>setTimeout(r,5))}};
 try{await wait(()=>messages.some(m=>m.fixture==='ready'));for(let i=0;i<2;i++){child.send({id:'close'+i,operation:'close'});await wait(()=>messages.some(m=>m.id==='close'+i));assert.ok(messages.find(m=>m.id==='close'+i).error)}
 child.send({fixture:'probe'});await wait(()=>messages.some(m=>m.fixture==='probe'));const p=messages.find(m=>m.fixture==='probe');assert.equal(p.profile_exists,true);assert.equal(p.events.some(e=>e.endsWith('_release')),false);assert.equal(p.shutdown.stages.some(s=>s.stage==='outer_acknowledgement'),false);assert.ok(p.events.filter(e=>e==='native_bridge_close').length<=1);assert.equal(p.events.includes('owner_close'),false);
 if(process.env.REVIEW_RESULTS){await mkdir(process.env.REVIEW_RESULTS,{recursive:true});await writeFile(join(process.env.REVIEW_RESULTS,'guards-'+scenario+'.json'),JSON.stringify({entry,whole_module:true,native_doubles:true,messages,logs},null,2)+'\n')}
 }finally{if(!exited)child.send({fixture:'dispose'});const terminal=await exit;assert.equal(terminal.code,0);await rm(directory,{recursive:true,force:true})}
});

test('whole receiving canonical sync before releases and acknowledged Close',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'receiving-positive-')),messages=[],logs=[];
 const child=fork(new URL('./fixtures/managed/receiving-guards-child.mjs',import.meta.url),[entry,directory,'canonical'],{execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc']});child.on('message',m=>messages.push(m));child.stderr.on('data',b=>logs.push(String(b)));const exit=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('readiness timeout')),3000);child.on('message',m=>{if(m.fixture==='ready'){clearTimeout(timer);resolve()}})});child.send({id:'close',operation:'close'});const terminal=await exit;assert.equal(terminal.code,0,logs.join(''));assert.equal(messages.find(m=>m.id==='close').result.closed,true);
 const receipt=JSON.parse(await readFile(join(directory,'terminal.json'),'utf8'));assert.equal(receipt.shutdown.stages.at(-1).stage,'outer_acknowledgement');for(const name of ['client_release','browser_release']){const i=receipt.events.indexOf(name);assert.ok(i>0);assert.equal(receipt.events[i-1],'managed_file_close')};assert.equal(receipt.events.filter(e=>e==='native_bridge_close').length,1);await assert.rejects(readFile(join(directory,'profile')));
 if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,'guards-canonical.json'),JSON.stringify({entry,whole_module:true,real_fs_ipc:true,native_doubles:true,messages,receipt,terminal},null,2)+'\n');
 }finally{if(child.exitCode===null){child.send({fixture:'dispose'});await exit}await rm(directory,{recursive:true,force:true})}
});
