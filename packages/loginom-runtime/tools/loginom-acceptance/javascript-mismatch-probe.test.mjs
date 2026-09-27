import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {javascriptExecutionProbes} from './javascript-execution-probes.mjs';
import {javascriptMismatchSource,javascriptExecutionIdentity,characterizeJavascriptMapping,verifyJavascriptMismatchTable,
  javascriptMismatchOutputOracle,javascriptMismatchVerdict,runJavascriptMismatchMaterialization,verifyJavascriptPreviousExecution} from './javascript-mismatch-probe.mjs';
import {javascriptBatchVerdict} from './javascript-batch-plan.mjs';

function fixture(){
 const node={document_id:'doc',workflow_id:'flow',node_id:'js'};
 const probe=javascriptExecutionProbes('RowID').find(p=>p.id==='code-table-v1'),changed=javascriptMismatchSource(probe);
 const identity=javascriptExecutionIdentity(node,changed),owner={...node,verified:true,surface:'wizard',output_port:{direction:'output',port:0,port_guid:'port'}};
 const sourceProof={...node,verified:true,owner_verified:true,schema_mode:'code',node_id:'js',source_sha256:changed.source_sha256};
 const baseline={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'doc:r:1',group_id:'1',
  launch_identity:{root_id:'r',node,execution_id:'doc:r:1',group_id:'1',group_record_id:'first'},
  trial:javascriptExecutionIdentity(node,{phase:'initial',source_sha256:probe.source_sha256}),fresh_baseline:{root_id:'r',node,roots:[]}};
 const fields=[{name:'ObservedID',label:'ObservedID',type:'integer',excluded:false},{name:'ManualMarker',label:'ManualMarker',type:'string',excluded:false}];
 const state={prepared_node_context:owner,node_mapping:{verified:false,source_identity_verified:false,reason:'mapping_render_value',node_context:owner},
  wizard:{status:'observed',stage:'output_mapping',output_columns:{status:'rendered_rows',fields:fields.map(f=>({...f,status:'observed',source:{status:'unobserved'}})),
   auto_sync:{status:'observed',value:false},definition_coverage:{status:'partial'}}}};
 const postDone=characterizeJavascriptMapping(state,node);
 const native={verified:true,source_identity_verified:true,inventory_complete:true,autosync:false,target_fields:fields,
  source_fields:[{name:'ObservedID',label:'ObservedID',type:'integer',record_id:'source0',field_id:'0'},{name:'GeneratedMarker',label:'GeneratedMarker',type:'string',record_id:'source1',field_id:'1'}]};
 native.target_fields.forEach((f,i)=>{f.source=structuredClone(native.source_fields[i]);});
 const manual={settings_applied:true,definition:{...structuredClone(native),source_fields:[{name:'ObservedID',type:'integer'},{name:'PhaseMarker',type:'string'}]}};
 const mapping={...postDone,status:'verified',mapping:native};
 const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'doc:r:2',group_id:'2',
  trial:identity,fresh_baseline:{root_id:'r',node,roots:[{process_id:'1',record_id:'first',completed:true}]}};
 const output={table:{port_guid:'port'},schema:structuredClone(fields),sample_complete:true,row_count:6,sample_rows:6,filter_enabled:false,
  precision:{numbers_verified:true,limitations:[]},sample:Array.from({length:6},(_,i)=>[
   {type:'integer',is_null:false,value:String(i+1),precision:'exact_integer'},
   {type:'string',is_null:false,value:'JS_G2_TABLE_V1',precision:'display_text'}])};
 const steps=[],records=[];let clock=0;
 const args={node,changed,sourceProof,manual,postDone,baseline,deadline:100,now:()=>clock,
  verifyBoundary:async()=>steps.push('boundary'),execute:async given=>{assert.deepEqual(given,identity);steps.push('execute');return execution;},
  readMapping:async()=>{steps.push('mapping');return mapping;},readOutput:async()=>{steps.push('output');return output;},record:async r=>records.push(r)};
 return {node,changed,state,sourceProof,manual,postDone,baseline,mapping,execution,output,args,steps,records,setClock:v=>clock=v};
}

