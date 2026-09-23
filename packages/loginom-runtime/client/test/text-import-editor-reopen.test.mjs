import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {openImportColumnEditorBound,configureTextImportFields} from '../lib/text-import-procedure.mjs';

function fixture({closes=1,receiptShowsEditor=true,change}={}) {
 let reads=0,opens=0;const records=[];
 const field={index:3,status:'observed',name:'Prodano_za_god_sht',label:'Продано за год шт',type:'integer',data_kind:'Непрерывный',used:true,
  cell_refs:{type:'ui-cell-type',data_kind:'ui-cell-kind'}};
 const editor={status:'observed',index:3,property:'data_kind',name:field.name,label:field.label,canonical_value:'Непрерывный',
  picker_status:'observed',picker_ref:'ui-picker'};
 const state=open=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{tab_tid:'tab',prefix:'MF;TF-1'},
  dom_epoch:{document:'doc',revision:++reads},scan:{complete:true},
  wizard:{status:'observed',stage:'text_import_format',root_tid:'wizard',root_ref:'root',
   owner_context:{status:'observed',node:{tid:'Import'},path:[{tid:'Import',label:'Import'}]},
   import_columns:{page:{status:'complete_definition_page',offset:0,limit:8,total_columns:6},fields:[structuredClone(field)]},
   import_column_editor:open?structuredClone(editor):null},
  ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[{ref:'ui-cell-kind',tid:'grid;3_3',allowed_actions:['double_click'],kind:'control'},
   ...(open?[{ref:'ui-picker',tid:'grid;celleditor-6;cbx;trg_picker',allowed_actions:['click'],kind:'control'}]:[])]}});
 const channel=createNodeProcedure({operation:{id:'imp',action:{action_key:'node.apply',revision:'1'},deadline:10000,
  checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}},now:()=>1,wait:async()=>{},maxSteps:60,
  targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async e=>{records.push(e);return structuredClone(e);},
  wrapMutation:(code,reference)=>({reference}),execute:async code=>{
   if(typeof code==='string'){const s=state(opens>closes);change?.(s,opens);return {status:'SUCCEEDED',output:s};}
   opens++;
   return {operation_id:code.reference.id,action_key:'ui.act',status:'SUCCEEDED',phase:'completed',effect_possible:true,cleanup_complete:true,
    trace:[],output:state(receiptShowsEditor||opens>closes)};
  }});
 const read=(stage,condition,ready,options={})=>channel.observe({condition:stage+': '+condition,...options,ready:s=>s.wizard?.stage===stage&&ready(s)});
 return {records,get opens(){return opens;},
  run:async()=>openImportColumnEditorBound(channel,read,await read('text_import_format','complete configured columns',()=>true),3,'data_kind',field.name)};
}

test('an editor closed by Loginom right after a confirmed opening is reopened once on the same unchanged column',async()=>{
 const f=fixture();const editing=await f.run();
 assert.equal(editing.wizard.import_column_editor.index,3);assert.equal(f.opens,2);
 const gestures=f.records.filter(e=>e.phase==='node_step_prepared');
 assert.deepEqual(gestures.map(e=>[e.action.verb,e.action.ref]),[['double_click','ui-cell-kind'],['double_click','ui-cell-kind']]);
 const closed=f.records.filter(e=>e.phase==='node_observation_completed'&&e.readiness.condition.includes('closed unchanged'));
 assert.equal(closed.length,1);assert.equal(closed[0].readiness.required_samples,2);
});

test('an editor absent without a receipt proving it opened keeps the ordinary readiness timeout',async()=>{
 const f=fixture({receiptShowsEditor:false});
 await assert.rejects(f.run(),/readiness timeout: text_import_format: column editor: 3\/data_kind/);assert.equal(f.opens,1);
});

test('a column changed while its editor disappeared is never reopened',async()=>{
 for(const [key,value] of [['data_kind','Дискретный'],['type','string'],['name','foreign'],['used',false]]) {
  const f=fixture({change:(s,opens)=>{if(opens===1)s.wizard.import_columns.fields[0][key]=value;}});
  await assert.rejects(f.run(),/readiness timeout/);assert.equal(f.opens,1);
 }
});

