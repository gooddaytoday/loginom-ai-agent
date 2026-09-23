import test from 'node:test';
import assert from 'node:assert/strict';
import {applyNode,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {NodeProcedureStepError} from '../lib/node-procedure.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';
const request=()=>({operation_id:'apply1',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},
  target:{kind:'new',type:'imports.text',label:'Import',position:{x:96,y:80}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
  read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:1000,execute_ms:1000,total_ms:10000}});
function fixture({badPhase,badResult,failJournal,failAfter,signal}={}){
 const calls=[],records=[],operation={id:'apply1'};let time=1;
 const respond=(name,value={})=>async(...args)=>{calls.push(name);if(name===failAfter)throw Error('transport lost');return {verified:true,cleanup_complete:true,effect_possible:false,...value,...(name===badPhase?badResult:{})}};
 const handlers=new Map([['imports.text',{revision:'1',modes:['delimited'],validate:p=>{if(p.unsupported)throw Error('unsupported format')},configure:respond('configure')}]]);
 const drivers={verifySource:respond('source'),prepareTarget:respond('target',{node:{document_id:'doc',workflow_id:'workflow',node_id:'node1'}}),
  mapPorts:respond('mapping'),openWizard:respond('open'),finish:async mode=>respond('finish',{mode,execution_started:mode==='execute',execution_id:mode==='execute'?'execution1':null})(),
  waitExecution:respond('execute',{execution_id:'execution1',status:'completed'}),readOutput:respond('read',{status:'complete',evidence_ref:'evidence1',execution_id:'execution1',ports:[{port:0,fresh:true,row_count:0,schema:[],sample:[]}]}),
  verifyContinuation:async()=>true};
 const record=async e=>{records.push(structuredClone(e));if(e.phase===failJournal)throw Error('disk unavailable');return structuredClone(e)};
 const run=(r=request(),extra={})=>applyNode({request:r,operation,handlers,drivers,record,signal,now:()=>time,...extra});
 return {run,calls,records,operation,handlers,drivers,setTime:v=>{time=v}};
}
test('full shell orders configuration before execution and binds empty fresh output',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(r.execution.status,'completed');assert.equal(r.output.ports[0].row_count,0);
 assert.deepEqual(f.calls,['source','target','mapping','open','configure','mapping','finish','execute','read']);
 assert.equal(r.package_saved,false);assert.equal(r.persisted_package_verified,false);assert.equal(f.records.at(-1).phase,'node_checkpoint');
});
for(const expired of [false,true])test('host configuration beyond five minutes retains the original shared total deadline '+expired,async()=>{
 const f=fixture(),bindings=createUserWorkflowBindings(),p=request();
 bindings.remember({document_id:p.document_id,workflow_ref:p.workflow_ref});delete p.budgets;
 const expanded=bindings.expandNode(p),configure=f.handlers.get('imports.text').configure,read=f.drivers.readOutput;
 f.handlers.get('imports.text').configure=async(...args)=>{f.setTime(350001);return configure(...args)};
 f.drivers.readOutput=async(options,ctx)=>{assert.equal(ctx.deadline,600001);f.setTime(expired?600002:445001);return read(options,ctx)};
 const result=await f.run(expanded);assert.equal(result.status,expired?'AMBIGUOUS':'SUCCEEDED');
 assert.ok(f.calls.includes('read'));
 assert.equal(f.operation.nodeApply.deadline,600001);
 if(expired){assert.match(result.error.message,/deadline/);assert.ok(!f.records.some(r=>r.phase==='node_checkpoint'));}
});
test('Done never waits or reads stale output',async()=>{
 const f=fixture(),p=request();p.finish='done';p.read.ports=[];const r=await f.run(p);
 assert.equal(r.status,'SUCCEEDED');assert.deepEqual(r.execution,{status:'not_requested',execution_id:null});assert.equal(r.output.status,'not_refreshed');
 assert.ok(!f.calls.includes('execute')&&!f.calls.includes('read'));
});
test('Close requires discarded settings and never executes or refreshes output',async()=>{
 for(const discarded of [true,false]) {
  const f=fixture(),p=request();p.finish='close';p.read.ports=[];
  f.handlers.get('imports.text').configurationReadback=()=>{throw Error('Discarded settings must not produce an applied readback')};
  f.drivers.finish=async()=>({verified:true,cleanup_complete:true,mode:'close',execution_started:false,settings_applied:!discarded,draft_discarded:discarded});
  const result=await f.run(p);
  assert.equal(result.status,discarded?'SUCCEEDED':'AMBIGUOUS');
  assert.ok(!f.calls.includes('execute')&&!f.calls.includes('read'));
  if(discarded){assert.equal(result.configuration.status,'discarded');assert.equal(result.checkpoint_kind,'local_node_cancellation');}
 }
});
test('repeated operation ID returns the original result without new effects',async()=>{
 const f=fixture(),r=await f.run(),count=f.calls.length;assert.deepEqual(await f.run(),r);assert.equal(f.calls.length,count);
 const p=request();p.parameters.changed=true;await assert.rejects(f.run(p),/different parameters/);
});
test('configuration projection uses accepted receipts once and survives replay',async()=>{
 const f=fixture();let projections=0;
 f.handlers.get('imports.text').configurationReadback=({node,phases,operation_id})=>{
  projections++;assert.equal(operation_id,'apply1');assert.ok(phases.every(p=>p.status==='verified'));
  assert.ok(phases.some(p=>p.phase==='finish'));assert.ok(phases.some(p=>p.phase==='read'));
  return {node:structuredClone(node),receipt_ids:phases.map(p=>p.receipt_id)};
 };
 const result=await f.run();assert.equal(result.status,'SUCCEEDED');assert.equal(projections,1);
 assert.deepEqual(result.configuration.readback.node,result.node);
 assert.deepEqual(await f.run(),result);assert.equal(projections,1);
});
test('failed configuration projection cannot create a successful checkpoint',async()=>{
 const f=fixture();f.handlers.get('imports.text').configurationReadback=()=>{throw Error('Incomplete observed settings')};
 const result=await f.run();assert.equal(result.status,'AMBIGUOUS');
 assert.ok(!f.records.some(e=>e.phase==='node_checkpoint'));
});
test('unsupported parameters reject before journal or graph',async()=>{
 const f=fixture(),p=request();p.parameters.unsupported=true;await assert.rejects(f.run(p),/unsupported/);assert.equal(f.calls.length,0);assert.equal(f.records.length,0);
});
test('an unimplemented handler cannot create a partial node',()=>{assert.throws(()=>validateNodeApplyRequest(request(),new Map()),/No local configuration handler/)});
for(const [name,alter] of Object.entries({doneRead:p=>{p.finish='done'},budget:p=>{p.budgets.configure_ms=Infinity},sample:p=>{p.read.sample_rows=101},mode:p=>{p.mode='fixed_width'},revision:p=>{p.contract_revision='2'},duplicatePorts:p=>{p.read.ports=[0,0]},recipe:p=>{p.steps=[]}})){
 test('reject invalid contract '+name,()=>{const f=fixture(),p=request();alter(p);assert.throws(()=>validateNodeApplyRequest(p,f.handlers))});
}
for(const [phase,value,error] of [
 ['target',{node:{document_id:'other',workflow_id:'workflow',node_id:'node1'}},/foreign node/],
 ['finish',{mode:'done'},/finish mode/],['finish',{execution_id:null},/execution identity/],
 ['execute',{execution_id:'previous'},/verified terminal outcome/],['execute',{status:'running'},/verified terminal outcome/],
 ['read',{execution_id:'previous'},/bound/],['read',{ports:[{port:1,fresh:true}]},/bound/],['read',{ports:[{port:0,fresh:false}]},/bound/],
 ['configure',{verified:false},/did not verify/],['finish',{cleanup_complete:false},/did not verify/]]){
 test('reject bad '+phase+' fact '+JSON.stringify(value),async()=>{const f=fixture({badPhase:phase,badResult:value}),r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.match(r.error.message,error);assert.equal(r.pending_phase,phase);assert.ok(!f.records.some(e=>e.phase==='node_checkpoint'));assert.ok(!f.records.some(e=>e.phase==='node_phase_completed'&&e.receipt.phase===phase))});
}
test('unknown execution effect is retained and never launched twice',async()=>{
 const f=fixture({failAfter:'finish'}),r=await f.run();assert.equal(r.pending_phase,'finish');assert.equal(r.cleanup_complete,false);
 const count=f.calls.length;await assert.rejects(f.run(request(),{resume:true}),/unresolved/);assert.equal(f.calls.length,count);
});
test('pre-effect journal failure prevents any phase call',async()=>{
 const f=fixture({failJournal:'node_phase_prepared'}),r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(f.calls.length,0);
});
test('completion journal failure keeps the phase pending',async()=>{
 const f=fixture({failJournal:'node_phase_completed'}),r=await f.run();assert.equal(r.pending_phase,'source');assert.equal(r.cleanup_complete,false);assert.deepEqual(f.calls,['source']);
});
test('checkpoint failure cannot produce success',async()=>{
 const f=fixture({failJournal:'node_checkpoint'}),r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(f.operation.nodeApply.result,undefined);
});
test('cancellation before starting creates no operation',async()=>{
 const c=new AbortController();c.abort();const f=fixture({signal:c.signal});await assert.rejects(f.run());assert.equal(f.calls.length,0);assert.equal(f.operation.nodeApply,undefined);
});
test('a changed live package rejects resume even with a matching journal',async()=>{
 const f=fixture({failJournal:'node_checkpoint'});await f.run();f.drivers.verifyContinuation=async()=>false;
 const count=f.calls.length;await assert.rejects(f.run(request(),{resume:true}),/Live package/);assert.equal(f.calls.length,count);
});
test('total deadline also applies to the final read',async()=>{
 const f=fixture();const read=f.drivers.readOutput;f.drivers.readOutput=async(...args)=>{const result=await read(...args);f.setTime(11000);return result};
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.match(r.error.message,/deadline/);assert.ok(!f.records.some(e=>e.phase==='node_checkpoint'));
});

