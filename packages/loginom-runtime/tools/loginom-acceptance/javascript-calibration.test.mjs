import {beginCalibrationWizard,readCalibrationWizard,finishCalibrationWizardObservation,checkCalibrationWizardBaseline} from './javascript-calibration-wizard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {javascriptCalibrationCase,javascriptCalibrationIds,calibrationDiagnostic,captureCalibrationWizard} from './javascript-calibration-cases.mjs';
import {createJavascriptCalibrationTrial} from './javascript-calibration-run.mjs';
import {failedStage,readFailed,inputProof} from './javascript-native-named.test.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {readNativeNamedFailure} from './javascript-native-named-failure-driver.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {verifyNativeInputRead} from './javascript-native-input-contract.mjs';
import {verifyNamedFailureOutcome,verifyNamedFailureWitness} from './javascript-native-named-failure.mjs';
import {javascriptNativeRoundtripCode} from './javascript-native-roundtrip-binding.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
import {armJavascriptNativeRoundtrip,prepareJavascriptNativeRoundtripWizard} from './javascript-native-roundtrip-owner.mjs';
import {waitJavascriptStageObservation,javascriptStageTerminal} from './javascript-stage-observer.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
const clone=x=>JSON.parse(JSON.stringify(x)),clean={package_closed:true,logged_out:true,browser_closed:true};
const k2='Error: JS_CAL_K2_SYNC_V1\n   at Anonymous function (<main>:4:1)\n   at module (<main>:1:1)';
// K3 diagnostic is synthetic; its coordinates are not live evidence.
const k3='Error: JS_CAL_K3_SYNC_SHIFT_V1\n   at Anonymous function (<main>:5:3)\n   at module (<main>:1:1)';
// Synthetic K4 error: the real native call may complete instead.
const k4='Error: synthetic native call diagnostic\n   at Anonymous function (<main>:6:1)\n   at module (<main>:1:1)';
const record=async e=>clone(e);

test('closed K1/K2/K3/K4 bytes match independently pinned proposal; B or arbitrary sources cannot enter',async()=>{
 assert.deepEqual(javascriptCalibrationIds,['K1-parse-v1','K2-sync-v1','K3-shift-v1','K4-native-caller-v1']);
 const lengths=[274,291,300,295],hashes=['721161cd4f4c0de387cefeef03b2425fd20f5645c05bff724103e330acd1620f','3f7350f5f9e7cb30107fb314643ae844477a7b87610132036e995f556fe983c2','02b7e36c08e2d1f18fe83e60ed145d00bef83746fbe14b1328b1b6ba91ab76b3','debb9802f3a381e3569b7a7c8857038a3a165fafacfbbcb7a5b18ed3dd17541f'];
 for(const [i,id]of javascriptCalibrationIds.entries()){
  const p=javascriptCalibrationCase(id);assert.equal(Buffer.byteLength(p.source),lengths[i]);
  assert.equal(createHash('sha256').update(p.source).digest('hex'),hashes[i]);assert.equal(p.source_sha256,hashes[i]);
  assert.equal(p.source.split('\n').length,i===3?7:i===2?6:5);assert.equal(p.schema_mode,'code');assert.equal(p.input_fixture_id,'integer-safe');
  assert.ok(!/[\r\t\u0080-\uffff]/.test(p.source));assert.equal(p.source.endsWith('\n'),true);assert.ok(Object.isFrozen(p));
 }
 for(const id of ['K3-shift-v2','K4-native-caller-v2','K5','B-get-case','__proto__','K1-parse-v1,K2-sync-v1'])assert.throws(()=>javascriptCalibrationCase(id));
 for(const args of [['--error-calibration','K5'],['--error-calibration','K2-sync-v1','--native-named-case','B-get-case'],
  ['--error-calibration','K1-parse-v1','--native-fixture','integer-safe'],['--error-calibration','K2-sync-v1','--source','x'],
  ['--error-calibration','K1-parse-v1','--error-calibration','K2-sync-v1']])await assert.rejects(()=>runJavascriptOperator(args,{nativeRoundtrip:true}));
 await assert.rejects(()=>runJavascriptOperator(['--error-calibration','K1-parse-v1']));
});

