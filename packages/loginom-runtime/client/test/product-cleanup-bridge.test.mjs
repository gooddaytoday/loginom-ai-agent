import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('product cleanup preserves the bridge shutdown contract',async()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  let result;
  try{result=await promisify(execFile)(process.execPath,['--experimental-test-module-mocks','--test-reporter=tap','--test',fileURLToPath(new URL('./support/product-cleanup-bridge.mjs',import.meta.url))],{env,timeout:30000});}
  catch(error){assert.fail(String(error.stdout)+'\n'+String(error.stderr));}
  assert.match(result.stdout,/ok 11 - guarded pending close retries only after the same owner operation settles/);
  assert.match(result.stdout,/ok 14 - bridge original drain: metadata-drift/);
  assert.match(result.stdout,/ok 18 - shutdown save-only recovery: unconfirmed-save/);
  assert.match(result.stdout,/pass 18/);assert.match(result.stdout,/fail 0/);
});
