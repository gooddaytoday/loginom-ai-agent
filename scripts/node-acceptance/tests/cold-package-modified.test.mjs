import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeSavedPackageStateCode} from '../../../packages/loginom-runtime/client/lib/package-persistence.mjs';
const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function recordColdPackageModified(');
const observe=new Function('return ('+source.slice(start).trim()+')')();
const options={sessionId:'s',documentId:'d',account:'own',packagePath:'/own/saved.lgp',loginomUrl:'https://example.invalid/app',loginomBuild:'7.4.2'};
for(const modified of [false,true])test('cold diagnostic only reads and preserves existing outcome: dirty='+modified,async()=>{
 const records=[],calls=[],native={modified};
 const execute=async code=>{
  calls.push(code);
  assert.match(code,/IsPackageModified/);
  assert.doesNotMatch(code,/SavePackage|ClosePackage|ExecuteNode|SetVariable|allow_dirty/);
  return {modified:native.modified,read_only:true,package_path:options.packagePath};
 };
 const original=()=>native.modified?'existing dirty refusal':'existing success';
 const before=original();
 for(const stage of ['after_open','after_observe'])await observe({execute,record:async e=>records.push(e),makeSavedPackageStateCode,options,stage});
 assert.equal(original(),before);
 assert.deepEqual(native,{modified});assert.equal(calls.length,2);
 assert.deepEqual(records.map(e=>[e.stage,e.modified,e.read_only,e.settings_applied]),[['after_open',modified,true,false],['after_observe',modified,true,false]]);
});
test('unavailable diagnostic cannot replace an existing success or refusal',async()=>{
 for(const mode of ['exception','unknown','wrong owner']){
  const records=[];
  await observe({execute:async()=>{if(mode==='exception')throw Error('private details');return {modified:mode==='unknown'?null:false,read_only:true,package_path:'/foreign.lgp'};},record:async e=>records.push(e),makeSavedPackageStateCode,options,stage:'after_open'});
  assert.equal(records[0].available,false);assert.equal(records[0].modified,null);
  assert.ok(!JSON.stringify(records).includes('private details'));
 }
});
test('cold observation brackets graph read before any settings or execution',()=>{
 const open=source.indexOf("stage:'after_open'"),graph=source.indexOf('let graph = await adapter.observe('),after=source.indexOf("stage:'after_observe'");
 assert.ok(source.indexOf('PACKAGE_PATH_MISMATCH')<open&&open<graph&&graph<after&&after<source.indexOf('if(expected.lgd'));
});