test('configuration phases share one budget instead of restarting it per call',async()=>{
 const f=fixture();const configure=f.handlers.get('imports.text').configure;
 f.handlers.get('imports.text').configure=async(...args)=>{const r=await configure(...args);f.setTime(1002);return r};
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.match(r.error.message,/deadline/);assert.ok(!f.calls.includes('finish'));
});
test('cancellation between phases cannot launch the configured node',async()=>{
 const controller=new AbortController(),f=fixture({signal:controller.signal}),configure=f.handlers.get('imports.text').configure;
 f.handlers.get('imports.text').configure=async(...args)=>{const r=await configure(...args);controller.abort();return r};
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.ok(!f.calls.includes('finish'));assert.equal(r.cleanup_complete,true);
});

test('phase acknowledgements accept the real fsync journal metadata',async()=>{
 const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const {createExecutionJournal}=await import('../lib/execution-journal.mjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dock-node-apply-'));
 try{const f=fixture();const r=await f.run(request(),{record:createExecutionJournal({directory:dir,metadata:{sessionId:'session1',clientRevision:'runtime1'}})});
 assert.equal(r.status,'SUCCEEDED');const rows=(await fs.readFile(path.join(dir,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(rows.at(-1).phase,'node_checkpoint');assert.ok(rows.every(e=>e.session_id==='session1'&&e.runtime_revision==='runtime1'));
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test('source validation preserves a bounded cause and partial effects without finish or replay',async()=>{
 const f=fixture();f.handlers.get('imports.text').configure=async()=>{
  const error=new Error('Node procedure failed');error.receipt={error:{code:'WIZARD_SOURCE_VALIDATION_FAILED',message:'Файл не найден '+'.'.repeat(400)},raw:'must not escape'};throw error;
 };
 const result=await f.run();assert.equal(result.status,'AMBIGUOUS');assert.equal(result.pending_phase,'configure');
 assert.equal(result.error.cause.code,'WIZARD_SOURCE_VALIDATION_FAILED');assert.equal(result.error.cause.message.length,240);
 assert.ok(!JSON.stringify(result).includes('must not escape'));assert.ok(!f.calls.includes('finish'));
 const count=f.calls.length;await assert.rejects(f.run(request(),{resume:true}),/unresolved/);assert.equal(f.calls.length,count);
});
test('native step diagnostics survive a previously unlisted Loginom failure code',async()=>{
 const f=fixture();
 f.handlers.get('imports.text').configure=async()=>{throw new NodeProcedureStepError({error:{
  code:'WIZARD_COLUMN_VALIDATION_FAILED',message:'Недопустимый тип поля'}});};
 const result=await f.run();
 assert.equal(result.status,'AMBIGUOUS');
 assert.match(result.error.message,/Недопустимый тип поля/);
 assert.deepEqual(result.error.cause,{code:'WIZARD_COLUMN_VALIDATION_FAILED',message:'Недопустимый тип поля'});
});

test('import source binding refusal releases only a verified discarded draft of the same node',async()=>{
 for(const invalid of [null,'owner','applied','execution','cleanup','journal']) {
  const f=fixture(invalid==='journal'?{failJournal:'node_phase_refused'}:{});
  f.handlers.get('imports.text').configure=async()=>{
   const error=new Error('Requested source field is missing or ambiguous: Missing');
   const closed={verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,
    execution_started:false,node_context:{verified:true,surface:'graph',document_id:'doc',workflow_id:'workflow',node_id:'node1'}};
   if(invalid==='owner')closed.node_context.node_id='foreign';
   if(invalid==='applied')closed.settings_applied=true;
   if(invalid==='execution')closed.execution_started=true;
   if(invalid==='cleanup')closed.cleanup_complete=false;
   error.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,
    settings_unchanged:true,verification:'text_import_binding_draft_discarded',proof:{closed}};
   throw error;
  };
  const result=await f.run();
  assert.equal(result.status,invalid?'AMBIGUOUS':'FAILED');
  assert.equal(result.cleanup_complete,!invalid);
  assert.equal(result.pending_phase,invalid?'configure':null);
  assert.ok(!f.calls.includes('finish')&&!f.calls.includes('execute'));
  if(!invalid) {
   assert.equal(result.next_step.tool,'dock_node_apply');
   assert.match(result.next_step.instruction,/NEW operation_id/);
   assert.ok(result.next_step.instruction.includes(JSON.stringify({kind:'existing',type:'imports.text',ref:result.node})));
  }
 }
});

test('import readiness timeout releases only a verified discarded draft and asks to repeat the same settings',async()=>{
 for(const invalid of [null,'owner','applied','cleanup','verification']) {
  const f=fixture();
  f.handlers.get('imports.text').configure=async()=>{
   const error=new Error('Node procedure readiness timeout: text_import_format: column editor: 3/data_kind; no mutation was authorized');
   const closed={verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,
    execution_started:false,node_context:{verified:true,surface:'graph',document_id:'doc',workflow_id:'workflow',node_id:'node1'}};
   if(invalid==='owner')closed.node_context.node_id='foreign';
   if(invalid==='applied')closed.settings_applied=true;
   if(invalid==='cleanup')closed.cleanup_complete=false;
   error.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,
    verification:invalid==='verification'?'text_import_timeout':'text_import_readiness_draft_discarded',proof:{closed}};
   throw error;
  };
  const result=await f.run();
  assert.equal(result.status,invalid?'AMBIGUOUS':'FAILED');
  assert.equal(result.cleanup_complete,!invalid);assert.equal(result.pending_phase,invalid?'configure':null);
  assert.match(result.error.message,/readiness timeout: text_import_format: column editor/);
  if(!invalid) {
   assert.equal(result.next_step.tool,'dock_node_apply');
   assert.match(result.next_step.instruction,/SAME settings/);assert.doesNotMatch(result.next_step.instruction,/observed source names/);
   assert.ok(result.next_step.instruction.includes(JSON.stringify({kind:'existing',type:'imports.text',ref:result.node})));
  }
 }
});

test('self source references name the current port source and cannot mix opaque IDs',()=>{
 const f=fixture(),p=request();p.mappings=[{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'Сумма'}}]}];
 assert.doesNotThrow(()=>validateNodeApplyRequest(p,f.handlers));
 p.mappings[0].direction='input';assert.doesNotThrow(()=>validateNodeApplyRequest(p,f.handlers));
 p.mappings[0].direction='output';p.mappings[0].fields[0].source.schema_id='foreign';assert.throws(()=>validateNodeApplyRequest(p,f.handlers));
});

