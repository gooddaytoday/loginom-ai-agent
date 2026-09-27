import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import {verifyNativeCivil,nativeCivilExpectation,freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {nativeInputProvenance,verifyNativeInputRead,verifyNativeInputFixture,verifyNativeInputUi} from './javascript-native-input-contract.mjs';
import {verifyNativeRoundtripRead,verifyNativeRoundtripInput,verifyNativeRoundtripOutcome,javascriptNativeRoundtripProbe} from './javascript-native-roundtrip-contract.mjs';
import {createJavascriptNativeInputSupport} from './javascript-native-input-driver.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {sourceEvidence} from './javascript-native-input.test.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
const id='civil-datetime',f=javascriptNativeFixture(id),clone=x=>structuredClone(x);
function civil(binding,role='input',empty=true){
 const table={view_guid:'view-'+role,port_guid:binding.port_guid,table_tid:'table-'+role};
 const field={index:0,key:'Value',type:'datetime'},mask='yyyy-mm-dd hh:nn:ss.zzz';
 const original={...field,settings:{format_string:empty?'':'dd.mm.yyyy',custom:!empty,formatting:true}};
 const applied=(mask)=>({verified:true,source:'applied_table_format_ui_cache',result:'ok',table,modal_tid:table.table_tid+';ModalWindow_BrowseFormat',fields:[{...field,mask}]});
 return {role,node:{document_id:binding.document_id,workflow_id:binding.workflow_id,node_id:binding.node_id},execution:clone(binding.completed_child),source_sha256:f.sha256,
  receipts:{table_creation:{table,port:0,port_guid:binding.port_guid,created:true},
   raw:{table,columns:[{index:0,name:'Value',label:'Value',type:'datetime'}],column_total:1,row_total:3,sample_complete:true,applied_format:applied(mask),
    rows:f.values.map((value,index)=>({index,cells:[{column:0,is_null:value===null,text:value?.replace('T',' ')??null}]}))},
   format_proof:{table,fields:[field],original_formats:[original],datetime_formats:[{...field,mask,verified_format:{...field,mask}}],dialog_readback_verified:false,format_application_pending:true},
   read_settings:{table,settings_applied:true,filter_enabled:false,null_display:true,type_icons:true},
   format_restoration:{table,restored:true,fields:[field],default_datetime_restoration:empty?[{...original,verified_after_apply:true}]:[],...(empty?{}:{applied_format:applied(original.settings.format_string)})},
   workflow_return:{verified:true,source_table:table,node_context:{verified:true,surface:'graph',document_id:binding.document_id,workflow_id:binding.workflow_id,node_id:binding.node_id},execution_started:false,reopen_performed:false}}};
}
function binding(){const x=sourceEvidence(id);return {...x.ctx.node,port_guid:'p',execution:x.ctx.execution,completed_child:x.execution};}
async function stages(options={}){
 const x=await roundtrip({fixtureId:id,...options}),binding={...x.f.b,read_id:'before'},lifecycle={...clone(x.f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
 const provenance={...nativeInputProvenance(sourceEvidence(id)),civil:civil(binding)};
 const before={binding,raw:x.before,lifecycle,exact:verifyNativeInputRead(x.before,{binding,lifecycle,provenance})},results={before};
 for(const role of ['output','upstream']){
  const b=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:role}),lifecycle=await javascriptNativeRoundtripStatus(x.f.page);
  const expected={...b,read_id:role},c=civil(expected,role);
  results[role]={binding:expected,raw,lifecycle,civil:c,exact:verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input:before,role,civil:c})};
 }
 return {x,results};
}