test('an editor that keeps closing stops after two reopenings',async()=>{
 const f=fixture({closes:Infinity});
 await assert.rejects(f.run(),/keeps closing: 3\/data_kind/);assert.equal(f.opens,3);
});

function configureFixture({closes}) {
 const column={index:0,status:'observed',name:'F0',label:'F0',type:'string',data_kind:'Дискретный',used:true,
  cell_refs:Object.fromEntries(['name','label','type','data_kind','used'].map(p=>[p,p+':0']))};
 const owner={status:'observed',node:{tid:'node'},path:[{tid:'path',label:'Scenario'}]};
 const parameters={source:{source_path:'/user/sales.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
  format:{delimiter:';',text_qualifier:'"',null_marker:'NULL',decimal_separator:'.'},
  columns:[{name:'F0',label:'F0',type:'string',data_kind:'Непрерывный',used:true}]};
 const values=o=>Object.fromEntries(Object.entries(o).map(([k,value])=>[k,{status:'observed',truncated:false,value}]));
 let stage='text_import_file',editorOpen=false,pickerOpen=false,doubleClicks=0;
 const editor=()=>({status:'observed',index:0,property:'data_kind',name:'F0',label:'F0',canonical_value:column.data_kind,used:true,
  other_property:'type',other_value:'string',owner_ref:'editor-owner',input_ref:'editor-input',picker_status:'observed',picker_ref:'picker'});
 const state=(open=editorOpen)=>structuredClone({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'wizard-ref',owner_context:owner,
  import_source:{fields:values({...parameters.source,encoding:'UTF-8 (65001)',rows_to_skip:'0'})},settings:{fields:values(parameters.format)},
  import_column_editor:open?editor():null,
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:[column],
   page:{status:'complete_definition_page',schema_id:'narrow',offset:0,limit:8,returned:1,total_columns:1,next_offset:null}}},
  ui:{elements:[{tid:'wizard;ImportTextFileParamsWizard;ColumnDefsTuning;grdData;grd-1;tbl',ref:'scroll',allowed_actions:['scroll_horizontal'],bounding_box:{x:0,width:800}},
   {tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},
   ...Object.values(column.cell_refs).map(ref=>({ref,tid:'grid;'+ref,allowed_actions:['click','double_click'],bounding_box:{x:0,width:135},interaction:{state:'point_observed'}})),
   ...(open?[{ref:'picker',allowed_actions:['click']}]:[]),
   ...(open&&pickerOpen?[{ref:'option',tid:'editor;list;Непрерывный',allowed_actions:['select_wizard_option'],wizard_combo:{kind:'option',label:'Непрерывный',
    field:{scope:'import_column',name:'data_kind',owner_ref:'editor-owner',input_ref:'editor-input',root_ref:'wizard-ref'}}}]:[])]}});
 const channel={observe:async options=>{const s=state();assert.equal(options.ready(s),true,options.condition);return s;},
  act:async action=>{
   if(action.verb==='wizard_step'){stage=action.expected_stage;return {output:state()};}
   if(action.verb==='double_click'){assert.equal(action.ref,'data_kind:0');doubleClicks++;editorOpen=doubleClicks>closes;return {output:state(true)};}
   if(action.verb==='click'&&action.ref==='picker'){pickerOpen=true;return {output:state()};}
   if(action.verb==='select_wizard_option'){column.data_kind='Непрерывный';editorOpen=pickerOpen=false;return {output:state()};}
   assert.fail('Unexpected gesture: '+action.verb);
  },
  perform:async options=>{assert.equal(options.ready(options.initialObservation),true,options.condition);return channel.act(options.resolve(options.initialObservation));}};
 return {channel,parameters,owner,get doubleClicks(){return doubleClicks;}};
}
for(const closes of [0,1])test('configured data kind is applied '+(closes?'after one reopened editor':'with a single editor opening'),async()=>{
 const f=configureFixture({closes});
 const result=await configureTextImportFields(f.channel,f.parameters,f.owner);
 assert.equal(result.verified,true);assert.equal(result.columns[0].data_kind,'Непрерывный');assert.equal(f.doubleClicks,closes+1);
});
