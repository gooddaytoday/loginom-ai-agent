import test from 'node:test';
import assert from 'node:assert/strict';
import { storagePath, storageDirectories, requireStorageDestination, storageTidSuffix, createStorageBinding, withStorageIdentity } from '../lib/storage-policy.mjs';
import vm from 'node:vm';

const directories = { packages: '/operator/Мои пакеты', inputs: '/operator/Данные', exports: '/operator/Результаты' };
test('explicit storage directories preserve user names and restrict each purpose', () => {
  assert.equal(requireStorageDestination('/operator/Результаты/Сводка, 1.csv', directories, 'exports'), '/operator/Результаты/Сводка, 1.csv');
  assert.equal(requireStorageDestination('/operator/Данные', directories, 'inputs', { directory: true }), directories.inputs);
  for (const path of ['/test-2/x.csv', '/operator/Результаты-extra/x.csv', '/operator/Данные/x.csv', '/operator/Результаты']) {
    assert.throws(() => requireStorageDestination(path, directories, 'exports'));
  }
  assert.throws(() => requireStorageDestination('/operator/Мои пакеты/result.csv', directories, 'packages'));
  assert.throws(() => requireStorageDestination('/operator/Результаты/result.lgp', directories, 'exports'));
});

test('native account/document changes stop browser work before its effect', async () => {
  const binding=createStorageBinding({sessionId:'session',origin:'http://loginom.local',build:'7.4.2',documentId:'doc',account:'operator',directories});
  const connection={Connected:true,UserName:'operator'}, globals={location:{origin:'http://loginom.local'},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection}}}}}},__loginomDockPreparationV1:{id:'doc'}};
  let effects=0;
  const page={evaluate:async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(input)',{...globals,input:arg}),effect:()=>++effects};
  const run=vm.runInNewContext('('+withStorageIdentity('async page=>page.effect()',binding)+')');
  assert.equal(await run(page),1);
  connection.Connected=false;await assert.rejects(run(page),/connection is disconnected/);
  connection.Connected=true;
  connection.UserName='someone-else';await assert.rejects(run(page),/account or document changed/);
  connection.UserName='operator';globals.__loginomDockPreparationV1.id='new-doc';await assert.rejects(run(page),/account or document changed/);
  assert.equal(effects,1);
});
test('storage paths reject traversal, ambiguous escaping and broad root grants', () => {
  for (const path of ['/', 'relative', '/a/', '/a//b', '/a/../b', '/a/./b', '/a/%2e%2e/b', '/a\\b', '/a/?x', '/a/#x', '/ a/b', '/a /b', '/a/\nname']) {
    assert.throws(() => storagePath(path), path);
  }
  assert.throws(() => storageDirectories({ ...directories, arbitrary: '/' }));
  assert.throws(() => storageDirectories({ packages: '/operator' }));
});
test('native storage selectors require exact labels in addition to converted suffixes', () => {
  assert.equal(storageTidSuffix('Мои данные, 1.csv'), 'Мои_данные_1.csv');
  assert.equal(storageTidSuffix('a b'), storageTidSuffix('a_b'));
  assert.throws(() => storageTidSuffix('a/b'));
});
test('storage binding records observed account independently of the selected directory', () => {
  const binding = createStorageBinding({ sessionId: 'dock-session', origin: 'http://loginom.local', build: '7.4.2',
    documentId: 'document', account: 'different-account-name', directories });
  assert.equal(binding.loginom_account, 'different-account-name');
  assert.deepEqual(binding.directories, directories);
  assert.ok(Object.isFrozen(binding) && Object.isFrozen(binding.directories));
  assert.throws(() => createStorageBinding({ sessionId: 's', origin: 'http://loginom.local/path', build: '7.4.2', documentId: 'd', account: 'a', directories }));
});

