import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {restoreImportOutputLayout,importOutputLayoutSnapshot} from '../lib/text-import-node.mjs';

const names=['Id','Amount','Active','EventAt','Note'];
function mapping(order=names,type='real') {
 const sources=[...names,...(order.includes('Extra')?['Extra']:[])].map((name,index)=>({name,label:name,index,field_id:String(index),record_id:'s'+index,type:name==='Amount'?type:'string'}));
 return {verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,source_fields:sources,
  target_fields:order.map((name,index)=>({name,label:name,index,record_id:'t'+index,field_id:String(index),type:name==='Amount'?type:'string',data_kind:'Дискретный',source:sources.find(s=>s.name===name)}))};
}
function fixture(native) {
 let selected;
 const state=()=>({node_mapping:structuredClone(native),wizard:{root_ref:'wizard',root_tid:'W',stage:'output_mapping',
  output_columns:{page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:native.target_fields.length,returned:native.target_fields.length,next_offset:null},
   fields:native.target_fields.map(f=>({...f,status:'observed',name_ref:f.record_id,selected:f.record_id===selected}))}},
  ui:{elements:[...native.target_fields.map(f=>({ref:f.record_id,allowed_actions:['click']})),{ref:'up',tid:'W;ColumnsMappingEngineOutputPortWizard;btnMoveMappingColumnUp',allowed_actions:['click']}]}});
 return {async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){const s=state();assert.ok(o.ready(s));const a=o.resolve(s);
  if(a.ref!=='up'){selected=a.ref;return;}
  const index=native.target_fields.findIndex(f=>f.record_id===selected);
  [native.target_fields[index-1],native.target_fields[index]]=[native.target_fields[index],native.target_fields[index-1]];
  native.target_fields.forEach((f,i)=>f.index=i);
 }};
}
test('native real → string → new Extra → refresh types restores retained positions',async()=>{
 let before=mapping();
 for(const [order,type] of [[['Id','Active','EventAt','Note','Amount'],'string'],[['Id','Amount','Active','EventAt','Note','Extra'],'string'],[['Id','Active','EventAt','Note','Extra','Amount'],'real']]) {
  const after=mapping(order,type);
  await restoreImportOutputLayout(fixture(after),before,after,[]);
  assert.deepEqual(after.target_fields.map(f=>f.source.name),[...names,...(order.includes('Extra')?['Extra']:[])]);
  assert.equal(after.target_fields[1].type,type);assert.equal(after.autosync,true);
  before=structuredClone(after);
 }
});
test('retains user order and aliases by source association, appending new fields',async()=>{
 const order=['Note','Amount','Id','Active','EventAt'],before=mapping(order),after=mapping(['Note','Id','Active','EventAt','Amount','Extra'],'string');
 for(const m of [before,after])Object.assign(m.target_fields.find(f=>f.source.name==='Amount'),{name:'Total',label:'Сумма'});
 await restoreImportOutputLayout(fixture(after),before,after,[]);
 assert.deepEqual(after.target_fields.map(f=>f.name),['Note','Total','Id','Active','EventAt','Extra']);
 assert.equal(after.target_fields[1].label,'Сумма');
});
for(const patch of [{name:'Amount',type:'string',label:'Сумма'},{source_name:'Amount',name:'Total',type:'string'}])
test('type change keeps the source patch name/label when there was no output alias: '+JSON.stringify(patch),async()=>{
 const before=mapping(),after=mapping(['Id','Active','EventAt','Note','Amount'],'string');
 const field=after.target_fields.find(f=>f.source.name==='Amount');
 if(patch.source_name)field.name=field.source.name=patch.name;
 if(patch.label)field.label=field.source.label=patch.label;
 await restoreImportOutputLayout(fixture(after),before,after,[],[patch]);
 assert.deepEqual(after.target_fields.map(f=>f.name),['Id',patch.source_name?'Total':'Amount','Active','EventAt','Note']);
 assert.equal(after.target_fields[1].label,patch.label??'Amount');
 assert.equal(after.target_fields[1].type,'string');
});
test('explicit fields and autosync=false keep their existing behavior',async()=>{
 for(const change of ['explicit','off']) {
  const before=mapping(),after=mapping([...names.slice(0,1),...names.slice(2),'Amount'],'string');
  if(change==='off')before.autosync=after.autosync=false;
  const initial=structuredClone(after);
  await restoreImportOutputLayout({observe:()=>assert.fail('no automatic edits')},before,after,change==='explicit'?[{fields:[]}]:[]);
  assert.deepEqual(after,initial);
 }
});
test('unverified previous output layout is skipped without an output mutation',async()=>{
 const before={...mapping(),verified:false};
 assert.equal(importOutputLayoutSnapshot(before),null);
 assert.equal(await restoreImportOutputLayout({observe:()=>assert.fail('No output edits for an unverified old layout')},before,mapping(),[]),null);
});

