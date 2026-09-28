import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {javascriptDiscoveryIds,javascriptDiscoveryProbe,javascriptDiscoveryOracle,observeJavascriptDiscovery,javascriptDiscoveryWizardDiagnostic,javascriptDiscoveryErrorButtonDiagnostic} from './javascript-discovery-probes.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';

function fixture(id='engine-literal-trim'){
 const probe=javascriptDiscoveryProbe(id),node={document_id:'doc',workflow_id:'flow',node_id:'js'};
 const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'doc:r:2',group_id:'2',node:{...node},
  launch_identity:{execution_id:'doc:r:2',group_id:'2',group_record_id:'second',root_id:'r',node:{...node}},
  trial:{phase:'initial',source_sha256:probe.source_sha256,node_id:'js'},fresh_baseline:{root_id:'r',node:{...node},roots:[{process_id:'1'}]}};
 const table={schema:structuredClone(probe.schema),row_count:1,sample_rows:1,sample_complete:true,filter_enabled:false,
  precision:{numbers_verified:true,limitations:[]},sample:[[{type:'string',is_null:false,value:'Ёж 😀',precision:'display_text'}]]};
 const progress=[],records=[];let reads=0;
 const args={probe,node,execution,deadline:100,now:()=>0,readOutput:async()=>{reads++;return table;},
  record:async e=>records.push(e),onProgress:async e=>progress.push(structuredClone(e))};
 return {probe,node,execution,table,progress,records,args,reads:()=>reads};
}

test('isolated catalog has immutable-by-copy sources, exact hashes and an independent input-text oracle',()=>{
 assert.equal(new Set(javascriptDiscoveryIds).size,javascriptDiscoveryIds.length);
 for(const id of javascriptDiscoveryIds){
  const p=javascriptDiscoveryProbe(id);
  assert.equal(p.source_sha256,createHash('sha256').update(p.source).digest('hex'));
  assert.equal(p.schema_mode,'code');assert.equal(p.build,'7.4.2');assert.ok(p.schema.every(c=>c.type));
 }
 const p=javascriptDiscoveryProbe('engine-input-text');
 assert.deepEqual(p.expected,[['["Alpha","  alpha  ","  ALPHA  "]'],['["BETA","beta","BETA"]'],
  ['["Alpha","alpha","ALPHA"]'],['["Гамма","гамма","ГАММА"]'],['["Ёж","ёж","ЁЖ"]'],['["delta","delta","DELTA"]']]);
 assert.ok(p.source.includes('InputTable.Get(row, "Customer")'));p.expected[0][0]='mutated';
 assert.notEqual(javascriptDiscoveryProbe(p.id).expected[0][0],'mutated');
 assert.throws(()=>javascriptDiscoveryProbe('arbitrary-source'));
});

test('fixed engine UI oracle succeeds without claiming native bytes or closing G5',async()=>{
 const f=fixture(),r=await observeJavascriptDiscovery(f.args);
 assert.equal(r.gate_passed,true);assert.equal(r.status,'typed_oracle_verified');assert.equal(f.reads(),1);
 assert.equal(r.proof_level,'typed_ui_only');assert.equal(r.native_bytes_verified,false);assert.deepEqual(r.gates_closed,[]);
 assert.equal(f.progress[0].status,'execution_terminal');assert.equal(f.progress[0].gate_passed,false);
});

test('oracle cannot be repinned by changing descriptor expected values or accepting actual schema',()=>{
 const f=fixture();f.probe.expected=[['wrong']];f.table.sample[0][0].value='wrong';
 assert.equal(javascriptDiscoveryOracle(f.probe,f.table).gate_passed,false);
 f.table.sample[0][0].value='Ёж 😀';f.table.schema[0].name='Other';
 assert.equal(javascriptDiscoveryOracle(f.probe,f.table).gate_passed,false);
 f.probe.source+=' ';assert.throws(()=>javascriptDiscoveryOracle(f.probe,f.table),/pin changed/);
});

