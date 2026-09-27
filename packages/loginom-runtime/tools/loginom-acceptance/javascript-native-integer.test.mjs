import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import {nativeInputProvenance,verifyNativeInputFixture,verifyNativeInputUi,verifyNativeInputRead} from './javascript-native-input-contract.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripInput,verifyNativeRoundtripRead,verifyNativeRoundtripOutcome} from './javascript-native-roundtrip-contract.mjs';
import {readJavascriptNativeInput,javascriptNativeInputStatus} from './javascript-native-input-read.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {createJavascriptNativeInputSupport} from './javascript-native-input-driver.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';
import {fake,sourceEvidence} from './javascript-native-input.test.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/operator-only/typed-cases.json',import.meta.url)));
const ids=['integer-safe','integer-outside-safe'];
function ui(id){const f=javascriptNativeFixture(id);return {row_count:f.rows,sample_rows:f.rows,sample_complete:true,filter_enabled:false,
  precision:{numbers_verified:true,limitations:[]},limitations:[],schema:[{name:'Value',label:'Value',type:'integer'}],
  sample:f.values.map(value=>[{type:'integer',value,is_null:value===null,precision:value===null?'exact_null':'exact_integer'}])};}

function changeReply(f,response,request,role,value,tag=20){
  const current=f.dc.FModelNode!==f.node.data?'output':f.counters.sent>2*f.b.rows?'upstream':'input';
  if(current!==role||request.row!==f.b.rows-1)return;
  const view=new DataView(response.$FData.buffer);view.setInt16(12,tag,true);
  if(tag===20)view.setBigInt64(14,BigInt(value),true);
}

async function stages(fixtureId,reply){
  const x=await roundtrip({fixtureId,reply}),lifecycle={...clone(x.f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
  const binding={...x.f.b,read_id:'before'},provenance=nativeInputProvenance(sourceEvidence(fixtureId));
  const before={binding,raw:x.before,lifecycle,exact:verifyNativeInputRead(x.before,{binding,lifecycle,provenance})};
  const results={before};
  const read=async role=>{
    const binding=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,binding,decodeVariantFrame,{operationId:role});
    const lifecycle=await javascriptNativeRoundtripStatus(x.f.page),expected={...binding,read_id:role};
    const proof={binding:expected,raw,lifecycle,exact:verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input:before,role})};
    results[role]=proof;return proof;
  };
  return {x,results,read};
}