for(const change of ['type','binding-only','incomplete','unverified-source','unlinked','foreign-owner','epoch'])test('existing import preserves binding through layout capture: '+change,()=>{
 // Exercise the actual driver across procedure boundaries. The file selector
 // loses a newly edited draft binding on a round trip, as native W1 can do.
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',`
import assert from 'node:assert/strict';
import {mock} from 'node:test';
const lib=${JSON.stringify(new URL('../lib/',import.meta.url).href)},href=name=>new URL(name,lib).href;
const real=async name=>({...await import(href(name)+'?binding-layout-real')});
const mode=process.argv[1],changed=mode!=='binding-only',trace=[],navigation=[];
const incomplete=['incomplete','unverified-source','unlinked'].includes(mode);
const owner={status:'observed',node:{tid:'N'},path:[{tid:'wf',label:'Scenario'}]};
let stage='graph',bound=false,epoch=1;
const columns=[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true},{name:'Amount',label:'Amount',type:'real',data_kind:'Непрерывный',used:true}];
const sources=columns.map((c,index)=>({...c,index,record_id:'s'+index,field_id:String(index)}));
const native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,source_fields:sources,
 target_fields:[1,0].map((j,index)=>({...sources[j],index,record_id:'t'+j,source:sources[j],...(j===1?{name:'Total',label:'Сумма'}:{})}))};
const state=()=>({dom_epoch:{document:'doc',revision:epoch},prepared_node_context:{verified:true,surface:stage==='graph'?'graph':'wizard',tid:'N'},
 wizard:stage==='graph'?{status:'absent'}:{status:'observed',stage,root_tid:'W',owner_context:structuredClone(owner)},
 ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'W;btnPrev',ref:'prev',allowed_actions:['wizard_step']}]},node_mapping:structuredClone(native)});
const channel={observe:async o=>{const s=state();
 if(o.condition.includes('Previous control available')&&mode==='foreign-owner')s.wizard.owner_context.node.tid='foreign';
 if(o.condition==='import output layout before configuration'){
  trace.push('capture');
  if(mode==='incomplete')s.node_mapping.inventory_complete=false;
  if(mode==='unverified-source')s.node_mapping.source_identity_verified=false;
  if(mode==='unlinked')s.node_mapping.target_fields[0].source=null;
 }
 assert.ok(o.ready(s),o.condition);return s;},
 perform:async o=>{const s=o.initialObservation??state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);assert.equal(a.verb,'wizard_step');
  if(a.ref==='prev'){
   assert.equal(typeof o.confirmIdentity,'function','Back must confirm a stable DOM epoch');
   assert.deepEqual(o.confirmIdentity(s),s.dom_epoch);
   assert.deepEqual(o.identity(s),{owner:{node:'N',path:owner.path},root_tid:'W',stage});
   if(mode==='epoch'){epoch++;assert.notDeepEqual(o.confirmIdentity(s),o.confirmIdentity(state()));throw Error('epoch changed before Back');}
  }
  navigation.push([stage,a.expected_stage,a.ref]);stage=a.expected_stage;if(stage==='text_import_file')bound=false;},
 readVariablePortMapping:async()=>({verified:true,independent_readback:true,cleanup_complete:true,mapping:{}})};