for(const id of javascriptCalibrationIds)test(id+' serialized native failed witness + exact upstream8, no OUTPUT or mapping',async()=>{
 const r=await readFailed(await failedStage(id,{message:id==='K2-sync-v1'?k2:id==='K3-shift-v1'?k3:id==='K4-native-caller-v1'?k4:'SyntaxError: fixture parse diagnostic'}));
 assert.equal(r.results.failed.calibration_id,id);assert.equal(r.results.failed.named_case_id,undefined);
 assert.equal(r.results.outcome.input_exact,true);assert.equal(r.results.outcome.upstream_exact,true);
 assert.equal(r.results.outcome.case_complete,false);assert.equal(r.results.outcome.controlled_throw_verified,false);
 assert.equal(r.results.outcome.mapping_status,'unverified');assert.deepEqual(r.x.f.counters,{sent:8,requests:8,responses:8});
 assert.equal(r.results.outcome.literal_header_candidate,['K2-sync-v1','K3-shift-v1'].includes(id));
 assert.equal(r.x.f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
 await assert.rejects(()=>r.x.f.execute(javascriptNativeRoundtripCode({...r.results.upstream.binding,binding_id:'forbidden',roundtrip_role:'output'})),/upstream/i);
 const corrupt=clone(r.results);corrupt.upstream.binding.calibration_id=id==='K1-parse-v1'?'K2-sync-v1':'K1-parse-v1';
 assert.throws(()=>verifyNamedFailureOutcome(corrupt,id));
});

for(const id of ['K2-sync-v1','K3-shift-v1','K4-native-caller-v1'])for(const length of [999,1000,1001,2000])test(id+' calibration native raw length '+length+' is checked before bounded delivery',async()=>{
 const message='Error: '+ 'x'.repeat(length-7),s=await failedStage(id,{message}),failed=await s.seal();
 verifyNamedFailureWitness(failed,s.execution,s.node,s.c.id);
 assert.equal(failed.native_text_length,length);assert.equal(failed.error_details.length,Math.min(length,1000));
 assert.equal(failed.native_error_complete,length<=1000);
 assert.equal(calibrationDiagnostic(failed,s.c.id).position_status,length<=1000?'absent':'incomplete');
 s.child.data.ErrorDetails+='x';assert.throws(()=>s.x.f.env.__loginomJavascriptNamedFailureV1.check());
 const forged=clone(failed);forged.native_error_complete=!forged.native_error_complete;
 assert.throws(()=>verifyNamedFailureWitness(forged,s.execution,s.node,s.c.id));
});

for(const id of ['K2-sync-v1','K3-shift-v1','K4-native-caller-v1'])for(const [fault,change]of Object.entries({owner:s=>s.child.data.ModelNode={},source:s=>s.execution.trial.source_sha256='0'.repeat(64),
 stale:s=>s.execution.fresh_baseline.roots.push({process_id:'4'}),groupOnly:s=>s.group.childNodes=[],pending:s=>s.x.f.env.__loginomJavascriptNativeInputReadV1.last.pending=1,
 wrongId:s=>s.x.f.env.__loginomJavascriptNativeRoundtripV1.source_sha256='0'.repeat(64)}))test(id+' serialized calibration rejects '+fault,async()=>{
 const s=await failedStage(id,{message:id==='K2-sync-v1'?k2:id==='K3-shift-v1'?k3:k4,beforeSeal:change});await assert.rejects(async()=>s.seal());assert.equal(s.x.f.counters.sent,4);
});

for(const text of ['source: throw new Error("JS_CAL_K2_SYNC_V1");',k2.replace('4:1','5:1'),k2.replace('<main>','<preview>'),
 k2+'\n   at Anonymous function (<main>:5:1)','Error: other\nJS_CAL_K2_SYNC_V1','unknown diagnostic line=4'])test('diagnostic observations never infer B mapping: '+text.slice(0,26),()=>{
 const d=calibrationDiagnostic({error_details:text,native_text_length:text.length,native_error_complete:true},'K2-sync-v1');
 assert.equal(d.controlled_throw_verified,false);assert.equal(d.rejection_attributed,false);assert.equal(d.source_span,null);assert.equal(d.mapping_status,'unverified');
 if(text.startsWith('source:')||text.startsWith('unknown')||text.includes('\nJS_CAL'))assert.equal(d.position_status,'unrecognized');
});

for(const id of javascriptCalibrationIds)for(const fault of ['none','foreign','stale','source','not-visible','pending'])test(id+' serialized wizard capture '+fault,async()=>{
 const x=await roundtrip({fixtureId:'integer-safe',calibrationId:id,wizardOnly:true}),input=inputProof(x).input;
 const before={...x.before,messages:[]},after={...before,native_owner_verified:true,messages:[{id:'new',text:'native fixture diagnostic'}]};
 const model=x.f.env.__loginomJavascriptNativeRoundtripV1.schemaWitness.model;
 if(fault==='stale')model.FException={message:'old'};
 await x.f.page.evaluate(beginCalibrationWizard,{id,stage:'next',identity:x.identity,deadline:x.f.b.deadline});
 if(fault!=='stale')model.FException={message:'native fixture diagnostic',name:'SyntaxError',stack:'browser stack'};
 if(fault==='foreign')after.owner_verified=false;
 if(fault==='source')x.lines[0]+=' ';if(fault==='not-visible')after.wizard_visible=false;if(fault==='pending')after.pending=true;
 const capture=async()=>{after.calibration_native_exception=await x.f.page.evaluate(readCalibrationWizard);return x.f.page.evaluate(captureCalibrationWizard,{id,stage:'next',identity:x.identity,before,after});};
 if(fault!=='none'){await assert.rejects(capture);return;}
 const witness=await capture(),trial=createJavascriptCalibrationTrial(id);
 await trial.capturePrior({source:'prior editor',input,node:{node_id:'js'},record});
 const observed=await trial.wizard({witness,record});assert.equal(observed.wizard.native_text_complete,true);
 assert.equal(observed.wizard.committed_source_status,'not_established');assert.equal(observed.upstream.status,'not_read');
 await assert.rejects(()=>trial.run({}),/no replay/);await assert.rejects(()=>trial.wizard({}),/no execution/);
 assert.equal(await trial.finish({cleanup:clean,record,persist:async()=>{}}),'UNRESOLVED');assert.equal(trial.coverage.case_complete,false);
 assert.equal(x.f.counters.sent,4);
});

function runtime(r,calls){return {checkNativeRoundtripBeforeExecute:async()=>{},captureExecutionBoundary:async()=>({native:{dispose:async()=>calls.push('dispose')}}),
 executeNode:async()=>{calls.push('execute');return r.execution;},verifyExecutionBoundary:async()=>{},checkNativeNamedEvidence:async()=>{},
 readNativeNamedFailure:async()=>{calls.push('upstream');return r.results;},readNativeRoundtrip:async()=>assert.fail('no OUTPUT')};}
for(const id of ['K2-sync-v1','K3-shift-v1','K4-native-caller-v1'])for(const fault of ['none','deadline','source','execute','dispatch-ack','terminal-ack','dispose','final-ack','persist','cleanup'])test(id+' actual calibration trial lifecycle '+fault,async()=>{
 const r=await readFailed(await failedStage(id,{message:id==='K2-sync-v1'?k2:id==='K3-shift-v1'?k3:k4})),trial=createJavascriptCalibrationTrial(r.c.id),calls=[],rt=runtime(r,calls);
 await trial.capturePrior({source:'old source',input:r.input,node:r.node,record});
 if(fault==='execute')rt.executeNode=async()=>{calls.push('execute');throw Error('transport uncertain');};
 if(fault==='dispose')rt.captureExecutionBoundary=async()=>({native:{dispose:async()=>{throw Error('dispose');}}});
 const sourceProbe={...trial.probe,...(fault==='source'?{source:'foreign'}:{})};
 const run=()=>trial.run({runtime:rt,input:r.input,node:r.node,sourceProbe,deadline:fault==='deadline'?0:Date.now()+30000,
  record:async e=>fault==='dispatch-ack'&&e.phase==='calibration_dispatch_reserved'||fault==='terminal-ack'&&e.phase==='calibration_terminal_captured'?{}:clone(e),onExecution:async()=>{}});
 const rejected=['deadline','source','execute','dispatch-ack','terminal-ack','dispose'].includes(fault);
 if(rejected)await assert.rejects(run);else await run();await assert.rejects(run,/no replay/);
 const finish=()=>trial.finish({cleanup:fault==='cleanup'?{...clean,browser_closed:false}:clean,record:async e=>fault==='final-ack'?{}:clone(e),
  persist:async()=>{if(fault==='persist')throw Error('fsync');}});
 if(['final-ack','persist'].includes(fault)){await assert.rejects(finish);assert.equal(trial.coverage.finalized,false);}
 else assert.equal(await finish(),fault==='cleanup'?'CLEANUP_UNCONFIRMED':rejected?'UNRESOLVED':'DIAGNOSTIC_OBSERVED');
 assert.ok(calls.filter(x=>x==='execute').length<=1);assert.equal(trial.coverage.case_complete,false);assert.equal(trial.coverage.g6_complete,false);
});

for(const id of ['K2-sync-v1','K3-shift-v1','K4-native-caller-v1'])test(id+' calibration real failed driver reuses strict original upstream reader',async()=>{
 const s=await failedStage(id,{message:id==='K2-sync-v1'?k2:id==='K3-shift-v1'?k3:k4}),f=s.x.f;
 f.b.package_id='d:w';s.before.binding.package_id='d:w';s.before.raw.package_id='d:w';
 s.before.exact=verifyNativeInputRead(s.before.raw,{binding:s.before.binding,lifecycle:s.before.lifecycle,provenance:s.before.exact.provenance});
 const state={prepared_node_context:{...s.input.node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'port',port_guid:'p'}]},
  ui:{elements:[{tid:'port',ref:'port',allowed_actions:['click','press']},{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},
  node_preview_schema:{verified:true,port_guid:'p',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:'integer'}]}};
 const readUpstream=args=>readNativeRoundtrip(args,{verifyFrontends:async()=>[],verifyCountLoaders:()=>({fixture:'loader'}),openPreview:async()=>assert.fail('no OUTPUT'),
  createProcedure:()=>({observe:async({ready})=>{assert.equal(ready(state),true);return state;},perform:async({resolve})=>{const a=resolve(state);if(a.key==='F3')f.model.FPreviewManager.FPreviewVisible=true;if(a.ref==='close')f.model.FPreviewManager.FPreviewVisible=false;}})});
 const result=await readNativeNamedFailure({page:f.page,input:s.input,node:s.node,execution:s.execution,caseId:s.c.id,workflow:{workflow_id:'w',tab_tid:'tab',prefix:'TF'},
  deadline:f.b.deadline,targetOrigin:'http://test',targetBuild:'7.4.2',validateSource:()=>{},options:{execute:f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),onRecord:record},onState:async()=>{}},{readUpstream});
 assert.equal(result.outcome.upstream_exact,true);assert.deepEqual(f.counters,{sent:8,requests:8,responses:8});
});

