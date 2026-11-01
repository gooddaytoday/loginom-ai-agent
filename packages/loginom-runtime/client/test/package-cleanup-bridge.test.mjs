import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('package cleanup preserves the bridge shutdown contract',async()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  let result;
  try{result=await promisify(execFile)(process.execPath,['--experimental-test-module-mocks','--test',fileURLToPath(new URL('./support/package-cleanup-bridge.mjs',import.meta.url))],{env,timeout:240000});}
  catch(error){assert.fail(String(error.stdout)+'\n'+String(error.stderr));}
  assert.match(result.stdout,new RegExp('pass '+(env.LOGINOM_DOCK_TEST_BROWSER?105:98)+'\\b'));assert.match(result.stdout,/fail 0/);
});