for(const id of ids){
 test(id+' immutable CSV and signed64 bytes preserve canonical decimal strings without Number',()=>{
  const f=javascriptNativeFixture(id),spec=canonical.cases.find(c=>c.id===id);
  assert.deepEqual(f.values,id==='integer-safe'?[null,...spec.decimal_strings]:spec.decimal_strings);
  const bytes=readFileSync(new URL('./fixtures/'+f.file,import.meta.url));assert.deepEqual(verifyNativeInputFixture(bytes,id),f);
  assert.equal(bytes.toString(),'Value\n'+f.values.map(v=>v===null?'__JS_NULL__':v).join('\n')+'\n');
  assert.deepEqual(f.values.map(v=>{if(v===null)return null;assert.equal(typeof v,'string');const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(v));return b.toString('hex');}),f.expected_bytes);
  assert.throws(()=>verifyNativeInputFixture(Buffer.from(bytes.toString().replace('900719925474099','900719925474098')),id));
  const source=javascriptNativeRoundtripProbe(id).source;
  assert.match(source,/DataType\.Integer/);assert.doesNotMatch(source,/Number\(|parseInt\(|BigInt\(|900719/);
 });
 test(id+' explicit import/readback/UI exact integer strings and NULL admission',()=>{
  const x=sourceEvidence(id),f=javascriptNativeFixture(id),request=x.operation.nodeApply.request;
  assert.equal(request.parameters.settings.columns[0].type,'integer');assert.equal(request.parameters.settings.format.null_marker,'__JS_NULL__');
  assert.equal(request.read.sample_rows,f.rows);assert.equal(nativeInputProvenance(x).fixture_id,id);
  assert.equal(verifyNativeInputUi(ui(id),id).verified,true);
  for(const bad of [0,'9007199254740992',null]){
   const table=ui(id);table.sample.at(-1)[0].value=bad;table.sample.at(-1)[0].is_null=bad===null;
   if(bad===f.values.at(-1))continue;assert.throws(()=>verifyNativeInputUi(table,id));
  }
  const table=ui(id);table.sample.at(-1)[0].precision='display_text';assert.throws(()=>verifyNativeInputUi(table,id));
 });
 test(id+' production Table integer decoder preserves every decimal before native admission',()=>{
  const f=javascriptNativeFixture(id),table={view_guid:'v',port_guid:'p',table_tid:'t'},field={index:0,key:'Value',type:'integer'},columns=[{index:0,name:'Value',label:'Value',type:'integer'}];
  const options={requireExactNumbers:true,expectedColumns:columns,formatProof:{table,dialog_readback_verified:true,fields:[field],
   numeric_formats:[{...field,mask:'0',verified_format:{...field,mask:'0'}}]},
   readSettings:{table,settings_applied:true,filter_enabled:false,null_display:true,type_icons:true}};
  const output={table,columns,column_total:1,row_total:f.rows,sample_complete:true,
   rows:f.values.map((text,index)=>({index,cells:[{column:0,is_null:text===null,text}]}))};
  const decoded=decodeTableOutput(output,options);assert.deepEqual(decoded.sample.map(r=>r[0].value),f.values);
  assert.equal(verifyNativeInputUi(decoded,id).verified,true);
  output.rows.at(-1).cells[0].text='9007199254740992';
  assert.throws(()=>verifyNativeInputUi(decodeTableOutput(output,options),id));
 });
 for(const suffix of ['nested/','../'])test(id+' whole destination refuses '+suffix,()=>{
  const x=sourceEvidence(id),old=x.operation.nodeApply.request.parameters.settings.source.source_path;
  const changed=old.slice(0,old.lastIndexOf('/')+1)+suffix+javascriptNativeFixture(id).file;
  const replace=o=>{for(const k of Object.keys(o)){if(o[k]===old)o[k]=changed;else if(o[k]&&typeof o[k]==='object')replace(o[k]);}};
  replace(x.operation);replace(x.upload);replace(x.history);assert.throws(()=>nativeInputProvenance(x));
 });
 test(id+' wrong UI input prevents native proof and JS admission',async()=>{
  const x=sourceEvidence(id),table=ui(id),calls=[];table.sample.at(-1)[0].value='9007199254740992';
  const support=createJavascriptNativeInputSupport({fixtureId:id,onProof:async()=>calls.push('proof'),onState:async()=>{},
   createSupport:()=>({nodeApplyDriverFactory:()=>({readOutput:async()=>({ports:[table]})})}),readNative:async()=>calls.push('native')});
  await assert.rejects(()=>support.nodeApplyDriverFactory(x).readOutput({},x.ctx));assert.deepEqual(calls,[]);
 });
 for(const fault of ['changed-value','tag3','tag5','null','mixed-fixture','release-count'])test(id+' native INPUT refuses '+fault+' before JS',async()=>{
  const f=await fake({fixtureId:id}),raw=await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'input'});
  const lifecycle=await javascriptNativeInputStatus(f.page),binding={...f.b,read_id:'input'},provenance=nativeInputProvenance(sourceEvidence(id));
  const bad=clone(raw),cell=bad.cells.at(-1);
  if(fault==='changed-value')cell.payload[2]^=1;
  if(fault==='tag3'||fault==='tag5'){cell.tag=fault==='tag3'?3:5;cell.payload[0]=cell.tag;}
  if(fault==='null'){cell.tag=1;cell.payload[0]=1;}
  if(fault==='mixed-fixture')binding.fixture_id=id===ids[0]?ids[1]:ids[0];
  if(fault==='release-count')lifecycle.releasedResponses--;
  assert.throws(()=>verifyNativeInputRead(bad,{binding,lifecycle,provenance}));
  assert.equal(f.counters.sent,javascriptNativeFixture(id).rows);
 });
 test(id+' full serialized identity and final outcome revalidate all three native proofs',async()=>{
  const s=await stages(id),f=javascriptNativeFixture(id);
  assert.equal(verifyNativeRoundtripInput({node:{node_id:'n'},table:{port_guid:'p'},native_input:{native:s.results.before}},id),s.results.before);
  await s.read('output');await s.read('upstream');
  const result=verifyNativeRoundtripOutcome(s.results,id);
  assert.equal(result.input_exact,true);assert.equal(result.upstream_exact,true);assert.equal(result.output_identity_exact,true);
  assert.equal(result.exact_pass,id==='integer-safe');assert.equal(result.characterization_only,id==='integer-outside-safe');assert.equal(result.g5_complete,false);
  assert.equal(result.general_integer_precision_guarantee,false);
  assert.deepEqual(clone(s.results.before.exact.cells.map(c=>c.value)),f.values);
  assert.deepEqual(clone(s.results.output.exact.cells.map(c=>c.value)),f.values);
  assert.deepEqual(s.x.f.counters,{sent:3*f.rows,requests:3*f.rows,responses:3*f.rows});
  const changed=clone(s.results);changed.before.raw.cells.at(-1).payload[2]^=1;
  assert.throws(()=>verifyNativeRoundtripOutcome(changed,id));
 });
 for(const field of ['schema','count','fixture','source'])test(id+' output binder refuses changed '+field+' before requests',async()=>{
  const s=await stages(id),binding=await s.x.bind('output');
  if(field==='schema')binding.schema[0].type=3;if(field==='count')binding.rows++;
  if(field==='fixture')binding.fixture_id=id===ids[0]?ids[1]:ids[0];if(field==='source')binding.source_sha256='0'.repeat(64);
  await assert.rejects(()=>readJavascriptNativeRoundtrip(s.x.f.page,binding,decodeVariantFrame,{operationId:'changed'}));
  assert.equal(s.x.f.counters.sent,javascriptNativeFixture(id).rows);
 });
}

