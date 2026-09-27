import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import {verifyNativeInputFixture,nativeInputRequest,nativeInputProvenance,verifyNativeInputRead,verifyNativeInputUi} from './javascript-native-input-contract.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripRead,verifyNativeRoundtripInput,verifyNativeRoundtripMapping} from './javascript-native-roundtrip-contract.mjs';
import {createJavascriptNativeInputSupport} from './javascript-native-input-driver.mjs';
import {fake,sourceEvidence} from './javascript-native-input.test.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {readJavascriptNativeInput,javascriptNativeInputStatus} from './javascript-native-input-read.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const fixtureUrl=id=>new URL('./fixtures/'+javascriptNativeFixture(id).file,import.meta.url);
const canonical=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/operator-only/typed-cases.json',import.meta.url)));
function ui(id){const f=javascriptNativeFixture(id);return {row_count:f.rows,sample_rows:f.rows,sample_complete:true,filter_enabled:false,
  precision:{numbers_verified:true,limitations:[]},limitations:[],schema:[{name:'Value',label:'Value',type:id}],
  sample:f.values.map((value,i)=>[{type:id,value,is_null:i===0,precision:i===0?'exact_null':id==='boolean'?'exact_boolean':'display_text'}])};}

for(const id of ['real','boolean','string']){
 test(id+' immutable CSV and significant bytes match canonical specification',()=>{
  const f=javascriptNativeFixture(id),bytes=readFileSync(fixtureUrl(id));assert.deepEqual(verifyNativeInputFixture(bytes,id),f);
  assert.deepEqual(f.values,canonical.cases.find(c=>c.id==={real:'null-number',boolean:'null-bool',string:'null-text'}[id]).values);
  const encoded=f.values.map(v=>{
   if(v===null)return null;
   if(id==='string')return Buffer.from(v,'utf8').toString('hex');
   if(id==='boolean')return Buffer.from([Number(v)]).toString('hex');
   const bytes=Buffer.alloc(8);bytes.writeDoubleLE(v);return bytes.toString('hex');
  });
  assert.deepEqual(encoded,f.expected_bytes);
  assert.throws(()=>verifyNativeInputFixture(Buffer.concat([bytes,Buffer.from(' ')]),id));
 });
 for(const suffix of ['nested/','../','./','nested/../'])test(id+' rejects nonexact fixture destination '+suffix,()=>{
  const x=sourceEvidence(id),original=x.operation.nodeApply.request.parameters.settings.source.source_path;
  const changed=original.slice(0,original.lastIndexOf('/')+1)+suffix+javascriptNativeFixture(id).file;
  const replace=o=>{for(const k of Object.keys(o)){if(o[k]===original)o[k]=changed;else if(o[k]&&typeof o[k]==='object')replace(o[k]);}};
  replace(x.operation);replace(x.upload);replace(x.history);assert.throws(()=>nativeInputProvenance(x));
 });
 test(id+' refuses trailing newline after exact fixture filename',()=>{
  const x=sourceEvidence(id),original=x.operation.nodeApply.request.parameters.settings.source.source_path;
  const replace=o=>{for(const k of Object.keys(o)){if(o[k]===original)o[k]=original+'\n';else if(o[k]&&typeof o[k]==='object')replace(o[k]);}};
  replace(x.operation);replace(x.upload);replace(x.history);assert.throws(()=>nativeInputProvenance(x));
 });
}
for(const id of ['boolean','string']){
 test(id+' explicit fixture request, UI and applied import lineage',()=>{
  const f=javascriptNativeFixture(id),x=sourceEvidence(id),request=x.operation.nodeApply.request;
  assert.equal(request.parameters.settings.columns[0].type,id);assert.equal(request.parameters.settings.format.null_marker,'__JS_NULL__');
  assert.equal(request.read.sample_rows,f.rows);assert.equal(nativeInputProvenance(x).fixture_id,id);
  assert.equal(verifyNativeInputUi(ui(id),id).native_bytes_verified,false);
  assert.match(javascriptNativeRoundtripProbe(id).source,new RegExp('DataType\\.'+f.js_type));
  assert.doesNotMatch(javascriptNativeRoundtripProbe(id).source,/Boolean\(|String\(|Number\(|Date\(|async/);
 });
 test(id+' independent native INPUT before JS then full OUTPUT and upstream identity bytes',async()=>{
  const x=await roundtrip({fixtureId:id}),f=javascriptNativeFixture(id),lifecycle={...x.f.env.__loginomJavascriptNativeInputReadV1.last,retired:false};
  const input={binding:{...x.f.b,read_id:'before'},raw:x.before,exact:verifyNativeInputRead(x.before,{binding:{...x.f.b,read_id:'before'},lifecycle,provenance:nativeInputProvenance(sourceEvidence(id))})};
  assert.deepEqual(clone(input.exact.cells.map(c=>c.value)),f.values);
  assert.equal(input.exact.js_created,false);
  const results=[];
  for(const role of ['output','upstream']){
   const b=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:role});
   const lifecycle=await javascriptNativeRoundtripStatus(x.f.page);
   const proof=verifyNativeRoundtripRead(raw,{binding:{...b,read_id:role},lifecycle,input,role});
   assert.deepEqual(clone(proof.cells.map(c=>c.value)),f.values);assert.equal(lifecycle.releasedRequests,f.rows);assert.equal(lifecycle.releasedResponses,f.rows);
   assert.equal(proof.g5_complete,false);results.push(raw.read_id);
  }
  assert.deepEqual(results,['output','upstream']);assert.deepEqual(x.f.counters,{sent:3*f.rows,requests:3*f.rows,responses:3*f.rows});
 });
 test(id+' actual native input is checked against oracle, not just receipt flags',async()=>{
  const f=await fake({fixtureId:id}),raw=await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'input'}),lifecycle=await javascriptNativeInputStatus(f.page);
  const binding={...f.b,read_id:'input'},provenance=nativeInputProvenance(sourceEvidence(id));
  const exact=verifyNativeInputRead(raw,{binding,lifecycle,provenance});
  const input={node:{node_id:'n'},table:{port_guid:'p'},native_input:{native:{raw,exact,binding,lifecycle}}};
  assert.ok(verifyNativeRoundtripInput(input,id));
  assert.throws(()=>verifyNativeRoundtripInput(input,id==='string'?'boolean':'string'));
  input.native_input.native.exact.cells[1].is_null=true;assert.throws(()=>verifyNativeRoundtripInput(input,id));
  await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'new-id'}),/binding reused/);
  assert.equal(f.counters.sent,javascriptNativeFixture(id).rows);
 });
 test(id+' native input support forwards family once and refuses replay after lost native reply',async()=>{
  const x=sourceEvidence(id),calls=[];
  const support=createJavascriptNativeInputSupport({fixtureId:id,onState:async()=>{},onProof:async()=>calls.push('proof'),
   createSupport:()=>({nodeApplyDriverFactory:()=>({verifySource:async()=>calls.push('source'),finish:async()=>calls.push('execute'),
    waitExecution:async()=>x.execution,readOutput:async()=>{calls.push('ui');return {ports:[ui(id)]};}})}),
   readNative:async args=>{assert.equal(args.fixtureId,id);assert.equal(args.provenance.fixture_id,id);calls.push('native');throw Error('lost native reply');}});
  const d=support.nodeApplyDriverFactory(x);
  await d.verifySource(x.operation.nodeApply.request.parameters);await d.finish('execute',x.ctx);await d.waitExecution(x.ctx);
  await assert.rejects(()=>d.readOutput({},x.ctx),/lost native reply/);
  await assert.rejects(()=>d.readOutput({},x.ctx),/no replay/);await assert.rejects(()=>d.finish('execute',x.ctx),/one import/);
  assert.deepEqual(calls,['source','execute','ui','native']);
 });
 test(id+' mapping admits only exact family on both sides and its source link',()=>{
  const node={document_id:'d',workflow_id:'w',node_id:'js'},source={record_id:'record',field_id:'field',name:'Value',type:id,required:false};
  const mapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync:true,
   node_context:{...node,verified:true,surface:'wizard',input_port:{direction:'input',port:0,port_guid:'input'}},
   source_fields:[source],target_fields:[{name:'Value',type:id,required:false,source:{...source}}]};
  assert.equal(verifyNativeRoundtripMapping(mapping,node,id).verified,true);
  for(const location of ['source','target','link']){
   const bad=clone(mapping),field=location==='source'?bad.source_fields[0]:location==='target'?bad.target_fields[0]:bad.target_fields[0].source;
   field.type='variant';assert.throws(()=>verifyNativeRoundtripMapping(bad,node,id));
  }
 });
 test(id+' output and upstream remain once-only with family-specific release counts',async()=>{
  const x=await roundtrip({fixtureId:id}),f=javascriptNativeFixture(id);
  await assert.rejects(()=>x.bind('upstream'),/Completed output read/);assert.equal(x.f.counters.sent,f.rows);
  for(const role of ['output','upstream']){
   const b=await x.bind(role);
   await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,{...b,fixture_id:'real'},decodeVariantFrame,{operationId:role+'-wrong'}));
   await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:role});
   await assert.rejects(()=>x.bind(role),/already reserved/);
   await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:role+'-retry'}));
  }
  assert.deepEqual(x.f.counters,{sent:3*f.rows,requests:3*f.rows,responses:3*f.rows});
 });
 for(const field of ['fixture','schema','count','rpc'])test(id+' serialized binding refuses '+field+' change before cell dispatch',async()=>{
  const f=await fake({fixtureId:id});
  if(field==='fixture')f.b.fixture_id=id==='string'?'boolean':'string';
  if(field==='schema')f.b.schema[0].type=6;
  if(field==='count')f.b.row_count++;
  if(field==='rpc')f.b.method=322;
  await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame));assert.equal(f.counters.sent,0);
 });
 for(const kind of ['null-loss','false-or-empty-to-null','order','wrong-utf8-or-bool'])test(id+' refuses native input '+kind+' before JS admission',async()=>{
  const f=await fake({fixtureId:id}),raw=await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'input'}),lifecycle=await javascriptNativeInputStatus(f.page);
  const bad=clone(raw);
  if(kind==='null-loss')bad.cells[0]={...clone(raw.cells[1]),row:0,message_id:raw.cells[0].message_id};
  if(kind==='false-or-empty-to-null')bad.cells[1]={...clone(raw.cells[0]),row:1,message_id:raw.cells[1].message_id};
  if(kind==='order'){bad.cells[1].row=2;bad.cells[2].row=1;}
  if(kind==='wrong-utf8-or-bool'){const c=bad.cells.at(-1);if(id==='string')c.payload[16]=88;else c.payload[2]=0;}
  assert.throws(()=>verifyNativeInputRead(bad,{binding:{...f.b,read_id:'input'},lifecycle,provenance:nativeInputProvenance(sourceEvidence(id))}));
 });
 for(const field of ['cache','type','count','subscription'])test(id+' output snapshot mutation after response releases buffers and refuses publication: '+field,async()=>{
  const x=await roundtrip({fixtureId:id,change:x=>{
   if(field==='cache')x.outputHelper.$FData={};if(field==='type')x.f.dc.FColumnInfosStore.data.items[0].data.DataType=6;
   if(field==='count')x.outputHelper.$FRowCount++;if(field==='subscription')x.f.helper.$FDataChangeCookie.$.$O++;
  }}),b=await x.bind('output');
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'}));
  assert.equal(x.f.counters.sent,javascriptNativeFixture(id).rows+1);assert.equal(x.f.counters.requests,x.f.counters.responses);
  assert.equal((await javascriptNativeRoundtripStatus(x.f.page)).retired,true);
 });
 test(id+' wrong typed UI input stops before native proof and JS creation',async()=>{
  const x=sourceEvidence(id),table=ui(id);table.sample[1][0]={...table.sample[0][0]};let native=0,proof=0;
  const support=createJavascriptNativeInputSupport({fixtureId:id,targetOrigin:'http://test',targetBuild:'7.4.2',onState:async()=>{},
   onProof:async()=>proof++,readNative:async()=>native++,createSupport:()=>({nodeApplyDriverFactory:()=>({readOutput:async()=>({ports:[table]})})})});
  await assert.rejects(()=>support.nodeApplyDriverFactory(x).readOutput({},x.ctx));assert.equal(native,0);assert.equal(proof,0);
 });
}
test('private fixture selector rejects Date/generic schemas and public CLI option',async()=>{
 for(const id of ['datetime','integer','variant','__proto__','constructor','unknown'])assert.throws(()=>javascriptNativeFixture(id));
 const {runJavascriptOperator}=await import('./javascript-live.mjs');
 await assert.rejects(()=>runJavascriptOperator(['--native-fixture','boolean']),/Unknown/);
 for(const entry of [{nativeRoundtrip:true},{nativeInputOnly:true}]){
  await assert.rejects(()=>runJavascriptOperator(['--native-fixture','datetime'],entry),/Unknown private native fixture/);
  for(const id of ['real','boolean','string','integer-safe','integer-outside-safe'])await assert.rejects(()=>runJavascriptOperator(['--native-fixture',id],entry),/Absolute --config required/);
  await assert.rejects(()=>runJavascriptOperator(['--native-fixture','boolean','--native-fixture','string'],entry),/Unknown or duplicate/);
 }
});
test('default real probe source SHA is unchanged from source70',()=>{
 assert.equal(javascriptNativeRoundtripProbe().source_sha256,'5519fcf8c9232b3d7b157745ab0852033825cdac02ae2ab489ec4801243942f5');
});