mock.module(href('node-procedure.mjs'),{exports:{...await real('node-procedure.mjs'),createNodeProcedure:()=>channel}});
mock.module(href('node-graph-selection.mjs'),{exports:{...await real('node-graph-selection.mjs'),selectPreparedGraphNode:async()=>{}}});
mock.module(href('node-wizard-open.mjs'),{exports:{...await real('node-wizard-open.mjs'),openPreparedWizard:async()=>{stage='text_import_file';}}});
mock.module(href('import-bindings.mjs'),{exports:{...await real('import-bindings.mjs'),
 configureImportBinding:async()=>{assert.equal(stage,'text_import_file');bound=true;trace.push('binding');},resolveImportBindingSourceReadback:s=>s}});
mock.module(href('text-import-procedure.mjs'),{exports:{...await real('text-import-procedure.mjs'),isTextImportSourceReady:()=>true,
 configureTextImportPatch:async(_channel,settings,_owner,path,options)=>{
  assert.equal(bound,true,'layout navigation discarded the configured import binding');
  assert.equal(options.boundSource,true);assert.equal(path,'/test/bound.csv');trace.push('patch');stage='text_import_format';
  if(changed){columns[1].type=sources[1].type='string';native.target_fields.reverse();native.target_fields.forEach((f,i)=>{f.index=i;if(f.source.name==='Amount')f.type='string';});}
  return {verified:true,source:{fields:{}},columns:structuredClone(columns),format:{fields:{auto_detect_columns:{value:'Только новые'}}}};
 }}});
mock.module(href('port-mapping-procedure.mjs'),{exports:{...await real('port-mapping-procedure.mjs'),
 reorderOutputFields:async(_channel,ids)=>{native.target_fields=ids.map((id,index)=>({...native.target_fields.find(f=>f.record_id===id),index}));trace.push('restore');return {verified:true,moves:1};}}});
mock.module(href('import-definition-pages.mjs'),{exports:{...await real('import-definition-pages.mjs'),
 readOutputDefinitionPages:async()=>({total_columns:2,fields:native.target_fields.map(f=>({...f,status:'observed',source:{status:'rendered_source',label:f.source.label,type:f.source.type}}))})}});
const {createTextImportNodeSupport}=await import(href('text-import-node.mjs'));
const p={source:{kind:'storage',server_source_ref:'ref'},settings:{source:{},...(changed?{columns:[{name:'Amount',type:'string'}]}:{})}};
const request={target:{kind:'existing'},finish:'done',inputs:[],mappings:[],read:{ports:[]},bindings:[{parameter:'/settings/source/source_path',variable:{kind:'variables',input:0,name:'CsvPath'}}],parameters:p};
const operation={id:'op',parameters:request,nodeApply:{request},importBinding:{},nodeTargetAdapter:{observe:async()=>({})}};
const driver=createTextImportNodeSupport({}).nodeApplyDriverFactory({operation,execute:async()=>assert.fail('no browser'),onRecord:()=>{},now:Date.now,receiptOptions:()=>({}),
 resolveStorageSource:async()=>({verified:true,kind:'storage',server_source_ref:'ref',destination:'/test/bound.csv'})});
