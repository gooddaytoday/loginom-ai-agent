import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {writeFile,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
test('exact whole bridge physical writer child IPC',async()=>{
 const reports=[],logs=[],env={...process.env,UV_THREADPOOL_SIZE:'1'};delete env.NODE_TEST_CONTEXT;
 const child=fork(fileURLToPath(new URL('./support/cleanup-physical-close.mjs',import.meta.url)),[],{execArgv:['--experimental-test-module-mocks'],stdio:['ignore','pipe','pipe','ipc'],env});
 child.on('message',m=>reports.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 const result=await new Promise(resolve=>child.on('exit',(code,signal)=>resolve({code,signal})));
 if(process.env.CLEANUP_RESULTS){await mkdir(process.env.CLEANUP_RESULTS,{recursive:true});await writeFile(join(process.env.CLEANUP_RESULTS,'whole-child.log'),logs.join(''));await writeFile(join(process.env.CLEANUP_RESULTS,'whole-ipc.json'),JSON.stringify({result,reports},null,2))}
 assert.equal(result.code,0,logs.join(''));assert.equal(reports.length,29);
 assert.ok(reports.every(r=>r.fixture==='report'&&r.native.filter(x=>x==='logout').length===1));
});