function separateFixture(){
 const f=fixture();f.handlers.get('imports.text').output_wizard='separate';
 f.drivers.finish=async mode=>{f.calls.push('node-'+mode);return {verified:true,cleanup_complete:true,effect_possible:true,mode,settings_applied:mode==='done',draft_discarded:mode==='close',execution_started:false};};
 f.drivers.finishGraph=async mode=>{f.calls.push('graph-'+mode);return {verified:true,cleanup_complete:true,effect_possible:mode==='execute',mode,settings_applied:true,execution_started:mode==='execute',execution_id:mode==='execute'?'execution1':null};};
 return f;
}
for(const mode of ['done','execute','close'])test('separate output wizard preserves complete '+mode+' lifecycle',async()=>{
 const f=separateFixture(),p=request();p.finish=mode;if(mode!=='execute')p.read.ports=[];
 const r=await f.run(p);assert.equal(r.status,'SUCCEEDED');
 assert.deepEqual(f.calls,mode==='close'?['source','target','mapping','open','configure','node-close']:
 ['source','target','mapping','open','configure','node-done','mapping','graph-'+mode,...(mode==='execute'?['execute','read']:[])]);
 assert.equal(r.execution.status,mode==='execute'?'completed':'not_requested');
 const intermediate=f.operation.nodeApply.phases.find(p=>p.phase==='node_finish');
 assert.equal(!!intermediate,mode!=='close');if(intermediate)assert.equal(intermediate.value.execution_started,false);
});
for(const change of [v=>v.execution_started=true,v=>v.execution_id='unexpected',v=>v.settings_applied=false,v=>v.mode='execute'])test('separate wizard rejects an incorrect intermediate Done before port changes',async()=>{
 const f=separateFixture(),finish=f.drivers.finish;f.drivers.finish=async mode=>{const v=await finish(mode);change(v);return v;};
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(r.pending_phase,'node_finish');
 assert.equal(f.calls.filter(c=>c==='mapping').length,1);assert.ok(!f.calls.includes('graph-execute'));
});
test('failed separate port mapping cannot launch the graph or repeat intermediate Done',async()=>{
 const f=separateFixture();let count=0;f.drivers.mapPorts=async()=>{f.calls.push('mapping');if(++count===2)throw Error('lost port response');return {verified:true,cleanup_complete:true};};
 const r=await f.run();assert.equal(r.pending_phase,'output_mapping');assert.ok(!f.calls.includes('graph-execute'));
 await assert.rejects(f.run(request(),{resume:true}),/unresolved original/);assert.equal(f.calls.filter(c=>c==='node-done').length,1);
});
test('separate output wizard without graph finish is rejected before any phase',async()=>{
 const f=separateFixture();delete f.drivers.finishGraph;await assert.rejects(f.run(),/graph finish driver/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.records,[]);
});