test('changed code fixture has a pinned exact source and only the explicit second phase',()=>{
 const f=fixture();assert.equal(f.changed.source_sha256,'f27e0409c160ed0417a66517773b2b7c19bfa60a3fe3e0fb4c91aeaea1e098bb');
 assert.equal(f.changed.source.includes('PhaseMarker'),false);assert.equal(f.changed.source.split('GeneratedMarker').length,3);
 for(const probe of javascriptExecutionProbes('RowID').filter(p=>p.id!=='code-table-v1'))assert.throws(()=>javascriptMismatchSource(probe));
 assert.throws(()=>javascriptExecutionIdentity(f.node,{phase:'retry',source_sha256:f.changed.source_sha256}));
});

test('post-Done mapping_render_value remains an unverified bounded characterization',()=>{
 const f=fixture(),r=characterizeJavascriptMapping(f.state,f.node);
 assert.equal(r.status,'unverified');assert.equal(r.mapping.verified,false);assert.equal(r.rendered_is_native_schema,false);
 for(const change of [s=>s.prepared_node_context.node_id='foreign',s=>s.prepared_node_context.output_port.direction='input',
  s=>s.node_mapping.reason='mapping_mask',s=>s.node_mapping.source_identity_verified=true,s=>s.wizard.output_columns.fields=[],
  s=>s.wizard.output_columns.fields[0].status='ambiguous']){
  const s=structuredClone(f.state);change(s);assert.throws(()=>characterizeJavascriptMapping(s,f.node));
 }
});

test('fresh changed-source execution observes materialized schema and fixed manual-layout values',async()=>{
 const f=fixture(),r=await runJavascriptMismatchMaterialization(f.args);
 assert.equal(r.gate_passed,true);assert.equal(r.source_schema_materialized,true);assert.equal(r.manual_mapping_preserved,true);
 assert.equal(r.output_oracle.layout,'manual');assert.equal(r.reset_dispatched,false);assert.equal(r.autosync_dispatched,false);
 assert.deepEqual(f.steps,['boundary','execute','boundary','mapping','output','boundary']);
 assert.equal(f.records.at(-1).phase,'mismatch_materialization_observed');
 const probe={status:'typed_output_verified',execution:f.baseline,output:{...f.output,schema:[{name:'ObservedID',type:'integer'},{name:'PhaseMarker',type:'string'}]},
  existing_readback:{source_verified:true,mode_verified:true,port_mappings_unchanged:true,generated_schema_mismatch_trial:r}};
 assert.equal(javascriptBatchVerdict('code-table-mismatch',probe,{owner_verified:true,wizard_closed:true,quiet:true,node_count:2}).gate_passed,true);
});

test('fixed output oracle distinguishes generated, manual, baseline and unexpected layouts',()=>{
 const f=fixture();
 for(const [name,layout,pass] of [['GeneratedMarker','generated',true],['ManualMarker','manual',true],['PhaseMarker','baseline',false],['Other','unexpected',false]]){
  const t=structuredClone(f.output);t.schema[1].name=name;t.schema[1].label=name;
  assert.equal(javascriptMismatchOutputOracle(t).layout,layout);assert.equal(javascriptMismatchOutputOracle(t).changed_output_verified,pass);
 }
 for(const change of [t=>t.sample[1][0].value='1',t=>t.sample[0][1].value='stale',
  t=>t.sample[0][1]={type:'string',is_null:true,value:null,precision:'exact_null'}]){
  const t=structuredClone(f.output);change(t);assert.equal(javascriptMismatchOutputOracle(t).changed_output_verified,false);
 }
});

test('retained manual name, baseline schema or old output cannot grant materialization PASS',async()=>{
 for(const fault of ['unverified_mapping','old_source','old_output','null_output','generated_layout','wrong_source_binding','wrong_first_binding','reset_mapping','wrong_label','reordered_targets']){
  const f=fixture();
  if(fault==='unverified_mapping')f.args.readMapping=async()=>f.postDone;
  if(fault==='old_source')f.mapping.mapping.source_fields[1].name='PhaseMarker';
  if(fault==='generated_layout'){f.output.schema[1].name='GeneratedMarker';f.output.schema[1].label='GeneratedMarker';}
  if(fault==='wrong_source_binding')f.mapping.mapping.target_fields[1].source.record_id='old-source';
  if(fault==='wrong_first_binding')f.mapping.mapping.target_fields[0].source.field_id='foreign';
  if(fault==='wrong_label')f.mapping.mapping.target_fields[1].label='Other';
  if(fault==='reordered_targets')f.mapping.mapping.target_fields.reverse();
  if(fault==='reset_mapping')f.mapping.mapping.autosync=true;
  if(fault==='old_output'){f.output.schema[1].name='PhaseMarker';f.output.schema[1].label='PhaseMarker';}
  if(fault==='null_output')f.output.sample[0][1]={type:'string',is_null:true,value:null,precision:'exact_null'};
  const r=await runJavascriptMismatchMaterialization(f.args);assert.equal(r.gate_passed,false,fault);assert.equal(r.safe_to_continue,true);
 }
});