for(const id of ['K2-sync-v1','K3-shift-v1','K4-native-caller-v1'])test(id+' production calibration dispatch/finalization routes use the selected trial and exact report',async()=>{
 const r=await readFailed(await failedStage(id,{message:id==='K2-sync-v1'?k2:id==='K3-shift-v1'?k3:k4})),trial=createJavascriptCalibrationTrial(r.c.id),calls=[];
 await trial.capturePrior({source:'prior',input:r.input,node:r.node,record});
 const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=source.lastIndexOf('    if(calibrationTrial){'),end=source.indexOf('    if(coercionTrial){',start);
 const report={execution_probe:{},cleanup:clean};
 await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{calibrationTrial:trial,report,executionRuntime:runtime(r,calls),executionInput:r.input,executionNode:r.node,
  probe:trial.probe,deadline:Date.now()+30000,executionRecord:record,save:async()=>{}})();
 assert.equal(report.calibration_result.status,'owned_failure_observed');assert.equal(calls.filter(x=>x==='execute').length,1);
 const finalStart=source.lastIndexOf('  if (!report.cleanup.package_closed'),finalEnd=source.indexOf('  console.log(JSON.stringify({status:report.status',finalStart);
 await vm.runInNewContext('(async()=>{'+source.slice(finalStart,finalEnd)+'})',{report,calibrationTrial:trial,executionRecord:record,Date,save:async()=>{},redactor:{text:x=>x}})();
 assert.equal(report.status,'DIAGNOSTIC_OBSERVED');assert.equal(trial.coverage.case_complete,false);
});