test('Date fixed DMY CSV matches canonical civil strings and has no predicted serial oracle',()=>{
 const canonical=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/operator-only/typed-cases.json',import.meta.url))).cases.find(c=>c.id===id);
 assert.deepEqual(f.values,canonical.local_values);assert.equal(f.expected_bytes,null);
 const bytes=readFileSync(new URL('./fixtures/'+f.file,import.meta.url));verifyNativeInputFixture(bytes,id);
 assert.equal(bytes.toString(),'Value\n__JS_NULL__\n29.02.2024 23:59:59.123\n29.03.2026 01:59:59.999\n');
 assert.match(javascriptNativeRoundtripProbe(id).source,/DataType.DateTime/);
 assert.doesNotMatch(javascriptNativeRoundtripProbe(id).source,/new Date|Date.parse|getTime|toISOString|UTC|2024|2026/);
});
for(const empty of [true,false])test('Date civil raw decode admits applied milliseconds and restored '+(empty?'empty default':'custom format'),()=>{
 const b=binding(),p=civil(b,'input',empty),r=p.receipts;
 assert.equal(verifyNativeCivil(p,nativeCivilExpectation(b,'input',f.sha256)).verified,true);
 const decoded=decodeTableOutput(r.raw,{formatProof:r.format_proof,readSettings:r.read_settings,expectedColumns:r.raw.columns,requireExactNumbers:true});
 assert.equal(verifyNativeInputUi(decoded,id).verified,true);
});
const faults={
 'millisecond truncated':p=>p.receipts.raw.rows[1].cells[0].text='2024-02-29 23:59:59.12',
 'civil changed':p=>p.receipts.raw.rows[1].cells[0].text='2024-02-29 23:59:58.123',
 'nonleap':p=>p.receipts.raw.rows[1].cells[0].text='2023-02-29 23:59:59.123',
 'timezone Z':p=>p.receipts.raw.rows[1].cells[0].text+='Z',
 'timezone offset':p=>p.receipts.raw.rows[1].cells[0].text+='+03:00',
 'NULL empty':p=>p.receipts.raw.rows[0].cells[0]={column:0,is_null:false,text:''},
 'missing row':p=>p.receipts.raw.rows.pop(),
 'partial':p=>p.receipts.raw.sample_complete=false,
 'foreign schema':p=>p.receipts.raw.columns[0].type='string',
 'row order':p=>p.receipts.raw.rows.reverse(),
 'missing applied':p=>delete p.receipts.raw.applied_format,
 'foreign applied':p=>p.receipts.raw.applied_format.table={view_guid:'foreign'},
 'wrong mask':p=>p.receipts.format_proof.datetime_formats[0].verified_format.mask='yyyy-mm-dd',
 'missing restoration':p=>delete p.receipts.format_restoration,
 'unverified restoration':p=>p.receipts.format_restoration.restored=false,
 'empty restoration drift':p=>p.receipts.format_restoration.default_datetime_restoration[0].settings={format_string:'other'},
 'empty restoration unverified':p=>p.receipts.format_restoration.default_datetime_restoration[0].verified_after_apply=false,
 'foreign graph':p=>p.receipts.workflow_return.node_context.node_id='foreign',
 'execute during read':p=>p.receipts.workflow_return.execution_started=true,
 'no return':p=>delete p.receipts.workflow_return,
 'foreign owner':p=>p.node.node_id='foreign',
 'foreign execution':p=>p.execution.execution_id='foreign',
 'unverified execution':p=>p.execution.owner_verified=false,
 'wrong source':p=>p.source_sha256='0'.repeat(64),
 'wrong role':p=>p.role='output',
 'filter enabled':p=>p.receipts.read_settings.filter_enabled=true,
};
for(const [name,mutate]of Object.entries(faults))test('Date civil refuses '+name,()=>{
 const b=binding(),p=civil(b);mutate(p);assert.throws(()=>verifyNativeCivil(p,nativeCivilExpectation(b,'input',f.sha256)));
});
test('Date compact actual INPUT receipt uses full child and refuses conflicting association',()=>{
 const b=binding();assert.deepEqual(Object.keys(b.execution).sort(),['execution_id','status']);
 assert.equal(nativeCivilExpectation(b,'input',f.sha256).execution,b.completed_child);
 for(const mutate of [x=>x.completed_child.execution_id='foreign',x=>x.execution.process_id='foreign',x=>x.execution.status='running']){
  const changed=clone(b);mutate(changed);assert.throws(()=>nativeCivilExpectation(changed,'input',f.sha256));
 }
});
test('Date full serialized three-stage identity keeps serial scope and freezes input before JS',async()=>{
 const {x,results}=await stages();
 assert.equal(verifyNativeRoundtripInput({node:{node_id:'n'},table:{port_guid:'p'},native_input:{native:results.before}},id),results.before);
 const outcome=verifyNativeRoundtripOutcome(results,id);assert.equal(outcome.status,'civil_and_native_identity_observed');assert.equal(outcome.exact_pass,true);assert.equal(outcome.g5_complete,false);
 assert.equal(results.output.exact.cells[1].native.civil_time_verified,false);assert.equal(results.output.exact.cells[1].native.epoch_verified,false);
 assert.deepEqual(x.f.counters,{sent:9,requests:9,responses:9});
 const frozen=freezeCivilEvidence(clone(results.before));assert.throws(()=>{frozen.exact.provenance.civil.receipts.raw.rows[1].cells[0].text='changed';});
 await assert.rejects(()=>x.bind('output'),/already reserved/);
 assert.throws(()=>adaptRead(results.before.raw,{expected:results.before.binding,lifecycle:results.before.lifecycle,dateProfile:'invented',consistency:results.before.exact.consistency}),/unknown temporal/);
});
for(const role of ['before','output','upstream'])for(const fault of ['bytes','civil','lifecycle','port','execution','schema','tag'])test('Date final revalidation refuses '+role+' '+fault,async()=>{
 const {results}=await stages(),p=results[role];
 if(fault==='bytes')p.raw.cells[1].payload[2]^=1;
 if(fault==='civil')(role==='before'?p.exact.provenance.civil:p.civil).receipts.raw.rows[1].cells[0].text='2024-02-29 23:59:58.123';
 if(fault==='lifecycle')p.lifecycle.releasedResponses--;
 if(fault==='port')p.binding.port_guid='foreign';
 if(fault==='execution')p.binding.completed_child.execution_id='foreign';
 if(fault==='schema')p.raw.schema[0].type=3;
 if(fault==='tag'){p.raw.cells[1].tag=5;p.raw.cells[1].payload[0]=5;}
 assert.throws(()=>verifyNativeRoundtripOutcome(results,id));
});
test('Date UI refusal prevents native read and JS proof',async()=>{
 const x=sourceEvidence(id),calls=[];
 const support=createJavascriptNativeInputSupport({fixtureId:id,onProof:()=>calls.push('proof'),onState:()=>{},
  createSupport:()=>({nodeApplyDriverFactory:()=>({readOutput:async()=>({ports:[]})})}),readNative:()=>calls.push('native')});
 await assert.rejects(()=>support.nodeApplyDriverFactory(x).readOutput({},x.ctx));assert.deepEqual(calls,[]);
});

