import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerSourceRegistry} from '../lib/storage-policy.mjs';
import {verifyTextImportSource,verifyImportRowCount,verifyFullImportCount,importSchemaSnapshot,verifyImportSchema,validateTextImportNodeParameters,createTextImportNodeSupport} from '../lib/text-import-node.mjs';
import {importSourceSchema} from '../lib/storage-policy.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const binding=()=>({session_id:'session',document_id:'doc',origin:'https://app.loginom.ai',loginom_build:'7.4.2',loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}});
const observed=()=>({status:'SUCCEEDED',output:{file_storage:{status:'observed',directory:'/worker'},ui:{elements:[{storage_entry:{kind:'file',path:'/worker/full.csv',bytes:2148532259,bytes_source:'native_file_store',mtime:'2026-10-28T00:00:00.000Z'}}]}}});
test('server source phase survives the actual redacted journal ACK without changing its witness',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'source-journal-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const registry=createServerSourceRegistry({getBinding:binding}),state=observed();registry.retain(state);
 const ref=state.output.ui.elements[0].storage_entry.server_source_ref;
 const p={source:{kind:'storage',server_source_ref:ref},settings:{source:{source_path:'/worker/full.csv'}},preview_only:true};
 const driver=createTextImportNodeSupport({}).nodeApplyDriverFactory({operation:{parameters:{parameters:p}},
  resolveStorageSource:async()=>registry.resolve(ref,observed()),execute:async()=>assert.fail('source phase must only read')});
 const value=await driver.verifySource(p),event={operation_id:'preview',phase:'node_phase_completed',receipt:{phase:'source',value}};
 const record=createExecutionJournal({directory,metadata:{sessionId:'session'}});
 const saved=await record(event);
 assert.deepEqual(saved.receipt,event.receipt);
 assert.equal(saved.receipt.value.source.bytes,2148532259);
 assert.equal(saved.receipt.value.source.server_source_ref,ref);
 assert.equal(registry.peek(ref).binding.origin,'https://app.loginom.ai');
});
test('storage source is opaque, account bound and contains native size/time, never an upload ID',()=>{
 const current=binding();const registry=createServerSourceRegistry({getBinding:()=>current});const state=observed();
 registry.retain(state);const ref=state.output.ui.elements[0].storage_entry.server_source_ref;
 assert.ok(ref);const proof=registry.resolve(ref,observed());
 const result=verifyTextImportSource({source:{kind:'storage',server_source_ref:ref},settings:{source:{source_path:'/worker/full.csv'}}},[],undefined,proof);
 assert.equal(result.source.bytes,2148532259);assert.equal(result.source.kind,'storage');
 assert.equal(result.source.coverage,'preview');assert.equal(result.source.sha256,undefined);
 assert.equal(result.source.upload_operation_id,undefined);
 current.loginom_account='foreign';assert.throws(()=>registry.resolve(ref,observed()),/LOGINOM_FILE_CHANGED/);
});
test('storage source refuses invented refs, paths, native size/time drift and wrong roots',()=>{
 const registry=createServerSourceRegistry({getBinding:binding});const state=observed();registry.retain(state);
 const ref=state.output.ui.elements[0].storage_entry.server_source_ref;
 assert.throws(()=>registry.resolve('invented',observed()),/source/);
 for(const [key,value] of [['bytes',1],['mtime','2026-10-29T00:00:00.000Z'],['path','/other/full.csv']]){
  const next=observed();next.output.ui.elements[0].storage_entry[key]=value;
  assert.throws(()=>registry.resolve(ref,next),/LOGINOM_FILE_CHANGED/);
 }
 assert.throws(()=>verifyTextImportSource({source:{kind:'storage',server_source_ref:'fake'},settings:{source:{source_path:'/worker/full.csv'}}},[]),/source/);
 const outside=observed();outside.output.ui.elements[0].storage_entry.path='/foreign/full.csv';registry.retain(outside);
 assert.equal(outside.output.ui.elements[0].storage_entry.server_source_ref,undefined);
});

