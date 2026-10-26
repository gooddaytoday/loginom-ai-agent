import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextImportNodeSupport,validateTextImportNodeParameters,verifyTextImportSource} from '../lib/text-import-node.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {applyNode,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {dispatchNodeApi,nodeApiTools,textImportParametersSchema} from '../lib/node-api.mjs';
const params=()=>({settings:{source:{source_path:'/test/data.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'},columns:[{name:'A',label:'A',type:'integer',data_kind:'Дискретный',used:true}]},source:{artifact_id:'artifact',upload_operation_id:'upload',bytes:15,sha256:'a'.repeat(64)}});
const request=()=>({finish:'done',read:{ports:[]},mappings:[],inputs:[]});
const uploaded=()=>({operation_id:'upload',artifact:{artifact_id:'artifact',bytes:15,sha256:'a'.repeat(64)},outcome:{operation_id:'upload',action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,output:{artifact_id:'artifact',destination:'/test/data.csv',bytes:15,sha256:'a'.repeat(64),server_copy_verification:{verification_id:'verification',status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,destination:'/test/data.csv',bytes:15,sha256:'a'.repeat(64)}}}});

function coveredImport({existing=false,foreign=false,unknown=false}={}) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},workflow={prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',workflow_id:'flow',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const actions=[];let covered=true,opened=false,pending;
 const graphTid='MF;TF-1;Graph;Import';
 const state=()=>({origin:'http://test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'dom',revision:1},scan:{complete:true},
  prepared_node_context:{...node,node_id:foreign&&!covered?'foreign':node.node_id,verified:true,surface:opened?'wizard':'graph',tid:graphTid,locked:false},
  wizard:opened?{status:'observed',stage:'text_import_file',root_tid:'wizard',root_ref:'wizard',
   owner_context:{status:'observed',node:{tid:'flow>Import',label:'Import'},path:[...workflow.navigation_path,{tid:'node',label:'Import'},{tid:'wizard',label:'Wizard'}]},
   import_source:{fields:Object.fromEntries(Object.entries({source_path:'',connection:'file',encoding:'UTF-8',rows_to_skip:'0',first_line_as_title:true}).map(([k,value])=>[k,{status:'observed',value}]))}}:{status:'absent'},
  ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[
   {ref:'ui-body',tid:graphTid,graph_node:{part:'body'},allowed_actions:['click'],interaction:{state:covered?'point_not_observed':'point_observed',...(covered?{covering:[{anchor_tid:graphTid+';NodesControls'}]}:{})}},
   {ref:'ui-label',tid:graphTid+';Label;Label',label:'Import',graph_node:{part:'label'},allowed_actions:['click'],interaction:{state:'point_observed'}},
   {ref:'ui-settings',tid:graphTid+';Setting',allowed_actions:['open_wizard','begin_wizard'],wizard_open:{node:{node_label:'Import'},workflow_path:workflow.navigation_path},interaction:{state:'point_observed'}}]}});
 const support=createTextImportNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2'});
 const driver=support.nodeApplyDriverFactory({operation:{id:'import',action:{action_key:'node.apply',revision:'1'},nodeApply:{request:{...request(),target:{kind:existing?'existing':'new'},parameters:params()}}},
  now:Date.now,receiptOptions:()=>({}),onRecord:async e=>{if(e.phase==='node_step_prepared')pending=e;return e;},execute:async()=>{
   if(!pending)return {status:'SUCCEEDED',output:state()};
   const step=pending;pending=null;const a=step.action;actions.push(a);
   const refused=a.ref==='ui-body'&&covered;
   if(a.ref==='ui-label')covered=false;
   if(a.ref==='ui-settings')opened=true;
   return {operation_id:step.internal_operation_id,action_key:'ui.act',status:unknown&&a.ref==='ui-label'?'AMBIGUOUS':refused?'NOT_APPLIED':'SUCCEEDED',
    phase:refused?'preconditions':'completed',effect_possible:!refused,cleanup_complete:!unknown,
    error:refused?{code:'UI_REFERENCE_OBSCURED',message:'The observed control has no verified visible interaction point'}:null,trace:[]};
  }});
 return {actions,run:()=>driver.openWizard({document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+60000})};
}
for(const existing of [false,true])test('import opens through its label when hover controls cover the body, existing: '+existing,async()=>{
 const f=coveredImport({existing});assert.equal((await f.run()).verified,true);
 assert.deepEqual(f.actions.map(a=>a.ref),['ui-label','ui-body','ui-settings']);
});
test('import selection stops after an unknown label gesture or changed native owner',async()=>{
 for(const options of [{unknown:true},{foreign:true}]){
  const f=coveredImport(options);await assert.rejects(f.run());assert.deepEqual(f.actions.map(a=>a.ref),['ui-label']);
 }
});
const persistedImport=()=>({operation_id:'activate-import',contract_revision:'1.0.0',document_id:'doc',
 workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},
 target:{kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'wf',node_id:'import'}},
 inputs:[],mappings:[],mode:'delimited',parameters:{settings:{}},finish:'execute',
 read:{ports:[0],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
test('unchanged persisted Import executes without a new upload or configuration phases',async()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://loginom.invalid',targetBuild:'7.4.2'}),r=persistedImport();
 const operation={id:r.operation_id,parameters:r},calls=[];
 const drivers=support.nodeApplyDriverFactory({operation,
  execute:async()=>assert.fail('No wizard or configuration transport expected'),
  verifiedUploads:()=>assert.fail('Saved configuration does not require a new upload'),
  onRecord:async e=>structuredClone(e),now:Date.now});
 const ok=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
 const result=await applyNode({request:r,operation,handlers:support.nodeApplyHandlers,record:async e=>structuredClone(e),drivers:{...drivers,
  prepareTarget:async()=>{calls.push('target');return ok({node:r.target.ref});},
  finishGraph:async()=>{calls.push('execute');return ok({mode:'execute',execution_id:'fresh',settings_applied:false});},
  waitExecution:async()=>ok({execution_id:'fresh',status:'completed'}),
  readOutput:async()=>ok({execution_id:'fresh',status:'complete',ports:[{port:0,fresh:true}],evidence_ref:'fresh-output'})}});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.deepEqual(result.configuration,{status:'not_requested'});assert.deepEqual(calls,['target','execute']);
 assert.deepEqual(result.phases.map(p=>p.phase),['source','target','finish','execute','read']);
 assert.equal(result.execution.status,'completed');
});
for(const [name,change] of Object.entries({
 newImport:r=>{r.target={kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}};},
 sourcePath:r=>{r.parameters.settings={source:{source_path:'/other/source.csv'}};},
 columns:r=>{r.parameters.settings={columns:[{name:'Ticket',label:'Changed'}]};},
 format:r=>{r.parameters.settings={format:{delimiter:';'}};},
 mapping:r=>{r.mappings=[{direction:'output',port:0,changes:[{source:{kind:'configured_field',name:'Ticket'},label:'Changed'}]}];},
 done:r=>{r.finish='done';r.read.ports=[];},
 close:r=>{r.finish='close';r.read.ports=[];},
 otherPort:r=>{r.read.ports=[1];},
 arraySettings:r=>{r.parameters.settings=[];},
}))test('source omission cannot admit Import configuration: '+name,()=>{
 const r=persistedImport();change(r);
 const handlers=createTextImportNodeSupport({}).nodeApplyHandlers;
 assert.throws(()=>validateNodeApplyRequest(r,handlers),/Exact import source and settings required/);
});
test('an explicit old upload ID still requires current-session verified upload evidence',async()=>{
 const r=persistedImport();r.parameters.source={artifact_id:'old-artifact',upload_operation_id:'previous:upload'};
 const support=createCandidateNodeSupport({targetOrigin:'https://loginom.invalid',targetBuild:'7.4.2'});
 validateNodeApplyRequest(r,support.nodeApplyHandlers);
 const drivers=support.nodeApplyDriverFactory({operation:{id:r.operation_id,parameters:r},verifiedUploads:()=>[],
  execute:async()=>assert.fail('No browser call before source verification')});
 await assert.rejects(drivers.verifySource(r.parameters),/Verified upload operation is missing/);
});
test('public Import discovery and dispatch admit the unchanged existing execution request',async()=>{
 const handlers=createTextImportNodeSupport({}).nodeApplyHandlers,r=persistedImport();let received;
 assert.deepEqual(textImportParametersSchema.required,['settings']);
 await dispatchNodeApi({tools:nodeApiTools,startNodeApply:args=>{validateNodeApplyRequest(args,handlers);received=args;}},'dock_node_apply',r);
 assert.deepEqual(received,r);
});
test('new import missing columns identifies the corrective parameter; existing patches remain allowed',()=>{
 const p=params();delete p.settings.columns;
 assert.throws(()=>validateTextImportNodeParameters(p,'delimited',request()),/Invalid parameters.parameters.settings.columns:/);
 validateTextImportNodeParameters(p,'delimited',{...request(),target:{kind:'existing'}});
 p.settings.columns=params().settings.columns;
 validateTextImportNodeParameters(p,'delimited',request());
});
test('Done candidate validates complete request before opening the node',()=>{
 validateTextImportNodeParameters(params(),'delimited',request());
 for(const mutate of [r=>r.finish='unknown',r=>r.read.ports=[0],r=>r.mappings=[{direction:'output'}],r=>r.inputs=[{}]]){const r=request();mutate(r);assert.throws(()=>validateTextImportNodeParameters(params(),'delimited',r));}
 for(const mutate of [p=>p.settings.columns[0].used=false,p=>p.source.sha256='wrong',p=>p.source.extra=true]){const p=params();mutate(p);assert.throws(()=>validateTextImportNodeParameters(p,'delimited',request()));}
});
test('source requires the completed upload byte verification chain, not a matching path',()=>{
 const verified=verifyTextImportSource(params(),[uploaded()]);assert.equal(verified.source.verification_id,'verification');assert.equal(verified.effect_possible,false);
 assert.throws(()=>verifyTextImportSource(params(),[]));assert.throws(()=>verifyTextImportSource(params(),[uploaded(),uploaded()]));
});
test('omitted source settings still require an explicit verified storage destination',()=>{
 const p=params();p.settings={columns:[{name:'A',label:'Updated'}]};
 assert.equal(verifyTextImportSource(p,[uploaded()]).source.destination,'/test/data.csv');
 for(const destination of [undefined,'','relative.csv','/test/../data.csv']) {
  const u=uploaded();u.outcome.output.destination=destination;
  u.outcome.output.server_copy_verification.destination=destination;
  assert.throws(()=>verifyTextImportSource(p,[u]));
 }
});
for(const [name,change] of Object.entries({
 unknown:u=>u.outcome.status='AMBIGUOUS',cleanup:u=>u.outcome.cleanup_complete=false,
 artifact:u=>u.artifact.artifact_id='other',upload:u=>u.outcome.operation_id='other',path:u=>u.outcome.output.server_copy_verification.destination='/test/other.csv',
 bytes:u=>u.outcome.output.server_copy_verification.bytes=16,sha:u=>u.outcome.output.server_copy_verification.sha256='b'.repeat(64),
 submitted_only:u=>delete u.outcome.output.server_copy_verification,unverified:u=>u.outcome.output.server_copy_verification.bytes_verified=false,
 incomplete:u=>u.outcome.output.server_copy_verification.upload_completion_verified=false,
}))test('source refuses '+name,()=>{const u=uploaded();change(u);assert.throws(()=>verifyTextImportSource(params(),[u]));});
test('source reference resolves integrity metadata without mutating the request',()=>{
 const p=params();delete p.source.bytes;delete p.source.sha256;
 const before=structuredClone(p);
 validateTextImportNodeParameters(p,'delimited',request());
 const result=verifyTextImportSource(p,[uploaded()]);
 assert.equal(result.source.bytes,15);assert.equal(result.source.sha256,'a'.repeat(64));
 assert.deepEqual(p,before);
 for(const [key,value] of [['bytes',16],['sha256','b'.repeat(64)]]) {
  const mismatch=structuredClone(p);mismatch.source[key]=value;
  assert.throws(()=>verifyTextImportSource(mismatch,[uploaded()]), /do not match/);
 }
});
test('reference cannot bypass missing, duplicate or corrupted upload evidence',()=>{
 const p=params();delete p.source.bytes;delete p.source.sha256;
 for(const uploads of [[],[uploaded(),uploaded()]])assert.throws(()=>verifyTextImportSource(p,uploads));
 for(const mutate of [
  u=>u.artifact.artifact_id='foreign',u=>u.outcome.status='AMBIGUOUS',
  u=>u.outcome.cleanup_complete=false,u=>delete u.outcome.output.server_copy_verification,
  u=>u.outcome.output.server_copy_verification.bytes_verified=false,
  u=>u.outcome.output.server_copy_verification.upload_completion_verified=false,
  u=>u.outcome.output.server_copy_verification.sha256='b'.repeat(64),
  u=>u.outcome.output.bytes=16,u=>delete u.artifact.sha256,
  u=>{for(const a of [u.artifact,u.outcome.output,u.outcome.output.server_copy_verification])a.sha256='invalid'},
 ]){const u=uploaded();mutate(u);assert.throws(()=>verifyTextImportSource(p,[u]));}
});
test('handler receives only its operation-local trusted drivers',async()=>{
 const support=createTextImportNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});
 const h=support.nodeApplyHandlers.get('imports.text'),calls=[];
 const result=await h.configure({operation_id:'owned'},params(),{configureTextImport:async(c,p)=>{calls.push([c,p]);return{verified:true};}});
 assert.equal(result.verified,true);assert.equal(calls[0][0].operation_id,'owned');
});