test('partial output, rounded integers and hidden NULL semantics are refused',()=>{
 for(const mutate of [t=>t.sample_complete=false,t=>t.row_count=2,t=>t.precision.limitations=['loss'],
  t=>t.sample[0][0].precision='unverified',t=>t.sample[0][0].is_null=undefined]){
  const f=fixture();mutate(f.table);assert.throws(()=>javascriptDiscoveryOracle(f.probe,f.table));
 }
 const f=fixture();f.table.sample[0][0]={type:'string',is_null:true,value:null,precision:'exact_null'};
 assert.equal(javascriptDiscoveryOracle(f.probe,f.table).gate_passed,false);
});

test('typed G5 expected values preserve null, empty, false, zero and exact safe integers',()=>{
 assert.deepEqual(javascriptDiscoveryProbe('g5-null-empty').expected,[[null],[''],['null'],['0'],['false']]);
 assert.deepEqual(javascriptDiscoveryProbe('g5-boolean').expected,[[null],[false],[true]]);
 assert.deepEqual(javascriptDiscoveryProbe('g5-real').expected,[[null],[0],[-1.25],[10.125]]);
 const p=javascriptDiscoveryProbe('g5-safe-integer');
 assert.deepEqual(p.expected,[['-9007199254740991'],['0'],['9007199254740991']]);
 const t={schema:p.schema,row_count:3,sample_rows:3,sample_complete:true,filter_enabled:false,precision:{numbers_verified:true,limitations:[]},
  sample:['-9007199254740991','0','9007199254740991'].map(value=>[{type:'integer',is_null:false,value,precision:'exact_integer'}])};
 assert.equal(javascriptDiscoveryOracle(p,t).gate_passed,true);
 t.sample[2][0].value='9007199254740990';assert.equal(javascriptDiscoveryOracle(p,t).gate_passed,false);
 t.sample[2][0].precision='unverified';assert.throws(()=>javascriptDiscoveryOracle(p,t));
});

test('unknown integer coercion, undefined and outside-safe probes never choose expected values from observations',()=>{
 for(const id of ['g5-undefined','g5-outside-safe','g5-integer-fraction','g5-integer-string','g5-integer-nan','g5-integer-positive-infinity','g5-integer-negative-infinity','g5-name-case']){
  const p=javascriptDiscoveryProbe(id),f=fixture();
  assert.equal(p.expectation,'characterization');assert.equal(p.expected,null);
  assert.equal(javascriptDiscoveryOracle(p,f.table).gate_passed,false);
 }
});

test('empty output has an independently fixed zero-row oracle and still requires a full schema',()=>{
 const p=javascriptDiscoveryProbe('g5-empty-output'),t={schema:p.schema,row_count:0,sample_rows:0,sample_complete:true,
  sample:[],filter_enabled:false,precision:{numbers_verified:true,limitations:[]}};
 assert.equal(javascriptDiscoveryOracle(p,t).gate_passed,true);
 t.schema=[];assert.throws(()=>javascriptDiscoveryOracle(p,t));
});

test('civil Date output verifies milliseconds only, not native bytes or a native input roundtrip',()=>{
 const p=javascriptDiscoveryProbe('g5-date-civil'),t={schema:p.schema,row_count:2,sample_rows:2,sample_complete:true,filter_enabled:false,
  precision:{numbers_verified:true,limitations:[]},sample:[[{type:'datetime',is_null:true,value:null,precision:'exact_null'}],
    [{type:'datetime',is_null:false,value:'2024-02-29T23:59:59.123',precision:'millisecond'}]]};
 assert.equal(javascriptDiscoveryOracle(p,t).gate_passed,true);
 assert.equal(javascriptDiscoveryOracle(p,t).native_bytes_verified,false);
 t.sample[1][0].value='2024-02-29T23:59:59.000';assert.equal(javascriptDiscoveryOracle(p,t).gate_passed,false);
});

test('owned native diagnostics retain observed text and explicit absent class/position without Table',async()=>{
 const f=fixture('engine-sync-throw');Object.assign(f.execution,{status:'failed',output_refreshed:false,
  ownership_source:'native_process_model_identity_and_show_node',error_source:'native_child_error_details',
  error:{code:'NODE_EXECUTION_FAILED',message:'Error: JS_DISCOVERY_SYNC_THROW'}});
 const r=await observeJavascriptDiscovery(f.args);
 assert.equal(f.reads(),0);assert.equal(r.gate_passed,false);assert.equal(r.diagnostic.sync_marker_observed,true);
 assert.equal(r.diagnostic.class_observed,null);assert.equal(r.diagnostic.position_observed,null);
 assert.equal(r.status,'owned_native_failure');
});

