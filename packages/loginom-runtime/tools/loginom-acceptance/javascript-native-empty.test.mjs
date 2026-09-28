import {createJavascriptMetadataLifecycle} from './javascript-native-metadata.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {javascriptNativeFixture,javascriptNativeReadFixture} from './javascript-native-fixtures.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripInput,verifyNativeRoundtripRead,verifyNativeRoundtripOutcome} from './javascript-native-roundtrip-contract.mjs';
import {nativeInputProvenance,verifyNativeInputRead} from './javascript-native-input-contract.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {sourceEvidence} from './javascript-native-input.test.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {captureJavascriptNativeZero,verifyJavascriptDeclaredEmpty} from './javascript-native-zero.mjs';
const clone=x=>structuredClone(x),fixtureId='cardinality-empty';
const pins={PrepareColumnInfoAndRowCount:'d952415558676c3caf569a51d88bf026e661abdaaf08842d870ddba139730e3f',
  InitOutput:'c01544ac551e88997f9cea9b62314234ad435bc7632357861cdfc6013e89960e',DataSourceProxyRead:'6206671eaf111d80459c3ed1d5878125ef37918fb1abacc1cd19ce42c7fdf91d'};
async function stages(){
  const x=await roundtrip({fixtureId}),binding={...x.f.b,read_id:'before'},lifecycle={...clone(x.f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
  const provenance=nativeInputProvenance(sourceEvidence(fixtureId));
  const before={binding,raw:x.before,lifecycle,exact:verifyNativeInputRead(x.before,{binding,lifecycle,provenance})},results={before};
  const read=async role=>{
    const binding=await x.bind(role);if(role==='output')binding.count_loader_sha256=pins;
    const raw=await readJavascriptNativeRoundtrip(x.f.page,binding,decodeVariantFrame,{operationId:role});
    const lifecycle=await javascriptNativeRoundtripStatus(x.f.page),expected={...binding,read_id:role};
    const proof={binding:expected,raw,lifecycle,exact:verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input:before,role})};
    if(role==='output')x.closeOutput();
    return results[role]=proof;
  };
  return {x,results,read};
}