const ctx={signal:new AbortController().signal,deadline:Date.now()+60000,document_id:'d',workflow_ref:{workflow_id:'w'},node:{node_id:'n'}};
await driver.verifySource(p);await driver.openWizard(ctx);
if(['foreign-owner','epoch'].includes(mode)){
 await assert.rejects(driver.configureTextImport(ctx,p),mode==='foreign-owner'?/owner changed/:/epoch changed/);
 assert.deepEqual(trace,['capture']);assert.equal(bound,false);console.log(JSON.stringify({verified:true}));process.exit(0);
}
await driver.configureTextImport(ctx,p);
const mapped=await driver.mapPorts([],{...ctx,receipt_id:'op:output_mapping'});
assert.deepEqual(trace,changed?['capture','binding','patch',...(!incomplete?['restore']:[])]:['binding','patch']);
assert.deepEqual(navigation,changed?[
 ['text_import_file','text_import_format','next'],['text_import_format','output_mapping','next'],
 ['output_mapping','text_import_format','prev'],['text_import_format','text_import_file','prev'],
 ['text_import_format','output_mapping','next'],['output_mapping','done','next']
]:[['text_import_format','output_mapping','next'],['output_mapping','done','next']]);
assert.deepEqual(mapped.native_mapping.target_fields.map(f=>f.name),incomplete?['Id','Total']:['Total','Id']);
assert.equal(mapped.native_mapping.target_fields.find(f=>f.name==='Total').label,'Сумма');
assert.equal(mapped.native_mapping.autosync,true);assert.equal(bound,true);
console.log(JSON.stringify({trace,verified:mapped.verified}));
`,change],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr+result.stdout);
 assert.equal(JSON.parse(result.stdout).verified,true);
});
for(const mode of ['no-path','explicit-path','verified-path','auto-path','multiple-paths','mismatched-path'])test('existing import without a saved source skips layout capture: '+mode,()=>{
 // A discarded first configuration leaves no source and no output layout. Next
 // on an empty path opens a native error; refuse first or fill the path first.
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',`
import assert from 'node:assert/strict';
import {mock} from 'node:test';
const lib=${JSON.stringify(new URL('../lib/',import.meta.url).href)},href=name=>new URL(name,lib).href;
const real=async name=>({...await import(href(name)+'?empty-source-real')});
const {resolveTextImportEncoding}=await import(href('text-import-encoding.mjs'));
const mode=process.argv[1],actions=[],utf8=resolveTextImportEncoding('UTF-8').label;
const owner={status:'observed',node:{tid:'N'},path:[{tid:'wf',label:'Scenario'}]};
let stage='graph',path='';
const field=value=>({status:'observed',value,input_ref:'path',display_ref:'path',owner_ref:'o'});
const state=()=>({dom_epoch:{document:'doc',revision:1},prepared_node_context:{verified:true,surface:stage==='graph'?'graph':'wizard',tid:'N'},
 wizard:stage==='graph'?{status:'absent'}:{status:'observed',stage,root_ref:'W',root_tid:'W',owner_context:structuredClone(owner),
  import_source:{fields:{source_path:field(path),connection:field('Хранилище'),encoding:field(utf8),rows_to_skip:field('0'),first_line_as_title:field(true)}}},
 ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'W;btnClose',ref:'close',allowed_actions:['click']}],dialogs:[],masks:[]}});
const step=a=>{
 actions.push([a.verb,stage,a.expected_stage,path]);
 if(stage==='text_import_file'&&path==='')throw Error('Next pressed with an empty source path');
 throw Error('STOP_AFTER_NEXT');
};
const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);return s;},
 perform:async o=>{const s=o.initialObservation??state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);assert.equal(a.verb,'wizard_step');step(a);},
 act:async a=>{if(a.verb==='wizard_step')return step(a);actions.push([a.verb,stage,a.text??a.key,path]);if(a.verb==='fill')path=a.text;}};
mock.module(href('node-procedure.mjs'),{exports:{...await real('node-procedure.mjs'),createNodeProcedure:()=>channel}});
mock.module(href('node-graph-selection.mjs'),{exports:{...await real('node-graph-selection.mjs'),selectPreparedGraphNode:async()=>{}}});
mock.module(href('node-wizard-open.mjs'),{exports:{...await real('node-wizard-open.mjs'),openPreparedWizard:async()=>{stage='text_import_file';}}});
mock.module(href('node-wizard-close.mjs'),{exports:{...await real('node-wizard-close.mjs'),closePreparedWizard:async()=>{actions.push(['close',stage]);stage='graph';return {verified:true};}}});
const {createTextImportNodeSupport}=await import(href('text-import-node.mjs'));
const settings=mode==='no-path'?{source:{encoding:'UTF-8'}}:{source:{source_path:'/test/upload.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
 format:{delimiter:';',decimal_separator:'.',null_marker:'',text_qualifier:'"'},columns:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true}]};