test('Date baseline digest tolerates normalized transport origin, never altered significant evidence',async()=>{
 const {results}=await stages();results.before.binding.origin=new URL(results.before.binding.origin).href;
 assert.equal(verifyNativeRoundtripOutcome(results,id).exact_pass,true);
 results.before.exact.civil_baseline_sha256='0'.repeat(64);
 assert.throws(()=>verifyNativeRoundtripOutcome(results,id),/baseline differs/);
});

for(const mode of ['absent','capture','restoration-fails','return-fails'])test('production import Table callback preserves public response and requires cleanup: '+mode,async()=>{
 const b=binding(),p=civil(b),r=p.receipts,events=[];
 const source=readFileSync(new URL('../../client/lib/text-import-node.mjs',import.meta.url),'utf8');
 const start=source.indexOf('      async readOutput(read,ctx) {'),end=source.indexOf('      async verifyContinuation',start);
 let captured;
 const run=onTableRead=>vm.runInNewContext('({'+source.slice(start,end)+'})',{
  enter:()=>{},requireValue:(v,m)=>{if(!v)throw Error(m);},executionReceipt:b.completed_child,
  outputColumns:r.raw.columns,channel:{},verified:x=>({verified:true,cleanup_complete:true,effect_possible:false,...x}),
  openNewOutputTable:async()=>r.table_creation,configureTablePrecision:async()=>r.format_proof,
  prepareTableRead:async()=>r.read_settings,readTableOutputPages:async()=>r.raw,decodeTableOutput,
  restoreTablePrecision:async()=>{events.push('restore');if(mode==='restoration-fails')throw Error('restoration failed');return r.format_restoration;},
  returnFromOutputTable:async()=>{events.push('return');if(mode==='return-fails')throw Error('return failed');return r.workflow_return;},onTableRead
 }).readOutput({ports:[0],sample_rows:3,require_exact_numbers:true},{execution:b.execution,receipt_id:'receipt'});
 const capture=receipts=>{events.push('capture');captured=clone(receipts);};
 if(mode.endsWith('fails')){await assert.rejects(()=>run(capture));assert.equal(captured,undefined);return;}
 const without=await run(undefined);events.length=0;
 const result=await run(mode==='capture'?capture:undefined);
 assert.equal(JSON.stringify(result),JSON.stringify(without));assert.equal(Object.hasOwn(result,'raw'),false);
 if(mode==='capture'){
  assert.deepEqual(events,['restore','return','capture']);assert.deepEqual(captured,r);
  assert.equal(verifyNativeCivil({...p,receipts:captured},nativeCivilExpectation(b,'input',f.sha256)).verified,true);
 }else assert.deepEqual(events,['restore','return']);
});