test('canonical empty is fixed declared Data-only source; no code-empty substitute',()=>{
  const input=javascriptNativeFixture(fixtureId),output=javascriptNativeReadFixture(fixtureId,'output'),probe=javascriptNativeRoundtripProbe(fixtureId);
  assert.deepEqual(input.values,['1','2','3']);assert.equal(input.rows,3);assert.equal(output.rows,0);assert.deepEqual(output.values,[]);
  assert.equal(probe.schema_mode,'declared');assert.doesNotMatch(probe.source,/AssignColumns|Append|\.Set\(|DataType/);
  vm.runInNewContext(probe.source.replace(/^import[^\n]+\n/,''),{InputTable:new Proxy({},{get:()=>assert.fail('no input access needed')}),
    OutputTable:new Proxy({},{get:()=>assert.fail('no schema/row mutation')})});
  assert.throws(()=>javascriptNativeFixture('cardinality-code-empty'));
});

test('serialized declared empty publishes schema1/cells0 and original upstream3 with six total cell RPCs',async()=>{
  const s=await stages();await s.read('output');await s.read('upstream');
  const out=s.results.output;
  assert.equal(out.raw.row_count,0);assert.equal(out.raw.schema.length,1);assert.equal(out.raw.cells.length,0);
  assert.equal(out.exact.coverage.table_complete,true);assert.equal(out.exact.coverage.columns_read,0);
  assert.equal(out.lifecycle.requests,0);assert.equal(out.lifecycle.releasedRequests,0);assert.equal(out.lifecycle.releasedResponses,0);
  assert.equal(out.lifecycle.status,'completed');assert.equal(out.lifecycle.published,true);assert.equal(out.lifecycle.retired,false);
  assert.deepEqual(clone(out.raw.zero_admission.before.facts.counts),{dc:0,dt:0,proxy:0,store:0,helper:0});
  assert.equal(out.raw.zero_admission.before.facts.schema[0].required,undefined,'native metadata does not assume UI Required');
  assert.equal(out.binding.declaration.field.required,false);verifyJavascriptDeclaredEmpty(out.binding.declaration,out.binding.declaration_sha256);
  assert.deepEqual(clone(out.binding.subscriptions),{data:'null',state:'null'});
  assert.deepEqual(s.x.f.counters,{sent:6,requests:6,responses:6});
  const outcome=verifyNativeRoundtripOutcome(s.results,fixtureId);
  assert.equal(outcome.exact_pass,true);assert.equal(outcome.output_rows,0);assert.equal(outcome.g5_complete,false);
});

const zeroChanges={
  missing_dc:x=>delete x.f.dc.FTotalRowCount,wrong_dt:x=>x.f.dt.FTotalRowCount=1,missing_proxy:x=>delete x.f.store.proxy.FTotalRowCount,
  wrong_store:x=>x.f.store.totalCount=3,missing_helper:x=>delete x.outputHelper.$FRowCount,nan:x=>x.f.dc.FTotalRowCount=NaN,
  loading:x=>x.f.store.loading=true,missing_loading:x=>delete x.f.store.loading,cache_initialized:x=>x.outputHelper.$FCacheInitialized=true,
  data_cache:x=>x.outputHelper.$FData={},pending:x=>x.f.store.proxy.pendingOperations.a={},pages:x=>x.f.store.pageRequests.a={},
  missing_pending:x=>delete x.f.store.proxy.pendingOperations,wrong_names:x=>x.f.store.proxy.FDataFieldNames[0]='Other',
  getter:x=>x.f.store.proxy.FValueGetters[0]=0,getter_identity:x=>x.f.store.proxy.FValueGetters[0]=()=>{},
  field:x=>x.f.dc.FColumnInfosStore.data.items[0].data.Name='Other',field_record:x=>x.f.dc.FColumnInfosStore.data.items[0]={data:x.f.dc.FColumnInfosStore.data.items[0].data},
  names_identity:x=>x.f.store.proxy.FDataFieldNames=['Value'],proxy_identity:x=>x.f.store.proxy={...x.f.store.proxy},
  owner:x=>x.outputDs.$.$O++,node:x=>x.js.data={},process:x=>x.child.data.Status=2,cookie:x=>x.outputHelper.$FDataChangeCookie={},
};
for(const [name,change]of Object.entries(zeroChanges))test('zero native admission refuses '+name+' without cell RPC',async()=>{
  const x=await roundtrip({fixtureId}),b=await x.bind('output');b.count_loader_sha256=pins;change(x);
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'}));
  assert.equal(x.f.counters.sent,3);
});

test('zero read reserves binding before empty loop and requires observed graph return before upstream',async()=>{
  const x=await roundtrip({fixtureId}),b=await x.bind('output');b.count_loader_sha256=pins;
  await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'});
  assert.equal(x.f.env.__loginomJavascriptNativeRoundtripV1.bindings.get('output').readStarted,true);
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'another'}),/reused/);
  await assert.rejects(()=>x.bind('upstream'),/Completed output/);
  assert.equal(x.f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('upstream'),false);assert.equal(x.f.counters.sent,3);
});

for(const [name,change]of Object.entries({field:x=>x.declaredRecord.data.Required=true,count:x=>x.declaredData.items.push(x.declaredRecord),
  record:x=>x.declaredData.items[0]={...x.declaredRecord},store:x=>x.declaredView.getStore=()=>({...x.declaredStore}),
  generation:x=>x.generationControl.checked=true,name:x=>x.declaredRecord.data.Name='Other',type:x=>x.declaredRecord.data.DataType=3,
  index:x=>x.declaredRecord.data.Index=1,source:x=>x.lines.push('OutputTable.Append();')}))test('held UI declaration rejects '+name+' drift before Done',async()=>{
  const x=await roundtrip({fixtureId,wizardOnly:true});change(x);assert.throws(()=>x.prepare());assert.equal(x.f.counters.sent,3);
});

