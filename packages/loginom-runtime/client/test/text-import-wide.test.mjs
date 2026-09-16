import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTextImportFields,importFieldRevealDelta} from '../lib/text-import-procedure.mjs';
import {textImportStepBudget} from '../lib/text-import-limits.mjs';

function fixture(count,{editLabels=false,drift=false,nullMarker=null,optionMode=null}={}) {
 const columns=Array.from({length:count},(_,index)=>({index,status:'observed',name:'F'+index,label:'F'+index,type:'string',data_kind:'Дискретный',used:true,
  cell_refs:Object.fromEntries(['name','label','type','data_kind','used'].map(p=>[p,p+':'+index]))}));
 const owner={status:'observed',node:{tid:'node'},path:[{tid:'path',label:'Scenario'}]};
 const parameters={source:{source_path:'/user/wide.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
  format:{delimiter:';',text_qualifier:'"',null_marker:'NULL',decimal_separator:'.'},
  columns:columns.map(c=>({name:c.name,label:editLabels?'Label'+c.index:c.label,type:c.type,data_kind:c.data_kind,used:true}))};
 let marker=nullMarker===null?'NULL':'?',opened=false,selected=false;
 if(nullMarker!==null)parameters.format.null_marker=nullMarker;
 const request={target:{kind:'new'},parameters:{settings:parameters},mappings:[]},budget=textImportStepBudget(request);
 let stage='text_import_file',steps=0,editor,initialSweep=false,gestures=0;
 const reads=[];
 const check=()=>{assert.ok(++steps<=budget,'fixed procedure exhausted its schema allowance');};
 const values=o=>Object.fromEntries(Object.entries(o).map(([k,value])=>[k,{status:'observed',truncated:false,value}]));
 const state=(offset=0)=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'wizard-ref',owner_context:owner,
  import_source:{fields:values({...parameters.source,encoding:'UTF-8 (65001)',rows_to_skip:'0'})},settings:{fields:{...values(parameters.format),null_marker:{status:'observed',truncated:false,value:marker,owner_ref:'marker-owner',input_ref:selected&&optionMode==='replaced_input'?'foreign-input':'marker-input'}}},
  ...(editor?{import_column_editor:{...editor}}:{}),
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:columns.slice(offset,offset+8),
   page:{status:'complete_definition_page',schema_id:'wide',offset,limit:8,returned:Math.min(8,count-offset),total_columns:count,next_offset:offset+8<count?offset+8:null}}},
  ui:{elements:[...(nullMarker===null?[]:[{ref:'marker-picker',wizard_combo:{kind:'picker',field:{name:'null_marker',owner_ref:'marker-owner',root_ref:'wizard-ref'}}},...(opened?['null','NULL',...(optionMode==='duplicate'?['NULL']:[])].filter(label=>optionMode!=='wrong_case'||label!=='NULL').map(label=>({ref:'option-'+label,wizard_combo:{kind:'option',label,field:{name:'null_marker',owner_ref:optionMode==='foreign_owner'?'foreign':'marker-owner',root_ref:optionMode==='foreign_root'?'foreign':'wizard-ref'}}})):[])]),{tid:'wizard;ImportTextFileParamsWizard;ColumnDefsTuning;grdData;grd-1;tbl',ref:'scroll',allowed_actions:['scroll_horizontal'],bounding_box:{x:0,width:800}}, {tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},...columns.slice(offset,offset+8).flatMap(c=>Object.values(c.cell_refs).map(ref=>({ref,bounding_box:{x:0,width:135},interaction:{state:'point_observed'}})))]}});
 const channel={observe:async options=>{
  check();const offset=options.importColumnPage?.offset??0;reads.push({condition:options.condition,offset});
  if(options.condition==='complete import definition page at 0'&&initialSweep&&drift)columns.at(-1).used=false;
  const s=structuredClone(state(offset));assert.equal(options.ready(s),true,options.condition);
  if(options.condition==='complete import definition page at '+(count-8))initialSweep=true;
  return s;
 },act:async action=>{
  check();gestures++;
  if(action.verb==='wizard_step'){stage=action.expected_stage;return;}
  if(action.verb==='click'&&action.ref==='marker-picker'){opened=true;return;}
  if(action.verb==='select_wizard_option'){assert.equal(action.ref,'option-'+nullMarker);marker=optionMode==='bad_readback'?'null':nullMarker;opened=false;selected=true;return;}
  if(action.verb==='set_wizard_field'&&action.ref==='marker-input'){assert.equal(action.text,nullMarker);marker=action.text;return;}
  if(action.verb==='click'){
   const [property,index]=action.ref.split(':'),c=columns[Number(index)];assert.equal(property,'label');
   editor={...c,property,original_value:c.label,input_ref:'editor',value:c.label};return;
  }
  if(action.verb==='fill'){assert.equal(action.ref,'editor');editor.value=action.text;return;}
  if(action.verb==='press'){assert.equal(action.key,'Enter');columns[editor.index].label=editor.value;editor=null;return;}
  assert.fail('Unexpected gesture: '+action.verb);
 }};
 return {parameters,channel,owner,budget,reads,get steps(){return steps;},get gestures(){return gestures;}};
}
for(const count of [400,1000])for(const editLabels of [false,true])test(`${count} fields are completely checked within a schema-sized budget (edits=${editLabels})`,async()=>{
 const f=fixture(count,{editLabels});const result=await configureTextImportFields(f.channel,f.parameters,f.owner);
 assert.equal(result.verified,true);assert.equal(result.columns.length,count);
 assert.deepEqual(result.columns.map(c=>c.label),f.parameters.columns.map(c=>c.label));
 assert.equal(f.reads.filter(r=>r.condition.startsWith('complete import definition page')).length,2*Math.ceil(count/8));
 if(editLabels){assert.ok(f.steps>2048,'regression must exercise the former limit');assert.equal(f.gestures,count*3+1);}
 else {assert.equal(f.gestures,1);assert.ok(f.steps<400,'unchanged fields use complete sweeps, not per-property reads');}
});
test('the final full sweep rejects a change to a skipped offscreen field',async()=>{
 const f=fixture(400,{drift:true});await assert.rejects(configureTextImportFields(f.channel,f.parameters,f.owner),/definitions differ/);
});
test('an empty existing patch budgets its entire retained schema and mapping reorders stay bounded',()=>{
 const existing={target:{kind:'existing'},parameters:{settings:{}},mappings:[]};
 const full={target:{kind:'new'},parameters:{settings:{columns:Array(1000).fill({})}},mappings:[]};
 assert.equal(textImportStepBudget(existing),textImportStepBudget(full));
 const reordered={...full,mappings:[{direction:'output',fields:Array(1000).fill({})}]};
 assert.ok(textImportStepBudget(reordered)>textImportStepBudget(full));
 assert.throws(()=>textImportStepBudget({...full,parameters:{settings:{columns:Array(1001).fill({})}}}));
});