test('Done candidate admits an explicitly requested wide schema for paged verification',()=>{
 const p=params();p.settings.columns=Array.from({length:66},(_,i)=>({...p.settings.columns[0],name:'Field'+i,label:'Field'+i}));validateTextImportNodeParameters(p,'delimited',request());
});

test('Done candidate admits explicit rename, independent labels and partial field exclusion',()=>{
 const p=params();p.settings.columns=[{...p.settings.columns[0],source_name:'Original',name:'Renamed',label:'Метка'},
  {...p.settings.columns[0],name:'Omitted',used:false}];
 validateTextImportNodeParameters(p,'delimited',request());
 for(const change of [p=>p.settings.columns[0].source_name='',p=>p.settings.columns[0].name='bad name',
  p=>p.settings.columns[1].source_name='Original']) {const bad=structuredClone(p);change(bad);assert.throws(()=>validateTextImportNodeParameters(bad,'delimited',request()));}
});

test('private Execute admits its one data output and rejects other ports',()=>{
 const r=request();r.finish='execute';validateTextImportNodeParameters(params(),'delimited',r);r.read.ports=[0];validateTextImportNodeParameters(params(),'delimited',r);r.read.ports=[1];assert.throws(()=>validateTextImportNodeParameters(params(),'delimited',r));
});

