import test from 'node:test';
import assert from 'node:assert/strict';
import {configureFilter,filterInputText,filterConditionMatches} from '../lib/filter-procedure.mjs';
test('field identity does not depend on JSON property insertion order',()=>{
 const wanted={field:{name:'Id',kind:'input_field'},type:'integer',operator:'>=',value:3};
 const actual={kind:'condition',field:{kind:'input_field',name:'Id'},type:'integer',operator_code:3,value:3};
 assert.equal(filterConditionMatches(actual,wanted),true);
 for(const field of [{kind:'input_field',name:'Other'},{kind:'row_number'}])
  assert.equal(filterConditionMatches({...actual,field},wanted),false);
});
test('typed editor text preserves real precision and distinguishes native datetime editors',()=>{
 assert.equal(filterInputText(1.23456,'real',','),'1,23456');
 assert.equal(filterInputText(-0.00001,'real',','),'-0,00001');
 assert.equal(filterInputText('2024-01-02T12:30:01.123','datetime',',',true),'02.01.2024, 12:30:01.123');
 assert.equal(filterInputText('2024-01-02T12:30:01','datetime',',',false),'02.01.2024 12:30:01');
 assert.throws(()=>filterInputText(1.2,'real',null),/separator/);
});
test('observed datetime formats preserve day/month identity and all time precision across locales',()=>{
 const us={day_pos:2,month_pos:1,year_pos:3,date_separator:'/',time_prefix:', ',time_separator:':',millisecond_separator:'.'};
 const ru={...us,day_pos:1,month_pos:2,date_separator:'.'};
 for(const time of ['00:30:01.123','12:30:01','23:59:58.987']){
  assert.equal(filterInputText('2024-02-29T'+time,'datetime','.',true,us),'02/29/2024, '+time);
  assert.equal(filterInputText('2024-02-29T'+time,'datetime',',',true,ru),'29.02.2024, '+time);
 }
 assert.equal(filterInputText('2024-02-29T23:59:58.123','datetime','.',true,{...ru,millisecond_separator:','}),'29.02.2024, 23:59:58,123');
 for(const patch of [{day_pos:2},{year_pos:'3'},{date_separator:'?'},{time_prefix:'at'},{time_separator:'.'},{millisecond_separator:':'}])
  assert.throws(()=>filterInputText('2024-02-29T23:59:58.123','datetime','.',true,{...ru,...patch}),/datetime format/);
});
test('condition readback rejects wrong operator, value, position field, case and rounded dates',()=>{
 const wanted={field:{kind:'input_field',name:'Text'},type:'string',operator:'contains',value:'Ab',case_sensitive:true};
 const actual={kind:'condition',field:wanted.field,type:'string',operator_code:12,value:'Ab',case_sensitive:true};
 assert.equal(filterConditionMatches(actual,wanted),true);
 for(const patch of [{operator_code:13},{value:'ab'},{case_sensitive:false},{field:{kind:'row_number'}}])assert.equal(filterConditionMatches({...actual,...patch},wanted),false);
 assert.equal(filterConditionMatches({kind:'condition',field:{kind:'input_field',name:'Flag'},type:'boolean',operator_code:22},{field:{kind:'input_field',name:'Flag'},type:'boolean',operator:'is_true'}),true);
 const date={field:{kind:'input_field',name:'When'},type:'datetime',operator:'=',value:'2024-01-02T12:30:01'};
 assert.equal(filterConditionMatches({kind:'condition',field:date.field,type:'datetime',operator_code:4,value:'2024-01-02T12:30:00.000'},date),false);
});
test('incompatible full request is refused before deleting any existing condition',async()=>{
 let edits=0;
 const baseline={verified:true,input_fields:[{name:'Id',type:'integer'}],rows:[{kind:'condition',record_id:'existing'}],dialogs:[],editor:null};
 const channel={observe:async()=>({wizard:{stage:'row_filter'},node_filter:baseline}),perform:async()=>{edits++;}};
 await assert.rejects(configureFilter(channel,{groups:[[{field:{kind:'input_field',name:'Missing'},type:'integer',operator:'=',value:2}]]}),/Unknown/);
 assert.equal(edits,0);
});

