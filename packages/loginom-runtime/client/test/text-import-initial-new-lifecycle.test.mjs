import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {applyNode} from '../lib/node-apply.mjs';
import {prepareNodeTarget} from '../lib/node-target.mjs';
import {createTextImportNodeSupport} from '../lib/text-import-node.mjs';
import {ImportInitialSettingsError} from '../lib/text-import-procedure.mjs';
import {makeNodeProcessContextCode} from '../lib/node-process-context.mjs';

// Explicitly synthetic native transport: actual apply/target/procedure/close
// functions consume these observations and receipts. No browser is launched.
const workflow={workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]};
const node={document_id:'doc',workflow_id:'workflow',node_id:'owned-import'};
const tid='MF;TF-1;Graph;Import',root='ImportWizard';
const owner={status:'observed',node:{tid,label:'Import'},path:[{tid:'Scenario',label:'Scenario'},{tid:'Import',label:'Import'}]};
const binding={document_id:'doc',workflow_ref:workflow,node};
const source={artifact_id:'initial-input',upload_operation_id:'initial-upload',bytes:200,
  sha256:'903cf4ea60b3732510fc7a9540358f23537c7e8dbaf07708d91df3e80178bd19'};
const request=()=>({operation_id:'initial-new',contract_revision:'1.0.0',document_id:'doc',workflow_ref:structuredClone(workflow),
  target:{kind:'new',type:'imports.text',label:'Import',position:{x:320,y:280}},inputs:[],mode:'delimited',
  parameters:{source:structuredClone(source),settings:{
    source:{source_path:'/test/comma_utf8.txt',encoding:'65001',rows_to_skip:0,first_line_as_title:true},
    format:{delimiter:',',text_qualifier:'"',decimal_separator:'.',null_marker:'?',multiple_delimiters:false,date_format:'yyyy/mm/dd',date_separator:'-'}}},
  mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
const upload=()=>({operation_id:source.upload_operation_id,artifact:structuredClone(source),outcome:{
  operation_id:source.upload_operation_id,action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,
  output:{...source,destination:'/test/comma_utf8.txt',server_copy_verification:{verification_id:'verified-initial-input',
    status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,destination:'/test/comma_utf8.txt',bytes:source.bytes,sha256:source.sha256}}}});

function fixture({fault,mutateRequest=()=>{},mutateUpload=()=>{},mutateHistory=()=>{}}={}) {
  const r=request();mutateRequest(r);
  const uploaded=upload();mutateUpload(uploaded);
  const history={complete:true,records:[{...structuredClone(uploaded),sequence:0,destination:'/test/comma_utf8.txt',cleanup_confirmed:true,transport_uncertain:false}]};
  mutateHistory(history);
  const events=[],gestures=[],reads=[],graph={complete:true,dom_epoch:'graph-1',document_id:'doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
  let time=1,opened=false,closed=false,consoleOpen=false,menuOpen=false,prepared,changed=false;
  const operation={id:r.operation_id,action:{action_key:'node.apply',revision:'1.0.0'},deadline:30001,
    checkpoint:{document_id:'doc',workflow_ref:workflow}};
  const support=createTextImportNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'});
  const element=(ref,elementTid,allowed_actions,extra={})=>({ref,tid:elementTid,allowed_actions,...extra});
  const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:structuredClone(workflow),
    dom_epoch:{document:'doc',revision:1},scan:{complete:true},
    prepared_node_context:{...node,verified:true,surface:opened?'wizard':'graph',tid,locked:false},
    wizard:opened?{status:'observed',stage:'text_import_file',root_tid:root,root_ref:'ui-root',owner_context:structuredClone(owner),
      import_source:{fields:Object.fromEntries(Object.entries({source_path:'',connection:'Local',encoding:'UTF-8',rows_to_skip:'0',first_line_as_title:false})
        .map(([k,value])=>[k,{status:'observed',truncated:false,value}]))}}:{status:'absent'},
    ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:opened?
      [element('ui-close',root+';btnClose',['click'])]:[
        element('ui-graph','MF;TF-1;ModelForm;cmpDiagram',[]),element('ui-body',tid,['click'],{graph_node:{part:'body'}}),
        element('ui-settings',tid+';Setting',['open_wizard']),element('ui-progress','MF;cntMain;tlbMainToolbar;btnProgress',['click']),
        ...(consoleOpen?[element('ui-console-grid','ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click'],{signature:{console:'owned'}}),
          element('ui-console-close','ConsoleForm;btnClose',['click'])]:[]),
        ...(menuOpen?[element('ui-filter','mnContextMenu;mniShowCompletedProcesses',['click','press'])]:[])]}});
  const record=async e=>{
    events.push(structuredClone(e));
    if(e.phase==='node_step_prepared')prepared=structuredClone(e);
    if(fault==='durable'&&e.phase==='node_step_prepared'&&e.action.ref==='ui-close')throw Error('fixture durable write failed');
    if(fault==='intent'&&e.phase==='node_step_prepared'&&e.action.ref==='ui-close')return {...e,signature:'foreign-intent'};
    if(fault==='expiry'&&e.phase==='node_step_prepared'&&e.action.ref==='ui-close')time=30002;
    if(fault==='refusal-journal'&&e.phase==='node_phase_refused')throw Error('fixture refusal journal failed');
    return structuredClone(e);
  };
  const execute=async code=>{
    if(prepared) {
      const p=prepared;prepared=null;
      const action=p.action;gestures.push(structuredClone(action));
      if(action.ref==='ui-close') {
        if(fault==='transport')throw Error('fixture lost close response');
        if(['unknown-effect','close-failure','close-unclean','foreign-receipt'].includes(fault))return {
          operation_id:fault==='foreign-receipt'?'foreign':p.internal_operation_id,action_key:'ui.act',
          status:'NOT_APPLIED',effect_possible:fault==='unknown-effect',cleanup_complete:fault!=='close-unclean',error:{code:'FIXTURE_CLOSE_REFUSED'}};
        opened=false;closed=true;
        if(fault==='unconfirmed-close')throw Error('fixture close applied but reply lost');
      } else if(action.ref==='ui-settings'&&action.verb==='open_wizard')opened=true;
      else if(action.ref==='ui-progress')consoleOpen=true;
      else if(action.ref==='ui-console-grid')menuOpen=true;
      else if(action.ref==='ui-filter'&&action.verb==='press'&&action.key==='Escape')menuOpen=false;
      else if(action.ref==='ui-console-close')consoleOpen=false;
      else assert.deepEqual(action,{verb:'click',ref:'ui-body'},'No settings, Apply, mapping, Done or Execute is authorized by this fixture');
      return {status:'SUCCEEDED',operation_id:p.internal_operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,output:state()};
    }
    if(code===makeNodeProcessContextCode(binding))return {verified:true,show_completed:true,inventory_complete:true,root_id:'process-root',
      processes:[],node_context:state().prepared_node_context};
    const s=state();
    if(fault==='close-owner'&&closed)s.prepared_node_context.node_id='foreign';
    // Change ownership after openWizard has captured the original owner, on
    // the first configure observation, not during initial opening.
    if(opened&&events.some(e=>e.phase==='node_phase_prepared'&&e.receipt.phase==='configure')) {
      if(fault==='owner')s.wizard.owner_context.node.tid='Foreign';
      if(fault==='graph')s.prepared_node_context.node_id='foreign';
      if(fault==='document')s.dom_epoch.document='foreign';
      if(fault==='workflow')s.workflow_ref.workflow_id='foreign';
      if(fault==='transport-before-refusal'){operation.transportUncertain=true;throw Error('fixture configure transport lost');}
      if(fault==='wizard-owner-at-close'&&events.some(e=>e.phase==='node_observation_completed'&&e.readiness.condition==='text_import_file: new import source initialized'))s.wizard.owner_context.node.tid='Foreign';
      changed=true;
    }
    reads.push(structuredClone(s));
    return {status:'SUCCEEDED',output:s};
  };
  const drivers=support.nodeApplyDriverFactory({operation,execute,onRecord:record,now:()=>time,
    receiptOptions:(id,key,signature)=>({id,action_key:key,signature}),verifiedUploads:()=>[uploaded],uploadHistory:()=>history});
  const configure=drivers.configureTextImport;
  drivers.configureTextImport=async(...args)=>{try{return await configure(...args);}catch(e){
    if(e instanceof ImportInitialSettingsError)operation.testTypedRefusal=true;
    throw e;
  }};
  drivers.prepareTarget=async(graphRequest,ctx)=>{
    const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
      mutate:async effect=>{
        assert.equal(effect.kind,'create');
        graph.nodes.push({ref:structuredClone(node),type:effect.parameters.type,label:'Import',position:effect.parameters.position,inputs:[],outputs:[0]});
        return {status:'SUCCEEDED',cleanup_complete:true};
      }};
    const result=await prepareNodeTarget({request:graphRequest,operation,adapter,record,now:()=>time});
    assert.equal(result.status,'SUCCEEDED');
    return {verified:true,cleanup_complete:true,effect_possible:true,node:result.node.ref,target:result};
  };
  const run=(changedRequest=r,options={})=>applyNode({request:changedRequest,operation,handlers:support.nodeApplyHandlers,drivers,record,now:()=>time,...options});
  return {r,operation,events,gestures,reads,graph,run,get closed(){return closed;},get changed(){return changed;}};
}