test('identity output binds by name while retaining the observed output order',async()=>{
 const {bindIdentityOutputColumns}=await import('../lib/text-import-node.mjs');
 const columns=[{name:'Title',label:'Title',type:'string',data_kind:'Дискретный',used:true},
  {name:'Id',label:'Identifier',type:'integer',data_kind:'Дискретный',used:true}];
 const actual={total_columns:2,fields:[columns[1],columns[0]].map((c,index)=>({...c,index,status:'observed',source:{status:'rendered_source',label:c.label,type:c.type}}))};
 assert.deepEqual(bindIdentityOutputColumns(columns,actual),[columns[1],columns[0]]);
 for(const change of ['duplicate','foreign_source','wrong_type','wrong_index']) {
  const bad=structuredClone(actual);
  if(change==='duplicate')bad.fields[1]=structuredClone(bad.fields[0]);
  if(change==='foreign_source')bad.fields[0].source.label='Other';
  if(change==='wrong_type')bad.fields[0].type='real';
  if(change==='wrong_index')bad.fields[0].index=1;
  assert.throws(()=>bindIdentityOutputColumns(columns,bad),change);
 }
});

test('private import admits configured output edits and rejects unsupported exclusion before UI',()=>{
 const r=request();r.mappings=[{direction:'output',port:0,autosync:false,fields:[{source:{kind:'configured_field',name:'A'},name:'Mapped'}]}];
 validateTextImportNodeParameters(params(),'delimited',r);
 for(const change of [m=>m.fields[0].excluded=true,m=>m.fields[0].source={schema_id:'s',field_id:'f'},m=>m.port=1,m=>m.direction='input',m=>m.fields=[]]) {
  const bad=structuredClone(r);change(bad.mappings[0]);assert.throws(()=>validateTextImportNodeParameters(params(),'delimited',bad));
 }
});
test('native output binding preserves aliases, source identities and output order',async()=>{
 const {bindConfiguredOutputColumns:bind}=await import('../lib/text-import-node.mjs');
 const configured=['A','B'].map(name=>({name,label:'Same',type:'string',data_kind:'Дискретный',used:true}));
 const sources=configured.map((f,i)=>({record_id:'s'+i,field_id:String(i),name:f.name,label:f.label,type:f.type,index:i,required:true}));
 const native={verified:true,source_identity_verified:true,inventory_complete:true,source_fields:sources,
  target_fields:[sources[1],sources[0]].map((source,index)=>({record_id:'t'+index,index,name:'Alias'+index,label:'Label'+index,type:'string',data_kind:'Дискретный',source}))};
 const actual={total_columns:2,fields:native.target_fields.map(f=>({...f,status:'observed',source:{status:'rendered_source',label:f.source.label,type:f.source.type}}))};
 assert.deepEqual(bind(configured,actual,native).map(f=>f.name),['Alias0','Alias1']);
 for(const change of [n=>n.target_fields[0].source={...n.target_fields[0].source,record_id:'foreign'},n=>n.target_fields[1].source=n.target_fields[0].source,n=>n.source_fields[0].name='Other',n=>n.inventory_complete=false]) {
  const bad=structuredClone(native);change(bad);assert.throws(()=>bind(configured,actual,bad));
 }
 const bad=structuredClone(actual);bad.fields.reverse();assert.throws(()=>bind(configured,bad,native));
});