test('saved supported conditions are reused without configuration gestures',async()=>{
 const baseline={verified:true,inventory_complete:true,input_fields:[{name:'Id',type:'integer'}],rows:[{kind:'condition',field:{kind:'input_field',name:'Id'},type:'integer',operator_code:8,lower:2,upper:5}],dialogs:[],editor:null};
 let edits=0;const channel={observe:async()=>({wizard:{stage:'row_filter'},node_filter:baseline}),perform:async()=>{edits++;}};
 const result=await configureFilter(channel,{});assert.equal(result.preserved,true);assert.equal(result.effect_possible,false);assert.equal(edits,0);
 assert.deepEqual(result.groups,[[{field:{kind:'input_field',name:'Id'},operator:'between',type:'integer',lower:2,upper:5}]]);
 for(const patch of [{rows:[]},{rows:[{kind:'or'}]},{rows:[{...baseline.rows[0],operator_code:999}]},{editor:{record_id:'pending'}},{inventory_complete:false}]){
  const bad={observe:async()=>({wizard:{stage:'row_filter'},node_filter:{...baseline,...patch}}),perform:async()=>{edits++;}};
  await assert.rejects(configureFilter(bad,{}));
 }
 assert.equal(edits,0);
});

test('Null predicates ignore the inactive native case flag',()=>{
 const wanted={field:{kind:'input_field',name:'Text'},type:'string',operator:'not_null'};
 for(const case_sensitive of [false,true])assert.equal(filterConditionMatches({kind:'condition',field:wanted.field,type:'string',operator_code:7,case_sensitive},wanted),true);
});

function savedRowsChannel({changeInventory=false,noProgress=false}={}){
 const rows=Array.from({length:100},(_,index)=>({record_id:'r'+index,index,kind:'condition',cells:{delete:'delete-'+index}}));
 let top=0,scrolls=0,deletes=0;
 const snapshot=()=>({wizard:{stage:'row_filter',root_tid:'wizard'},prepared_node_context:{node_id:'filter'},node_filter:{verified:true,input_fields:[{name:'Id',type:'integer'}],rows:structuredClone(rows),dialogs:[],editor:null},ui:{elements:rows.slice(Math.floor(top/24),Math.floor(top/24)+10).flatMap(r=>[
  {ref:'field-'+r.index,tid:'field-'+r.index,filter_cell:{record_id:r.record_id,index:r.index,part:'Field'},scroll:{ref:'grid',top,max_top:2160},allowed_actions:['scroll']},
  {ref:r.cells.delete,tid:r.cells.delete,allowed_actions:['click'],bounding_box:{y:0,height:24},interaction:{state:'point_observed',point:{y:12}}}
 ])}});
 return {counts:()=>({scrolls,deletes}),observe:async({ready})=>{const s=snapshot();assert.equal(ready(s),true);return s;},perform:async({condition,resolve})=>{
  if(condition==='append one filter condition')throw Error('APPEND_STOP');
  const gesture=resolve(snapshot());
  if(gesture.verb==='scroll'){
   assert.match(gesture.ref,/^field-/);scrolls++;if(!noProgress)top=Math.min(2160,top+gesture.delta_y);
   if(changeInventory)rows[0].record_id='foreign';
  }else{assert.equal(gesture.ref,rows.at(-1).cells.delete);deletes++;rows.pop();top=Math.min(top,Math.max(0,(rows.length-10)*24));}
 }};
}
test('replacing a saved long filter reveals the last row and deletes only that row',async()=>{
 const channel=savedRowsChannel();
 await assert.rejects(configureFilter(channel,{groups:[[{field:{name:'Id',kind:'input_field'},type:'integer',operator:'=',value:1}]]}),/APPEND_STOP/);
 assert.equal(channel.counts().deletes,100);assert.ok(channel.counts().scrolls>1);
});
test('revealing a saved filter refuses inventory changes and a stalled scroll before deletion',async()=>{
 for(const [options,error] of [[{changeInventory:true},/inventory changed/],[{noProgress:true},/no progress/]]){
  const channel=savedRowsChannel(options);
  await assert.rejects(configureFilter(channel,{groups:[[{field:{kind:'input_field',name:'Id'},type:'integer',operator:'=',value:1}]]}),error);
  assert.equal(channel.counts().deletes,0);assert.equal(channel.counts().scrolls,1);
 }
});