test('serialized calibration arm refuses caller bytes, mixed identity and future cases before native access',()=>{
 for(const change of [p=>p.source+=' ',p=>p.source_sha256='0'.repeat(64),p=>p.calibration_id='K3-shift-v1',
  p=>p.named_case_id='B-get-case',p=>p.schema_mode='declared',p=>p.input_fixture_id='real']){
  const p={...javascriptCalibrationCase('K2-sync-v1'),binding:{fixture_id:'integer-safe'}};change(p);
  assert.throws(()=>vm.runInNewContext('('+armJavascriptNativeRoundtrip.toString()+')')(p));
 }
});

test('complete native raw cannot be substituted while retaining an unrelated receipt',async()=>{
 const s=await failedStage('K2-sync-v1',{message:'Error: other'}),proof=clone(await s.seal());
 proof.error_details='Error: JS_CAL_K2_SYNC_V1';proof.native_text_length=proof.error_details.length;
 assert.throws(()=>verifyNamedFailureWitness(proof,s.execution,s.node,s.c.id),/raw and receipt/);
});

test('failed prior-source ACK prevents wizard capture and execution admission',async()=>{
 const x=await roundtrip({fixtureId:'integer-safe',calibrationId:'K1-parse-v1',wizardOnly:true}),trial=createJavascriptCalibrationTrial('K1-parse-v1');
 await assert.rejects(()=>trial.capturePrior({source:'prior',input:inputProof(x).input,node:{node_id:'js'},record:async()=>({})}),/ACK/);
 await assert.rejects(()=>trial.run({}),/reservation/);await assert.rejects(()=>trial.wizard({}),/wizard diagnostic/);
});

