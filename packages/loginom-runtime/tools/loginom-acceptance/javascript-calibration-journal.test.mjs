import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {acknowledgeJavascriptCalibrationRecord} from './javascript-calibration-journal.mjs';
import {compactJavascriptJournalRecord} from './javascript-execution-evidence.mjs';
import {createJavascriptCalibrationTrial} from './javascript-calibration-run.mjs';
import {javascriptExecutionIdentity} from './javascript-mismatch-probe.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {inputProof} from './javascript-native-named.test.mjs';
import {failedStage} from './javascript-native-named.test.mjs';
import {readNativeNamedFailure} from './javascript-native-named-failure-driver.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {verifyNativeInputRead} from './javascript-native-input-contract.mjs';

// Bounded structural reproducer from K2 probe01 line7. IDs are synthetic;
// output.origin is reconstructed from the verified location.origin producer.
function observation(){
 return {operation_id:'observation-1',phase:'observation_completed',outcome:{
  status:'SUCCEEDED',action_key:'workspace.observe',action_revision:'1',operation_id:'observation-1',phase:'observed',effect_possible:false,
  output:{origin:new URL('http://logi-test-plan.bg.local/app/').origin,authenticated:true,loginom_build:'7.4.2',
   workflow_ref:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-2',prefix:'MF;TF-2'},graph_identity:{status:'unobserved'},active_identity:'',
   observation_kind:'roots',scan:{complete:true,visited_elements:249,detail_elements:0,max_elements:6000,max_work:250000,max_ms:500},
   nodes:[],links:[],ui:{elements:[],dialogs:[],messages:[],masks:[],table_cells:[]}},error:null,
  trace:[{at_ms:0,event:'ui_observation_started'}],cleanup_complete:true}};
}

async function integration(directory,{knownSecrets=[],mutate,writer,caseId}={}){
 const journal=createExecutionJournal({directory,metadata:{sessionId:'javascript-g2',clientRevision:'operator-source',targetIdentity:{origin:'http://logi-test-plan.bg.local',loginom_build:'7.4.2'}},knownSecrets});
 const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('const executionRecord=async event=>{'),source.indexOf('const createRemaining='));
 const report={stage:'prepare-typed-input',...(caseId?{case_id:caseId}:{})};
 const result=vm.runInNewContext('let executionJournalLine=0,nativeClassifierBinding;'+code+'\n({record:executionRecord,get line(){return executionJournalLine;},get binding(){return nativeClassifierBinding;}})',{
  report,calibrationTrial:{},nativeRoundtrip:true,discoveryProbe:false,publicWizardRefusalCaseId:null,executionCase:'code-table-execute',structuredClone,
  acknowledgeJavascriptCalibrationRecord,compactJavascriptJournalRecord,save:async()=>{},
  executionJournal:writer??(async e=>{const saved=await journal(e);return mutate?mutate(saved,e):saved;})});
 return {record:result.record,result,report,journal,lines:async()=> (await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n')};
}

test('production journal normalizes observed origin; bounded reproducer rejects old ACK and new integration preserves durable bytes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'js-calibration-journal-'));
 try{
  const x=await integration(directory),event=observation(),before=structuredClone(event),saved=await x.journal(event);
  assert.equal(createRedactor().text(event.outcome.output.origin),'http://logi-test-plan.bg.local/');
  assert.equal(Object.keys(event).every(k=>JSON.stringify(saved[k])===JSON.stringify(event[k])),false);
  assert.equal(saved.outcome.output.origin,event.outcome.output.origin+'/');
  const restored=acknowledgeJavascriptCalibrationRecord(event,saved);
  assert.deepEqual(restored.outcome,event.outcome);assert.equal(saved.outcome.output.origin,'http://logi-test-plan.bg.local/');
  assert.deepEqual(event,before);
  // A fresh production recorder has no prior unaccounted journal writes.
  const fresh=await mkdtemp(join(tmpdir(),'js-calibration-journal-integration-'));
  try{
   const live=await integration(fresh),ack=await live.record(event),lines=await live.lines();
   assert.equal(ack.outcome.output.origin,event.outcome.output.origin);
   assert.equal(JSON.parse(lines[0]).outcome.output.origin,event.outcome.output.origin+'/');
   assert.equal(live.report.execution_records[0].line,1);
   assert.equal(live.report.execution_records[0].sha256,createHash('sha256').update(lines[0]+'\n').digest('hex'));
   assert.notEqual(live.report.execution_records[0].sha256,createHash('sha256').update(JSON.stringify(ack)+'\n').digest('hex'));
  }finally{await rm(fresh,{recursive:true,force:true});}
 }finally{await rm(directory,{recursive:true,force:true});}
});

