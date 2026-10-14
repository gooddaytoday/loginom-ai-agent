import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {verifyPreservationColdPin} from '../../../../docs/node-development/nodes/field-parameters/acceptance/preservation-cold-preflight.mjs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {verifyStaticSourceBytes} from '../../../../scripts/node-acceptance/static-source-proof.mjs';
import {parseExpectedOutputs} from '../../../../scripts/node-acceptance/expected-outputs.mjs';
const base=new URL('../../../../docs/node-development/nodes/field-parameters/acceptance/',import.meta.url);
const template=JSON.parse(await readFile(new URL('fixtures/preservation/cold-source-template.json',base),'utf8'));
const bytes=await readFile(new URL('fixtures/preservation/rowid-ab-c.csv',base));
const valid=()=>{
 const expected=structuredClone(template),bindings={account:'offline_operator',package_path:'/offline_operator/preservation.lgp',source_path:'/offline_operator/rowid-ab-c.csv',fixture_path:'fixtures/preservation/rowid-ab-c.csv'};
 expected.package_path=bindings.package_path;expected.static_sources[0].source_path=bindings.source_path;
 return {expected,bindings,bytes};
};
test('full explicit pin is ready offline but grants no native source proof',()=>{
 const r=verifyPreservationColdPin(valid());assert.equal(r.pin_ready,true);assert.equal(r.native_source_verified,false);
});
for(const [name,mutate] of Object.entries({
 missing:v=>delete v.expected.static_sources,empty:v=>v.expected.static_sources=[],
 incomplete:v=>delete v.expected.static_sources[0].sha256,
 wrongBytes:v=>v.bytes=Buffer.concat([v.bytes,Buffer.from('x')]),
 wrongSize:v=>v.expected.static_sources[0].bytes=166,
 wrongSHA:v=>v.expected.static_sources[0].sha256='0'.repeat(64),
 missingFormat:v=>delete v.expected.static_sources[0].format.null_marker,
 wrongDelimiter:v=>v.expected.static_sources[0].format.delimiter=',',
 wrongNull:v=>v.expected.static_sources[0].format.null_marker='?',
 wrongEncoding:v=>v.expected.static_sources[0].encoding='UTF-16',
 UIProvenance:v=>v.expected.static_sources[0].provenance='observed_ui_values',
 outputProvenance:v=>v.expected.static_sources[0].provenance='output_generated',
 wrongReceipt:v=>v.expected.static_sources[0].required_receipt_provenance='model_receipt',
 wrongFixture:v=>v.bindings.fixture_path='fixtures/preservation/wide-130.csv',
 duplicate:v=>v.expected.static_sources.push(structuredClone(v.expected.static_sources[0])),
 foreignSource:v=>v.expected.static_sources[0].source_path='/foreign/rowid-ab-c.csv',
 foreignPackage:v=>v.bindings.package_path='/foreign/preservation.lgp',
 unresolved:v=>v.expected=structuredClone(template)
}))test('local preservation pin refuses '+name,()=>{const v=valid();mutate(v);assert.throws(()=>verifyPreservationColdPin(v));});

test('existing expected parser accepts template shape even without static_sources; local guard does not',()=>{
 const v=valid();assert.equal(parseExpectedOutputs(v.expected).outputs[0].rows.length,5);
 delete v.expected.static_sources;
 assert.equal(parseExpectedOutputs(v.expected).outputs[0].rows.length,5);
 assert.throws(()=>verifyPreservationColdPin(v),/static source required/);
});

