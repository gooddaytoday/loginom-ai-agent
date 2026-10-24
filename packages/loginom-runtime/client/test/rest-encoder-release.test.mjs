import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const fault of ['safe','opening-unknown','done-unknown','transport','receipt','owner','ack'])
 test('REST child encoder release preserves uncertainty: '+fault,()=>{
  const result=spawnSync(process.execPath,['--experimental-test-module-mocks',
   fileURLToPath(new URL('./support/rest-encoder-release.mjs',import.meta.url)),fault],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined,String(result.error));assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 });