for(const id of ['real','boolean','string'])test(id+' existing exact route accepts the new final raw-proof outcome check',async()=>{
 const s=await stages(id);await s.read('output');await s.read('upstream');
 const result=verifyNativeRoundtripOutcome(s.results,id);
 assert.equal(result.status,'exact_fixture_identity_observed');assert.equal(result.exact_pass,true);assert.equal(result.characterization_only,false);assert.equal(result.g5_complete,false);
});

test('safe NULL and numeric zero remain distinct signed64 native cells',async()=>{
 const s=await stages('integer-safe');await s.read('output');await s.read('upstream');
 const cells=s.results.output.exact.cells;
 assert.equal(cells[0].native.tag,1);assert.equal(cells[0].value,null);
 assert.equal(cells[2].native.tag,20);assert.equal(cells[2].value,'0');assert.equal(cells[2].native.bytes_le,'0000000000000000');
});
for(const value of ['9007199254740992','9007199254740990'])test('safe OUTPUT changed integer '+value+' refuses exact roundtrip',async()=>{
 const s=await stages('integer-safe',(f,r,q)=>changeReply(f,r,q,'output',value));
 await assert.rejects(()=>s.read('output'),/independent oracle/);assert.equal(s.results.upstream,undefined);
 assert.deepEqual(s.x.f.counters,{sent:8,requests:8,responses:8});
});
for(const fault of ['null-to-zero','zero-to-null'])test('safe OUTPUT refuses '+fault,async()=>{
 const s=await stages('integer-safe',(f,r,q)=>{
  if(f.dc.FModelNode===f.node.data||q.row!==(fault==='null-to-zero'?0:2))return;
  const v=new DataView(r.$FData.buffer);v.setInt16(12,fault==='null-to-zero'?20:1,true);v.setBigInt64(14,0n,true);
 });
 await assert.rejects(()=>s.read('output'),/independent oracle/);
});
for(const value of ['9007199254740992','9007199254740994'])test('outside-safe changed OUTPUT '+value+' characterizes decimal delta then rereads exact upstream',async()=>{
 const s=await stages('integer-outside-safe',(f,r,q)=>changeReply(f,r,q,'output',value));
 const proof=await s.read('output'),observation=proof.exact.integer_characterization;
 assert.equal(observation.status,'outside_safe_value_change_observed');assert.equal(observation.output_identity_exact,false);assert.equal(observation.exact_pass,false);
 assert.equal(observation.cells[2].input_decimal,'9007199254740993');assert.equal(observation.cells[2].output_decimal,value);
 assert.equal(observation.cells[2].delta_decimal,value==='9007199254740992'?'-1':'1');
 await s.read('upstream');const result=verifyNativeRoundtripOutcome(s.results,'integer-outside-safe');
 assert.equal(result.status,'outside_safe_value_change_observed');assert.equal(result.exact_pass,false);assert.equal(result.upstream_exact,true);
 assert.equal(s.results.upstream.exact.cells[2].value,'9007199254740993');assert.equal(s.results.upstream.exact.cells[2].native.bytes_le,'0100000000002000');
 assert.deepEqual(s.x.f.counters,{sent:9,requests:9,responses:9});
 for(const role of ['output','upstream'])await assert.rejects(()=>s.x.bind(role),/already reserved/);
});
test('changed outside-safe upstream cannot become a completed characterization',async()=>{
 const s=await stages('integer-outside-safe',(f,r,q)=>{changeReply(f,r,q,'output','9007199254740992');changeReply(f,r,q,'upstream','9007199254740992');});
 await s.read('output');await assert.rejects(()=>s.read('upstream'),/independent oracle/);
 assert.throws(()=>verifyNativeRoundtripOutcome(s.results,'integer-outside-safe'));
 assert.deepEqual(s.x.f.counters,{sent:9,requests:9,responses:9});
});
for(const tag of [1,3,5])test('outside-safe OUTPUT tag'+tag+' is incompatible, not a precision characterization',async()=>{
 const s=await stages('integer-outside-safe',(f,r,q)=>changeReply(f,r,q,'output','0',tag));
 await assert.rejects(()=>s.read('output'));assert.equal(s.results.output,undefined);
});
for(const role of ['output','upstream'])test('final integer outcome refuses bad '+role+' lifecycle despite claimed exact flags',async()=>{
 const s=await stages('integer-outside-safe');await s.read('output');await s.read('upstream');
 s.results[role].lifecycle.releasedResponses--;s.results[role].exact.exact_pass=true;
 assert.throws(()=>verifyNativeRoundtripOutcome(s.results,'integer-outside-safe'));
});