for(const id of ['K1-parse-v1','K3-shift-v1','K4-native-caller-v1'])for(const stage of ['next','done'])for(const fault of ['none','baseline-ack','source-after-ack'])test(id+' production '+stage+' wizard diagnostic/no-Execute '+fault,async()=>{
 const x=await roundtrip({fixtureId:'integer-safe',calibrationId:id,wizardOnly:true}),input=inputProof(x).input,trial=createJavascriptCalibrationTrial(id);
 await trial.capturePrior({source:'prior',input,node:{node_id:'js'},record});
 const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=source.indexOf('const runExecutionTrial=async probe=>'),end=source.indexOf('const verifyBatchInputIdentity=',start);
 const before={...x.before,messages:[]},after={...before,native_owner_verified:true,messages:[]},calls=[],report={execution_probe:{}};
 const stageReader=()=>{};
 const runner=vm.runInNewContext(source.slice(start,end)+'\nrunExecutionTrial',{persistence:null,coldReader:false,coldOpenPending:false,
  nativeRoundtrip:true,nativeCalibrationId:id,calibrationTrial:trial,coercionTrial:null,namedTrial:null,discoveryProbe:null,
  phaseDeadline:()=>Date.now()+30000,executionCase:'code-table-execute',report,owner:{prefix:'p'},executionNode:{node_id:'js'},executionInput:input,
  executionRuntime:{once:async(id,b,action)=>action(),executeNode:async()=>assert.fail('no Execute')},
  page:{evaluate:async(fn,args)=>[captureCalibrationWizard,beginCalibrationWizard,readCalibrationWizard,finishCalibrationWizardObservation,checkCalibrationWizardBaseline].includes(fn)?x.f.page.evaluate(fn,args):fn===stageReader?after:{verified:true},mouse:{click:async()=>{calls.push(stage);x.f.env.__loginomJavascriptNativeRoundtripV1.schemaWitness.model.FException={message:'parse fixture',name:'SyntaxError'};}}},
  prepareJavascriptNativeRoundtripWizard,captureCalibrationWizard,beginCalibrationWizard,readCalibrationWizard,finishCalibrationWizardObservation,checkCalibrationWizardBaseline,schemaContext:()=>x.context,readJavascriptStage:stageReader,
  guard:async()=>{},digest:s=>s,caseEffect:(id,e)=>e,requireJavascriptStageAdmission:async()=>{},
  exact:()=>({filter:()=>({evaluate:async()=>({x:1,y:1})})}),executionRecord:async e=>{if(e.phase==='calibration_wizard_baseline'){if(fault==='baseline-ack')return {};if(fault==='source-after-ack')x.lines[0]+=' ';}return record(e);},
  waitJavascriptStageObservation,javascriptStageTerminal,javascriptSentinelOutcome:()=>({sentinel_observed:false}),
  waitWizardReady:async()=>({page:{tid:stage==='done'?'p;DoneWizard':'p;CodeWizard'}}),save:async()=>{},Date
 });
 if(fault!=='none'){await assert.rejects(()=>runner(trial.probe));assert.equal(calls.length,0);return;}
 await runner(trial.probe);assert.equal(report.calibration_result.status,'wizard_diagnostic_observed');assert.deepEqual(calls,[stage]);
 assert.equal(trial.coverage.case_complete,false);
});

