import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('managed Close does not await its own request handler', async () => {
 const child=fork(fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url)),[],{execPath:process.execPath,stdio:['ignore','ignore','pipe','ipc']});
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 try {
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Close drain timeout')),30000);child.on('message',m=>{if(m.id==='close'){clearTimeout(timer);resolve(m)}})});
  child.send({id:'close',operation:'close'});
  assert.equal((await result).result.closed,true);
  assert.deepEqual(await exit,{code:0,signal:null});
 } finally {if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit}}
});

for (const result of [{browser_transport_closed:true},{browser_transport_closed:false},undefined])
 test('managed Close propagates bridge result '+JSON.stringify(result), async () => {
  const source=await readFile(new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('function close() {'),source.indexOf('const stop ='));
  const events=[];
  const state={controller:{abort(){events.push('abort')}},
   client:{async close(){events.push('client')}},
   bridge:{async close(){events.push('bridge');return result}},
   browserServer:{async close(){events.push('server')}},browser:{async close(){events.push('browser')}}};
  const close=runInNewContext(body+';close',{state,requests:new Set(),Promise});
  if(result?.browser_transport_closed===true)await close();
  else await assert.rejects(close(),/LOGINOM_RUNTIME_CLEANUP_FAILED/);
  assert.deepEqual(events,['abort','client','bridge','server','browser']);
 });