for(const verification of ['reform_mapped_preflight_completed','missing_values_preflight_completed'])test('completed read-only validation '+verification+' rejects with clean settings and requires explicit resume',async()=>{
 const f=fixture();f.drivers.prepareTarget=async()=>{
  f.calls.push('target');const e=Error('Reform output name collision');
  e.nodePhaseRefusal={phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,
   settings_unchanged:true,verification};throw e;
 };
 const r=await f.run();assert.equal(r.status,'FAILED');assert.equal(r.cleanup_complete,true);assert.equal(r.pending_phase,null);
 assert.equal(r.effect_possible,true);assert.deepEqual(f.calls,['source','target']);
 const count=f.calls.length;await assert.rejects(f.run(),/Explicit inspected resume/);assert.equal(f.calls.length,count);
 assert.equal(f.records.filter(e=>e.phase==='node_phase_refused').length,1);
});
for(const verification of ['reform_mapped_preflight_completed','missing_values_preflight_completed'])test('incomplete or unacknowledged refusal '+verification+' retains uncertainty',async()=>{
 for(const fail of ['cleanup_complete','settings_unchanged','verification','journal']){
  const f=fixture({failJournal:fail==='journal'?'node_phase_refused':undefined});f.drivers.prepareTarget=async()=>{
   const e=Error('Invalid patch');e.nodePhaseRefusal={phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,
    settings_unchanged:true,verification};
   if(fail!=='journal')delete e.nodePhaseRefusal[fail];throw e;
  };
  const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(r.pending_phase,'target');assert.equal(r.cleanup_complete,false);
 }
});