test('declared witness cannot be disposed before own matched Done or contaminated after seal',async()=>{
  const x=await roundtrip({fixtureId,wizardOnly:true});x.dispose();assert.throws(()=>x.prepare());
  const y=await roundtrip({fixtureId,wizardOnly:true});await y.prepare();y.dispose();await y.seal();
  y.declaredRecord.data.Required=true;assert.throws(()=>y.f.env.__loginomJavascriptNativeRoundtripV1.sourceWitness.verify());
});

for(const [name,change]of Object.entries({missing:r=>delete r.output.raw.zero_admission,
  counts:r=>r.output.raw.zero_admission.before.facts.counts.dc=1,missing_count:r=>delete r.output.raw.zero_admission.final.facts.counts.proxy,
  cache:r=>r.output.raw.zero_admission.final.facts.cache_initialized=true,fieldmap:r=>r.output.raw.zero_admission.final.facts.field_names=[],
  schema:r=>r.output.raw.schema=[],cells:r=>r.output.raw.cells=[{}],lifecycle:r=>r.output.lifecycle.requests=1,
  mode:r=>r.output.binding.schema_mode='code',source:r=>r.output.binding.done_witness.source+='OutputTable.Append();',
  declared_required:r=>r.output.binding.declaration.field.required=true,done_digest:r=>r.output.binding.done_witness.declaration_sha256='0'.repeat(64),
  read_id:r=>r.output.raw.zero_admission.before.read_id='other',loader:r=>r.output.binding.count_loader_sha256.InitOutput='0'.repeat(64),
  input:r=>r.before.raw.cells[0].payload[2]=8,upstream:r=>r.upstream.raw.cells[0].payload[2]=8,
}))test('final raw empty proof rejects '+name,async()=>{
  const s=await stages();await s.read('output');await s.read('upstream');const results=clone(s.results);change(results);
  assert.throws(()=>verifyNativeRoundtripOutcome(results,fixtureId));
});

test('serialized zero observer reads counts without invoking accessors, field getters, loaders or RPC',async()=>{
  const x=await roundtrip({fixtureId});await x.bind('output');
  const initial=x.f.env.__loginomJavascriptNativeRoundtripV1.bindings.get('output').initial;
  let calls=0;const forbidden=()=>{calls++;throw Error('must not invoke');};
  initial.dc.PrepareColumnInfoAndRowCount=initial.dc.InitOutput=initial.store.proxy.read=forbidden;
  initial.store.proxy.FValueGetters[0]=forbidden;
  const facts=await x.f.page.evaluate(captureJavascriptNativeZero,initial);
  assert.equal(JSON.parse(facts.zeroFacts).counts.helper,0);assert.equal(calls,0);assert.equal(x.f.counters.sent,3);
  Object.defineProperty(initial.dc,'FTotalRowCount',{get:forbidden});
  await assert.rejects(async()=>x.f.page.evaluate(captureJavascriptNativeZero,initial),/five observed zero counts/);assert.equal(calls,0);
});

for(const shape of ['missing','undefined','present'])test('zero observes actual '+shape+' subscriptions and retains identities',async()=>{
  const x=await roundtrip({fixtureId});
  for(const key of ['$FDataChangeCookie','$FStateChangeCookie']){
    if(shape==='missing')delete x.outputHelper[key];
    if(shape==='undefined')x.outputHelper[key]=undefined;
    if(shape==='present')x.outputHelper[key]=x.f.helper[key];
  }
  const b=await x.bind('output');b.count_loader_sha256=pins;
  const raw=await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'});
  assert.equal(raw.cells.length,0);assert.equal(x.f.counters.sent,3);
  if(shape==='present'){
    assert.equal(JSON.parse(b.subscriptions.data)[2],206);
    const old=x.outputHelper.$FDataChangeCookie.$;x.outputHelper.$FDataChangeCookie.$={...old};
    assert.throws(()=>x.closeOutput(),/subscription|cookie/i);
  }else{
    assert.equal(b.subscriptions.data,shape);x.closeOutput();
  }
});