for(const finish of ['done','execute','close'])test('initial omitted columns: owned create/refuse/close before settings, '+finish,async()=>{
  const f=fixture({mutateRequest:r=>{r.finish=finish;if(finish==='execute')r.read.ports=[0];}}),before=structuredClone(f.r);
  const result=await f.run();
  assert.equal(result.status,'FAILED',JSON.stringify(result));
  assert.equal(f.operation.testTypedRefusal,true);
  assert.equal(result.effect_possible,true,'Temporary target creation is an effect');
  assert.equal(result.cleanup_complete,true);assert.equal(result.pending_phase,null);
  assert.deepEqual(result.node,node);assert.equal(result.execution.status,'not_requested');
  assert.equal(result.execution.execution_id,null);assert.equal(f.closed,true);
  assert.equal(f.graph.nodes.length,1);assert.deepEqual(f.r,before);
  assert.equal(Object.hasOwn(f.operation.nodeApply.request.parameters.settings,'columns'),false);
  const refusal=f.events.filter(e=>e.phase==='node_phase_refused');assert.equal(refusal.length,1);
  assert.equal(refusal[0].operation_id,f.r.operation_id);assert.equal(refusal[0].receipt.phase,'configure');
  assert.equal(refusal[0].receipt.verification,'text_import_initial_settings_draft_discarded');
  assert.equal(refusal[0].receipt.settings_unchanged,true);
  const closed=refusal[0].receipt.proof.closed;
  assert.equal(closed.verified,true);assert.equal(closed.cleanup_complete,true);assert.equal(closed.draft_discarded,true);
  assert.equal(closed.settings_applied,false);assert.equal(closed.execution_started,false);
  assert.deepEqual(Object.fromEntries(Object.keys(node).map(k=>[k,closed.node_context[k]])),node);
  assert.equal(f.events.filter(e=>e.phase==='node_target_effect_prepared'&&e.effect.kind==='create').length,1);
  assert.equal(f.gestures.filter(a=>a.verb==='open_wizard').length,1);
  assert.equal(f.gestures.filter(a=>a.ref==='ui-close').length,1);
  assert.ok(!f.events.some(e=>e.phase==='node_phase_prepared'&&['output_mapping','finish','execute','read'].includes(e.receipt.phase)));
  const count=f.gestures.length;await assert.rejects(f.run(),/Explicit inspected resume/);assert.equal(f.gestures.length,count,'No replay');
  await assert.rejects(f.run({...f.r,parameters:{...f.r.parameters,source:{...source,bytes:201}}}),/different parameters/);
  if(process.env.INITIAL_LIFECYCLE_EVIDENCE_DIR) {
    await mkdir(process.env.INITIAL_LIFECYCLE_EVIDENCE_DIR,{recursive:true});
    await writeFile(process.env.INITIAL_LIFECYCLE_EVIDENCE_DIR+'/'+finish+'.json',JSON.stringify({fixture_only:true,request:f.r,result,events:f.events,gestures:f.gestures,reads:f.reads},null,2)+'\n');
  }
});

