import {createJavascriptMetadataLifecycle} from './javascript-native-metadata.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {javascriptNamedIds,javascriptNamedCase,javascriptNamedProbe} from './javascript-native-named-cases.mjs';
import {verifyJavascriptNamedRead,verifyJavascriptNamedOutcome,verifyJavascriptNamedInput} from './javascript-native-named-contract.mjs';
import {createJavascriptNamedTrial,writeJavascriptNamedReport} from './javascript-native-named-run.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {failedStage,readFailed,inputProof} from './javascript-native-named.test.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {armJavascriptNativeRoundtrip,completeJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {verifyNativeRoundtripExecution} from './javascript-native-roundtrip-contract.mjs';
import {javascriptNativeRoundtripCode} from './javascript-native-roundtrip-binding.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {verifyJavascriptNativeErrorAttribution} from './javascript-native-error-attribution.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const clean={package_closed:true,logged_out:true,browser_closed:true};
const ids=['C-set-index','C-set-exact','C-set-case','C-set-missing'];
const pins=[['0',467,'83cac05c5b23db232bd5a89d522e15a6665997cb9083b451c855e914f3186b2e'],['"Value"',473,'3e840949275b92e7a275458ee0abb27d02fd16fc8483b7877a1d927338ccd05d'],['"value"',473,'f7ddd2dec629713271d2158b23e9f923ab152c538601b38c9b114a1797599557'],['"Missing"',475,'511b1301e74288974c138b8af0207b332277d0d95af9e7daa5f066375b4d6a26']];
// Synthetic native response bytes in existing VM transport, not a Loginom Set run.
const values=[['-9007199254740991','010000000000e0ff','candidate_written'],['0','0000000000000000','sentinel_unchanged'],['-9223372036854775808','0000000000000080','other_value'],['9223372036854775807','ffffffffffffff7f','other_value'],['9007199254740993','0100000000002000','other_value'],['99','6300000000000000','other_value'],[null,null,'other_value']];
function reply(value,tag=value===null?1:20){
 return (f,response)=>{
  if(f.dc.FModelNode===f.node.data)return;
  const bytes=response.$FData,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  view.setInt16(12,tag,true);view.setBigInt64(14,value===null?0n:BigInt(value),true);
 };
}
async function setRead(id,value='-9007199254740991',tag){
 const x=await roundtrip({fixtureId:'integer-safe',namedCaseId:id,reply:reply(value,tag)}),proof=inputProof(x),results={before:proof.before};
 for(const role of ['output','upstream']){
  const binding=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,binding,decodeVariantFrame,{operationId:role});
  const lifecycle=await javascriptNativeRoundtripStatus(x.f.page),expected={...binding,read_id:role};
  results[role]={binding:expected,raw,lifecycle,exact:verifyJavascriptNamedRead(raw,{binding:expected,lifecycle,input:proof.before,role})};
 }
 results.outcome=verifyJavascriptNamedOutcome(results,id);
 return {x,results,input:proof.input,execution:x.execution};
}
function runtime(receipt,steps=[]){
 return {checkNativeRoundtripBeforeExecute:async()=>steps.push('before'),captureExecutionBoundary:async()=>({native:{dispose:async()=>steps.push('dispose')}}),
  executeNode:async()=>{steps.push('execute');return receipt.execution;},verifyExecutionBoundary:async()=>steps.push('boundary'),
  readNativeRoundtrip:async()=>{steps.push('output-upstream');return receipt.results;},readNativeNamedFailure:async()=>{steps.push('failed-upstream');return receipt.results;},
  checkNativeNamedEvidence:async()=>steps.push('final-idle')};
}
async function runTrial(receipt,id,record=async event=>event,change={}){
 const trial=createJavascriptNamedTrial(id),steps=[];
 const args={runtime:runtime(receipt,steps),input:receipt.input,node:{document_id:'d',workflow_id:'w',node_id:'js'},sourceProbe:javascriptNamedProbe(id),deadline:Date.now()+30000,record,onExecution:async()=>{},...change};
 await trial.run(args);return {trial,steps,args};
}
for(const [index,id] of ids.entries()){
 test(id+' independently pinned exact eight-line source and immutable closed catalog',()=>{
  const c=javascriptNamedCase(id),p=javascriptNamedProbe(id);
  assert.equal(Buffer.byteLength(c.source),pins[index][1]);assert.equal(createHash('sha256').update(c.source).digest('hex'),pins[index][2]);
  assert.equal(c.source_sha256,pins[index][2]);assert.equal(c.source.split('\n').length,9);
  assert.equal(c.source.split('\n')[7],'OutputTable.Set('+pins[index][0]+',value);');
  assert.equal(c.source.split('\n')[2],'const value=InputTable.Get(1,"Value");');
  assert.equal(c.source.split('\n')[6],'OutputTable.Set("Value",0);');
  assert.equal(c.output_rows,1);assert.equal(p.schema_mode,'code');assert.equal(Object.isFrozen(c),true);
 });
 for(const [value,bytes,kind] of values)test(id+' actual native decoder observation '+value,async()=>{
  const r=await setRead(id,value),cell=r.results.output.exact.cells[0],strict=index<2,expected=strict?value==='-9007199254740991':true;
  assert.deepEqual(r.x.f.counters,{sent:9,requests:9,responses:9});assert.equal(cell.value,value);
  assert.equal(cell.is_null,value===null);assert.equal(cell.native.bytes_le,bytes??undefined);
  assert.equal(r.results.output.lifecycle.requests,1);assert.equal(r.results.upstream.lifecycle.requests,4);
  assert.equal(r.results.outcome.value_observation,kind);assert.deepEqual(r.results.outcome.observed_cell,cell);
  assert.equal(r.results.outcome.exact_pass,strict&&expected);assert.equal(r.results.outcome.value_characterized,!strict);
  const t=await runTrial(r,id);await assert.rejects(()=>t.trial.run(t.args),/no replay/);assert.equal(t.steps.filter(x=>x==='execute').length,1);
  const status=await t.trial.finish({cleanup:clean,record:async e=>e,persist:async()=>{}});
  assert.equal(status,expected?'CHARACTERIZED':'UNRESOLVED');
  const selected=t.trial.coverage.cases.find(c=>c.id===id);
  assert.equal(selected.case_complete,expected);assert.equal(selected.exact_pass,strict&&expected);assert.equal(t.trial.coverage.g5_complete,false);
  assert.equal(selected.execution_status,'completed');assert.equal(selected.evidence_status,'complete');
  assert.equal(selected.semantic_status,strict?(expected?'PASS_EXACT_CASE':'OBSERVED_MISMATCH'):'CHARACTERIZED_VALUE');
  assert.equal(t.trial.coverage.cases.filter(c=>c.status==='not_run').length,19);
  if(!expected)assert.equal(selected.reason,'strict_set_oracle_mismatch');
 });
 test(id+' failed native owner seals upstream only; Get attribution not transferable',async()=>{
  const r=await readFailed(await failedStage(id,{message:'Error: synthetic Set failure\n   at Anonymous function (<main>:8:1)\n   at module (<main>:1:1)'}));
  assert.deepEqual(r.x.f.counters,{sent:8,requests:8,responses:8});assert.equal(r.results.failed.source_sha256,pins[index][2]);
  assert.equal(r.results.outcome.case_complete,false);assert.equal(r.results.outcome.rejection_attributed,false);
  const t=await runTrial(r,id);assert.equal(await t.trial.finish({cleanup:clean,record:async e=>e,persist:async()=>{}}),'UNRESOLVED');
  assert.equal(t.trial.coverage.cases.find(c=>c.id===id).case_complete,false);
  await assert.rejects(()=>r.x.f.execute(javascriptNativeRoundtripCode({...r.results.upstream.binding,binding_id:'bad',roundtrip_role:'output'})));
  await assert.rejects(async()=>r.x.f.page.evaluate(completeJavascriptNativeRoundtrip,{execution:r.execution,source_sha256:r.c.source_sha256}));
  const calibration=readFileSync(new URL('./fixtures/javascript-error-attribution-reviewed.json',import.meta.url),'utf8');
  assert.throws(()=>verifyJavascriptNativeErrorAttribution({caseId:id,results:r.results,calibration}),/unsupported exact expression/);
  assert.equal(r.x.f.counters.sent,8);
 });
 test(id+' serialized arm rejects forged exact source with valid pin',()=>{
  const source=javascriptNamedProbe(id);
  for(const change of [p=>p.source+=' ',p=>p.source_sha256='0'.repeat(64),p=>p.named_case_id='C-set-unknown',p=>p.schema_mode='declared']){
   const args={...source,binding:{fixture_id:'integer-safe'}};change(args);
   assert.throws(()=>vm.runInNewContext('('+armJavascriptNativeRoundtrip.toString()+')(args)',{args}));
  }
 });
 test(id+' source and Done drift refuse before execution',async()=>{
  const x=await roundtrip({fixtureId:'integer-safe',namedCaseId:id,wizardOnly:true});
  x.lines[7]='OutputTable.Set(0,99);';await assert.rejects(async()=>x.prepare());assert.equal(x.f.counters.sent,4);
 });
}
for(const tag of [5,7,8,11])test('C unknown rejects non-Integer/native subtype '+tag,async()=>{
 await assert.rejects(()=>setRead('C-set-case','99',tag));
});
for(const [name,change] of Object.entries({
 case:r=>r.output.binding.named_case_id='C-set-missing',raw_case:r=>r.output.raw.named_case_id='C-set-index',
 source:r=>r.output.raw.source_sha256='0'.repeat(64),schema:r=>r.output.raw.schema[0].name='Other',label:r=>r.output.raw.schema[0].label='Other',type:r=>r.output.raw.schema[0].type=6,
 rows:r=>r.output.raw.row_count=4,duplicate:r=>r.output.raw.cells.push(clone(r.output.raw.cells[0])),owner:r=>r.output.binding.javascript_node_id='foreign',
 process:r=>r.output.binding.completed_child.process_record_id='foreign',input:r=>r.before.raw.cells[1].payload[2]^=1,
 upstream:r=>r.upstream.raw.cells[1].payload[2]^=1,upstream_process:r=>r.upstream.binding.completed_child.process_id='9.1',
 pending:r=>r.output.lifecycle.pending=1,release:r=>r.output.lifecycle.releasedResponses=0,
 stored_decimal:r=>r.output.exact.cells[0].value='0',stored_bytes:r=>r.output.exact.cells[0].native.bytes_le='0000000000000000'
}))test('C completed verifier refuses '+name,async()=>{
 const r=await setRead('C-set-case'),results=clone(r.results);change(results);assert.throws(()=>verifyJavascriptNamedOutcome(results,'C-set-case'));
});
for(const fault of ['case','source','hash','terminal-ack','deadline','outcome','owner'])test('C trial fail-closed reservation '+fault,async()=>{
 const id='C-set-exact',r=await setRead(id),trial=createJavascriptNamedTrial(id),probe=clone(javascriptNamedProbe(id)),steps=[];
 if(fault==='case')probe.named_case_id='C-set-index';if(fault==='source')probe.source+=' ';if(fault==='hash')probe.source_sha256='0'.repeat(64);
 if(fault==='outcome')r.results.outcome.exact_pass=false;
 const rt=runtime(r,steps);if(fault==='owner')rt.executeNode=async()=>({...r.execution,process_id:'99.1'});
 const args={runtime:rt,input:r.input,node:{node_id:'js'},sourceProbe:probe,deadline:fault==='deadline'?0:Date.now()+10000,
  record:async e=>fault==='terminal-ack'&&e.phase==='native_named_terminal_verified'?{...e,outcome:{}}:e,onExecution:async()=>{}};
 await assert.rejects(()=>trial.run(args));await assert.rejects(()=>trial.run(args),/no replay/);
 assert.equal(trial.coverage.cases.find(c=>c.id===id).case_complete,false);
});
for(const fault of ['package_closed','logged_out','browser_closed','final-ack','persist'])test('C final completion requires cleanup and persistence '+fault,async()=>{
 const id='C-set-missing',r=await setRead(id,null),t=await runTrial(r,id),cleanup={...clean};
 if(Object.hasOwn(cleanup,fault))cleanup[fault]=false;
 const finish=()=>t.trial.finish({cleanup,record:async e=>fault==='final-ack'?{...e,status:'WRONG'}:e,persist:async()=>{if(fault==='persist')throw Error('fsync fixture failure');}});
 if(['final-ack','persist'].includes(fault))await assert.rejects(finish);else assert.equal(await finish(),'CLEANUP_UNCONFIRMED');
 assert.equal(t.trial.coverage.cases.find(c=>c.id===id).case_complete,false);
});
for(const id of ids)test(id+' actual journal and fsync report retain native one-cell observation',async t=>{
 const r=await setRead(id,id==='C-set-missing'?null:'-9007199254740991'),directory=await mkdtemp(join(tmpdir(),'js-c-report-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const record=createExecutionJournal({directory,metadata:{sessionId:id,clientRevision:'source93'}}),run=await runTrial(r,id,record);
 await run.trial.finish({cleanup:clean,record,persist:async status=>writeJavascriptNamedReport(directory,{status,native_named:run.trial.coverage,native_roundtrip:r.results})});
 const saved=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
 assert.equal(saved.status,'CHARACTERIZED');assert.deepEqual(saved.native_roundtrip.outcome.observed_cell,r.results.output.exact.cells[0]);
 const events=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(events.map(e=>e.phase),['native_named_dispatch_reserved','native_named_terminal_verified','native_named_finalized']);
 assert.equal(events[2].coverage.cases.find(c=>c.id===id).case_complete,true);
});
for(const fault of ['ok','lifecycle','ack','upstream'])test('C actual runtime read method enforces OUTPUT1/upstream4 and final ACK '+fault,async()=>{
 const id='C-set-case',r=await setRead(id,'9223372036854775807'),steps=[];
 if(fault==='upstream')r.results.upstream.raw.cells[1].payload[2]^=1;
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async readNativeRoundtrip(input,node,execution) {'),end=source.indexOf('    async readNativeCivil(',start);
 const context={nativeTelemetryCaseId:undefined,nativeCalibrationId:undefined,nativeNamedCaseId:id,javascriptNamedCase,nativeFixtureId:'integer-safe',nativeInputFixture:{rows:4},nativeRoundtripProbe:javascriptNamedProbe(id),
  verifyJavascriptNamedInput,verifyJavascriptNamedOutcome,verifyNativeRoundtripExecution,freezeCivilEvidence,validateNativeSource:()=>{},
  page:{evaluate:async()=>{}},completeJavascriptNativeRoundtrip,prepared:{document_id:'d',workflow_ref:{workflow_id:'w'}},
  deadline:Date.now()+10000,randomUUID:()=>String(steps.length),execute:()=>{},nativeReadUncertain:false,metadataDiagnostic:false,metadataLifecycle:createJavascriptMetadataLifecycle(),sessionId:'C',origin:'http://test',build:'7.4.2',Date,
  readNativeRoundtrip:async({role,onState,options,namedCaseId})=>{assert.equal(namedCaseId,id);assert.equal(options.exclusiveNodeOperation(),true);steps.push(role);
   await onState(fault==='lifecycle'&&role==='output'?{...r.results[role].lifecycle,requests:4}:r.results[role].lifecycle);return r.results[role];},
  record:async e=>{const saved=clone(e);if(fault==='ack'&&saved.results)saved.results.outcome.observed_cell.value='0';return saved;}};
 const rt=vm.runInNewContext('({'+source.slice(start,end)+'})',context);
 rt.checkNativeNamedEvidence=async()=>{assert.equal(context.nativeReadUncertain,false);};
 const run=()=>rt.readNativeRoundtrip(r.input,{document_id:'d',workflow_id:'w',node_id:'js'},r.execution);
 if(fault==='ok'){const result=await run();assert.equal(result.outcome.status,'characterized_value');assert.equal(result.outcome.observed_cell.value,'9223372036854775807');assert.deepEqual(steps,['output','upstream']);}
 else await assert.rejects(run);
});
for(const mode of ['ok','native-ack','wrong-count'])test('C production OUTPUT driver bounded one-cell and journal ACK '+mode,async t=>{
 const id='C-set-missing',x=await roundtrip({fixtureId:'integer-safe',namedCaseId:id,reply:reply(null)}),f=x.f;
 f.b.package_id='d:w';x.before.package_id='d:w';const input=inputProof(x).before;
 f.dt.FTotalRowCount=mode==='wrong-count'?4:1;f.model.FPreviewManager.FPreviewVisible=true;
 Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:x.js,FCurrentPreviewPort:x.output});
 Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:x.js,Port:x.output});
 f.dc.FModelNode=x.js.data;f.dc.FDataSource=x.outputDs;f.dt.FDataSource=x.outputDs;f.store.proxy.dataSource=x.outputDs;
 const node={document_id:'d',workflow_id:'w',node_id:'js'},ctx={document_id:'d',node,workflow_ref:{workflow_id:'w',tab_tid:'tab',prefix:'TF'},execution:x.execution,deadline:f.b.deadline};
 const state={prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'output',port_guid:'js-output'}]},
  ui:{elements:[{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},node_preview_schema:{verified:true,port_guid:'js-output',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:'integer'}]}};
 const directory=await mkdtemp(join(tmpdir(),'js-c-driver-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const journal=createExecutionJournal({directory,metadata:{sessionId:'C',clientRevision:'source93'}});
 const run=()=>readNativeRoundtrip({options:{operation:{id:'C-output'},execute:f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),onRecord:async e=>{
  const saved=await journal(e);if(mode==='native-ack'&&saved.proof)saved.proof.lifecycle.releasedResponses=0;return saved;
 }},ctx,input,role:'output',namedCaseId:id,targetOrigin:'http://test',targetBuild:'7.4.2',onState:async()=>{}},
 {openPreview:async()=>{},verifyFrontends:async()=>[],verifyCountLoaders:()=>({}),createProcedure:()=>({observe:async({ready})=>{assert.equal(ready(state),true);return state;},perform:async({resolve})=>{assert.equal(resolve(state).ref,'close');f.model.FPreviewManager.FPreviewVisible=false;}})});
 if(mode==='ok'){const proof=await run();assert.equal(proof.binding.rows,1);assert.equal(proof.exact.cells[0].value,null);assert.equal(proof.lifecycle.requests,1);}
 else await assert.rejects(run,mode==='native-ack'?/acknowledgement/:/row count/);
 assert.equal(f.counters.sent,mode==='wrong-count'?4:5);
});
test('C admission does not enable D or arbitrary Set sources',()=>{
 assert.deepEqual(javascriptNamedIds.filter(id=>id.startsWith('C-')),ids);
 for(const id of ['C-set-custom','D-name-cyrillic','D-name-latin'])assert.throws(()=>javascriptNamedCase(id));
});
for(const mode of ['success','mismatch','failed','package_closed','logged_out','browser_closed','evidence'])test('C production report finalization '+mode,async()=>{
 const id=mode==='mismatch'?'C-set-index':'C-set-case';
 const r=mode==='failed'?await readFailed(await failedStage(id)):await setRead(id,'0');
 const t=await runTrial(r,id),report={status:'PENDING_EVIDENCE',cleanup:{...clean}};
 if(Object.hasOwn(report.cleanup,mode))report.cleanup[mode]=false;
 const source=readFileSync(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const start=source.lastIndexOf('  if (!report.cleanup.package_closed'),end=source.indexOf('  console.log(JSON.stringify({status:report.status',start);
 const publish=vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{report,calibrationTrial:null,telemetryTrial:null,coercionTrial:null,namedTrial:t.trial,
  executionRecord:async e=>e,Date,save:async()=>{if(mode==='evidence')throw Error('fsync');},redactor:{text:x=>x}});
 await publish();
 assert.equal(report.status,mode==='success'?'CHARACTERIZED':['mismatch','failed'].includes(mode)?'UNRESOLVED':mode==='evidence'?'EVIDENCE_UNCONFIRMED':'CLEANUP_UNCONFIRMED');
 const selected=t.trial.coverage.cases.find(c=>c.id===id);
 assert.equal(selected.case_complete,mode==='success');assert.equal(selected.exact_pass,false);
 assert.equal(selected.evidence_status,['success','mismatch','failed'].includes(mode)?'complete':'incomplete');
});