test('foreign, stale, unowned or wrong-source execution never reads output',async()=>{
 for(const mutate of [e=>e.owner_verified=false,e=>e.trial.source_sha256='old',e=>e.fresh_baseline.node.workflow_id='foreign',
  e=>e.fresh_baseline.roots.push({process_id:'2'}),e=>e.status='cancelled',e=>e.launch_identity.root_id='other',
  e=>e.launch_identity.node.document_id='other']){
  const f=fixture();mutate(f.execution);await assert.rejects(observeJavascriptDiscovery(f.args));assert.equal(f.reads(),0);
 }
 const f=fixture();Object.assign(f.execution,{status:'failed',error:{message:'dependency'},output_refreshed:false});
 await assert.rejects(observeJavascriptDiscovery(f.args),/Owned native diagnostic/);assert.equal(f.reads(),0);
});

test('expired budget or failed output keeps the terminal checkpoint and never retries a read',async()=>{
 for(const fail of ['deadline','read']){
  const f=fixture();if(fail==='deadline')f.args.now=()=>100;
  else f.args.readOutput=async()=>{throw Error('Read failed');};
  await assert.rejects(observeJavascriptDiscovery(f.args));
  assert.equal(f.progress[0].execution.execution_id,f.execution.execution_id);assert.equal(f.progress[0].execution_started,true);
  assert.equal(f.progress[0].gate_passed,false);
 }
});

test('CLI rejects unknown probe and mixed batch/single selection before reading credentials or opening a browser',async()=>{
 await assert.rejects(runJavascriptOperator(['--discovery-probe','unknown']),/Unknown isolated/);
 await assert.rejects(runJavascriptOperator(['--discovery-probe','engine-data-smoke','--execution-case','code-table-execute']),/one isolated/);
 await assert.rejects(runJavascriptOperator(['--discovery-probe','engine-data-smoke'],{batchCases:['code-table-execute']}),/one isolated/);
});

test('production isolated runner uses one Execute or stops at an owned wizard diagnostic without mapping/reopen',async()=>{
 const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const start=source.indexOf('const runExecutionTrial=async probe=>'),end=source.indexOf('const verifyBatchInputIdentity=',start);
 assert.ok(start>0&&end>start);
 for(const wizardDiagnostic of [false,true]){
 const f=fixture(),steps=[],report={execution_probe:{},case_id:'only-case'},deadline=Date.now()+10000;
 const runner=vm.runInNewContext(source.slice(start,end)+'\nrunExecutionTrial',{persistence:null,coldReader:false,coldOpenPending:false,
  calibrationTrial:null,phaseDeadline:()=>deadline,nativeRoundtrip:false,executionCase:'code-table-execute',discoveryProbe:f.probe,report,owner:{prefix:'p'},executionNode:f.node,
  executionRuntime:{captureExecutionBoundary:async()=>({native:{dispose:async()=>steps.push('dispose')}}),
    verifyExecutionBoundary:async()=>steps.push('boundary'),executeNode:async(node,limit,trial)=>{
      steps.push('execute');assert.equal(limit,deadline);assert.equal(trial.source_sha256,f.probe.source_sha256);return f.execution;},
    readPassive:async(node,kind)=>{steps.push('output');assert.equal(kind,'discovery');return f.table;},
    once:async(id,args,run)=>run()},
  page:{evaluate:async()=>({owner_verified:true,messages:[]}),mouse:{click:async()=>steps.push(wizardDiagnostic?'next':'done')}},schemaContext:()=>({}),readJavascriptStage:()=>{},
  guard:async()=>{},readOwnedExecutionSource:async()=>{},digest:s=>s,caseEffect:(id,effect)=>id+effect,
  requireJavascriptStageAdmission:async()=>{},exact:()=>({filter:()=>({evaluate:async()=>({x:1,y:1})}),waitFor:async()=>{}}),
  executionRecord:async()=>{},waitJavascriptStageObservation:async()=>wizardDiagnostic?{owner_verified:true,native_owner_verified:true,
    wizard_visible:true,messages:[{id:'fresh',text:'Owned wizard diagnostic'}]}:{},javascriptStageTerminal:()=>true,
  javascriptSentinelOutcome:()=>({sentinel_observed:false}),waitWizardReady:async()=>({page:{tid:wizardDiagnostic?'p;JavaScriptCodeWizard':'p;DoneWizard'}}),
  waitGraphReady:async()=>{},openedWizard:true,verifyBatchInputIdentity:async()=>steps.push('input'),save:async()=>{},
  observeJavascriptDiscovery,javascriptDiscoveryWizardDiagnostic,Date
 });
 await runner(f.probe);
 if(wizardDiagnostic){
  assert.deepEqual(steps,['next']);assert.equal(report.discovery_result.status,'owned_wizard_diagnostic');
  assert.equal(report.discovery_result.gate_passed,false);
 }else{
  assert.equal(steps.filter(x=>x==='execute').length,1);assert.equal(steps.filter(x=>x==='output').length,1);
  assert.equal(steps[0],'done');assert.equal(steps.at(-1),'dispose');
  assert.equal(report.discovery_result.gate_passed,true);assert.equal(report.discovery_result.boundary_verified,true);
 }
 }
});

