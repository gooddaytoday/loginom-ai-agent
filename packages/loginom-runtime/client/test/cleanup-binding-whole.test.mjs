import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

test('whole cleanup binding closure and original callback child IPC',async()=>{
  const reports=[],logs=[],env={...process.env};delete env.NODE_TEST_CONTEXT;
  const child=fork(fileURLToPath(new URL('./support/cleanup-binding-closure.mjs',import.meta.url)),[],
    {execArgv:['--experimental-test-module-mocks'],stdio:['ignore','pipe','pipe','ipc'],env});
  child.on('message',value=>reports.push(value));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
  const result=await new Promise(resolve=>child.on('exit',(code,signal)=>resolve({code,signal})));
  if(process.env.CLOSURE_RESULTS){await mkdir(process.env.CLOSURE_RESULTS,{recursive:true});
    await writeFile(join(process.env.CLOSURE_RESULTS,'whole-ipc.json'),JSON.stringify({result,reports},null,2));
    await writeFile(join(process.env.CLOSURE_RESULTS,'whole-child.log'),logs.join(''));}
  assert.equal(result.code,0,logs.join(''));assert.equal(reports.length,13);
  assert.ok(reports.every(value=>value.nativeClose===1&&value.nativeLogout===1));
});
