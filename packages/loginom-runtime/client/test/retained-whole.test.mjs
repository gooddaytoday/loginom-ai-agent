import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('whole retained bridge child IPC',async()=>{
  const reports=[],logs=[],env={...process.env};delete env.NODE_TEST_CONTEXT;
  const child=fork(fileURLToPath(new URL('./support/retained-capture-whole.mjs',import.meta.url)),[],
    {execArgv:['--experimental-test-module-mocks'],stdio:['ignore','pipe','pipe','ipc'],env});
  child.on('message',value=>reports.push(value));
  child.stdout.on('data',bytes=>logs.push(String(bytes)));child.stderr.on('data',bytes=>logs.push(String(bytes)));
  const result=await new Promise(resolve=>child.on('exit',(code,signal)=>resolve({code,signal})));
  if(process.env.RETAINED_RESULTS){
    await mkdir(process.env.RETAINED_RESULTS,{recursive:true});
    await writeFile(join(process.env.RETAINED_RESULTS,'whole-child.log'),logs.join(''));
    await writeFile(join(process.env.RETAINED_RESULTS,'whole-ipc.json'),JSON.stringify({result,reports},null,2));
  }
  assert.equal(result.code,0,logs.join(''));assert.equal(reports.length,4);
  assert.ok(reports.every(value=>value.calls===1&&value.native===false&&value.release===false));
});