for(const origin of ['http://test','https://test:8443','http://[::1]:8080'])test('canonical origin representation only: '+origin,()=>{
 const event={phase:'calibration_native_proof',proof:{origin,source:'exact source',source_sha256:'a'.repeat(64),owner:{node_id:'js'},cells:[{value:'0'}]}};
 const saved=createRedactor().redact(event),ack=acknowledgeJavascriptCalibrationRecord(event,saved);
 assert.deepEqual(ack,event);assert.equal(saved.proof.origin,origin+'/');
});

for(const [fault,change]of Object.entries({host:e=>e.proof.origin='http://foreign/',scheme:e=>e.proof.origin='https://test/',port:e=>e.proof.origin='http://test:8080/',
 source:e=>e.proof.source+=' ',digest:e=>e.proof.source_sha256='b'.repeat(64),owner:e=>e.proof.owner.node_id='foreign',
 cell:e=>e.proof.cells[0].value='1',missing:e=>delete e.proof.source,added:e=>e.proof.extra=true,length:e=>e.proof.cells.push({value:'1'}),
 phase:e=>e.phase='calibration_other',redactionFailure:e=>{e.type='redaction_failure';}}))test('calibration ACK rejects '+fault,()=>{
 const event={phase:'calibration_native_proof',proof:{origin:'http://test',source:'exact source',source_sha256:'a'.repeat(64),owner:{node_id:'js'},cells:[{value:'0'}]}};
 const saved=createRedactor().redact(event);change(saved);assert.throws(()=>acknowledgeJavascriptCalibrationRecord(event,saved),/ACK differs/);
});

for(const origin of ['http://test/path','http://test?x=1','http://user:test@test','file://test','not a URL'])test('non-origin string cannot use the origin exception: '+origin,()=>{
 assert.throws(()=>acknowledgeJavascriptCalibrationRecord({origin},{origin:origin+'/'}),/ACK differs/);
});

test('URL normalization under source/text/target_origin remains a strict refusal',()=>{
 for(const key of ['source','text','target_origin']){
  const event={[key]:'http://test'};assert.throws(()=>acknowledgeJavascriptCalibrationRecord(event,createRedactor().redact(event)),/ACK differs/);
 }
});