test('unchanged native source keeps its opaque ref across observation page refreshes',()=>{
 const registry=createServerSourceRegistry({getBinding:binding}),first=observed(),fresh=observed();
 registry.retain(first);registry.retain(fresh);
 assert.equal(fresh.output.ui.elements[0].storage_entry.server_source_ref,first.output.ui.elements[0].storage_entry.server_source_ref);
 fresh.output.ui.elements[0].storage_entry.mtime='changed';registry.retain(fresh);
 assert.notEqual(fresh.output.ui.elements[0].storage_entry.server_source_ref,first.output.ui.elements[0].storage_entry.server_source_ref);
});
test('storage revalidation discovers roots then reads the exact native row, since roots contain no FileStore proof',async()=>{
 const registry=createServerSourceRegistry({getBinding:binding}),state=observed();registry.retain(state);
 const ref=state.output.ui.elements[0].storage_entry.server_source_ref,calls=[];
 const roots={status:'SUCCEEDED',output:{workflow_ref:{prefix:'MF;TF-2'},ui:{elements:[{ref:'ui-file',tid:'MF;TF-2;FileStorageForm;colName_full.csv',kind:'region'}]}}};
 const proof=await registry.inspect(ref,async options=>{calls.push(options);return options.discover_roots?roots:observed();});
 assert.equal(proof.destination,'/worker/full.csv');assert.equal(proof.bytes,2148532259);
 assert.deepEqual(calls,[{discover_roots:true,storage_name:'full.csv'},{root_ref:'ui-file'}]);
 const duplicate=structuredClone(roots);duplicate.output.ui.elements.push(duplicate.output.ui.elements[0]);
 await assert.rejects(registry.inspect(ref,async()=>duplicate),/LOGINOM_FILE_CHANGED/);
 await assert.rejects(registry.inspect(ref,async options=>options.discover_roots?roots:{status:'NOT_APPLIED',output:{}}),/LOGINOM_FILE_CHANGED/);
});
test('full count requires completed import port metadata, refuses grid/buffer/group counts and mismatch',()=>{
 const execution={verified:true,owner_verified:true,status:'completed',execution_id:'full'};
 const output={port:0,fresh:true,execution_id:'full',freshness_basis:'completed_execution_port_source',row_count:7692308,sample_rows:25};
 assert.equal(verifyImportRowCount(7692308,output,execution).actual_records,7692308);
 for(const change of [p=>p.row_count=1000000,p=>p.freshness_basis='grid',p=>p.execution_id='old',p=>p.port=1]){
  const changed=structuredClone(output);change(changed);
  assert.throws(()=>verifyImportRowCount(7692308,changed,execution),/LOGINOM_ROW_COUNT/);
 }
 assert.throws(()=>verifyImportRowCount(7692308,output,{...execution,status:'running'}),/LOGINOM_ROW_COUNT/);
});