for(const mode of ['pass','bad-civil-ack','cache-changed','restoration-fails'])test('production private civil OUTPUT keeps cleanup/order and exact ACK: '+mode,async()=>{
 const b={...binding(),node_id:'js'},p=civil(b,'output'),r=p.receipts,steps=[];
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async readNativeCivil('),end=source.indexOf('    async captureDropTopology()',start);
 let checks=0;
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
  nativeFixtureId:id,nativeReadUncertain:false,nativeInputFixture:f,validateNativeSource:()=>steps.push('source'),
  page:{evaluate:async()=>{steps.push('guard');if(++checks===2&&mode==='cache-changed')throw Error('cache changed');}},
  once:async(name,identity,fn)=>fn(),channel:()=>({}),
  openNewOutputTable:async()=>{steps.push('open');return r.table_creation;},
  configureTablePrecision:async()=>r.format_proof,prepareTableRead:async()=>r.read_settings,
  readTableOutputPages:async()=>{steps.push('read');return r.raw;},
  restoreTablePrecision:async()=>{steps.push('restore');if(mode==='restoration-fails')throw Error('restoration failed');return r.format_restoration;},
  returnFromOutputTable:async()=>{steps.push('return');return r.workflow_return;},passiveSurface:undefined,verifyNativeCivil,freezeCivilEvidence,structuredClone,
  record:async e=>{steps.push('record');return mode==='bad-civil-ack'?{...e,civil:{}}:clone(e);}
 });
 if(mode==='pass'){const actual=await runtime.readNativeCivil(p.node,b.completed_child,'output');assert.equal(actual.role,'output');assert.equal(steps.at(-1),'record');}
 else await assert.rejects(()=>runtime.readNativeCivil(p.node,b.completed_child,'output'));
 assert.ok(steps.indexOf('restore')>steps.indexOf('read'));
 if(mode!=='restoration-fails')assert.ok(steps.indexOf('return')>steps.indexOf('restore'));
 if(mode==='cache-changed'||mode==='restoration-fails')assert.equal(steps.includes('record'),false);
});

for(const fault of ['stored-cells','freshness','foreign-upstream','upstream-child'])test('Date final association rejects '+fault,async()=>{
 const {results}=await stages();
 if(fault==='stored-cells')results.before.exact.cells[1].native.bytes_le='0000000000000000';
 if(fault==='freshness')results.output.binding.completed_child.fresh_baseline.roots=[{process_id:results.output.binding.completed_child.group_id}];
 if(fault==='foreign-upstream'){
  const p=results.upstream;p.raw.node_id=p.binding.node_id=p.civil.node.node_id=p.civil.receipts.workflow_return.node_context.node_id='foreign';
 }
 if(fault==='upstream-child'){
  const p=results.upstream;p.binding.completed_child.process_id=p.binding.execution.process_id=p.raw.execution.process_id=p.civil.execution.process_id='99.1';
 }
 assert.throws(()=>verifyNativeRoundtripOutcome(results,id));
});

