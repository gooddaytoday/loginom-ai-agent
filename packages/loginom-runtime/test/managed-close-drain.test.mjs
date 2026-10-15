import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('managed Close does not await its own request handler', async () => {
 const child=fork(fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url)),[],{execPath:process.execPath,stdio:['ignore','ignore','pipe','ipc']});
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 try {
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Close drain timeout')),3000);child.on('message',m=>{if(m.id==='close'){clearTimeout(timer);resolve(m)}})});
  child.send({id:'close',operation:'close'});
  assert.equal((await result).result.closed,true);
  assert.deepEqual(await exit,{code:0,signal:null});
 } finally {if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit}}
});