test('production second Execute refuses replaced process history before selection or launch',async()=>{
 const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async executeNode('),end=source.indexOf('    async readPassive(',start);
 for(const change of [b=>b.root_id='other',b=>b.roots=[],b=>b.roots[0].record_id='replaced',b=>b.node.workflow_id='foreign']){
  const f=fixture(),fresh=structuredClone(f.execution.fresh_baseline),events=[],phases=new Map([[f.baseline.trial.effect_id,{terminal:f.baseline}]]);
  change(fresh);
  const operator=vm.runInNewContext('({'+source.slice(start,end)+'})',{
   deadline:Date.now()+5000,javascriptExecutionIdentity,verifyJavascriptPreviousExecution,executionPhases:phases,
   channel:()=>({}),createNodeExecutionProcedure:()=>({prepare:async()=>{events.push('prepare');return fresh;}}),
   privateGraphBinding:async()=>{events.push('binding');throw Error('Must not select or launch');}
  });
  await assert.rejects(operator.executeNode(f.node,undefined,f.changed),/Previous execution identity/);
  await assert.rejects(operator.executeNode(f.node,undefined,{...f.changed,source_sha256:'f'.repeat(64)}),/already reserved/);
  assert.deepEqual(events,['prepare']);
 }
});

test('owned native failure is recorded without reading a successful Table',async()=>{
 const f=fixture();Object.assign(f.execution,{status:'failed',ownership_source:'native_process_model_identity_and_show_node',
  error_source:'native_child_error_details',error:{message:'Changed schema failed'}});f.args.readMapping=async()=>f.postDone;
 const r=await runJavascriptMismatchMaterialization(f.args);assert.equal(r.gate_passed,false);assert.equal(r.execution.status,'failed');
 assert.equal(f.steps.includes('output'),false);assert.equal(r.output,null);
});

test('mismatch admission refuses wrong source, missing baseline and unconfirmed manual mapping before Execute',async()=>{
 for(const change of [f=>f.sourceProof.source_sha256='a'.repeat(64),f=>f.sourceProof.owner_verified=false,
  f=>f.changed.source+=' ',f=>f.baseline.status='failed',f=>f.baseline.owner_verified=false,
  f=>f.manual.settings_applied=false,f=>f.manual.definition.autosync=true,f=>f.postDone.node_context.node_id='foreign']){
  const f=fixture();change(f);await assert.rejects(runJavascriptMismatchMaterialization(f.args));assert.equal(f.steps.includes('execute'),false);
 }
});

test('freshness, phase/source and native owner failures never consume later output reads',async()=>{
 for(const change of [f=>f.execution.execution_id=f.baseline.execution_id,f=>f.execution.owner_verified=false,
  f=>f.execution.trial={...f.execution.trial,source_sha256:f.baseline.trial.source_sha256},f=>f.execution.status='cancelled']){
  const f=fixture();change(f);await assert.rejects(runJavascriptMismatchMaterialization(f.args));
  assert.equal(f.steps.filter(s=>s==='execute').length,1);assert.equal(f.steps.includes('mapping'),false);assert.equal(f.steps.includes('output'),false);
 }
});

test('one original deadline and changed boundary prevent continuation without retrying Execute',async()=>{
 for(const when of ['before','admission','execute','boundary']){
  const f=fixture();if(when==='before')f.setClock(100);
  if(when==='admission')f.args.record=async()=>f.setClock(100);
  if(when==='execute')f.args.execute=async()=>{f.steps.push('execute');f.setClock(100);return f.execution;};
  if(when==='boundary'){let n=0;f.args.verifyBoundary=async()=>{if(n++)throw Error('Native owner changed');};}
  await assert.rejects(runJavascriptMismatchMaterialization(f.args));
  assert.equal(f.steps.filter(s=>s==='execute').length,['execute','boundary'].includes(when)?1:0);
  assert.equal(f.steps.includes('mapping'),false);
 }
});

test('full typed mismatch read rejects truncation, precision loss, foreign port and reused process baseline',async()=>{
 for(const change of [t=>t.sample_complete=false,t=>t.row_count=11,t=>t.sample.pop(),t=>t.precision.numbers_verified=false,
  t=>t.sample[0][0].precision='unverified']){
  const t=structuredClone(fixture().output);change(t);assert.throws(()=>verifyJavascriptMismatchTable(t));
 }
 const f=fixture(),r=await runJavascriptMismatchMaterialization(f.args);
 for(const change of [t=>t.output.table.port_guid='other',t=>t.execution.fresh_baseline.roots.push({process_id:'2'}),
  t=>t.mapping.node_context.workflow_id='foreign',t=>t.source_proof.verified=false]){
  const t=structuredClone(r);change(t);assert.throws(()=>javascriptMismatchVerdict(t,f.baseline));
 }
});

test('production Execute reserves one case/node/phase even after lost result or a changed digest',async()=>{
 const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async executeNode('),end=source.indexOf('    async readPassive(',start);
 for(const lost of [false,true]){
  const phases=new Map(),launches=[],baselines=[];let count=0;
  const operator=vm.runInNewContext('({'+source.slice(start,end)+'})',{
   deadline:Date.now()+10000,javascriptExecutionIdentity,verifyJavascriptPreviousExecution,executionPhases:phases,
   createNodeExecutionProcedure:()=>{const id=++count,node={document_id:'doc',workflow_id:'flow',node_id:'js'};return {
    prepare:async()=>{baselines.push(id);return {root_id:'r',roots:id===1?[]:[{process_id:'1',record_id:'first',completed:true}],node};},
    launchGraph:async()=>{launches.push(id);if(lost&&id===2)throw Error('Lost launch');return {};},
    identify:async()=>({root_id:'r',node,group_id:String(id),group_record_id:id===1?'first':'second',execution_id:'exec'+id}),
    waitCompleted:async()=>({verified:true,owner_verified:true,status:'completed',cleanup_complete:true,execution_id:'exec'+id,group_id:String(id)})};},
   channel:()=>({}),privateGraphBinding:async()=>({dispose:async()=>{}}),page:{evaluate:async()=>({})},
   selectJavascriptForSettings:async()=>{},once:async(id,identity,run)=>run(),record:async()=>{},waitJavascriptExecutionNotifications:async()=>{}
  });
  const node={node_id:'js'},a={phase:'initial',source_sha256:'a'.repeat(64)},b={phase:'generated-mismatch',source_sha256:'b'.repeat(64)};
  await assert.rejects(operator.executeNode(node,undefined,b),/completed distinct/);
  await operator.executeNode(node,undefined,a);
  await assert.rejects(operator.executeNode(node,undefined,{...b,source_sha256:a.source_sha256}),/completed distinct/);
  if(lost)await assert.rejects(operator.executeNode(node,undefined,b),/Lost launch/);else await operator.executeNode(node,undefined,b);
  await assert.rejects(operator.executeNode(node,undefined,{...b,source_sha256:'c'.repeat(64)}),/already reserved/);
  await assert.rejects(operator.executeNode(node,undefined,{...a,source_sha256:'d'.repeat(64)}),/already reserved/);
  assert.deepEqual(launches,[1,2]);assert.deepEqual(baselines,[1,2]);
 }
});

test('previous execution root, full owner and native process record must survive the fresh baseline',async()=>{
 for(const change of [f=>f.execution.fresh_baseline.root_id='new-root',f=>f.execution.fresh_baseline.roots=[],
  f=>f.execution.fresh_baseline.roots[0].record_id='recreated',f=>f.execution.fresh_baseline.roots[0].completed=false,
  f=>f.execution.fresh_baseline.node={...f.node,document_id:'foreign'},f=>f.baseline.launch_identity.group_id='other',
  f=>f.baseline.launch_identity.node={...f.node,workflow_id:'foreign'}]){
  const f=fixture();change(f);await assert.rejects(runJavascriptMismatchMaterialization(f.args));
  assert.equal(f.steps.includes('mapping'),false);assert.equal(f.steps.includes('output'),false);
 }
});

test('production characterize reader polls incomplete cache without another open and retains strict default',async()=>{
 const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async readPortMapping('),end=source.indexOf('    async prepareInput(',start);
 assert.ok(start>0&&end>start);
 for(const scenario of ['render','verified','strict','timeout','owner']){
  const f=fixture(),events=[],limit=Date.now()+5000;
  const incomplete=structuredClone(f.state);incomplete.node_mapping.reason='mapping_store';
  const ready=structuredClone(f.state);
  if(scenario==='verified'||scenario==='strict')ready.node_mapping={...f.mapping.mapping,node_context:ready.prepared_node_context};
  if(scenario==='owner')incomplete.node_mapping.node_context={...f.node,workflow_id:'foreign'};
  const reader={openPort:async(direction,port)=>{assert.equal(direction,'output');assert.equal(port,0);events.push('open');},
   observe:async options=>{
    events.push('observe');assert.equal(options.readMappings,true);
    assert.equal(options.ready(incomplete),false);
    if(scenario==='timeout'){assert.equal(options.ready(incomplete),false);throw Error('Original bounded timeout');}
    if(scenario==='strict')assert.equal(options.ready(f.state),false);
    assert.equal(options.ready(ready),true);return ready;
   }};
  const operator=vm.runInNewContext('({'+source.slice(start,end)+'})',{
   deadline:limit+1000,prepared:{document_id:'doc',workflow_ref:{workflow_id:'flow'}},characterizeJavascriptMapping,
   channel:(node,deadline)=>{assert.equal(deadline,limit);return reader;},graph:async()=>({same:true}),
   requireJavascriptTopology:()=>{},requireJavascriptGraphUnchanged:()=>events.push('same-graph'),captureJavascriptNativeTopology:()=>{},
   page:{evaluateHandle:async()=>({dispose:async()=>events.push('dispose')}),evaluate:async()=>{events.push('native-check');return {}; }},
   record:async()=>{},closeJavascriptPortMapping:async args=>{assert.equal(args.reader,reader);assert.ok(args.deadline<=limit);
    events.push('close');await args.verifyGraph();}
  });
  const run=()=>operator.readPortMapping(f.node,'output',{characterize:scenario!=='strict',operationDeadline:limit});
  if(scenario==='timeout'||scenario==='owner')await assert.rejects(run(),scenario==='owner'?/owner differs/:/bounded timeout/);
  else {
   const result=await run();
   if(scenario==='render'){assert.equal(result.status,'unverified');assert.equal(result.mapping.verified,false);assert.equal(result.mapping.source_identity_verified,false);}
   else assert.equal(scenario==='strict'?result.verified:result.mapping.verified,true);
  }
  assert.deepEqual(events,['open','observe','close','native-check','same-graph','dispose']);
 }
});

test('pending mapping only waits without accepting unknown reasons or conflicting owners',()=>{
 const f=fixture();
 for(const reason of ['mapping_store','mapping_mask','mapping_views','unknown']){
  const state=structuredClone(f.state);state.node_mapping.reason=reason;
  assert.equal(characterizeJavascriptMapping(state,f.node,{allowPending:true}),null);
  assert.throws(()=>characterizeJavascriptMapping(state,f.node),/Unsupported/);
 }
 for(const change of [s=>s.node_mapping.reason='mapping_node_changed',s=>s.prepared_node_context.document_id='foreign',
  s=>s.node_mapping.node_context={...f.node,workflow_id:'foreign'},
  s=>s.node_mapping.node_context={...f.state.prepared_node_context,output_port:{port_guid:'foreign'}},
  s=>s.wizard.stage='input_mapping']){
  const state=structuredClone(f.state);change(state);
  assert.throws(()=>characterizeJavascriptMapping(state,f.node,{allowPending:true}),/owner differs/);
 }
 assert.equal(characterizeJavascriptMapping({},f.node,{allowPending:true}),null);
});
