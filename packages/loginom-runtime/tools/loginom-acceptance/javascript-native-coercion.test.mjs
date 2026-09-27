import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {javascriptCoercionIds} from './javascript-native-coercion-cases.mjs';
import {javascriptNativeFixture,javascriptNativeReadFixture} from './javascript-native-fixtures.mjs';
import {verifyNativeInputRead,verifyNativeInputFixture} from './javascript-native-input-contract.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripInput,verifyNativeRoundtripRead,verifyNativeRoundtripOutcome,verifyNativeRoundtripExecution} from './javascript-native-roundtrip-contract.mjs';

// Host-contract fixtures contain real encoded wire payloads; production adaptRead
// and decodeVariantFrame decode them. No conversion behavior is simulated.
function payload(type,value){
 const bytes=type==='string'?Buffer.from(value):null;
 const buffer=Buffer.alloc(bytes?16+bytes.length:10);
 buffer.writeInt16LE(value===null?1:type==='integer'?20:type==='real'?5:8);
 if(value!==null){
  if(type==='integer')buffer.writeBigInt64LE(BigInt(value),2);
  if(type==='real')buffer.writeDoubleLE(value,2);
  if(bytes){buffer.writeInt32LE(bytes.length,10);buffer.writeUInt16LE(65001,14);bytes.copy(buffer,16);}
 }
 return [...buffer];
}
function stages(id,value){
 const fixture=javascriptNativeFixture(id),probe=javascriptNativeRoundtripProbe(id);
 const owner={document_id:'d',workflow_id:'w',node_id:'js'};
 const imported={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'d:root:import',group_id:'import',process_id:'import.1',process_record_id:'import-record'};
 const executed={...imported,execution_id:'d:root:js',group_id:'js-group',process_id:'js-group.1',process_record_id:'js-record',
  trial:{phase:'initial',node_id:'js',source_sha256:probe.source_sha256},fresh_baseline:{node:owner,roots:[],root_id:'root'},
  launch_identity:{execution_id:'d:root:js',group_id:'js-group',root_id:'root',group_record_id:'js-group-record',node:owner}};
 const read=role=>{
  const output=role==='output',slice=javascriptNativeReadFixture(id,role);
  const binding={fixture_id:id,read_id:role,document_id:'d',workflow_id:'w',package_id:'pkg',node_id:output?'js':'input',port_guid:'output0',port:0,
   source:{owner:1,object:output?22:11},execution:{status:'completed',execution_id:(output?executed:imported).execution_id},completed_child:structuredClone(output?executed:imported),
   schema:[{name:'Value',label:'Value',type:slice.native_type}],row_count:1,
   ...(role==='input'?{}:{roundtrip_role:role,source_sha256:probe.source_sha256})};
  const encoded=payload(slice.type,output?value:fixture.values[0]);
  const raw={...structuredClone(binding),method:321,interface:116,owner_rechecked:true,cache_identity_rechecked:true,
   cells:[{row:0,column:0,message_id:1,tag:encoded[0],frame_size:Math.max(60,12+encoded.length),payload:encoded}]};
  const lifecycle={id:role,status:'completed',published:true,pending:0,retired:false,requests:1,releasedRequests:1,releasedResponses:1};
  return {binding,raw,lifecycle};
 };
 const before=read('input');
 const provenance={kind:'owned_import_read_phase',fixture_id:id,source:{sha256:fixture.sha256},node:{document_id:'d',workflow_id:'w',node_id:'input'},execution:imported};
 before.exact=verifyNativeInputRead(before.raw,{...before,provenance});
 const output=read('output'),upstream=read('upstream');
 for(const [role,proof]of Object.entries({output,upstream}))proof.exact=verifyNativeRoundtripRead(proof.raw,{...proof,input:before,role});
 return {before,output,upstream};
}
for(const [index,id]of javascriptCoercionIds.entries()){
 test(id+' pinned source/CSV and distinct role metadata',()=>{
  const f=javascriptNativeFixture(id),probe=javascriptNativeRoundtripProbe(id);
  assert.equal(probe.id,'native-'+id+'-coercion');assert.doesNotMatch(probe.id,/identity-copy/);
  assert.equal(probe.source_sha256,f.source_sha256);assert.equal(createHash('sha256').update(probe.source).digest('hex'),f.source_sha256);
  assert.equal(probe.source.trimEnd().split('\n').length,9);
  assert.deepEqual(probe.output_schema,[{name:'Value',label:'Value',type:4}]);
  assert.equal(javascriptNativeReadFixture(id,'output').type,'integer');
  assert.equal(javascriptNativeReadFixture(id,'input').type,f.type);assert.equal(javascriptNativeReadFixture(id,'upstream').type,f.type);
  verifyNativeInputFixture(readFileSync(new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/operator-only/'+f.file,import.meta.url)),id);
 });
 for(const value of [null,'0','-2','42','9007199254740993','9223372036854775807','-9223372036854775808'])test(id+' observes '+value+' without scalar oracle',()=>{
  const results=stages(id,value);
  verifyNativeRoundtripInput({node:{node_id:'input'},table:{port_guid:'output0'},native_input:{native:results.before}},id);
  const outcome=verifyNativeRoundtripOutcome(results,id);
  assert.equal(outcome.status,value===null?'integer_null_observed':'integer_value_observed');
  assert.equal(outcome.input_exact,true);assert.equal(outcome.upstream_exact,true);assert.equal(outcome.output_encoding_verified,true);
  assert.equal(outcome.exact_pass,false);assert.equal(outcome.characterization_only,true);assert.equal(outcome.g5_complete,false);
  assert.equal(outcome.general_integer_precision_guarantee,false);assert.equal(outcome.output_identity_exact,false);
  assert.equal(outcome.cells[0].value,value);
  if(value!==null)assert.equal(Buffer.from(outcome.cells[0].native.bytes_le,'hex').readBigInt64LE().toString(),value);
  if(value===null)assert.deepEqual(outcome.cells[0].native,{tag:1,encoding:'null'});
 });
 const mutations={
  'tag32':r=>{r.output.raw.cells[0].tag=r.output.raw.cells[0].payload[0]=3;},
  'tagReal':r=>{r.output.raw.cells[0].tag=r.output.raw.cells[0].payload[0]=5;},
  'schemaReal':r=>{r.output.raw.schema[0].type=r.output.binding.schema[0].type=3;},
  'schemaName':r=>{r.output.raw.schema[0].name=r.output.binding.schema[0].name='Other';},
  'count':r=>{r.output.raw.row_count=r.output.binding.row_count=2;},
  'missingCell':r=>{r.output.raw.cells=[];r.output.lifecycle.requests=r.output.lifecycle.releasedRequests=r.output.lifecycle.releasedResponses=0;},
  'truncatedBytes':r=>r.output.raw.cells[0].payload.pop(),
  'byteOutOfRange':r=>r.output.raw.cells[0].payload[2]=256,
  'wrongAddress':r=>r.output.raw.cells[0].column=1,
  'decimalBytesMismatch':r=>r.output.exact.cells[0].decimal='42',
  'noncanonicalDecimal':r=>{r.output.exact.cells[0].decimal=r.output.exact.cells[0].value='01';},
  'storedNativeBytes':r=>r.output.exact.cells[0].native.bytes_le='0000000000000000',
  'storedNullFlag':r=>r.output.exact.cells[0].is_null=true,
  'storedObservation':r=>r.output.exact.integer_characterization.exact_pass=true,
  'case':r=>r.output.binding.fixture_id=javascriptCoercionIds[(index+1)%7],
  'arbitraryCase':r=>r.output.binding.fixture_id='integer-coercion-custom',
  'sourceHash':r=>r.output.binding.source_sha256='0'.repeat(64),
  'executionSource':r=>r.output.binding.completed_child.trial.source_sha256='0'.repeat(64),
  'nativeSource':r=>r.output.raw.source.object++,
  'owner':r=>r.output.raw.node_id='foreign',
  'inputOwnerAsOutput':r=>{r.output.raw.node_id=r.output.binding.node_id='input';},
  'scope':r=>{r.output.raw.package_id=r.output.binding.package_id='foreign';},
  'oldExecution':r=>r.output.binding.completed_child.fresh_baseline.roots.push({process_id:'js-group'}),
  'failedExecution':r=>r.output.binding.completed_child.status='failed',
  'childMismatch':r=>r.output.binding.completed_child.execution_id='d:foreign',
  'ownerGuard':r=>r.output.raw.owner_rechecked=false,
  'cacheGuard':r=>r.output.raw.cache_identity_rechecked=false,
  'release':r=>r.output.lifecycle.releasedResponses=0,
  'pending':r=>r.upstream.lifecycle.pending=1,
  'changedInput':r=>r.before.raw.cells[0].payload[javascriptNativeFixture(id).type==='string'?16:2]^=1,
  'changedUpstream':r=>r.upstream.raw.cells[0].payload[javascriptNativeFixture(id).type==='string'?16:2]^=1,
  'upstreamNULL':r=>{r.upstream.raw.cells[0].tag=r.upstream.raw.cells[0].payload[0]=1;},
  'upstreamOwner':r=>{r.upstream.raw.node_id=r.upstream.binding.node_id='foreign';},
  'upstreamSource':r=>{r.upstream.raw.source.object=r.upstream.binding.source.object=99;},
  'upstreamChild':r=>r.upstream.binding.completed_child.process_record_id='new-record',
  'storedUpstream':r=>r.upstream.exact.cells[0].value='changed',
  'inputCase':r=>r.before.binding.fixture_id=javascriptCoercionIds[(index+1)%7],
 };
 for(const [name,mutate]of Object.entries(mutations))test(id+' refuses '+name,()=>{
  const results=stages(id,'9007199254740993');mutate(results);
  assert.throws(()=>verifyNativeRoundtripOutcome(results,id));
 });
 for(const [name,mutate]of Object.entries({
  schema:r=>{r.output.raw.schema[0].type=r.output.binding.schema[0].type=3;},
  storedBytes:r=>r.output.exact.cells[0].native.bytes_le='0000000000000000',
  storedZero:r=>r.output.exact.cells[0].value='0',
  nullTagMismatch:r=>r.output.raw.cells[0].tag=20,
 }))test(id+' NULL refuses '+name,()=>{
  const results=stages(id,null);mutate(results);assert.throws(()=>verifyNativeRoundtripOutcome(results,id));
 });
 test(id+' completed verifier refuses failed terminal',()=>{
  const results=stages(id,'0'),execution=results.output.binding.completed_child;execution.status='failed';
  assert.throws(()=>verifyNativeRoundtripExecution(execution,results.output.binding,id));
 });
}