test('folder listing scrolls virtual Files rows to the native count and reports truncation honestly',async()=>{
 const {listStorageDirectory}=await import('../lib/storage-policy.mjs');
 const prefix='MF;TF-1',dir='/in/Silent Talk/customers',names=Array.from({length:6},(_,i)=>'part'+i+'.csv');
 const make=(native)=>{
  let top=0;const acts=[];
  const state=()=>{const first=Math.floor(top/100);return {observation_id:'obs-'+top,workflow_ref:{prefix},file_storage:{status:'observed',directory:dir},
   ui:{elements:names.slice(first,first+2).map((name,i)=>({bounding_box:{x:0,y:i*100,width:100,height:100},tid:prefix+';FileStorageForm;colName_'+name,label:name,allowed_actions:['scroll'],
    interaction:{state:'point_observed'},scroll:{ref:'grid',top,max_top:400},storage_entry:{kind:'file',path:dir+'/'+name,bytes:1,mtime:'t',
     server_source_ref:'storage-'+name,...(native?{directory_entries:native}:{})}}))}};};
  return {acts,options:{destination:dir,pattern:'*.csv',guard:()=>{},ready:async probe=>probe(),
   roots:async()=>({observation_id:'roots',workflow_ref:{prefix},ui:{elements:[{tid:prefix+';FileStorageForm;pnlFileStorage;tbl',ref:'ui-table'}]}}),
   read:async()=>state(),act:async(s,e,verb,extra)=>{acts.push([verb,extra.delta_y]);top+=extra.delta_y;}}};
 };
 let f=make(6),out=await listStorageDirectory(f.options);
 assert.deepEqual(out.entries.map(e=>e.name),names);assert.equal(out.complete,true);assert.equal(out.files_matched,6);
 assert.deepEqual(f.acts,[['scroll',100],['scroll',100],['scroll',100],['scroll',100]]);
 // Without a native count, only the scroll end proves completeness.
 f=make(null);out=await listStorageDirectory(f.options);
 assert.equal(out.complete,true);assert.equal(out.native_entry_count,null);assert.equal(out.entries.length,6);
 // A larger native count than the rows reachable is never reported complete.
 f=make(9);out=await listStorageDirectory(f.options);
 assert.equal(out.complete,false);assert.equal(out.entries.length,6);
});

test('folder listing bounds the serialized response in UTF-8 bytes for Cyrillic names (LAB-1468 P2)',async()=>{
 const {listStorageDirectory}=await import('../lib/storage-policy.mjs');
 const prefix='MF;TF-1',dir='/вход/Сайлент Ток/транзакции_клиентов',names=Array.from({length:65},(_,i)=>'Выгрузка_операций_клиентов_за_период_'+String(i).padStart(2,'0')+'.csv');
 const state={observation_id:'obs',workflow_ref:{prefix},file_storage:{status:'observed',directory:dir},
  ui:{elements:names.map(name=>({tid:prefix+';FileStorageForm;colName_'+name,label:name,allowed_actions:[],
   storage_entry:{kind:'file',path:dir+'/'+name,bytes:1048576,mtime:'2026-11-12T22:34:51.000Z',server_source_ref:'storage-00000000-0000-4000-8000-'+String(names.indexOf(name)).padStart(12,'0'),directory_entries:65}}))}};
 const out=await listStorageDirectory({destination:dir,pattern:'*.csv',guard:()=>{},ready:async probe=>probe(),
  roots:async()=>({observation_id:'roots',workflow_ref:{prefix},ui:{elements:[{tid:prefix+';FileStorageForm;pnlFileStorage;tbl',ref:'ui-table'}]}}),
  read:async()=>structuredClone(state),act:async()=>assert.fail('no scroll')});
 // The executor envelope around output, with the longest allowed operation_id.
 const reply={result_version:'user-v1',operation_id:'x'.repeat(128),status:'SUCCEEDED',action_key:'storage.list',cleanup_complete:true,effect_possible:true,output:out};
 assert.ok(Buffer.byteLength(JSON.stringify(reply))<=24000,'reply '+Buffer.byteLength(JSON.stringify(reply))+' B');
 assert.equal(out.truncated,true);assert.equal(out.complete,true);assert.equal(out.files_matched,65);
 assert.ok(out.entries.length>0&&out.entries.length<65);
 assert.deepEqual(out.entries.map(e=>e.name),names.slice(0,out.entries.length));
});