test('source discriminator rejects model paths and accepts verified delivery larger than 16 MiB',()=>{
 for(const s of [{kind:'storage',server_source_ref:'storage-a'},{kind:'verified_delivery',artifact_id:'a',upload_operation_id:'u'},
   {artifact_id:'a',upload_operation_id:'u',bytes:2148532259}])assert.doesNotThrow(()=>validateActionParameters(importSourceSchema,s));
 for(const s of ['/worker/full.csv',{kind:'storage',source_path:'/worker/full.csv'},{kind:'storage',server_source_ref:'a',artifact_id:'a'}])
  assert.throws(()=>validateActionParameters(importSourceSchema,s));
 const bytes=2148532259,sha256='a'.repeat(64),destination='/worker/full.csv';
 const uploaded={operation_id:'u',artifact:{artifact_id:'a',bytes,sha256},outcome:{operation_id:'u',action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,
  output:{artifact_id:'a',destination,bytes,sha256,server_copy_verification:{verification_id:'v',status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,destination,bytes,sha256}}}};
 const p={source:{kind:'verified_delivery',artifact_id:'a',upload_operation_id:'u'},settings:{source:{source_path:destination}}};
 assert.equal(verifyTextImportSource(p,[uploaded]).source.bytes,bytes);
 uploaded.outcome.output.server_copy_verification.bytes--;assert.throws(()=>verifyTextImportSource(p,[uploaded]),/do not match/);
});
test('source switch admission rejects model-supplied expected N, column, format, mapping and new-node mutations',()=>{
 const p={source:{kind:'storage',server_source_ref:'storage-a'},settings:{source:{source_path:'/worker/full.csv'}},
  source_switch:{profile_id:'profile-a',save_operation_id:'saved'}};
 const r={target:{kind:'existing'},finish:'execute',read:{ports:[0]},mappings:[],inputs:[]};
 assert.doesNotThrow(()=>validateTextImportNodeParameters(p,'delimited',r));
 for(const change of [p=>p.settings.columns=[{name:'A',label:'A'}],p=>p.settings.format={delimiter:';'},p=>p.source_switch.expected_records=7692308]){
  const next=structuredClone(p);change(next);assert.throws(()=>validateTextImportNodeParameters(next,'delimited',r));
 }
 assert.throws(()=>validateTextImportNodeParameters(p,'delimited',{...r,target:{kind:'new'}}));
 assert.throws(()=>validateTextImportNodeParameters(p,'delimited',{...r,mappings:[{direction:'output',port:0}]}));
});
test('storage source driver never queries upload receipts or sends upload bytes',async()=>{
 const registry=createServerSourceRegistry({getBinding:binding}),state=observed();registry.retain(state);
 const ref=state.output.ui.elements[0].storage_entry.server_source_ref;
 const p={source:{kind:'storage',server_source_ref:ref},settings:{source:{source_path:'/worker/full.csv'}}};
 const support=createTextImportNodeSupport({});
 const driver=support.nodeApplyDriverFactory({operation:{parameters:{parameters:p}},verifiedUploads:()=>assert.fail('storage has no uploads'),
  resolveStorageSource:async value=>registry.resolve(value,observed()),execute:async()=>assert.fail('no source mutation')});
 assert.equal((await driver.verifySource(p)).source.destination,'/worker/full.csv');
});
test('schema verification covers every column attribute, order, parsing and output mapping',()=>{
 const field={index:0,name:'A',label:'Amount',type:'real',data_kind:'Непрерывный',used:true};
 const group=values=>({fields:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',truncated:false,value}]))});
 const snapshot=importSchemaSnapshot({source:group({source_path:'/worker/sample.csv',encoding:'1251'}),format:group({delimiter:';',decimal_separator:','}),columns:[field],
  mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,source_fields:[field],target_fields:[{...field,name:'Renamed',source:field}]}});
 assert.equal(verifyImportSchema(snapshot,structuredClone(snapshot)),true);
 for(const change of [s=>s.columns[0].name='New',s=>s.columns[0].label='Other',s=>s.columns[0].type='string',s=>s.columns[0].used=false,
  s=>s.columns[0].data_kind='Дискретный',s=>s.columns[0].index=1,s=>s.mapping.target_fields[0].name='A',s=>s.mapping.autosync=true,
  s=>s.mapping.target_fields[0].source.name='Other',s=>s.format.decimal_separator='.',s=>s.source.encoding='65001']){
  const after=structuredClone(snapshot);change(after);assert.throws(()=>verifyImportSchema(snapshot,after),/LOGINOM_IMPORT_SCHEMA_CHANGED/);
 }
});

test('full N uses only a private exact scan bound to verified source bytes and digest',()=>{
 const execution={verified:true,owner_verified:true,status:'completed',execution_id:'full'};
 const output={port:0,fresh:true,execution_id:'full',freshness_basis:'completed_execution_port_source',row_count:17};
 const source={kind:'verified_delivery',bytes:100,sha256:'a'.repeat(64)};
 const receipt={basis:'backend_exact_scan',profile_id:'p',records:17,bytes:100,sha256:source.sha256,
   identity:{canonical_path:'/private/full.csv',size:100,file_id:'1:2'}};
 assert.equal(verifyFullImportCount('p',receipt,source,output,execution).status,'verified');
 for(const r of [undefined,{...receipt,profile_id:'foreign'},{...receipt,sha256:'b'.repeat(64)},
   {...receipt,bytes:101},{...receipt,basis:'model'},{...receipt,identity:{}}]){
   const result=verifyFullImportCount('p',r,source,output,execution);
   assert.equal(result.status,'not_verified');assert.equal(result.message,'N не сверено');assert.ok(result.reason);
   assert.equal(result.expected_records,undefined);
 }
 assert.equal(verifyFullImportCount('p',receipt,{kind:'storage',bytes:100},output,execution).status,'not_verified');
 assert.throws(()=>verifyFullImportCount('p',receipt,source,{...output,row_count:18},execution),/ROW_COUNT_MISMATCH/);
});

test('server full N accepts only the cache binding to the same native storage ref and exact copy',()=>{
 const identity={canonical_path:'/private/cache/full.csv',size:3,file_id:'1:2'};
 const receipt={basis:'backend_exact_scan',profile_id:'p',records:17,bytes:3,sha256:'a'.repeat(64),identity};
 const source={kind:'storage',server_source_ref:'storage-one',bytes:3,mtime:'native-time',sha256:receipt.sha256,
  cache_binding:{server_source_ref:'storage-one',native_size:3,native_mtime:'native-time',copy_bytes:3,identity}};
 const execution={verified:true,owner_verified:true,status:'completed',execution_id:'full'};
 const output={port:0,fresh:true,execution_id:'full',freshness_basis:'completed_execution_port_source',row_count:17};
 assert.equal(verifyFullImportCount('p',receipt,source,output,execution).status,'verified');
 for(const patch of [{server_source_ref:'other'},{native_size:4},{native_mtime:'changed'},{copy_bytes:4},{identity:{...identity,file_id:'1:3'}}])
  assert.equal(verifyFullImportCount('p',receipt,{...source,cache_binding:{...source.cache_binding,...patch}},output,execution).status,'not_verified');
});

test('server source switch refuses a refreshed changed file before opening or executing the import',async()=>{
 const parameters={source:{kind:'storage',server_source_ref:'new-ref'},settings:{source:{source_path:'/worker/full.csv'}},
  source_switch:{profile_id:'p',save_operation_id:'saved'}};
 const receipt={basis:'backend_exact_scan',profile_id:'p',records:17,bytes:3,sha256:'a'.repeat(64),
  identity:{canonical_path:'/private/cache/full.csv',size:3,file_id:'1:2'}};
 const proof={verified:true,kind:'storage',server_source_ref:'new-ref',destination:'/worker/full.csv',bytes:4,mtime:'changed',coverage:'preview'};
 const support=createTextImportNodeSupport({});
 const driver=support.nodeApplyDriverFactory({operation:{parameters:{parameters}},scanReceipt:receipt,
  resolveStorageSource:async()=>proof,verifySourceSwitchSave:()=>({verified:true}),
  execute:async()=>assert.fail('Changed storage source must refuse before any wizard or Execute call')});
 await assert.rejects(driver.verifySource(parameters),/unchanged|changed|cache/i);
 Object.assign(proof,{bytes:3,mtime:'original',sha256:receipt.sha256,cache_binding:{server_source_ref:'new-ref',
  native_size:3,native_mtime:'original',copy_bytes:3,identity:receipt.identity}});
 assert.equal((await driver.verifySource(parameters)).source.sha256,receipt.sha256);
 const missing=support.nodeApplyDriverFactory({operation:{parameters:{parameters}},resolveStorageSource:async()=>proof,
  verifySourceSwitchSave:()=>({verified:true}),execute:async()=>assert.fail('No scan means no browser mutation')});
 await assert.rejects(missing.verifySource(parameters),/EXACT_SCAN_REQUIRED/);
});