test('replacement collision is a clean refusal only after an owned verified cancellation',async()=>{
 for(const failure of [null,'journal','owner','discarded','verification']){
  const f=fixture({failJournal:failure==='journal'?'node_phase_refused':undefined}),p=request();
  p.target={kind:'existing',type:'transform.replace_columns',ref:{document_id:'doc',workflow_id:'workflow',node_id:'node1'}};p.mode='exact';
  f.handlers.set(p.target.type,{revision:'1',modes:['exact'],validate:()=>{},configure:async()=>{
   const e=Error('Replacement output collision: A_Replace');
   e.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'replacement_effective_preflight_completed',proof:{closed:{verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,node_context:{verified:true,...p.target.ref}}}};
   if(failure==='owner')e.nodePhaseRefusal.proof.closed.node_context.node_id='foreign';
   if(failure==='discarded')e.nodePhaseRefusal.proof.closed.draft_discarded=false;
   if(failure==='verification')delete e.nodePhaseRefusal.verification;
   throw e;
  }});
  const r=await f.run(p);assert.equal(r.status,failure?'AMBIGUOUS':'FAILED');assert.equal(r.cleanup_complete,!failure);assert.equal(r.pending_phase,failure?'configure':null);
  assert.ok(!f.calls.includes('execute'));assert.ok(!f.calls.includes('read'));
 }
});

