import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const helper=process.env.STARTUP_SOURCE??fileURLToPath(new URL('../../../packages/loginom-runtime/src/connection-check.mjs',import.meta.url));
const sdk=process.env.PLAYWRIGHT_SDK_BUNDLE;if(!sdk)throw Error('EXPLICIT_PINNED_PLAYWRIGHT_SDK_BUNDLE_REQUIRED');
for(const mode of ['foreign-event','reuse','foreign-wrapper'])test('real SDK emitter/owned observer lifetime: '+mode,async()=>{
 const out=await mkdtemp(join(tmpdir(),'replacement-sdk-boundary-'));
 try{
  const probe=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/replacement-observer-lifetime.mjs',import.meta.url)),fileURLToPath(new URL('../replacement-live.mjs',import.meta.url)),helper,out,mode,sdk],{encoding:'utf8',timeout:15000});
  assert.equal(probe.status,0,probe.stderr);const result=JSON.parse(await readFile(join(out,'result.json')));
  if(mode==='foreign-event'){assert.equal(result.event_handled_without_process_crash,true);assert.equal(result.owner_retained,true);assert.equal(result.context_close_calls,0);}
  else if(mode==='reuse'){assert.equal(result.first_closed,true);assert.equal(result.second_context_retained,true);assert.equal(result.second_close_calls,1);}
  else assert.equal(result.foreign_instrumentation_preserved,true);
 }finally{await rm(out,{recursive:true,force:true});}
});
