import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTextImportPatch,ImportInitialSettingsError} from '../lib/text-import-procedure.mjs';

function fixture({omit=[],preview=true,path='/own/data.csv',sourceName='Amount',qualifier='Двойная кавычка (")',twoColumns=false}={}) {
 const owner={status:'observed',node:{tid:'node'},path:[{tid:'scenario',label:'Scenario'}]};
 const source={source_path:'',connection:'Server',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true};
 const format={delimiter:'Точка с запятой',decimal_separator:'Точка (.)',null_marker:'?',text_qualifier:qualifier};
 const column={name:'Amount',label:'Сумма',type:'real',data_kind:'Непрерывный',used:true};
 const columns=[column,...(twoColumns?[{name:'Region',label:'Регион',type:'string',data_kind:'Дискретный',used:true}]:[])];
 const settings={source:{source_path:path,encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
  format:{delimiter:';',decimal_separator:'.',null_marker:'?',text_qualifier:'"'},columns:[{...column,source_name:sourceName}]};
 if(twoColumns)settings.columns.unshift({...columns[1]});
 for(const key of omit)delete (key==='data_kind'?settings.columns[0]:settings.format)[key];
 if(twoColumns&&omit.includes('data_kind'))delete settings.columns[1].data_kind;
 let stage='text_import_file';const actions=[];
 const observed=values=>Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{status:'observed',value,owner_ref:name,input_ref:name,display_ref:name}]));
 const state=()=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'root',owner_context:owner,
  import_source:{fields:observed(source)},settings:{fields:observed(preview?format:Object.fromEntries(Object.entries(format).filter(([k])=>k!=='text_qualifier')))},
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:columns.map((c,index)=>({...c,index,status:'observed',cell_refs:{}})),
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,returned:columns.length,total_columns:columns.length,next_offset:null}}},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},
   ...Object.keys(format).map(name=>({ref:name,tid:name,allowed_actions:['set_wizard_field'],wizard_field:{scope:'import_format',name,owner_ref:name,root_ref:'root'}}))]}});
 const channel={observe:async options=>{const s=structuredClone(state());assert.ok(options.ready(s),options.condition);return s;},
  act:async action=>{actions.push(action);
   if(action.verb==='wizard_step')stage=action.expected_stage;
   else if(action.verb==='fill')source[action.ref]=action.text;
   else if(action.verb==='press')assert.equal(action.key,'Tab');
   else if(action.verb==='set_wizard_field')format[action.ref]=action.text;
   else assert.fail(JSON.stringify(action));
  }};
 channel.perform=async options=>{const s=options.initialObservation??state();assert.ok(options.ready(s));return channel.act(options.resolve(s));};
 return {settings,actions,run:()=>configureTextImportPatch(channel,settings,owner,'/own/data.csv')};
}

for(const omit of [['text_qualifier'],['data_kind'],['delimiter','decimal_separator','null_marker','text_qualifier','data_kind']])
test('first existing configuration fills only missing preview settings: '+omit,async()=>{
 const f=fixture({omit}),original=structuredClone(f.settings),result=await f.run();
 assert.equal(result.verified,true);assert.equal(result.columns[0].data_kind,'Непрерывный');
 assert.equal(result.format.fields.text_qualifier.value,'"');
 assert.deepEqual(f.settings,original,'caller settings stay unchanged');
});
test('missing defaults without this operation preview retain the initial-settings refusal',async()=>{
 const f=fixture({omit:['text_qualifier'],preview:false});
 await assert.rejects(f.run(),ImportInitialSettingsError);
});
test('a different verified source is refused before any wizard gesture',async()=>{
 const f=fixture({omit:['text_qualifier'],path:'/own/other.csv'});
 await assert.rejects(f.run(),ImportInitialSettingsError);assert.deepEqual(f.actions,[]);
});
test('preview columns bind by source label, never ordinal position',async()=>{
 const f=fixture({omit:['data_kind'],sourceName:'Сумма',twoColumns:true});
 assert.deepEqual((await f.run()).columns.map(c=>[c.name,c.data_kind]),[['Amount','Непрерывный'],['Region','Дискретный']]);
 const missing=fixture({omit:['data_kind'],sourceName:'Other'});
 await assert.rejects(missing.run(),/missing or ambiguous|incomplete/i);
});
for(const [qualifier,expected] of [['Двойная кавычка (")','"'],["Одинарная кавычка (')","'"],['Обратная кавычка (`)','`'],['Нет','']])
test('preview qualifier display is normalized: '+qualifier,async()=>{
 const f=fixture({omit:['text_qualifier'],qualifier});
 assert.equal((await f.run()).format.fields.text_qualifier.value,expected);
});
test('explicit invalid data kind is refused rather than replaced by preview',async()=>{
 const f=fixture({omit:['text_qualifier']});f.settings.columns[0].data_kind='';
 await assert.rejects(f.run(),/Invalid column semantics/);assert.deepEqual(f.actions,[]);
});
test('explicit model values including empty strings are preserved',async()=>{
 const f=fixture();f.settings.format.text_qualifier='';f.settings.format.null_marker='';
 const result=await f.run();
 assert.equal(result.format.fields.text_qualifier.value,'');assert.equal(result.format.fields.null_marker.value,'');
 assert.equal(result.columns[0].data_kind,f.settings.columns[0].data_kind);
});
