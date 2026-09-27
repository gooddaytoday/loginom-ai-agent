import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {javascriptCalibrationIds,javascriptCalibrationCase} from './javascript-calibration-cases.mjs';
import {verifyNativeRoundtripRead} from './javascript-native-roundtrip-contract.mjs';
import {javascriptNamedIds,javascriptNamedCase,javascriptNamedProbe} from './javascript-native-named-cases.mjs';
import {verifyJavascriptNamedInput,verifyJavascriptNamedRead,verifyJavascriptNamedOutcome} from './javascript-native-named-contract.mjs';
import {createJavascriptNamedTrial,writeJavascriptNamedReport} from './javascript-native-named-run.mjs';
import {verifyNamedFailureOutcome,sealJavascriptNamedFailure,verifyNamedFailureWitness} from './javascript-native-named-failure.mjs';
import {readNativeNamedFailure} from './javascript-native-named-failure-driver.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {javascriptNativeRoundtripCode} from './javascript-native-roundtrip-binding.mjs';
import {nativeInputProvenance,verifyNativeInputRead} from './javascript-native-input-contract.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {completeJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {sourceEvidence} from './javascript-native-input.test.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const clean={package_closed:true,logged_out:true,browser_closed:true};
export function inputProof(x){
 const binding={...x.f.b,origin:new URL(x.f.b.origin).href,read_id:'before'},raw=x.inputRaw??x.before,lifecycle={...clone(x.f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
 // Production input driver verifies these source texts, then removes them before journaling.
 delete binding.cookie_sources;delete binding.count_loader_sources;
 const exact=verifyNativeInputRead(raw,{binding,lifecycle,provenance:nativeInputProvenance(sourceEvidence('integer-safe'))});
 const before={binding,raw,lifecycle,exact};
 return {before,input:{node:{document_id:'d',workflow_id:'w',node_id:'n'},table:{port_guid:'p'},native_input:{native:before}}};
}
async function stages(id,{marker=10n,tag=20}={}){
 const x=await roundtrip({fixtureId:'integer-safe',namedCaseId:id,reply:(f,response,request)=>{
  if((id.startsWith('A-isnull-')||id.startsWith('B-'))&&f.dc.FModelNode!==f.node.data){
   const bytes=response.$FData,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   view.setInt16(12,id.startsWith('B-')?tag:20,true);view.setBigInt64(14,id.startsWith('B-')?marker:request.row===0?1n:0n,true);
  }
 }}),proof=inputProof(x),results={before:proof.before};
 for(const role of ['output','upstream']){
  const binding=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,binding,decodeVariantFrame,{operationId:role});
  const lifecycle=await javascriptNativeRoundtripStatus(x.f.page),expected={...binding,read_id:role};
  results[role]={binding:expected,raw,lifecycle,exact:verifyJavascriptNamedRead(raw,{binding:expected,lifecycle,input:proof.before,role})};
 }
 results.outcome=verifyJavascriptNamedOutcome(results,id);return {x,results,input:proof.input,execution:x.execution};
}
export async function failedStage(id,{beforeSeal,reply,message='Error: unexpected test failure'}={}){
 const calibration=javascriptCalibrationIds.includes(id);
 const x=await roundtrip({fixtureId:'integer-safe',...(calibration?{calibrationId:id}:{namedCaseId:id}),wizardOnly:true,reply});
 await x.prepare();x.dispose();await x.seal();
 const proof=inputProof(x),node={document_id:'d',workflow_id:'w',node_id:'js'},c=calibration?{...javascriptCalibrationCase(id),id}:javascriptNamedCase(id);
 const execution={verified:true,status:'failed',failure_verified:true,owner_verified:true,cleanup_complete:true,output_refreshed:false,
  node,root_id:'1',group_id:'4',group_record_id:'4',process_id:'4.1',process_record_id:'5',execution_id:'d:1:4',
  ownership_source:'native_process_model_identity_and_show_node',error_source:'native_child_error_details',error:{code:'NODE_EXECUTION_FAILED',message:message.trim().slice(0,1000)},
  trial:{phase:'initial',node_id:'js',source_sha256:c.source_sha256},fresh_baseline:{node,root_id:'1',roots:[{process_id:'2'}]},
  launch_identity:{node,root_id:'1',group_id:'4',group_record_id:'4',execution_id:'d:1:4'}};
 const child={internalId:5,data:{id:'4.1',Status:2,ErrorDetails:message,ModelNode:x.js.data,ProgressBarCls:'bg-progress-ptpsError',CanCancelProcess:false},childNodes:[]};
 const group={internalId:4,data:{id:'4',Status:2,ErrorDetails:'Failed child',loaded:true,ProgressBarCls:'bg-progress-ptpsError',CanCancelProcess:false},childNodes:[child]};
 x.f.root.childNodes.push(group);
 const seal=()=>x.f.page.evaluate(sealJavascriptNamedFailure,{...(calibration?{calibration_id:id}:{named_case_id:id}),source:c.source,source_sha256:c.source_sha256,execution});
 const fixture={x,...proof,node,c,execution,child,group,seal};beforeSeal?.(fixture);return fixture;
}
export async function readFailed(s){
 const identity=javascriptCalibrationIds.includes(s.c.id)?{calibration_id:s.c.id}:{named_case_id:s.c.id};
 const failed=await s.seal();verifyNamedFailureWitness(failed,s.execution,s.node,s.c.id);
 s.x.f.model.FPreviewManager.FPreviewVisible=true;
 const binding=await s.x.f.execute(javascriptNativeRoundtripCode({...s.x.f.b,binding_id:'upstream',roundtrip_role:'upstream',...identity,input_fixture_id:'integer-safe',source_sha256:s.c.source_sha256,failed_terminal:failed}));
 const raw=await readJavascriptNativeRoundtrip(s.x.f.page,binding,decodeVariantFrame,{operationId:'upstream'});
 const lifecycle=await javascriptNativeRoundtripStatus(s.x.f.page),expected={...binding,read_id:'upstream'};
 const upstream={binding:expected,raw,lifecycle,exact:verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input:s.before,role:'upstream'})};
 const results={before:s.before,failed,upstream,output:{status:'not_read_failed_execution'}};
 results.outcome=verifyNamedFailureOutcome(results,s.c.id);return {...s,results};
}
function runtime(receipt,calls){
 return {checkNativeNamedEvidence:async()=>calls.push('named-evidence'),checkNativeRoundtripBeforeExecute:async()=>calls.push('check'),captureExecutionBoundary:async()=>({native:{dispose:async()=>calls.push('dispose')}}),
  verifyExecutionBoundary:async()=>calls.push('boundary'),executeNode:async()=>{calls.push('execute');return receipt.execution;},
  readNativeRoundtrip:async()=>{calls.push('output');return receipt.results;},readNativeNamedFailure:async()=>{calls.push('failed-upstream');return receipt.results;}};
}
for(const id of javascriptNamedIds.filter(id=>id.startsWith('A-'))){
 test(id+' real native transport and independent exact oracle',async()=>{
  const r=await stages(id);assert.equal(r.results.outcome.exact_pass,true);assert.equal(r.results.outcome.g5_complete,false);
  assert.deepEqual(clone(r.results.output.exact.cells.map(c=>c.value)),id.startsWith('A-isnull-')?['1','0','0','0']:[null,'-9007199254740991','0','9007199254740991']);
  assert.deepEqual(r.x.f.counters,{sent:12,requests:12,responses:12});
  const cap=r.x.f.env.__loginomJavascriptNativeRoundtripV1;assert.equal(cap.named_case_id,id);assert.equal(cap.input_fixture_id,'integer-safe');
  assert.equal(Object.getOwnPropertyDescriptor(cap,'named_case_id').writable,false);await assert.rejects(()=>r.x.bind('output'),/reserved/);
 });
 test(id+' failed native owner and original upstream, zero OUTPUT RPC',async()=>{
  const r=await readFailed(await failedStage(id));assert.equal(r.results.outcome.case_complete,false);assert.equal(r.results.outcome.rejection_attributed,false);
  assert.deepEqual(r.x.f.counters,{sent:8,requests:8,responses:8});assert.equal(r.x.f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
  await assert.rejects(async()=>r.x.f.page.evaluate(completeJavascriptNativeRoundtrip,{execution:r.execution,source_sha256:r.c.source_sha256}));
  await assert.rejects(()=>r.x.f.execute(javascriptNativeRoundtripCode({...r.results.upstream.binding,binding_id:'bad',roundtrip_role:'output'})));assert.equal(r.x.f.counters.sent,8);
 });
 for(const [name,change]of Object.entries({
  raw_case:r=>r.output.raw.named_case_id='A-get-exact-other',raw_source:r=>r.output.raw.source_sha256='0'.repeat(64),case:r=>r.output.binding.named_case_id=javascriptNamedIds[(javascriptNamedIds.indexOf(id)+1)%8],future:r=>r.output.binding.named_case_id='C-set-index',
  input_fixture:r=>r.output.binding.input_fixture_id='real',old_fixture:r=>r.before.binding.fixture_id='real',source:r=>r.output.binding.source_sha256='0'.repeat(64),
  execution_source:r=>r.output.binding.completed_child.trial.source_sha256='0'.repeat(64),execution_id:r=>r.output.binding.completed_child.execution_id='d:foreign',
  failed:r=>r.output.binding.completed_child.status='failed',stale:r=>r.output.binding.completed_child.fresh_baseline.roots.push({process_id:r.output.binding.completed_child.group_id}),
  schema:r=>{r.output.raw.schema[0].name=r.output.binding.schema[0].name='Other';},label:r=>{r.output.raw.schema[0].label=r.output.binding.schema[0].label='Other';},
  type:r=>{r.output.raw.schema[0].type=r.output.binding.schema[0].type=3;},count:r=>{r.output.raw.row_count=r.output.binding.row_count=3;},
  missing_cell:r=>r.output.raw.cells.pop(),bytes:r=>r.output.raw.cells[1].payload[2]^=1,tag:r=>r.output.raw.cells[1].payload[0]=5,
  stored_output:r=>r.output.exact.cells[1].value='42',stored_input:r=>r.before.exact.cells[1].value='42',input_bytes:r=>r.before.raw.cells[1].payload[2]^=1,
  upstream_bytes:r=>r.upstream.raw.cells[1].payload[2]^=1,upstream_owner:r=>{r.upstream.binding.node_id=r.upstream.raw.node_id='foreign';},
  upstream_child:r=>r.upstream.binding.completed_child.process_record_id='new',upstream_source:r=>{r.upstream.binding.source.object=r.upstream.raw.source.object=99;},
  upstream_js:r=>r.upstream.binding.javascript_node_id='foreign',stored_upstream:r=>r.upstream.exact.cells[0].value='0',
  release:r=>r.output.lifecycle.releasedResponses=3,pending:r=>r.upstream.lifecycle.pending=1,retired:r=>r.output.lifecycle.retired=true,owner:r=>r.output.raw.owner_rechecked=false,
 }))test(id+' refuses '+name,async()=>{const r=await stages(id);change(r.results);assert.throws(()=>verifyJavascriptNamedOutcome(r.results,id));});
 for(const failed of [false,true])test(id+' production dispatch, real journal and final cleanup '+failed,async t=>{
  const receipt=failed?await readFailed(await failedStage(id)):await stages(id),trial=createJavascriptNamedTrial(id),calls=[];
  const directory=await mkdtemp(join(tmpdir(),'js-named-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const record=createExecutionJournal({directory,metadata:{sessionId:'named',clientRevision:'source83'}}),report={execution_probe:{},gates_closed:[]};
  const source=readFileSync(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=source.indexOf('    if(namedTrial){'),end=source.indexOf('    await executionRuntime.checkNativeRoundtripBeforeExecute();',start);
  const run=vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{namedTrial:trial,report,executionRuntime:runtime(receipt,calls),executionInput:receipt.input,executionNode:{document_id:'d',workflow_id:'w',node_id:'js'},probe:javascriptNamedProbe(id),deadline:Date.now()+30000,executionRecord:record,save:async()=>{}});
  await run();assert.equal(calls.filter(c=>c==='execute').length,1);assert.equal(calls.includes('output'),!failed);
  const status=await trial.finish({cleanup:clean,record,persist:async status=>writeJavascriptNamedReport(directory,{status,native_named:trial.coverage})});
  assert.equal(status,failed?'UNRESOLVED':'CHARACTERIZED');const saved=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
  assert.equal(saved.native_named.cases.length,16);assert.equal(saved.native_named.cases.filter(c=>c.status==='not_run').length,15);
  assert.equal(saved.native_named.cases.find(c=>c.id===id).case_complete,!failed);assert.equal(saved.native_named.coverage_complete,false);await assert.rejects(run,/no replay/);
 });
}
for(const fault of ['source','hash','case','input-fixture','input','schema','dispatch-ack','terminal-ack','unknown-terminal','different-execution','result','boundary','dispose','post-ack','deadline'])test('named orchestration refuses '+fault,async()=>{
 const id=javascriptNamedIds[0],receipt=await stages(id),trial=createJavascriptNamedTrial(id),calls=[],rt=runtime(receipt,calls),probe=clone(javascriptNamedProbe(id));
 if(fault==='source')probe.source+=' ';if(fault==='hash')probe.source_sha256='0'.repeat(64);if(fault==='case')probe.named_case_id=javascriptNamedIds[1];
 if(fault==='input-fixture')probe.input_fixture_id='real';if(fault==='schema')probe.output_schema[0].type=3;if(fault==='input')receipt.input.native_input.native.raw.cells[1].payload[2]^=1;
 if(fault==='unknown-terminal')receipt.execution.status='cancelled';if(fault==='different-execution')rt.executeNode=async()=>({...receipt.execution,process_id:'different'});
 if(fault==='result')receipt.results.outcome.exact_pass=false;if(fault==='post-ack')rt.checkNativeNamedEvidence=async()=>{throw Error('post ACK drift');};if(fault==='boundary')rt.verifyExecutionBoundary=async()=>{throw Error('boundary');};
 if(fault==='dispose')rt.captureExecutionBoundary=async()=>({native:{dispose:async()=>{throw Error('dispose');}}});
 const record=async e=>fault==='dispatch-ack'&&e.phase==='native_named_dispatch_reserved'||fault==='terminal-ack'&&e.phase==='native_named_terminal_verified'?{}:clone(e);
 const run=()=>trial.run({runtime:rt,input:receipt.input,node:{document_id:'d',workflow_id:'w',node_id:'js'},sourceProbe:probe,deadline:fault==='deadline'?0:Date.now()+30000,record,onExecution:async()=>{}});
 await assert.rejects(run);await assert.rejects(run,/no replay/);await trial.finish({cleanup:clean,record:async e=>e,persist:async()=>{}});assert.equal(trial.coverage.cases[0].case_complete,false);
});
for(const fault of ['package_closed','logged_out','browser_closed','cleanup-error','work-failure','final-ack','report-fsync'])test('named successful read cannot bypass '+fault,async()=>{
 const id=javascriptNamedIds[0],receipt=await stages(id),trial=createJavascriptNamedTrial(id),cleanup={...clean};
 await trial.run({runtime:runtime(receipt,[]),input:receipt.input,node:{node_id:'js'},sourceProbe:javascriptNamedProbe(id),deadline:Date.now()+30000,record:async e=>e,onExecution:async()=>{}});
 if(Object.hasOwn(cleanup,fault))cleanup[fault]=false;if(fault==='cleanup-error')cleanup.failure='uncertain';
 const finish=()=>trial.finish({cleanup,failure:fault==='work-failure'?{}:undefined,record:async e=>fault==='final-ack'?{}:e,persist:async()=>{if(fault==='report-fsync')throw Error('fsync');}});
 if(['final-ack','report-fsync'].includes(fault))await assert.rejects(finish);else assert.notEqual(await finish(),'CHARACTERIZED');
 assert.equal(trial.coverage.cases[0].case_complete,false);assert.notEqual(trial.coverage.cases[0].exact_pass,true);
});
for(const [name,change]of Object.entries({owner:s=>s.child.data.ModelNode={},error:s=>s.child.data.ErrorDetails='different',truncated:s=>s.child.data.ErrorDetails='x'.repeat(1001),source:s=>s.execution.trial.source_sha256='0'.repeat(64),pending:s=>s.x.f.env.__loginomJavascriptNativeInputReadV1.last.pending=1}))test('named failed seal rejects '+name,async()=>{
 const s=await failedStage(javascriptNamedIds[0],{beforeSeal:change});await assert.rejects(async()=>s.seal());assert.equal(s.x.f.counters.sent,4);
});
test('private CLI refuses future stages, duplicate selection, source and input override before browser',async()=>{
 for(const id of ['B-get-unknown','C-set-index','D-name-cyrillic',javascriptNamedIds.join(','),'__proto__'])assert.throws(()=>javascriptNamedCase(id));
 for(const args of [['--native-named-case','B-get-unknown'],['--native-named-case',javascriptNamedIds[0],'--native-fixture','integer-safe'],['--native-named-case',javascriptNamedIds[0],'--native-named-case',javascriptNamedIds[1]],['--native-named-case',javascriptNamedIds[0],'--source','custom']])await assert.rejects(()=>runJavascriptOperator(args,{nativeRoundtrip:true}));
 await assert.rejects(()=>runJavascriptOperator(['--native-named-case',javascriptNamedIds[0]]));await assert.rejects(()=>runJavascriptOperator(['--native-named-case',javascriptNamedIds[0]],{nativeInputOnly:true}));
});
for(const mode of ['ok','seal-ack','native-ack','final-ack','after-ack-drift','after-ack-pending'])test('named production failed driver holds owner through ACK '+mode,async()=>{
 const s=await failedStage(javascriptNamedIds[0]),f=s.x.f,events=[];
 f.b.package_id='d:w';s.before.binding.package_id='d:w';s.before.raw.package_id='d:w';
 s.before.exact=verifyNativeInputRead(s.before.raw,{binding:s.before.binding,lifecycle:s.before.lifecycle,provenance:s.before.exact.provenance});
 const state={prepared_node_context:{...s.input.node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'input-output',port_guid:'p'}]},
  ui:{elements:[{tid:'input-output',ref:'input-output',allowed_actions:['click','press']},{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},
  node_preview_schema:{verified:true,port_guid:'p',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:'integer'}]}};
 const readUpstream=args=>readNativeRoundtrip(args,{verifyFrontends:async()=>[],verifyCountLoaders:()=>({fixture:'count-loader-source'}),openPreview:async()=>assert.fail('No OUTPUT'),
  createProcedure:()=>({observe:async({ready})=>{assert.equal(ready(state),true);return state;},perform:async({resolve})=>{const action=resolve(state);if(action.key==='F3')f.model.FPreviewManager.FPreviewVisible=true;if(action.ref==='close')f.model.FPreviewManager.FPreviewVisible=false;}})});
 const run=()=>readNativeNamedFailure({page:f.page,input:s.input,node:s.node,execution:s.execution,caseId:s.c.id,
  workflow:{workflow_id:'w',tab_tid:'tab',prefix:'TF'},deadline:f.b.deadline,targetOrigin:'http://test',targetBuild:'7.4.2',validateSource:()=>{},
  options:{execute:f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),onRecord:async e=>{
   events.push(e.phase);const saved=clone(e);
   if(mode==='seal-ack'&&saved.failed)saved.failed.error_details='changed';if(mode==='native-ack'&&saved.proof)saved.proof.lifecycle.releasedResponses=0;
   if(mode==='final-ack'&&saved.results)saved.results.outcome.rejection_attributed=true;
   if(mode==='after-ack-drift'&&saved.results)s.child.data.ErrorDetails+=' changed';
   if(mode==='after-ack-pending'&&saved.results)f.env.__loginomJavascriptNativeRoundtripReadV1.active={pending:1};return saved;
  }},onState:async()=>{}},{readUpstream});
 if(mode==='ok'){const result=await run();assert.equal(result.outcome.case_complete,false);assert.ok(Object.isFrozen(result.upstream.raw));}
 else await assert.rejects(run);
 assert.equal(f.counters.sent,mode==='seal-ack'?4:8);assert.equal(f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
});
for(const mode of ['success','failed','package_closed','logged_out','browser_closed','evidence'])test('production named finalization publishes justified status '+mode,async()=>{
 const id=javascriptNamedIds[0],receipt=mode==='failed'?await readFailed(await failedStage(id)):await stages(id),trial=createJavascriptNamedTrial(id);
 await trial.run({runtime:runtime(receipt,[]),input:receipt.input,node:{node_id:'js'},sourceProbe:javascriptNamedProbe(id),deadline:Date.now()+30000,record:async e=>e,onExecution:async()=>{}});
 const report={status:'PENDING_EVIDENCE',cleanup:{...clean}};if(Object.hasOwn(report.cleanup,mode))report.cleanup[mode]=false;
 const source=readFileSync(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=source.lastIndexOf('  if (!report.cleanup.package_closed'),end=source.indexOf('  console.log(JSON.stringify({status:report.status',start);
 const publish=vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{report,calibrationTrial:null,coercionTrial:null,namedTrial:trial,executionRecord:async e=>e,Date,save:async()=>{if(mode==='evidence')throw Error('fsync');},redactor:{text:x=>x}});
 await publish();assert.equal(report.status,mode==='success'?'CHARACTERIZED':mode==='failed'?'UNRESOLVED':mode==='evidence'?'EVIDENCE_UNCONFIRMED':'CLEANUP_UNCONFIRMED');
 assert.equal(trial.coverage.cases[0].case_complete,mode==='success');assert.equal(trial.coverage.cases[0].exact_pass,mode==='success');
});
for(const id of javascriptNamedIds)test(id+' catalogue source immutable and closed A/B',()=>{
 const c=javascriptNamedCase(id),p=javascriptNamedProbe(id);assert.ok(Object.isFrozen(c));assert.ok(Object.isFrozen(p.output_schema[0]));
 assert.equal(createHash('sha256').update(c.source).digest('hex'),p.source_sha256);assert.equal(c.input_fixture_id,'integer-safe');assert.equal(p.named_case_id,id);
 assert.throws(()=>{c.input_fixture_id='real';});assert.throws(()=>{p.output_schema[0].name='Other';});
});

for(const mode of ['ok','pending','retired','source','input-field','named-case','release'])test('actual final named page capability refuses post-ACK drift '+mode,async()=>{
 const r=await stages(javascriptNamedIds[0]),f=r.x.f;
 if(mode==='pending')f.env.__loginomJavascriptNativeRoundtripReadV1.active={pending:1};
 if(mode==='retired')f.env.__loginomJavascriptNativeRoundtripReadV1.poisoned=true;
 if(mode==='source')f.env.__loginomJavascriptNativeRoundtripV1.source+=' ';
 if(mode==='input-field')f.env.__loginomJavascriptNativeRoundtripV1.input.field.Name='Other';
 if(mode==='release')f.env.__loginomJavascriptNativeRoundtripReadV1.last.releasedResponses=0;
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async checkNativeNamedEvidence() {'),end=source.indexOf('    async readNativeRoundtrip(',start);
 const check=vm.runInNewContext('({'+source.slice(start,end)+'})',{nativeCalibrationId:undefined,nativeNamedCaseId:mode==='named-case'?javascriptNamedIds[1]:javascriptNamedIds[0],nativeReadUncertain:false,validateNativeSource:()=>{},page:f.page});
 if(mode==='ok')await check.checkNativeNamedEvidence();else await assert.rejects(()=>check.checkNativeNamedEvidence());
});

for(const mode of ['ok','input-ack','arm-ack','graph-ack'])test('named production pre-JS ACK accepts journal metadata and rejects changed evidence '+mode,async t=>{
 const r=await stages(javascriptNamedIds[0]);
 const directory=await mkdtemp(join(tmpdir(),'js-named-preflight-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const journal=createExecutionJournal({directory,metadata:{sessionId:'named-arm',clientRevision:'source83'}}),events=[];
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async armNativeRoundtrip(input) {'),end=source.indexOf('    async readNativeCoercionFailure(',start);
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',{
  nativeCalibrationId:undefined,nativeInputOnly:true,nativeReadUncertain:false,nativeNamedCaseId:javascriptNamedIds[0],nativeFixtureId:'integer-safe',
  nativeRoundtripProbe:javascriptNamedProbe(javascriptNamedIds[0]),verifyJavascriptNamedInput,validateNativeSource:()=>{},
  armJavascriptNativeRoundtrip:()=>{},bindJavascriptNativeRoundtripGraph:()=>{},page:{evaluate:async()=>({verified:true})},
  record:async event=>{events.push(event.phase);const saved=await journal(event);
   if(mode==='ok'&&event.proof)assert.equal(JSON.stringify(saved.proof),JSON.stringify(event.proof));
   if(mode==='input-ack'&&event.phase==='native_roundtrip_input_before_js')saved.proof={};
   if(mode==='arm-ack'&&event.phase==='native_roundtrip_armed')saved.verified=false;
   if(mode==='graph-ack'&&event.phase==='native_roundtrip_graph_bound')saved.verified=false;
   return saved;}
 });
 const run=async()=>{await runtime.armNativeRoundtrip(r.input);await runtime.bindNativeRoundtripGraph({node_id:'js'},'js-input');};
 if(mode==='ok'){await run();assert.equal(events.length,3);}else await assert.rejects(run,/ACK differs/);
});

const bIds=javascriptNamedIds.filter(id=>id.startsWith('B-'));
const bMarkers=id=>id.startsWith('B-get-')?[10,11,12]:id.startsWith('B-isnull-')?[10,11,14,15]:[10,11,13];
for(const id of bIds){
 for(const marker of [10,11,12,13,14,15,99])test(id+' native marker '+marker+' is characterized only for its API',async()=>{
  const r=await stages(id,{marker:BigInt(marker)}),accepted=bMarkers(id).includes(marker);
  assert.equal(r.results.output.exact.row_count,1);assert.equal(r.results.upstream.exact.row_count,4);
  assert.deepEqual(r.x.f.counters,{sent:9,requests:9,responses:9});
  assert.equal(r.results.outcome.return_characterized,accepted);assert.notEqual(r.results.outcome.case_complete,true);assert.equal(r.results.outcome.exact_pass,false);
  assert.equal(r.results.outcome.marker,String(marker));assert.equal(r.results.outcome.characterization_only,true);
  const trial=createJavascriptNamedTrial(id),calls=[];
  await trial.run({runtime:runtime(r,calls),input:r.input,node:{node_id:'js'},sourceProbe:javascriptNamedProbe(id),deadline:Date.now()+30000,record:async e=>e,onExecution:async()=>{}});
  let persisted;
  assert.equal(await trial.finish({cleanup:clean,record:async e=>e,persist:async status=>{persisted={status,coverage:trial.coverage};}}),accepted?'CHARACTERIZED':'UNRESOLVED');
  const selected=persisted.coverage.cases.find(c=>c.id===id);
  assert.equal(selected.case_complete,accepted);assert.equal(selected.exact_pass,false);assert.equal(selected.marker,String(marker));
  assert.equal(persisted.coverage.cases.length,16);assert.equal(persisted.coverage.cases.filter(c=>c.status==='not_run').length,15);
  assert.equal(persisted.coverage.coverage_complete,false);assert.equal(persisted.coverage.g5_complete,false);
  assert.equal(calls.filter(c=>c==='execute').length,1);await assert.rejects(()=>trial.run({}),/no replay/);
 });
 test(id+' owned failed child remains unattributed with only 4+4 cells',async()=>{
  const r=await readFailed(await failedStage(id));
  assert.equal(r.results.outcome.case_complete,false);assert.equal(r.results.outcome.exact_pass,false);
  assert.equal(r.results.outcome.rejection_attributed,false);assert.deepEqual(r.x.f.counters,{sent:8,requests:8,responses:8});
  assert.equal(r.x.f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
  await assert.rejects(()=>r.x.f.execute(javascriptNativeRoundtripCode({...r.results.upstream.binding,binding_id:'bad',roundtrip_role:'output'})),/upstream/);
  const calls=[],trial=createJavascriptNamedTrial(id);
  await trial.run({runtime:runtime(r,calls),input:r.input,node:r.node,sourceProbe:javascriptNamedProbe(id),deadline:Date.now()+30000,record:async e=>e,onExecution:async()=>{}});
  assert.equal(await trial.finish({cleanup:clean,record:async e=>e,persist:async()=>{}}),'UNRESOLVED');
  assert.equal(calls.includes('output'),false);assert.deepEqual(r.x.f.counters,{sent:8,requests:8,responses:8});
 });
 for(const tag of [1,3,5])test(id+' rejects NULL/double/non-integer native tag '+tag,async()=>{await assert.rejects(()=>stages(id,{tag}));});
 for(const [name,change]of Object.entries({
  source:r=>r.output.raw.source_sha256='0'.repeat(64),case:r=>r.output.binding.named_case_id=bIds[(bIds.indexOf(id)+1)%8],
  input_fixture:r=>r.output.binding.input_fixture_id='real',source_trial:r=>r.output.binding.completed_child.trial.source_sha256='0'.repeat(64),
  owner:r=>r.output.raw.owner_rechecked=false,schema:r=>{r.output.raw.schema[0].name=r.output.binding.schema[0].name='Other';},
  label:r=>{r.output.raw.schema[0].label=r.output.binding.schema[0].label='Other';},type:r=>{r.output.raw.schema[0].type=r.output.binding.schema[0].type=3;},
  count:r=>{r.output.raw.row_count=r.output.binding.row_count=4;},missing:r=>r.output.raw.cells.pop(),
  bytes:r=>r.output.raw.cells[0].payload[2]^=1,stored:r=>r.output.exact.cells[0].value='11',
  release:r=>r.output.lifecycle.releasedResponses=0,pending:r=>r.output.lifecycle.pending=1,
  upstream:r=>r.upstream.raw.cells[1].payload[2]^=1,upstream_owner:r=>{r.upstream.binding.node_id=r.upstream.raw.node_id='foreign';},
 }))test(id+' marker proof rejects '+name,async()=>{const r=await stages(id);change(r.results);assert.throws(()=>verifyJavascriptNamedOutcome(r.results,id));});
}
for(const fault of ['dispatch-ack','terminal-ack','final-ack','persist','post-ack','cleanup'])test('B characterization cannot bypass '+fault,async()=>{
 const id=bIds[0],r=await stages(id),trial=createJavascriptNamedTrial(id),rt=runtime(r,[]);
 if(fault==='post-ack')rt.checkNativeNamedEvidence=async()=>{throw Error('post ACK drift');};
 const run=()=>trial.run({runtime:rt,input:r.input,node:{node_id:'js'},sourceProbe:javascriptNamedProbe(id),deadline:Date.now()+30000,
  record:async e=>fault==='dispatch-ack'&&e.phase==='native_named_dispatch_reserved'||fault==='terminal-ack'&&e.phase==='native_named_terminal_verified'?{}:e,onExecution:async()=>{}});
 if(['dispatch-ack','terminal-ack','post-ack'].includes(fault))await assert.rejects(run);else await run();
 const finish=()=>trial.finish({cleanup:{...clean,...(fault==='cleanup'?{browser_closed:false}:{})},record:async e=>fault==='final-ack'?{}:e,persist:async()=>{if(fault==='persist')throw Error('fsync');}});
 if(['final-ack','persist'].includes(fault))await assert.rejects(finish);else assert.notEqual(await finish(),'CHARACTERIZED');
 const selected=trial.coverage.cases.find(c=>c.id===id);assert.equal(selected.case_complete,false);assert.notEqual(selected.exact_pass,true);
});
for(const fault of ['rows','case','source','cache'])test('serialized B read refuses changed '+fault+' before further RPC',async()=>{
 const x=await roundtrip({fixtureId:'integer-safe',namedCaseId:bIds[0]}),binding=await x.bind('output');
 if(fault==='rows')binding.rows=binding.row_count=4;if(fault==='case')binding.named_case_id=bIds[1];
 if(fault==='source')binding.source_sha256='0'.repeat(64);if(fault==='cache')x.outputHelper.$FData={};
 await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,binding,decodeVariantFrame,{operationId:'output'}));
 assert.equal(x.f.counters.sent,4);
});
for(const mode of ['ok','native-ack','wrong-count'])test('B production OUTPUT driver uses one row and exact journal ACK '+mode,async t=>{
 const id=bIds[0],x=await roundtrip({fixtureId:'integer-safe',namedCaseId:id,reply:(f,response)=>{
  if(f.dc.FModelNode!==f.node.data){const bytes=response.$FData,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);view.setInt16(12,20,true);view.setBigInt64(14,10n,true);}
 }}),f=x.f;
 f.b.package_id='d:w';x.before.package_id='d:w';const input=inputProof(x).before;
 f.dt.FTotalRowCount=mode==='wrong-count'?4:1;f.model.FPreviewManager.FPreviewVisible=true;
 Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:x.js,FCurrentPreviewPort:x.output});
 Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:x.js,Port:x.output});
 f.dc.FModelNode=x.js.data;f.dc.FDataSource=x.outputDs;f.dt.FDataSource=x.outputDs;f.store.proxy.dataSource=x.outputDs;
 const node={document_id:'d',workflow_id:'w',node_id:'js'},ctx={document_id:'d',node,workflow_ref:{workflow_id:'w',tab_tid:'tab',prefix:'TF'},execution:x.execution,deadline:f.b.deadline};
 const state={prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'output',port_guid:'js-output'}]},
  ui:{elements:[{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},node_preview_schema:{verified:true,port_guid:'js-output',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:'integer'}]}};
 const directory=await mkdtemp(join(tmpdir(),'js-b-driver-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const journal=createExecutionJournal({directory,metadata:{sessionId:'B',clientRevision:'source85'}}),states=[];
 const run=()=>readNativeRoundtrip({options:{operation:{id:'B-output'},execute:f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),onRecord:async e=>{
  const saved=await journal(e);if(mode==='native-ack'&&saved.proof)saved.proof.lifecycle.releasedResponses=0;return saved;
 }},ctx,input,role:'output',namedCaseId:id,targetOrigin:'http://test',targetBuild:'7.4.2',onState:async s=>states.push(s)},
 {openPreview:async()=>{},verifyFrontends:async()=>[],verifyCountLoaders:()=>({}),createProcedure:()=>({observe:async({ready})=>{assert.equal(ready(state),true);return state;},perform:async({resolve})=>{assert.equal(resolve(state).ref,'close');f.model.FPreviewManager.FPreviewVisible=false;}})});
 if(mode==='ok'){
  const proof=await run();assert.equal(proof.binding.rows,1);assert.equal(proof.binding.fixture_id,'integer-safe');assert.equal(proof.exact.cells[0].value,'10');
  assert.equal(proof.lifecycle.requests,1);assert.equal(proof.lifecycle.releasedRequests,1);assert.equal(proof.lifecycle.releasedResponses,1);
  assert.ok(states.some(s=>s.status==='completed'&&s.requests===1));
 }else await assert.rejects(run,mode==='native-ack'?/acknowledgement/:/row count/);
 assert.equal(f.counters.sent,mode==='wrong-count'?4:5);
});
for(const marker of [10n,99n])test('B real journal/fsync report retains marker '+marker+' and no exact_pass',async t=>{
 const id=bIds[0],r=await stages(id,{marker}),trial=createJavascriptNamedTrial(id);
 const directory=await mkdtemp(join(tmpdir(),'js-b-report-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const record=createExecutionJournal({directory,metadata:{sessionId:'B',clientRevision:'source85'}});
 await trial.run({runtime:runtime(r,[]),input:r.input,node:{node_id:'js'},sourceProbe:javascriptNamedProbe(id),deadline:Date.now()+30000,record,onExecution:async()=>{}});
 await trial.finish({cleanup:clean,record,persist:async status=>writeJavascriptNamedReport(directory,{status,native_named:trial.coverage,native_roundtrip:r.results})});
 const saved=JSON.parse(await readFile(join(directory,'report.json'),'utf8')),slot=saved.native_named.cases.find(c=>c.id===id);
 assert.equal(saved.status,marker===10n?'CHARACTERIZED':'UNRESOLVED');assert.equal(slot.marker,String(marker));assert.equal(slot.exact_pass,false);
 assert.equal(saved.native_roundtrip.output.exact.cells[0].native.bytes_le,marker===10n?'0a00000000000000':'6300000000000000');
});
for(const mode of ['ok','lifecycle','ack','upstream'])test('B actual runtime method keeps OUTPUT1/upstream4 and final ACK '+mode,async()=>{
 const {verifyNativeRoundtripExecution}=await import('./javascript-native-roundtrip-contract.mjs');
 const {freezeCivilEvidence}=await import('./javascript-native-datetime-civil.mjs');
 const id=bIds[0],r=await stages(id),events=[],steps=[];
 if(mode==='upstream')r.results.upstream.raw.cells[1].payload[2]^=1;
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async readNativeRoundtrip(input,node,execution) {'),end=source.indexOf('    async readNativeCivil(',start);
 const context={nativeCalibrationId:undefined,nativeNamedCaseId:id,javascriptNamedCase,nativeFixtureId:'integer-safe',nativeInputFixture:{rows:4},nativeRoundtripProbe:javascriptNamedProbe(id),
  verifyJavascriptNamedInput,verifyJavascriptNamedOutcome,verifyNativeRoundtripExecution,freezeCivilEvidence,validateNativeSource:()=>{},
  page:{evaluate:async()=>{}},completeJavascriptNativeRoundtrip,prepared:{document_id:'d',workflow_ref:{workflow_id:'w'}},
  deadline:Date.now()+10000,randomUUID:()=>String(steps.length),execute:()=>{},nativeReadUncertain:false,sessionId:'B',origin:'http://test',build:'7.4.2',Date,
  readNativeRoundtrip:async({role,onState,options,namedCaseId})=>{assert.equal(namedCaseId,id);assert.equal(options.exclusiveNodeOperation(),true);steps.push(role);
   await onState(mode==='lifecycle'&&role==='output'?{...r.results[role].lifecycle,requests:4}:r.results[role].lifecycle);return r.results[role];},
  record:async e=>{events.push(clone(e));const saved=clone(e);if(mode==='ack'&&saved.results)saved.results.outcome.exact_pass=true;return saved;}};
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',context);
 runtime.checkNativeNamedEvidence=async()=>{assert.equal(context.nativeReadUncertain,false);};
 const run=()=>runtime.readNativeRoundtrip(r.input,{document_id:'d',workflow_id:'w',node_id:'js'},r.execution);
 if(mode==='ok'){const result=await run();assert.equal(result.outcome.status,'characterized_return');assert.equal(result.outcome.exact_pass,false);assert.deepEqual(steps,['output','upstream']);}
 else await assert.rejects(run);
 if(mode==='lifecycle')assert.deepEqual(steps,['output']);
});