test('real redactor keeps secrets out of durable evidence and no raw ACK is returned when evidence was redacted',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'js-calibration-redaction-'));
 try{
  const x=await integration(directory,{knownSecrets:['PRIVATE_FIXTURE_VALUE']});
  for(const event of [{phase:'calibration_prior_editor_captured',source:'PRIVATE_FIXTURE_VALUE'},
   {phase:'calibration_terminal_captured',proof:{password:'PRIVATE_FIXTURE_VALUE',origin:'http://test'}},
   {...observation(),note:'Bearer abcdefghijklmnopqrstuvwxyz'}])await assert.rejects(()=>x.record(event),/ACK differs/);
  const lines=await x.lines();assert.equal(lines.length,3);assert.equal(x.result.line,3);assert.equal(x.report.execution_records,undefined);
  assert.ok(lines.every(line=>!line.includes('PRIVATE_FIXTURE_VALUE')&&!line.includes('abcdefghijklmnopqrstuvwxyz')));
  assert.ok(lines.every(line=>line.includes('[redacted]')));
  const final={phase:'calibration_finalized',status:'FAILED',case_complete:false};await x.record(final);
  assert.equal(x.report.execution_records[0].line,4);
  assert.equal(x.report.execution_records[0].sha256,createHash('sha256').update((await x.lines())[3]+'\n').digest('hex'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('origin ACK handles stateful learned redaction conservatively instead of shadowing the production redactor',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'js-calibration-learning-'));
 try{
  const x=await integration(directory);
  await assert.rejects(()=>x.record({phase:'calibration_secret_fixture',password:'LEARNED_FIXTURE_VALUE'}),/ACK differs/);
  await assert.rejects(()=>x.record({phase:'calibration_terminal_captured',source:'LEARNED_FIXTURE_VALUE'}),/ACK differs/);
  await x.record(observation());assert.equal(x.report.execution_records[0].line,3);
  assert.ok(!(await x.lines()).join('\n').includes('LEARNED_FIXTURE_VALUE'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('real journal write followed by corrupt ACK does not install owner binding and does not shift later line references',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'js-calibration-ack-corrupt-'));
 try{
  const x=await integration(directory,{caseId:'K2-sync-v1',mutate:(saved,e)=>e.phase==='node_observation_completed'?{...saved,case_id:'foreign'}:saved});
  const event={phase:'node_observation_completed',outcome:{output:{origin:'http://test',prepared_node_context:{verified:true,surface:'graph',node_id:'js',tid:'js'},workflow_ref:{prefix:'p'}}}};
  await assert.rejects(()=>x.record(event),/ACK differs/);assert.equal(x.result.binding,undefined);
  await x.record({phase:'cleanup_workflow_settlement_refused',owner_verified:false});
  assert.equal(x.report.execution_records[0].line,2);
  assert.equal(x.report.execution_records[0].sha256,createHash('sha256').update((await x.lines())[1]+'\n').digest('hex'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('missing ACK or rejected persistence cannot admit calibration evidence',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'js-calibration-ack-missing-'));
 try{
  for(const writer of [async()=>undefined,async()=>{throw Error('write failed');}]){
   const x=await integration(directory,{writer});await assert.rejects(()=>x.record(observation()));
   assert.equal(x.report.execution_records,undefined);assert.equal(x.result.binding,undefined);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});

for(const id of ['K2-sync-v1','K3-shift-v1','K4-native-caller-v1'])for(const fault of ['none','diagnostic','native-cell','terminal-source','terminal-owner','final','secret-diagnostic'])test(id+' actual calibration and failed/upstream drivers through production journal: '+fault,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'js-calibration-native-journal-'));
 try{
  const x=await integration(directory,{mutate:(saved,event)=>{
   if(fault==='diagnostic'&&event.phase==='native_named_failed_terminal_sealed')saved.failed.error_details='changed diagnostic';
   if(fault==='native-cell'&&event.phase==='javascript_native_roundtrip_upstream_cells_verified')saved.proof.raw.cells[0].payload[0]^=1;
   if(fault==='terminal-source'&&event.phase==='calibration_terminal_captured')saved.result.failed.source_sha256='0'.repeat(64);
   if(fault==='terminal-owner'&&event.phase==='calibration_terminal_captured')saved.result.failed.node_id='foreign';
   if(fault==='final'&&event.phase==='calibration_finalized')saved.status='ACCEPTED';
   return saved;
  }}),r=await failedStage(id,{message:fault==='secret-diagnostic'?'Error: Bearer abcdefghijklmnopqrstuvwxyz':id==='K2-sync-v1'?'Error: JS_CAL_K2_SYNC_V1':id==='K3-shift-v1'?'Error: JS_CAL_K3_SYNC_SHIFT_V1':'Error: synthetic native call diagnostic'}),f=r.x.f;
  // Match production input identity before sealing; do not preconsume an upstream binding.
  f.b.package_id='d:w';r.before.binding.package_id='d:w';r.before.raw.package_id='d:w';
  r.before.exact=verifyNativeInputRead(r.before.raw,{binding:r.before.binding,lifecycle:r.before.lifecycle,provenance:r.before.exact.provenance});
  const state={prepared_node_context:{...r.input.node,verified:true,surface:'graph'},wizard:{status:'absent'},
   node_outputs:{verified:true,ports:[{index:0,active:true,tid:'input-output',port_guid:'p'}]},
   ui:{elements:[{tid:'input-output',ref:'input-output',allowed_actions:['click','press']},{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},
   node_preview_schema:{verified:true,port_guid:'p',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:'integer'}]}};
  // Native reads and source/owner/ACK verification run production code; only UI/loaded-file acquisition uses the page fixture.
  const readUpstream=args=>readNativeRoundtrip(args,{verifyFrontends:async()=>[],verifyCountLoaders:()=>({fixture:'count-loader-source'}),
   openPreview:async()=>assert.fail('No OUTPUT'),createProcedure:()=>({
    observe:async({ready})=>{assert.equal(ready(state),true);return state;},
    perform:async({resolve})=>{const action=resolve(state);if(action.key==='F3')f.model.FPreviewManager.FPreviewVisible=true;if(action.ref==='close')f.model.FPreviewManager.FPreviewVisible=false;}
   })});
  const trial=createJavascriptCalibrationTrial(id);let executions=0;
  await trial.capturePrior({source:'prior editor',input:r.input,node:r.node,record:x.record});
  const runtime={checkNativeRoundtripBeforeExecute:async()=>{},captureExecutionBoundary:async()=>({native:{dispose:async()=>{}}}),
   executeNode:async()=>{executions++;return r.execution;},verifyExecutionBoundary:async()=>{},checkNativeNamedEvidence:async()=>{},
   readNativeNamedFailure:async()=>readNativeNamedFailure({page:f.page,input:r.input,node:r.node,execution:r.execution,caseId:r.c.id,
    workflow:{workflow_id:'w',tab_tid:'tab',prefix:'TF'},deadline:f.b.deadline,targetOrigin:'http://test',targetBuild:'7.4.2',validateSource:()=>{},
    options:{execute:f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),onRecord:x.record},onState:async()=>{}},{readUpstream})};
  const run=()=>trial.run({runtime,input:r.input,node:r.node,sourceProbe:trial.probe,deadline:Date.now()+30000,record:x.record,
   onExecution:e=>x.record({phase:'execution_terminal',terminal:e})});
  const finish=()=>trial.finish({cleanup:{package_closed:true,logged_out:true,browser_closed:true},record:x.record,persist:async()=>{}});
  if(!['none','final'].includes(fault))await assert.rejects(run,/ACK differs/);
  else{
   const result=await run();assert.equal(result.status,'owned_failure_observed');assert.equal(result.outcome.upstream_exact,true);
   assert.equal(result.prior.before.binding.origin,'http://test/');
   assert.equal(Object.hasOwn(result.upstream.binding,'cookie_sources'),false);
   assert.equal(Object.keys(result.upstream.subscription_proxy_source_sha256).length,2);
   if(fault==='final'){await assert.rejects(finish,/ACK differs/);assert.equal(trial.coverage.finalized,false);}
   else assert.equal(await finish(),'DIAGNOSTIC_OBSERVED');
  }
  assert.equal(executions,1);assert.equal(trial.coverage.case_complete,false);
  assert.equal(f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
  assert.deepEqual(f.counters,{sent:['diagnostic','secret-diagnostic'].includes(fault)?4:8,requests:['diagnostic','secret-diagnostic'].includes(fault)?4:8,responses:['diagnostic','secret-diagnostic'].includes(fault)?4:8});
  const lines=await x.lines();
  for(const ref of x.report.execution_records)assert.equal(ref.sha256,createHash('sha256').update(lines[ref.line-1]+'\n').digest('hex'));
  if(fault==='none'){
   assert.equal(lines.length,x.report.execution_records.length);assert.equal(JSON.parse(lines[0]).prior.source,'prior editor');
   const persisted=lines.map(JSON.parse).find(e=>e.phase==='javascript_native_roundtrip_upstream_cells_verified');
   assert.equal(Object.hasOwn(persisted.proof.binding,'cookie_sources'),false);
   assert.equal(Object.keys(persisted.proof.subscription_proxy_source_sha256).length,2);
  }
  if(fault==='secret-diagnostic')assert.ok(!lines.join('\n').includes('abcdefghijklmnopqrstuvwxyz'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

for(const fault of ['none','terminal-ack','final-ack','persist','cleanup','unknown','source','owner'])test('K4 completed production execute/trial/report with real journal: '+fault,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'js-k4-completed-'));
 try{
  const x=await integration(directory,{mutate:saved=>{
   if(fault==='terminal-ack'&&saved.phase==='calibration_terminal_captured')saved.result.execution.node.node_id='foreign';
   if(fault==='final-ack'&&saved.phase==='calibration_finalized')saved.mapping_status='verified';return saved;
  }}),r=await roundtrip({fixtureId:'integer-safe',calibrationId:'K4-native-caller-v1',wizardOnly:true}),input=inputProof(r).input;
  await r.prepare();r.dispose();await r.seal();
  const node={document_id:'d',workflow_id:'w',node_id:'js'},trial=createJavascriptCalibrationTrial('K4-native-caller-v1'),steps=[];
  await trial.capturePrior({source:'prior editor',input,node,record:x.record});
  const deadline=r.f.b.deadline,baseline={node,root_id:'1',roots:[]},identified={node,root_id:'1',group_id:'4',group_record_id:'4',execution_id:'d:1:4'};
  // Driver result is synthetic completed, with no return-value inspection or fabricated native error.
  const terminal={verified:true,status:fault==='unknown'?'ambiguous':'completed',owner_verified:true,cleanup_complete:true,node,execution_id:'d:1:4',process_id:'4.1',process_record_id:'5',group_id:'4'};
  const runtimeSource=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
  const start=runtimeSource.indexOf('    async executeNode('),end=runtimeSource.indexOf('    async readPassive(',start);
  const runtime=vm.runInNewContext('({'+runtimeSource.slice(start,end)+'})',{
   deadline,executionPhases:new Map(),javascriptExecutionIdentity,channel:()=>({}),
   createNodeExecutionProcedure:(channel,owner,options)=>{
    assert.equal(options.verifyFailedChild,true);assert.deepEqual(owner,node);
    return {prepare:async()=>baseline,launchGraph:async()=>{steps.push('launch');return {verified:true};},identify:async()=>identified,waitCompleted:async()=>terminal};
   },privateGraphBinding:async()=>({dispose:async()=>steps.push('graph-dispose')}),page:{evaluate:async()=>({node,icon:'js'})},
   selectJavascriptForSettings:async()=>{},once:async(id,identity,action)=>action(),record:x.record,waitJavascriptExecutionNotifications:async()=>steps.push('settlement')
  });
  Object.assign(runtime,{checkNativeRoundtripBeforeExecute:async()=>r.f.env.__loginomJavascriptNativeRoundtripV1.check(),
   captureExecutionBoundary:async()=>({native:{dispose:async()=>steps.push('boundary-dispose')}}),verifyExecutionBoundary:async()=>{},
   readNativeNamedFailure:async()=>assert.fail('Completed is not native failed'),readNativeRoundtrip:async()=>assert.fail('No OUTPUT'),
   checkNativeNamedEvidence:async()=>assert.fail('No invented failed/upstream proof')});
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8'),runStart=source.lastIndexOf('    if(calibrationTrial){'),runEnd=source.indexOf('    if(coercionTrial){',runStart);
  const report={execution_probe:{},cleanup:{package_closed:true,logged_out:true,browser_closed:fault!=='cleanup'}};
  const context={calibrationTrial:trial,report,executionRuntime:runtime,executionInput:input,executionNode:fault==='owner'?{...node,node_id:'foreign'}:node,
   probe:fault==='source'?{...trial.probe,source:trial.probe.source+' '}:trial.probe,deadline,executionRecord:x.record,Date,redactor:{text:v=>v},
   save:async()=>{if(fault==='persist'&&trial.coverage.finalized)throw Error('persist failed');}};
  const run=()=>vm.runInNewContext('(async()=>{'+source.slice(runStart,runEnd)+'})',context)();
  if(['terminal-ack','unknown','source','owner'].includes(fault)){
   await assert.rejects(run);assert.equal(report.calibration_result,undefined);
  }else{
   await run();assert.equal(report.calibration_result.status,'unexpected_completed');
   assert.equal(report.execution_probe.execution.status,'completed');assert.equal(report.calibration_result.failed,undefined);
   assert.equal(report.calibration_result.execution.error,undefined);assert.equal(report.calibration_result.output.status,'not_read_calibration');
   assert.equal(report.calibration_result.upstream.status,'not_read');assert.equal(report.calibration_result.attribution,'none');
   assert.equal(report.calibration_result.mapping_status,'unverified');assert.equal(report.calibration_result.controlled_throw_verified,false);
   const finalStart=source.lastIndexOf('  if (!report.cleanup.package_closed'),finalEnd=source.indexOf('  console.log(JSON.stringify({status:report.status',finalStart);
   await vm.runInNewContext('(async()=>{'+source.slice(finalStart,finalEnd)+'})',context)();
   assert.equal(report.status,['final-ack','persist'].includes(fault)?'EVIDENCE_UNCONFIRMED':fault==='cleanup'?'CLEANUP_UNCONFIRMED':'UNRESOLVED');
   assert.equal(report.failure,undefined);assert.equal(trial.coverage.finalized,!['final-ack','persist'].includes(fault));
  }
  await assert.rejects(run,/no replay/);
  if(!['source','owner'].includes(fault))await assert.rejects(()=>runtime.executeNode(node,deadline,{phase:'initial',source_sha256:trial.probe.source_sha256}),/no replay/);
  assert.equal(steps.filter(s=>s==='launch').length,['source','owner'].includes(fault)?0:1);
  assert.deepEqual(r.f.counters,{sent:4,requests:4,responses:4});assert.equal(r.f.env.__loginomJavascriptNativeRoundtripV1.bindings.size,0);
  assert.equal(trial.coverage.case_complete,false);assert.equal(trial.coverage.g6_complete,false);assert.equal(trial.coverage.j25_complete,false);
  const lines=await x.lines();for(const ref of x.report.execution_records)assert.equal(ref.sha256,createHash('sha256').update(lines[ref.line-1]+'\n').digest('hex'));
  assert.ok(lines.every(line=>!JSON.parse(line).failed));
 }finally{await rm(directory,{recursive:true,force:true});}
});