test('production calibration report explicitly flags redaction and bounded native text',async()=>{
 const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=source.indexOf('const save=async()=>{')+'const save=async()=>{'.length,end=source.indexOf('  if(namedTrial)',start);
 const rootReport={calibration_result:{failed:{error_details:'Error: private-text',native_error_complete:false}}};let saved;
 await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{rootReport,calibrationTrial:{coverage:{case_complete:false}},
  redactor:createRedactor(['private-text']),directory:'unused',writeJavascriptNamedReport:async(d,r)=>{saved=r;}})();
 assert.equal(saved.calibration_delivery.redacted,true);assert.equal(saved.calibration_delivery.truncation_status,'truncated');
 assert.equal(saved.calibration_delivery.native_text_complete,false);assert.equal(rootReport.calibration_result.failed.error_details,'Error: private-text');
});

for(const [fault,change]of Object.entries({units:w=>w.diagnostic.text_units++,tree:w=>w.diagnostic.tree=null,
 span:w=>w.diagnostic.source_span={line:4},owner:w=>w.diagnostic.native_owner_verified=false,
 completeness:w=>w.native_text_complete=false}))test('wizard host receipt refuses forged '+fault,async()=>{
 const id='K1-parse-v1',x=await roundtrip({fixtureId:'integer-safe',calibrationId:id,wizardOnly:true}),trial=createJavascriptCalibrationTrial(id);
 const before={...x.before,messages:[]};
 await x.f.page.evaluate(beginCalibrationWizard,{id,stage:'next',identity:x.identity,deadline:x.f.b.deadline});
 x.f.env.__loginomJavascriptNativeRoundtripV1.schemaWitness.model.FException={message:'fixture'};
 const after={...before,native_owner_verified:true,calibration_native_exception:await x.f.page.evaluate(readCalibrationWizard)};
 const witness=clone(await x.f.page.evaluate(captureCalibrationWizard,{id,stage:'next',identity:x.identity,before,after}));
 await trial.capturePrior({source:'prior',input:inputProof(x).input,node:{node_id:'js'},record});change(witness);
 await assert.rejects(()=>trial.wizard({witness,record}));await assert.rejects(()=>trial.run({}),/no replay/);
});

test('wizard native text delivery distinguishes exact capture from subsequent redaction',async()=>{
 const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=source.indexOf('const save=async()=>{')+'const save=async()=>{'.length,end=source.indexOf('  if(namedTrial)',start);
 const rootReport={calibration_result:{wizard:{native_text_complete:true,diagnostic:{tree:{message:'private wizard text'}}}}};let saved;
 await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{rootReport,calibrationTrial:{coverage:{case_complete:false}},
  redactor:createRedactor(['private wizard text']),directory:'unused',writeJavascriptNamedReport:async(d,r)=>{saved=r;}})();
 assert.equal(saved.calibration_delivery.native_text_complete,true);assert.equal(saved.calibration_delivery.redacted,true);
 assert.equal(saved.calibration_delivery.truncation_status,'not_truncated');
});
