import {createJavascriptMetadataLifecycle} from './javascript-native-metadata.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {javascriptNativeFixture,javascriptNativeReadFixture} from './javascript-native-fixtures.mjs';
import {nativeInputProvenance,verifyNativeInputRead,verifyNativeInputFixture,verifyNativeInputUi} from './javascript-native-input-contract.mjs';
import {verifyNativeRoundtripInput,verifyNativeRoundtripRead,verifyNativeRoundtripOutcome,javascriptNativeRoundtripProbe} from './javascript-native-roundtrip-contract.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {sourceEvidence} from './javascript-native-input.test.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
const ids=['cardinality-keep2','cardinality-odd','cardinality-duplicate'];
const canonical=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/operator-only/typed-cases.json',import.meta.url))).cases.find(c=>c.id==='cardinality');
const clone=x=>structuredClone(x);
const sharedPortGuid='58f7e6c3-511e-39d7-8853-036e0a1a7612';
async function stages(id,options={}){
 const x=await roundtrip({fixtureId:id,sharedPortGuid,...options}),binding={...x.f.b,read_id:'before'},lifecycle={...clone(x.f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
 const provenance=nativeInputProvenance(sourceEvidence(id));
 const before={binding,raw:x.before,lifecycle,exact:verifyNativeInputRead(x.before,{binding,lifecycle,provenance})},results={before};
 const read=async role=>{
  const binding=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,binding,decodeVariantFrame,{operationId:role}),lifecycle=await javascriptNativeRoundtripStatus(x.f.page);
  const expected={...binding,read_id:role};
  return results[role]={binding:expected,raw,lifecycle,exact:verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input:before,role})};
 };
 return {x,results,read};
}
for(const [index,id]of ids.entries()){
 test(id+' fixed independent input/output oracles and source execution order',()=>{
  const f=javascriptNativeFixture(id),output=javascriptNativeReadFixture(id,'output');
  assert.deepEqual(f.values,canonical.input_rows.map(String));assert.deepEqual(output.values,canonical.cases[index].expected_ids.map(String));
  assert.deepEqual(f.output_input_rows.map(i=>f.values[i]),output.values);assert.equal(output.rows,output.values.length);
  verifyNativeInputFixture(readFileSync(new URL('./fixtures/'+f.file,import.meta.url)),id);
  const rows=[],source=javascriptNativeRoundtripProbe(id).source.replace(/^import[^\n]+\n/,'');
  vm.runInNewContext(source,{InputTable:{RowCount:3,Get:(r,name)=>{assert.equal(name,'Value');return [1,2,3][r];}},
   DataType:{Integer:4},OutputTable:{AssignColumns:fields=>assert.equal(JSON.stringify(fields),'[{"Name":"Value","DataType":4}]'),Append:()=>rows.push(null),Set:(name,value)=>{assert.equal(name,'Value');assert.ok(rows.length);rows[rows.length-1]=value;}}});
  assert.deepEqual(rows,canonical.cases[index].expected_ids);
  assert.throws(()=>{f.output_input_rows[0]=99;});assert.throws(()=>{output.expected_bytes[0]='00';});
  assert.equal(javascriptNativeReadFixture(id,'upstream').rows,3);
 });
 test(id+' full serialized count/order/bytes and unchanged upstream with same port GUID',async()=>{
  const s=await stages(id),f=javascriptNativeFixture(id);
  verifyNativeRoundtripInput({node:{node_id:'n'},table:{port_guid:sharedPortGuid},native_input:{native:s.results.before}},id);
  await s.read('output');await s.read('upstream');
  const outcome=verifyNativeRoundtripOutcome(s.results,id);
  assert.equal(outcome.status,'fixed_cardinality_observed');assert.equal(outcome.exact_pass,true);assert.equal(outcome.output_identity_exact,false);assert.equal(outcome.output_case_exact,true);assert.equal(outcome.g5_complete,false);
  assert.deepEqual(outcome.input_row_map,f.output_input_rows);assert.equal(outcome.output_rows,f.output_rows);
  assert.deepEqual(clone(s.results.output.exact.cells.map(c=>c.value)),f.output_values);
  assert.deepEqual(clone(s.results.upstream.exact.cells.map(c=>c.value)),['1','2','3']);
  assert.deepEqual(s.x.f.counters,{sent:6+f.output_rows,requests:6+f.output_rows,responses:6+f.output_rows});
  assert.equal(s.results.output.lifecycle.requests,f.output_rows);assert.equal(s.results.upstream.lifecycle.requests,3);
  assert.equal(s.results.before.binding.port_guid,s.results.output.binding.port_guid);assert.notEqual(s.results.before.binding.node_id,s.results.output.binding.node_id);
  const frozen=freezeCivilEvidence(clone(s.results.before));assert.throws(()=>{frozen.raw.cells[0].payload[2]=7;});
  for(const role of ['output','upstream'])await assert.rejects(()=>s.x.bind(role),/already reserved/);
 });
 for(const [name,mutate]of Object.entries({
  'wrong row map':r=>r.output.exact.input_row_map.reverse().push(99),
  'wrong ordered bytes':r=>{r.output.raw.cells[0].payload[2]=3;},
  'wrong count':r=>r.output.raw.row_count++,
  'cross case':r=>r.output.binding.fixture_id=ids[(index+1)%3],
  'source script':r=>r.output.binding.source_sha256='0'.repeat(64),
  'native source':r=>r.output.raw.source={...r.output.raw.source,object:r.output.raw.source.object+1},
  'foreign node':r=>r.output.raw.node_id='foreign',
  'same input node':r=>{r.output.binding.node_id=r.output.raw.node_id='n';},
  'foreign scope':r=>{r.output.binding.package_id=r.output.raw.package_id='foreign';},
  'stale execution':r=>r.output.binding.completed_child.fresh_baseline.roots=[{process_id:r.output.binding.completed_child.group_id}],
  'cache guard':r=>r.output.raw.cache_identity_rechecked=false,
  'owner guard':r=>r.output.raw.owner_rechecked=false,
  'output lifecycle uses input count':r=>{r.output.lifecycle.requests=r.output.lifecycle.releasedRequests=r.output.lifecycle.releasedResponses=3;},
  'upstream lifecycle uses output count':r=>{r.upstream.lifecycle.requests=r.upstream.lifecycle.releasedRequests=r.upstream.lifecycle.releasedResponses=javascriptNativeFixture(id).output_rows;},
  'changed upstream':r=>r.upstream.raw.cells[0].payload[2]=9,
  'foreign upstream child':r=>r.upstream.binding.completed_child.execution_id='foreign',
  'baseline raw mutation':r=>r.before.raw.cells[0].decoded={untrusted:true},
  'baseline hash mutation':r=>r.before.exact.native_baseline_sha256='0'.repeat(64),
  'baseline stored exact mutation':r=>r.before.exact.cells[0].native.bytes_le='0000000000000000',
 }))test(id+' final verifier rejects '+name,async()=>{
  const s=await stages(id);await s.read('output');await s.read('upstream');mutate(s.results);
  assert.throws(()=>verifyNativeRoundtripOutcome(s.results,id));
 });
 test(id+' upstream gate refuses incorrect output release count before new binding',async()=>{
  const s=await stages(id);await s.read('output');
  s.x.f.env.__loginomJavascriptNativeRoundtripReadV1.last.releasedResponses=3;
  await assert.rejects(()=>s.x.bind('upstream'),/Completed output read required/);
 });
 test(id+' output reader rejects supplied input count instead of fixed role count before dispatch',async()=>{
  const s=await stages(id),binding=await s.x.bind('output');binding.rows=binding.row_count=3;
  await assert.rejects(()=>readJavascriptNativeRoundtrip(s.x.f.page,binding,decodeVariantFrame,{operationId:'output'}));assert.equal(s.x.f.counters.sent,3);
 });
 for(const mode of ['pass','bad-ack','bad-lifecycle'])test(id+' production role lifecycle and final ACK '+mode,async()=>{
  const s=await stages(id);await s.read('output');await s.read('upstream');const events=[];
  const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    async readNativeRoundtrip(input,node,execution) {'),end=source.indexOf('    async readNativeCivil(',start);
  const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
   nativeTelemetryCaseId:undefined,nativeCalibrationId:undefined,nativeNamedCaseId:undefined,nativeFixtureId:id,nativeInputFixture:javascriptNativeFixture(id),nativeRoundtripProbe:javascriptNativeRoundtripProbe(id),
   verifyNativeRoundtripInput,verifyNativeRoundtripOutcome,verifyNativeRoundtripExecution:()=>{},validateNativeSource:()=>{},freezeCivilEvidence,
   page:{evaluate:async()=>{}},completeJavascriptNativeRoundtrip:()=>{},prepared:{document_id:'d',workflow_ref:{workflow_id:'w'}},
   deadline:Date.now()+10000,randomUUID:()=>String(events.length),execute:()=>{},nativeReadUncertain:false,metadataDiagnostic:false,metadataLifecycle:createJavascriptMetadataLifecycle(),sessionId:'test',origin:'http://test',build:'7.4.2',
   readNativeRoundtrip:async({role,onState})=>{if(mode==='bad-lifecycle'&&role==='output')s.results[role].lifecycle.releasedResponses=3;await onState(s.results[role].lifecycle);return s.results[role];},
   record:async event=>{events.push(clone(event));return mode==='bad-ack'&&event.results?{...event,results:{}}:clone(event);},Date
  });
  const run=()=>runtime.readNativeRoundtrip({node:{node_id:'n'},table:{port_guid:sharedPortGuid},native_input:{native:s.results.before}},{node_id:'js'},{});
  if(mode==='pass'){
   assert.equal((await run()).outcome.exact_pass,true);
   assert.ok(events.filter(e=>e.phase==='native_roundtrip_lifecycle').every(e=>e.uncertain===false));
  }else await assert.rejects(run);
  if(mode==='bad-lifecycle')assert.equal(events.find(e=>e.role==='output').uncertain,true);
 });
}
test('duplicate rejects grouped-by-copy rows with correct six-row count',async()=>{
 const s=await stages('cardinality-duplicate');await s.read('output');await s.read('upstream');
 const cells=s.results.output.raw.cells;[1,2,3,1,2,3].forEach((v,i)=>{cells[i].payload[2]=v;});
 assert.throws(()=>verifyNativeRoundtripOutcome(s.results,'cardinality-duplicate'));
});
test('cardinality code-empty and arbitrary selectors/count roles remain unavailable',()=>{
 for(const id of ['cardinality-code-empty','cardinality-all','cardinality-keep3']){
  assert.throws(()=>javascriptNativeFixture(id));assert.throws(()=>javascriptNativeRoundtripProbe(id));
 }
 assert.throws(()=>javascriptNativeReadFixture(ids[0],'arbitrary'));
});