test('inline import editor reveal uses the entire cell and a bounded precise scroll',()=>{
 const view={bounding_box:{x:479,width:719}};
 const cell=(x,width=135)=>({bounding_box:{x,width},interaction:{state:'point_observed'}});
 assert.equal(importFieldRevealDelta(cell(1154),view),91);
 assert.equal(importFieldRevealDelta(cell(400),view),-79);
 assert.equal(importFieldRevealDelta(cell(479),view),0);
 assert.equal(importFieldRevealDelta(cell(1063),view),0);
 assert.equal(importFieldRevealDelta(cell(5000),view),1000);
 assert.equal(importFieldRevealDelta(cell(-5000),view),-1000);
 assert.throws(()=>importFieldRevealDelta(cell(479,720),view),/wider/);
 assert.throws(()=>importFieldRevealDelta({},view),/unobserved/);
});

test('complete narrow definitions do not require a data scroller on empty input',async()=>{
 const {importFieldHasCompleteLayout}=await import('../lib/text-import-procedure.mjs');
 const target={ref:'type-cell',interaction:{state:'point_observed'}};
 const state={wizard:{import_columns:{definition_coverage:{status:'complete_configured_columns',count:1},fields:[{status:'observed',cell_refs:{type:'type-cell'}}]}}};
 assert.equal(importFieldHasCompleteLayout(state,target),true);
 for(const change of [s=>s.wizard.import_columns.definition_coverage.status='partial',s=>s.wizard.import_columns.definition_coverage.count=2,
  s=>s.wizard.import_columns.fields[0].cell_refs.type='other']){
  const copy=structuredClone(state);change(copy);assert.equal(importFieldHasCompleteLayout(copy,target),false);
 }
 assert.equal(importFieldHasCompleteLayout(state,{...target,interaction:{state:'point_not_observed'}}),false);
});

for(const marker of ['NULL','null'])test('Null marker selects exact native option '+marker,async()=>{
 const f=fixture(1,{nullMarker:marker});const result=await configureTextImportFields(f.channel,f.parameters,f.owner);
 assert.equal(result.verified,true);assert.equal(f.gestures,3);
});
test('arbitrary Null marker retains the observed input path',async()=>{
 const f=fixture(1,{nullMarker:'\\N'});const result=await configureTextImportFields(f.channel,f.parameters,f.owner);
 assert.equal(result.verified,true);assert.equal(f.gestures,2);
});
for(const optionMode of ['duplicate','foreign_owner','foreign_root','wrong_case','bad_readback','replaced_input'])test('Null marker refuses '+optionMode+' without typing fallback',async()=>{
 const f=fixture(1,{nullMarker:'NULL',optionMode});await assert.rejects(configureTextImportFields(f.channel,f.parameters,f.owner));
 assert.ok(f.gestures<=3);
});