for(const finish of ['done','execute','close'])for(const columns of [null,[]])test('initial explicit '+JSON.stringify(columns)+' rejected before transport, '+finish,async()=>{
  const f=fixture({mutateRequest:r=>{r.finish=finish;r.parameters.settings.columns=columns;}});
  await assert.rejects(f.run());assert.equal(f.events.length,0);assert.equal(f.reads.length,0);assert.equal(f.graph.nodes.length,0);
});

for(const fault of ['owner','graph','document','workflow','intent','durable','transport-before-refusal','transport','unknown-effect','close-failure','close-unclean','foreign-receipt','unconfirmed-close','expiry','refusal-journal','close-owner','wizard-owner-at-close'])test('initial cannot claim known cleanup after '+fault,async()=>{
  const f=fixture({fault}),result=await f.run();
  assert.equal(result.status,'AMBIGUOUS',JSON.stringify(result));assert.equal(result.cleanup_complete,false);
  assert.equal(result.pending_phase,'configure','Fault must reach the intended configure/close boundary');
  assert.equal(result.effect_possible,true);assert.equal(result.execution.status,'not_requested');
  assert.ok(!f.events.some(e=>e.phase==='node_phase_completed'&&['configure','finish','execute'].includes(e.receipt.phase)));
  const count=f.gestures.length;
  await assert.rejects(f.run(undefined,{resume:true}),/unresolved/);assert.equal(f.gestures.length,count);
  assert.ok(f.gestures.filter(a=>a.ref==='ui-close').length<=1);
  if(['owner','graph','document','workflow','intent','durable','expiry','transport-before-refusal','wizard-owner-at-close'].includes(fault))assert.equal(f.gestures.filter(a=>a.ref==='ui-close').length,0);
  assert.equal(f.operation.nodeApply.deadline,30001,'Original total deadline retained');
  if(process.env.INITIAL_LIFECYCLE_EVIDENCE_DIR)await writeFile(process.env.INITIAL_LIFECYCLE_EVIDENCE_DIR+'/'+fault+'.json',
    JSON.stringify({fixture_only:true,fault,request:f.r,result,events:f.events,gestures:f.gestures,reads:f.reads},null,2)+'\n');
});