test('calculator request refusal requires unchanged readback, both owned closes and durable acknowledgement',async()=>{
 for(const failure of [null,'journal','owner','changed','close','inputs','mappings']){
  const f=fixture({failJournal:failure==='journal'?'node_phase_refused':undefined}),p=request();
  p.target={kind:'existing',type:'transform.calculator',ref:{document_id:'doc',workflow_id:'workflow',node_id:'node1'}};p.mode='expression';
  if(failure==='inputs')p.inputs=[{source:{document_id:'doc',workflow_id:'workflow',node_id:'upstream'},output:0,input:0}];
  if(failure==='mappings')p.mappings=[{direction:'output',port:0,autosync:true}];
  f.handlers.set(p.target.type,{revision:'1',modes:['expression'],validate:()=>{},configure:async()=>{
   const e=Error('collision'),closed={verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,node_context:{verified:true,...p.target.ref}};
   e.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'calculator_request_rejected_before_edit',proof:{node:p.target.ref,before:{formula:'1'},after:{formula:'1'},first_close:structuredClone(closed),closed,settings_readback_verified:true}};
   if(failure==='owner')closed.node_context.node_id='foreign';
   if(failure==='changed')e.nodePhaseRefusal.proof.after.formula='2';
   if(failure==='close')closed.settings_applied=true;
   throw e;
  }});
  const r=await f.run(p);assert.equal(r.status,failure?'AMBIGUOUS':'FAILED');assert.equal(r.cleanup_complete,!failure);
  assert.equal(r.next_step?.tool,failure?undefined:'dock_node_apply');assert.ok(!f.calls.includes('execute'));
 }
});

test('invalid Duplicates input ends conclusively only with durable unchanged-draft cleanup proof',async()=>{
 for(const failure of ['none','cleanup_complete','settings_unchanged','verification','phase','journal','foreign_type']){
  const f=fixture({failJournal:failure==='journal'?'node_phase_refused':undefined}),p=request();
  p.target={kind:'existing',type:failure==='foreign_type'?'imports.text':'research.duplicates',ref:{document_id:'doc',workflow_id:'workflow',node_id:'node1'}};
  p.mode='mark';f.handlers.set(p.target.type,{...f.handlers.get('imports.text'),modes:['mark']});
  f.drivers.mapPorts=async()=>{const e=Error('Unknown field');e.nodePhaseRefusal={phase:'input_mapping',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'duplicates_input_validation_refused'};if(!['none','journal','foreign_type'].includes(failure))delete e.nodePhaseRefusal[failure];throw e;};
  const r=await f.run(p);assert.equal(r.status,failure==='none'?'FAILED':'AMBIGUOUS',failure);
  assert.equal(r.cleanup_complete,failure==='none',failure);assert.equal(r.pending_phase,failure==='none'?null:'input_mapping',failure);
  assert.ok(!f.calls.includes('configure')&&!f.calls.includes('execute'));
 }
});