for(const id of [...ids,'cardinality-empty'])for(const mode of ['pass','bad-ack','changed-baseline'])test(id+' production pre-JS arm requires frozen raw baseline and exact ACK '+mode,async()=>{
 const s=await stages(id),calls=[];
 if(mode==='changed-baseline')s.results.before.raw.cells[0].payload[2]=9;
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async armNativeRoundtrip(input) {'),end=source.indexOf('    async checkNativeRoundtripBeforeExecute()',start);
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
  nativeInputOnly:true,nativeReadUncertain:false,metadataDiagnostic:false,metadataLifecycle:createJavascriptMetadataLifecycle(),nativeTelemetryCaseId:undefined,nativeCalibrationId:undefined,nativeNamedCaseId:undefined,nativeFixtureId:id,nativeRoundtripProbe:javascriptNativeRoundtripProbe(id),
  verifyNativeRoundtripInput,validateNativeSource:()=>{},armJavascriptNativeRoundtrip:()=>{},
  page:{evaluate:async()=>{calls.push('arm');return {armed:true};}},record:async e=>{calls.push(e.phase);return mode==='bad-ack'?{...e,proof:{}}:clone(e);}
 });
 const run=()=>runtime.armNativeRoundtrip({node:{node_id:'n'},table:{port_guid:sharedPortGuid},native_input:{native:s.results.before}});
 if(mode==='pass'){await run();assert.equal(calls.indexOf('native_roundtrip_input_before_js'),0);assert.equal(calls[1],'arm');}
 else{await assert.rejects(run);assert.equal(calls.includes('arm'),false);}
});