if(mode==='verified-path'||mode==='auto-path'||mode==='multiple-paths')delete settings.source.source_path;
if(mode==='auto-path'){delete settings.columns;settings.format.auto_detect_columns='new';}
if(mode==='mismatched-path')settings.source.source_path='/test/other.csv';
// A verified local delivery may omit settings.source.source_path.
const sha='a'.repeat(64),artifact={artifact_id:'a1',bytes:3,sha256:sha};
const upload={operation_id:'up1',artifact,outcome:{operation_id:'up1',status:'SUCCEEDED',cleanup_complete:true,action_key:'artifact.upload',
 output:{artifact_id:'a1',destination:'/test/upload.csv',bytes:3,sha256:sha,server_copy_verification:{status:'SUCCEEDED',upload_completion_verified:true,
  destination:'/test/upload.csv',bytes:3,bytes_verified:true,sha256:sha,verification_id:'v1'}}}};
const p={source:mode==='multiple-paths'?{kind:'verified_sources',sources:[{artifact_id:'a1',upload_operation_id:'up1'},{artifact_id:'a2',upload_operation_id:'up2'}]}:{artifact_id:'a1',upload_operation_id:'up1'},settings};
const second=structuredClone(upload);second.operation_id=second.outcome.operation_id='up2';second.artifact.artifact_id=second.outcome.output.artifact_id='a2';second.outcome.output.destination=second.outcome.output.server_copy_verification.destination='/test/second.csv';
const request={target:{kind:'existing'},finish:'done',inputs:[],mappings:[],read:{ports:[]},bindings:[],parameters:p};
const operation={id:'op',parameters:request,nodeApply:{request},nodeTargetAdapter:{observe:async()=>({})}};
const driver=createTextImportNodeSupport({}).nodeApplyDriverFactory({operation,execute:async()=>assert.fail('no browser'),onRecord:()=>{},now:Date.now,receiptOptions:()=>({}),
 verifiedUploads:()=>[upload,second]});
const ctx={signal:new AbortController().signal,deadline:Date.now()+60000,document_id:'d',workflow_ref:{workflow_id:'w'},node:{node_id:'n'}};
if(mode==='mismatched-path'){
 await assert.rejects(driver.verifySource(p),/exact destination do not match/);
 assert.deepEqual(actions,[]);console.log(JSON.stringify({verified:true,actions}));process.exit(0);
}
await driver.verifySource(p);await driver.openWizard(ctx);
const original=structuredClone(settings);
if(mode==='no-path'||mode==='multiple-paths'){
 const error=await driver.configureTextImport(ctx,p).then(()=>assert.fail('configured without a source'),e=>e);
 assert.match(error.message,/Existing import has no saved source/);
 assert.equal(error.nodePhaseRefusal?.settings_unchanged,true);
 assert.deepEqual(actions,[['close','text_import_file']]);
} else {
 await assert.rejects(driver.configureTextImport(ctx,p),/STOP_AFTER_NEXT/);
 assert.deepEqual(actions,[['fill','text_import_file','/test/upload.csv',''],['press','text_import_file','Tab','/test/upload.csv'],
  ['wizard_step','text_import_file','text_import_format','/test/upload.csv']]);
}
assert.deepEqual(settings,original,'caller settings must remain unchanged');
console.log(JSON.stringify({verified:true,actions}));
`,mode],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr+result.stdout);
 assert.equal(JSON.parse(result.stdout).verified,true);
});