for(const mode of ['exact','changed','bad-ack','changed-upstream'])test('production final integer outcome and exact journal ACK: '+mode,async()=>{
 const s=await stages('integer-outside-safe',(f,r,q)=>{if(mode!=='exact')changeReply(f,r,q,'output','9007199254740992');});
 await s.read('output');await s.read('upstream');
 if(mode==='changed-upstream')s.results.upstream.raw.cells[2].payload[2]=0;
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async readNativeRoundtrip(input,node,execution) {'),end=source.indexOf('    async captureDropTopology()',start);
 const events=[],steps=[];
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
  nativeCalibrationId:undefined,nativeNamedCaseId:undefined,nativeFixtureId:'integer-outside-safe',nativeInputFixture:javascriptNativeFixture('integer-outside-safe'),nativeRoundtripProbe:javascriptNativeRoundtripProbe('integer-outside-safe'),
  verifyNativeRoundtripInput,verifyNativeRoundtripOutcome,verifyNativeRoundtripExecution:()=>{},validateNativeSource:()=>{},
  page:{evaluate:async()=>{}},completeJavascriptNativeRoundtrip:()=>{},prepared:{document_id:'d',workflow_ref:{workflow_id:'w'}},
  deadline:Date.now()+10000,randomUUID:()=>String(steps.length),execute:()=>{},nativeReadUncertain:false,sessionId:'test',origin:'http://test',build:'7.4.2',
  readNativeRoundtrip:async({role,onState})=>{steps.push(role);await onState(s.results[role].lifecycle);return s.results[role];},
  record:async event=>{events.push(clone(event));const saved=clone(event);if(mode==='bad-ack'&&saved.results)saved.results.outcome.exact_pass=true;return saved;},Date
 });
 const run=()=>runtime.readNativeRoundtrip({node:{node_id:'n'},table:{port_guid:'p'},native_input:{native:s.results.before}},{node_id:'js'},{});
 if(mode==='bad-ack')await assert.rejects(run,/final journal ACK/);
 if(mode==='changed-upstream'){await assert.rejects(run,/independent oracle/);assert.equal(events.some(e=>e.phase==='native_roundtrip_verified'),false);}
 if(['exact','changed'].includes(mode)){
  const result=await run();assert.equal(result.outcome.exact_pass,false);assert.equal(result.outcome.output_identity_exact,mode==='exact');
  assert.equal(result.outcome.upstream_exact,true);assert.equal(events.at(-1).results.outcome.status,mode==='exact'?'outside_safe_exact_observed':'outside_safe_value_change_observed');
 }
 assert.deepEqual(steps,['output','upstream']);
});
