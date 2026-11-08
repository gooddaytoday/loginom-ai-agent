import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {restoreImportOutputLayout} from '../lib/text-import-node.mjs';

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
test('explicit fields and autosync=false keep their existing behavior',async()=>{
 for(const change of ['explicit','off']) {
  const before=mapping(),after=mapping([...names.slice(0,1),...names.slice(2),'Amount'],'string');
  if(change==='off')before.autosync=after.autosync=false;
  const initial=structuredClone(after);
  await restoreImportOutputLayout({observe:()=>assert.fail('no automatic edits')},before,after,change==='explicit'?[{fields:[]}]:[]);
  assert.deepEqual(after,initial);
 }
});

for(const change of ['type','binding-only'])test('existing import preserves binding through layout capture: '+change,()=>{
 // Exercise the actual driver across procedure boundaries. The file selector
 // loses a newly edited draft binding on a round trip, as native W1 can do.
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',`
import assert from 'node:assert/strict';
import {mock} from 'node:test';
const lib=${JSON.stringify(new URL('../lib/',import.meta.url).href)},href=name=>new URL(name,lib).href;
const real=async name=>({...await import(href(name)+'?binding-layout-real')});
const changed=process.argv[1]==='type',trace=[];
let stage='graph',bound=false;
const columns=[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true},{name:'Amount',label:'Amount',type:'real',data_kind:'Непрерывный',used:true}];
const sources=columns.map((c,index)=>({...c,index,record_id:'s'+index,field_id:String(index)}));
const native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,source_fields:sources,
 target_fields:[1,0].map((j,index)=>({...sources[j],index,record_id:'t'+j,source:sources[j],...(j===1?{name:'Total',label:'Сумма'}:{})}))};
const state=()=>({prepared_node_context:{verified:true,surface:stage==='graph'?'graph':'wizard',tid:'N'},
 wizard:stage==='graph'?{status:'absent'}:{status:'observed',stage,root_tid:'W',owner_context:{status:'observed'}},
 ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'W;btnPrev',ref:'prev',allowed_actions:['wizard_step']}]},node_mapping:structuredClone(native)});
const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);if(o.condition==='import output layout before configuration')trace.push('capture');return s;},
 perform:async o=>{const s=o.initialObservation??state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);assert.equal(a.verb,'wizard_step');stage=a.expected_stage;if(stage==='text_import_file')bound=false;},
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
await driver.verifySource(p);await driver.openWizard(ctx);await driver.configureTextImport(ctx,p);
const mapped=await driver.mapPorts([],{...ctx,receipt_id:'op:output_mapping'});
assert.deepEqual(trace,changed?['capture','binding','patch','restore']:['binding','patch']);
assert.deepEqual(mapped.native_mapping.target_fields.map(f=>f.name),['Total','Id']);
assert.equal(mapped.native_mapping.target_fields[0].label,'Сумма');
assert.equal(mapped.native_mapping.autosync,true);assert.equal(bound,true);
console.log(JSON.stringify({trace,verified:mapped.verified}));
`,change],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr+result.stdout);
 assert.equal(JSON.parse(result.stdout).verified,true);
});