function fieldPickerChannel({target=999,noProgress=false,changeSchema=false}={}){
 const fields=Array.from({length:1000},(_,i)=>({name:'Field'+i,type:'integer'}));
 let rows=[],editor=null,opened=false,top=0,scrolls=0,selected;
 const cell=(value,index)=>({ref:'option-'+index,filter_cell:{record_id:'new',part:'option',field:'Name',value},allowed_actions:['click','scroll'],scroll:{ref:'choices',top,max_top:23784},bounding_box:{x:0,y:100+(index-Math.floor(top/24))*24,width:200,height:24},interaction:{state:'point_observed',point:{x:100,y:112+(index-Math.floor(top/24))*24}}});
 const snapshot=()=>({wizard:{stage:'row_filter',root_tid:'wizard'},prepared_node_context:{node_id:'filter'},node_filter:{verified:true,input_fields:structuredClone(fields),rows:structuredClone(rows),dialogs:[],editor},ui:{elements:opened?Array.from({length:10},(_,i)=>Math.floor(top/24)+i).filter(i=>i<=1000).map(i=>cell(i===0?'':fields[i-1].name,i)):[
  {tid:'wizard;FilterDataWizard;FilterDataPanel;btnAdd',ref:'add',allowed_actions:['click']},
  {tid:'editor;trg_picker',ref:'picker',allowed_actions:['click'],filter_cell:{record_id:'new',part:'editor'}}
 ]}});
 return {parameters:{groups:[[{field:{name:'Field'+target,kind:'input_field'},type:'integer',operator:'=',value:1}]]},counts:()=>({scrolls,selected}),observe:async({ready})=>{const s=snapshot();if(selected!==undefined){assert.equal(ready(s),true,'field-selection commit accepts reordered object keys');throw Error('SELECTION_VERIFIED');}assert.equal(ready(s),true);return s;},perform:async({resolve})=>{
  const g=resolve(snapshot());
  if(g.ref==='add'){rows=[{kind:'condition',record_id:'new',index:0,field:{kind:'input_field',name:''},type:null}];editor={record_id:'new',field:'Name'};}
  else if(g.ref==='picker')opened=true;
  else if(g.verb==='scroll'){scrolls++;if(!noProgress)top=Math.max(0,Math.min(23784,top+g.delta_y));if(changeSchema)fields[0].type='string';}
  else {selected=Number(g.ref.slice(7))-1;assert.equal(selected,target);rows[0].field={kind:'input_field',name:fields[selected].name};rows[0].type='integer';editor={record_id:'new',field:'RelationType'};opened=false;}
 }};
}
test('field picker reveals distant and nearby off-screen fields without overshooting or relying on JSON order',async()=>{
 for(const target of [19,499,999]){const c=fieldPickerChannel({target});await assert.rejects(configureFilter(c,c.parameters),/SELECTION_VERIFIED/);assert.equal(c.counts().selected,target);assert.ok(c.counts().scrolls>0&&c.counts().scrolls<=130);}
});
test('field picker refuses stalled scrolling and input schema changes before selection',async()=>{
 for(const [options,error] of [[{noProgress:true},/no progress/],[{changeSchema:true},/schema changed/]]){const c=fieldPickerChannel(options);await assert.rejects(configureFilter(c,c.parameters),error);assert.equal(c.counts().selected,undefined);}
});

test('ISO native datetime fields preserve local whole seconds and refuse precision they cannot commit',()=>{
 const format={kind:'iso_local',precision:'second'};
 assert.equal(filterInputText('2024-01-02T12:30:01.123','datetime','.',false,{kind:'iso_local',precision:'millisecond'}),'2024-01-02T12:30:01.123');
 for(const value of ['2024-01-02T12:30:01','2024-02-01T23:59:58.000'])
  assert.equal(filterInputText(value,'datetime','.',false,format),value);
 assert.throws(()=>filterInputText('2024-01-02T12:30:01.123','datetime','.',false,format),/whole seconds/);
});
test('fractional range edits with unknown data kind fail before deleting existing conditions',async()=>{
 const baseline={verified:true,input_fields:[{name:'When',type:'datetime'}],rows:[{kind:'condition',record_id:'existing'}],dialogs:[],editor:null};
 let edits=0;
 const channel={observe:async()=>({wizard:{stage:'row_filter'},node_filter:baseline}),perform:async()=>{edits++;}};
 for(const [operator,operands] of [['between',{lower:'2024-01-02T12:30:01.123',upper:'2024-02-01T12:30:01'}]] )
  await assert.rejects(configureFilter(channel,{groups:[[{field:{kind:'input_field',name:'When'},operator,type:'datetime',...operands}]]}),/whole seconds/);
 assert.equal(edits,0);
});

test('unsupported continuous scalar milliseconds refuse before changing existing filter conditions',async()=>{
 for(const data_kind of ['Непрерывный',null,undefined]){
  let edits=0;const baseline={verified:true,input_fields:[{name:'When',type:'datetime',data_kind}],rows:[{kind:'condition',record_id:'existing'}],dialogs:[],editor:null};
  const channel={observe:async()=>({wizard:{stage:'row_filter'},node_filter:baseline}),perform:async()=>{edits++;throw Error('Unexpected mutation');}};
  await assert.rejects(configureFilter(channel,{groups:[[{field:{kind:'input_field',name:'When'},operator:'>',type:'datetime',value:'2024-01-02T12:30:01.123'}]]}),/observed discrete/);
  assert.equal(edits,0);
 }
});