for(const [name,mutateRequest] of Object.entries({
  missing_source:r=>delete r.parameters.settings.source,partial_source:r=>delete r.parameters.settings.source.encoding,
  missing_format:r=>delete r.parameters.settings.format,partial_format:r=>delete r.parameters.settings.format.delimiter,
  unknown_settings:r=>r.parameters.settings.extra=true,unknown_source:r=>r.parameters.settings.source.extra=true,
  unknown_format:r=>r.parameters.settings.format.extra=true,path:r=>r.parameters.settings.source.source_path='/test/../other.txt',
  encoding:r=>r.parameters.settings.source.encoding='not-a-code-page',row:r=>r.parameters.settings.source.rows_to_skip=-1,
  header:r=>r.parameters.settings.source.first_line_as_title='true',delimiter:r=>r.parameters.settings.format.delimiter='',
  qualifier:r=>r.parameters.settings.format.text_qualifier='too-long',decimal:r=>r.parameters.settings.format.decimal_separator='auto',
  null_marker:r=>r.parameters.settings.format.null_marker='\n',multiple:r=>r.parameters.settings.format.multiple_delimiters=1,
  date_format:r=>r.parameters.settings.format.date_format='guess',date_separator:r=>r.parameters.settings.format.date_separator='?',
  artifact:r=>r.parameters.source.artifact_id='',upload_id:r=>r.parameters.source.upload_operation_id='',
  bytes:r=>r.parameters.source.bytes=-1,digest:r=>r.parameters.source.sha256='invalid',unknown_identity:r=>r.parameters.source.extra=true,
  columns_undefined:r=>r.parameters.settings.columns=undefined,finish:r=>r.finish='apply',port:r=>r.read.ports=[1],
  input:r=>r.inputs=[{}],mapping:r=>r.mappings=[{direction:'input',port:0}],mode:r=>r.mode='auto',
}))test('initial malformed '+name+' remains pre-target refusal',async()=>{
  const f=fixture({mutateRequest});await assert.rejects(f.run());assert.equal(f.events.length,0);assert.equal(f.reads.length,0);assert.equal(f.graph.nodes.length,0);
});

for(const [name,mutateUpload] of Object.entries({
  artifact:u=>u.artifact.artifact_id='foreign',upload:u=>u.outcome.operation_id='foreign',
  path:u=>u.outcome.output.server_copy_verification.destination='/foreign.txt',
  digest:u=>u.outcome.output.server_copy_verification.sha256='b'.repeat(64),
  cleanup:u=>u.outcome.cleanup_complete=false,unknown:u=>u.outcome.status='AMBIGUOUS',
  verification:u=>delete u.outcome.output.server_copy_verification,
}))test('initial upload '+name+' refuses without target/browser',async()=>{
  const f=fixture({mutateUpload}),result=await f.run();
  assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);
  assert.equal(f.reads.length,0);assert.equal(f.graph.nodes.length,0);
});

for(const [name,mutateHistory] of Object.entries({
  incomplete:h=>h.complete=false,missing:h=>h.records=[],duplicate:h=>h.records.push(structuredClone(h.records[0])),
  superseded:h=>h.records.push({...structuredClone(h.records[0]),sequence:1,operation_id:'later',transport_uncertain:true}),
}))test('initial lineage '+name+' refuses without target/browser',async()=>{
  const f=fixture({mutateHistory}),result=await f.run();assert.equal(result.status,'NOT_APPLIED');
  assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);assert.equal(f.reads.length,0);assert.equal(f.graph.nodes.length,0);
});