for(const fault of ['counts','metadata','pending','loader','cookie','identity'])test('zero final snapshot rejects '+fault+' drift after initial observation before publish',async()=>{
  const x=await roundtrip({fixtureId}),b=await x.bind('output');b.count_loader_sha256=pins;
  const entry=x.f.env.__loginomJavascriptNativeRoundtripV1.bindings.get('output'),capture=entry.capture;let reads=0;
  entry.capture=args=>{
    if(++reads===2){
      if(fault==='counts')x.f.store.totalCount=1;
      if(fault==='metadata')x.f.dc.FColumnInfosStore.data.items[0].data.DataType=3;
      if(fault==='pending')x.f.store.proxy.pendingOperations.one={};
      if(fault==='loader')x.f.dc.InitOutput=()=>{};
      if(fault==='cookie')x.outputHelper.$FDataChangeCookie=undefined;
      if(fault==='identity')x.outputDs.$={...x.outputDs.$};
    }
    return capture(args);
  };
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'}));
  const status=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(status.published,false);assert.equal(status.status,'failed');assert.equal(entry.readStarted,true);assert.equal(x.f.counters.sent,3);
  await assert.rejects(()=>x.bind('upstream'),/Completed output/);
});

for(const mode of ['pass','bad-ack','bad-lifecycle'])test('empty production orchestration requires lifecycle0 and final ACK '+mode,async()=>{
  const s=await stages();await s.read('output');await s.read('upstream');const events=[];
  const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    async readNativeRoundtrip(input,node,execution) {'),end=source.indexOf('    async readNativeCivil(',start);
  const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
    nativeCalibrationId:undefined,nativeNamedCaseId:undefined,nativeFixtureId:fixtureId,nativeInputFixture:javascriptNativeFixture(fixtureId),nativeRoundtripProbe:javascriptNativeRoundtripProbe(fixtureId),
    verifyNativeRoundtripInput,verifyNativeRoundtripOutcome,verifyNativeRoundtripExecution:()=>{},validateNativeSource:()=>{},freezeCivilEvidence,
    page:{evaluate:async()=>{}},completeJavascriptNativeRoundtrip:()=>{},prepared:{document_id:'d',workflow_ref:{workflow_id:'w'}},
    deadline:Date.now()+10000,randomUUID:()=>String(events.length),execute:()=>{},nativeReadUncertain:false,metadataDiagnostic:false,metadataLifecycle:createJavascriptMetadataLifecycle(),sessionId:'test',origin:'http://test',build:'7.4.2',
    readNativeRoundtrip:async({role,onState})=>{if(mode==='bad-lifecycle'&&role==='output')s.results[role].lifecycle.releasedResponses=3;await onState(s.results[role].lifecycle);return s.results[role];},
    record:async event=>{events.push(clone(event));return mode==='bad-ack'&&event.results?{...event,results:{}}:clone(event);},Date
  });
  const run=()=>runtime.readNativeRoundtrip({node:{node_id:'n'},table:{port_guid:s.results.before.binding.port_guid},native_input:{native:s.results.before}},{node_id:'js'},{});
  if(mode==='pass'){assert.equal((await run()).outcome.exact_pass,true);assert.ok(events.filter(e=>e.phase==='native_roundtrip_lifecycle').every(e=>e.uncertain===false));}
  else await assert.rejects(run);
  if(mode==='bad-lifecycle')assert.equal(events.find(e=>e.role==='output').uncertain,true);
});