// Independent source literal, distinct from four-column Reform expected output.
const importColumns=[
 {name:'RowID',label:'RowID',type:'integer'},
 {name:'A',label:'Same',type:'string'},
 {name:'B',label:'Same',type:'integer'},
 {name:'C',label:'Unused',type:'boolean'},
 {name:'Extra',label:'Unrequested',type:'string'},
];
for(const [name,mutate] of Object.entries({
 missing:v=>delete v.expected.static_sources[0].columns,
 partial:v=>v.expected.static_sources[0].columns.splice(3,1),
 order:v=>v.expected.static_sources[0].columns.reverse(),
 renamed:v=>v.expected.static_sources[0].columns[2].name='RenamedB',
 type:v=>v.expected.static_sources[0].columns[3].type='string',
 label:v=>v.expected.static_sources[0].columns[4].label='Changed',
 outputSchema:v=>v.expected.static_sources[0].columns=structuredClone(v.expected.outputs[0].columns),
}))test('local preservation pin refuses import schema '+name,()=>{
 const v=valid();mutate(v);assert.throws(()=>verifyPreservationColdPin(v),/complete literal import schema required/);
});
test('full literal source pin composes with unchanged cold helper using labelled storage/download doubles',async()=>{
 const v=valid();assert.equal(verifyPreservationColdPin(v).pin_ready,true);
 assert.deepEqual(v.expected.static_sources[0].columns,importColumns);
 assert.equal(v.expected.outputs[0].columns.length,4);
 const output=await mkdtemp(join(tmpdir(),'preservation-source-proof-'));
 const calls={storage:0,download:0,gestures:0};
 const snapshot={observation_id:'offline-obs',dom_epoch:{document:'offline-doc'},workflow_ref:{prefix:'MF'},
  file_storage:{status:'observed',directory:'/offline_operator'},ui:{elements:[
   {tid:'MF;FileStorageForm;root'},{tid:'MF;NavigationBar;NavigationPanel'},
   {label:'rowid-ab-c.csv',ref:{},storage_entry:{kind:'file',bytes_source:'native_file_store',bytes:167}}]}};
 const runtime={observe:async()=>{calls.storage++;return {status:'SUCCEEDED',output:snapshot};},
  uiAct:async()=>{calls.gestures++;throw Error('offline fixture forbids gestures');}};
 const load=async()=>({findNativeStorageRow:async()=>snapshot,makeArtifactDownloadCode:options=>options});
 const execute=async options=>{calls.download++;await writeFile(options.download_path,v.bytes);
  return {status:'SUCCEEDED',cleanup_complete:true,output:{download_completed:true}};};
 const sources={imports:[{configuration:{source:{source_path:v.bindings.source_path},format:v.expected.static_sources[0].format,output_mapping:{fields:structuredClone(importColumns)}}}]};
 try{
  const proofs=await verifyStaticSourceBytes({load,runtime,execute,sources,allowed:v.expected.static_sources,
   account:v.bindings.account,origin:'https://offline.invalid',output});
  const proof=proofs.get(v.bindings.source_path);assert.equal(proof.bytes,167);assert.equal(proof.sha256,'5f1b19c2d28d1548bdc287fff6e61fbaee72147753379a2aaa5e38d56dca72a3');
  assert.equal(proof.bytes_verified,true);assert.equal(proof.download_completion_verified,true);
  assert.equal(calls.download,1);assert.equal(calls.gestures,0);
  // Driver-issued provenance is synthetic, not independent native proof.
 }finally{await rm(output,{recursive:true,force:true});}
});

for(const [name,alternative] of [
 ['reversed source order',[...importColumns].reverse()],
 ['Reform output as source',[
  {name:'RowID',label:'RowID',type:'integer'},
  {name:'A',label:'Only A',type:'string'},
  {name:'RenamedB',label:'Same',type:'integer'},
  {name:'Extra',label:'Unrequested',type:'string'},
 ]],
])test('local preservation pin refuses output_orders '+name+' before helper or transport',async()=>{
 const v=valid();v.expected.static_sources[0].output_orders=[structuredClone(alternative)];
 assert.deepEqual(v.expected.static_sources[0].columns,importColumns);
 let helperCalls=0,downstreamLoads=0;
 await assert.rejects(async()=>{
  verifyPreservationColdPin(v);
  helperCalls++;
  await verifyStaticSourceBytes({load:async()=>{downstreamLoads++;throw Error('unexpected downstream helper load');}});
 },/PRESERVATION_COLD_PIN:output_orders forbidden/);
 assert.equal(helperCalls,0);assert.equal(downstreamLoads,0);
});
