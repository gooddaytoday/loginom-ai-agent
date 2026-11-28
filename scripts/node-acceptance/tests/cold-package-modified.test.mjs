import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeSavedPackageStateCode} from '../../../packages/loginom-runtime/client/lib/package-persistence.mjs';
import {verifyColdPackageFile} from '../cold-reader-policy.mjs';
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

test('deferred ports require the version of the file read under the reopened workspace owner',async()=>{
 const expected={mtime:'2026-11-28T00:00:00.000Z',size:100,hash:'a'.repeat(64)};
 const owner={origin:'https://example.invalid',build:'7.4.2',path:'/own/saved.lgp',tabTid:'owned-tab',
  documentId:'d',sessionId:'s',account:'own',token:'proof'};
 for(const [mode,reason] of [
  ['match',null],['mtime','CASE_PORT_OPENED_FILE_VERSION_CHANGED'],['size','CASE_PORT_OPENED_FILE_VERSION_CHANGED'],
  ['hash','CASE_PORT_OPENED_FILE_VERSION_CHANGED'],['absent','CASE_PORT_OPENED_FILE_VERSION_UNKNOWN'],
  ['release','CASE_PORT_OPENED_FILE_VERSION_UNKNOWN'],['missing reader','CASE_PORT_OPENED_FILE_VERSION_UNKNOWN'],
 ]){
  const native={fileExists:true,base64:'fixture bytes'};
  const observed={...expected};
  if(mode==='mtime')observed.mtime='2026-11-28T00:00:01.000Z';
  if(mode==='size')observed.size++;
  if(mode==='hash')observed.hash='b'.repeat(64);
  const calls=[];
  const load=async name=>{
   assert.equal(name,'client/lib/saved-package-graph.mjs');
   if(mode==='missing reader')throw Error('module unavailable');
   return {
    makeSavedPackageGraphCode:options=>{assert.deepEqual(options,owner);return 'read';},
    makeSavedPackageReleaseCode:token=>{assert.equal(token,owner.token);return 'release';},
    readSavedPackageFacts:async({response})=>{
     assert.deepEqual(JSON.parse(response.content[0].text),native);
     return mode==='absent'?{}:{evidence:{kind:'savedFileRead',scope:'package',file:observed}};
    },
   };
  };
  const execute=async code=>{calls.push(code);return code==='read'?native:{released:mode!=='release'};};
  const proof=await verifyColdPackageFile({load,execute,owner,expected});
  assert.deepEqual(calls,mode==='missing reader'?[]:['read','release']);
  assert.equal(proof.reason,reason,mode);
  assert.deepEqual(proof.file,['absent','release','missing reader'].includes(mode)?undefined:observed,mode);
 }
});
