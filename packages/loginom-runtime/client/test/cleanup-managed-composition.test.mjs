import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';
for(const mode of ['normal','withheld'])test('full bridge + managed callback/outer ACK '+mode,async()=>{
 const reports=[],logs=[],env={...process.env,CLEANUP_COUPLED:mode,UV_THREADPOOL_SIZE:'1'};delete env.NODE_TEST_CONTEXT;
 const child=fork(fileURLToPath(new URL('./support/cleanup-physical-close.mjs',import.meta.url)),[],{execArgv:['--experimental-test-module-mocks','--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env});
 child.on('message',m=>reports.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 const result=await new Promise(r=>child.on('exit',(code,signal)=>r({code,signal})));
 if(process.env.CLEANUP_RESULTS){await mkdir(process.env.CLEANUP_RESULTS,{recursive:true});await writeFile(join(process.env.CLEANUP_RESULTS,mode+'-coupled.json'),JSON.stringify({result,reports,logs},null,2))}
 assert.equal(result.code,0,logs.join(''));assert.equal(reports.filter(r=>r.fixture==='report').length,1);
 const ack=reports.find(r=>r.fixture==='managed-ack');assert.equal(ack?.message.result?.closed,true);
 assert.equal(reports.find(r=>r.fixture==='report').native.filter(e=>e==='logout').length,1);
});