for(const mode of ['pass','bad-ack','civil-drift'])test('production Date final orchestration requires both civil roles and final exact ACK: '+mode,async()=>{
 const {results}=await stages(),steps=[];
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async readNativeRoundtrip(input,node,execution) {'),end=source.indexOf('    async readNativeCivil(',start);
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
  nativeFixtureId:id,nativeInputFixture:f,nativeRoundtripProbe:javascriptNativeRoundtripProbe(id),
  verifyNativeRoundtripInput,verifyNativeRoundtripOutcome,verifyNativeRoundtripExecution:()=>{},validateNativeSource:()=>{},
  page:{evaluate:async()=>{}},completeJavascriptNativeRoundtrip:()=>{},prepared:{document_id:'d',workflow_ref:{workflow_id:'w'}},
  deadline:Date.now()+10000,randomUUID:()=>String(steps.length),execute:()=>{},nativeReadUncertain:false,sessionId:'test',origin:'http://test',build:'7.4.2',
  readNativeRoundtrip:async({role,civil,onState})=>{steps.push('native-'+role);assert.equal(civil,results[role].civil);await onState(results[role].lifecycle);return results[role];},
  record:async event=>{if(!event.results)return event;steps.push('final');return mode==='bad-ack'?{...event,results:{}}:clone(event);},Date
 });
 runtime.readNativeCivil=async(node,execution,role)=>{steps.push('civil-'+role);if(mode==='civil-drift')results[role].civil.receipts.raw.rows[1].cells[0].text='2024-02-29 23:59:58.123';return results[role].civil;};
 const run=()=>runtime.readNativeRoundtrip({node:{node_id:'n'},table:{port_guid:'p'},native_input:{native:results.before}},{node_id:'js'},{});
 if(mode==='pass')assert.equal((await run()).outcome.exact_pass,true);
 else await assert.rejects(run);
 assert.deepEqual(steps.slice(0,4),['civil-output','native-output','civil-upstream','native-upstream']);
 if(mode==='civil-drift')assert.equal(steps.includes('final'),false);
});

// source73/profile55: output0 GUID repeats across the import and JS nodes.
// Reproduce that identity shape through the real serialized binding/read code;
// synthetic cell serials remain unrelated to any asserted epoch/civil mapping.
const sharedPortGuid='58f7e6c3-511e-39d7-8853-036e0a1a7612';
test('Date same output0 GUID on distinct owned nodes completes exact composite-identity roundtrip',async()=>{
 const {x,results}=await stages({sharedPortGuid});
 assert.equal(results.before.binding.port_guid,sharedPortGuid);
 assert.equal(results.output.binding.port_guid,sharedPortGuid);
 assert.notEqual(results.output.binding.node_id,results.before.binding.node_id);
 assert.notEqual(x.output,x.f.port);assert.notEqual(x.output.parent,x.f.port.parent);
 assert.equal(verifyNativeRoundtripOutcome(results,id).exact_pass,true);
 assert.deepEqual(x.f.counters,{sent:9,requests:9,responses:9});
});
const compositeFaults={
 'same input node':p=>{p.binding.node_id=p.raw.node_id=p.civil.node.node_id=p.civil.receipts.workflow_return.node_context.node_id='n';},
 'foreign document':p=>{p.binding.document_id=p.raw.document_id=p.civil.node.document_id=p.civil.receipts.workflow_return.node_context.document_id='foreign';},
 'foreign workflow':p=>{p.binding.workflow_id=p.raw.workflow_id=p.civil.node.workflow_id=p.civil.receipts.workflow_return.node_context.workflow_id='foreign';},
 'foreign package':p=>{p.binding.package_id=p.raw.package_id='foreign';},
 'foreign port binding':p=>p.binding.port_guid='foreign',
 'stale execution':p=>p.binding.completed_child.fresh_baseline.roots=[{process_id:p.binding.completed_child.group_id}],
 'foreign native source':p=>{p.raw.source={...p.raw.source,object:p.raw.source.object+1};},
 'missing native owner':p=>p.raw.owner_rechecked=false,
 'missing native cache':p=>p.raw.cache_identity_rechecked=false,
 'foreign read binding':p=>p.binding.read_id='foreign',
 'foreign script':p=>p.binding.source_sha256='0'.repeat(64),
};
for(const [name,mutate]of Object.entries(compositeFaults))test('Date shared GUID still refuses '+name,async()=>{
 const {results}=await stages({sharedPortGuid});mutate(results.output);
 assert.throws(()=>verifyNativeRoundtripOutcome(results,id));
});
test('Date shared GUID cannot substitute input port parent for JS native owner',async()=>{
 const x=await roundtrip({fixtureId:id,sharedPortGuid,change:x=>{x.output.parent=x.f.node;}});
 const b=await x.bind('output');
 await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'}));
});
