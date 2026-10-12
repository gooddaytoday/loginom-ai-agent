import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';
test('full bridge/managed Error and falsy refusal with concurrent/repeated child IPC',async()=>{
 const reports=[],logs=[],env={...process.env};delete env.NODE_TEST_CONTEXT;
 const child=fork(fileURLToPath(new URL('./support/cleanup-managed-refusal.mjs',import.meta.url)),[],{execArgv:['--experimental-test-module-mocks','--experimental-vm-modules','--test-reporter=tap'],stdio:['ignore','pipe','pipe','ipc'],env});
 child.on('message',m=>reports.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 const result=await new Promise(r=>child.on('exit',(code,signal)=>r({code,signal})));
 if(process.env.REFUSAL_RESULTS){await mkdir(process.env.REFUSAL_RESULTS,{recursive:true});await writeFile(join(process.env.REFUSAL_RESULTS,'raw-ipc.json'),JSON.stringify({result,reports,logs},null,2))}
 assert.equal(reports.filter(r=>r.fixture==='refusal-report').length,(process.env.REFUSAL_LABELS??'success,error,undefined,null,false,zero,empty').split(',').length,'each control reaches real producer result');assert.equal(result.code,0,logs.join(''));
});