test('calculator syntax refusal retains the node and names its restored default expression for new and existing targets',async()=>{
 for(const kind of ['new','existing'])for(const failure of [null,'journal','graph','receipt','identity']){
  const f=fixture({failJournal:failure==='journal'?'node_phase_refused':undefined}),p=request();p.target.type='transform.calculator';p.mode='expression';
  if(kind==='existing')p.target={kind,type:'transform.calculator',ref:{document_id:'doc',workflow_id:'workflow',node_id:'node1'}};
  p.inputs=[{source:{document_id:'doc',workflow_id:'workflow',node_id:'source'},output:0,input:0}];
  f.handlers.set(p.target.type,{revision:'1',modes:['expression'],validate:()=>{},configure:async()=>{
   const node={document_id:'doc',workflow_id:'workflow',node_id:'node1'},context={verified:true,...node};
   const closed={verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,node_context:context};
   const validation={status:'observed',root_ref:'wizard',source:'loginom_wizard_error_tooltip',message:'Unknown MID'};
   const receipt={action_key:'ui.act',operation_id:'apply1:n10',status:'AMBIGUOUS',effect_possible:true,cleanup_complete:true,
    error:{code:'WIZARD_CALCULATOR_VALIDATION_FAILED',message:validation.message},output:{prepared_node_context:context,wizard:{stage:'calculator',root_ref:'wizard',calculator_validation:validation}},
    trace:[{event:'wizard_calculator_validation_failed',root_ref:'wizard',message:validation.message}]};
   const before={expressions:[{name:'Expr1',formula:''}]},graph={nodes:['source','node1'],links:['source:node1']};
   const proof={node,before,after:structuredClone(before),first_close:closed,closed,settings_readback_verified:true,
    syntax_failure_verified:true,graph_before:graph,graph_after:structuredClone(graph),validation_receipt:receipt,validation_baseline:{prepared_node_context:context,wizard:{root_ref:'wizard'}}};
   if(failure==='graph')proof.graph_after.links=[];
   if(failure==='receipt')receipt.cleanup_complete=false;
   if(failure==='identity')proof.validation_baseline.prepared_node_context={verified:true,...node,node_id:'foreign'};
   const e=Error('syntax refused');e.receipt=receipt;e.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'calculator_syntax_rejected_draft_restored',proof};throw e;
  }});
  const r=await f.run(p);assert.equal(r.status,failure?'AMBIGUOUS':'FAILED');assert.equal(r.cleanup_complete,!failure);
  assert.equal(r.node.node_id,'node1');assert.ok(!f.calls.includes('execute'));
  if(!failure){assert.match(r.next_step.instruction,/Expr1/);assert.match(r.next_step.instruction,/SAME existing target/);assert.equal(r.pending_phase,null);}
 }
});

test('date configure resumes the original pending phase only after its verifier',async()=>{
 const f=fixture(),p=request();p.target.type='transform.date_time';p.mode='calendar';p.finish='done';p.read.ports=[];
 const original=f.handlers.get('imports.text');let calls=0,verified=0;
 f.handlers.set('transform.date_time',{...original,modes:['calendar'],configure:async()=>{calls++;if(calls===1)throw Error('lost flag');assert.equal(verified,1);return {verified:true,cleanup_complete:true,effect_possible:true};}});
 const first=await f.run(p);assert.equal(first.pending_phase,'configure');const boundary=structuredClone(f.operation.nodeApply.pending);
 f.drivers.verifyPendingConfigure=async state=>{verified++;assert.deepEqual(state.pending,boundary);return true;};
 const result=await f.run(p,{resume:true});assert.equal(result.status,'SUCCEEDED');assert.equal(result.operation_id,p.operation_id);
 assert.equal(f.records.filter(e=>e.phase==='node_phase_prepared'&&e.receipt.phase==='configure').length,1);
 assert.equal(f.records.filter(e=>e.phase==='node_phase_completed'&&e.receipt.phase==='configure').length,1);
});
test('refused date configure proof preserves the original pending boundary',async()=>{
 const f=fixture({failAfter:'configure'}),p=request();p.target.type='transform.date_time';p.mode='calendar';
 f.handlers.set('transform.date_time',{...f.handlers.get('imports.text'),modes:['calendar']});
 await f.run(p);const boundary=structuredClone(f.operation.nodeApply.pending),count=f.calls.length;
 f.drivers.verifyPendingConfigure=async()=>false;
 await assert.rejects(f.run(p,{resume:true}),/Live package/);assert.deepEqual(f.operation.nodeApply.pending,boundary);assert.equal(f.calls.length,count);
});