test('fresh owned wizard diagnostic is distinct from process failure and never proves absent syntax support',()=>{
 const probe=javascriptDiscoveryProbe('engine-native-parse-error'),identity={node_id:'js',source_sha256:probe.source_sha256};
 const before={owner_verified:true,messages:[{id:'old',text:'older'}]},after={owner_verified:true,native_owner_verified:true,
  wizard_visible:true,pending:false,messages:[{id:'new',text:'Syntax error near token'}]};
 const r=javascriptDiscoveryWizardDiagnostic({probe,identity,stage:'next',before,after});
 assert.equal(r.status,'owned_wizard_diagnostic');assert.equal(r.explicit_execute_dispatched,false);
 assert.equal(r.execution,'ambiguous');assert.equal(r.absence_proves_no_execution,false);
 assert.equal(r.syntax_support,'not_determined');assert.equal(r.gate_passed,false);
 for(const change of [s=>s.owner_verified=false,s=>s.native_owner_verified=false,s=>s.pending=true,
  s=>s.boundary_refusal='foreign_dialog',s=>s.wizard_visible=false,s=>s.messages=before.messages,s=>s.messages=[]]){
  const state=structuredClone(after);change(state);
  assert.equal(javascriptDiscoveryWizardDiagnostic({probe,identity,stage:'next',before,after:state}),null);
 }
 assert.throws(()=>javascriptDiscoveryWizardDiagnostic({probe,identity:{...identity,source_sha256:'other'},stage:'next',before,after}));
});

test('closed native error button preserves exact SyntaxError and refuses unowned or unclosed diagnostics',()=>{
 const probe=javascriptDiscoveryProbe('engine-nullish');
 const identity={effect_id:'once',node_id:'js',source_sha256:probe.source_sha256};
 const error={identity,stage:'next',page_tid:'MF;TF-1;WizrdMCF;JavaScriptCodeWizard',
  button_tid:'MF;TF-1;WizrdMCF;btnError',tooltip:'SyntaxError: Syntax error at code (:4:33)',
  tooltip_truncated:false,dialog_text:'SyntaxError: Syntax error at code (:4:33)',dialog_text_truncated:false,
  dialog_closed:true,native_owner_verified:true};
 const result=javascriptDiscoveryErrorButtonDiagnostic({probe,identity,error});
 assert.equal(result.status,'owned_wizard_refusal');assert.equal(result.class_observed,'SyntaxError');
 assert.deepEqual(result.position_observed,{line:4,column:33});
 assert.equal(result.syntax_support,'native_parse_refusal');assert.equal(result.gate_passed,false);
 assert.equal(result.explicit_execute_dispatched,false);
 for(const change of [e=>e.dialog_closed=false,e=>e.native_owner_verified=false,e=>e.identity.node_id='other',
  e=>e.dialog_text='']){
  const bad=structuredClone(error);change(bad);
  assert.throws(()=>javascriptDiscoveryErrorButtonDiagnostic({probe,identity,error:bad}));
 }
});