test('verified failed execution settles once without output and refuses unproven failure receipts',async()=>{
 const proof={verified:true,cleanup_complete:true,status:'failed',execution_id:'doc:root:1',node:{document_id:'doc',workflow_id:'workflow',node_id:'node1'},
  root_id:'root',group_id:'1',group_record_id:'record',failure_verified:true,output_refreshed:false,error:{code:'NODE_EXECUTION_FAILED',message:'Input file not found'}};
 for(const mutate of [null,p=>p.failure_verified=false,p=>p.cleanup_complete=false,p=>p.node.node_id='foreign',p=>p.root_id='other',p=>p.error.message='',p=>p.output_refreshed=true]){
  const f=fixture(),p=structuredClone(proof);mutate?.(p);
  f.drivers.finish=async()=>({mode:'execute',verified:true,cleanup_complete:true,execution_id:'doc:root:1',execution_started:true});
  f.drivers.waitExecution=async()=>p;
  const result=await f.run();assert.equal(result.status,mutate?'AMBIGUOUS':'FAILED');assert.ok(!f.calls.includes('read'));
  if(!mutate){assert.equal(result.execution.status,'failed');assert.equal(result.cleanup_complete,true);assert.equal(result.error.message,proof.error.message);
   assert.equal(result.next_step.tool,'dock_node_apply');assert.match(result.next_step.instruction,/NEW operation_id/);
   assert.ok(result.next_step.instruction.includes(JSON.stringify({kind:'existing',type:'imports.text',ref:result.node})));
   const calls=f.calls.length;assert.deepEqual(await f.run(),result);assert.equal(f.calls.length,calls);}
 }
 for(const failure of ['phase','checkpoint']) {
  const f=fixture();f.drivers.finish=async()=>({mode:'execute',verified:true,cleanup_complete:true,execution_id:'doc:root:1'});f.drivers.waitExecution=async()=>proof;
  const result=await f.run(request(),{record:async e=>{if(failure==='phase'&&e.phase==='node_phase_completed'&&e.receipt.phase==='execute'||failure==='checkpoint'&&e.phase==='node_checkpoint')throw Error('disk unavailable');return structuredClone(e);}});
  assert.equal(result.status,'AMBIGUOUS');assert.equal(f.operation.nodeApply.result,undefined);
 }
});

test('unsupported retained export settings require acknowledged cleanup proof before refusal',async()=>{
 for(const fail of [null,'cleanup_complete','settings_unchanged','verification','journal']){
  const f=fixture({failJournal:fail==='journal'?'node_phase_refused':undefined}),p=request();p.target={kind:'existing',type:'exports.text',ref:{document_id:'doc',workflow_id:'workflow',node_id:'node1'}};p.read={ports:[],sample_rows:0,require_exact_numbers:false};
  f.handlers.set('exports.text',{...f.handlers.get('imports.text'),configure:async()=>{const e=Error('Unsupported retained export decimal_separator');e.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'text_export_unsupported_retained'};if(fail&&fail!=='journal')delete e.nodePhaseRefusal[fail];throw e;}});
  const r=await f.run(p);assert.equal(r.status,fail?'AMBIGUOUS':'FAILED');assert.equal(r.cleanup_complete,!fail);assert.equal(r.pending_phase,fail?'configure':null);assert.ok(!f.calls.includes('finish')&&!f.calls.includes('execute')&&!f.calls.includes('read'));
 }
});

for(const finish of ['done','close'])test('incompatible '+finish+' read identifies the rejected field before effects',()=>{
 const p=request();p.finish=finish;
 assert.throws(()=>validateNodeApplyRequest(p,fixture().handlers),/Invalid parameters\.read\.ports:.*finish=execute/);
 p.read.ports=[];assert.doesNotThrow(()=>validateNodeApplyRequest(p,fixture().handlers));
});
test('unsupported full coverage identifies its field before graph changes',()=>{
 const p=request();p.read.coverage='full';
 assert.throws(()=>validateNodeApplyRequest(p,fixture().handlers),/Invalid parameters\.read\.coverage:.*other handlers support sample/);
 p.read.coverage='sample';assert.doesNotThrow(()=>validateNodeApplyRequest(p,fixture().handlers));
});

test('output sample accepts the expanded 100-row boundary',()=>{const f=fixture(),p=request();p.read.sample_rows=100;assert.doesNotThrow(()=>validateNodeApplyRequest(p,f.handlers));});

for(const exceedsTotal of [false,true])test('read uses remaining total budget, preserving its hard bound '+exceedsTotal,async()=>{
 const f=fixture(),p=request();p.budgets={configure_ms:1000,execute_ms:1000,total_ms:10000};
 const original=f.drivers.readOutput;
 f.drivers.readOutput=async(read,ctx)=>{assert.equal(ctx.deadline,10001);f.setTime(exceedsTotal?10002:2500);return original(read,ctx);};
 const result=await f.run(p);
 assert.equal(result.status,exceedsTotal?'AMBIGUOUS':'SUCCEEDED');
 assert.equal(f.calls.filter(c=>c==='execute').length,1);
 if(exceedsTotal)assert.match(result.error.message,/deadline elapsed/);
});
